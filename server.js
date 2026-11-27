// ونس server: Express (REST) + ws (realtime) + Postgres (Supabase).
const express = require('express');
const http = require('http');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
// DB config: either DATABASE_URL, or discrete DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME.
const local = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL || process.env.DB_HOST || '');
const pool = new Pool({
  ...(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432), user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME || 'postgres' }),
  ssl: local ? false : { rejectUnauthorized: false },
  max: 5,
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users(
      id BIGSERIAL PRIMARY KEY,
      wanas_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      pass_hash TEXT NOT NULL,
      photo TEXT,
      last_seen TIMESTAMPTZ DEFAULT now(),
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS contacts(
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      contact_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT now(),
      PRIMARY KEY(user_id, contact_id)
    );
    CREATE TABLE IF NOT EXISTS messages(
      id BIGSERIAL PRIMARY KEY,
      from_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      to_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL DEFAULT 'text',
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now(),
      read_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS messages_pair ON messages(from_id, to_id, id);
    CREATE INDEX IF NOT EXISTS messages_to ON messages(to_id, read_at);
  `);
}

const app = express();
app.use(express.json({ limit: '1mb' }));

const sign = (u) => jwt.sign({ uid: u.id }, SECRET, { expiresIn: '60d' });
function auth(req, res, next) {
  const h = req.headers.authorization || '';
  try { req.uid = Number(jwt.verify(h.replace("Bearer ", ""), SECRET).uid); next(); }
  catch { res.status(401).json({ error: 'unauthorized' }); }
}
const pub = (u) => ({ id: u.id, wanasId: u.wanas_id, name: u.name, photo: u.photo || null });
const idOk = (s) => /^[a-z0-9_.]{3,20}$/.test(s);

app.post('/api/signup', async (req, res) => {
  let { wanasId, name, password } = req.body || {};
  wanasId = String(wanasId || '').trim().toLowerCase();
  name = String(name || '').trim().slice(0, 40);
  if (!idOk(wanasId)) return res.status(400).json({ error: 'bad_id' });
  if (!name) return res.status(400).json({ error: 'bad_name' });
  if (String(password || '').length < 6) return res.status(400).json({ error: 'bad_password' });
  try {
    const hash = await bcrypt.hash(password, 10);
    const r = await pool.query('INSERT INTO users(wanas_id,name,pass_hash) VALUES($1,$2,$3) RETURNING *', [wanasId, name, hash]);
    res.json({ token: sign(r.rows[0]), me: pub(r.rows[0]) });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'id_taken' });
    console.error(e); res.status(500).json({ error: 'server' });
  }
});

app.post('/api/login', async (req, res) => {
  const wanasId = String((req.body || {}).wanasId || '').trim().toLowerCase();
  const r = await pool.query('SELECT * FROM users WHERE wanas_id=$1', [wanasId]);
  const u = r.rows[0];
  if (!u || !(await bcrypt.compare(String((req.body || {}).password || ''), u.pass_hash))) return res.status(401).json({ error: 'bad_login' });
  res.json({ token: sign(u), me: pub(u) });
});

app.get('/api/me', auth, async (req, res) => {
  const r = await pool.query('SELECT * FROM users WHERE id=$1', [req.uid]);
  if (!r.rows[0]) return res.status(401).json({ error: 'unauthorized' });
  res.json({ me: pub(r.rows[0]) });
});

app.put('/api/me', auth, async (req, res) => {
  const { name, photo } = req.body || {};
  if (photo && (typeof photo !== 'string' || photo.length > 400000 || !photo.startsWith('data:image/'))) return res.status(400).json({ error: 'bad_photo' });
  const r = await pool.query(
    'UPDATE users SET name=COALESCE($2,name), photo=CASE WHEN $3::text IS NULL AND $4 THEN NULL ELSE COALESCE($3,photo) END WHERE id=$1 RETURNING *',
    [req.uid, name ? String(name).trim().slice(0, 40) : null, photo || null, photo === '']
  );
  const me = pub(r.rows[0]);
  broadcastPresenceProfile(req.uid, me);
  res.json({ me });
});

app.get('/api/users/:wanasId', auth, async (req, res) => {
  const r = await pool.query('SELECT id,wanas_id,name,photo FROM users WHERE wanas_id=$1', [req.params.wanasId.toLowerCase()]);
  if (!r.rows[0]) return res.status(404).json({ error: 'not_found' });
  res.json({ user: pub(r.rows[0]) });
});

app.post('/api/contacts', auth, async (req, res) => {
  const wid = String((req.body || {}).wanasId || '').trim().toLowerCase();
  const r = await pool.query('SELECT * FROM users WHERE wanas_id=$1', [wid]);
  const u = r.rows[0];
  if (!u) return res.status(404).json({ error: 'not_found' });
  if (u.id === req.uid) return res.status(400).json({ error: 'self' });
  await pool.query('INSERT INTO contacts(user_id,contact_id) VALUES($1,$2),($2,$1) ON CONFLICT DO NOTHING', [req.uid, u.id]);
  pushTo(u.id, { t: 'contact', contact: pub((await pool.query('SELECT * FROM users WHERE id=$1', [req.uid])).rows[0]) });
  res.json({ contact: pub(u) });
});

app.get('/api/contacts', auth, async (req, res) => {
  const r = await pool.query(`
    SELECT u.id,u.wanas_id,u.name,u.photo,u.last_seen,
      (SELECT row_to_json(m) FROM (SELECT id,from_id,kind,body,created_at,read_at FROM messages
         WHERE (from_id=$1 AND to_id=u.id) OR (from_id=u.id AND to_id=$1) ORDER BY id DESC LIMIT 1) m) AS last,
      (SELECT count(*) FROM messages WHERE from_id=u.id AND to_id=$1 AND read_at IS NULL)::int AS unread
    FROM contacts c JOIN users u ON u.id=c.contact_id WHERE c.user_id=$1`, [req.uid]);
  res.json({ contacts: r.rows.map((u) => ({ ...pub(u), lastSeen: u.last_seen, online: online(u.id), last: u.last, unread: u.unread })) });
});

app.get('/api/messages/:cid', auth, async (req, res) => {
  const cid = Number(req.params.cid);
  const before = Number(req.query.before) || 9e15;
  const r = await pool.query(`SELECT id,from_id,to_id,kind,body,created_at,read_at FROM messages
    WHERE ((from_id=$1 AND to_id=$2) OR (from_id=$2 AND to_id=$1)) AND id<$3 ORDER BY id DESC LIMIT 50`, [req.uid, cid, before]);
  res.json({ messages: r.rows.reverse() });
});

app.use(express.static(__dirname, { index: 'index.html', extensions: ['html'], setHeaders: (res, p) => { if (/server\.js|package/.test(p)) res.statusCode = 404; } }));
app.get('/healthz', (_, res) => res.send('ok'));

// ---------- realtime ----------
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });
const conns = new Map(); // uid -> Set<ws>
const online = (uid) => (conns.get(Number(uid))?.size || 0) > 0;
function pushTo(uid, obj) { const s = conns.get(Number(uid)); if (s) for (const w of s) if (w.readyState === 1) w.send(JSON.stringify(obj)); }
async function contactIds(uid) { return (await pool.query('SELECT contact_id FROM contacts WHERE user_id=$1', [uid])).rows.map((r) => Number(r.contact_id)); }
async function announce(uid, isOnline) {
  const ts = new Date().toISOString();
  for (const c of await contactIds(uid)) pushTo(c, { t: 'presence', id: uid, online: isOnline, lastSeen: ts });
}
async function broadcastPresenceProfile(uid, me) { for (const c of await contactIds(uid)) pushTo(c, { t: 'profile', user: me }); }

server.on('upgrade', (req, socket, head) => {
  try {
    const tok = new URL(req.url, 'http://x').searchParams.get('token');
    const uid = Number(jwt.verify(tok, SECRET).uid);
    wss.handleUpgrade(req, socket, head, (ws) => { ws.uid = uid; wss.emit('connection', ws); });
  } catch { socket.destroy(); }
});

wss.on('connection', async (ws) => {
  const uid = ws.uid;
  const first = !online(uid);
  if (!conns.has(uid)) conns.set(uid, new Set());
  conns.get(uid).add(ws);
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  if (first) announce(uid, true).catch(() => {});
  ws.on('message', async (raw) => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    try {
      if (m.t === 'ping') return ws.send('{"t":"pong"}');
      if (m.t === 'send') {
        const to = Number(m.to);
        const body = String(m.body || '');
        const kind = m.kind === 'image' ? 'image' : 'text';
        if (!body || body.length > (kind === 'image' ? 600000 : 4000)) return;
        const ok = await pool.query('SELECT 1 FROM contacts WHERE user_id=$1 AND contact_id=$2', [uid, to]);
        if (!ok.rowCount) return ws.send(JSON.stringify({ t: 'error', cid: m.cid, error: 'not_contact' }));
        const r = await pool.query('INSERT INTO messages(from_id,to_id,kind,body) VALUES($1,$2,$3,$4) RETURNING id,from_id,to_id,kind,body,created_at,read_at', [uid, to, kind, body]);
        const msg = r.rows[0];
        pushTo(uid, { t: 'message', msg, cid: m.cid });
        pushTo(to, { t: 'message', msg });
      } else if (m.t === 'typing') {
        pushTo(Number(m.to), { t: 'typing', id: uid });
      } else if (m.t === 'read') {
        const other = Number(m.with);
        const r = await pool.query('UPDATE messages SET read_at=now() WHERE from_id=$1 AND to_id=$2 AND read_at IS NULL RETURNING id', [other, uid]);
        if (r.rowCount) pushTo(other, { t: 'read', by: uid, upTo: Math.max(...r.rows.map((x) => Number(x.id))) });
      }
    } catch (e) { console.error('ws error', e.message); }
  });
  ws.on('close', async () => {
    const s = conns.get(uid); s.delete(ws);
    if (!s.size) {
      conns.delete(uid);
      try { await pool.query('UPDATE users SET last_seen=now() WHERE id=$1', [uid]); await announce(uid, false); } catch {}
    }
  });
});
setInterval(() => { for (const w of wss.clients) { if (!w.isAlive) { w.terminate(); continue; } w.isAlive = false; w.ping(); } }, 25000);

initDb().then(() => server.listen(PORT, () => console.log('wanas on', PORT))).catch((e) => { console.error('DB init failed', e); process.exit(1); });
