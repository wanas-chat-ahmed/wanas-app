// ونس client. Plain JS, no build step. Talks to the server over REST + WebSocket.
(() => {
'use strict';
const $app = document.getElementById('app');
const LS = { get: (k) => localStorage.getItem(k), set: (k, v) => localStorage.setItem(k, v), del: (k) => localStorage.removeItem(k) };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ERR = {
  bad_id: 'الـ ID لازم يكون ٣ لـ ٢٠ حرف إنجليزي صغير أو أرقام أو _ أو .',
  bad_name: 'اكتب اسمك', bad_password: 'الباسورد لازم ٦ حروف على الأقل',
  id_taken: 'الـ ID ده واخده حد، جرّب غيره', bad_login: 'الـ ID أو الباسورد غلط',
  not_found: 'مفيش حد بالـ ID ده', self: 'ده الـ ID بتاعك انت 😄', server: 'في مشكلة في السيرفر، جرّب تاني', net: 'مفيش اتصال، جرّب تاني',
};

const SB_URL = 'https://ykrlreixhvnrkvhwgjtd.supabase.co';
const SB_KEY = 'sb_publishable_QeMbFx5H3mRw9_kWdSBarw_a5owjM4y'; // publishable key: safe in the browser, access is enforced by RLS
const sb = window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
const emailOf = (wid) => `${String(wid).trim().toLowerCase()}@wanas-users.example.com`;

const S = { me: null, contacts: [], cur: null, msgs: {}, ch: null, wsOk: false, retry: 0 };
const ONLINE_MS = 45000;

async function signupCall(body) {
  let r;
  try { r = await fetch(SB_URL + '/functions/v1/signup', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SB_KEY }, body: JSON.stringify(body) }); }
  catch { throw new Error('net'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'server');
}
const fail = (error) => { if (error) { const m = (error.message || '').trim(); throw new Error(/not_found|self|unauthorized/.test(m) ? m.match(/not_found|self|unauthorized/)[0] : /fetch|network/i.test(m) ? 'net' : 'server'); } };

async function logout() {
  teardownRealtime(); await sb.auth.signOut();
  S.me = null; S.cur = null; S.contacts = []; S.msgs = {}; render();
}

// ---------- helpers ----------
const initial = (n) => (String(n || '?').trim()[0] || '?').toUpperCase();
function avatar(u, cls = '', showDot = false) {
  const inner = u.photo ? `<img src="${esc(u.photo)}" alt="">` : esc(initial(u.name));
  return `<div class="av ${cls}">${inner}${showDot && isOnline(u) ? '<span class="dot"></span>' : ''}</div>`;
}
const fmtTime = (d) => new Date(d).toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' });
function fmtDay(d) {
  const x = new Date(d), n = new Date();
  const same = (a, b) => a.toDateString() === b.toDateString();
  if (same(x, n)) return 'النهارده';
  const y = new Date(n); y.setDate(n.getDate() - 1);
  if (same(x, y)) return 'امبارح';
  return x.toLocaleDateString('ar-EG', { day: 'numeric', month: 'long' });
}
function lastSeenText(c) {
  if (isOnline(c)) return 'متصل دلوقتي';
  if (!c.lastSeen) return '';
  return 'آخر ظهور ' + fmtDay(c.lastSeen) + ' ' + fmtTime(c.lastSeen);
}
const byId = (id) => S.contacts.find((c) => c.id === id);
const isOnline = (c) => !!c.lastSeen && Date.now() - new Date(c.lastSeen).getTime() < ONLINE_MS;
function previewOf(m) { return !m ? 'ابدأ المحادثة' : m.kind === 'image' ? '📷 صورة' : m.kind === 'voice' ? '🎤 رسالة صوتية' : m.body; }

// ---------- realtime (Supabase Realtime, filtered by RLS per user) ----------
function setupRealtime() {
  teardownRealtime();
  const ch = sb.channel('wanas-' + S.me.id)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (p) => onMessage(p.new))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, (p) => onMessageUpdate(p.new))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (p) => onProfile(p.new))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'contacts' }, () => refreshContacts())
    .subscribe((status) => {
      const ok = status === 'SUBSCRIBED';
      if (ok && !S.wsOk) refreshAll();
      S.wsOk = ok; updateConn();
    });
  S.ch = ch;
  beat(); S.beatT = setInterval(beat, 20000); S.tickT = setInterval(() => { if (S.cur) renderChatHeader(); else renderListIf(); }, 15000);
}
function teardownRealtime() {
  clearInterval(S.beatT); clearInterval(S.tickT);
  if (S.ch) { sb.removeChannel(S.ch); S.ch = null; } S.wsOk = false;
}
async function beat() { if (document.visibilityState === 'visible' && S.me) await sb.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', S.me.id); }

function onMessage(msg) {
  const mine = msg.from_id === S.me.id, other = mine ? msg.to_id : msg.from_id;
  const arr = (S.msgs[other] = S.msgs[other] || []);
  if (!arr.some((x) => x.id === msg.id)) {
    const pi = mine ? arr.findIndex((x) => x.pending && x.kind === msg.kind && x.body === msg.body) : -1;
    if (pi >= 0) arr[pi] = msg; else arr.push(msg);
  }
  const c = byId(other);
  if (!c) { refreshContacts(); return; }
  c.last = msg;
  if (!mine) {
    if (S.cur === other && document.visibilityState === 'visible') markRead(other);
    else { c.unread = (c.unread || 0) + 1; notify(c, msg); }
  }
  S.contacts.sort(sortC);
  S.cur === other ? renderChatBody(true) : renderListIf();
}
function onMessageUpdate(msg) {
  const other = msg.from_id === S.me.id ? msg.to_id : msg.from_id;
  const x = (S.msgs[other] || []).find((m) => m.id === msg.id); if (x) x.read_at = msg.read_at;
  const c = byId(other); if (c && c.last && c.last.id === msg.id) c.last.read_at = msg.read_at;
  if (S.cur === other) renderChatBody(false);
}
function onProfile(p) {
  const c = byId(p.id); if (!c) return;
  Object.assign(c, { name: p.name, photo: p.photo, lastSeen: p.last_seen });
  S.cur === c.id ? renderChatHeader() : renderListIf();
}
const sortC = (a, b) => new Date(b.last?.created_at || 0) - new Date(a.last?.created_at || 0);

function notify(c, msg) {
  if ('Notification' in window && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
    try { new Notification(c.name, { body: previewOf(msg), icon: 'icon.svg' }); } catch {}
  }
}

// ---------- data ----------
const meOf = (p) => ({ id: p.id, wanasId: p.wanas_id, name: p.name, photo: p.photo || null, lastSeen: p.last_seen });
async function loadMe() {
  const { data: u } = await sb.auth.getUser();
  if (!u?.user) return null;
  const { data, error } = await sb.from('profiles').select('*').eq('id', u.user.id).single();
  fail(error); return meOf(data);
}
async function refreshContacts() {
  try {
    const { data: conv, error } = await sb.rpc('my_conversations'); fail(error);
    const ids = conv.map((r) => r.contact_id);
    const { data: profs, error: e2 } = ids.length ? await sb.from('profiles').select('*').in('id', ids) : { data: [] }; fail(e2);
    S.contacts = conv.map((r) => {
      const p = profs.find((x) => x.id === r.contact_id); if (!p) return null;
      return { ...meOf(p), unread: r.unread, last: r.last_id ? { id: r.last_id, from_id: r.last_from, kind: r.last_kind, body: r.last_body, created_at: r.last_at, read_at: r.last_read } : null };
    }).filter(Boolean).sort(sortC);
    renderListIf(); if (S.cur) renderChatHeader();
  } catch {}
}
async function refreshAll() { await refreshContacts(); if (S.cur) { await loadMsgs(S.cur); renderChatBody(true); markRead(S.cur); } }
async function loadMsgs(id) {
  const me = S.me.id;
  const { data, error } = await sb.from('messages').select('*')
    .or(`and(from_id.eq.${me},to_id.eq.${id}),and(from_id.eq.${id},to_id.eq.${me})`).order('id', { ascending: false }).limit(50);
  if (!error) S.msgs[id] = data.reverse();
}
async function markRead(other) {
  const now = new Date().toISOString();
  (S.msgs[other] || []).forEach((m) => { if (m.from_id === other && !m.read_at) m.read_at = now; });
  const c = byId(other); if (c) c.unread = 0;
  await sb.from('messages').update({ read_at: now }).eq('from_id', other).eq('to_id', S.me.id).is('read_at', null);
}

// ---------- views ----------
function render() {
  if (!S.me) return renderAuth();
  S.cur ? renderChat() : renderList();
}

function renderAuth(mode = 'login') {
  $app.innerHTML = `
  <div class="screen auth"><div class="card">
    <img class="logo" src="icon.svg" alt="">
    <h1>ونس</h1><p class="sub">${mode === 'login' ? 'سجّل دخولك وكمّل كلامك' : 'اعمل حساب جديد في ثواني'}</p>
    <form id="f" autocomplete="off">
      ${mode === 'signup' ? '<label class="field"><span>اسمك</span><input id="name" maxlength="40" required></label>' : ''}
      <label class="field"><span>ونس ID (إنجليزي)</span><input id="wid" dir="ltr" autocapitalize="none" autocorrect="off" spellcheck="false" maxlength="20" required placeholder="ahmed.m"></label>
      <label class="field"><span>الباسورد</span><input id="pw" type="password" dir="ltr" minlength="6" required></label>
      <div class="err" id="err"></div>
      <button class="btn" id="go">${mode === 'login' ? 'دخول' : 'إنشاء حساب'}</button>
    </form>
    <button class="link" id="sw">${mode === 'login' ? 'معاكش حساب؟ اعمل واحد' : 'عندي حساب، دخول'}</button>
  </div></div>`;
  document.getElementById('sw').onclick = () => renderAuth(mode === 'login' ? 'signup' : 'login');
  document.getElementById('f').onsubmit = async (e) => {
    e.preventDefault();
    const go = document.getElementById('go'), err = document.getElementById('err');
    go.disabled = true; err.textContent = 'لحظة… (أول مرة بعد فترة ممكن ياخد حوالي دقيقة لحد ما السيرفر يصحى)';
    try {
      const wid = document.getElementById('wid').value.trim().toLowerCase(), pw = document.getElementById('pw').value;
      if (mode === 'signup') await signupCall({ wanasId: wid, password: pw, name: document.getElementById('name').value });
      const { error } = await sb.auth.signInWithPassword({ email: emailOf(wid), password: pw });
      if (error) throw new Error(/fetch|network/i.test(error.message) ? 'net' : 'bad_login');
      boot();
    } catch (x) { err.textContent = ERR[x.message] || ERR.server; go.disabled = false; }
  };
}

function renderListIf() { if (!S.cur && S.me) renderList(); }
function renderList() {
  const rows = S.contacts.map((c) => `
    <div class="row" data-id="${c.id}">
      ${avatar(c, '', true)}
      <div class="mid"><div class="nm">${esc(c.name)}</div><div class="ls">${esc(previewOf(c.last))}</div></div>
      <div class="tm">${c.last ? fmtTime(c.last.created_at) : ''}${c.unread ? `<br><span class="badge">${c.unread}</span>` : ''}</div>
    </div>`).join('');
  $app.innerHTML = `
  <div class="screen">
    <div class="top"><h2>ونس<small id="conn"></small></h2>
      <button class="ib" id="me" title="حسابي">${avatar(S.me, 'sm')}</button></div>
    <div class="wrap">
      <div class="list">${rows || '<div class="empty">لسه معندكش محادثات.<br>دوس على <b>＋</b> وضيف حد بالـ ونس ID بتاعه.</div>'}</div>
      <button class="fab" id="add" title="إضافة جهة اتصال">＋</button>
    </div>
  </div>`;
  updateConn();
  document.querySelectorAll('.row').forEach((r) => (r.onclick = () => openChat(r.dataset.id)));
  document.getElementById('add').onclick = addSheet;
  document.getElementById('me').onclick = profileSheet;
}
function updateConn() { const el = document.getElementById('conn'); if (el) el.textContent = S.wsOk ? '' : 'بيتصل…'; const b = document.getElementById('connbar'); if (b) b.classList.toggle('hidden', S.wsOk); }

function sheet(html) {
  const s = document.createElement('div'); s.className = 'sheet'; s.innerHTML = `<div class="in">${html}</div>`;
  s.onclick = (e) => { if (e.target === s) s.remove(); };
  document.body.appendChild(s); return s;
}

function addSheet() {
  const s = sheet(`<h3>إضافة جهة اتصال</h3>
    <label class="field"><span>ونس ID بتاع الشخص</span><input id="aid" dir="ltr" autocapitalize="none" spellcheck="false" placeholder="friend.id"></label>
    <div id="res"></div><div class="err" id="aerr"></div>
    <button class="btn" id="find">بحث</button>
    <p style="color:var(--mu);font-size:13px">الـ ID بتاعك: <span class="idbox">${esc(S.me.wanasId)}</span></p>`);
  const res = s.querySelector('#res'), err = s.querySelector('#aerr');
  s.querySelector('#find').onclick = async () => {
    err.textContent = ''; res.innerHTML = '';
    try {
      const { data, error } = await sb.rpc('find_user', { p_wanas_id: s.querySelector('#aid').value }); fail(error);
      if (!data.length) throw new Error('not_found');
      const u = { id: data[0].id, wanasId: data[0].wanas_id, name: data[0].name, photo: data[0].photo };
      if (u.id === S.me.id) throw new Error('self');
      res.innerHTML = `<div class="found">${avatar(u)}<div style="flex:1"><b>${esc(u.name)}</b><div style="color:var(--mu);direction:ltr;text-align:right">@${esc(u.wanasId)}</div></div></div><button class="btn" id="ok">إضافة وبدء محادثة</button>`;
      s.querySelector('#ok').onclick = async () => {
        try { const { error } = await sb.rpc('add_contact', { p_wanas_id: u.wanasId }); fail(error); await refreshContacts(); s.remove(); openChat(u.id); } catch (x) { err.textContent = ERR[x.message] || ERR.server; }
      };
    } catch (x) { err.textContent = ERR[x.message] || ERR.server; }
  };
}

function profileSheet() {
  const s = sheet(`<h3>حسابي</h3><div class="prof">
    <div id="pav">${avatar(S.me)}</div>
    <button class="btn sec" id="ph" style="width:auto;padding:8px 18px">تغيير الصورة</button>
    <input type="file" id="file" accept="image/*" class="hidden">
    <span class="idbox">${esc(S.me.wanasId)}</span>
    <small style="color:var(--mu)">ده الـ ID اللي تديه لصحابك عشان يضيفوك</small></div>
    <label class="field"><span>الاسم</span><input id="pn" maxlength="40" value="${esc(S.me.name)}"></label>
    <div class="err" id="perr"></div>
    <button class="btn" id="save">حفظ</button>
    <button class="btn sec" id="notif">تفعيل الإشعارات</button>
    <button class="btn sec" id="out" style="color:#c0262d">تسجيل خروج</button>`);
  const file = s.querySelector('#file'); let photo = null;
  s.querySelector('#ph').onclick = () => file.click();
  file.onchange = async () => { if (file.files[0]) { photo = await resizeImage(file.files[0], 256, 0.85); s.querySelector('#pav').innerHTML = avatar({ ...S.me, photo }); } };
  s.querySelector('#save').onclick = async () => {
    try { const name = s.querySelector('#pn').value.trim(); if (!name) throw new Error('bad_name');
      const { error } = await sb.from('profiles').update({ name: name.slice(0, 40), ...(photo ? { photo } : {}) }).eq('id', S.me.id); fail(error);
      S.me = await loadMe(); s.remove(); render(); }
    catch (x) { s.querySelector('#perr').textContent = ERR[x.message] || 'مقدرتش أحفظ'; }
  };
  s.querySelector('#notif').onclick = async () => {
    if (!('Notification' in window)) return (s.querySelector('#perr').textContent = 'المتصفح ده مبيدعمش الإشعارات');
    const p = await Notification.requestPermission();
    s.querySelector('#perr').textContent = p === 'granted' ? 'تمام، هتوصلك إشعارات لما التطبيق يكون مفتوح في الخلفية' : 'الإشعارات مرفوضة من المتصفح';
  };
  s.querySelector('#out').onclick = () => { s.remove(); logout(); };
}

function resizeImage(file, max, q) {
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', q));
    };
    img.onerror = rej; img.src = url;
  });
}

