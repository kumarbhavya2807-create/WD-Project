'use strict';
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { seed } = require('./seed');

const PORT = process.env.PORT || 3000;
const ON_VERCEL = !!process.env.VERCEL;
// Vercel's deployment filesystem is read-only; only /tmp is writable (and it is per-instance, not persistent).
const DATA = process.env.DATA_DIR || (ON_VERCEL ? path.join('/tmp', 'campus-connect') : path.join(__dirname, 'data'));
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const CAPTCHA_SECRET = process.env.CAPTCHA_SECRET || SESSION_SECRET;
const DB_FILE = path.join(DATA, 'db.json');
const UPLOADS = path.join(DATA, 'uploads');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin@123';
const SHEETS_URL = process.env.SHEETS_WEBHOOK_URL || '';
const SHEETS_SECRET = process.env.SHEETS_SECRET || 'change-me';
const CATEGORIES = ['Tech', 'Cultural', 'Sports', 'Business', 'Study', 'Social'];
const MODES = ['Online', 'Offline', 'Hybrid'];
fs.mkdirSync(UPLOADS, { recursive: true });

/* ---------- helpers ---------- */
const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString('hex');
const uid = p => p + crypto.randomBytes(4).toString('hex');
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const validDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + 'T00:00:00'));
const dayDiff = s => Math.round((new Date(s + 'T00:00:00') - new Date(ymd(new Date()) + 'T00:00:00')) / 864e5);
const str = (v, max = 5000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* ---------- database (JSON file, written on every change) ---------- */
let db;
function load() {
  if (fs.existsSync(DB_FILE)) db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  else { db = bundledDb() || seed(hashPw, ADMIN_PASSWORD); save(true); }
  db.sessions = db.sessions || {};
}
function bundledDb() {
  if (!ON_VERCEL) return null;
  // Static require so Vercel bundles the committed data file with the function.
  try { return JSON.parse(JSON.stringify(require('./data/db.json'))); } catch { return null; }
}
function save(skipSync) {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
  fs.renameSync(tmp, DB_FILE);
  if (!skipSync) scheduleSync();
}
load();
const orgOf = id => db.orgs.find(o => o.id === id);
const userOf = id => db.users.find(u => u.id === id);
const eventOf = id => db.events.find(e => e.id === id);
const teamsOf = eid => db.teams.filter(t => t.eventId === eid);
const participantCount = eid => teamsOf(eid).reduce((n, t) => n + t.members.length, 0);

/* ---------- Google Sheets sync (via Apps Script web-app webhook) ---------- */
const safeCell = v => { if (v == null) return ''; if (typeof v === 'number' || typeof v === 'boolean') return v; const s = String(v); return /^[=+\-@]/.test(s) ? "'" + s : s; };
function buildTables() {
  const T = (header, rows) => [header, ...rows].map(r => r.map(safeCell));
  const regRows = [];
  db.teams.forEach(t => { const e = eventOf(t.eventId); t.members.forEach(m => { const u = userOf(m); if (u && e) regRows.push([e.title, orgOf(e.orgId)?.name, t.name, t.code, u.id === t.leaderId ? 'Leader' : 'Member', u.name, u.email, u.collegeId, t.status, t.createdAt]); }); });
  return {
    Users: T(['User ID', 'Name', 'Email', 'College ID', 'Role', 'Organisation', 'Created At', 'Password'], db.users.map(u => [u.id, u.name, u.email, u.collegeId, u.role, orgOf(u.orgId)?.name || '', u.createdAt, '(scrypt hash stored on server only)'])),
    Organisations: T(['ID', 'Name', 'Type'], db.orgs.map(o => [o.id, o.name, o.type])),
    Events: T(['Event ID', 'Organiser', 'Title', 'Category', 'Mode', 'Venue', 'Event Date', 'Reg. Deadline', 'Team Min', 'Team Max', 'Capacity', 'Registered', 'Teams', 'Rounds', 'Current Round', 'Featured', 'Closed'],
      db.events.map(e => [e.id, orgOf(e.orgId)?.name, e.title, e.category, e.mode, e.venue, e.eventDate, e.deadline, e.teamMin, e.teamMax, e.capacity, participantCount(e.id), teamsOf(e.id).length, e.rounds.map(r => r.name).join(' > '), e.rounds[e.currentRound]?.name, e.featured ? 'Yes' : 'No', e.closed ? 'Yes' : 'No'])),
    Registrations: T(['Event', 'Organiser', 'Team', 'Team Code', 'Role', 'Name', 'Email', 'College ID', 'Team Status', 'Registered At'], regRows),
    Teams: T(['Team ID', 'Event', 'Team', 'Code', 'Leader', 'Members', 'Size', 'Status', 'Round Reached'],
      db.teams.map(t => [t.id, eventOf(t.eventId)?.title, t.name, t.code, userOf(t.leaderId)?.name, t.members.map(m => userOf(m)?.name).join(', '), t.members.length, t.status, eventOf(t.eventId)?.rounds[t.roundReached]?.name])),
    Submissions: T(['ID', 'Event', 'Team', 'Round', 'Link', 'File', 'Note', 'Submitted At', 'Score', 'Feedback'],
      db.submissions.map(s => [s.id, eventOf(s.eventId)?.title, db.teams.find(t => t.id === s.teamId)?.name, eventOf(s.eventId)?.rounds[s.roundIndex]?.name, s.link, s.fileName, s.note, s.submittedAt, s.score ?? '', s.feedback || ''])),
    Meetups: T(['ID', 'Title', 'Category', 'Mode', 'Venue', 'Date', 'Time', 'Host', 'Going', 'Maybe', 'Created At'],
      db.meetups.map(m => [m.id, m.title, m.category, m.mode, m.venue, m.date, m.time, userOf(m.hostId)?.name, Object.values(m.votes).filter(v => v === 'in').length, Object.values(m.votes).filter(v => v === 'maybe').length, m.createdAt])),
    Announcements: T(['ID', 'Text', 'Type', 'Organiser', 'Active', 'Created At'], db.announcements.map(a => [a.id, a.text, a.type, orgOf(a.orgId)?.name || 'Campus-wide', a.active ? 'Yes' : 'No', a.createdAt]))
  };
}
const sync = { configured: !!SHEETS_URL, status: SHEETS_URL ? 'idle' : 'not configured', last: null, error: null };
let syncTimer = null;
function scheduleSync() { if (!SHEETS_URL) return; clearTimeout(syncTimer); syncTimer = setTimeout(runSync, 1500); }
async function runSync() {
  if (!SHEETS_URL) return sync;
  sync.status = 'syncing';
  try {
    const r = await fetch(SHEETS_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ secret: SHEETS_SECRET, tables: buildTables() }), redirect: 'follow' });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) throw new Error(j.error || 'Sheet rejected the update (check secret / deployment)');
    sync.status = 'ok'; sync.last = new Date().toISOString(); sync.error = null;
  } catch (e) { sync.status = 'error'; sync.error = e.message; }
  return sync;
}
if (process.argv.includes('--dump')) { console.log(JSON.stringify(buildTables())); process.exit(0); }

