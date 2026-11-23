'use strict';
/* ============ helpers ============ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CATS = ['Tech', 'Cultural', 'Sports', 'Business', 'Study', 'Social'];
const state = { user: null, events: [], meetups: [], anns: [], cat: 'All', mode: 'All', sort: 'closing', q: '', mcat: 'All', mmode: 'All', msort: 'date', tab: 'details', adminTab: 'overview', detail: null, timers: [] };
const fmt = s => s ? new Date(s + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const mon = s => new Date(s + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
const day = s => new Date(s + 'T00:00:00').getDate();
const left = n => n < 0 ? 'Ended' : n === 0 ? 'Last day' : n === 1 ? '1 day left' : `${n} days left`;
const isAdmin = () => state.user && state.user.role !== 'student';

async function api(method, url, body) {
  const r = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
  const v = Number(r.headers.get('X-Data-Version')); if (v) state.version = v;
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 401 && state.user) { state.user = null; renderNav(); location.hash = '#/login'; }
    const e = new Error(j.error || 'Request failed'); e.fields = j.fields || {}; e.status = r.status; throw e;
  }
  return j;
}
function toast(msg, kind = '') { const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = msg; $('#toasts').append(t); setTimeout(() => t.remove(), 3200); }
function modal(html) {
  const o = document.createElement('div'); o.className = 'ov'; o.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  o.addEventListener('mousedown', e => { if (e.target === o) o.remove(); }); document.body.append(o); return o;
}
function confirmBox(msg, okLabel = 'Confirm') {
  return new Promise(res => {
    const o = modal(`<h3>Are you sure?</h3><p class="mut">${esc(msg)}</p><div class="row" style="justify-content:flex-end;margin-top:16px"><button class="btn" data-no>Cancel</button><button class="btn pri" data-yes>${esc(okLabel)}</button></div>`);
    o.addEventListener('click', e => { if (e.target.matches('[data-yes]')) { o.remove(); res(true); } if (e.target.matches('[data-no]')) { o.remove(); res(false); } });
  });
}
const field = (label, name, o = {}) => {
  const { type = 'text', value = '', ph = '', opts, attrs = '', rows } = o;
  let inner;
  if (opts) inner = `<select name="${name}" ${attrs}>${opts.map(x => `<option ${String(x) === String(value) ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>`;
  else if (rows) inner = `<textarea name="${name}" rows="${rows}" placeholder="${esc(ph)}" ${attrs}>${esc(value)}</textarea>`;
  else inner = `<input name="${name}" type="${type}" value="${esc(value)}" placeholder="${esc(ph)}" ${attrs}>`;
  return `<label class="f" data-f="${name}">${esc(label)}${inner}<span class="err"></span></label>`;
};
const formData = f => Object.fromEntries([...new FormData(f)].filter(([, v]) => typeof v === 'string'));
function showErrors(f, errs, general) {
  $$('.f[data-f]', f).forEach(l => { const m = errs[l.dataset.f]; l.classList.toggle('bad', !!m); const er = $('.err', l); if (er) er.textContent = m || ''; });
  let g = $('.formerr', f); if (g) g.remove();
  const firstBad = $('.f.bad input,.f.bad select,.f.bad textarea', f); if (firstBad) firstBad.focus();
  if (general && !Object.keys(errs).length) { f.insertAdjacentHTML('afterbegin', `<div class="formerr">${esc(general)}</div>`); }
}
/* run client validation, then server call; server errors map back onto fields */
async function submitForm(f, validate, send) {
  const d = formData(f); const errs = validate ? validate(d, f) : {};
  showErrors(f, errs); if (Object.keys(errs).length) return;
  const btn = $('button[type=submit]', f); if (btn) btn.disabled = true;
  try { await send(d); } catch (e) { showErrors(f, e.fields || {}, e.message); if (Object.keys(e.fields || {}).length) toast(e.message, 'bad'); else if (!$('.formerr', f)) toast(e.message, 'bad'); const cap = $('.cap', f); if (cap) loadCaptcha(f); }
  finally { if (btn) btn.disabled = false; }
}
const V = {
  email: v => !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v || '') ? 'Enter a valid email address.' : '',
  min: (v, n, msg) => (v || '').trim().length < n ? msg : '',
  date: v => !/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? 'Choose a valid date.' : ''
};
const clean = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v));
async function loadCaptcha(f) {
  const c = await api('GET', '/api/captcha'); f.dataset.cid = c.id; $('.cap .img', f).innerHTML = c.svg; const i = $('[name=captcha]', f); if (i) i.value = '';
}

/* ============ data ============ */
async function loadCore() {
  const [e, m, a] = await Promise.all([api('GET', '/api/events'), api('GET', '/api/meetups'), api('GET', '/api/announcements')]);
  state.events = e.events; state.meetups = m.meetups; state.anns = a.announcements;
}

/* ============ nav & announcements ============ */
function renderNav() {
  const u = state.user, h = location.hash || '#/';
  const on = p => (h === p || (p !== '#/' && h.startsWith(p)) ? 'on' : '');
  $('#nav').innerHTML = `<div class="nav"><div class="nav-in"><a class="brand" href="#/"><span class="logo">E</span>Eventure</a>
  ${u ? `<div class="search"><input id="gsearch" placeholder="Search events, clubs, venues…" value="${esc(state.q)}" aria-label="Search"></div>
  <nav class="links"><a href="#/" class="${h === '#/' || h.startsWith('#/event/') ? 'on' : ''}">Official events</a><a href="#/meetups" class="${on('#/meetups')}">Student meetups</a><a href="#/host" class="${on('#/host')}">Host a meetup</a><a href="#/activity" class="${on('#/activity')}">My activity</a>${isAdmin() ? `<a href="#/admin" class="${on('#/admin')}">Admin</a>` : ''}</nav>
  <div class="userchip right"><span class="avatar">${esc(u.name[0])}</span><span>${esc(u.name)}<br><small class="mut">${u.role === 'student' ? esc(u.collegeId) : esc(u.orgName || 'Super admin')}</small></span><button class="btn sm" data-act="logout">Log out</button></div>` : ''}</div></div>`;
  const gs = $('#gsearch'); if (gs) gs.addEventListener('input', e => { state.q = e.target.value; if (location.hash === '#/meetups') { renderMeetupList(); } else if (location.hash === '#/' || location.hash === '') { renderEventList(); } else { state.refocus = true; location.hash = '#/'; } });
  if (state.refocus) { state.refocus = false; const g = $('#gsearch'); g.focus(); g.setSelectionRange(g.value.length, g.value.length); }
}
function renderAnn() {
  const box = $('#ann'); const a = state.user ? state.anns.filter(x => sessionStorage.getItem('dis_' + x.id) !== '1') : [];
  if (!a.length) { box.innerHTML = ''; return; }
  let i = 0; const draw = () => { const x = a[i % a.length]; box.innerHTML = `<div class="ann ${x.type === 'urgent' ? 'urgent' : ''}"><b>${esc(x.orgName)}</b><span>${esc(x.text)}</span><button aria-label="Dismiss" data-act="dismiss" data-id="${x.id}">×</button></div>`; };
  draw(); if (a.length > 1) state.timers.push(setInterval(() => { i++; draw(); }, 6000));
}

/* ============ router ============ */
async function route() {
  state.timers.forEach(clearInterval); state.timers = [];
  document.querySelectorAll('.ov').forEach(o => o.remove());
  const h = location.hash || '#/'; const app = $('#app');
  if (!state.user) { if (h !== '#/login' && h !== '#/register') { location.hash = '#/login'; return; } }
  else if (h === '#/login' || h === '#/register') { location.hash = '#/'; return; }
  renderNav(); renderAnn();
  try {
    if (h === '#/login') return viewAuth('login');
    if (h === '#/register') return viewAuth('register');
    app.innerHTML = '<div class="loading">Loading…</div>';
    if (h === '#/' ) { await loadCore(); renderAnn(); return viewHome(); }
    if (h.startsWith('#/event/')) return await viewEvent(h.split('/')[2]);
    if (h === '#/meetups') { await loadCore(); return viewMeetups(); }
    if (h === '#/host') return viewHost();
    if (h === '#/activity') return await viewActivity();
    if (h === '#/admin') { if (!isAdmin()) return (location.hash = '#/'); return await viewAdmin(); }
    if (h === '#/admin/new') return await viewEventForm();
    if (h.startsWith('#/admin/edit/')) return await viewEventForm(h.split('/')[3]);
    if (h.startsWith('#/admin/event/')) return await viewManage(h.split('/')[3]);
    app.innerHTML = `<div class="wrap"><div class="empty"><h2>Page not found</h2><a href="#/">Back to events</a></div></div>`;
  } catch (e) { app.innerHTML = `<div class="wrap"><div class="empty"><h2>Something went wrong</h2><p>${esc(e.message)}</p><a href="#/">Back to events</a></div></div>`; }
}
window.addEventListener('hashchange', () => { window.scrollTo(0, 0); route(); });