// ---------- chat ----------
async function openChat(id) {
  S.cur = id;
  const c = byId(id); if (c) c.unread = 0;
  renderChat();
  await loadMsgs(S.cur); renderChatBody(true);
  markRead(S.cur); renderChatHeader();
}
function renderChat() {
  const c = byId(S.cur);
  $app.innerHTML = `
  <div class="screen">
    <div class="top"><button class="ib" id="back">→</button><div id="hd" style="display:flex;align-items:center;gap:10px;flex:1"></div></div>
    <div class="conn ${S.wsOk ? 'hidden' : ''}" id="connbar">بيتصل بالسيرفر…</div>
    <div class="msgs" id="msgs"></div>
    <div class="bar">
      <button class="attach" id="att" title="صورة">📷</button><input type="file" id="img" accept="image/*" class="hidden">
      <textarea id="txt" rows="1" placeholder="اكتب رسالة…"></textarea>
      <button class="attach" id="mic" title="رسالة صوتية">🎤</button>
      <button class="send" id="snd">➤</button>
    </div>
  </div>`;
  document.getElementById('back').onclick = () => { S.cur = null; renderList(); refreshContacts(); };
  const t = document.getElementById('txt');
  t.oninput = () => { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 120) + 'px' };
  t.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey && !/Mobi|Android/i.test(navigator.userAgent)) { e.preventDefault(); send(); } };
  document.getElementById('snd').onclick = send;
  document.getElementById('mic').onclick = startRecording;
  document.getElementById('att').onclick = () => document.getElementById('img').click();
  document.getElementById('img').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { const d = await resizeImage(f, 1024, 0.7); if (d.length > 450000) return alert('الصورة كبيرة، جرّب صورة أصغر'); transmit('image', d); } catch { alert('مقدرتش أقرا الصورة'); }
    e.target.value = '';
  };
  renderChatHeader(); renderChatBody(true);
}
function renderChatHeader() {
  const hd = document.getElementById('hd'); const c = byId(S.cur); if (!hd || !c) return;
  hd.innerHTML = `${avatar(c, 'sm', true)}<div class="top" style="padding:0;background:none"><h2>${esc(c.name)}<small>${esc(lastSeenText(c))}</small></h2></div>`;
}
function renderChatBody(scroll) {
  const box = document.getElementById('msgs'); if (!box) return;
  const near = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
  let html = '', lastDay = '';
  for (const m of S.msgs[S.cur] || []) {
    const day = fmtDay(m.created_at || Date.now()); if (day !== lastDay) { html += `<div class="day">${day}</div>`; lastDay = day; }
    const mine = m.from_id === S.me.id;
    const tick = mine ? (m.pending ? ' 🕓' : m.read_at ? ' ✓✓' : ' ✓') : '';
    html += `<div class="b ${mine ? 'me' : 'them'}">${m.kind === 'image' ? `<img src="${esc(m.body)}" alt="صورة">` : m.kind === 'voice' ? voiceHtml(m) : esc(m.body)}<div class="mt">${m.created_at ? fmtTime(m.created_at) : ''}${tick}</div></div>`;
  }
  box.innerHTML = html;
  box.querySelectorAll('.vn').forEach((el) => { el.querySelector('.vplay').onclick = () => playVoice(el.dataset.i); syncVoice(el); });
  box.querySelectorAll('img').forEach((i) => (i.onclick = () => { const v = document.getElementById('viewer'); v.querySelector('img').src = i.src; v.classList.remove('hidden'); v.onclick = () => v.classList.add('hidden'); }));
  if (scroll || near) box.scrollTop = box.scrollHeight;
}