/* ---------- sessions, captcha, rate limiting ---------- */
const parseCookies = h => Object.fromEntries((h || '').split(';').map(c => c.trim().split('=')).filter(p => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest('hex');
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const captchas = new Map();
function makeCaptcha() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let text = ''; for (let i = 0; i < 5; i++) text += chars[crypto.randomInt(chars.length)];
  const rnd = (a, b) => a + crypto.randomInt(b - a + 1);
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="150" height="50" viewBox="0 0 150 50"><rect width="150" height="50" rx="8" fill="#eef2ff"/>`;
  for (let i = 0; i < 6; i++) svg += `<line x1="${rnd(0, 150)}" y1="${rnd(0, 50)}" x2="${rnd(0, 150)}" y2="${rnd(0, 50)}" stroke="hsl(${rnd(200, 280)},50%,65%)" stroke-width="1.5"/>`;
  [...text].forEach((c, i) => { svg += `<text x="${14 + i * 26}" y="${rnd(32, 40)}" font-family="monospace" font-weight="bold" font-size="${rnd(26, 32)}" fill="hsl(${rnd(200, 280)},60%,30%)" transform="rotate(${rnd(-22, 22)} ${20 + i * 26} 28)">${c}</text>`; });
  svg += '</svg>';
  // Signed, self-contained token so any serverless instance can verify it.
  const exp = Date.now() + 5 * 60e3, nonce = crypto.randomBytes(8).toString('hex');
  const id = `${nonce}.${exp}.${hmac(CAPTCHA_SECRET, `${nonce}.${exp}.${text}`)}`;
  for (const [k, v] of captchas) if (v < Date.now()) captchas.delete(k);
  return { id, svg, text };
}
function checkCaptcha(id, input) {
  if (typeof id !== 'string' || typeof input !== 'string') return false;
  const [nonce, exp, sig] = id.split('.');
  if (!nonce || !sig || !(Number(exp) > Date.now()) || captchas.has(nonce)) return false;
  captchas.set(nonce, Number(exp));
  return safeEq(sig, hmac(CAPTCHA_SECRET, `${nonce}.${exp}.${input.trim().toUpperCase()}`));
}
const fails = new Map();
const locked = email => { const f = fails.get(email); return f && f.n >= 5 && Date.now() - f.t < 10 * 60e3; };

/* ---------- app ---------- */
const app = express();
app.use(express.json({ limit: '6mb' }));
app.use(express.static(path.join(__dirname, 'public')));
const fail = (res, code, error, fields) => res.status(code).json({ error, fields });

app.use((req, res, next) => {
  const sid = parseCookies(req.headers.cookie).sid;
  req.user = readSession(sid);
  req.sid = sid;
  next();
});
const need = (req, res, next) => (req.user ? next() : fail(res, 401, 'Please sign in to continue.'));
const needAdmin = (req, res, next) => (req.user && req.user.role !== 'student' ? next() : fail(res, 403, 'Admin access required.'));
const needSuper = (req, res, next) => (req.user && req.user.role === 'superadmin' ? next() : fail(res, 403, 'Super admin access required.'));
const canManage = (u, e) => u.role === 'superadmin' || (u.role === 'admin' && u.orgId === e.orgId);
const pub = u => ({ id: u.id, name: u.name, email: u.email, collegeId: u.collegeId, role: u.role, orgId: u.orgId, orgName: orgOf(u.orgId)?.name || null });

/* ----- auth ----- */
app.get('/api/captcha', (req, res) => { const { text, ...c } = makeCaptcha(); if (process.env.CAPTCHA_DEBUG === '1') c.debugText = text; res.json(c); });

function pwProblem(pw) {
  if (typeof pw !== 'string' || pw.length < 8) return 'Password must be at least 8 characters.';
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Password must contain a letter and a number.';
  if (pw.length > 100) return 'Password is too long.';
  return null;
}
app.post('/api/register', (req, res) => {
  const name = str(req.body.name, 80), email = str(req.body.email, 120).toLowerCase(), collegeId = str(req.body.collegeId, 20).toUpperCase(), pw = req.body.password;
  const f = {};
  if (name.length < 2) f.name = 'Enter your full name.';
  if (!EMAIL_RE.test(email)) f.email = 'Enter a valid email address.';
  if (!/^[A-Z0-9]{5,15}$/.test(collegeId)) f.collegeId = 'College ID must be 5-15 letters/numbers.';
  const pp = pwProblem(pw); if (pp) f.password = pp;
  if (req.body.confirm !== pw) f.confirm = 'Passwords do not match.';
  if (Object.keys(f).length) return fail(res, 400, 'Please fix the highlighted fields.', f);
  if (!checkCaptcha(req.body.captchaId, req.body.captcha)) return fail(res, 400, 'Incorrect CAPTCHA. Try the new one.', { captcha: 'Incorrect CAPTCHA.' });
  if (db.users.some(u => u.email === email)) return fail(res, 409, 'An account with this email already exists.', { email: 'Email already registered.' });
  if (db.users.some(u => u.collegeId === collegeId)) return fail(res, 409, 'This college ID is already registered.', { collegeId: 'College ID already registered.' });
  const salt = crypto.randomBytes(16).toString('hex');
  const u = { id: uid('u_'), name, email, collegeId, role: 'student', orgId: null, salt, hash: hashPw(pw, salt), createdAt: new Date().toISOString() };
  db.users.push(u); save();
  startSession(res, u);
  res.json({ user: pub(u) });
});
// Signed session cookie (userId.exp.sig). Signing over the password hash means a password change/reset logs out old sessions.
const sessionSig = (u, exp) => hmac(SESSION_SECRET, `${u.id}.${exp}.${u.hash}`);
function readSession(sid) {
  if (typeof sid !== 'string') return undefined;
  const [userId, exp, sig] = sid.split('.');
  const u = userId && userOf(userId);
  if (!u || !(Number(exp) > Date.now()) || !safeEq(sig, sessionSig(u, exp))) return undefined;
  return u;
}
const SECURE = ON_VERCEL || process.env.NODE_ENV === 'production' ? '; Secure' : '';
function startSession(res, u) {
  const exp = Date.now() + 7 * 864e5;
  res.setHeader('Set-Cookie', `sid=${u.id}.${exp}.${sessionSig(u, exp)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${7 * 86400}${SECURE}`);
}
app.post('/api/login', (req, res) => {
  const email = str(req.body.email, 120).toLowerCase(), pw = req.body.password;
  const f = {};
  if (!EMAIL_RE.test(email)) f.email = 'Enter a valid email address.';
  if (typeof pw !== 'string' || !pw) f.password = 'Enter your password.';
  if (Object.keys(f).length) return fail(res, 400, 'Please fix the highlighted fields.', f);
  if (locked(email)) return fail(res, 429, 'Too many failed attempts. Try again in 10 minutes.');
  if (!checkCaptcha(req.body.captchaId, req.body.captcha)) return fail(res, 400, 'Incorrect CAPTCHA. Try the new one.', { captcha: 'Incorrect CAPTCHA.' });
  const u = db.users.find(x => x.email === email);
  let ok = false;
  if (u) { const a = Buffer.from(hashPw(pw, u.salt), 'hex'), b = Buffer.from(u.hash, 'hex'); ok = a.length === b.length && crypto.timingSafeEqual(a, b); }
  if (!ok) { const x = fails.get(email) || { n: 0, t: 0 }; fails.set(email, { n: x.n + 1, t: Date.now() }); return fail(res, 401, 'Incorrect email or password.'); }
  fails.delete(email);
  startSession(res, u);
  res.json({ user: pub(u) });
});
app.post('/api/logout', (req, res) => { res.setHeader('Set-Cookie', `sid=; HttpOnly; SameSite=Lax; Max-Age=0; Path=/${SECURE}`); res.json({ ok: true }); });
app.get('/api/me', (req, res) => res.json({ user: req.user ? pub(req.user) : null }));
app.post('/api/me/password', need, (req, res) => {
  const { current, password } = req.body;
  if (hashPw(String(current || ''), req.user.salt) !== req.user.hash) return fail(res, 400, 'Current password is incorrect.', { current: 'Incorrect password.' });
  const pp = pwProblem(password); if (pp) return fail(res, 400, pp, { password: pp });
  req.user.salt = crypto.randomBytes(16).toString('hex'); req.user.hash = hashPw(password, req.user.salt); save();
  res.json({ ok: true });
});

/* ----- events ----- */
function evView(e, uid_) {
  const myTeam = uid_ ? teamsOf(e.id).find(t => t.members.includes(uid_)) : null;
  const p = participantCount(e.id), dl = dayDiff(e.deadline);
  const state = e.closed ? 'closed' : dl < 0 ? 'ended' : p >= e.capacity ? 'full' : e.currentRound > 0 ? 'started' : 'open';
  return { ...e, orgName: orgOf(e.orgId)?.name, orgShort: orgOf(e.orgId)?.short, orgType: orgOf(e.orgId)?.type, registered: p, teamCount: teamsOf(e.id).length,
    daysLeft: dl, eventDays: dayDiff(e.eventDate), state, saved: !!uid_ && db.saved.some(s => s.userId === uid_ && s.eventId === e.id), myTeamId: myTeam?.id || null };
}
app.get('/api/events', need, (req, res) => res.json({ events: db.events.map(e => evView(e, req.user.id)) }));
app.get('/api/events/:id', need, (req, res) => {
  const e = eventOf(req.params.id); if (!e) return fail(res, 404, 'Event not found.');
  const mine = teamsOf(e.id).find(t => t.members.includes(req.user.id));
  const teamView = t => ({ id: t.id, name: t.name, size: t.members.length, status: t.status, roundReached: t.roundReached, leader: userOf(t.leaderId)?.name });
  const out = { event: evView(e, req.user.id), teams: teamsOf(e.id).map(teamView), myTeam: null };
  if (mine) {
    out.myTeam = { ...teamView(mine), code: mine.code, isLeader: mine.leaderId === req.user.id, members: mine.members.map(m => ({ id: m, name: userOf(m)?.name, email: userOf(m)?.email, collegeId: userOf(m)?.collegeId, leader: m === mine.leaderId })) };
    out.mySubmissions = db.submissions.filter(s => s.teamId === mine.id).map(subView);
  }
  res.json(out);
});
const subView = s => ({ id: s.id, teamId: s.teamId, roundIndex: s.roundIndex, link: s.link, fileName: s.fileName, note: s.note, submittedAt: s.submittedAt, score: s.score ?? null, feedback: s.feedback || '' });

app.post('/api/events/:id/save', need, (req, res) => {
  const e = eventOf(req.params.id); if (!e) return fail(res, 404, 'Event not found.');
  const i = db.saved.findIndex(s => s.userId === req.user.id && s.eventId === e.id);
  if (i >= 0) db.saved.splice(i, 1); else db.saved.push({ userId: req.user.id, eventId: e.id, at: new Date().toISOString() });
  save(true); res.json({ saved: i < 0 });
});

app.post('/api/events/:id/register', need, (req, res) => {
  const e = eventOf(req.params.id); if (!e) return fail(res, 404, 'Event not found.');
  if (req.user.role !== 'student') return fail(res, 403, 'Only student accounts can register for events.');
  const v = evView(e, req.user.id);
  if (v.myTeamId) return fail(res, 409, 'You are already registered for this event.');
  if (v.state === 'closed' || v.state === 'ended') return fail(res, 400, 'Registrations are closed for this event.');
  if (v.state === 'started') return fail(res, 400, 'This event has already moved past the first round.');
  const mode = req.body.mode;
  const now = new Date().toISOString();
  if (e.teamMax === 1 || mode === 'solo') {
    if (e.teamMax > 1 && e.teamMin > 1) return fail(res, 400, `This event needs a team of ${e.teamMin}-${e.teamMax}.`);
    if (v.registered + 1 > e.capacity) return fail(res, 400, 'This event is full.');
    db.teams.push({ id: uid('t_'), eventId: e.id, name: req.user.name, code: crypto.randomBytes(3).toString('hex').toUpperCase(), leaderId: req.user.id, members: [req.user.id], status: 'active', roundReached: 0, createdAt: now });
  } else if (mode === 'create') {
    const name = str(req.body.teamName, 40);
    if (name.length < 2) return fail(res, 400, 'Enter a team name (2-40 characters).', { teamName: 'Enter a team name (2-40 characters).' });
    if (teamsOf(e.id).some(t => t.name.toLowerCase() === name.toLowerCase())) return fail(res, 409, 'That team name is taken for this event.', { teamName: 'Team name already taken.' });
    if (v.registered + 1 > e.capacity) return fail(res, 400, 'This event is full.');
    db.teams.push({ id: uid('t_'), eventId: e.id, name, code: crypto.randomBytes(3).toString('hex').toUpperCase(), leaderId: req.user.id, members: [req.user.id], status: 'active', roundReached: 0, createdAt: now });
  } else if (mode === 'join') {
    const code = str(req.body.teamCode, 10).toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) return fail(res, 400, 'Team codes are 6 characters.', { teamCode: 'Enter the 6-character team code.' });
    const t = teamsOf(e.id).find(x => x.code === code);
    if (!t) return fail(res, 404, 'No team with that code for this event.', { teamCode: 'No team with that code.' });
    if (t.members.length >= e.teamMax) return fail(res, 400, 'That team is already full.', { teamCode: 'Team is full.' });
    if (v.registered + 1 > e.capacity) return fail(res, 400, 'This event is full.');
    t.members.push(req.user.id);
  } else return fail(res, 400, 'Choose to create a team or join one.');
  save(); res.json({ ok: true });
});
function removeMember(e, t, userId) {
  t.members = t.members.filter(m => m !== userId);
  if (!t.members.length) { db.submissions = db.submissions.filter(s => { if (s.teamId === t.id) { if (s.file) fs.rmSync(path.join(UPLOADS, s.file), { force: true }); return false; } return true; }); db.teams = db.teams.filter(x => x.id !== t.id); }
  else if (t.leaderId === userId) t.leaderId = t.members[0];
}
app.delete('/api/events/:id/register', need, (req, res) => {
  const e = eventOf(req.params.id); if (!e) return fail(res, 404, 'Event not found.');
  const t = teamsOf(e.id).find(x => x.members.includes(req.user.id)); if (!t) return fail(res, 404, 'You are not registered for this event.');
  if (e.currentRound > 0) return fail(res, 400, 'You cannot withdraw after the event has progressed past round 1.');
  removeMember(e, t, req.user.id); save(); res.json({ ok: true });
});

const ALLOWED_EXT = ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'png', 'jpg', 'jpeg', 'zip', 'txt'];
app.post('/api/events/:id/submissions', need, (req, res) => {
  const e = eventOf(req.params.id); if (!e) return fail(res, 404, 'Event not found.');
  const t = teamsOf(e.id).find(x => x.members.includes(req.user.id)); if (!t) return fail(res, 403, 'Register for this event first.');
  const r = e.rounds[e.currentRound];
  if (!r || r.type !== 'submission') return fail(res, 400, 'The current round does not accept submissions.');
  if (t.status !== 'active') return fail(res, 400, `Your team is ${t.status} and cannot submit.`);
  if (t.roundReached !== e.currentRound) return fail(res, 400, 'Your team is not part of this round.');
  if (r.dueDate && dayDiff(r.dueDate) < 0) return fail(res, 400, 'The deadline for this round has passed.');
  const link = str(req.body.link, 500), note = str(req.body.note, 1000), file = req.body.file;
  const f = {};
  if (link && !/^https?:\/\/\S+\.\S+/i.test(link)) f.link = 'Enter a valid link starting with http(s)://';
  if (!link && !file) f.link = 'Provide a link or upload a file.';
  let buf = null, ext = '';
  if (file) {
    ext = String(file.name || '').split('.').pop().toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) f.file = 'Allowed file types: ' + ALLOWED_EXT.join(', ');
    else { buf = Buffer.from(String(file.data || ''), 'base64'); if (!buf.length) f.file = 'File is empty.'; else if (buf.length > 3 * 1024 * 1024) f.file = 'File must be under 3 MB.'; }
  }
  if (Object.keys(f).length) return fail(res, 400, 'Please fix the highlighted fields.', f);
  let s = db.submissions.find(x => x.teamId === t.id && x.roundIndex === e.currentRound);
  if (!s) { s = { id: uid('s_'), eventId: e.id, teamId: t.id, roundIndex: e.currentRound }; db.submissions.push(s); }
  if (buf) { if (s.file) fs.rmSync(path.join(UPLOADS, s.file), { force: true }); s.file = s.id + '.' + ext; s.fileName = String(file.name).replace(/[^\w.\- ]/g, '_').slice(0, 80); fs.writeFileSync(path.join(UPLOADS, s.file), buf); }
  Object.assign(s, { link, note, submittedAt: new Date().toISOString(), submittedBy: req.user.id });
  save(); res.json({ submission: subView(s) });
});
app.get('/api/submissions/:id/file', need, (req, res) => {
  const s = db.submissions.find(x => x.id === req.params.id); if (!s || !s.file) return fail(res, 404, 'File not found.');
  const e = eventOf(s.eventId), t = db.teams.find(x => x.id === s.teamId);
  if (!(canManage(req.user, e) || (t && t.members.includes(req.user.id)))) return fail(res, 403, 'Not allowed.');
  res.download(path.join(UPLOADS, s.file), s.fileName);
});

app.get('/api/me/activity', need, (req, res) => {
  const myTeams = db.teams.filter(t => t.members.includes(req.user.id));
  res.json({
    registered: myTeams.map(t => ({ team: { id: t.id, name: t.name, status: t.status, roundReached: t.roundReached, size: t.members.length }, event: evView(eventOf(t.eventId), req.user.id) })),
    saved: db.saved.filter(s => s.userId === req.user.id).map(s => eventOf(s.eventId)).filter(Boolean).map(e => evView(e, req.user.id)),
    hosted: db.meetups.filter(m => m.hostId === req.user.id).map(m => mtView(m, req.user.id))
  });
});

/* ----- announcements ----- */
app.get('/api/announcements', need, (req, res) => res.json({ announcements: db.announcements.filter(a => a.active).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(a => ({ ...a, orgName: orgOf(a.orgId)?.name || 'Campus' })) }));

/* ----- student meetups (no registration; announcement + vote) ----- */
const mtView = (m, uid_) => {
  const vs = Object.values(m.votes || {});
  return { id: m.id, title: m.title, category: m.category, mode: m.mode, venue: m.venue, date: m.date, time: m.time, description: m.description, hostId: m.hostId, hostName: userOf(m.hostId)?.name || 'Unknown',
    going: vs.filter(v => v === 'in').length, maybe: vs.filter(v => v === 'maybe').length, myVote: (m.votes || {})[uid_] || null, daysLeft: dayDiff(m.date), createdAt: m.createdAt };
};
function meetupBody(b, existing) {
  const f = {}, o = { title: str(b.title, 80), category: b.category, mode: b.mode, venue: str(b.venue, 100), date: b.date, time: str(b.time, 5), description: str(b.description, 500) };
  if (o.title.length < 3) f.title = 'Title must be at least 3 characters.';
  if (!CATEGORIES.includes(o.category)) f.category = 'Choose a category.';
  if (!MODES.includes(o.mode)) f.mode = 'Choose a mode.';
  if (o.venue.length < 2) f.venue = 'Enter a venue or meeting link.';
  if (!validDate(o.date)) f.date = 'Choose a valid date.'; else if (!existing && dayDiff(o.date) < 0) f.date = 'Date cannot be in the past.';
  if (o.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(o.time)) f.time = 'Use HH:MM (24h).';
  return { f, o };
}
app.get('/api/meetups', need, (req, res) => res.json({ meetups: db.meetups.map(m => mtView(m, req.user.id)) }));
app.post('/api/meetups', need, (req, res) => {
  const { f, o } = meetupBody(req.body); if (Object.keys(f).length) return fail(res, 400, 'Please fix the highlighted fields.', f);
  const m = { id: uid('m_'), ...o, hostId: req.user.id, votes: {}, createdAt: new Date().toISOString() };
  db.meetups.push(m); save(); res.json({ meetup: mtView(m, req.user.id) });
});
app.put('/api/meetups/:id', need, (req, res) => {
  const m = db.meetups.find(x => x.id === req.params.id); if (!m) return fail(res, 404, 'Meetup not found.');
  if (m.hostId !== req.user.id && req.user.role === 'student') return fail(res, 403, 'Only the host can edit this meetup.');
  const { f, o } = meetupBody(req.body, m); if (Object.keys(f).length) return fail(res, 400, 'Please fix the highlighted fields.', f);
  Object.assign(m, o); save(); res.json({ meetup: mtView(m, req.user.id) });
});
app.delete('/api/meetups/:id', need, (req, res) => {
  const m = db.meetups.find(x => x.id === req.params.id); if (!m) return fail(res, 404, 'Meetup not found.');
  if (m.hostId !== req.user.id && req.user.role === 'student') return fail(res, 403, 'Only the host can delete this meetup.');
  db.meetups = db.meetups.filter(x => x !== m); save(); res.json({ ok: true });
});
app.post('/api/meetups/:id/vote', need, (req, res) => {
  const m = db.meetups.find(x => x.id === req.params.id); if (!m) return fail(res, 404, 'Meetup not found.');
  const v = req.body.vote; if (!['in', 'maybe', null].includes(v)) return fail(res, 400, 'Invalid vote.');
  if (v === null || m.votes[req.user.id] === v) delete m.votes[req.user.id]; else m.votes[req.user.id] = v;
  save(); res.json({ meetup: mtView(m, req.user.id) });
});

/* ----- admin: events ----- */
function eventBody(b, user) {
  const f = {};
  const o = { title: str(b.title, 100), description: str(b.description, 2000), category: b.category, mode: b.mode, venue: str(b.venue, 120), eventDate: b.eventDate, deadline: b.deadline,
    teamMin: Number(b.teamMin), teamMax: Number(b.teamMax), capacity: Number(b.capacity), prize: str(b.prize, 150), eligibility: str(b.eligibility, 200) };
  if (o.title.length < 3) f.title = 'Title must be at least 3 characters.';
  if (o.description.length < 10) f.description = 'Add a description (at least 10 characters).';
  if (!CATEGORIES.includes(o.category)) f.category = 'Choose a category.';
  if (!MODES.includes(o.mode)) f.mode = 'Choose a mode.';
  if (o.venue.length < 2) f.venue = 'Enter a venue or link.';
  if (!validDate(o.eventDate)) f.eventDate = 'Choose a valid event date.';
  if (!validDate(o.deadline)) f.deadline = 'Choose a valid deadline.'; else if (validDate(o.eventDate) && o.deadline > o.eventDate) f.deadline = 'Deadline must be on or before the event date.';
  if (!Number.isInteger(o.teamMin) || o.teamMin < 1 || o.teamMin > 10) f.teamMin = 'Min team size: 1-10.';
  if (!Number.isInteger(o.teamMax) || o.teamMax < 1 || o.teamMax > 12) f.teamMax = 'Max team size: 1-12.'; else if (o.teamMax < o.teamMin) f.teamMax = 'Max must be at least min.';
  if (!Number.isInteger(o.capacity) || o.capacity < 1 || o.capacity > 5000) f.capacity = 'Capacity: 1-5000 participants.';
  if (!Array.isArray(b.rounds) || b.rounds.length < 1 || b.rounds.length > 8) f.rounds = 'Add 1-8 rounds.';
  else {
    o.rounds = b.rounds.map(r => ({ name: str(r.name, 60), type: r.type === 'submission' ? 'submission' : 'live', description: str(r.description, 300), dueDate: r.type === 'submission' && r.dueDate ? r.dueDate : null }));
    o.rounds.forEach((r, i) => { if (r.name.length < 2) f.rounds = `Round ${i + 1} needs a name.`; else if (r.type === 'submission' && !validDate(r.dueDate)) f.rounds = `Round ${i + 1} (submission) needs a due date.`; });
  }
  let orgId = user.role === 'admin' ? user.orgId : b.orgId;
  if (!orgOf(orgId)) f.orgId = 'Choose an organiser.';
  o.orgId = orgId;
  return { f, o };
}
app.post('/api/admin/events', needAdmin, (req, res) => {
  const { f, o } = eventBody(req.body, req.user); if (Object.keys(f).length) return fail(res, 400, 'Please fix the highlighted fields.', f);
  const e = { id: uid('e_'), ...o, featured: false, closed: false, currentRound: 0, createdAt: new Date().toISOString() };
  db.events.push(e); save(); res.json({ event: evView(e, req.user.id) });
});
app.put('/api/admin/events/:id', needAdmin, (req, res) => {
  const e = eventOf(req.params.id); if (!e) return fail(res, 404, 'Event not found.'); if (!canManage(req.user, e)) return fail(res, 403, 'Not your event.');
  const { f, o } = eventBody({ ...req.body, orgId: e.orgId }, req.user); if (Object.keys(f).length) return fail(res, 400, 'Please fix the highlighted fields.', f);
  if (e.currentRound >= o.rounds.length) return fail(res, 400, 'Cannot remove the round that is currently active.', { rounds: 'Cannot remove the active round.' });
  Object.assign(e, o); save(); res.json({ event: evView(e, req.user.id) });
});
app.patch('/api/admin/events/:id', needAdmin, (req, res) => {
  const e = eventOf(req.params.id); if (!e) return fail(res, 404, 'Event not found.'); if (!canManage(req.user, e)) return fail(res, 403, 'Not your event.');
  if (typeof req.body.featured === 'boolean') e.featured = req.body.featured;
  if (typeof req.body.closed === 'boolean') e.closed = req.body.closed;
  save(); res.json({ event: evView(e, req.user.id) });
});
app.delete('/api/admin/events/:id', needAdmin, (req, res) => {
  const e = eventOf(req.params.id); if (!e) return fail(res, 404, 'Event not found.'); if (!canManage(req.user, e)) return fail(res, 403, 'Not your event.');
  db.submissions.filter(s => s.eventId === e.id && s.file).forEach(s => fs.rmSync(path.join(UPLOADS, s.file), { force: true }));
  db.submissions = db.submissions.filter(s => s.eventId !== e.id); db.teams = db.teams.filter(t => t.eventId !== e.id);
  db.saved = db.saved.filter(s => s.eventId !== e.id); db.events = db.events.filter(x => x !== e); save(); res.json({ ok: true });
});
app.get('/api/admin/events/:id', needAdmin, (req, res) => {
  const e = eventOf(req.params.id); if (!e) return fail(res, 404, 'Event not found.'); if (!canManage(req.user, e)) return fail(res, 403, 'Not your event.');
  res.json({ event: evView(e, req.user.id),
    teams: teamsOf(e.id).map(t => ({ id: t.id, name: t.name, code: t.code, status: t.status, roundReached: t.roundReached, leaderId: t.leaderId, createdAt: t.createdAt,
      members: t.members.map(m => { const u = userOf(m); return { id: m, name: u?.name, email: u?.email, collegeId: u?.collegeId }; }) })),
    submissions: db.submissions.filter(s => s.eventId === e.id).map(s => ({ ...subView(s), hasFile: !!s.file })) });
});
app.post('/api/admin/events/:id/round', needAdmin, (req, res) => {
  const e = eventOf(req.params.id); if (!e) return fail(res, 404, 'Event not found.'); if (!canManage(req.user, e)) return fail(res, 403, 'Not your event.');
  const n = Number(req.body.round);
  if (!Number.isInteger(n) || n < 0 || n >= e.rounds.length) return fail(res, 400, 'Invalid round.');
  e.currentRound = n;
  teamsOf(e.id).forEach(t => { if (t.status === 'active' && n > t.roundReached) t.roundReached = n; });
  save(); res.json({ event: evView(e, req.user.id) });
});
app.put('/api/admin/teams/:id', needAdmin, (req, res) => {
  const t = db.teams.find(x => x.id === req.params.id); if (!t) return fail(res, 404, 'Team not found.');
  const e = eventOf(t.eventId); if (!canManage(req.user, e)) return fail(res, 403, 'Not your event.');
  if (req.body.status !== undefined) { if (!['active', 'eliminated', 'winner'].includes(req.body.status)) return fail(res, 400, 'Invalid status.'); t.status = req.body.status; if (t.status === 'active') t.roundReached = Math.max(t.roundReached, 0); }
  if (req.body.name !== undefined) { const n = str(req.body.name, 40); if (n.length < 2) return fail(res, 400, 'Team name must be 2-40 characters.', { name: 'Invalid name.' }); if (teamsOf(e.id).some(x => x.id !== t.id && x.name.toLowerCase() === n.toLowerCase())) return fail(res, 409, 'Team name already taken.'); t.name = n; }
  save(); res.json({ ok: true });
});
app.delete('/api/admin/teams/:id', needAdmin, (req, res) => {
  const t = db.teams.find(x => x.id === req.params.id); if (!t) return fail(res, 404, 'Team not found.');
  if (!canManage(req.user, eventOf(t.eventId))) return fail(res, 403, 'Not your event.');
  db.submissions.filter(s => s.teamId === t.id && s.file).forEach(s => fs.rmSync(path.join(UPLOADS, s.file), { force: true }));
  db.submissions = db.submissions.filter(s => s.teamId !== t.id); db.teams = db.teams.filter(x => x !== t); save(); res.json({ ok: true });
});
app.delete('/api/admin/teams/:id/members/:userId', needAdmin, (req, res) => {
  const t = db.teams.find(x => x.id === req.params.id); if (!t) return fail(res, 404, 'Team not found.');
  if (!canManage(req.user, eventOf(t.eventId))) return fail(res, 403, 'Not your event.');
  if (!t.members.includes(req.params.userId)) return fail(res, 404, 'Member not in team.');
  removeMember(eventOf(t.eventId), t, req.params.userId); save(); res.json({ ok: true });
});
app.put('/api/admin/submissions/:id', needAdmin, (req, res) => {
  const s = db.submissions.find(x => x.id === req.params.id); if (!s) return fail(res, 404, 'Submission not found.');
  if (!canManage(req.user, eventOf(s.eventId))) return fail(res, 403, 'Not your event.');
  const sc = req.body.score === '' || req.body.score == null ? null : Number(req.body.score);
  if (sc !== null && (!Number.isFinite(sc) || sc < 0 || sc > 100)) return fail(res, 400, 'Score must be 0-100.', { score: 'Score must be 0-100.' });
  s.score = sc; s.feedback = str(req.body.feedback, 500); save(); res.json({ ok: true });
});
app.get('/api/admin/events/:id/export.csv', needAdmin, (req, res) => {
  const e = eventOf(req.params.id); if (!e) return fail(res, 404, 'Event not found.'); if (!canManage(req.user, e)) return fail(res, 403, 'Not your event.');
  const q = v => '"' + String(v ?? '').replace(/"/g, '""').replace(/^([=+\-@])/, "'$1") + '"';
  const rows = [['Team', 'Code', 'Status', 'Round reached', 'Role', 'Name', 'Email', 'College ID']];
  teamsOf(e.id).forEach(t => t.members.forEach(m => { const u = userOf(m); rows.push([t.name, t.code, t.status, e.rounds[t.roundReached]?.name, m === t.leaderId ? 'Leader' : 'Member', u?.name, u?.email, u?.collegeId]); }));
  res.setHeader('Content-Type', 'text/csv'); res.setHeader('Content-Disposition', `attachment; filename="${e.title.replace(/\W+/g, '_')}_registrations.csv"`);
  res.send(rows.map(r => r.map(q).join(',')).join('\n'));
});

/* ----- admin: announcements ----- */
function annBody(b) {
  const f = {}, text = str(b.text, 240);
  if (text.length < 5) f.text = 'Announcement must be at least 5 characters.';
  const type = ['info', 'event', 'urgent'].includes(b.type) ? b.type : 'info';
  return { f, o: { text, type, active: b.active !== false } };
}
app.post('/api/admin/announcements', needAdmin, (req, res) => {
  const { f, o } = annBody(req.body); if (Object.keys(f).length) return fail(res, 400, f.text, f);
  const a = { id: uid('a_'), ...o, orgId: req.user.orgId, authorId: req.user.id, createdAt: new Date().toISOString() };
  db.announcements.push(a); save(); res.json({ announcement: a });
});
const annOwn = (u, a) => u.role === 'superadmin' || a.orgId === u.orgId;
app.put('/api/admin/announcements/:id', needAdmin, (req, res) => {
  const a = db.announcements.find(x => x.id === req.params.id); if (!a) return fail(res, 404, 'Not found.'); if (!annOwn(req.user, a)) return fail(res, 403, 'Not yours.');
  const { f, o } = annBody(req.body); if (Object.keys(f).length) return fail(res, 400, f.text, f);
  Object.assign(a, o); save(); res.json({ announcement: a });
});
app.delete('/api/admin/announcements/:id', needAdmin, (req, res) => {
  const a = db.announcements.find(x => x.id === req.params.id); if (!a) return fail(res, 404, 'Not found.'); if (!annOwn(req.user, a)) return fail(res, 403, 'Not yours.');
  db.announcements = db.announcements.filter(x => x !== a); save(); res.json({ ok: true });
});
app.get('/api/admin/announcements', needAdmin, (req, res) => res.json({ announcements: db.announcements.filter(a => annOwn(req.user, a)).map(a => ({ ...a, orgName: orgOf(a.orgId)?.name || 'Campus' })) }));

/* ----- admin: overview, users, sync ----- */
app.get('/api/admin/overview', needAdmin, (req, res) => {
  const evs = db.events.filter(e => canManage(req.user, e));
  const ids = new Set(evs.map(e => e.id));
  res.json({ events: evs.map(e => evView(e, req.user.id)),
    stats: { events: evs.length, meetups: db.meetups.length, participants: evs.reduce((n, e) => n + participantCount(e.id), 0), teams: db.teams.filter(t => ids.has(t.eventId)).length,
      students: db.users.filter(u => u.role === 'student').length, pendingReview: db.submissions.filter(s => ids.has(s.eventId) && s.score == null).length },
    meetups: db.meetups.map(m => mtView(m, req.user.id)), orgs: req.user.role === 'superadmin' ? db.orgs : db.orgs.filter(o => o.id === req.user.orgId), sync });
});
app.get('/api/admin/users', needSuper, (req, res) => res.json({ users: db.users.map(u => ({ ...pub(u), createdAt: u.createdAt, teams: db.teams.filter(t => t.members.includes(u.id)).length })) }));
app.delete('/api/admin/users/:id', needSuper, (req, res) => {
  const u = userOf(req.params.id); if (!u) return fail(res, 404, 'User not found.'); if (u.id === req.user.id) return fail(res, 400, 'You cannot delete your own account.');
  db.teams.filter(t => t.members.includes(u.id)).forEach(t => removeMember(eventOf(t.eventId), t, u.id));
  db.meetups = db.meetups.filter(m => m.hostId !== u.id); db.meetups.forEach(m => delete m.votes[u.id]);
  db.saved = db.saved.filter(s => s.userId !== u.id); for (const k in db.sessions) if (db.sessions[k].userId === u.id) delete db.sessions[k];
  db.users = db.users.filter(x => x !== u); save(); res.json({ ok: true });
});
app.post('/api/admin/users/:id/password', needSuper, (req, res) => {
  const u = userOf(req.params.id); if (!u) return fail(res, 404, 'User not found.');
  const pp = pwProblem(req.body.password); if (pp) return fail(res, 400, pp, { password: pp });
  u.salt = crypto.randomBytes(16).toString('hex'); u.hash = hashPw(req.body.password, u.salt);
  for (const k in db.sessions) if (db.sessions[k].userId === u.id) delete db.sessions[k];
  save(); res.json({ ok: true });
});
app.post('/api/admin/sync', needAdmin, async (req, res) => {
  if (!SHEETS_URL) return fail(res, 400, 'Google Sheets sync is not configured. Set SHEETS_WEBHOOK_URL (see README).');
  res.json({ sync: await runSync() });
});

app.use('/api', (req, res) => fail(res, 404, 'Not found.'));
app.use((err, req, res, next) => { console.error(err); fail(res, err.type === 'entity.too.large' ? 413 : 500, err.type === 'entity.too.large' ? 'Upload too large.' : 'Something went wrong on the server.'); });
if (!ON_VERCEL) app.listen(PORT, () => { console.log(`CampusConnect running on http://localhost:${PORT}`); if (SHEETS_URL) scheduleSync(); });
module.exports = app;