/* auto-refresh: a tiny version check; the page re-renders only when data actually changed */
const REFRESH_MS = 15000;
function isBusy() {
  const a = document.activeElement;
  return !!document.querySelector('.ov') || (a && a.matches('input,textarea,select') && a.id !== 'gsearch');
}
async function checkForUpdates() {
  if (document.hidden || !state.user || state.refreshing || isBusy()) return;
  try {
    const known = state.version;
    const { version } = await api('GET', '/api/version');
    if (!known || !version || version === known || isBusy()) return;
    state.refreshing = true; const y = window.scrollY;
    await route(); window.scrollTo(0, y);
  } catch {} finally { state.refreshing = false; }
}
setInterval(checkForUpdates, REFRESH_MS);
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkForUpdates(); });

/* ============ auth ============ */
function viewAuth(mode) {
  const reg = mode === 'register';
  $('#app').innerHTML = `<div class="auth"><div class="auth-l"><h1>Every campus event.<br>One place.</h1><p>Discover club and committee events, form teams with your college ID, submit round documents and follow results, all in one dashboard.</p>
  <ul><li>Official events with registration, teams and multi-round tracking</li><li>Student-led meetups with a quick “I’m in” vote</li><li>Secure sign-in with CAPTCHA</li></ul></div>
  <div class="auth-r"><div class="auth-card card pad"><div class="seg"><a href="#/login" class="${reg ? '' : 'on'}">Sign in</a><a href="#/register" class="${reg ? 'on' : ''}">Create account</a></div>
  <form id="authf" novalidate>
  ${reg ? field('Full name', 'name', { ph: 'As on your college ID', attrs: 'autocomplete="name"' }) + field('College ID', 'collegeId', { ph: 'e.g. S2024001' }) : ''}
  ${field('Email', 'email', { type: 'email', ph: 'you@college.edu', attrs: 'autocomplete="email"' })}
  ${field('Password', 'password', { type: 'password', ph: reg ? 'Min 8 chars, letters + numbers' : 'Your password', attrs: `autocomplete="${reg ? 'new' : 'current'}-password"` })}
  ${reg ? field('Confirm password', 'confirm', { type: 'password', attrs: 'autocomplete="new-password"' }) : ''}
  <label class="f" data-f="captcha">CAPTCHA<div class="cap"><span class="img"></span><button type="button" class="btn sm" data-act="recaptcha" title="New CAPTCHA">↻</button></div><input name="captcha" placeholder="Type the characters above" autocomplete="off" maxlength="5"><span class="err"></span></label>
  <button class="btn pri block" type="submit">${reg ? 'Create account' : 'Sign in'}</button></form>
  ${reg ? '' : `<div class="demo"><b>Demo accounts</b><br>Student: <code>demo@college.edu</code> / <code>Student@123</code><br>Club admin: <code>cultural@college.edu</code> / <code>Admin@123</code><br>Super admin: <code>superadmin@college.edu</code> / <code>Admin@123</code></div>`}</div></div></div>`;
  const f = $('#authf'); loadCaptcha(f);
  f.addEventListener('submit', ev => { ev.preventDefault(); submitForm(f, d => {
    const e = {}; if (reg) { e.name = V.min(d.name, 2, 'Enter your full name.'); if (!/^[A-Za-z0-9]{5,15}$/.test(d.collegeId || '')) e.collegeId = 'College ID must be 5-15 letters/numbers.'; }
    e.email = V.email(d.email);
    if (reg) { if ((d.password || '').length < 8 || !/[A-Za-z]/.test(d.password) || !/\d/.test(d.password)) e.password = 'At least 8 characters with a letter and a number.'; if (d.confirm !== d.password) e.confirm = 'Passwords do not match.'; }
    else if (!d.password) e.password = 'Enter your password.';
    if (!/^[A-Za-z0-9]{5}$/.test(d.captcha || '')) e.captcha = 'Enter the 5 CAPTCHA characters.';
    return clean(e);
  }, async d => {
    const r = await api('POST', reg ? '/api/register' : '/api/login', { ...d, captchaId: f.dataset.cid });
    state.user = r.user; await loadCore(); toast(reg ? 'Welcome to Eventure!' : 'Signed in', 'ok'); location.hash = '#/'; route();
  }); });
}

/* ============ cards ============ */
const stateTag = e => ({ open: ['ok', 'Registrations open'], full: ['warn', 'Full'], closed: ['gray', 'Closed'], ended: ['gray', 'Registration ended'], started: ['', 'In progress'] }[e.state]);
function evCard(e) {
  const [k, l] = stateTag(e);
  return `<article class="card ev" data-href="#/event/${e.id}"><div class="date"><b>${mon(e.eventDate)}</b><span>${day(e.eventDate)}</span></div>
  <div class="info"><h3>${esc(e.title)}</h3><div class="org">${esc(e.orgName)}</div>
  <div class="tags"><span class="tag">${esc(e.category)}</span><span class="tag gray">${esc(e.mode)}</span><span class="tag gray">${e.teamMax === 1 ? 'Individual' : `Teams of ${e.teamMin === e.teamMax ? e.teamMin : e.teamMin + '-' + e.teamMax}`}</span><span class="tag gray">${e.rounds.length} round${e.rounds.length > 1 ? 's' : ''}</span><span class="tag ${k}">${l}</span>${e.myTeamId ? '<span class="tag ok">You’re registered</span>' : ''}</div>
  <div class="meta"><span>${e.registered}/${e.capacity} registered</span><span>${e.daysLeft >= 0 && e.state !== 'closed' ? left(e.daysLeft) + ' to register' : 'Registration over'}</span><span>${esc(e.venue)}</span></div></div>
  <div class="mono c-${e.category}">${esc(e.orgShort)}</div><button class="heart ${e.saved ? 'on' : ''}" data-act="save" data-id="${e.id}" aria-label="Save event" title="Save">${e.saved ? '♥' : '♡'}</button></article>`;
}
const miniEv = e => `<div class="mini" data-href="#/event/${e.id}"><span class="mono c-${e.category}">${esc(e.orgShort)}</span><span><b>${esc(e.title)}</b><small class="mut">${e.daysLeft >= 0 ? left(e.daysLeft) : 'Ended'} · ${esc(e.orgName)}</small></span></div>`;
function mtCard(m, ctx) {
  const mine = m.hostId === state.user.id, canEdit = mine || isAdmin();
  return `<article class="card ev" style="cursor:default"><div class="date"><b>${mon(m.date)}</b><span>${day(m.date)}</span></div><div class="info"><h3>${esc(m.title)}</h3><div class="org">Hosted by ${esc(m.hostName)}${m.time ? ' · ' + esc(m.time) : ''}</div>
  <div class="tags"><span class="tag">${esc(m.category)}</span><span class="tag gray">${esc(m.mode)}</span><span class="tag gray">${esc(m.venue)}</span><span class="tag ${m.daysLeft < 0 ? 'bad' : 'ok'}">${m.daysLeft < 0 ? 'Past' : m.daysLeft === 0 ? 'Today' : left(m.daysLeft).replace(' left', ' away')}</span></div>
  ${m.description ? `<p class="sm mut">${esc(m.description)}</p>` : ''}
  <div class="row" style="margin-top:8px"><span class="vote"><button class="btn sm ${m.myVote === 'in' ? 'on' : ''}" data-act="vote" data-id="${m.id}" data-v="in">✓ I’m in · ${m.going}</button><button class="btn sm ${m.myVote === 'maybe' ? 'on' : ''}" data-act="vote" data-id="${m.id}" data-v="maybe">Maybe · ${m.maybe}</button></span>
  ${canEdit ? `<span class="acts right"><button class="btn sm" data-act="editmeetup" data-id="${m.id}">Edit</button><button class="btn sm bad" data-act="delmeetup" data-id="${m.id}">Delete</button></span>` : ''}</div></div></article>`;
}

