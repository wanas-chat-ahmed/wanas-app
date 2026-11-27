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

const S = { token: LS.get('wanas_token'), me: null, contacts: [], cur: null, msgs: {}, ws: null, wsOk: false, typing: {}, retry: 0 };

async function api(path, opts = {}) {
  let r;
  try {
    r = await fetch('/api' + path, { method: opts.method || 'GET', headers: { 'Content-Type': 'application/json', ...(S.token ? { Authorization: 'Bearer ' + S.token } : {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  } catch { throw new Error('net'); }
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && S.token && !opts.noLogout) { logout(); throw new Error('bad_login'); }
  if (!r.ok) throw new Error(j.error || 'server');
  return j;
}

function logout() { LS.del('wanas_token'); S.token = null; S.me = null; if (S.ws) { S.ws.onclose = null; S.ws.close(); } S.ws = null; S.cur = null; S.contacts = []; S.msgs = {}; render(); }

// ---------- helpers ----------
const initial = (n) => (String(n || '?').trim()[0] || '?').toUpperCase();
function avatar(u, cls = '', showDot = false) {
  const inner = u.photo ? `<img src="${esc(u.photo)}" alt="">` : esc(initial(u.name));
  return `<div class="av ${cls}">${inner}${showDot && u.online ? '<span class="dot"></span>' : ''}</div>`;
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
  if (c.online) return 'متصل دلوقتي';
  if (!c.lastSeen) return '';
  return 'آخر ظهور ' + fmtDay(c.lastSeen) + ' ' + fmtTime(c.lastSeen);
}
const byId = (id) => S.contacts.find((c) => Number(c.id) === Number(id));
function previewOf(m) { return !m ? 'ابدأ المحادثة' : m.kind === 'image' ? '📷 صورة' : m.body; }

// ---------- websocket ----------
function connect() {
  if (!S.token) return;
  if (S.ws) { S.ws.onclose = null; try { S.ws.close(); } catch {} }
  const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws?token=' + encodeURIComponent(S.token));
  S.ws = ws;
  ws.onopen = () => { S.wsOk = true; S.retry = 0; updateConn(); refreshAll(); S.ping = setInterval(() => ws.readyState === 1 && ws.send('{"t":"ping"}'), 20000); };
  ws.onclose = () => { S.wsOk = false; clearInterval(S.ping); updateConn(); S.retry++; setTimeout(connect, Math.min(1000 * 2 ** Math.min(S.retry, 4), 15000)); };
  ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } onEvent(m); };
}
function sendWs(o) { if (S.ws && S.ws.readyState === 1) { S.ws.send(JSON.stringify(o)); return true; } return false; }

function onEvent(m) {
  if (m.t === 'message') {
    const msg = m.msg, other = Number(msg.from_id) === Number(S.me.id) ? msg.to_id : msg.from_id;
    const arr = (S.msgs[other] = S.msgs[other] || []);
    if (!arr.some((x) => Number(x.id) === Number(msg.id))) {
      const pi = m.cid ? arr.findIndex((x) => x.cid === m.cid) : -1;
      if (pi >= 0) arr[pi] = msg; else arr.push(msg);
    }
    let c = byId(other);
    if (!c) { refreshContacts(); return; }
    c.last = msg;
    const mine = Number(msg.from_id) === Number(S.me.id);
    if (!mine) {
      if (S.cur === Number(other) && document.visibilityState === 'visible') { sendWs({ t: 'read', with: other }); msg.read_at = new Date().toISOString(); }
      else { c.unread = (c.unread || 0) + 1; notify(c, msg); }
    }
    S.contacts.sort(sortC);
    S.cur === Number(other) ? renderChatBody(true) : renderListIf();
  } else if (m.t === 'presence') {
    const c = byId(m.id); if (c) { c.online = m.online; c.lastSeen = m.lastSeen; S.cur === c.id ? renderChatHeader() : renderListIf(); }
  } else if (m.t === 'typing') {
    S.typing[m.id] = Date.now(); if (S.cur === Number(m.id)) renderChatHeader(); setTimeout(() => S.cur === Number(m.id) && renderChatHeader(), 3200);
  } else if (m.t === 'read') {
    (S.msgs[m.by] || []).forEach((x) => { if (Number(x.id) <= m.upTo && Number(x.from_id) === Number(S.me.id)) x.read_at = x.read_at || new Date().toISOString(); });
    if (S.cur === Number(m.by)) renderChatBody(false);
  } else if (m.t === 'contact') { refreshContacts(); }
  else if (m.t === 'profile') { const c = byId(m.user.id); if (c) { Object.assign(c, m.user); S.cur === c.id ? renderChatHeader() : renderListIf(); } }
}
const sortC = (a, b) => new Date(b.last?.created_at || 0) - new Date(a.last?.created_at || 0);

function notify(c, msg) {
  if ('Notification' in window && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
    try { new Notification(c.name, { body: previewOf(msg), icon: 'icon.svg' }); } catch {}
  }
}

// ---------- data ----------
async function refreshContacts() {
  try { S.contacts = (await api('/contacts')).contacts.sort(sortC); S.contacts.forEach((c) => c.id = Number(c.id)); renderListIf(); if (S.cur) renderChatHeader(); } catch {}
}
async function refreshAll() { await refreshContacts(); if (S.cur) { await loadMsgs(S.cur); renderChatBody(true); sendWs({ t: 'read', with: S.cur }); } }
async function loadMsgs(id) {
  try { S.msgs[id] = (await api('/messages/' + id)).messages; } catch {}
}

// ---------- views ----------
function render() {
  if (!S.token || !S.me) return renderAuth();
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
    go.disabled = true; err.textContent = mode === 'signup' || true ? 'لحظة… (أول مرة ممكن ياخد ثواني لحد ما السيرفر يصحى)' : '';
    try {
      const body = { wanasId: document.getElementById('wid').value, password: document.getElementById('pw').value };
      if (mode === 'signup') body.name = document.getElementById('name').value;
      const j = await api(mode === 'login' ? '/login' : '/signup', { method: 'POST', body, noLogout: true });
      S.token = j.token; LS.set('wanas_token', j.token); S.me = j.me; boot();
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
  document.querySelectorAll('.row').forEach((r) => (r.onclick = () => openChat(Number(r.dataset.id))));
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
    <label class="field"><span>ونس ID بتاع الشخص</span><input id="aid" dir="ltr" autocapitalize="none" spellcheck="false" placeholder="hayat"></label>
    <div id="res"></div><div class="err" id="aerr"></div>
    <button class="btn" id="find">بحث</button>
    <p style="color:var(--mu);font-size:13px">الـ ID بتاعك: <span class="idbox">${esc(S.me.wanasId)}</span></p>`);
  const res = s.querySelector('#res'), err = s.querySelector('#aerr');
  s.querySelector('#find').onclick = async () => {
    err.textContent = ''; res.innerHTML = '';
    try {
      const u = (await api('/users/' + encodeURIComponent(s.querySelector('#aid').value.trim()))).user;
      if (Number(u.id) === Number(S.me.id)) throw new Error('self');
      res.innerHTML = `<div class="found">${avatar(u)}<div style="flex:1"><b>${esc(u.name)}</b><div style="color:var(--mu);direction:ltr;text-align:right">@${esc(u.wanasId)}</div></div></div><button class="btn" id="ok">إضافة وبدء محادثة</button>`;
      s.querySelector('#ok').onclick = async () => {
        try { await api('/contacts', { method: 'POST', body: { wanasId: u.wanasId } }); await refreshContacts(); s.remove(); openChat(Number(u.id)); } catch (x) { err.textContent = ERR[x.message] || ERR.server; }
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
    try { const j = await api('/me', { method: 'PUT', body: { name: s.querySelector('#pn').value, ...(photo ? { photo } : {}) } }); S.me = j.me; s.remove(); render(); }
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
  S.cur = Number(id);
  const c = byId(id); if (c) c.unread = 0;
  renderChat();
  await loadMsgs(S.cur); renderChatBody(true);
  sendWs({ t: 'read', with: S.cur });
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
      <button class="send" id="snd">➤</button>
    </div>
  </div>`;
  document.getElementById('back').onclick = () => { S.cur = null; renderList(); refreshContacts(); };
  const t = document.getElementById('txt');
  t.oninput = () => { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 120) + 'px'; if (!t._last || Date.now() - t._last > 2000) { t._last = Date.now(); sendWs({ t: 'typing', to: S.cur }); } };
  t.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey && !/Mobi|Android/i.test(navigator.userAgent)) { e.preventDefault(); send(); } };
  document.getElementById('snd').onclick = send;
  document.getElementById('att').onclick = () => document.getElementById('img').click();
  document.getElementById('img').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { const d = await resizeImage(f, 1024, 0.7); if (d.length > 550000) return alert('الصورة كبيرة، جرّب صورة أصغر'); transmit('image', d); } catch { alert('مقدرتش أقرا الصورة'); }
    e.target.value = '';
  };
  renderChatHeader(); renderChatBody(true);
}
function renderChatHeader() {
  const hd = document.getElementById('hd'); const c = byId(S.cur); if (!hd || !c) return;
  const typing = S.typing[c.id] && Date.now() - S.typing[c.id] < 3000;
  hd.innerHTML = `${avatar(c, 'sm', true)}<div class="top" style="padding:0;background:none"><h2>${esc(c.name)}<small>${typing ? 'بيكتب…' : esc(lastSeenText(c))}</small></h2></div>`;
}
function renderChatBody(scroll) {
  const box = document.getElementById('msgs'); if (!box) return;
  const near = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
  let html = '', lastDay = '';
  for (const m of S.msgs[S.cur] || []) {
    const day = fmtDay(m.created_at || Date.now()); if (day !== lastDay) { html += `<div class="day">${day}</div>`; lastDay = day; }
    const mine = Number(m.from_id) === Number(S.me.id);
    const tick = mine ? (m.pending ? ' 🕓' : m.read_at ? ' ✓✓' : ' ✓') : '';
    html += `<div class="b ${mine ? 'me' : 'them'}">${m.kind === 'image' ? `<img src="${esc(m.body)}" alt="صورة">` : esc(m.body)}<div class="mt">${m.created_at ? fmtTime(m.created_at) : ''}${tick}</div></div>`;
  }
  box.innerHTML = html;
  box.querySelectorAll('img').forEach((i) => (i.onclick = () => { const v = document.getElementById('viewer'); v.querySelector('img').src = i.src; v.classList.remove('hidden'); v.onclick = () => v.classList.add('hidden'); }));
  if (scroll || near) box.scrollTop = box.scrollHeight;
}
function send() {
  const t = document.getElementById('txt'); const v = t.value.trim(); if (!v) return;
  t.value = ''; t.style.height = 'auto'; transmit('text', v);
}
function transmit(kind, body) {
  const cid = 'c' + Date.now() + Math.random().toString(36).slice(2, 6);
  const arr = (S.msgs[S.cur] = S.msgs[S.cur] || []);
  arr.push({ cid, pending: true, from_id: S.me.id, to_id: S.cur, kind, body, created_at: new Date().toISOString() });
  renderChatBody(true);
  if (!sendWs({ t: 'send', to: S.cur, kind, body, cid })) { arr.pop(); renderChatBody(false); alert('مفيش اتصال بالسيرفر دلوقتي، استنى ثانية وجرّب تاني'); if (kind === 'text') document.getElementById('txt').value = body; }
}

document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.token) { if (!S.wsOk) connect(); if (S.cur) sendWs({ t: 'read', with: S.cur }); } });

async function boot() {
  if (!S.token) return renderAuth();
  try { if (!S.me) S.me = (await api('/me')).me; } catch (e) { if (e.message === 'net') { $app.innerHTML = '<div class="empty">مفيش اتصال… <button class="link" onclick="location.reload()">جرّب تاني</button></div>'; return; } return renderAuth(); }
  connect(); await refreshContacts(); render();
}
boot();
})();