// ---------- voice notes ----------
const VOICE_MAX_MS = 60000, VOICE_MAX_CHARS = 400000;
const fmtDur = (ms) => { const t = Math.max(0, Math.round(ms / 1000)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
const REC = { mr: null, stream: null, chunks: [], t0: 0, timer: null, cancelled: false };

function voiceHtml(m) {
  const i = m.id ?? m.cid ?? 'p' + (m.created_at || '');
  return `<div class="vn" data-i="${esc(i)}"><button class="vplay" type="button">▶</button><div class="vbar"><i></i></div><span class="vdur">${fmtDur(m.dur_ms || 0)}</span></div>`;
}
const voiceMsg = (i) => (S.msgs[S.cur] || []).find((m) => String(m.id ?? m.cid) === String(i));
const VP = { id: null, el: null };
function syncVoice(el) {
  const on = VP.id === el.dataset.i && VP.el && !VP.el.paused;
  el.querySelector('.vplay').textContent = on ? '⏸' : '▶';
  const m = voiceMsg(el.dataset.i);
  const pct = VP.id === el.dataset.i && VP.el && m?.dur_ms ? Math.min(100, (VP.el.currentTime * 1000 / m.dur_ms) * 100) : 0;
  el.querySelector('.vbar i').style.width = pct + '%';
  if (on && m) el.querySelector('.vdur').textContent = fmtDur(VP.el.currentTime * 1000);
  else if (m) el.querySelector('.vdur').textContent = fmtDur(m.dur_ms || 0);
}
function syncAllVoice() { document.querySelectorAll('.vn').forEach(syncVoice); }
function playVoice(i) {
  const m = voiceMsg(i); if (!m || m.pending) return;
  if (VP.id === String(i) && VP.el) { VP.el.paused ? VP.el.play() : VP.el.pause(); syncAllVoice(); return; }
  if (VP.el) VP.el.pause();
  const a = new Audio(m.body); VP.id = String(i); VP.el = a;
  a.ontimeupdate = syncAllVoice; a.onpause = syncAllVoice; a.onplay = syncAllVoice;
  a.onended = () => { VP.id = null; VP.el = null; syncAllVoice(); };
  a.onerror = () => { VP.id = null; VP.el = null; syncAllVoice(); alert('الجهاز ده مش قادر يشغّل الرسالة الصوتية دي'); };
  a.play().catch(() => {});
}

async function startRecording() {
  if (REC.mr) return;
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return alert('المتصفح ده مبيدعمش تسجيل الصوت');
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch { return alert('لازم تسمح للمتصفح يستخدم الميكروفون عشان تسجّل'); }
  const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'].find((t) => MediaRecorder.isTypeSupported(t));
  const mr = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 24000 });
  Object.assign(REC, { mr, stream, chunks: [], t0: Date.now(), cancelled: false });
  mr.ondataavailable = (e) => e.data.size && REC.chunks.push(e.data);
  mr.onstop = finishRecording;
  mr.start(250);
  const bar = document.querySelector('.bar'); if (!bar) return;
  REC.saved = bar.innerHTML;
  bar.innerHTML = `<button class="attach" id="rcancel" title="إلغاء" style="color:#c0262d">✕</button>
    <div class="rec"><span class="rdot"></span><b id="rtime">0:00</b><small>بيسجّل… (أقصى مدة ${fmtDur(VOICE_MAX_MS)})</small></div>
    <button class="send" id="rsend" title="إرسال">➤</button>`;
  document.getElementById('rcancel').onclick = () => stopRecording(true);
  document.getElementById('rsend').onclick = () => stopRecording(false);
  REC.timer = setInterval(() => {
    const el = Date.now() - REC.t0, t = document.getElementById('rtime'); if (t) t.textContent = fmtDur(el);
    if (el >= VOICE_MAX_MS) stopRecording(false);
  }, 200);
}
function stopRecording(cancel) {
  if (!REC.mr) return;
  REC.cancelled = cancel; REC.dur = Math.min(Date.now() - REC.t0, VOICE_MAX_MS);
  clearInterval(REC.timer);
  try { REC.mr.stop(); } catch { finishRecording(); }
}
async function finishRecording() {
  const { stream, chunks, cancelled, dur, mr } = REC;
  stream.getTracks().forEach((t) => t.stop());
  const to = S.cur; REC.mr = null;
  if (S.cur === to && document.getElementById('msgs')) renderChat();
  if (cancelled || !chunks.length) return;
  if (dur < 700) return alert('التسجيل قصير أوي، اضغط وكمّل شوية');
  const blob = new Blob(chunks, { type: (mr.mimeType || chunks[0].type || 'audio/webm') });
  const data = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
  if (!data.startsWith('data:audio/')) return alert('مقدرتش أجهّز التسجيل');
  if (data.length > VOICE_MAX_CHARS) return alert('الرسالة الصوتية كبيرة أوي. أقصى مدة دقيقة واحدة، سجّل أقصر.');
  if (S.cur !== to) return;
  transmit('voice', data, Math.round(dur));
}

