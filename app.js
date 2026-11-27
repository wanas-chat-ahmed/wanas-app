// ونس client. Plain JS, no build step. Talks to the server over REST + WebSocket.
(() => {
'use strict';
// ---------- self-update: version.json is fetched uncached; a newer build reloads this one ----------
const BUILD = '25';
(() => { let tm; document.addEventListener('click', () => { document.body.classList.add('nav'); clearTimeout(tm); tm = setTimeout(() => document.body.classList.remove('nav'), 900); }, true); })();
const IC = (n) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${IC.p[n]}</svg>`;
IC.p = {"cap": "<path d=\"M2 9l10-5 10 5-10 5z\"/><path d=\"M6 11v5c3 2.5 9 2.5 12 0v-5\"/>", "chat": "<path d=\"M21 12a8 8 0 01-11.6 7.1L4 20l1-4.4A8 8 0 1121 12z\"/>", "search": "<circle cx=\"11\" cy=\"11\" r=\"6.5\"/><path d=\"M20 20l-4.2-4.2\"/>", "phone": "<path d=\"M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z\"/>", "palette": "<path d=\"M12 3a9 9 0 100 18c1.5 0 2-1 1.5-2s0-2.5 1.5-2.5H17a4 4 0 004-4c0-5-4-9.5-9-9.5z\"/><circle cx=\"7.5\" cy=\"11\" r=\".8\"/><circle cx=\"10\" cy=\"7.5\" r=\".8\"/><circle cx=\"14.5\" cy=\"7.5\" r=\".8\"/>", "cam": "<path d=\"M4 8h3l1.5-2h7L17 8h3v11H4z\"/><circle cx=\"12\" cy=\"13\" r=\"3.5\"/>", "mic": "<rect x=\"9\" y=\"3\" width=\"6\" height=\"11\" rx=\"3\"/><path d=\"M5 11a7 7 0 0014 0M12 18v3\"/>", "send": "<path d=\"M21 3L10 14M21 3l-7 18-4-7-7-4z\"/>", "trash": "<path d=\"M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3\"/>", "plus": "<path d=\"M12 5v14M5 12h14\"/>", "back": "<path d=\"M9 5l7 7-7 7\"/>"};

window.WANAS_BUILD = BUILD;
let updating = false;
async function checkUpdate() {
  if (updating) return;
  let v;
  try { const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' }); if (!r.ok) return; v = String((await r.json()).v); } catch { return; }
  if (!v || !(Number(v) > Number(BUILD))) return; // only ever move forward: a newer client never reloads itself back
  const busy = (document.getElementById('txt') && document.getElementById('txt').value.trim()) || document.querySelector('.sheet') || S.call || (typeof REC !== 'undefined' && REC.mr);
  if (busy) {
    if (!document.getElementById('upd')) {
      const b = document.createElement('div'); b.id = 'upd'; b.className = 'upd'; b.textContent = 'في تحديث جديد، اضغط هنا للتحديث';
      b.onclick = () => go(v); document.body.appendChild(b);
    }
    return;
  }
  go(v);
}
function go(v) { updating = true; location.replace(location.pathname + '?v=' + encodeURIComponent(v)); }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkUpdate(); });
window.addEventListener('focus', checkUpdate);
setInterval(() => { if (document.visibilityState === 'visible') checkUpdate(); }, 120000);
checkUpdate();

const $app = document.getElementById('app');
const LS = { get: (k) => localStorage.getItem(k), set: (k, v) => localStorage.setItem(k, v), del: (k) => localStorage.removeItem(k) };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ERR = {
  bad_id: 'الـ ID لازم يكون ٣ لـ ٢٠ حرف إنجليزي صغير أو أرقام أو _ أو .',
  bad_name: 'اكتب اسمك', bad_password: 'الباسورد غلط أو أقل من ٦ حروف', bad_code: 'الكود غلط أو الـ ID غلط', too_many: 'محاولات كتير، جرّب بعد ساعة', unauthorized: 'لازم تسجّل دخول تاني',
  id_taken: 'الـ ID ده واخده حد، جرّب غيره', bad_login: 'الـ ID أو الباسورد غلط',
  not_found: 'مفيش حد بالـ ID ده', self: 'ده الـ ID بتاعك انت 😄', server: 'في مشكلة في السيرفر، جرّب تاني', net: 'مفيش اتصال، جرّب تاني',
};

const SB_URL = 'https://ykrlreixhvnrkvhwgjtd.supabase.co';
const SB_KEY = 'sb_publishable_QeMbFx5H3mRw9_kWdSBarw_a5owjM4y'; // publishable key: safe in the browser, access is enforced by RLS
const sb = window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
const emailOf = (wid) => `${String(wid).trim().toLowerCase()}@wanas-users.example.com`;

const S = { blocked: new Set(), mutes: new Set(), pushOn: false, wp: { all: null, chats: {} }, me: null, contacts: [], cur: null, msgs: {}, ch: null, wsOk: false, retry: 0 };
const ONLINE_MS = 45000;

async function signupCall(body, authed) {
  let r;
  try {
    const h = { 'Content-Type': 'application/json', apikey: SB_KEY };
    if (authed) { const { data } = await sb.auth.getSession(); if (data.session) h.Authorization = 'Bearer ' + data.session.access_token; }
    r = await fetch(SB_URL + '/functions/v1/signup', { method: 'POST', headers: h, body: JSON.stringify(body) });
  }
  catch { throw new Error('net'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'server');
  return j;
}
function codeSheet(code, title) {
  const o = document.createElement('div'); o.className = 'sheet';
  o.innerHTML = `<div class="in"><h3>${title || 'كود استرجاع الحساب'}</h3>
    <p style="margin:0 0 10px">لو نسيت الباسورد، الكود ده هو الطريقة الوحيدة ترجّع بيها حسابك (مفيش إيميل). <b>اكتبه أو صوّره دلوقتي</b>، مش هيتعرض تاني.</p>
    <div class="idbox" dir="ltr" style="display:block;text-align:center;font-size:22px;letter-spacing:2px;margin:12px 0;user-select:all">${esc(code)}</div>
    <button class="btn sec" id="cc">نسخ الكود</button>
    <label style="display:flex;gap:8px;align-items:center;margin:12px 0"><input type="checkbox" id="ck"> حفظت الكود في مكان آمن</label>
    <button class="btn" id="ok" disabled>تمام</button></div>`;
  document.body.appendChild(o);
  const ck = o.querySelector('#ck'), ok = o.querySelector('#ok');
  ck.onchange = () => { ok.disabled = !ck.checked; };
  o.querySelector('#cc').onclick = async () => { try { await navigator.clipboard.writeText(code); toast('اتنسخ'); } catch { toast('انسخه يدوي'); } };
  ok.onclick = () => o.remove();
}
function renderRecover() {
  window.__authMode = 'recover';
  $app.innerHTML = `<div class="screen auth"><div class="card"><img class="logo" src="icon.svg" alt="">
    <h1>نسيت كلمة السر</h1><p class="sub">اكتب الـ ID وكود الاسترجاع اللي خدته وقت التسجيل</p>
    <form id="f" autocomplete="off">
      <label class="field"><span>ونس ID</span><input id="wid" dir="ltr" autocapitalize="none" spellcheck="false" maxlength="20" required></label>
      <label class="field"><span>كود الاسترجاع</span><input id="rc" dir="ltr" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-XXXX-XXXX" required></label>
      <label class="field"><span>باسورد جديد</span><input id="pw" type="password" dir="ltr" minlength="6" required></label>
      <div class="err" id="err"></div><button class="btn" id="go">تغيير الباسورد</button></form>
    <button class="link" id="bk">رجوع</button></div></div>`;
  document.getElementById('bk').onclick = () => renderAuth('login');
  document.getElementById('f').onsubmit = async (e) => {
    e.preventDefault(); const go = document.getElementById('go'), err = document.getElementById('err'); go.disabled = true; err.textContent = 'لحظة…';
    try {
      const wid = document.getElementById('wid').value.trim().toLowerCase(), pw = document.getElementById('pw').value;
      const j = await signupCall({ action: 'recover', wanasId: wid, code: document.getElementById('rc').value, newPassword: pw });
      const { error } = await sb.auth.signInWithPassword({ email: emailOf(wid), password: pw });
      if (error) throw new Error('bad_login');
      boot(); codeSheet(j.code, 'كود استرجاع جديد (القديم اتلغى)');
    } catch (x) { err.textContent = ERR[x.message] || ERR.server; go.disabled = false; }
  };
}
const fail = (error) => { if (error) { const m = (error.message || '').trim(); throw new Error(/not_found|self|unauthorized/.test(m) ? m.match(/not_found|self|unauthorized/)[0] : /fetch|network/i.test(m) ? 'net' : 'server'); } };

async function logout() {
  try { await disablePush(); } catch {}
  teardownRealtime(); await sb.auth.signOut();
  S.me = null; S.cur = null; S.contacts = []; S.msgs = {}; S.wp = { all: null, chats: {} }; S.isAdmin = false; S.isTeacher = false; S.view = null; S.qs = null; S.subs = null; S.sub = null; render();
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
function previewOf(m) { return !m ? 'ابدأ المحادثة' : m.kind === 'image' ? '📷 صورة' : m.kind === 'voice' ? '🎤 رسالة صوتية' : m.kind === 'call' ? (m.body === 'call' ? '📞 مكالمة صوتية' : '📵 مكالمة') : m.body; }

// ---------- realtime (Supabase Realtime, filtered by RLS per user) ----------
function setupRealtime() {
  teardownRealtime();
  const ch = sb.channel('wanas-' + S.me.id)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (p) => onMessage(p.new))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, (p) => onMessageUpdate(p.new))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (p) => onProfile(p.new))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'call_signals' }, (p) => onSignal(p.new))
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
  Object.assign(c, { name: p.name, photo: p.photo, bio: p.bio || '', lastSeen: p.last_seen });
  S.cur === c.id ? renderChatHeader() : renderListIf();
}
const sortC = (a, b) => new Date(b.last?.created_at || 0) - new Date(a.last?.created_at || 0);

function notify(c, msg) {
  if (S.pushOn) return; // the server already pushes when you are away
  if ('Notification' in window && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
    try { new Notification(c.name, { body: previewOf(msg), icon: 'icon.svg' }); } catch {}
  }
}

// ---------- data ----------
const meOf = (p) => ({ id: p.id, wanasId: p.wanas_id, name: p.name, photo: p.photo || null, bio: p.bio || '', lastSeen: p.last_seen });
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
  if (S.view === 'quran' && !S.cur) return renderQuran();
  S.cur ? renderChat() : renderList();
}

function renderAuth(mode = 'login') {
  window.__authMode = mode;
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
      let rcode = null;
      if (mode === 'signup') rcode = (await signupCall({ wanasId: wid, password: pw, name: document.getElementById('name').value })).code;
      const { error } = await sb.auth.signInWithPassword({ email: emailOf(wid), password: pw });
      if (error) throw new Error(/fetch|network/i.test(error.message) ? 'net' : 'bad_login');
      boot(); if (rcode) codeSheet(rcode);
    } catch (x) { err.textContent = ERR[x.message] || ERR.server; go.disabled = false; }
  };
  if (mode === 'login') { const fb = document.createElement('button'); fb.className = 'link'; fb.textContent = 'نسيت كلمة السر؟'; fb.onclick = renderRecover; document.getElementById('sw').after(fb); }
}

// ---------- منصة القرآن: خريطة الحفظ ----------
const QST = { memorized: ['محفوظ', '#16a34a'], learning: ['بيحفظ', '#f59e0b'], revision: ['محتاج مراجعة', '#dc2626'] };
const arN = (n) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
async function loadSurahs() {
  if (S.qs) return S.qs;
  const { data, error } = await sb.from('quran_surahs').select('num,name_ar,name_en,ayahs').order('num');
  if (error) throw new Error('server'); S.qs = data; return data;
}
async function renderQuran() {
  S.view = 'quran';
  $app.innerHTML = `<div class="screen"><div class="top"><button class="ib" id="qback">${IC('back')}</button><h2>المنصة التعليمية<small>${S.isTeacher ? 'منصتك: معلّم · وفي منصات غيرك: طالب' : 'متابعة تعلّمك'}</small></h2></div><div id="qsubs"></div><div id="qtabs"></div><div class="wrap" id="qbody"><div class="sk"><i></i><i></i><i></i></div></div></div>`;
  document.getElementById('qback').onclick = () => { S.view = null; render(); };
  try {
    await loadSurahs();
    let { data, error } = await sb.rpc('my_subjects');
    if (error) throw new Error('server');
    if (S.isTeacher && !data.some((x) => x.kind === 'quran' && x.teacher_id === S.me.id)) { await sb.rpc('create_subject', { p_name: 'القرآن', p_kind: 'quran' }); ({ data } = await sb.rpc('my_subjects')); }
    S.subs = data || [];
  } catch { document.getElementById('qbody').innerHTML = '<div class="empty">مقدرتش أحمّل البيانات، جرّب تاني</div>'; return; }
  if (!S.subs.some((x) => x.id === S.sub)) S.sub = (S.subs[0] || {}).id;
  subjectBar(); openSubject();
}
function subjectBar() {
  const el = document.getElementById('qsubs'); if (!el) return;
  if (!S.isTeacher && !S.subs.length) { el.innerHTML = ''; return; }
  el.innerHTML = `<div style="display:flex;gap:6px;overflow-x:auto;padding:10px 14px 0">${S.subs.map((x) => `<button class="qsub" data-id="${x.id}" style="border:0;border-radius:16px;padding:7px 14px;white-space:nowrap;background:${x.id === S.sub ? 'var(--v)' : 'var(--chip)'};color:${x.id === S.sub ? '#fff' : 'var(--v)'}">${esc(x.name)}${x.teacher_id !== S.me.id ? ' <small style="opacity:.8">· ' + esc(x.teacher_name || '') + '</small>' : ''}</button>`).join('')}${S.isTeacher ? '<button id="qnew" style="border:0;border-radius:16px;padding:7px 14px;background:var(--a);color:#1f1537;font-weight:700;white-space:nowrap">＋ مادة</button>' : '<button id="qopen" style="border:0;border-radius:16px;padding:7px 14px;background:var(--a);color:#1f1537;font-weight:700;white-space:nowrap">افتح منصتي</button>'}</div>`;
  el.querySelectorAll('.qsub').forEach((b) => (b.onclick = () => { S.sub = +b.dataset.id; S.qf = 'all'; subjectBar(); openSubject(); }));
  const nb = el.querySelector('#qnew'); if (nb) nb.onclick = newSubjectSheet;
  const ob = el.querySelector('#qopen'); if (ob) ob.onclick = openMyPlatform;
}
function curSub() { return (S.subs || []).find((x) => x.id === S.sub); }
const QT = [['tilawa', 'تلاوة'], ['story', 'قصص'], ['seerah', 'سيرة'], ['original', 'النص الأصلي']];
function openSubject() {
  const sub = curSub(), tb = document.getElementById('qtabs'), box = document.getElementById('qbody'); if (!box) return;
  if (!sub || sub.kind !== 'quran') { if (tb) tb.innerHTML = ''; return openSubject0(); }
  if (S.qtabSub !== sub.id) { S.qtabSub = sub.id; S.qtab = 'tilawa'; }
  tb.innerHTML = `<div style="display:flex;gap:6px;padding:8px 14px 0">${QT.map(([k, n]) => `<button class="qtab" data-k="${k}" style="flex:1;border:0;border-radius:12px;padding:8px 0;font-weight:700;background:${k === S.qtab ? 'var(--v)' : 'var(--chip)'};color:${k === S.qtab ? '#fff' : 'var(--v)'}">${n}</button>`).join('')}</div>`;
  tb.querySelectorAll('.qtab').forEach((b) => (b.onclick = () => { S.qtab = b.dataset.k; openSubject(); }));
  if (S.qtab === 'tilawa') return openSubject0();
  chapterList(sub, S.qtab);
}
async function chapterList(sub, kind) {
  const box = document.getElementById('qbody'); if (!box) return;
  box.innerHTML = '<div class="sk"><i></i><i></i><i></i></div>';
  const { data, error } = await sb.from('sj_lessons').select('id,level,title,body,position').eq('subject_id', sub.id).eq('kind', kind).limit(1000).order('level').order('position').order('id');
  if (error) { box.innerHTML = '<div class="empty">مقدرتش أحمّل البيانات، جرّب تاني</div>'; return; }
  if (!data.length) { box.innerHTML = '<div class="empty">لسه مفيش محتوى هنا</div>'; return; }
  data.forEach((x) => (x.kind = kind));
  const groups = []; for (const l of data) { let g = groups[groups.length - 1]; if (!g || g.name !== l.level) groups.push(g = { name: l.level || '', rows: [] }); g.rows.push(l); }
  const wc = (g) => arN(g.rows.reduce((n, x) => n + (x.body || '').split(/\s+/).length, 0));
  box.innerHTML = `<div class="list">${groups.map((g, gi) => `<div class="qgrp"><button class="qgh" data-g="${gi}"><span>${esc(g.name)}</span><small>${arN(g.rows.length)} · ${wc(g)} كلمة</small></button><div class="qgb" id="g${gi}" hidden>${g.rows.map((l, ri) => `<div class="row chp" data-g="${gi}" data-r="${ri}"><div class="mid"><div class="nm" dir="auto">${esc(l.title)}</div></div></div>`).join('')}</div></div>`).join('')}</div>`;
  box.querySelectorAll('.qgh').forEach((b) => (b.onclick = () => { const e = box.querySelector('#g' + b.dataset.g); e.hidden = !e.hidden; b.classList.toggle('open', !e.hidden); }));
  box.querySelectorAll('.chp').forEach((r) => (r.onclick = () => { const g = groups[+r.dataset.g]; lessonSheet(g.rows[+r.dataset.r], null, { list: g.rows, i: +r.dataset.r }); }));
}
function openSubject0() {
  const sub = curSub(), box = document.getElementById('qbody'); if (!box) return;
  if (!sub) { box.innerHTML = `<div class="empty">لسه مفيش مواد.<br>لو مدرّس عاوز تفتح منصتك وتضيف طلابك:</div><div style="padding:0 24px"><button class="btn" id="openpl">افتح منصتي كمعلّم</button></div>`; const ob = box.querySelector('#openpl'); if (ob) ob.onclick = openMyPlatform; return; }
  if (sub.teacher_id === S.me.id) { sub.kind === 'quran' ? teacherHome() : genericHome(sub); return; }
  if (sub.kind === 'quran') studentProgress(S.me.id, S.me.name, false);
  else sjStudent(sub, S.me.id, S.me.name, false);
}
async function openMyPlatform() {
  if (!confirm('تفتح منصتك الخاصة؟ هتقدر تعمل مواد وتضيف طلابك بالـ ونس ID. صلاحياتك بتبقى على منصتك بس، ومش هتأثر على أي منصة تانية إنت طالب فيها.')) return;
  const { error } = await sb.rpc('become_teacher');
  if (error) { toast('مقدرتش أفتح المنصة، جرّب تاني'); return; }
  S.isTeacher = true; toast('اتفتحت منصتك'); renderQuran();
}
function newSubjectSheet() {
  const s = sheet(`<h3>مادة جديدة</h3><label class="field"><span>اسم المادة (مثلاً: English)</span><input id="sn" maxlength="40"></label>
    <label class="field"><span>النوع</span><select id="sk"><option value="generic">مادة عامة (دروس وتقييمات)</option><option value="quran">قرآن (خريطة حفظ وتسميع)</option></select></label>
    <div class="err" id="aerr"></div><button class="btn" id="go">إنشاء</button><button class="btn sec" id="cl">إلغاء</button>`);
  s.querySelector('#cl').onclick = () => s.remove();
  s.querySelector('#go').onclick = async () => {
    const n = s.querySelector('#sn').value.trim(), e = s.querySelector('#aerr'); if (!n) { e.textContent = 'اكتب اسم المادة'; return; }
    const { data, error } = await sb.rpc('create_subject', { p_name: n, p_kind: s.querySelector('#sk').value });
    if (error) { e.textContent = /duplicate|unique/i.test(error.message) ? 'المادة دي موجودة' : 'مقدرتش أنشئ المادة'; return; }
    const r = await sb.rpc('my_subjects'); S.subs = r.data || S.subs; S.sub = data; s.remove(); subjectBar(); openSubject();
  };
}
async function enrolledIds(subId) { const { data } = await sb.from('subject_students').select('student_id').eq('subject_id', subId); return new Set((data || []).map((x) => x.student_id)); }
// ---------- المواد العامة (English وغيره): منهج، مفردات، جلسات، تقدم ----------
const SJS = { todo: ['لسه', '#9ca3af'], learning: ['بيتعلم', '#f59e0b'], done: ['خلص', '#16a34a'] };
const SJV = { new: ['جديدة', '#9ca3af'], learning: ['بحفظها', '#f59e0b'], known: ['أعرفها', '#16a34a'] };
const sjNext = (m, k) => { const ks = Object.keys(m); return ks[(ks.indexOf(k) + 1) % ks.length]; };
const sjTab = (t, k, on) => `<button class="sjt" data-t="${k}" style="flex:1;border:0;border-radius:14px;padding:8px 4px;font-size:14px;background:${on ? 'var(--v)' : 'var(--chip)'};color:${on ? '#fff' : 'var(--v)'}">${t}</button>`;
const sjBadge = (m, k) => `<span style="display:inline-block;border-radius:10px;padding:2px 9px;font-size:12px;color:#fff;background:${m[k][1]}">${m[k][0]}</span>`;
async function genericHome(sub, tab = 'students') {
  const box = document.getElementById('qbody'); if (!box) return;
  const rdr = sub.kind === 'reader';
  const tabs = `<div style="display:flex;gap:6px;padding:10px 14px 0">${sjTab('الطلاب', 'students', tab === 'students')}${sjTab(rdr ? 'الفصول' : 'المنهج', 'lesson', tab === 'lesson')}${rdr ? '' : sjTab('القواعد', 'grammar', tab === 'grammar')}</div>`;
  const bind = () => box.querySelectorAll('.sjt').forEach((b) => (b.onclick = () => genericHome(sub, b.dataset.t)));
  if (tab === 'grammar' && isEng(sub)) { box.innerHTML = `${tabs}<div style="padding:14px">${grammarCard()}</div>`; bind(); bindGrammar(box); return; }
  if (tab !== 'students') {
    const { data, error } = await sb.from('sj_lessons').select('id,kind,level,title,body,position').eq('subject_id', sub.id).eq('kind', tab).order('level').order('position').order('id');
    if (error) { box.innerHTML = '<div class="empty">مقدرتش أحمّل المنهج</div>'; return; }
    const lv = {}; for (const l of data) (lv[l.level || 'بدون مستوى'] ||= []).push(l);
    box.innerHTML = `${tabs}<div style="padding:8px 14px 80px">${Object.keys(lv).map((k) => `<div style="margin:12px 0 4px;font-weight:700;color:var(--vt)">${esc(k)}</div>${lv[k].map((l) => `<div class="row sjl" data-id="${l.id}"><div class="mid"><div class="nm">${esc(l.title)}</div>${l.body ? `<div class="ls">${esc(l.body.slice(0, 80))}</div>` : ''}</div></div>`).join('')}`).join('') || `<div class="empty">لسه مفيش ${tab === 'lesson' ? 'دروس' : 'مواضيع قواعد'}. دوس ＋ وضيف.</div>`}</div><button class="fab" id="sjadd">${IC('plus')}</button>`;
    bind();
    const form = (l) => { const s = sheet(`<h3>${l ? 'تعديل' : tab === 'lesson' ? 'درس جديد' : 'موضوع قواعد جديد'}</h3><label class="field"><span>المستوى (مثلاً A1)</span><input id="lv" maxlength="20" value="${esc(l ? l.level : '')}"></label><label class="field"><span>العنوان</span><input id="lt" maxlength="120" value="${esc(l ? l.title : '')}"></label><label class="field"><span>المحتوى / ملاحظات</span><textarea id="lb" rows="4" maxlength="4000" style="width:100%">${esc(l ? l.body || '' : '')}</textarea></label><div class="err" id="aerr"></div><button class="btn" id="go">حفظ</button>${l ? '<button class="btn sec" id="del" style="color:#dc2626">حذف</button>' : ''}<button class="btn sec" id="cl">إلغاء</button>`);
      s.querySelector('#cl').onclick = () => s.remove();
      const dl = s.querySelector('#del'); if (dl) dl.onclick = async () => { if (!confirm('تحذف؟ تقدّم الطلاب فيه هيتمسح.')) return; await sb.rpc('delete_lesson', { p_id: l.id }); s.remove(); genericHome(sub, tab); };
      s.querySelector('#go').onclick = async () => { const t = s.querySelector('#lt').value.trim(); if (!t) { s.querySelector('#aerr').textContent = 'اكتب العنوان'; return; }
        const a = { p_level: s.querySelector('#lv').value, p_title: t, p_body: s.querySelector('#lb').value };
        const r = l ? await sb.rpc('update_lesson', { p_id: l.id, ...a }) : await sb.rpc('add_lesson', { p_subject: sub.id, p_kind: tab, ...a });
        if (r.error) { s.querySelector('#aerr').textContent = 'مقدرتش أحفظ'; return; } s.remove(); genericHome(sub, tab); };
    };
    box.querySelector('#sjadd').onclick = () => form(null);
    box.querySelectorAll('.sjl').forEach((r) => (r.onclick = () => form(data.find((x) => x.id == r.dataset.id))));
    return;
  }
  const [ov, en, od] = await Promise.all([sb.rpc('students_overview'), enrolledIds(sub.id), sb.rpc('sj_overview', { p_subject: sub.id })]);
  if (ov.error || od.error) { box.innerHTML = '<div class="empty">مقدرتش أحمّل الطلاب</div>'; return; }
  const om = {}; for (const x of od.data) om[x.id] = x;
  S.qw = {}; for (const x of ov.data) S.qw[x.id] = x.wanas_id;
  const list = ov.data.filter((x) => en.has(x.id));
  const late = (x) => !x || x.days_since == null || x.days_since >= 7;
  box.innerHTML = `${tabs}<div class="list">${list.map((s) => { const o = om[s.id] || {}; return `<div class="row" data-id="${s.id}" data-n="${esc(s.name)}">${avatar(s, '', true)}<div class="mid"><div class="nm">${esc(s.name)}</div>
    <div class="ls">دروس ${arN(o.lessons_done || 0)}/${arN(o.lessons_total || 0)} · كلمات ${arN(o.vocab_known || 0)}/${arN(o.vocab_total || 0)}${o.avg_grade != null ? ' · متوسط ' + arN(Number(o.avg_grade).toFixed(1)) + '/١٠' : ''}</div>
    <div style="font-size:12px;color:${late(o) ? '#dc2626' : 'var(--mu)'}">${o.days_since == null ? 'لسه مفيش جلسة' : o.days_since === 0 ? 'جلسة النهارده' : 'آخر جلسة من ' + arN(o.days_since) + ' يوم'}</div></div><button class="btn" data-chat="${s.id}" style="width:auto;padding:6px 12px;margin:0;display:inline-flex;align-items:center">${IC('chat')}</button></div>`; }).join('') || '<div class="empty">لسه مفيش طلاب في المادة دي. دوس ＋ وضيف طالب بالـ ونس ID بتاعه.</div>'}</div><button class="fab" id="qadd" title="إضافة طالب">${IC('plus')}</button>`;
  bind();
  box.querySelectorAll('[data-chat]').forEach((b) => (b.onclick = async (e) => { e.stopPropagation(); S.view = null; openChat(b.dataset.chat); }));
  box.querySelectorAll('.row').forEach((r) => (r.onclick = () => sjStudent(sub, r.dataset.id, r.dataset.n, true)));
  box.querySelector('#qadd').onclick = addStudentSheet;
}
// Fixed grammar course (not editable). Each lesson: explanation cards + short quiz.
const GR = [
  { id: 'a1-articles', lv: 'A1', ic: '🍎', t: 'a / an / the',
    cards: [
      { h: 'a و an', p: 'نستخدم a أو an قبل اسم واحد، أول مرة نتكلم عنه.\n• a قبل حرف ساكن: a book, a car\n• an قبل صوت متحرك (a e i o u): an apple, an egg', ex: [['I have a pen.', 'عندي قلم.'], ['She eats an apple.', 'هي بتاكل تفاحة.']] },
      { h: 'the', p: 'نستخدم the لما الشخص اللي بنكلمه يعرف الحاجة دي. أو لما نكررها.', ex: [['I have a cat. The cat is white.', 'عندي قطة. القطة بيضا.'], ['Open the door.', 'افتح الباب.']] },
    ],
    q: [
      { q: 'I have ___ orange.', o: ['a', 'an', 'the'], a: 1, w: 'orange بتبدأ بصوت متحرك، يبقى an.' },
      { q: 'He has ___ dog.', o: ['a', 'an', 'the'], a: 0, w: 'dog بتبدأ بحرف ساكن، يبقى a.' },
      { q: 'I saw a boy. ___ boy was tall.', o: ['A', 'An', 'The'], a: 2, w: 'الولد اتذكر قبل كده، يبقى The.' },
      { q: 'She is ___ doctor.', o: ['a', 'an', 'the'], a: 0, w: 'doctor حرف ساكن في الأول، يبقى a.' },
    ] },
  { id: 'a1-plural', lv: 'A1', ic: '📚', t: 'الجمع (Plural)',
    cards: [
      { h: 'القاعدة العامة', p: 'نضيف s في آخر الاسم:\nbook → books\ncar → cars', ex: [['one cat, two cats', 'قطة، اتنين قطط']] },
      { h: 'es و ies', p: 'بعد s, x, ch, sh نضيف es: bus → buses, box → boxes.\nلو الاسم آخره y بعد حرف ساكن: نشيل y ونحط ies: city → cities.', ex: [['one watch, two watches', 'ساعة، ساعتين'], ['one baby, two babies', 'طفل، طفلين']] },
      { h: 'جموع شاذة', p: 'بتتغير كلها: man → men, woman → women, child → children, foot → feet, person → people.', ex: [['Two children are here.', 'طفلين هنا.']] },
    ],
    q: [
      { q: 'one box → two ___', o: ['boxs', 'boxes', 'boxies'], a: 1, w: 'بعد x بنحط es.' },
      { q: 'one city → two ___', o: ['citys', 'cities', 'cityes'], a: 1, w: 'y بعد حرف ساكن تبقى ies.' },
      { q: 'one child → two ___', o: ['childs', 'childes', 'children'], a: 2, w: 'children جمع شاذ.' },
      { q: 'one day → two ___', o: ['days', 'daies', 'dayes'], a: 0, w: 'y بعد حرف متحرك (a) بنحط s بس.' },
    ] },
  { id: 'a1-tobe', lv: 'A1', ic: '🙂', t: 'am / is / are',
    cards: [
      { h: 'فعل الكينونة', p: 'I → am\nhe / she / it → is\nyou / we / they → are', ex: [['I am a student.', 'أنا طالب.'], ['She is happy.', 'هي سعيدة.'], ['They are friends.', 'هم أصحاب.']] },
      { h: 'النفي والسؤال', p: 'النفي: نضيف not بعد الفعل: He is not tired.\nالسؤال: نقدم الفعل: Is he tired? Are you ready?', ex: [['Are you a teacher?', 'هل أنت مدرس؟'], ['I am not hungry.', 'أنا مش جعان.']] },
    ],
    q: [
      { q: 'I ___ ten years old.', o: ['am', 'is', 'are'], a: 0, w: 'مع I نستخدم am.' },
      { q: 'She ___ my sister.', o: ['am', 'is', 'are'], a: 1, w: 'مع she نستخدم is.' },
      { q: 'We ___ at school.', o: ['is', 'am', 'are'], a: 2, w: 'مع we نستخدم are.' },
      { q: '___ you ready?', o: ['Is', 'Are', 'Am'], a: 1, w: 'السؤال مع you يبدأ بـ Are.' },
    ] },
  { id: 'a1-pronouns', lv: 'A1', ic: '👤', t: 'الضمائر (I, he, my...)',
    cards: [
      { h: 'ضمائر الفاعل وصفات الملكية', p: 'I → my (بتاعي)\nyou → your (بتاعك)\nhe → his (بتاعه)\nshe → her (بتاعها)\nwe → our (بتاعنا)\nthey → their (بتاعهم)', ex: [['I love my family.', 'بحب أسرتي.'], ['She likes her bag.', 'هي بتحب شنطتها.']] },
      { h: 'ضمائر المفعول', p: 'me, you, him, her, it, us, them: بنحطها بعد الفعل.', ex: [['Ali helps me.', 'علي بيساعدني.'], ['I know them.', 'أنا أعرفهم.']] },
    ],
    q: [
      { q: 'He loves ___ mother.', o: ['he', 'his', 'him'], a: 1, w: 'ملكية: his.' },
      { q: 'They like ___ teacher.', o: ['their', 'them', 'they'], a: 0, w: 'ملكية: their.' },
      { q: 'Please help ___.', o: ['I', 'my', 'me'], a: 2, w: 'مفعول: me.' },
      { q: 'This is Sara. ___ bag is blue.', o: ['She', 'Her', 'Him'], a: 1, w: 'الشنطة بتاعتها: Her.' },
    ] },
  { id: 'a1-questions', lv: 'A1', ic: '❓', t: 'كلمات السؤال',
    cards: [
      { h: 'أهم كلمات السؤال', p: 'What = إيه\nWhere = فين\nWhen = إمتى\nWho = مين\nWhy = ليه\nHow = إزاي', ex: [['What is your name?', 'اسمك إيه؟'], ['Where do you live?', 'بتسكن فين؟'], ['Why are you late?', 'إنت اتأخرت ليه؟']] },
    ],
    q: [
      { q: '___ is your birthday? (إمتى)', o: ['Where', 'When', 'Who'], a: 1, w: 'when = إمتى.' },
      { q: '___ is your teacher? (مين)', o: ['Who', 'What', 'Why'], a: 0, w: 'who = مين.' },
      { q: '___ do you live? (فين)', o: ['How', 'Where', 'When'], a: 1, w: 'where = فين.' },
    ] },
  { id: 'a2-present', lv: 'A2', ic: '⏰', t: 'المضارع البسيط والمستمر',
    cards: [
      { h: 'المضارع البسيط', p: 'للعادات والحقائق. مع he / she / it نضيف s للفعل.\nكلمات: always, usually, every day', ex: [['I drink tea every day.', 'بشرب شاي كل يوم.'], ['She works in a bank.', 'هي بتشتغل في بنك.']] },
      { h: 'المضارع المستمر', p: 'لحاجة بتحصل دلوقتي: am / is / are + فعل + ing.\nكلمات: now, at the moment', ex: [['I am drinking tea now.', 'أنا بشرب شاي دلوقتي.'], ['They are playing.', 'هم بيلعبوا.']] },
    ],
    q: [
      { q: 'She ___ to school every day.', o: ['go', 'goes', 'is going'], a: 1, w: 'عادة يومية مع she: goes.' },
      { q: 'Look! It ___ now.', o: ['rains', 'is raining', 'rain'], a: 1, w: 'بيحصل دلوقتي: is raining.' },
      { q: 'I ___ football on Fridays.', o: ['play', 'am play', 'plays'], a: 0, w: 'عادة مع I: play.' },
      { q: 'They ___ TV at the moment.', o: ['watch', 'are watching', 'watches'], a: 1, w: 'at the moment = دلوقتي.' },
    ] },
  { id: 'a2-count', lv: 'A2', ic: '🥤', t: 'some / any / much / many',
    cards: [
      { h: 'some و any', p: 'some في الجملة المثبتة.\nany في النفي والسؤال.', ex: [['I have some water.', 'عندي شوية مية.'], ['I don\'t have any money.', 'معنديش فلوس.'], ['Do you have any questions?', 'عندك أسئلة؟']] },
      { h: 'much و many', p: 'many مع الأشياء اللي بنعدّها: many books.\nmuch مع الأشياء اللي مش بنعدّها: much water.\na lot of تنفع مع الاتنين.', ex: [['How many apples?', 'كام تفاحة؟'], ['How much rice?', 'كام رز؟']] },
    ],
    q: [
      { q: 'I need ___ help.', o: ['some', 'many', 'a'], a: 0, w: 'جملة مثبتة: some.' },
      { q: 'She doesn\'t have ___ friends here.', o: ['some', 'any', 'much'], a: 1, w: 'نفي: any.' },
      { q: 'How ___ water do you drink?', o: ['many', 'much', 'a'], a: 1, w: 'water مش بنعدّه: much.' },
      { q: 'How ___ students are in class?', o: ['much', 'many', 'any'], a: 1, w: 'students بنعدّهم: many.' },
    ] },
  { id: 'a2-prep', lv: 'A2', ic: '📍', t: 'in / on / at',
    cards: [
      { h: 'الوقت', p: 'at + الساعة: at 5 o\'clock\non + اليوم والتاريخ: on Friday\nin + الشهر والسنة والفصل: in May, in 2024, in summer', ex: [['See you at 8.', 'نتقابل الساعة ٨.'], ['I was born in May.', 'أنا اتولدت في مايو.']] },
      { h: 'المكان', p: 'at = نقطة: at the door\nin = جوّه: in the room, in Cairo\non = فوق سطح: on the table', ex: [['The book is on the table.', 'الكتاب على الترابيزة.'], ['He lives in Egypt.', 'هو عايش في مصر.']] },
    ],
    q: [
      { q: 'The class starts ___ 9 o\'clock.', o: ['in', 'on', 'at'], a: 2, w: 'ساعة: at.' },
      { q: 'We go to school ___ Sunday.', o: ['on', 'in', 'at'], a: 0, w: 'يوم: on.' },
      { q: 'My birthday is ___ July.', o: ['on', 'in', 'at'], a: 1, w: 'شهر: in.' },
      { q: 'The keys are ___ the table.', o: ['in', 'at', 'on'], a: 2, w: 'فوق سطح: on.' },
    ] },
  { id: 'a2-modals', lv: 'A2', ic: '🚦', t: 'must / should / can',
    cards: [
      { h: 'الأفعال المساعدة', p: 'can = أقدر\nmust = لازم (قوي)\nshould = المفروض (نصيحة)\nmustn\'t = ممنوع\nبعدها الفعل من غير to.', ex: [['I can swim.', 'أنا أقدر أعوم.'], ['You must stop at red.', 'لازم تقف عند الأحمر.'], ['You should sleep early.', 'المفروض تنام بدري.']] },
    ],
    q: [
      { q: 'You ___ do your homework. (نصيحة)', o: ['should', 'must to', 'can to'], a: 0, w: 'نصيحة: should، من غير to.' },
      { q: 'I ___ swim very well.', o: ['can', 'cans', 'am can'], a: 0, w: 'can ثابتة بدون s.' },
      { q: 'You ___ cross the road when it is red. (ممنوع)', o: ['must', 'mustn\'t', 'should'], a: 1, w: 'ممنوع: mustn\'t.' },
    ] },
  { id: 'b1-perfect', lv: 'B1', ic: '🕘', t: 'Present perfect و Past simple',
    cards: [
      { h: 'Past simple', p: 'لحاجة حصلت ووقتها معروف وانتهى.\nكلمات: yesterday, last year, in 2020', ex: [['I visited Alexandria last year.', 'زرت إسكندرية السنة اللي فاتت.']] },
      { h: 'Present perfect', p: 'have / has + التصريف الثالث.\nلحاجة حصلت من غير وقت معروف، أو لسه مستمرة.\nfor = مدة (for 3 years)\nsince = بداية (since 2018)', ex: [['I have visited Alexandria.', 'أنا زرت إسكندرية قبل كده.'], ['She has lived here since 2018.', 'هي عايشة هنا من ٢٠١٨.']] },
    ],
    q: [
      { q: 'I ___ him yesterday.', o: ['saw', 'have seen', 'see'], a: 0, w: 'yesterday = ماضي بسيط.' },
      { q: 'We ___ here for five years.', o: ['lived', 'have lived', 'live'], a: 1, w: 'for + مدة = present perfect.' },
      { q: 'Have you ___ to Paris?', o: ['go', 'went', 'been'], a: 2, w: 'التصريف الثالث: been.' },
      { q: 'She has worked here ___ 2019.', o: ['for', 'since', 'in'], a: 1, w: 'since = من بداية معينة.' },
    ] },
  { id: 'b1-passive', lv: 'B1', ic: '🔁', t: 'المبني للمجهول (Passive)',
    cards: [
      { h: 'الشكل', p: 'to be + التصريف الثالث للفعل.\nنستخدمه لما الفاعل مش مهم أو مش معروف.', ex: [['English is spoken worldwide.', 'الإنجليزية بتتكلم في العالم كله.'], ['The window was broken.', 'الشباك اتكسر.']] },
      { h: 'من الـ active للـ passive', p: 'Active: Ali wrote the report.\nPassive: The report was written by Ali.', ex: [['They built this house in 1990.', 'The house was built in 1990.']] },
    ],
    q: [
      { q: 'The cake ___ by my mother.', o: ['made', 'was made', 'is make'], a: 1, w: 'was + التصريف الثالث.' },
      { q: 'Rice ___ in Egypt.', o: ['grows', 'is grown', 'grown'], a: 1, w: 'is + التصريف الثالث.' },
      { q: 'The work has ___ finished.', o: ['be', 'being', 'been'], a: 2, w: 'has been finished.' },
    ] },
  { id: 'b1-relative', lv: 'B1', ic: '🔗', t: 'who / which / that / where',
    cards: [
      { h: 'ربط الجمل', p: 'who للأشخاص\nwhich للأشياء\nthat للاتنين\nwhere للأماكن\nwhose للملكية', ex: [['The man who lives next door is a doctor.', 'الراجل اللي ساكن جنبنا دكتور.'], ['This is the school where I studied.', 'ده المدرسة اللي اتعلمت فيها.']] },
    ],
    q: [
      { q: 'The girl ___ won is my cousin.', o: ['who', 'which', 'where'], a: 0, w: 'شخص: who.' },
      { q: 'The book ___ I read was great.', o: ['who', 'which', 'where'], a: 1, w: 'شيء: which.' },
      { q: 'This is the park ___ we play.', o: ['who', 'which', 'where'], a: 2, w: 'مكان: where.' },
    ] },
  { id: 'b1-reported', lv: 'B1', ic: '💬', t: 'الكلام المنقول (Reported speech)',
    cards: [
      { h: 'نرجع بالفعل خطوة', p: 'لما نحكي كلام حد، الزمن بيرجع خطوة ورا:\nam / is → was\nwill → would\nhave → had', ex: [['"I am tired." → He said he was tired.', ''], ['"I will come." → She said she would come.', '']] },
    ],
    q: [
      { q: '"I am busy." → He said he ___ busy.', o: ['is', 'was', 'be'], a: 1, w: 'am/is ترجع was.' },
      { q: '"I will help." → She said she ___ help.', o: ['will', 'would', 'did'], a: 1, w: 'will ترجع would.' },
      { q: '"I have finished." → He said he ___ finished.', o: ['has', 'have', 'had'], a: 2, w: 'have ترجع had.' },
    ] },
  { id: 'b1-link', lv: 'B1', ic: '🧩', t: 'كلمات الربط',
    cards: [
      { h: 'إضافة وتناقض', p: 'إضافة: and, also, moreover\nتناقض: but, however, although', ex: [['Although it was late, we kept studying.', 'مع إن الوقت اتأخر، كملنا مذاكرة.']] },
      { h: 'سبب ونتيجة', p: 'because = لأن\nso = عشان كده\ntherefore = لذلك', ex: [['I was tired, so I slept.', 'كنت تعبان، عشان كده نمت.'], ['I stayed home because it rained.', 'قعدت في البيت لأن المطر نزل.']] },
    ],
    q: [
      { q: 'I was hungry, ___ I ate.', o: ['because', 'so', 'but'], a: 1, w: 'نتيجة: so.' },
      { q: 'He stayed home ___ he was sick.', o: ['so', 'because', 'however'], a: 1, w: 'سبب: because.' },
      { q: '___ it was cold, we went out.', o: ['Because', 'So', 'Although'], a: 2, w: 'تناقض: Although.' },
    ] },
];

const isEng = (sub) => sub && sub.kind === 'generic' && /انجليزي|إنجليزي|english/i.test(sub.name || '');
const gpKey = () => 'gp_' + ((S.me && S.me.id) || 'x');
const gpGet = () => { try { return JSON.parse(localStorage.getItem(gpKey()) || '{}'); } catch { return {}; } };
function grammarCard() { return `<div class="gcard" id="gopen"><div style="font-size:34px">📘</div><div style="flex:1"><div style="font-weight:800;font-size:17px">قواعد الإنجليزي</div><div style="font-size:13px;opacity:.9">${arN(GR.length)} درس قصير · قاعدة وتمارين</div></div><div style="font-size:22px">‹</div></div>`; }
function bindGrammar(root) { const b = root.querySelector('#gopen'); if (b) b.onclick = openGrammar; }
function openGrammar() {
  const s = sheet('<div></div>'); s.classList.add('full');
  const draw = () => {
    const gp = gpGet(), done = GR.filter((x) => gp[x.id]).length;
    let last = '', h = '';
    GR.forEach((x, i) => { if (x.lv !== last) { last = x.lv; h += `<div class="glv">المستوى ${x.lv}</div>`; } const p = gp[x.id]; h += `<div class="row grow" data-i="${i}"><div class="gic">${x.ic}</div><div class="mid"><div class="nm" dir="auto">${esc(x.t)}</div><div class="ls">${p ? `خلّصته · ${arN(p.best)}/${arN(p.total)}` : arN(x.q.length) + ' تمارين'}</div></div><div style="font-size:20px">${p && p.best === p.total ? '⭐' : p ? '✅' : '▶'}</div></div>`; });
    s.querySelector('.in').innerHTML = `<div class="rdbar"><button class="rdb" id="cl">✕</button><div style="flex:1"></div></div><div class="rdt"><h3>قواعد الإنجليزي</h3></div><div class="gbar"><i style="width:${Math.round(done / GR.length * 100)}%"></i></div><div style="color:var(--mu);font-size:13px;margin:4px 2px 6px">${arN(done)} من ${arN(GR.length)} خلصت</div><div class="rdbody">${h}</div>`;
    s.querySelector('#cl').onclick = () => s.remove();
    s.querySelectorAll('.grow').forEach((r) => (r.onclick = () => grammarLesson(+r.dataset.i, draw)));
  };
  draw();
}
function grammarLesson(i, onDone) {
  const L = GR[i], s = sheet('<div></div>'); s.classList.add('full');
  const steps = []; { const cs = L.cards, qs = L.q, n = Math.max(cs.length, qs.length); for (let j = 0; j < n; j++) { if (cs[j]) steps.push({ t: 'c', c: cs[j] }); const per = j === cs.length - 1 ? qs.length - j : 1; for (let m = 0; m < per && qs[j + m]; m++) steps.push({ t: 'q', q: qs[j + m] }); if (j === cs.length - 1) break; } steps.push({ t: 'end' }); }
  let k = 0, score = 0;
  const draw = () => {
    const st = steps[k], pct = Math.round(k / (steps.length - 1) * 100);
    let body = '', foot = '';
    if (st.t === 'c') {
      body = `<div class="gh">${esc(st.c.h)}</div><div class="gp" dir="auto">${esc(st.c.p).replace(/\n/g, '<br>')}</div>${st.c.ex.map(([e, a]) => `<div class="gex"><div dir="ltr" style="font-weight:700">${esc(e)}</div>${a ? `<div style="color:var(--mu);font-size:15px">${esc(a)}</div>` : ''}</div>`).join('')}`;
      foot = '<button class="btn" id="nx">كمّل</button>';
    } else if (st.t === 'q') {
      body = `<div class="gq" dir="ltr">${esc(st.q.q)}</div>${st.q.o.map((o, j) => `<button class="gopt" data-j="${j}" dir="ltr">${esc(o)}</button>`).join('')}<div id="gfb"></div>`;
    } else {
      const all = score === L.q.length; body = `<div style="text-align:center;padding-top:30px"><div style="font-size:64px">${all ? '🎉' : '👍'}</div><div class="gh" style="margin-top:8px">${all ? 'ممتاز!' : 'برافو!'}</div><div style="font-size:22px;margin:6px 0">${arN(score)} من ${arN(L.q.length)}</div><div style="color:var(--mu)">${all ? 'جاوبت كل الأسئلة صح' : 'ممكن تعيد الدرس عشان تثبّت القاعدة'}</div></div>`;
      foot = `${i < GR.length - 1 ? '<button class="btn" id="nl">الدرس اللي بعده</button>' : ''}<button class="btn sec" id="rt">إعادة</button><button class="btn sec" id="ex">خروج</button>`;
      const gp = gpGet(), p = gp[L.id]; if (!p || score >= p.best) { gp[L.id] = { best: score, total: L.q.length }; localStorage.setItem(gpKey(), JSON.stringify(gp)); }
    }
    s.querySelector('.in').innerHTML = `<div class="rdbar"><button class="rdb" id="cl">✕</button><div class="gbar" style="flex:1;margin:0 10px"><i style="width:${pct}%"></i></div></div><div class="rdbody" style="font-size:19px">${body}</div><div class="rdfoot" id="gft">${foot}</div>`;
    s.querySelector('#cl').onclick = () => { s.remove(); onDone && onDone(); };
    const nx = s.querySelector('#nx'); if (nx) nx.onclick = () => { k++; draw(); };
    s.querySelectorAll('.gopt').forEach((b) => (b.onclick = () => {
      const q = st.q, j = +b.dataset.j, ok = j === q.a; if (ok) score++;
      s.querySelectorAll('.gopt').forEach((x) => { x.disabled = true; if (+x.dataset.j === q.a) x.classList.add('ok'); });
      if (!ok) b.classList.add('bad');
      s.querySelector('#gfb').innerHTML = `<div class="gfb ${ok ? 'ok' : 'bad'}">${ok ? '✓ صح!' : '✗ غلط'}<div style="font-weight:400;margin-top:2px">${esc(q.w)}</div></div>`;
      s.querySelector('#gft').innerHTML = '<button class="btn" id="nx2">كمّل</button>'; s.querySelector('#nx2').onclick = () => { k++; draw(); };
    }));
    const nl = s.querySelector('#nl'); if (nl) nl.onclick = () => { s.remove(); onDone && onDone(); grammarLesson(i + 1, onDone); };
    const rt = s.querySelector('#rt'); if (rt) rt.onclick = () => { k = 0; score = 0; draw(); };
    const ex = s.querySelector('#ex'); if (ex) ex.onclick = () => { s.remove(); onDone && onDone(); };
  };
  draw();
}
function lessonSheet(l, st, nav) {
  const fs = () => Math.min(36, Math.max(15, +localStorage.getItem('wfs') || 21));
  const s = sheet('<div id="rd"></div>'); s.classList.add('full');
  let playing = false, au = null, mode = '';
  const canVoice = () => (l.kind === 'story' || l.kind === 'seerah') && l.position != null;
  const plain = () => (l.title + '. ' + (l.body || '').split('\n').filter((x) => !x.startsWith('المصدر')).join('\n'));
  const stop = () => { playing = false; try { if (au) { au.pause(); au.removeAttribute('src'); au.load(); } } catch {} try { speechSynthesis.cancel(); } catch {} };
  const rm = s.remove.bind(s); s.remove = () => { stop(); rm(); };
  const btn = () => { const b = s.querySelector('#pl'); if (b) b.textContent = playing ? '⏸ إيقاف' : '🔊 اسمع القصة'; };
  const after = () => { if (playing && nav && nav.i < nav.list.length - 1) { nav.i++; l = nav.list[nav.i]; draw(); play(); } else { playing = false; btn(); } };
  const speak = () => {
    try {
      const u = new SpeechSynthesisUtterance(plain()); u.lang = 'ar-SA'; u.rate = 0.85;
      const v = speechSynthesis.getVoices().find((x) => /^ar/i.test(x.lang)); if (v) u.voice = v;
      u.onend = after; u.onerror = () => { playing = false; btn(); toast('الصوت مش شغال على الجهاز ده'); };
      speechSynthesis.cancel(); speechSynthesis.speak(u);
    } catch { playing = false; btn(); toast('الصوت مش متاح على الجهاز ده'); }
  };
  const play = () => {
    playing = true; btn(); if (!au) au = new Audio();
    au.onended = after; au.onerror = () => { if (playing) speak(); };
    au.src = `${SB_URL}/storage/v1/object/public/story-audio/${l.kind}${l.position}.mp3`;
    au.play().catch(() => { if (playing) speak(); });
  };
  const draw = () => {
    const body = esc(l.body || '').replace(/https?:\/\/[^\s<)]+/g, (u) => `<a href="${u}" target="_blank" rel="noopener" style="color:var(--vt);word-break:break-all">${u}</a>`).split('\n').map((x) => `<div dir="auto" style="min-height:1em;margin-bottom:.55em">${x}</div>`).join('');
    const n = nav && nav.list.length > 1;
    s.querySelector('.in').innerHTML = `<div class="rdbar"><button class="rdb" id="cl" aria-label="قفل">✕</button>${canVoice() ? '<button class="rdb" id="pl" style="background:var(--v);color:#fff">🔊 اسمع القصة</button>' : ''}<div style="flex:1"></div><button class="rdb" id="fm">أ−</button><button class="rdb" id="fp">أ+</button></div>
    <div class="rdt">${l.level ? `<small>${esc(l.level)}</small>` : ''}<h3>${esc(l.title)}</h3></div>
    <div class="rdbody" id="rdb" style="font-size:${fs()}px">${body}</div>
    <div class="rdfoot">${n ? `<button class="btn sec" id="pv" ${nav.i <= 0 ? 'disabled' : ''}>السابق</button><button class="btn" id="nx" ${nav.i >= nav.list.length - 1 ? 'disabled' : ''}>التالي</button>` : ''}${st ? `<button class="btn" id="lst">غيّر الحالة (دلوقتي: ${st.label})</button>` : ''}</div>`;
    s.querySelector('#cl').onclick = () => s.remove();
    const z = (d) => { localStorage.setItem('wfs', Math.min(36, Math.max(15, fs() + d))); s.querySelector('#rdb').style.fontSize = fs() + 'px'; };
    s.querySelector('#fm').onclick = () => z(-2); s.querySelector('#fp').onclick = () => z(2);
    const go = (d) => { const was = playing; stop(); nav.i += d; l = nav.list[nav.i]; draw(); if (was) play(); };
    const pv = s.querySelector('#pv'), nx = s.querySelector('#nx'); if (pv) pv.onclick = () => go(-1); if (nx) nx.onclick = () => go(1);
    const pl = s.querySelector('#pl'); if (pl) { btn(); pl.onclick = () => { if (playing) { stop(); btn(); } else play(); }; }
    const b = s.querySelector('#lst'); if (b) b.onclick = async () => { s.remove(); await st.next(); };
  };
  draw();
}
async function sjStudent(sub, sid, name, teacher, tab = 'lessons') {
  const rd = sub.kind === 'reader'; if (rd) tab = 'lessons';
  const box = document.getElementById('qbody'); if (!box) return;
  const back = teacher ? `<button class="btn sec" id="sjb" style="margin:10px 14px 0;width:auto;padding:6px 14px;display:inline-flex;align-items:center;gap:4px">${IC('back')} الطلاب</button>` : '';
  const [ls, pg, vc, ss] = await Promise.all([
    sb.from('sj_lessons').select('id,kind,level,title,body').eq('subject_id', sub.id).order('level').order('position').order('id'),
    sb.from('sj_progress').select('lesson_id,status').eq('subject_id', sub.id).eq('student_id', sid),
    sb.from('sj_vocab').select('id,word,meaning,example,status').eq('subject_id', sub.id).eq('student_id', sid).order('id', { ascending: false }),
    sb.from('sj_sessions').select('id,session_date,topic,grade,notes').eq('subject_id', sub.id).eq('student_id', sid).order('session_date', { ascending: false }).order('id', { ascending: false })]);
  if (ls.error || pg.error || vc.error || ss.error) { box.innerHTML = '<div class="empty">مقدرتش أحمّل البيانات</div>'; return; }
  const st = {}; for (const p of pg.data) st[p.lesson_id] = p.status;
  const done = ls.data.filter((l) => st[l.id] === 'done').length, known = vc.data.filter((v) => v.status === 'known').length;
  const gs = ss.data.filter((x) => x.grade != null), avg = gs.length ? gs.reduce((a, x) => a + x.grade, 0) / gs.length : null;
  const tabs = rd ? '' : `<div style="display:flex;gap:6px;padding:10px 14px 0">${sjTab('الدروس', 'lessons', tab === 'lessons')}${sjTab('المفردات', 'vocab', tab === 'vocab')}${sjTab('الجلسات', 'sessions', tab === 'sessions')}</div>`;
  const stats = rd ? `<div style="padding:10px 14px 0"><b style="font-size:18px">${esc(sub.name)}</b><div style="color:var(--mu);font-size:13px;margin-top:2px">${arN(ls.data.length)} فصل · اضغط على الفصل عشان تقراه</div></div>` : `<div style="padding:10px 14px 0"><b style="font-size:18px">${esc(name)}</b><div style="color:var(--mu);font-size:13px;margin-top:2px">دروس ${arN(done)}/${arN(ls.data.length)} · كلمات ${arN(known)}/${arN(vc.data.length)} · جلسات ${arN(ss.data.length)}${avg != null ? ' · متوسط ' + arN(avg.toFixed(1)) + '/١٠' : ''}</div></div>`;
  let body = '', fab = '';
  if (tab === 'lessons') {
    const kinds = [['lesson', 'الدروس'], ['grammar', 'القواعد']];
    const eng = isEng(sub);
    body = (eng ? grammarCard() : '') + kinds.map(([k, t]) => { if (eng && k === 'grammar') return ''; const a = ls.data.filter((l) => l.kind === k); if (!a.length) return ''; return (rd ? '' : `<div style="margin:12px 0 4px;font-weight:700;color:var(--vt)">${t}</div>`) + a.map((l) => { const s = st[l.id] || 'todo'; return `<div class="row sjls" data-id="${l.id}" data-s="${s}"><div class="mid"><div class="nm">${l.level ? `<small style="color:var(--mu)">${esc(l.level)} · </small>` : ''}${esc(l.title)}</div>${l.body ? `<div class="ls">${esc(l.body.slice(0, 80))}</div>` : ''}</div>${rd && !teacher ? '' : sjBadge(SJS, s)}</div>`; }).join(''); }).join('') || '<div class="empty">المدرّس لسه مضافش دروس</div>';
  } else if (tab === 'vocab') {
    body = vc.data.map((v) => `<div class="row sjv" data-id="${v.id}" data-s="${v.status}"><div class="mid"><div class="nm" dir="auto">${esc(v.word)}${v.meaning ? ` <small style="color:var(--mu)">— ${esc(v.meaning)}</small>` : ''}</div>${v.example ? `<div class="ls" dir="auto">${esc(v.example)}</div>` : ''}</div>${sjBadge(SJV, v.status)}${teacher ? `<button class="ib sjvd" data-id="${v.id}" style="margin-inline-start:6px;color:var(--mu);background:var(--vl)">${IC('trash')}</button>` : ''}</div>`).join('') || '<div class="empty">لسه مفيش كلمات</div>';
    if (teacher) fab = `<button class="fab" id="sjadd">${IC('plus')}</button>`;
  } else {
    body = ss.data.map((x) => `<div class="row"><div class="mid"><div class="nm">${esc(x.topic)}${x.grade != null ? ` <b style="color:var(--vt)">${arN(x.grade)}/١٠</b>` : ''}</div><div class="ls">${arN(x.session_date)}</div>${x.notes ? `<div style="font-size:13px;margin-top:2px;white-space:pre-wrap" dir="auto">${esc(x.notes)}</div>` : ''}</div>${teacher ? `<button class="ib sjsd" data-id="${x.id}" style="color:var(--mu);background:var(--vl)">${IC('trash')}</button>` : ''}</div>`).join('') || '<div class="empty">لسه مفيش جلسات</div>';
    if (teacher) fab = `<button class="fab" id="sjadd">${IC('plus')}</button>`;
  }
  box.innerHTML = `${back}${stats}${tabs}<div style="padding:4px 14px 80px">${body}</div>${fab}`;
  bindGrammar(box);
  const re = (t) => sjStudent(sub, sid, name, teacher, t || tab);
  box.querySelectorAll('.sjt').forEach((b) => (b.onclick = () => re(b.dataset.t)));
  const bk = box.querySelector('#sjb'); if (bk) bk.onclick = () => genericHome(sub);
  box.querySelectorAll('.sjls').forEach((r) => (r.onclick = () => { const l = ls.data.find((x) => x.id == r.dataset.id); if (!l) return;
    lessonSheet(l, teacher ? { label: SJS[r.dataset.s][0], next: async () => { const n = sjNext(SJS, r.dataset.s); const e = await sb.rpc('set_lesson_status', { p_student: sid, p_lesson: +r.dataset.id, p_status: n }); if (e.error) toast('مقدرتش أحدّث'); re(); } } : null); }));
  box.querySelectorAll('.sjv').forEach((r) => (r.onclick = async () => { const e = await sb.rpc('set_vocab_status', { p_id: +r.dataset.id, p_status: sjNext(SJV, r.dataset.s) }); if (e.error) toast('مقدرتش أحدّث'); re(); }));
  box.querySelectorAll('.sjvd').forEach((b) => (b.onclick = async (e) => { e.stopPropagation(); if (!confirm('تحذف الكلمة؟')) return; await sb.rpc('delete_vocab', { p_id: +b.dataset.id }); re(); }));
  box.querySelectorAll('.sjsd').forEach((b) => (b.onclick = async () => { if (!confirm('تحذف الجلسة؟')) return; await sb.rpc('delete_sj_session', { p_id: +b.dataset.id }); re(); }));
  const ad = box.querySelector('#sjadd'); if (!ad) return;
  ad.onclick = () => {
    if (tab === 'vocab') { const s = sheet(`<h3>كلمة جديدة</h3><label class="field"><span>الكلمة</span><input id="w" dir="ltr" maxlength="80"></label><label class="field"><span>المعنى</span><input id="m" maxlength="120"></label><label class="field"><span>مثال</span><input id="x" dir="ltr" maxlength="200"></label><div class="err" id="aerr"></div><button class="btn" id="go">إضافة</button><button class="btn sec" id="cl">إلغاء</button>`);
      s.querySelector('#cl').onclick = () => s.remove();
      s.querySelector('#go').onclick = async () => { const w = s.querySelector('#w').value.trim(); if (!w) { s.querySelector('#aerr').textContent = 'اكتب الكلمة'; return; } const r = await sb.rpc('add_vocab', { p_subject: sub.id, p_student: sid, p_word: w, p_meaning: s.querySelector('#m').value, p_example: s.querySelector('#x').value }); if (r.error) { s.querySelector('#aerr').textContent = 'مقدرتش أضيف'; return; } s.remove(); re(); }; }
    else { const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      const s = sheet(`<h3>جلسة جديدة</h3><label class="field"><span>التاريخ</span><input id="d" type="date" value="${today}"></label><label class="field"><span>الموضوع</span><input id="t" maxlength="120"></label><label class="field"><span>الدرجة (٠ - ١٠، اختياري)</span><input id="g" type="number" min="0" max="10" inputmode="numeric"></label><label class="field"><span>ملاحظات</span><textarea id="n" rows="3" maxlength="2000" style="width:100%"></textarea></label><div class="err" id="aerr"></div><button class="btn" id="go">حفظ</button><button class="btn sec" id="cl">إلغاء</button>`);
      s.querySelector('#cl').onclick = () => s.remove();
      s.querySelector('#go').onclick = async () => { const t = s.querySelector('#t').value.trim(), gv = s.querySelector('#g').value; if (!t) { s.querySelector('#aerr').textContent = 'اكتب الموضوع'; return; } if (gv !== '' && (+gv < 0 || +gv > 10)) { s.querySelector('#aerr').textContent = 'الدرجة من ٠ لـ ١٠'; return; }
        const r = await sb.rpc('add_sj_session', { p_subject: sub.id, p_student: sid, p_date: s.querySelector('#d').value || null, p_topic: t, p_grade: gv === '' ? null : Math.round(+gv), p_notes: s.querySelector('#n').value }); if (r.error) { s.querySelector('#aerr').textContent = 'مقدرتش أحفظ'; return; } s.remove(); re(); }; }
  };
}
const pctOf = (n) => (n * 100 / 6236);
const pctTxt = (n) => arN(pctOf(n).toFixed(1)) + '٪';
async function teacherHome(page = 20) {
  const box = document.getElementById('qbody'); if (!box) return;
  const [ov, db, en] = await Promise.all([sb.rpc('students_overview'), sb.rpc('teacher_dashboard'), enrolledIds(S.sub)]);
  if (ov.error) { box.innerHTML = '<div class="empty">مقدرتش أحمّل الطلاب</div>'; return; }
  const dm = {}; for (const x of db.data || []) dm[x.id] = x;
  const all = ov.data.filter((x) => en.has(x.id)).map((x) => ({ ...x, ...(dm[x.id] || {}), memorized: x.memorized }));
  const late = (x) => x.days_since == null || x.days_since >= 7, due = (x) => (x.due_ayahs || 0) > 0;
  const nLate = all.filter(late).length, nDue = all.filter(due).length, tot = all.reduce((a, x) => a + x.memorized, 0);
  const f = S.qf || 'all', data = f === 'late' ? all.filter(late) : f === 'due' ? all.filter(due) : all;
  S.qw = {}; for (const x of all) S.qw[x.id] = x.wanas_id;
  const chip = (k, t, on) => `<button class="qchip" data-f="${k}" style="border:0;border-radius:16px;padding:6px 12px;font-size:13px;background:${on ? 'var(--v)' : 'var(--chip)'};color:${on ? '#fff' : 'var(--v)'}">${t}</button>`;
  const head = all.length ? `<div style="padding:12px 14px 0"><div style="color:var(--mu);font-size:13px">متوسط الحفظ في كل الطلاب</div><div style="font-size:26px;font-weight:800;color:var(--vt)">${arN((tot * 100 / (all.length * 6236)).toFixed(1))}٪ <small style="font-size:13px;font-weight:400;color:var(--mu)">(${arN(all.length)} طالب)</small></div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0">${chip('all', 'الكل', f === 'all')}${chip('late', 'متأخرين ' + arN(nLate), f === 'late')}${chip('due', 'مراجعة مستحقة ' + arN(nDue), f === 'due')}</div></div>` : '';
  const rows = data.slice(0, page).map((s) => `<div class="row" data-id="${s.id}" data-n="${esc(s.name)}">${avatar(s, '', true)}<div class="mid"><div class="nm">${esc(s.name)}</div>
    <div class="ls">${esc(s.wanas_id)} · محفوظ ${pctTxt(s.memorized)}${s.revision ? ' · مراجعة ' + arN(s.revision) + ' آية' : ''}</div>
    <div style="font-size:12px;margin:2px 0;color:${late(s) ? '#dc2626' : 'var(--mu)'}">${s.days_since == null ? 'لسه ماسمّعش' : s.days_since === 0 ? 'سمّع النهارده' : 'آخر تسميع من ' + arN(s.days_since) + ' يوم'}${due(s) ? ' · <b style="color:#dc2626">مراجعة مستحقة ' + arN(s.due_ayahs) + ' آية</b>' : ''}</div>
    <div class="qbar">${pbar(s.memorized, s.learning, s.revision, 6236)}</div></div></div>`).join('');
  box.innerHTML = `${head}<div class="list">${rows || '<div class="empty">لسه مفيش طلاب. دوس على ＋ وضيف طالب بالـ ونس ID بتاعه.</div>'}${data.length > page ? `<button class="btn sec" id="more" style="margin:10px">عرض الباقي (${arN(data.length - page)})</button>` : ''}</div><button class="fab" id="qadd" title="إضافة طالب">${IC('plus')}</button>`;
  box.querySelectorAll('.row').forEach((r) => (r.onclick = () => studentProgress(r.dataset.id, r.dataset.n, true)));
  box.querySelectorAll('.qchip').forEach((c) => (c.onclick = () => { S.qf = c.dataset.f; teacherHome(); }));
  const mb = box.querySelector('#more'); if (mb) mb.onclick = () => teacherHome(page + 20);
  box.querySelector('#qadd').onclick = addStudentSheet;
}
function pbar(m, l, r, tot) {
  const w = (x) => (x * 100 / tot).toFixed(2) + '%';
  return `<div style="display:flex;height:7px;border-radius:5px;background:var(--trk);overflow:hidden"><i style="width:${w(m)};background:${QST.memorized[1]}"></i><i style="width:${w(l)};background:${QST.learning[1]}"></i><i style="width:${w(r)};background:${QST.revision[1]}"></i></div>`;
}
function addStudentSheet() {
  const s = sheet(`<h3>إضافة طالب</h3><label class="field"><span>ونس ID بتاع الطالب (لازم يكون عامل حساب)</span><input id="sid" dir="ltr" autocapitalize="none" spellcheck="false"></label><div class="err" id="aerr"></div><button class="btn" id="go">إضافة</button>`);
  s.querySelector('#go').onclick = async () => {
    const e = s.querySelector('#aerr'); e.textContent = '';
    const { data: er, error } = await sb.rpc('enroll_student', { p_wanas_id: s.querySelector('#sid').value });
    if (error) { e.textContent = /not_found/.test(error.message) ? 'مفيش حد بالـ ID ده' : /self/.test(error.message) ? 'ده الـ ID بتاعك' : 'مقدرتش أضيفه'; return; }
    if (S.sub) await sb.rpc('subject_enroll', { p_subject: S.sub, p_student: er.id });
    s.remove(); openSubject();
  };
}
async function studentProgress(sid, name, teacher) {
  const box = document.getElementById('qbody'); if (!box) return;
  box.innerHTML = '<div class="sk"><i></i><i></i><i></i></div>';
  const { data, error } = await sb.rpc('progress_summary', { p_student: sid, p_teacher: (curSub() || {}).teacher_id || null });
  if (error) { box.innerHTML = '<div class="empty">مقدرتش أحمّل التقدم</div>'; return; }
  const per = {}; let tm = 0, tl = 0, tr = 0;
  for (const r of data) { (per[r.surah] = per[r.surah] || {})[r.status] = r.cnt; if (r.status === 'memorized') tm += r.cnt; else if (r.status === 'learning') tl += r.cnt; else tr += r.cnt; }
  const surahs = S.qs.map((q) => { const p = per[q.num] || {}; return `<div class="row qs" data-n="${q.num}"><div class="mid"><div class="nm">${arN(q.num)}. ${esc(q.name_ar)}</div><div class="ls">${arN(q.ayahs)} آية${p.memorized ? ' · محفوظ ' + arN(p.memorized) : ''}${p.learning ? ' · بيحفظ ' + arN(p.learning) : ''}${p.revision ? ' · مراجعة ' + arN(p.revision) : ''}</div><div class="qbar">${pbar(p.memorized || 0, p.learning || 0, p.revision || 0, q.ayahs)}</div></div></div>`; }).join('');
  box.innerHTML = `<div style="padding:12px 14px"><div style="display:flex;align-items:center;gap:8px">${teacher ? `<button class="ib" id="sback" style="color:var(--vt);background:var(--vl)">${IC('back')}</button>` : ''}<b style="font-size:18px;flex:1">${esc(name)}</b>${teacher ? `<button class="btn" id="schat" style="width:auto;padding:8px 16px;margin:0;display:inline-flex;align-items:center;gap:6px">${IC('chat')} محادثة</button>` : ''}</div>
    <div style="margin:10px 0"><div style="font-size:30px;font-weight:800;color:var(--vt)">${pctTxt(tm)}</div><div style="color:var(--mu)">محفوظ ${arN(tm)} من ٦٢٣٦ آية</div>${pbar(tm, tl, tr, 6236)}
    <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:13px;margin-top:6px">${Object.entries(QST).map(([k, v]) => `<span><i style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${v[1]}"></i> ${v[0]}${k === 'learning' ? ' ' + arN(tl) : k === 'revision' ? ' ' + arN(tr) : ''}</span>`).join('')}</div></div></div>
    <div style="padding:0 14px 6px;display:flex;align-items:center"><b style="flex:1">جلسات التسميع</b>${teacher ? '<button class="btn" id="newrc" style="width:auto;padding:8px 16px;margin:0">＋ تسميع جديد</button>' : ''}</div>
    <div id="rchist" style="padding:0 14px 10px"><div class="sk" style="padding:4px 0"><i style="height:48px"></i></div></div>
    <div style="padding:0 14px 6px"><b>طابور المراجعة</b> <small style="color:var(--mu)">(محفوظ من أكتر من ٣٠ يوم ومتسمّعش)</small></div>
    <div id="rqlist" style="padding:0 14px 10px"><div class="sk" style="padding:4px 0"><i style="height:48px"></i></div></div>
    <div style="padding:0 14px"><b>الخريطة</b></div>
    <div class="list">${surahs}</div>`;
  if (teacher) { box.querySelector('#schat').onclick = async () => {
      try {
        if (!byId(sid)) { const { error } = await sb.rpc('add_contact', { p_wanas_id: S.qw[sid] }); fail(error); await refreshContacts(); }
        S.view = null; openChat(sid);
      } catch { toast('مقدرتش أفتح المحادثة، جرّب تاني'); }
    };
    box.querySelector('#sback').onclick = () => teacherHome(); box.querySelector('#newrc').onclick = () => recitationSheet(sid, name); }
  loadRecitations(sid, name, teacher); loadRevision(sid);
  box.querySelectorAll('.qs').forEach((r) => (r.onclick = () => surahSheet(sid, name, teacher, +r.dataset.n)));
}
async function loadRevision(sid) {
  const el = document.getElementById('rqlist'); if (!el) return;
  const { data, error } = await sb.rpc('revision_due', { p_student: sid, p_teacher: (curSub() || {}).teacher_id || null });
  if (error) { el.innerHTML = '<div class="empty" style="padding:12px">مقدرتش أحمّل المراجعة</div>'; return; }
  if (!data.length) { el.innerHTML = '<div class="empty" style="padding:12px">مفيش مراجعة مستحقة ✅</div>'; return; }
  const nm = (n) => (S.qs.find((x) => x.num === n) || {}).name_ar || n;
  el.innerHTML = data.slice(0, 30).map((r) => `<div style="background:var(--revbg);border-radius:12px;padding:8px 12px;margin-bottom:6px;display:flex;gap:8px"><b style="flex:1">${esc(nm(r.surah))} ${arN(r.from_ayah)}–${arN(r.to_ayah)} <small style="font-weight:400">(${arN(r.cnt)} آية)</small></b><span style="color:var(--mu);font-size:13px">من ${arN(Math.max(1, Math.round((Date.now() - new Date(r.since + 'T12:00:00')) / 86400000)))} يوم</span></div>`).join('') + (data.length > 30 ? '<div style="color:var(--mu);font-size:13px">وفيه غيرهم…</div>' : '') + '<div style="color:var(--mu);font-size:12px">لما تسمّع المدى ده في جلسة تسميع بيتشال من الطابور.</div>';
}
const fmtDate = (d) => new Date(d + 'T12:00:00').toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' });
async function loadRecitations(sid, name, teacher, lim = 15) {
  const el = document.getElementById('rchist'); if (!el) return;
  const { data, error } = await sb.from('recitations').select('id,session_date,surah,from_ayah,to_ayah,grade,mistakes,notes').eq('student_id', sid).eq('teacher_id', (curSub() || {}).teacher_id || S.me.id).order('session_date', { ascending: false }).order('id', { ascending: false }).limit(lim + 1);
  if (error) { el.innerHTML = '<div class="empty" style="padding:12px">مقدرتش أحمّل الجلسات</div>'; return; }
  if (!data.length) { el.innerHTML = '<div class="empty" style="padding:12px">لسه مفيش جلسات تسميع</div>'; return; }
  const nm = (n) => (S.qs.find((x) => x.num === n) || {}).name_ar || n;
  el.innerHTML = data.slice(0, lim).map((r) => `<div class="rcard" style="background:var(--vl);border-radius:12px;padding:10px 12px;margin-bottom:8px">
    <div style="display:flex;gap:8px"><b style="flex:1">${esc(nm(r.surah))} ${arN(r.from_ayah)}–${arN(r.to_ayah)}</b><span style="color:var(--mu);font-size:13px">${fmtDate(r.session_date)}</span></div>
    <div style="font-size:14px;margin-top:3px">${r.grade != null ? 'التقدير: <b>' + arN(r.grade) + '/١٠</b> · ' : ''}الأخطاء: <b>${arN(r.mistakes)}</b></div>
    ${r.notes ? `<div style="font-size:14px;color:var(--tx);opacity:.85;margin-top:3px;white-space:pre-wrap">${esc(r.notes)}</div>` : ''}
    ${teacher ? `<button class="link" data-del="${r.id}" style="margin:4px 0 0;color:#c0262d;font-size:13px">مسح</button>` : ''}</div>`).join('') + (data.length > lim ? '<button class="btn sec" id="rcmore" style="margin:0">عرض أقدم</button>' : '');
  el.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => { if (!confirm('تمسح الجلسة دي؟')) return; const { error } = await sb.rpc('delete_recitation', { p_id: +b.dataset.del }); if (error) return toast('مقدرتش أمسح'); loadRecitations(sid, name, teacher, lim); }));
  const m = el.querySelector('#rcmore'); if (m) m.onclick = () => loadRecitations(sid, name, teacher, lim + 15);
}
function recitationSheet(sid, name) {
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const s = sheet(`<h3>تسميع جديد · ${esc(name)}</h3>
    <label class="field"><span>التاريخ</span><input id="rd" type="date" value="${today}"></label>
    <label class="field"><span>السورة</span><select id="rs">${S.qs.map((q) => `<option value="${q.num}">${arN(q.num)}. ${esc(q.name_ar)} (${arN(q.ayahs)})</option>`).join('')}</select></label>
    <div style="display:flex;gap:8px"><label class="field" style="flex:1"><span>من آية</span><input id="rf" type="number" min="1" value="1"></label><label class="field" style="flex:1"><span>لآية</span><input id="rt" type="number" min="1" value="1"></label></div>
    <div style="display:flex;gap:8px"><label class="field" style="flex:1"><span>التقدير (٠ لـ ١٠)</span><input id="rg" type="number" min="0" max="10" value="8"></label><label class="field" style="flex:1"><span>عدد الأخطاء</span><input id="rm" type="number" min="0" max="500" value="0"></label></div>
    <label class="field"><span>ملاحظات</span><textarea id="rn" rows="2" maxlength="1000"></textarea></label>
    <label style="display:flex;gap:8px;align-items:center;margin:6px 0"><input type="checkbox" id="rk"> علّم المدى ده «محفوظ» في الخريطة</label>
    <div class="err" id="aerr"></div><button class="btn" id="go">حفظ الجلسة</button><button class="btn sec" id="cl">إلغاء</button>`);
  const rs = s.querySelector('#rs'), rt = s.querySelector('#rt');
  const maxA = () => S.qs.find((q) => q.num === +rs.value).ayahs;
  rs.onchange = () => { rt.value = Math.min(+rt.value || 1, maxA()); };
  s.querySelector('#cl').onclick = () => s.remove();
  s.querySelector('#go').onclick = async () => {
    const e = s.querySelector('#aerr'), go = s.querySelector('#go'); e.textContent = '';
    const surah = +rs.value, f = +s.querySelector('#rf').value, t = +rt.value, g = s.querySelector('#rg').value, m = +s.querySelector('#rm').value;
    if (!(f >= 1 && t <= maxA() && f <= t)) { e.textContent = 'المدى غلط (١ لـ ' + arN(maxA()) + ')'; return; }
    if (g === '' || +g < 0 || +g > 10) { e.textContent = 'التقدير من ٠ لـ ١٠'; return; }
    go.disabled = true;
    const { error } = await sb.rpc('add_recitation', { p_student: sid, p_date: s.querySelector('#rd').value || null, p_surah: surah, p_from: f, p_to: t, p_grade: +g, p_mistakes: m, p_notes: s.querySelector('#rn').value });
    if (error) { e.textContent = 'مقدرتش أحفظ'; go.disabled = false; return; }
    if (s.querySelector('#rk').checked) await sb.rpc('set_progress', { p_student: sid, p_surah: surah, p_from: f, p_to: t, p_status: 'memorized' });
    s.remove(); studentProgress(sid, name, true);
  };
}
const RECS = [['Husary_128kbps', 'الشيخ الحصري'], ['Alafasy_128kbps', 'الشيخ مشاري العفاسي'], ['Abdul_Basit_Murattal_192kbps', 'الشيخ عبد الباسط (مرتل)'], ['Minshawy_Murattal_128kbps', 'الشيخ المنشاوي (مرتل)']];
function quranPlayer(s, num, total) {
  const au = new Audio(); au.preload = 'auto'; let cur = 1, on = false;
  const sel = s.querySelector('#qr'), btn = s.querySelector('#qpl'), now = s.querySelector('#qnow'), rep = s.querySelector('#qrep');
  sel.value = localStorage.getItem('wanas_rec') || RECS[0][0];
  const url = (a) => `https://everyayah.com/data/${sel.value}/${String(num).padStart(3, '0')}${String(a).padStart(3, '0')}.mp3`;
  const ui = () => { btn.textContent = on ? '⏸ إيقاف' : '▶ استمع للسورة'; now.textContent = on ? `آية ${arN(cur)} من ${arN(total)}` : ''; s.querySelectorAll('[data-a]').forEach((c) => { c.style.outline = on && +c.dataset.a === cur ? '2px solid var(--v)' : ''; }); };
  const fail = () => { on = false; ui(); now.textContent = 'مقدرتش أشغّل الصوت، اتأكد من النت'; };
  const play = (a) => { cur = a; on = true; au.src = url(a); au.play().catch(fail); ui(); const c = s.querySelector(`[data-a="${a}"]`); if (c) c.scrollIntoView({ block: 'nearest' }); };
  au.onended = () => { if (!s.isConnected) return; if (rep.checked) return play(cur); if (cur < total) play(cur + 1); else { on = false; ui(); } };
  au.onerror = fail;
  btn.onclick = () => { if (on) { au.pause(); on = false; ui(); } else play(cur); };
  sel.onchange = () => { localStorage.setItem('wanas_rec', sel.value); if (on) play(cur); };
  s.querySelectorAll('[data-a]').forEach((c) => { c.style.cursor = 'pointer'; c.addEventListener('click', () => play(+c.dataset.a)); });
  new MutationObserver((m, ob) => { if (!s.isConnected) { au.pause(); au.removeAttribute('src'); ob.disconnect(); } }).observe(document.body, { childList: true });
}
async function surahSheet(sid, name, teacher, num) {
  const q = S.qs.find((x) => x.num === num);
  const { data, error } = await sb.from('quran_progress').select('ayah,status').eq('student_id', sid).eq('surah', num).limit(300);
  if (error) return toast('مقدرتش أحمّل السورة');
  const st = {}; for (const r of data) st[r.ayah] = r.status;
  let cells = ''; for (let a = 1; a <= q.ayahs; a++) { const c = st[a] ? QST[st[a]][1] : 'var(--trk)'; cells += `<span data-a="${a}" style="display:inline-block;min-width:30px;text-align:center;padding:4px 2px;margin:2px;border-radius:6px;font-size:12px;background:${c};color:${st[a] ? '#fff' : '#444'}">${arN(a)}</span>`; }
  const s = sheet(`<h3>${esc(q.name_ar)} · ${arN(q.ayahs)} آية</h3><div style="background:var(--vl);border-radius:16px;padding:10px;margin-bottom:10px"><select id="qr" style="width:100%;padding:8px;border-radius:10px;margin-bottom:8px">${RECS.map((r) => `<option value="${r[0]}">${r[1]}</option>`).join('')}</select><div style="display:flex;gap:8px;align-items:center"><button class="btn" id="qpl" style="flex:1;margin:0">▶ استمع للسورة</button><label style="font-size:13px;white-space:nowrap"><input type="checkbox" id="qrep"> كرّر الآية</label></div><div id="qnow" style="font-size:13px;color:var(--vt);margin-top:6px;min-height:16px"></div><div style="font-size:11px;color:var(--mu)">اضغط على رقم الآية عشان تسمعها. الصوت من everyayah.com</div></div><div style="max-height:34vh;overflow:auto;direction:rtl">${cells}</div>
    ${teacher ? `<div style="display:flex;gap:8px;align-items:center;margin:12px 0"><label style="flex:1">من آية<input id="rf" type="number" min="1" max="${q.ayahs}" value="1" style="width:100%"></label><label style="flex:1">لآية<input id="rt" type="number" min="1" max="${q.ayahs}" value="${q.ayahs}" style="width:100%"></label></div>
    <div class="err" id="aerr"></div>
    <button class="btn" data-s="memorized" style="background:${QST.memorized[1]}">محفوظ</button>
    <button class="btn" data-s="learning" style="background:${QST.learning[1]}">بيحفظ</button>
    <button class="btn" data-s="revision" style="background:${QST.revision[1]}">محتاج مراجعة</button>
    <button class="btn sec" data-s="none">مسح الحالة</button>` : '<p style="color:var(--mu)">الأخضر محفوظ، البرتقالي بيحفظ، الأحمر مراجعة.</p>'}
    <button class="btn sec" id="cl">قفل</button>`);
  s.querySelector('#cl').onclick = () => s.remove();
  s.querySelectorAll('[data-s]').forEach((b) => (b.onclick = async () => {
    const f = +s.querySelector('#rf').value, t = +s.querySelector('#rt').value, e = s.querySelector('#aerr');
    if (!(f >= 1 && t <= q.ayahs && f <= t)) { e.textContent = 'المدى غلط (١ لـ ' + arN(q.ayahs) + ')'; return; }
    const { error } = await sb.rpc('set_progress', { p_student: sid, p_surah: num, p_from: f, p_to: t, p_status: b.dataset.s });
    if (error) { e.textContent = 'مقدرتش أحفظ'; return; }
    s.remove(); studentProgress(sid, name, true).then(() => surahSheet(sid, name, true, num));
  }));
  quranPlayer(s, num, q.ayahs);
}

function renderListIf() { if (!S.cur && S.me && S.view !== 'quran') renderList(); }
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
      <button class="ib" id="qb" title="المنصة التعليمية">${IC('cap')}</button><button class="ib" id="me" title="حسابي">${avatar(S.me, 'sm')}</button></div>
    <div class="wrap">
      <div class="list">${rows || '<div class="empty">لسه معندكش محادثات.<br>دوس على <b>＋</b> وضيف حد بالـ ونس ID بتاعه.</div>'}</div>
      <button class="fab" id="add" title="إضافة جهة اتصال">${IC('plus')}</button>
    </div>
  </div>`;
  updateConn();
  document.querySelectorAll('.row').forEach((r) => (r.onclick = () => openChat(r.dataset.id)));
  document.getElementById('add').onclick = addSheet;
  document.getElementById('me').onclick = profileSheet;
  document.getElementById('qb').onclick = renderQuran;
  pushBanner();
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
    <label class="field"><span>نبذة عنك</span><textarea id="pb" rows="2" maxlength="160" placeholder="اكتب سطر أو اتنين عن نفسك">${esc(S.me.bio)}</textarea></label>
    <div class="err" id="perr"></div>
    <button class="btn" id="save">حفظ</button>
    <button class="btn sec" id="notif">${S.pushOn ? '🔔 الإشعارات شغالة (دوس للإيقاف)' : '🔔 تفعيل الإشعارات'}</button>
    ${S.isAdmin ? '<button class="btn sec" id="stats">📊 لوحة الإحصائيات</button>' : ''}
    ${S.isAdmin ? '<button class="btn sec" id="usersb">👥 كل المستخدمين</button>' : ''}
    <button class="btn sec" id="cpw">🔑 تغيير الباسورد</button>
    <button class="btn sec" id="rcg">🛟 كود استرجاع جديد</button>
    <button class="btn sec" id="out" style="color:#c0262d">تسجيل خروج</button>
    <button class="btn sec" id="del" style="color:#c0262d">🗑 مسح حسابي نهائي</button>`);
  const file = s.querySelector('#file'); let photo = null;
  s.querySelector('#ph').onclick = () => file.click();
  file.onchange = async () => { if (file.files[0]) { photo = await resizeImage(file.files[0], 480, 0.82); s.querySelector('#pav').innerHTML = avatar({ ...S.me, photo }); } };
  s.querySelector('#save').onclick = async () => {
    try { const name = s.querySelector('#pn').value.trim(); if (!name) throw new Error('bad_name');
      const { error } = await sb.from('profiles').update({ name: name.slice(0, 40), bio: s.querySelector('#pb').value.trim().slice(0, 160) || null, ...(photo ? { photo } : {}) }).eq('id', S.me.id); fail(error);
      S.me = await loadMe(); s.remove(); render(); }
    catch (x) { s.querySelector('#perr').textContent = ERR[x.message] || 'مقدرتش أحفظ'; }
  };
  s.querySelector('#notif').onclick = async () => {
    const b = s.querySelector('#notif');
    if (S.pushOn) { await disablePush(); b.textContent = '🔔 تفعيل الإشعارات'; return; }
    if (await enablePush()) b.textContent = '🔔 الإشعارات شغالة (دوس للإيقاف)';
  };
  if (s.querySelector('#stats')) s.querySelector('#stats').onclick = () => { s.remove(); statsSheet(); };
  if (s.querySelector('#usersb')) s.querySelector('#usersb').onclick = () => { s.remove(); usersSheet(); };
  s.querySelector('#out').onclick = () => { s.remove(); logout(); };
  s.querySelector('#cpw').onclick = () => { s.remove(); acctSheet('change'); };
  s.querySelector('#rcg').onclick = () => { s.remove(); acctSheet('regen'); };
  s.querySelector('#del').onclick = () => { s.remove(); acctSheet('delete'); };
}
function acctSheet(kind) {
  const T = { change: 'تغيير الباسورد', regen: 'كود استرجاع جديد', delete: 'مسح الحساب نهائي' }[kind];
  const s = sheet(`<h3>${T}</h3>
    ${kind === 'delete' ? '<p style="margin:0 0 10px;color:#c0262d">هيتمسح حسابك ورسايلك ومحادثاتك وصورك من السيرفر ومينفعش نرجّعهم.</p>' : ''}
    ${kind === 'regen' ? '<p style="margin:0 0 10px">الكود القديم هيتلغي.</p>' : ''}
    <label class="field"><span>الباسورد الحالي</span><input id="cp" type="password" dir="ltr"></label>
    ${kind === 'change' ? '<label class="field"><span>الباسورد الجديد</span><input id="np" type="password" dir="ltr" minlength="6"></label>' : ''}
    <div class="err" id="aerr"></div>
    <button class="btn" id="go" ${kind === 'delete' ? 'style="background:#c0262d"' : ''}>${kind === 'delete' ? 'امسح حسابي' : 'تأكيد'}</button>
    <button class="btn sec" id="cl">إلغاء</button>`);
  s.querySelector('#cl').onclick = () => s.remove();
  s.querySelector('#go').onclick = async () => {
    const go = s.querySelector('#go'), err = s.querySelector('#aerr'); go.disabled = true; err.textContent = '';
    try {
      const password = s.querySelector('#cp').value;
      if (kind === 'change') { await signupCall({ action: 'change', password, newPassword: s.querySelector('#np').value }, true); const npw = s.querySelector('#np').value; await sb.auth.signInWithPassword({ email: emailOf(S.me.wanasId), password: npw }); s.remove(); toast('الباسورد اتغيّر'); }
      else if (kind === 'regen') { const j = await signupCall({ action: 'regen', password }, true); s.remove(); codeSheet(j.code, 'كود استرجاع جديد (القديم اتلغى)'); }
      else { await signupCall({ action: 'delete', password }, true); s.remove(); try { await disablePush(); } catch {} teardownRealtime(); try { await sb.auth.signOut({ scope: 'local' }); } catch {} S.me = null; S.cur = null; S.contacts = []; S.msgs = {}; S.isAdmin = false; render(); toast('حسابك اتمسح'); }
    } catch (x) { err.textContent = ERR[x.message] || ERR.server; go.disabled = false; }
  };
}