/* ============ home ============ */
function filteredEvents() {
  const q = state.q.trim().toLowerCase();
  let l = state.events.filter(e => (state.cat === 'All' || e.category === state.cat) && (state.mode === 'All' || e.mode === state.mode) && (!q || (e.title + ' ' + e.orgName + ' ' + e.category + ' ' + e.venue).toLowerCase().includes(q)));
  const live = e => e.daysLeft >= 0 && e.state !== 'closed' ? 0 : 1;
  const sorts = { closing: (a, b) => live(a) - live(b) || a.daysLeft - b.daysLeft, popular: (a, b) => b.registered - a.registered, date: (a, b) => a.eventDate.localeCompare(b.eventDate), az: (a, b) => a.title.localeCompare(b.title) };
  return l.sort(sorts[state.sort]);
}
function renderEventList() {
  const box = $('#evlist'); if (!box) return; const l = filteredEvents();
  box.innerHTML = l.length ? l.map(evCard).join('') : `<div class="empty">No events match your filters.</div>`;
  const c = $('#evcount'); if (c) c.textContent = `${l.length} event${l.length === 1 ? '' : 's'}`;
}
function viewHome() {
  const feat = state.events.filter(e => e.featured && e.daysLeft >= 0 && e.state !== 'closed').sort((a, b) => a.daysLeft - b.daysLeft).slice(0, 4);
  const slides = feat.length ? feat : state.events.slice(0, 1);
  const closing = state.events.filter(e => e.daysLeft >= 0 && e.state === 'open').sort((a, b) => a.daysLeft - b.daysLeft).slice(0, 5);
  const mts = state.meetups.filter(m => m.daysLeft >= 0).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);
  $('#app').innerHTML = `<div class="wrap">
  ${slides.length ? `<section class="hero c-${slides[0].category}" id="hero">${slides.map((e, i) => `<div class="slide c-${e.category} ${i ? '' : 'on'}"><span class="kick">${feat.length ? 'Happening soon' : 'Featured'} · ${esc(e.orgName)}</span><h1>${esc(e.title)}</h1><p>${esc(e.description.slice(0, 150))}…</p><p class="sm">${fmt(e.eventDate)} · ${esc(e.mode)} · ${e.registered} registered · ${left(e.daysLeft)} to register</p><a class="btn" href="#/event/${e.id}">${e.myTeamId ? 'View your registration' : 'Register now'} →</a></div>`).join('')}${slides.length > 1 ? `<div class="dots">${slides.map((_, i) => `<i class="${i ? '' : 'on'}" data-slide="${i}"></i>`).join('')}</div>` : ''}</section>` : ''}
  <div class="cols"><section><div class="sec-h"><h2>Official events</h2><span class="mut sm" id="evcount"></span></div><p class="mut sm">Competitions and events run by clubs and committees, with registration, teams and rounds.</p>
  <div class="chips">${['All', ...CATS].map(c => `<button class="chip ${state.cat === c ? 'on' : ''}" data-act="cat" data-v="${c}">${c}</button>`).join('')}</div>
  <div class="toolbar"><select class="sel" id="fmode" aria-label="Mode">${['All', 'Online', 'Offline', 'Hybrid'].map(x => `<option value="${x}" ${state.mode === x ? 'selected' : ''}>${x === 'All' ? 'Mode: All' : x}</option>`).join('')}</select>
  <select class="sel" id="fsort" aria-label="Sort">${[['closing', 'Sort: Closing soon'], ['date', 'Sort: Event date'], ['popular', 'Sort: Most popular'], ['az', 'Sort: A to Z']].map(([v, l]) => `<option value="${v}" ${state.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
  <div class="list" id="evlist"></div></section>
  <aside class="side"><div class="card pad"><h3>Closing soon</h3>${closing.map(miniEv).join('') || '<p class="mut sm">Nothing closing soon.</p>'}</div>
  <div class="card pad"><div class="row between"><h3>Student meetups</h3><a href="#/meetups" class="sm">See all</a></div>${mts.map(m => `<div class="mini" data-href="#/meetups"><span class="mono c-${m.category}" style="font-size:.7rem">${mon(m.date)}<br>${day(m.date)}</span><span><b>${esc(m.title)}</b><small class="mut">${m.going} going · ${esc(m.venue)}</small></span></div>`).join('') || '<p class="mut sm">No upcoming meetups.</p>'}<a class="btn block sm" href="#/host" style="margin-top:8px">+ Host a meetup</a></div></aside></div></div>`;
  renderEventList();
  $('#fmode').onchange = e => { state.mode = e.target.value; renderEventList(); };
  $('#fsort').onchange = e => { state.sort = e.target.value; renderEventList(); };
  const sl = $$('.slide'); if (sl.length > 1) { let i = 0; const go = n => { i = n % sl.length; sl.forEach((s, k) => s.classList.toggle('on', k === i)); $$('.dots i').forEach((d, k) => d.classList.toggle('on', k === i)); }; state.timers.push(setInterval(() => go(i + 1), 5000)); $$('.dots i').forEach(d => d.onclick = () => go(+d.dataset.slide)); }
}

/* ============ meetups ============ */
function renderMeetupList() {
  const box = $('#mtlist'); if (!box) return; const q = state.q.trim().toLowerCase();
  const l = state.meetups.filter(m => (state.mcat === 'All' || m.category === state.mcat) && (state.mmode === 'All' || m.mode === state.mmode) && (!q || (m.title + m.hostName + m.venue + m.category).toLowerCase().includes(q)));
  l.sort(state.msort === 'popular' ? (a, b) => b.going - a.going : (a, b) => (a.daysLeft < 0) - (b.daysLeft < 0) || a.date.localeCompare(b.date));
  box.innerHTML = l.length ? l.map(mtCard).join('') : `<div class="empty">No meetups yet. <a href="#/host">Host the first one</a>.</div>`;
}
function viewMeetups() {
  $('#app').innerHTML = `<div class="wrap"><div class="row between"><div><h1>Student-led meetups</h1><p class="mut">Informal sessions started by students: study groups, matches, practice. No registration needed, just vote if you’re in.</p></div><a class="btn pri" href="#/host">+ Host a meetup</a></div>
  <div class="chips">${['All', ...CATS].map(c => `<button class="chip ${state.mcat === c ? 'on' : ''}" data-act="mcat" data-v="${c}">${c}</button>`).join('')}</div>
  <div class="toolbar"><select class="sel" id="mmode">${['All', 'Online', 'Offline', 'Hybrid'].map(x => `<option value="${x}" ${state.mmode === x ? 'selected' : ''}>${x === 'All' ? 'Mode: All' : x}</option>`).join('')}</select><select class="sel" id="msort"><option value="date" ${state.msort === 'date' ? 'selected' : ''}>Sort: Soonest</option><option value="popular" ${state.msort === 'popular' ? 'selected' : ''}>Sort: Most going</option></select></div>
  <div class="list" id="mtlist"></div></div>`;
  renderMeetupList(); $('#mmode').onchange = e => { state.mmode = e.target.value; renderMeetupList(); }; $('#msort').onchange = e => { state.msort = e.target.value; renderMeetupList(); };
}
function meetupForm(m) {
  return `<form id="mtf" novalidate>${field('Title', 'title', { value: m?.title, ph: 'e.g. Weekend football 5-a-side' })}
  <div class="grid2">${field('Category', 'category', { opts: CATS, value: m?.category || 'Sports' })}${field('Mode', 'mode', { opts: ['Offline', 'Online', 'Hybrid'], value: m?.mode || 'Offline' })}</div>
  ${field('Venue or link', 'venue', { value: m?.venue, ph: 'Ground, room or meeting link' })}
  <div class="grid2">${field('Date', 'date', { type: 'date', value: m?.date })}${field('Time (optional)', 'time', { type: 'time', value: m?.time })}</div>
  ${field('Description', 'description', { rows: 3, value: m?.description, ph: 'What’s the plan?' })}
  <button class="btn pri block" type="submit">${m ? 'Save changes' : 'Publish meetup'}</button></form>`;
}
function bindMeetupForm(f, m, done) {
  const today = new Date(); today.setMinutes(today.getMinutes() - today.getTimezoneOffset()); const t = today.toISOString().slice(0, 10);
  f.addEventListener('submit', ev => { ev.preventDefault(); submitForm(f, d => clean({ title: V.min(d.title, 3, 'Title must be at least 3 characters.'), venue: V.min(d.venue, 2, 'Enter a venue or link.'), date: V.date(d.date) || (!m && d.date < t ? 'Date cannot be in the past.' : '') }),
    async d => { const r = m ? await api('PUT', '/api/meetups/' + m.id, d) : await api('POST', '/api/meetups', d); toast(m ? 'Meetup updated' : 'Meetup published', 'ok'); done(r); }); });
}
function viewHost() {
  $('#app').innerHTML = `<div class="wrap" style="max-width:640px"><h1>Host a meetup</h1><p class="mut">Study sessions, games and hangouts. It appears under <b>Student meetups</b>, separate from official events. Others can vote “I’m in”.</p><div class="card pad">${meetupForm()}</div></div>`;
  bindMeetupForm($('#mtf'), null, () => { location.hash = '#/meetups'; });
}

/* ============ activity ============ */
async function viewActivity() {
  const a = await api('GET', '/api/me/activity');
  $('#app').innerHTML = `<div class="wrap"><h1>My activity</h1><p class="mut">Your registrations, saved events and meetups you host.</p>
  <h2 style="margin-top:22px">Registered</h2>${a.registered.length ? `<div class="list">${a.registered.map(r => `<div>${evCard(r.event)}<div class="sm mut" style="padding:6px 4px">Team <b>${esc(r.team.name)}</b> · ${r.team.size} member${r.team.size > 1 ? 's' : ''} · <span class="tag ${r.team.status === 'eliminated' ? 'bad' : 'ok'}">${esc(r.team.status)}</span> · ${esc(r.event.rounds[r.team.roundReached]?.name || '')}</div></div>`).join('')}</div>` : `<div class="empty">You haven’t registered for anything yet. <a href="#/">Browse events</a></div>`}
  <h2 style="margin-top:22px">Saved</h2>${a.saved.length ? `<div class="list">${a.saved.map(evCard).join('')}</div>` : `<div class="empty">No saved events. Tap the heart on any event.</div>`}
  <h2 style="margin-top:22px">Hosted by me</h2>${a.hosted.length ? `<div class="list">${a.hosted.map(mtCard).join('')}</div>` : `<div class="empty">You haven’t hosted a meetup. <a href="#/host">Host one</a></div>`}
  <h2 style="margin-top:22px">Account</h2><div class="card pad" style="max-width:420px"><form id="pwf" novalidate><h3>Change password</h3>${field('Current password', 'current', { type: 'password' })}${field('New password', 'password', { type: 'password', ph: 'Min 8 chars, letters + numbers' })}<button class="btn pri" type="submit">Update password</button></form></div></div>`;
  const f = $('#pwf'); f.addEventListener('submit', ev => { ev.preventDefault(); submitForm(f, d => clean({ current: d.current ? '' : 'Enter your current password.', password: (d.password || '').length < 8 || !/[A-Za-z]/.test(d.password) || !/\d/.test(d.password) ? 'At least 8 characters with a letter and a number.' : '' }), async d => { await api('POST', '/api/me/password', d); f.reset(); toast('Password updated', 'ok'); }); });
}

/* ============ event detail ============ */
async function viewEvent(id) {
  state.detail = await api('GET', '/api/events/' + id); if (state.tab === 'admin') state.tab = 'details'; drawEvent();
}
function drawEvent() {
  const { event: e, teams, myTeam } = state.detail; const mySubs = state.detail.mySubmissions || [];
  const [k, l] = stateTag(e); const cur = e.rounds[e.currentRound];
  const tabs = [['details', 'Details'], ['rounds', 'Rounds & timeline'], ['teams', `Teams (${teams.length})`]]; if (myTeam) tabs.push(['mine', 'My team & submissions']);
  if (!tabs.some(t => t[0] === state.tab)) state.tab = 'details';
  let body = '';
  if (state.tab === 'details') body = `<div class="card pad"><h3>About this event</h3><p style="white-space:pre-line">${esc(e.description)}</p>
    <dl class="kv" style="margin-top:14px"><dt>Organiser</dt><dd>${esc(e.orgName)} (${esc(e.orgType)})</dd><dt>Event date</dt><dd>${fmt(e.eventDate)}</dd><dt>Venue</dt><dd>${esc(e.venue)} (${esc(e.mode)})</dd><dt>Team size</dt><dd>${e.teamMax === 1 ? 'Individual' : e.teamMin + (e.teamMax > e.teamMin ? ' to ' + e.teamMax : '') + ' members'}</dd><dt>Eligibility</dt><dd>${esc(e.eligibility || 'Open to all')}</dd>${e.prize ? `<dt>Rewards</dt><dd>${esc(e.prize)}</dd>` : ''}</dl></div>`;
  if (state.tab === 'rounds') body = `<div class="card pad"><h3>Rounds & timeline</h3><div class="timeline">${e.rounds.map((r, i) => `<div class="tl ${i < e.currentRound ? 'done' : i === e.currentRound && e.currentRound > 0 ? 'cur' : ''}"><b>Round ${i + 1}: ${esc(r.name)}</b> <span class="tag ${r.type === 'submission' ? '' : 'gray'}">${r.type === 'submission' ? 'Document submission' : 'Live round'}</span> ${i === e.currentRound && e.currentRound > 0 ? '<span class="tag ok">Current</span>' : i < e.currentRound ? '<span class="tag gray">Completed</span>' : ''}<p class="sm mut">${esc(r.description)}</p>${r.dueDate ? `<p class="sm">Due ${fmt(r.dueDate)}</p>` : ''}</div>`).join('')}</div></div>`;
  if (state.tab === 'teams') body = `<div class="card pad"><h3>Registered teams</h3>${teams.length ? `<div class="tbl"><table><thead><tr><th>Team</th><th>Leader</th><th>Members</th><th>Status</th></tr></thead><tbody>${teams.map(t => `<tr><td><b>${esc(t.name)}</b></td><td>${esc(t.leader)}</td><td>${t.size}</td><td><span class="tag ${t.status === 'eliminated' ? 'bad' : 'ok'}">${esc(t.status)}</span></td></tr>`).join('')}</tbody></table></div>` : '<p class="mut">No teams yet. Be the first!</p>'}</div>`;
  if (state.tab === 'mine' && myTeam) {
    const canSubmit = cur && cur.type === 'submission' && myTeam.status === 'active' && myTeam.roundReached === e.currentRound && (!cur.dueDate || (new Date(cur.dueDate + 'T23:59:59') >= new Date()));
    const curSub = mySubs.find(s => s.roundIndex === e.currentRound);
    body = `<div class="card pad"><div class="row between"><h3>Team ${esc(myTeam.name)}</h3><span class="tag ${myTeam.status === 'eliminated' ? 'bad' : 'ok'}">${esc(myTeam.status)}</span></div>
    ${e.teamMax > 1 ? `<p class="sm">Share this code so teammates can join: <b style="font-size:1.1rem;letter-spacing:.15em">${esc(myTeam.code)}</b> <button class="btn sm" data-act="copy" data-v="${esc(myTeam.code)}">Copy</button></p><p class="sm mut">${myTeam.members.length}/${e.teamMax} members${myTeam.members.length < e.teamMin ? ` · needs at least ${e.teamMin} to be complete` : ''}</p>` : ''}
    <div class="tbl"><table><thead><tr><th>Name</th><th>College ID</th><th>Role</th></tr></thead><tbody>${myTeam.members.map(m => `<tr><td>${esc(m.name)}</td><td>${esc(m.collegeId)}</td><td>${m.leader ? 'Leader' : 'Member'}</td></tr>`).join('')}</tbody></table></div></div>
    <div class="card pad" style="margin-top:14px"><h3>Submissions</h3>
    ${mySubs.length ? mySubs.map(s => `<div style="padding:10px 0;border-bottom:1px solid var(--line)"><b>Round ${s.roundIndex + 1}: ${esc(e.rounds[s.roundIndex]?.name)}</b><div class="sm">${s.link ? `<a href="${esc(s.link)}" target="_blank" rel="noopener noreferrer">${esc(s.link)}</a>` : ''} ${s.fileName ? `<a href="/api/submissions/${s.id}/file">${esc(s.fileName)}</a>` : ''}</div>${s.note ? `<div class="sm mut">${esc(s.note)}</div>` : ''}<div class="sm mut">Submitted ${new Date(s.submittedAt).toLocaleString()}</div>${s.score != null ? `<div class="sm"><span class="tag ok">Score ${s.score}/100</span> ${esc(s.feedback)}</div>` : ''}</div>`).join('') : '<p class="mut sm">Nothing submitted yet.</p>'}
    ${canSubmit ? `<form id="subf" novalidate style="margin-top:14px"><h4>${curSub ? 'Update' : 'Submit'} for Round ${e.currentRound + 1}: ${esc(cur.name)}</h4><p class="sm mut">${esc(cur.description)} ${cur.dueDate ? 'Due ' + fmt(cur.dueDate) + '.' : ''}</p>${field('Link (Drive, GitHub, etc.)', 'link', { ph: 'https://…' })}<label class="f" data-f="file">Or upload a file (max 3 MB)<input type="file" name="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.png,.jpg,.jpeg,.zip,.txt"><span class="err"></span></label>${field('Note (optional)', 'note', { rows: 2 })}<button class="btn pri" type="submit">${curSub ? 'Resubmit' : 'Submit'}</button></form>`
      : `<p class="sm mut" style="margin-top:12px">${cur && cur.type === 'submission' ? 'Submissions are not open for your team in this round.' : e.currentRound === 0 && cur?.type !== 'submission' ? 'No submission needed for the current round.' : 'No submission needed for the current round.'}</p>`}</div>`;
  }
  const regBox = (() => {
    if (isAdmin()) return `<p class="sm mut">You’re signed in as an admin.</p>${canManageEv(e) ? `<a class="btn pri block" href="#/admin/event/${e.id}">Manage this event</a>` : ''}`;
    if (myTeam) return `<div class="tag ok" style="margin-bottom:8px">You’re registered</div><p class="sm">Team <b>${esc(myTeam.name)}</b></p><button class="btn block" data-act="tab" data-v="mine">View team & submissions</button>${e.currentRound === 0 ? `<button class="btn bad block sm" style="margin-top:8px" data-act="leave" data-id="${e.id}">Withdraw</button>` : ''}`;
    if (e.state === 'open') return `<button class="btn pri block" data-act="register" data-id="${e.id}">Register now</button><p class="sm mut" style="margin-top:8px">${e.teamMax === 1 ? 'Individual participation' : `Team of ${e.teamMin === e.teamMax ? e.teamMin : e.teamMin + '-' + e.teamMax}. Create a team or join with a code.`}</p>`;
    return `<button class="btn block" disabled>${e.state === 'full' ? 'Event is full' : e.state === 'started' ? 'Event in progress' : 'Registration closed'}</button>`;
  })();
  $('#app').innerHTML = `<div class="wrap"><p class="sm"><a href="#/">← All events</a></p>
  <div class="card dhead"><span class="mono c-${e.category}">${esc(e.orgShort)}</span><div class="grow"><h1 style="margin:0">${esc(e.title)}</h1><div class="org mut">${esc(e.orgName)}</div><div class="tags"><span class="tag">${esc(e.category)}</span><span class="tag gray">${esc(e.mode)}</span><span class="tag ${k}">${l}</span></div></div>
  <button class="heart ${e.saved ? 'on' : ''}" style="position:static;font-size:1.6rem" data-act="save" data-id="${e.id}" aria-label="Save event">${e.saved ? '♥' : '♡'}</button></div>
  <div class="cols" style="margin-top:6px"><div><div class="tabs">${tabs.map(([v, t]) => `<button class="${state.tab === v ? 'on' : ''}" data-act="tab" data-v="${v}">${t}</button>`).join('')}</div>${body}</div>
  <aside class="side"><div class="card pad"><dl class="kv"><dt>Registered</dt><dd>${e.registered}/${e.capacity}</dd><dt>Teams</dt><dd>${e.teamCount}</dd><dt>Registration</dt><dd>${e.daysLeft >= 0 ? left(e.daysLeft) : 'Closed'}</dd><dt>Deadline</dt><dd>${fmt(e.deadline)}</dd><dt>Event on</dt><dd>${fmt(e.eventDate)}</dd><dt>Current round</dt><dd>${esc(cur?.name || '')}</dd></dl><div style="margin-top:14px">${regBox}</div></div></aside></div></div>`;
  const sf = $('#subf'); if (sf) sf.addEventListener('submit', ev => { ev.preventDefault(); submitForm(sf, (d, f) => {
    const file = $('[name=file]', f).files[0]; const e2 = {}; if (d.link && !/^https?:\/\/\S+\.\S+/i.test(d.link)) e2.link = 'Enter a valid link starting with http(s)://';
    if (!d.link && !file) e2.link = 'Provide a link or upload a file.'; if (file && file.size > 3 * 1024 * 1024) e2.file = 'File must be under 3 MB.'; return e2;
  }, async d => {
    const file = $('[name=file]', sf).files[0]; let fo; if (file) fo = { name: file.name, data: await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result.split(',')[1]); fr.readAsDataURL(file); }) };
    await api('POST', `/api/events/${e.id}/submissions`, { link: d.link, note: d.note, file: fo }); toast('Submission saved', 'ok'); await viewEvent(e.id);
  }); });
}
const canManageEv = e => state.user.role === 'superadmin' || state.user.orgId === e.orgId;
function openRegister(id) {
  const e = state.detail.event;
  if (e.teamMax === 1) return doRegister(id, { mode: 'solo' });
  const o = modal(`<h3>Register for ${esc(e.title)}</h3><div class="seg" style="margin-top:10px"><a href="javascript:void 0" class="on" data-m="create">Create a team</a><a href="javascript:void 0" data-m="join">Join with code</a></div>
  <form id="regf" novalidate><div data-p="create">${field('Team name', 'teamName', { ph: 'e.g. Product Pirates' })}<p class="sm mut">You become the team leader. You’ll get a code to share (team of ${e.teamMin}-${e.teamMax}).</p></div><div data-p="join" hidden>${field('Team code', 'teamCode', { ph: '6-character code', attrs: 'maxlength="6" style="text-transform:uppercase"' })}</div><button class="btn pri block" type="submit" style="margin-top:8px">Register</button></form>`);
  let mode = 'create'; const f = $('#regf', o);
  $$('[data-m]', o).forEach(a => a.onclick = () => { mode = a.dataset.m; $$('[data-m]', o).forEach(x => x.classList.toggle('on', x === a)); $$('[data-p]', o).forEach(p => p.hidden = p.dataset.p !== mode); showErrors(f, {}); });
  f.addEventListener('submit', ev => { ev.preventDefault(); const d = formData(f); const err = {};
    if (mode === 'create' && (d.teamName || '').trim().length < 2) err.teamName = 'Enter a team name (2-40 characters).'; if (mode === 'join' && !/^[A-Za-z0-9]{6}$/.test(d.teamCode || '')) err.teamCode = 'Enter the 6-character team code.';
    showErrors(f, err); if (Object.keys(err).length) return;
    api('POST', `/api/events/${id}/register`, { mode, teamName: d.teamName, teamCode: d.teamCode }).then(() => { o.remove(); toast('Registered!', 'ok'); viewEvent(id); }).catch(x => { showErrors(f, x.fields || {}, x.message); if (!Object.keys(x.fields || {}).length) toast(x.message, 'bad'); });
  });
}
async function doRegister(id, body) { try { await api('POST', `/api/events/${id}/register`, body); toast('Registered!', 'ok'); await viewEvent(id); } catch (e) { toast(e.message, 'bad'); } }

/* ============ admin dashboard ============ */
async function viewAdmin() {
  const [ov, an] = await Promise.all([api('GET', '/api/admin/overview'), api('GET', '/api/admin/announcements')]);
  const sup = state.user.role === 'superadmin', s = ov.stats;
  const tabs = [['overview', 'Official events'], ['announcements', 'Announcements'], ['meetups', 'Student meetups'], ...(sup ? [['users', 'Users']] : []), ['sync', 'Google Sheet']];
  let body = '';
  if (state.adminTab === 'overview') body = `<div class="row between" style="margin-bottom:10px"><h2>${sup ? 'All official events' : esc(state.user.orgName) + ' events'}</h2><a class="btn pri" href="#/admin/new">+ New event</a></div>
  ${ov.events.length ? `<div class="card tbl"><table><thead><tr><th>Event</th><th>Organiser</th><th>Registered</th><th>Teams</th><th>Current round</th><th>Status</th><th>Actions</th></tr></thead><tbody>${ov.events.map(e => `<tr><td><b>${esc(e.title)}</b><br><span class="mut sm">${fmt(e.eventDate)}</span></td><td>${esc(e.orgName)}</td><td>${e.registered}/${e.capacity}</td><td>${e.teamCount}</td><td>${esc(e.rounds[e.currentRound]?.name)}</td><td><span class="tag ${stateTag(e)[0]}">${stateTag(e)[1]}</span>${e.featured ? ' <span class="tag warn">Featured</span>' : ''}</td>
  <td><div class="acts"><a class="btn sm" href="#/admin/event/${e.id}">Manage</a><a class="btn sm" href="#/admin/edit/${e.id}">Edit</a><button class="btn sm" data-act="feature" data-id="${e.id}" data-v="${!e.featured}">${e.featured ? 'Unpromote' : 'Promote'}</button><button class="btn sm" data-act="toggleclose" data-id="${e.id}" data-v="${!e.closed}">${e.closed ? 'Reopen' : 'Close'}</button><button class="btn sm bad" data-act="delevent" data-id="${e.id}">Remove</button></div></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No events yet. Create one!</div>'}`;
  if (state.adminTab === 'announcements') body = `<div class="cols"><div><h2>Announcements</h2>${an.announcements.length ? `<div class="card tbl"><table><thead><tr><th>Text</th><th>Type</th><th>By</th><th>Live</th><th></th></tr></thead><tbody>${an.announcements.map(a => `<tr><td>${esc(a.text)}</td><td>${esc(a.type)}</td><td>${esc(a.orgName)}</td><td>${a.active ? 'Yes' : 'No'}</td><td><div class="acts"><button class="btn sm" data-act="annedit" data-id="${a.id}">Edit</button><button class="btn sm" data-act="anntoggle" data-id="${a.id}" data-v="${!a.active}">${a.active ? 'Hide' : 'Show'}</button><button class="btn sm bad" data-act="anndel" data-id="${a.id}">Delete</button></div></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No announcements.</div>'}</div>
  <aside class="card pad"><form id="annf" novalidate><h3>New announcement</h3>${field('Message', 'text', { rows: 3, ph: 'Shown in the banner on every page' })}${field('Type', 'type', { opts: ['info', 'event', 'urgent'] })}<button class="btn pri block" type="submit">Publish</button></form></aside></div>`;
  if (state.adminTab === 'meetups') body = `<h2>Moderate student meetups</h2>${ov.meetups.length ? `<div class="card tbl"><table><thead><tr><th>Meetup</th><th>Host</th><th>Date</th><th>Votes</th><th></th></tr></thead><tbody>${ov.meetups.map(m => `<tr><td><b>${esc(m.title)}</b><br><span class="mut sm">${esc(m.venue)}</span></td><td>${esc(m.hostName)}</td><td>${fmt(m.date)}</td><td>${m.going} in · ${m.maybe} maybe</td><td><button class="btn sm bad" data-act="delmeetup" data-id="${m.id}">Remove</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No meetups.</div>'}`;
  if (state.adminTab === 'users' && sup) { const us = (await api('GET', '/api/admin/users')).users; body = `<h2>Users (${us.length})</h2><div class="card tbl"><table><thead><tr><th>Name</th><th>Email</th><th>College ID</th><th>Role</th><th>Teams</th><th></th></tr></thead><tbody>${us.map(u => `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${esc(u.collegeId)}</td><td><span class="tag ${u.role === 'student' ? 'gray' : ''}">${esc(u.role)}${u.orgName ? ' · ' + esc(u.orgName) : ''}</span></td><td>${u.teams}</td><td><div class="acts"><button class="btn sm" data-act="resetpw" data-id="${u.id}" data-n="${esc(u.name)}">Reset password</button>${u.id !== state.user.id ? `<button class="btn sm bad" data-act="deluser" data-id="${u.id}" data-n="${esc(u.name)}">Delete</button>` : ''}</div></td></tr>`).join('')}</tbody></table></div>`; }
  if (state.adminTab === 'sync') { const sy = ov.sync; body = `<div class="card pad" style="max-width:640px"><h2>Google Sheet (live backup)</h2><p class="mut">Every change (users, events, teams, submissions, meetups, announcements) is pushed to your Google Sheet within seconds.</p><dl class="kv"><dt>Status</dt><dd><span class="tag ${sy.status === 'ok' ? 'ok' : sy.status === 'error' ? 'bad' : 'gray'}">${esc(sy.status)}</span></dd><dt>Last sync</dt><dd>${sy.last ? new Date(sy.last).toLocaleString() : 'never'}</dd>${sy.error ? `<dt>Error</dt><dd>${esc(sy.error)}</dd>` : ''}</dl>${sy.configured ? '<button class="btn pri" data-act="syncnow" style="margin-top:12px">Sync now</button>' : '<p class="sm" style="margin-top:12px">Not connected yet. Follow the README (Apps Script webhook), then set <code>SHEETS_WEBHOOK_URL</code> and restart.</p>'}</div>`; }
  $('#app').innerHTML = `<div class="wrap"><h1>Admin dashboard</h1><p class="mut">Manage official events and moderate student-led meetups${sup ? ' across all clubs and committees' : ''}.</p>
  <div class="stat-row"><div class="card stat"><b>${s.events}</b><span>Official events</span></div><div class="card stat"><b>${s.meetups}</b><span>Student meetups</span></div><div class="card stat"><b>${s.participants}</b><span>Total registrations</span></div><div class="card stat"><b>${s.teams}</b><span>Teams formed</span></div><div class="card stat"><b>${s.pendingReview}</b><span>Submissions to score</span></div>${sup ? `<div class="card stat"><b>${s.students}</b><span>Students signed up</span></div>` : ''}</div>
  <div class="tabs">${tabs.map(([v, t]) => `<button class="${state.adminTab === v ? 'on' : ''}" data-act="admintab" data-v="${v}">${t}</button>`).join('')}</div>${body}</div>`;
  const af = $('#annf'); if (af) af.addEventListener('submit', ev => { ev.preventDefault(); submitForm(af, d => clean({ text: V.min(d.text, 5, 'Announcement must be at least 5 characters.') }), async d => { await api('POST', '/api/admin/announcements', d); toast('Announcement published', 'ok'); viewAdmin(); }); });
  state.annList = an.announcements;
}

function roundRow(r = {}, i = 0) {
  return `<div class="roundrow" data-round><label class="f">Round name<input name="rname" value="${esc(r.name)}" placeholder="e.g. Ideation deck"></label><label class="f">Type<select name="rtype"><option value="live" ${r.type !== 'submission' ? 'selected' : ''}>Live round</option><option value="submission" ${r.type === 'submission' ? 'selected' : ''}>Document submission</option></select></label><label class="f">Due date (submission)<input type="date" name="rdue" value="${esc(r.dueDate || '')}"></label><button type="button" class="btn sm bad" data-act="rmround">✕</button><label class="f" style="grid-column:1/-1">Description<input name="rdesc" value="${esc(r.description)}" placeholder="What happens in this round?"></label></div>`;
}
async function viewEventForm(id) {
  const ex = id ? (await api('GET', '/api/admin/events/' + id)).event : null; const sup = state.user.role === 'superadmin';
  const orgs = sup && !ex ? (await api('GET', '/api/admin/overview')).orgs : [];
  $('#app').innerHTML = `<div class="wrap" style="max-width:820px"><p class="sm"><a href="#/admin">← Admin dashboard</a></p><h1>${ex ? 'Edit event' : 'Create official event'}</h1><div class="card pad"><form id="evf" novalidate>
  ${sup && !ex ? `<label class="f" data-f="orgId">Organiser<select name="orgId">${orgs.map(o => `<option value="${o.id}">${esc(o.name)}</option>`).join('')}</select><span class="err"></span></label>` : ''}
  ${field('Title', 'title', { value: ex?.title })}${field('Description', 'description', { rows: 4, value: ex?.description, ph: 'What is this event about? Who should join?' })}
  <div class="grid3">${field('Category', 'category', { opts: CATS, value: ex?.category || 'Tech' })}${field('Mode', 'mode', { opts: ['Offline', 'Online', 'Hybrid'], value: ex?.mode || 'Offline' })}${field('Venue / link', 'venue', { value: ex?.venue })}</div>
  <div class="grid2">${field('Event date', 'eventDate', { type: 'date', value: ex?.eventDate })}${field('Registration deadline', 'deadline', { type: 'date', value: ex?.deadline })}</div>
  <div class="grid3">${field('Min team size', 'teamMin', { type: 'number', value: ex?.teamMin ?? 1, attrs: 'min="1" max="10"' })}${field('Max team size', 'teamMax', { type: 'number', value: ex?.teamMax ?? 1, attrs: 'min="1" max="12"' })}${field('Capacity (participants)', 'capacity', { type: 'number', value: ex?.capacity ?? 100, attrs: 'min="1"' })}</div>
  <div class="grid2">${field('Rewards (optional)', 'prize', { value: ex?.prize })}${field('Eligibility (optional)', 'eligibility', { value: ex?.eligibility })}</div>
  <h3>Rounds</h3><p class="sm mut">Document-submission rounds let teams upload files or links; live rounds are run and scored by you.</p><div id="rounds">${(ex?.rounds || [{ type: 'live' }]).map(roundRow).join('')}</div><span class="err" id="roundserr" style="margin-bottom:8px"></span><button type="button" class="btn sm" data-act="addround">+ Add round</button>
  <div class="row" style="margin-top:18px"><button class="btn pri" type="submit">${ex ? 'Save changes' : 'Create event'}</button><a class="btn" href="#/admin">Cancel</a></div></form></div></div>`;
  const f = $('#evf');
  const rounds = () => $$('[data-round]', f).map(r => ({ name: $('[name=rname]', r).value, type: $('[name=rtype]', r).value, dueDate: $('[name=rdue]', r).value, description: $('[name=rdesc]', r).value }));
  f.addEventListener('submit', ev => { ev.preventDefault(); $('#roundserr').textContent = '';
    submitForm(f, d => {
      const e = { title: V.min(d.title, 3, 'Title must be at least 3 characters.'), description: V.min(d.description, 10, 'Add a description (at least 10 characters).'), venue: V.min(d.venue, 2, 'Enter a venue or link.'), eventDate: V.date(d.eventDate), deadline: V.date(d.deadline) };
      if (!e.deadline && !e.eventDate && d.deadline > d.eventDate) e.deadline = 'Deadline must be on or before the event date.';
      const mn = +d.teamMin, mx = +d.teamMax, cp = +d.capacity;
      if (!Number.isInteger(mn) || mn < 1 || mn > 10) e.teamMin = 'Min team size: 1-10.'; if (!Number.isInteger(mx) || mx < 1 || mx > 12) e.teamMax = 'Max team size: 1-12.'; else if (mx < mn) e.teamMax = 'Max must be at least min.';
      if (!Number.isInteger(cp) || cp < 1) e.capacity = 'Capacity must be at least 1.';
      const rs = rounds(); const rbad = rs.findIndex(r => r.name.trim().length < 2 || (r.type === 'submission' && !r.dueDate));
      if (rbad >= 0) $('#roundserr').textContent = rs[rbad].name.trim().length < 2 ? `Round ${rbad + 1} needs a name.` : `Round ${rbad + 1} is a submission round and needs a due date.`;
      const c = clean(e); return $('#roundserr').textContent ? { ...c } : c;
    }, async d => {
      if ($('#roundserr').textContent) return;
      const body = { ...d, rounds: rounds() }; const r = ex ? await api('PUT', '/api/admin/events/' + ex.id, body) : await api('POST', '/api/admin/events', body);
      toast(ex ? 'Event updated' : 'Event created', 'ok'); location.hash = '#/admin/event/' + r.event.id;
    });
    if ($('#roundserr').textContent) $('#roundserr').scrollIntoView({ block: 'center' });
  });
}

async function viewManage(id) {
  const d = await api('GET', '/api/admin/events/' + id); const e = d.event; state.manage = d;
  const q = (state.mq || '').toLowerCase(); const teams = d.teams.filter(t => !q || (t.name + t.members.map(m => m.name + m.email + m.collegeId).join(' ')).toLowerCase().includes(q));
  const tname = tid => d.teams.find(t => t.id === tid)?.name;
  $('#app').innerHTML = `<div class="wrap"><p class="sm"><a href="#/admin">← Admin dashboard</a></p>
  <div class="row between"><div><h1 style="margin:0">${esc(e.title)}</h1><p class="mut">${esc(e.orgName)} · ${fmt(e.eventDate)} · ${esc(e.venue)}</p></div><div class="acts"><a class="btn" href="#/event/${e.id}">Public page</a><a class="btn" href="#/admin/edit/${e.id}">Edit</a><a class="btn" href="/api/admin/events/${e.id}/export.csv">Export CSV</a></div></div>
  <div class="stat-row"><div class="card stat"><b>${e.registered}/${e.capacity}</b><span>Participants</span></div><div class="card stat"><b>${d.teams.length}</b><span>Teams</span></div><div class="card stat"><b>${d.teams.filter(t => t.status === 'active').length}</b><span>Active teams</span></div><div class="card stat"><b>${d.submissions.length}</b><span>Submissions</span></div></div>
  <div class="card pad"><div class="row between"><h3>Rounds</h3><button class="btn pri sm" data-act="nextround" data-id="${e.id}" ${e.currentRound >= e.rounds.length - 1 ? 'disabled' : ''}>Advance to next round →</button></div><div class="timeline" style="margin-top:10px">${e.rounds.map((r, i) => `<div class="tl ${i < e.currentRound ? 'done' : i === e.currentRound ? 'cur' : ''}"><div class="row"><b>Round ${i + 1}: ${esc(r.name)}</b><span class="tag gray">${r.type === 'submission' ? 'Submission' : 'Live'}</span>${r.dueDate ? `<span class="tag">Due ${fmt(r.dueDate)}</span>` : ''}${i === e.currentRound ? '<span class="tag ok">Current</span>' : `<button class="btn sm" data-act="setround" data-id="${e.id}" data-v="${i}">Set as current</button>`}</div></div>`).join('')}</div><p class="sm mut">Advancing moves all active teams into the next round. Eliminate teams first to keep them out.</p></div>
  <div class="card pad" style="margin-top:16px"><div class="row between"><h3>Teams & participants (${d.teams.length})</h3><input class="sel" id="mq" placeholder="Search name, email, ID…" value="${esc(state.mq || '')}"></div>
  ${teams.length ? `<div class="tbl"><table><thead><tr><th>Team</th><th>Members</th><th>Status</th><th>Round</th><th>Actions</th></tr></thead><tbody>${teams.map(t => `<tr><td><b>${esc(t.name)}</b><br><span class="mut sm">Code ${esc(t.code)}</span></td><td>${t.members.map(m => `<div class="sm">${esc(m.name)} <span class="mut">· ${esc(m.collegeId)} · ${esc(m.email)}</span> ${m.id === t.leaderId ? '<span class="tag">Leader</span>' : ''} <button class="btn sm bad" style="padding:0 6px" data-act="rmmember" data-t="${t.id}" data-id="${m.id}" data-n="${esc(m.name)}" title="Remove participant">✕</button></div>`).join('')}${t.members.length < e.teamMin ? `<span class="tag warn">Incomplete (needs ${e.teamMin})</span>` : ''}</td>
  <td><span class="tag ${t.status === 'eliminated' ? 'bad' : t.status === 'winner' ? 'warn' : 'ok'}">${esc(t.status)}</span></td><td>${esc(e.rounds[t.roundReached]?.name)}</td>
  <td><div class="acts">${t.status === 'active' ? `<button class="btn sm" data-act="tstatus" data-id="${t.id}" data-v="eliminated">Eliminate</button><button class="btn sm" data-act="tstatus" data-id="${t.id}" data-v="winner">Winner</button>` : `<button class="btn sm" data-act="tstatus" data-id="${t.id}" data-v="active">Reinstate</button>`}<button class="btn sm" data-act="trename" data-id="${t.id}" data-n="${esc(t.name)}">Rename</button><button class="btn sm bad" data-act="tdel" data-id="${t.id}" data-n="${esc(t.name)}">Remove</button></div></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No teams found.</div>'}</div>
  <div class="card pad" style="margin-top:16px"><h3>Submissions (${d.submissions.length})</h3>${d.submissions.length ? `<div class="tbl"><table><thead><tr><th>Team</th><th>Round</th><th>Work</th><th>Score /100</th><th>Feedback</th><th></th></tr></thead><tbody>${d.submissions.map(s => `<tr data-sub="${s.id}"><td>${esc(tname(s.teamId))}</td><td>${esc(e.rounds[s.roundIndex]?.name)}</td><td class="sm">${s.link ? `<a href="${esc(s.link)}" target="_blank" rel="noopener noreferrer">Link</a> ` : ''}${s.hasFile ? `<a href="/api/submissions/${s.id}/file">${esc(s.fileName)}</a>` : ''}${s.note ? `<br><span class="mut">${esc(s.note)}</span>` : ''}<br><span class="mut">${new Date(s.submittedAt).toLocaleString()}</span></td><td><input class="sel" style="width:74px" type="number" min="0" max="100" name="score" value="${s.score ?? ''}"></td><td><input class="sel" name="feedback" value="${esc(s.feedback)}" placeholder="Feedback"></td><td><button class="btn sm pri" data-act="savesub" data-id="${s.id}">Save</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="mut sm">No submissions yet.</p>'}</div></div>`;
  const mq = $('#mq'); if (mq) mq.addEventListener('input', e2 => { state.mq = e2.target.value; const p = e2.target.selectionStart; viewManage(id).then(() => { const n = $('#mq'); n.focus(); n.setSelectionRange(p, p); }); });
}

/* ============ actions (event delegation) ============ */
const A = {
  async logout() { await api('POST', '/api/logout'); state.user = null; renderNav(); renderAnn(); location.hash = '#/login'; route(); },
  dismiss(el) { sessionStorage.setItem('dis_' + el.dataset.id, '1'); renderAnn(); },
  recaptcha(el) { loadCaptcha(el.closest('form')); },
  cat(el) { state.cat = el.dataset.v; $$('.chip').forEach(c => c.classList.toggle('on', c === el)); renderEventList(); },
  mcat(el) { state.mcat = el.dataset.v; $$('.chip').forEach(c => c.classList.toggle('on', c === el)); renderMeetupList(); },
  async save(el, ev) {
    ev.stopPropagation(); try { const r = await api('POST', `/api/events/${el.dataset.id}/save`); const ev2 = state.events.find(x => x.id === el.dataset.id); if (ev2) ev2.saved = r.saved; if (state.detail?.event.id === el.dataset.id) state.detail.event.saved = r.saved;
      $$(`.heart[data-id="${el.dataset.id}"]`).forEach(h => { h.classList.toggle('on', r.saved); h.textContent = r.saved ? '♥' : '♡'; }); toast(r.saved ? 'Saved to My activity' : 'Removed from saved'); } catch (e) { toast(e.message, 'bad'); } },
  async vote(el) { try { const cur = $(`[data-act=vote][data-id="${el.dataset.id}"].on`); const v = cur && cur.dataset.v === el.dataset.v ? null : el.dataset.v; const r = await api('POST', `/api/meetups/${el.dataset.id}/vote`, { vote: v }); const i = state.meetups.findIndex(m => m.id === r.meetup.id); if (i >= 0) state.meetups[i] = r.meetup; if (location.hash === '#/meetups') renderMeetupList(); else route(); } catch (e) { toast(e.message, 'bad'); } },
  editmeetup(el) {
    api('GET', '/api/meetups').then(({ meetups }) => { const m = meetups.find(x => x.id === el.dataset.id); const o = modal(`<h3>Edit meetup</h3>${meetupForm(m)}`); bindMeetupForm($('#mtf', o), m, () => { o.remove(); route(); }); });
  },
  async delmeetup(el) { if (await confirmBox('Delete this meetup?', 'Delete')) { try { await api('DELETE', '/api/meetups/' + el.dataset.id); toast('Meetup deleted', 'ok'); route(); } catch (e) { toast(e.message, 'bad'); } } },
  tab(el) { state.tab = el.dataset.v; drawEvent(); },
  register(el) { openRegister(el.dataset.id); },
  async leave(el) { if (await confirmBox('Withdraw from this event? Your team slot will be released.', 'Withdraw')) { try { await api('DELETE', `/api/events/${el.dataset.id}/register`); toast('Withdrawn', 'ok'); state.tab = 'details'; await viewEvent(el.dataset.id); } catch (e) { toast(e.message, 'bad'); } } },
  copy(el) { navigator.clipboard?.writeText(el.dataset.v).then(() => toast('Code copied', 'ok'), () => toast(el.dataset.v)); },
  admintab(el) { state.adminTab = el.dataset.v; viewAdmin(); },
  async feature(el) { try { await api('PATCH', '/api/admin/events/' + el.dataset.id, { featured: el.dataset.v === 'true' }); toast('Updated', 'ok'); viewAdmin(); } catch (e) { toast(e.message, 'bad'); } },
  async toggleclose(el) { try { await api('PATCH', '/api/admin/events/' + el.dataset.id, { closed: el.dataset.v === 'true' }); toast('Updated', 'ok'); viewAdmin(); } catch (e) { toast(e.message, 'bad'); } },
  async delevent(el) { if (await confirmBox('Remove this event along with all its teams and submissions? This cannot be undone.', 'Remove event')) { try { await api('DELETE', '/api/admin/events/' + el.dataset.id); toast('Event removed', 'ok'); viewAdmin(); } catch (e) { toast(e.message, 'bad'); } } },
  addround() { $('#rounds').insertAdjacentHTML('beforeend', roundRow({ type: 'live' })); },
  rmround(el) { if ($$('[data-round]').length > 1) el.closest('[data-round]').remove(); else toast('An event needs at least one round', 'bad'); },
  async setround(el) { try { await api('POST', `/api/admin/events/${el.dataset.id}/round`, { round: +el.dataset.v }); toast('Round updated', 'ok'); viewManage(el.dataset.id); } catch (e) { toast(e.message, 'bad'); } },
  async nextround(el) { const e = state.manage.event; if (await confirmBox(`Move all active teams to "${e.rounds[e.currentRound + 1].name}"?`, 'Advance')) { try { await api('POST', `/api/admin/events/${e.id}/round`, { round: e.currentRound + 1 }); toast('Advanced to next round', 'ok'); viewManage(e.id); } catch (x) { toast(x.message, 'bad'); } } },
  async tstatus(el) { try { await api('PUT', '/api/admin/teams/' + el.dataset.id, { status: el.dataset.v }); toast('Team updated', 'ok'); viewManage(state.manage.event.id); } catch (e) { toast(e.message, 'bad'); } },
  trename(el) { const o = modal(`<h3>Rename team</h3><form id="rnf" novalidate>${field('Team name', 'name', { value: el.dataset.n })}<button class="btn pri block" type="submit">Save</button></form>`); const f = $('#rnf', o);
    f.addEventListener('submit', ev => { ev.preventDefault(); submitForm(f, d => clean({ name: V.min(d.name, 2, 'Name must be 2-40 characters.') }), async d => { await api('PUT', '/api/admin/teams/' + el.dataset.id, { name: d.name }); o.remove(); toast('Team renamed', 'ok'); viewManage(state.manage.event.id); }); }); },
  async tdel(el) { if (await confirmBox(`Remove team "${el.dataset.n}" and all of its submissions?`, 'Remove team')) { try { await api('DELETE', '/api/admin/teams/' + el.dataset.id); toast('Team removed', 'ok'); viewManage(state.manage.event.id); } catch (e) { toast(e.message, 'bad'); } } },
  async rmmember(el) { if (await confirmBox(`Remove ${el.dataset.n} from this event?`, 'Remove')) { try { await api('DELETE', `/api/admin/teams/${el.dataset.t}/members/${el.dataset.id}`); toast('Participant removed', 'ok'); viewManage(state.manage.event.id); } catch (e) { toast(e.message, 'bad'); } } },
  async savesub(el) { const tr = el.closest('tr'); const score = $('[name=score]', tr).value; if (score !== '' && (+score < 0 || +score > 100)) return toast('Score must be 0-100', 'bad'); try { await api('PUT', '/api/admin/submissions/' + el.dataset.id, { score, feedback: $('[name=feedback]', tr).value }); toast('Score saved', 'ok'); } catch (e) { toast(e.message, 'bad'); } },
  annedit(el) { const a = state.annList.find(x => x.id === el.dataset.id); const o = modal(`<h3>Edit announcement</h3><form id="aef" novalidate>${field('Message', 'text', { rows: 3, value: a.text })}${field('Type', 'type', { opts: ['info', 'event', 'urgent'], value: a.type })}<button class="btn pri block" type="submit">Save</button></form>`); const f = $('#aef', o);
    f.addEventListener('submit', ev => { ev.preventDefault(); submitForm(f, d => clean({ text: V.min(d.text, 5, 'Announcement must be at least 5 characters.') }), async d => { await api('PUT', '/api/admin/announcements/' + a.id, { ...d, active: a.active }); o.remove(); toast('Saved', 'ok'); viewAdmin(); }); }); },
  async anntoggle(el) { const a = state.annList.find(x => x.id === el.dataset.id); try { await api('PUT', '/api/admin/announcements/' + a.id, { text: a.text, type: a.type, active: el.dataset.v === 'true' }); viewAdmin(); } catch (e) { toast(e.message, 'bad'); } },
  async anndel(el) { if (await confirmBox('Delete this announcement?', 'Delete')) { try { await api('DELETE', '/api/admin/announcements/' + el.dataset.id); toast('Deleted', 'ok'); viewAdmin(); } catch (e) { toast(e.message, 'bad'); } } },
  async deluser(el) { if (await confirmBox(`Delete ${el.dataset.n}? Their registrations and hosted meetups are removed too.`, 'Delete user')) { try { await api('DELETE', '/api/admin/users/' + el.dataset.id); toast('User deleted', 'ok'); viewAdmin(); } catch (e) { toast(e.message, 'bad'); } } },
  resetpw(el) { const o = modal(`<h3>Reset password for ${esc(el.dataset.n)}</h3><form id="rpf" novalidate>${field('New password', 'password', { type: 'password', ph: 'Min 8 chars, letters + numbers' })}<button class="btn pri block" type="submit">Reset</button></form>`); const f = $('#rpf', o);
    f.addEventListener('submit', ev => { ev.preventDefault(); submitForm(f, d => clean({ password: (d.password || '').length < 8 || !/[A-Za-z]/.test(d.password) || !/\d/.test(d.password) ? 'At least 8 characters with a letter and a number.' : '' }), async d => { await api('POST', `/api/admin/users/${el.dataset.id}/password`, d); o.remove(); toast('Password reset', 'ok'); }); }); },
  async syncnow() { try { await api('POST', '/api/admin/sync'); toast('Synced to Google Sheet', 'ok'); } catch (e) { toast(e.message, 'bad'); } viewAdmin(); }
};
document.addEventListener('click', e => {
  const act = e.target.closest('[data-act]');
  if (act && A[act.dataset.act]) { e.preventDefault(); return A[act.dataset.act](act, e); }
  const card = e.target.closest('[data-href]'); if (card && !e.target.closest('a,button')) location.hash = card.dataset.href;
});

/* ============ boot ============ */
(async () => {
  try { state.user = (await api('GET', '/api/me')).user; if (state.user) await loadCore(); } catch (e) { /* offline */ }
  route();
})();