function send() {
  const t = document.getElementById('txt'); const v = t.value.trim(); if (!v) return;
  t.value = ''; t.style.height = 'auto'; transmit('text', v);
}
async function transmit(kind, body, dur) {
  const to = S.cur, arr = (S.msgs[to] = S.msgs[to] || []);
  const tmp = { pending: true, from_id: S.me.id, to_id: to, kind, body, dur_ms: dur ?? null, created_at: new Date().toISOString() };
  arr.push(tmp); renderChatBody(true);
  const { data, error } = await sb.from('messages').insert({ to_id: to, kind, body, ...(dur != null ? { dur_ms: dur } : {}) }).select().single();
  if (error) {
    arr.splice(arr.indexOf(tmp), 1); renderChatBody(false);
    alert(kind === 'voice' ? 'الرسالة الصوتية ماتبعتتش، تأكد من النت وجرّب تاني' : 'الرسالة ماتبعتتش، تأكد من النت وجرّب تاني'); if (kind === 'text') document.getElementById('txt').value = body; return;
  }
  const i = arr.indexOf(tmp), dup = arr.some((x) => x.id === data.id);
  if (i >= 0) { if (dup) arr.splice(i, 1); else arr[i] = data; }
  const c = byId(to); if (c) { c.last = data; S.contacts.sort(sortC); }
  renderChatBody(true);
}

document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.me) { beat(); if (S.cur) { loadMsgs(S.cur).then(() => { renderChatBody(false); markRead(S.cur); }); } } });

async function boot() {
  try { S.me = await loadMe(); } catch (e) { if (e.message === 'net') { $app.innerHTML = '<div class="empty">مفيش اتصال… <button class="link" onclick="location.reload()">جرّب تاني</button></div>'; return; } S.me = null; }
  if (!S.me) return renderAuth();
  setupRealtime(); await refreshContacts(); render();
}
boot();
})();