function hl(text, q) {
  const t = String(text), i = t.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return esc(t.slice(0, 120));
  const a = Math.max(0, i - 30), b = Math.min(t.length, i + q.length + 60);
  return (a > 0 ? '…' : '') + esc(t.slice(a, i)) + '<mark>' + esc(t.slice(i, i + q.length)) + '</mark>' + esc(t.slice(i + q.length, b)) + (b < t.length ? '…' : '');
}
function searchSheet(id) {
  const c = byId(id); if (!c) return;
  const s = sheet(`<h3>بحث في المحادثة مع ${esc(c.name)}</h3>
    <label class="field"><input id="sq" maxlength="60" placeholder="اكتب كلمة…" autocomplete="off"></label>
    <div id="sr" style="max-height:55vh;overflow:auto"></div>`);
  const sq = s.querySelector('#sq'), sr = s.querySelector('#sr'); let tm = null, seq = 0;
  const me = S.me.id;
  const pair = `and(from_id.eq.${me},to_id.eq.${id}),and(from_id.eq.${id},to_id.eq.${me})`;
  sq.focus();
  sq.oninput = () => { clearTimeout(tm); tm = setTimeout(run, 300); };
  async function run() {
    const q = sq.value.trim(), my = ++seq;
    if (q.length < 2) { sr.innerHTML = q ? '<div class="empty">اكتب حرفين على الأقل</div>' : ''; return; }
    sr.innerHTML = '<div class="empty">بدوّر…</div>';
    const { data, error } = await sb.from('messages').select('id,from_id,body,created_at').or(pair).eq('kind', 'text')
      .ilike('body', '%' + q.replace(/[\\%_]/g, '\\$&') + '%').order('id', { ascending: false }).limit(40);
    if (my !== seq) return;
    if (error) { sr.innerHTML = '<div class="empty">البحث مشتغلش، جرّب تاني</div>'; return; }
    if (!data.length) { sr.innerHTML = '<div class="empty">مفيش نتايج</div>'; return; }
    sr.innerHTML = data.map((m) => `<div class="row sres" data-id="${m.id}"><div class="mid"><div class="nm">${m.from_id === me ? 'انت' : esc(c.name)}</div><div class="ls" style="white-space:normal">${hl(m.body, q)}</div></div><div class="tm">${fmtDay(m.created_at)}<br>${fmtTime(m.created_at)}</div></div>`).join('');
    sr.querySelectorAll('.sres').forEach((el) => (el.onclick = () => contextSheet(id, el.dataset.id, q)));
  }
}
async function contextSheet(id, mid, q) {
  const c = byId(id), me = S.me.id;
  const pair = `and(from_id.eq.${me},to_id.eq.${id}),and(from_id.eq.${id},to_id.eq.${me})`;
  const [a, b] = await Promise.all([
    sb.from('messages').select('id,from_id,kind,body,created_at').or(pair).lt('id', mid).order('id', { ascending: false }).limit(8),
    sb.from('messages').select('id,from_id,kind,body,created_at').or(pair).gte('id', mid).order('id', { ascending: true }).limit(9)]);
  if (a.error || b.error) return toast('مقدرتش أفتح الرسالة');
  const list = [...(a.data || []).reverse(), ...(b.data || [])];
  const s = sheet(`<h3>الرسالة في سياقها</h3><div class="ctxl" style="max-height:60vh;overflow:auto;display:flex;flex-direction:column;gap:4px;background:var(--vl);padding:10px;border-radius:12px">${list.map((m) => {
    const mine = m.from_id === me, txt = m.kind === 'text' ? esc(m.body) : m.kind === 'image' ? '📷 صورة' : m.kind === 'voice' ? '🎤 رسالة صوتية' : '📞 مكالمة';
    return `<div class="b ${mine ? 'me' : 'them'}" ${String(m.id) === String(mid) ? 'id="hit" style="outline:3px solid #ffb703"' : ''}>${txt}<div class="mt">${fmtDay(m.created_at)} ${fmtTime(m.created_at)}</div></div>`; }).join('')}</div>
    <button class="btn sec" id="cl" style="margin-top:10px">قفل</button>`);
  s.querySelector('#cl').onclick = () => s.remove();
  const h = s.querySelector('#hit'); if (h) h.scrollIntoView({ block: 'center' });
}

function contactSheet(id) {
  const c = byId(id); if (!c) return;
  const s = sheet(`<h3>معلومات الشخص</h3><div class="prof">
    ${avatar(c, 'lg', true)}
    <b style="font-size:20px">${esc(c.name)}</b>
    <span class="idbox">${esc(c.wanasId)}</span>
    <small style="color:var(--mu)">${esc(lastSeenText(c))}</small></div>
    <div class="about"><span>النبذة</span><p>${c.bio ? esc(c.bio) : '<i>لسه مكتبش نبذة</i>'}</p></div>
    <button class="btn sec" id="mt">${S.mutes.has(id) ? '🔔 إلغاء كتم الإشعارات' : '🔕 كتم إشعارات المحادثة دي'}</button>
    <button class="btn sec" id="bl" style="color:#c0262d">${S.blocked.has(id) ? '✅ إلغاء الحظر' : '🚫 حظر'}</button>
    <button class="btn sec" id="cl">قفل</button>`);
  s.querySelector('#bl').onclick = async () => {
    const on = !S.blocked.has(id);
    if (on && !confirm('تحظر ' + c.name + '؟ مش هيقدر يبعتلك رسايل ولا يكلمك، ومش هتقدر تبعتله.')) return;
    if (await setBlock(id, on)) { s.remove(); if (S.cur === id) renderChat(); toast(on ? 'اتحظر' : 'اتفك الحظر'); }
  };
  s.querySelector('#mt').onclick = async () => { await toggleMute(id); s.remove(); toast(S.mutes.has(id) ? 'المحادثة اتكتمت، مش هتوصلك إشعارات منها' : 'الإشعارات رجعت للمحادثة دي'); };
  s.querySelector('#cl').onclick = () => s.remove();
  const sav = s.querySelector('.av'); if (sav && c.photo) { sav.style.cursor = 'pointer'; sav.onclick = () => openViewer(c.photo); }
}


// ---------- wallpapers (private table: only the owner can read or write their rows) ----------
const WP_ALL = '00000000-0000-0000-0000-000000000000';
const WP_PRESETS = [['lilac', 'بنفسجي'], ['sun', 'دهبي'], ['mint', 'نعناع'], ['sky', 'سما'], ['rose', 'ورد'], ['dots', 'نقط'], ['lines', 'خطوط'], ['night', 'ليلي']];
async function loadWallpapers() {
  S.wp = { all: null, chats: {} };
  const { data } = await sb.from('wallpapers').select('chat_id,value');
  (data || []).forEach((r) => { if (r.chat_id === WP_ALL) S.wp.all = r.value; else S.wp.chats[r.chat_id] = r.value; });
}
const wpFor = (id) => S.wp.chats[id] ?? S.wp.all;
function applyWallpaper() {
  const el = document.getElementById('msgs'); if (!el) return;
  const v = wpFor(S.cur);
  el.removeAttribute('data-wp'); el.style.background = '';
  if (!v) return;
  if (v.startsWith('p:')) el.dataset.wp = v.slice(2);
  else { el.dataset.wp = 'img'; el.style.background = `linear-gradient(rgba(255,255,255,.25),rgba(255,255,255,.25)), url("${v}") center/cover fixed`; }
}
async function saveWallpaper(scopeAll, value) {
  const chat_id = scopeAll ? WP_ALL : S.cur;
  if (value == null) {
    const { error } = await sb.from('wallpapers').delete().eq('chat_id', chat_id); fail(error);
    if (scopeAll) S.wp.all = null; else delete S.wp.chats[chat_id];
  } else {
    const { error } = await sb.from('wallpapers').upsert({ chat_id, value }, { onConflict: 'user_id,chat_id' }); fail(error);
    if (scopeAll) S.wp.all = value; else S.wp.chats[chat_id] = value;
  }
  applyWallpaper();
}
function wallpaperSheet() {
  const s = sheet(`<h3>خلفية المحادثة</h3>
    <div class="seg"><label><input type="radio" name="sc" value="one" checked> المحادثة دي بس</label><label><input type="radio" name="sc" value="all"> كل المحادثات</label></div>
    <div class="wps">${WP_PRESETS.map(([id, n]) => `<button type="button" class="wpsw" data-wp="${id}" data-id="${id}" title="${n}"><span>${n}</span></button>`).join('')}</div>
    <div class="err" id="werr"></div>
    <button class="btn sec" id="wup">📷 صورة من الموبايل</button><input type="file" id="wfile" accept="image/*" class="hidden">
    <button class="btn sec" id="wno">الخلفية الأصلية</button>
    <button class="btn" id="wok">تمام</button>`);
  const scopeAll = () => s.querySelector('input[name=sc]:checked').value === 'all', err = s.querySelector('#werr');
  const run = async (v) => { err.textContent = ''; try { await saveWallpaper(scopeAll(), v); } catch { err.textContent = 'مقدرتش أحفظ الخلفية، جرّب تاني'; } };
  s.querySelectorAll('.wpsw').forEach((b) => (b.onclick = () => run('p:' + b.dataset.id)));
  s.querySelector('#wno').onclick = () => run(null);
  s.querySelector('#wok').onclick = () => s.remove();
  s.querySelector('#wup').onclick = () => s.querySelector('#wfile').click();
  s.querySelector('#wfile').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { const d = await resizeImage(f, 900, 0.6); if (d.length > 350000) { err.textContent = 'الصورة كبيرة، جرّب صورة تانية'; return; } await run(d); } catch { err.textContent = 'مقدرتش أقرا الصورة'; }
    e.target.value = '';
  };
}


// ---------- owner-only users list (SECURITY DEFINER admin_users: no passwords, bios, contacts or message bodies) ----------
async function usersSheet() {
  const s = sheet('<h3>كل المستخدمين</h3><div id="uinfo" style="color:var(--mu);font-size:13px;margin-bottom:8px"></div><label class="field" style="margin:0 0 8px"><input id="uq" placeholder="دوّر بالاسم أو الـ ID"></label><div id="ul" class="stats" style="max-height:56vh"><div class="sk"><i></i><i></i></div></div><button class="btn sec" id="uc">قفل</button>');
  let rows = [], alive = true, timer = 0;
  const box = s.querySelector('#ul'), info = s.querySelector('#uinfo');
  const draw = () => {
    const q = s.querySelector('#uq').value.trim().toLowerCase();
    const list = rows.filter((u) => !q || u.wanas_id.toLowerCase().includes(q) || (u.name || '').toLowerCase().includes(q));
    const on = rows.filter((u) => u.online).length;
    info.textContent = 'الإجمالي ' + arN(rows.length) + ' · أونلاين دلوقتي ' + arN(on);
    box.innerHTML = list.map((u) => `<div class="row" style="margin:0 0 8px;cursor:default"><div class="av sm">${esc((u.name || u.wanas_id).slice(0, 1))}${u.online ? '<i class="dot"></i>' : ''}</div><div class="mid"><div class="nm">${esc(u.name || '')} <span class="badge" style="margin:0;${u.is_teacher ? '' : 'background:var(--chip);color:var(--vt);box-shadow:none'}">${u.is_teacher ? 'عنده منصة' : 'طالب'}</span></div><div class="ls" dir="ltr" style="text-align:right">${esc(u.wanas_id)}</div><div style="font-size:12px;color:${u.online ? '#16a34a' : 'var(--mu)'}">${u.online ? '● أونلاين' : u.last_seen ? 'آخر ظهور ' + fmtDay(u.last_seen) + ' ' + fmtTime(u.last_seen) : 'ماظهرش'} · سجّل ${fmtDay(u.created_at)} · بعت ${arN(u.sent)} رسالة</div></div></div>`).join('') || '<div class="empty">مفيش نتايج</div>';
  };
  const load = async () => {
    const { data, error } = await sb.rpc('admin_users');
    if (!alive) return;
    if (error || !data) { box.innerHTML = '<p class="err">مفيش صلاحية لعرض القائمة دي</p>'; return; }
    rows = data; draw();
  };
  const close = () => { alive = false; clearInterval(timer); s.remove(); };
  s.querySelector('#uc').onclick = close;
  s.addEventListener('click', (e) => { if (e.target === s) close(); });
  s.querySelector('#uq').oninput = draw;

  await load(); timer = setInterval(() => { if (!s.isConnected) { close(); return; } load(); }, 20000);
}

// ---------- owner-only stats (aggregates from a SECURITY DEFINER function; the server checks the admin list) ----------
async function statsSheet() {
  const s = sheet('<h3>لوحة الإحصائيات</h3><div id="st" class="stats"><div class="sk"><i></i><i></i></div></div><button class="btn" id="stu">كل المستخدمين (القائمة التفصيلية)</button><button class="btn sec" id="stc">قفل</button>');
  s.querySelector('#stc').onclick = () => s.remove();
  s.querySelector('#stu').onclick = () => { s.remove(); usersSheet(); };
  const [a, b] = await Promise.all([sb.rpc('admin_stats'), sb.rpc('admin_platform_stats')]);
  const box = s.querySelector('#st'), data = a.data, p = b.data;
  if (a.error || b.error || !data || !p) { box.innerHTML = '<p class="err">مفيش صلاحية لعرض الإحصائيات دي</p>'; return; }
  const n = (v) => Number(v ?? 0).toLocaleString('ar-EG');
  const card = (t, v) => `<div class="sc"><b>${n(v)}</b><span>${t}</span></div>`;
  const bars = (arr) => { const mx = Math.max(1, ...arr.map((x) => x.n)); return `<div class="bars">${arr.map((x) => `<div class="bc" title="${x.day}: ${x.n}"><i style="height:${Math.round((x.n / mx) * 100)}%"></i><small>${new Date(x.day).getDate()}</small></div>`).join('')}</div>`; };
  box.innerHTML = `<div class="sh">المستخدمين</div><div class="sg">
    ${card('إجمالي المستخدمين', data.users_total)}${card('أونلاين دلوقتي', data.online_now)}
    ${card('معلّمين', p.teachers)}${card('طلاب', p.students)}
    ${card('نشطين آخر ٢٤ ساعة', data.active_24h)}${card('نشطين آخر ٧ أيام', data.active_7d)}
    ${card('تسجيلات النهارده', data.signups_today)}${card('تسجيلات آخر ٧ أيام', data.signups_7d)}
  </div>
  <div class="sh">تسجيلات جديدة (آخر ١٤ يوم)</div>${bars(data.signups_per_day)}
  <div class="sh">الرسايل</div><div class="sg">
    ${card('إجمالي الرسايل', data.messages_total)}${card('رسايل النهارده', data.messages_today)}
    ${card('رسايل آخر ٧ أيام', data.messages_7d)}${card('محادثات', data.conversations)}
    ${card('نصوص', data.messages_text)}${card('صور', data.messages_image)}
    ${card('رسايل صوتية', data.messages_voice)}${card('مستخدمين بعتوا رسالة', data.users_who_sent)}
  </div>
  <div class="sh">رسايل يوميًا (آخر ١٤ يوم)</div>${bars(data.messages_per_day)}
  <div class="sh">المنصة التعليمية</div><div class="sg">
    ${card('مواد', p.subjects)}${card('طلاب مسجّلين في مواد', p.enrolled_students)}
    ${card('جلسات تسميع', p.recitations_total)}${card('تسميع آخر ٧ أيام', p.recitations_7d)}
    ${card('متوسط درجة التسميع', p.avg_recitation_grade)}${card('آيات محفوظة', p.ayahs_memorized)}
    ${card('دروس', p.lessons)}${card('دروس خلّصها الطلاب', p.lessons_done)}
    ${card('كلمات', p.vocab)}${card('كلمات معروفة', p.vocab_known)}
    ${card('جلسات مواد تانية', p.sj_sessions_total)}${card('متوسط درجة الجلسات', p.avg_sj_grade)}
  </div>
  <div class="sh">جلسات المنصة يوميًا (آخر ١٤ يوم)</div>${bars(p.sessions_per_day)}
  <div class="sh">مساحة قاعدة البيانات</div>
  <div class="cap"><i style="width:${Math.min(100, (data.db_mb / data.db_cap_mb) * 100)}%"></i></div>
  <small style="color:var(--mu)">${n(data.db_mb)} من ${n(data.db_cap_mb)} ميجا (الباقة المجانية)</small>`;
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
  const pb = document.getElementById('pushbar'); if (pb) pb.remove();
  const c = byId(S.cur);
  $app.innerHTML = `
  <div class="screen">
    <div class="top"><button class="ib" id="back">${IC('back')}</button><div id="hd" style="display:flex;align-items:center;gap:10px;flex:1"></div><button class="ib" id="srchb" title="بحث في المحادثة">${IC('search')}</button><button class="ib" id="callb" title="مكالمة صوتية">${IC('phone')}</button><button class="ib" id="wpb" title="خلفية المحادثة">${IC('palette')}</button></div>
    <div class="conn ${S.wsOk ? 'hidden' : ''}" id="connbar">بيتصل بالسيرفر…</div>
    <div class="msgs" id="msgs"></div>
    <div class="bar">
      <button class="attach" id="att" title="صورة">${IC('cam')}</button><input type="file" id="img" accept="image/*" class="hidden">
      <textarea id="txt" rows="1" placeholder="اكتب رسالة…"></textarea>
      <button class="attach" id="mic" title="رسالة صوتية">${IC('mic')}</button>
      <button class="send" id="snd">${IC('send')}</button>
    </div>
  </div>`;
  document.getElementById('back').onclick = () => { S.cur = null; renderList(); refreshContacts(); };
  const t = document.getElementById('txt');
  t.oninput = () => { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 120) + 'px' };
  t.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey && !/Mobi|Android/i.test(navigator.userAgent)) { e.preventDefault(); send(); } };
  document.getElementById('callb').onclick = () => startCall(S.cur);
  document.getElementById('wpb').onclick = wallpaperSheet;
  document.getElementById('srchb').onclick = () => searchSheet(S.cur);
  applyWallpaper();
  document.getElementById('snd').onclick = send;
  document.getElementById('mic').onclick = startRecording;
  document.getElementById('att').onclick = () => document.getElementById('img').click();
  document.getElementById('img').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { const d = await resizeImage(f, 1024, 0.7); if (d.length > 450000) return alert('الصورة كبيرة، جرّب صورة أصغر'); transmit('image', d); } catch { alert('مقدرتش أقرا الصورة'); }
    e.target.value = '';
  };
  if (S.blocked.has(S.cur)) {
    document.getElementById('callb').classList.add('hidden');
    document.querySelector('.bar').outerHTML = '<div class="bar" style="flex-direction:column;gap:6px;text-align:center"><span>🚫 انت حاظر الشخص ده. مفيش رسايل ولا مكالمات بينكم.</span><button class="btn sec" id="unb" style="margin:0">إلغاء الحظر</button></div>';
    document.getElementById('unb').onclick = async () => { if (await setBlock(S.cur, false)) renderChat(); };
  }
  renderChatHeader(); renderChatBody(true);
}
function renderChatHeader() {
  const hd = document.getElementById('hd'); const c = byId(S.cur); if (!hd || !c) return;
  hd.style.cursor = 'pointer'; hd.onclick = () => contactSheet(S.cur);
  hd.innerHTML = `${avatar(c, 'sm', true)}<div class="top" style="padding:0;background:none"><h2>${esc(c.name)}<small>${esc(lastSeenText(c))}</small></h2></div>`;
  const hav = hd.querySelector('.av'); if (hav && c.photo) hav.onclick = (e) => { e.stopPropagation(); openViewer(c.photo); };
}
function renderChatBody(scroll) {
  const box = document.getElementById('msgs'); if (!box) return;
  const near = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
  let html = '', lastDay = '';
  for (const m of S.msgs[S.cur] || []) {
    const day = fmtDay(m.created_at || Date.now()); if (day !== lastDay) { html += `<div class="day">${day}</div>`; lastDay = day; }
    const mine = m.from_id === S.me.id;
    if (m.kind === 'call') { html += `<div class="cl">${esc(callLine(m, mine))}<small>${m.created_at ? fmtTime(m.created_at) : ''}</small></div>`; continue; }
    const tick = mine ? (m.pending ? ' 🕓' : m.read_at ? ' ✓✓' : ' ✓') : '';
    html += `<div class="b ${mine ? 'me' : 'them'}">${m.kind === 'image' ? `<img src="${esc(m.body)}" alt="صورة">` : m.kind === 'voice' ? voiceHtml(m) : esc(m.body)}<div class="mt">${m.created_at ? fmtTime(m.created_at) : ''}${tick}</div></div>`;
  }
  box.innerHTML = html;
  box.querySelectorAll('.vn').forEach((el) => { el.querySelector('.vplay').onclick = () => playVoice(el.dataset.i); syncVoice(el); });
  box.querySelectorAll('img').forEach((i) => (i.onclick = () => openViewer(i.src)));
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
    <button class="send" id="rsend" title="إرسال">${IC('send')}</button>`;
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

// ---------- voice calls (WebRTC audio, signaling over Supabase Realtime, RLS per conversation) ----------
const RING_MS = 35000, CONNECT_MS = 25000;
const arDigits = (s) => String(s).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
const FAILMSG = 'المكالمة ماوصلتش. ممكن شبكة الموبايل بتمنع المكالمات المباشرة، جرّب Wi-Fi';
async function getIce() {
  const stun = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  try {
    const r = await Promise.race([sb.functions.invoke('ice'), new Promise((_, rej) => setTimeout(() => rej(new Error('t')), 4000))]);
    if (r && r.data && Array.isArray(r.data.iceServers)) return r.data.iceServers;
  } catch {}
  return stun;
}
// supabase-js builders are lazy: they only send when awaited, so this is async on purpose
async function sigSend(kind, payload, c = S.call) { return await sb.from('call_signals').insert({ to_id: c.peer, call_id: c.id, kind, ...(payload ? { payload } : {}) }); }
function toast(t) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 4500); }
function ring(on) {
  try {
    if (!on) { if (S.ringI) { clearInterval(S.ringI); S.ringI = null; } if (navigator.vibrate) navigator.vibrate(0); return; }
    const beep = () => { try { const a = (S.ac = S.ac || new (window.AudioContext || window.webkitAudioContext)()); const o = a.createOscillator(), g = a.createGain(); o.frequency.value = 520; g.gain.value = 0.12; o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + 0.35); } catch {} if (navigator.vibrate) navigator.vibrate([300, 150, 300]); };
    beep(); S.ringI = setInterval(beep, 2000);
  } catch {}
}
function callUI() {
  let el = document.getElementById('call'); const c = S.call;
  if (!c) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement('div'); el.id = 'call'; el.className = 'callov'; document.body.appendChild(el); }
  const p = c.profile || { name: 'مكالمة واردة' };
  const btns = c.state === 'incoming'
    ? `<button class="cb red" id="c-dec" title="رفض">✖</button><button class="cb grn" id="c-acc" title="رد">${IC('phone')}</button>`
    : `<button class="cb ${c.muted ? 'on' : ''}" id="c-mute" title="كتم">${c.muted ? '🔇' : '🎙️'}</button><button class="cb ${c.loud ? 'on' : ''}" id="c-spk" title="السماعة">🔊</button><button class="cb red" id="c-end" title="إنهاء">✖</button>`;
  el.innerHTML = `<div class="cav">${avatar(p, '')}</div><h2>${esc(p.name)}</h2><div id="cst" class="cst"></div><div class="cbar">${btns}</div>`;
  const $ = (i) => el.querySelector('#' + i);
  if ($('c-acc')) $('c-acc').onclick = acceptCall;
  if ($('c-dec')) $('c-dec').onclick = () => endCall('declined-local');
  if ($('c-end')) $('c-end').onclick = () => endCall('hangup');
  if ($('c-mute')) $('c-mute').onclick = () => { c.muted = !c.muted; if (c.stream) c.stream.getAudioTracks().forEach((t) => (t.enabled = !c.muted)); callUI(); };
  if ($('c-spk')) $('c-spk').onclick = () => { c.loud = !c.loud; if (c.audio) c.audio.volume = c.loud ? 1 : 0.35; callUI(); };
  callStatus();
}
function callStatus() {
  const c = S.call, el = document.getElementById('cst'); if (!c || !el) return;
  el.textContent = c.state === 'active' ? arDigits(fmtDur(Date.now() - c.t0)) : c.state === 'incoming' ? 'مكالمة صوتية واردة…' : c.state === 'calling' ? 'بيرن…' : 'بيتوصل…';
}
async function startCall(peer) {
  if (S.call) return;
  if (S.blocked.has(peer)) return toast('انت حاظر الشخص ده');
  if (!navigator.mediaDevices || !window.RTCPeerConnection) return alert('المتصفح ده مبيدعمش المكالمات');
  const c = (S.call = { id: crypto.randomUUID(), peer, role: 'caller', state: 'calling', profile: byId(peer), muted: false, loud: true, pend: [], t0: 0 });
  callUI(); c.icePromise = getIce();
  try { c.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
  catch { if (S.call === c) { S.call = null; callUI(); } toast('مقدرتش أوصل للمايك. اسمح للمايك من إعدادات المتصفح'); return; }
  if (S.call !== c) { c.stream.getTracks().forEach((t) => t.stop()); return; }
  const { error } = await sigSend('invite', null, c);
  if (error) { if (S.call === c) { S.call = null; callUI(); } c.stream.getTracks().forEach((t) => t.stop()); toast('مفيش اتصال، جرّب تاني'); return; }
  c.invited = true;
  c.ringT = setTimeout(() => { if (S.call === c && c.state === 'calling') endCall('missed', 'مفيش رد'); }, RING_MS);
}
function incomingCall(s) {
  const c = (S.call = { id: s.call_id, peer: s.from_id, role: 'callee', state: 'incoming', profile: byId(s.from_id), muted: false, loud: true, pend: [], t0: 0 });
  callUI(); ring(true);
  if (!c.profile) sb.from('profiles').select('*').eq('id', s.from_id).maybeSingle().then(({ data }) => { if (data && S.call === c) { c.profile = meOf(data); callUI(); } });
  if ('Notification' in window && Notification.permission === 'granted' && document.visibilityState !== 'visible') { try { new Notification('ونس', { body: 'مكالمة صوتية واردة', icon: 'icon.svg' }); } catch {} }
  c.ringT = setTimeout(() => { if (S.call === c && c.state === 'incoming') endCall('remote'); }, RING_MS + 5000);
}
async function acceptCall() {
  const c = S.call; if (!c || c.state !== 'incoming') return;
  ring(false); clearTimeout(c.ringT); c.state = 'connecting'; callUI();
  try { c.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
  catch { toast('مقدرتش أوصل للمايك. اسمح للمايك من إعدادات المتصفح'); return endCall('declined-local'); }
  if (S.call !== c) { c.stream.getTracks().forEach((t) => t.stop()); return; }
  c.ice = await getIce(); if (S.call !== c) return;
  makePC(c);
  c.connT = setTimeout(() => { if (S.call === c && c.state !== 'active') endCall('failed', FAILMSG); }, CONNECT_MS + 10000);
  await sigSend('accept', null, c);
}
function makePC(c) {
  const pc = (c.pc = new RTCPeerConnection({ iceServers: c.ice }));
  c.stream.getTracks().forEach((t) => pc.addTrack(t, c.stream));
  pc.onicecandidate = (e) => { if (e.candidate && S.call === c) sigSend('ice', e.candidate.toJSON(), c); };
  pc.ontrack = (e) => {
    if (!c.audio) { c.audio = new Audio(); c.audio.autoplay = true; c.audio.setAttribute('playsinline', ''); document.body.appendChild(c.audio); }
    c.audio.srcObject = e.streams[0]; c.audio.volume = c.loud ? 1 : 0.35;
    c.audio.play().catch(() => toast('اضغط على الشاشة عشان الصوت يشتغل'));
  };
  pc.onconnectionstatechange = () => {
    if (S.call !== c) return; const st = pc.connectionState;
    if (st === 'connected') { clearTimeout(c.dcT); if (c.state !== 'active') { c.state = 'active'; c.t0 = Date.now(); clearTimeout(c.connT); c.tick = setInterval(callStatus, 1000); callUI(); } }
    else if (st === 'failed') endCall('failed', FAILMSG);
    else if (st === 'disconnected') { clearTimeout(c.dcT); c.dcT = setTimeout(() => { if (S.call === c && pc.connectionState !== 'connected') endCall('failed', 'النت قطع، المكالمة خلصت'); }, 8000); }
  };
}
async function flushIce(c) { const l = c.pend.splice(0); for (const x of l) { try { await c.pc.addIceCandidate(x); } catch {} } }
// a call notification was tapped: look the invite up (RLS: only mine) and show the ringing screen if it is still ringing
async function ringFromPush(callId, chat) {
  if (!callId || !S.me || S.call) return;
  const { data } = await sb.from('call_signals').select('*').eq('call_id', callId).order('id');
  const inv = (data || []).find((x) => x.kind === 'invite' && x.to_id === S.me.id);
  const over = (data || []).some((x) => x.from_id === (inv && inv.from_id) && (x.kind === 'cancel' || x.kind === 'end'));
  if (!inv || over || Date.now() - new Date(inv.created_at).getTime() > 40000) { toast('المكالمة خلصت أو فاتتك'); if (chat) openFromPush(chat); return; }
  if (!byId(inv.from_id)) await refreshContacts();
  incomingCall(inv);
}
async function onSignal(s) {
  if (!S.me || s.to_id !== S.me.id) return;
  const c = S.call;
  if (s.kind === 'invite') {
    if (Date.now() - new Date(s.created_at).getTime() > 40000) return;
    if (c) { if (c.id !== s.call_id) await sb.from('call_signals').insert({ to_id: s.from_id, call_id: s.call_id, kind: 'busy' }); return; }
    return incomingCall(s);
  }
  if (!c || c.id !== s.call_id || c.peer !== s.from_id) return; // a signal for any other call is ignored
  try {
    if (s.kind === 'accept' && c.role === 'caller' && c.state === 'calling') {
      clearTimeout(c.ringT); c.state = 'connecting'; callUI(); c.ice = await c.icePromise; if (S.call !== c) return;
      makePC(c); c.connT = setTimeout(() => { if (S.call === c && c.state !== 'active') endCall('failed', FAILMSG); }, CONNECT_MS);
      const o = await c.pc.createOffer(); await c.pc.setLocalDescription(o); await sigSend('offer', { type: o.type, sdp: o.sdp }, c);
    } else if (s.kind === 'offer' && c.role === 'callee' && c.pc) {
      await c.pc.setRemoteDescription(s.payload); await flushIce(c);
      const a = await c.pc.createAnswer(); await c.pc.setLocalDescription(a); await sigSend('answer', { type: a.type, sdp: a.sdp }, c);
    } else if (s.kind === 'answer' && c.role === 'caller' && c.pc) {
      await c.pc.setRemoteDescription(s.payload); await flushIce(c);
    } else if (s.kind === 'ice') {
      if (c.pc && c.pc.remoteDescription) { try { await c.pc.addIceCandidate(s.payload); } catch {} } else c.pend.push(s.payload);
    } else if (s.kind === 'decline' && c.role === 'caller') endCall('declined', 'رفض المكالمة', true);
    else if (s.kind === 'busy' && c.role === 'caller') endCall('busy', 'مشغول في مكالمة تانية', true);
    else if (s.kind === 'cancel' && c.role === 'callee') endCall('remote', 'المكالمة فاتتك', true);
    else if (s.kind === 'end') endCall('remote', (s.payload && s.payload.why === 'failed') ? FAILMSG : 'المكالمة خلصت', true);
  } catch (e) { endCall('failed', FAILMSG); }
}
function endCall(reason, note, remote) {
  const c = S.call; if (!c) return; S.call = null;
  ring(false); clearTimeout(c.ringT); clearTimeout(c.connT); clearTimeout(c.dcT); clearInterval(c.tick);
  const dur = c.t0 ? Date.now() - c.t0 : 0, wasActive = c.state === 'active';
  try { c.pc && c.pc.close(); } catch {}
  if (c.stream) c.stream.getTracks().forEach((t) => t.stop());
  if (c.audio) { c.audio.srcObject = null; c.audio.remove(); }
  callUI(); if (note) toast(note);
  if (!remote) {
    const kind = c.state === 'calling' ? 'cancel' : reason === 'declined-local' ? 'decline' : 'end';
    if (c.invited || c.role === 'callee') sigSend(kind, reason === 'failed' ? { why: 'failed' } : null, c);
  }
  if (c.invited || c.role === 'callee') setTimeout(() => sb.from('call_signals').delete().eq('call_id', c.id).then(() => {}), 4000);
  if (c.role === 'caller' && c.invited) {
    const body = wasActive ? 'call' : reason === 'declined' ? 'declined' : 'missed';
    sb.from('messages').insert({ to_id: c.peer, kind: 'call', body, ...(wasActive ? { dur_ms: Math.min(dur, 86400000) } : {}) }).select().single().then(({ data }) => { if (data) onMessage(data); });
  }
}
window.WANAS_CALL = () => { const c = S.call; return c ? { state: c.state, role: c.role, ice: c.pc ? c.pc.connectionState : null, muted: c.muted } : null; };
window.WANAS_CALL_STATS = async () => { const c = S.call; if (!c || !c.pc) return null; let rx = 0, tx = 0; (await c.pc.getStats()).forEach((r) => { if (r.type === 'inbound-rtp' && r.kind === 'audio') rx += r.bytesReceived || 0; if (r.type === 'outbound-rtp' && r.kind === 'audio') tx += r.bytesSent || 0; }); const snd = c.stream ? c.stream.getAudioTracks()[0] : null; return { rx, tx, trackEnabled: snd ? snd.enabled : null }; };
const callLine = (m, mine) => m.body === 'call' ? `📞 مكالمة صوتية - ${arDigits(fmtDur(m.dur_ms || 0))}` : m.body === 'missed' ? (mine ? '📵 مكالمة بدون رد' : '📵 مكالمة فائتة') : (mine ? '📵 المكالمة اترفضت' : '📵 رفضت المكالمة');

// ---------- web push (service worker + VAPID; subscriptions live in a private table) ----------
const VAPID_PUB = 'BLTy7opI_LHunYo8y1eQchOPp3pIqiR0RtoxeWENKzKoznB7gG2h5UwQziSfipYe5sbyOQ85FltZoNXZ3CCdRkI';
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const b64u = (s) => { const r = atob((s + '='.repeat((4 - (s.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...r].map((ch) => ch.charCodeAt(0))); };
const IOS_STEPS = 'عشان الإشعارات تشتغل على الأيفون لازم تضيف ونس للشاشة الرئيسية:\n١. افتح ونس في Safari\n٢. دوس على زرار المشاركة (المربع اللي فيه سهم ⬆️) تحت\n٣. اختار «إضافة إلى الشاشة الرئيسية» وبعدين «إضافة»\n٤. افتح ونس من الأيقونة الجديدة وفعّل الإشعارات\n(محتاج iOS 16.4 أو أحدث)';
async function currentSub() { try { const reg = await navigator.serviceWorker.ready; return await reg.pushManager.getSubscription(); } catch { return null; } }
async function saveSub(sub) {
  const j = sub.toJSON(); if (!j.endpoint || !j.keys) return false;
  const { data } = await sb.from('push_subscriptions').select('id').eq('endpoint', j.endpoint);
  if (data && data.length) return true;
  const { error } = await sb.from('push_subscriptions').insert({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth });
  return !error;
}
async function subscribePush() {
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(VAPID_PUB) });
  if (await saveSub(sub)) return true;
  // this browser endpoint may still belong to a previous account: start a fresh one
  await sub.unsubscribe(); sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(VAPID_PUB) });
  return saveSub(sub);
}
async function disablePush() {
  const sub = await currentSub();
  if (sub) { await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint); await sub.unsubscribe(); }
  S.pushOn = false;
}
async function enablePush() {
  if (isIOS && !isStandalone) { iosSheet(); return false; }
  if (!pushSupported()) { toast(isIOS ? 'لازم تحدّث الأيفون لـ iOS 16.4 أو أحدث عشان الإشعارات' : 'المتصفح ده مبيدعمش الإشعارات'); return false; }
  const p = await Notification.requestPermission();
  if (p !== 'granted') { toast('الإشعارات مرفوضة. فعّلها من إعدادات المتصفح للموقع ده'); return false; }
  try { S.pushOn = await subscribePush(); } catch { S.pushOn = false; }
  if (!S.pushOn) toast('معرفتش أفعّل الإشعارات، جرّب تاني');
  return S.pushOn;
}
function iosSheet() { const s = sheet(`<h3>الإشعارات على الأيفون</h3><p style="white-space:pre-line;line-height:1.9">${esc(IOS_STEPS)}</p><button class="btn" id="ok">تمام</button>`); s.querySelector('#ok').onclick = () => s.remove(); }
function openFromPush(id) { if (!id || !S.me) return; if (byId(id)) openChat(id); else refreshContacts().then(() => byId(id) && openChat(id)); }
async function loadMutes() { const { data } = await sb.from('chat_mutes').select('chat_id'); S.mutes = new Set((data || []).map((r) => r.chat_id)); }
async function loadBlocks() { const { data } = await sb.from('blocks').select('blocked_id'); S.blocked = new Set((data || []).map((r) => r.blocked_id)); }
async function setBlock(id, on) {
  const { error } = on ? await sb.from('blocks').insert({ blocked_id: id }) : await sb.from('blocks').delete().eq('blocked_id', id);
  if (error) { toast('مقدرتش أنفّذ، جرّب تاني'); return false; }
  if (on) S.blocked.add(id); else S.blocked.delete(id);
  return true;
}
async function toggleMute(id) {
  if (S.mutes.has(id)) { await sb.from('chat_mutes').delete().eq('chat_id', id); S.mutes.delete(id); }
  else { const { error } = await sb.from('chat_mutes').insert({ chat_id: id }); if (!error) S.mutes.add(id); }
}
function pushBanner() {
  const old = document.getElementById('pushbar'); if (old) old.remove();
  if (!S.me || S.cur || S.pushOn || !document.querySelector('.fab')) return;
  if (!('Notification' in window) && !isIOS) return;
  if (typeof Notification !== 'undefined' && Notification.permission === 'denied') return;
  if (Date.now() - Number(LS.get('wanas_pushdis') || 0) < 3 * 86400000) return;
  const b = document.createElement('div'); b.id = 'pushbar'; b.className = 'pbar';
  b.innerHTML = `<span>🔔 فعّل الإشعارات عشان توصلك الرسايل حتى والتطبيق مقفول</span><button id="pb-on">${isIOS && !isStandalone ? 'إزاي؟' : 'تفعيل'}</button><button id="pb-no" class="x">✕</button>`;
  document.body.appendChild(b);
  b.querySelector('#pb-on').onclick = async () => { const ok = await enablePush(); if (ok) b.remove(); };
  b.querySelector('#pb-no').onclick = () => { LS.set('wanas_pushdis', String(Date.now())); b.remove(); };
}
async function initPush() {
  if (!('serviceWorker' in navigator)) return;
  try { await navigator.serviceWorker.register('sw.js'); } catch { return; }
  navigator.serviceWorker.addEventListener('message', (e) => { if (!e.data) return; if (e.data.type === 'open-chat') openFromPush(e.data.chat); else if (e.data.type === 'open-call') ringFromPush(e.data.call, e.data.chat); });
  if (pushSupported() && Notification.permission === 'granted') { try { S.pushOn = await subscribePush(); } catch { S.pushOn = false; } }
  else S.pushOn = false;
  pushBanner();
}

// ---------- phone Back button: every screen / sheet / viewer is a history layer ----------
function openViewer(src) {
  const v = document.getElementById('viewer'); if (!v || !src) return;
  const img = v.querySelector('img'); img.src = src;
  let sc = 1, tx = 0, ty = 0, d0 = 0, s0 = 1, lx = 0, ly = 0, lt = 0;
  const ap = () => { img.style.transform = `translate(${tx}px,${ty}px) scale(${sc})`; };
  const reset = () => { sc = 1; tx = 0; ty = 0; ap(); };
  reset();
  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  img.ontouchstart = (e) => { if (e.touches.length === 2) { d0 = dist(e.touches); s0 = sc; } else if (e.touches.length === 1) { lx = e.touches[0].clientX; ly = e.touches[0].clientY; const n = Date.now(); if (n - lt < 300) { sc = sc > 1 ? 1 : 2.5; if (sc === 1) { tx = 0; ty = 0; } ap(); } lt = n; } };
  img.ontouchmove = (e) => { if (e.touches.length === 2 && d0) { sc = Math.min(5, Math.max(1, s0 * dist(e.touches) / d0)); ap(); e.preventDefault(); } else if (e.touches.length === 1 && sc > 1) { tx += e.touches[0].clientX - lx; ty += e.touches[0].clientY - ly; lx = e.touches[0].clientX; ly = e.touches[0].clientY; ap(); e.preventDefault(); } };
  img.ontouchend = () => { d0 = 0; if (sc < 1.05) reset(); };
  img.ondblclick = () => { sc = sc > 1 ? 1 : 2.5; if (sc === 1) { tx = 0; ty = 0; } ap(); };
  if (!v.querySelector('.vx')) { const x = document.createElement('button'); x.className = 'vx'; x.setAttribute('aria-label', 'قفل'); x.textContent = '✕'; v.appendChild(x); }
  v.onclick = (e) => { if (e.target.tagName !== 'IMG') v.classList.add('hidden'); };
  v.classList.remove('hidden');
}
const NAV = { pushed: 0, wait: false, until: 0 };
function navLayers() {
  const L = [], q = (s) => document.querySelector(s);
  if (!S.me) { if (window.__authMode && window.__authMode !== 'login') L.push({ k: 'auth', close: () => renderAuth('login') }); return L; }
  if (S.view === 'quran') L.push({ k: 'quran', close: () => q('#qback')?.click() });
  if (!S.cur && q('#qbody #sback, #qbody #sjb')) L.push({ k: 'detail', close: () => q('#qbody #sback, #qbody #sjb')?.click() });
  if (S.cur) L.push({ k: 'chat', close: () => q('#back')?.click() });
  const v = q('#viewer'); if (v && !v.classList.contains('hidden')) L.push({ k: 'viewer', close: () => v.classList.add('hidden') });
  if (q('#call')) L.push({ k: 'call', close: () => toast('اقفل المكالمة الأول') });
  document.querySelectorAll('.sheet').forEach((s) => L.push({ k: 'sheet', close: () => s.dispatchEvent(new MouseEvent('click', { bubbles: true })) }));
  return L;
}
let navT = 0;
function navSync() {
  if (NAV.wait) return;
  const n = navLayers().length;
  if (n > NAV.pushed && Date.now() < NAV.until) { clearTimeout(navT); navT = setTimeout(navSync, 250); return; }
  if (n > NAV.pushed) { while (NAV.pushed < n) { history.pushState({ w: 1 }, ''); NAV.pushed++; } }
  else if (n < NAV.pushed) { const d = NAV.pushed - n; NAV.pushed = n; NAV.wait = true; history.go(-d); setTimeout(() => { if (NAV.wait) { NAV.wait = false; navSync(); } }, 600); }
}
window.addEventListener('popstate', () => {
  if (NAV.wait) { NAV.wait = false; setTimeout(navSync, 0); return; }
  if (NAV.pushed > 0) NAV.pushed--;
  const L = navLayers(); const top = L[L.length - 1]; if (top) { NAV.until = (top.k === 'detail' || top.k === 'quran') ? Date.now() + 2500 : 0; top.close(); }
  setTimeout(navSync, 60);
});
window.__nav = { NAV, navLayers, openViewer, statsSheet, usersSheet };
new MutationObserver(() => { clearTimeout(navT); navT = setTimeout(navSync, 30); }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
async function boot() {
  try { S.me = await loadMe(); } catch (e) { if (e.message === 'net') { $app.innerHTML = '<div class="empty">مفيش اتصال… <button class="link" onclick="location.reload()">جرّب تاني</button></div>'; return; } S.me = null; }
  if (!S.me) return renderAuth();
  await loadWallpapers(); S.isAdmin = (await sb.rpc('is_admin')).data === true; S.isTeacher = (await sb.rpc('is_teacher')).data === true; setupRealtime(); await refreshContacts(); await loadMutes(); await loadBlocks(); render();
  initPush();
  const qp = new URLSearchParams(location.search), q = qp.get('chat'), qc = qp.get('call');
  if (q || qc) { history.replaceState(null, '', location.pathname); if (qc) ringFromPush(qc, q); else openFromPush(q); }
}
boot();
})();
