/* Eventure motion layer.
 * Vanilla ports of React Bits effects: Aurora, SplitText, AnimatedContent, SpotlightCard, CountUp, FlipCard (hero pass).
 * It watches the DOM that app.js renders, so app.js stays untouched.
 * Performance rules: animate transform/opacity only; WebGL at half resolution, max 30fps, paused off-screen;
 * pointer work throttled to one update per frame. Everything is skipped under prefers-reduced-motion
 * and during the 15s background auto-refresh. */
(() => {
  'use strict';
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FINE = matchMedia('(pointer: fine)').matches;
  // app.js declares `state` as a top-level const, which classic scripts share.
  const refreshing = () => { try { return !!state.refreshing; } catch { return false; } };

  /* ---------------- Aurora (WebGL) ---------------- */
  // one calm palette for every category: denim, sky and a soft periwinkle
  const SOFT_SKY = ['#4f76a3', '#9cc8e8', '#7f8fc9'];
  const PALETTES = { _: SOFT_SKY };
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  const VS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  const FS = `precision mediump float;
uniform float t;uniform vec2 r;uniform vec3 c0;uniform vec3 c1;uniform vec3 c2;
vec3 permute(vec3 x){return mod(((x*34.)+1.)*x,289.);}
float snoise(vec2 v){const vec4 C=vec4(.211324865405187,.366025403784439,-.577350269189626,.024390243902439);
vec2 i=floor(v+dot(v,C.yy));vec2 x0=v-i+dot(i,C.xx);vec2 i1=(x0.x>x0.y)?vec2(1.,0.):vec2(0.,1.);
vec4 x12=x0.xyxy+C.xxzz;x12.xy-=i1;i=mod(i,289.);
vec3 p=permute(permute(i.y+vec3(0.,i1.y,1.))+i.x+vec3(0.,i1.x,1.));
vec3 m=max(.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.);m=m*m;m=m*m;
vec3 x=2.*fract(p*C.www)-1.;vec3 h=abs(x)-.5;vec3 ox=floor(x+.5);vec3 a0=x-ox;
m*=1.79284291400159-.85373472095314*(a0*a0+h*h);
vec3 g;g.x=a0.x*x0.x+h.x*x0.y;g.yz=a0.yz*x12.xz+h.yz*x12.yw;return 130.*dot(m,g);}
void main(){vec2 uv=gl_FragCoord.xy/r;
vec3 ramp=uv.x<.5?mix(c0,c1,uv.x*2.):mix(c1,c2,(uv.x-.5)*2.);
float h=exp(snoise(vec2(uv.x*2.+t*.08,t*.22))*.55);
float h2=snoise(vec2(uv.x*3.5-t*.05,t*.17+4.))*.35;
float intensity=.62*((uv.y*2.-h+.25)+h2*.4);float a=smoothstep(-.3,.7,intensity);
gl_FragColor=vec4(intensity*ramp*a,a);}`;

  const aurora = (() => {
    const c = document.createElement('canvas'); c.className = 'fx-aurora'; c.setAttribute('aria-hidden', 'true');
    const gl = c.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' });
    if (!gl) return null;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return null;
    gl.useProgram(pr);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const U = n => gl.getUniformLocation(pr, n);
    const ut = U('t'), ur = U('r'), uc = [U('c0'), U('c1'), U('c2')];
    let cur = PALETTES._.map(hex), target = cur, cat = '_', last = 0, visible = true, raf = 0;
    const t0 = performance.now();
    // the aurora is soft noise, so half resolution looks identical and costs a quarter of the pixels
    const SCALE = 0.5, FRAME_MS = 1000 / 30;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) loop(); });
    function draw(now) {
      const host = c.parentElement; if (!host) return;
      const on = host.querySelector('.slide.on'); const m = on && on.className.match(/c-(\w+)/);
      const nc = m && PALETTES[m[1]] ? m[1] : '_';
      if (nc !== cat) { cat = nc; target = PALETTES[nc].map(hex); }
      cur = cur.map((v, i) => v.map((x, j) => x + (target[i][j] - x) * 0.06));
      const w = Math.max(1, Math.round(c.clientWidth * SCALE)), h = Math.max(1, Math.round(c.clientHeight * SCALE));
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; gl.viewport(0, 0, w, h); }
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(ut, RM ? 8 : (now - t0) / 1000); gl.uniform2f(ur, w, h);
      cur.forEach((v, i) => gl.uniform3f(uc[i], v[0], v[1], v[2]));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    function loop() {
      if (raf) return;
      const tick = now => {
        raf = 0;
        if (!c.isConnected || !visible || document.hidden) return; // resumes via attach / observer / visibilitychange
        if (now - last >= FRAME_MS) { last = now; draw(now); }
        if (!RM) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) loop(); });
    return {
      attach(host) {
        if (c.parentElement === host) return;
        host.prepend(c); io.disconnect(); io.observe(host); visible = true; loop();
      }
    };
  })();

  /* ---------------- Hero pass (React Bits FlipCard, see flipcard.js) ----------------
   * Front: your next registered event, or the open event closing soonest. Back: details + link. */
  const ticket = (() => {
    if (!window.FlipCard) return null;
    const h = (tag, cls, kids) => { const n = document.createElement(tag); if (cls) n.className = cls; (Array.isArray(kids) ? kids : [kids]).forEach(k => k != null && n.append(k)); return n; };
    const fc = FlipCard.create({
      axis: 'y', flipOnClick: true, draggable: true, dragDistance: 0, tilt: true, tiltMax: 12, glare: true, glareOpacity: 0.22,
      hoverScale: 1.03, perspective: 1100, stiffness: 170, damping: 20, width: 240, height: 320, radius: 22,
      background: '#263850', color: '#eef5fb', shadow: true, shadowColor: '#0f1a2a', shadowOpacity: 0.45,
      ariaLabel: 'Event pass: flip for details'
    });
    const wrap = h('div', 'fx-ticket', fc.el);
    let key = '';
    const pick = () => {
      let ev = []; try { ev = state.events || []; } catch {}
      const today = new Date().toISOString().slice(0, 10);
      const mine = ev.filter(e => e.myTeamId && e.eventDate >= today).sort((a, b) => a.eventDate.localeCompare(b.eventDate))[0];
      if (mine) return { e: mine, mine: true };
      const open = ev.filter(e => e.state === 'open' && e.daysLeft >= 0).sort((a, b) => a.daysLeft - b.daysLeft)[0];
      return open ? { e: open, mine: false } : null;
    };
    const build = ({ e, mine }) => {
      const d = new Date(e.eventDate + 'T00:00:00');
      const pct = Math.min(100, Math.round((e.registered / Math.max(1, e.capacity)) * 100));
      const team = e.teamMax === 1 ? 'Individual' : `${e.teamMin === e.teamMax ? e.teamMin : e.teamMin + '–' + e.teamMax} people`;
      const left = e.daysLeft === 0 ? 'Last day' : e.daysLeft === 1 ? '1 day left' : e.daysLeft + ' days left';
      const front = h('div', `tk tk-front c-${e.category}`, [
        h('div', 'tk-top', [h('span', null, mine ? 'Your pass' : 'Closing soon'), h('span', null, e.orgShort)]),
        h('div', 'tk-date', [h('b', null, String(d.getDate())), h('span', null, [d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(), h('br'), String(d.getFullYear())])]),
        h('div', 'tk-title', e.title), h('div', 'tk-org', e.orgName), h('div', 'tk-perf'),
        h('div', 'tk-foot', [h('span', null, mine ? 'Registered' : left), h('span', null, 'Flip ↻')])
      ]);
      const row = (k, v) => [h('dt', null, k), h('dd', null, v)];
      const cta = h('a', 'tk-cta', mine ? 'View my team →' : 'Register now →'); cta.href = '#/event/' + e.id;
      const back = h('div', 'tk tk-back', [
        h('div', 'tk-top', [h('span', null, 'Details'), h('span', null, e.category)]),
        h('dl', null, [...row('Venue', e.venue), ...row('Mode', e.mode), ...row('Team', team),
          ...row('Round', (e.rounds[e.currentRound] || {}).name || '–'), ...row('Closes', mine ? 'Registered' : left)]),
        h('div', 'tk-cap', [h('div', 'tk-bar', h('i')), h('small', null, `${e.registered}/${e.capacity} registered`)]),
        cta
      ]);
      back.querySelector('.tk-bar i').style.width = pct + '%';
      return [front, back];
    };
    return {
      attach(hero) {
        const p = pick();
        if (!p) { wrap.remove(); hero.classList.remove('has-ticket'); return; }
        hero.classList.add('has-ticket');
        const k = JSON.stringify([p.mine, p.e.id, p.e.registered, p.e.capacity, p.e.daysLeft, p.e.currentRound, p.e.venue, p.e.title]);
        if (k !== key) { key = k; fc.setFaces(...build(p)); }
        if (wrap.parentElement !== hero) { wrap.classList.toggle('still', refreshing() || RM); hero.append(wrap); }
      }
    };
  })();

  /* ---------------- SplitText (word-by-word rise) ---------------- */
  function split(el) {
    el.dataset.fx = '1';
    if (RM || refreshing()) return;
    let i = 0, afterBr = false; const accent = !!el.closest('.auth-l');
    const walk = node => [...node.childNodes].forEach(n => {
      if (n.nodeType === 3) {
        const frag = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach(p => {
          if (!p) return;
          if (/^\s+$/.test(p)) return frag.append(p);
          const s = document.createElement('span'); s.className = 'w' + (afterBr && accent ? ' it' : '');
          s.style.setProperty('--i', Math.min(i++, 12)); s.textContent = p; frag.append(s);
        });
        n.replaceWith(frag);
      } else if (n.nodeName === 'BR') afterBr = true;
      else if (n.nodeType === 1) walk(n);
    });
    walk(el); el.classList.add('fx-split');
  }

  /* ---------------- AnimatedContent (staggered rise) ---------------- */
  const RISE = '.list>*, .stat-row>*, .side>*, .dhead, .auth-card, .wrap>.card, .cols>div>.card, .tabs+.card, .hero';
  function rise(root) {
    const groups = new Map();
    root.querySelectorAll(RISE).forEach(el => {
      if (el.dataset.fx) return; el.dataset.fx = '1';
      if (RM || refreshing() || el.classList.contains('tilted-card')) return; // tilted cards run their own intro
      const p = el.parentElement; const n = groups.get(p) || 0; groups.set(p, n + 1);
      if (n > 7) return; // only stagger what's on screen; the rest just appears
      el.style.setProperty('--i', n); el.classList.add('fx-rise');
      el.addEventListener('animationend', () => el.classList.remove('fx-rise'), { once: true });
    });
  }

  /* ---------------- CountUp ---------------- */
  function countUp(el) {
    el.dataset.fx = '1';
    const m = el.textContent.match(/^(\d+)(.*)$/s); if (!m || RM || refreshing()) return;
    const to = +m[1], rest = m[2], t0 = performance.now(), dur = 800;
    if (to === 0) return;
    const step = now => { const k = Math.min(1, (now - t0) / dur); const e = 1 - Math.pow(1 - k, 3);
      el.textContent = Math.round(to * e) + rest; if (k < 1) requestAnimationFrame(step); };
    el.textContent = '0' + rest; requestAnimationFrame(step);
  }

  /* ---------------- Sidebar (Notion-style): turns app.js's top nav into a collapsible icon rail ----------------
   * app.js re-renders #nav on every route, so this re-decorates it each time. Open/closed is remembered. */
  const ICONS = {
    events: '<rect x="3" y="4.5" width="18" height="16" rx="3"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/><path d="M8 14h3"/>',
    meetups: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.3-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M16 4.8a3.3 3.3 0 0 1 0 6.4M18 14.8c2 .7 3.2 2.4 3.5 5.2"/>',
    host: '<rect x="3" y="3" width="18" height="18" rx="5"/><path d="M12 8v8M8 12h8"/>',
    activity: '<path d="M3 12h4l2.5-6 5 12 2.5-6h4"/>',
    admin: '<path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6z"/><path d="M9 12l2 2 4-4"/>',
    logout: '<path d="M14 4h3.5A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5H14"/><path d="M10 16l-4-4 4-4M6 12h10"/>',
    toggle: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/><path d="M13.5 10l2 2-2 2"/>'
  };
  const ROUTE_ICON = { '#/': 'events', '#/meetups': 'meetups', '#/host': 'host', '#/activity': 'activity', '#/admin': 'admin' };
  const icon = n => `<svg class="sb-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ICONS.events}</svg>`;
  const narrow = () => innerWidth <= 900;
  let sideOpen = false;
  try { sideOpen = localStorage.getItem('cc-sidebar') === 'open'; } catch {}
  if (narrow()) sideOpen = false;
  function setSide(v, remember = true) {
    sideOpen = v; document.body.classList.toggle('side-open', v);
    if (remember && !narrow()) { try { localStorage.setItem('cc-sidebar', v ? 'open' : 'closed'); } catch {} }
    const t = document.querySelector('.sb-toggle');
    if (t) { t.setAttribute('aria-expanded', String(v)); t.dataset.tip = v ? 'Collapse sidebar' : 'Expand sidebar'; t.querySelector('.lbl').textContent = v ? 'Collapse' : 'Expand'; }
    tip.classList.remove('on');
  }
  const tip = document.createElement('div'); tip.className = 'fx-tip'; tip.setAttribute('role', 'tooltip'); document.body.append(tip);
  // React Bits GooeyNav on the sidebar links (see gooeynav.js); tuned down from the demo for a narrow vertical rail
  const gooey = window.GooeyNav ? GooeyNav.create({
    theme: 'light', color: '#4f76a3', colors: ['#4f76a3', '#6b8cba', '#86a3cb'],
    particleCount: 16, spread: 34, animationTime: 720, timeVariance: 300, gooeyness: 0.85, wobble: 0.7, hoverEffect: true
  }) : null;
  const navRoot = document.getElementById('nav');
  function decorateNav() {
    const inner = navRoot.querySelector('.nav-in'); if (!inner || inner.dataset.fx) return; inner.dataset.fx = '1';
    const brand = inner.querySelector('.brand');
    const mark = brand && brand.querySelector('.logo'); if (mark) mark.setAttribute('aria-hidden', 'true'); // image logo; the name is read instead
    if (brand) [...brand.childNodes].forEach(n => { if (n.nodeType === 3 && n.textContent.trim()) { const s = document.createElement('span'); s.className = 'lbl'; s.textContent = n.textContent; n.replaceWith(s); } });
    const links = inner.querySelector('.links');
    document.body.classList.toggle('has-side', !!links);
    if (!links) { document.body.classList.remove('side-open'); if (gooey) gooey.unbind(); return; }
    if (brand) brand.dataset.tip = 'Eventure';
    links.setAttribute('aria-label', 'Main');
    links.querySelectorAll('a').forEach(a => {
      const label = a.textContent.trim();
      a.innerHTML = icon(ROUTE_ICON[a.getAttribute('href')]) + '<span class="lbl"></span>';
      a.querySelector('.lbl').textContent = label; a.dataset.tip = label; a.classList.add('sb-item');
      if (a.classList.contains('on')) a.setAttribute('aria-current', 'page');
    });
    if (gooey) {
      // GooeyNav: stage = wrapper around the links; overlay = white copy of the links, clipped to the goo
      const items = [...links.querySelectorAll('a')];
      items.forEach((a, i) => { a.dataset.gooeyIndex = i; });
      const stage = document.createElement('div'); stage.className = 'gooey-nav__stage gooey-stage';
      links.replaceWith(stage); stage.append(links);
      const overlay = links.cloneNode(true);
      overlay.classList.add('gooey-nav__list--active', 'gn-overlay');
      overlay.setAttribute('aria-hidden', 'true'); overlay.removeAttribute('aria-label'); overlay.inert = true;
      overlay.querySelectorAll('a').forEach(a => { a.removeAttribute('href'); a.removeAttribute('aria-current'); a.removeAttribute('data-tip'); a.tabIndex = -1; });
      stage.append(overlay);
      gooey.bind(stage, links, overlay, items.findIndex(a => a.classList.contains('on')));
    }
    const search = inner.querySelector('.search'); if (search) search.dataset.tip = 'Search';
    const u = inner.querySelector('.userchip');
    if (u) {
      // avatar + name become one "Account" button that opens the account popup
      const av = u.querySelector('.avatar'), info = u.querySelector('span:not(.avatar)');
      const acct = document.createElement('button'); acct.type = 'button'; acct.className = 'sb-item sb-account';
      acct.setAttribute('aria-haspopup', 'dialog'); acct.setAttribute('aria-expanded', String(!!acctPop)); acct.dataset.tip = 'Account';
      if (av) acct.append(av);
      if (info) { info.classList.add('lbl'); acct.append(info); }
      acct.addEventListener('click', () => (acctPop ? closeAccount() : openAccount()));
      u.prepend(acct);
      const out = u.querySelector('[data-act=logout]');
      if (out) { out.className = 'sb-item sb-logout'; out.innerHTML = icon('logout') + '<span class="lbl">Log out</span>'; out.dataset.tip = 'Log out'; }
    }
    const t = document.createElement('button'); t.type = 'button'; t.className = 'sb-item sb-toggle';
    t.innerHTML = icon('toggle') + '<span class="lbl"></span>'; t.addEventListener('click', () => setSide(!sideOpen));
    inner.append(t);
    setSide(sideOpen, false);
  }
  /* ---------------- Account popup (opens from the sidebar avatar) ----------------
   * Uses app.js's own helpers (field, submitForm, clean, api, toast, esc), so validation, error messages
   * and the POST /api/me/password call are exactly the ones the My activity page used. */
  let acctPop = null;
  const acctBtn = () => navRoot.querySelector('.sb-account');
  function closeAccount(returnFocus) {
    if (!acctPop) return;
    acctPop.remove(); acctPop = null;
    const b = acctBtn(); if (b) { b.setAttribute('aria-expanded', 'false'); if (returnFocus) b.focus(); }
  }
  function openAccount() {
    let u = null; try { u = state.user; } catch {}
    if (!u || typeof field !== 'function' || typeof submitForm !== 'function') return;
    tip.classList.remove('on');
    const role = u.role === 'student' ? 'Student' : u.role === 'superadmin' ? 'Super admin' : (u.orgName ? u.orgName + ' admin' : 'Admin');
    const sub = [u.collegeId, u.email].filter(Boolean).join(' · ');
    acctPop = document.createElement('div');
    acctPop.className = 'acct-pop'; acctPop.setAttribute('role', 'dialog'); acctPop.setAttribute('aria-label', 'Account');
    acctPop.innerHTML = `<div class="acct-head"><span class="avatar acct-av">${esc((u.name || '?')[0])}</span>
      <div class="acct-id"><b>${esc(u.name)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}<span class="tag">${esc(role)}</span></div>
      <button type="button" class="acct-x" aria-label="Close account">×</button></div>
      <form id="acctpw" novalidate><h3>Change password</h3>
      ${field('Current password', 'current', { type: 'password', attrs: 'autocomplete="current-password"' })}
      ${field('New password', 'password', { type: 'password', ph: 'Min 8 chars, letters + numbers', attrs: 'autocomplete="new-password"' })}
      <button class="btn pri block" type="submit">Update password</button></form>
      <button type="button" class="sb-item sb-logout acct-out" data-act="logout">${icon('logout')}<span>Log out</span></button>`;
    document.body.append(acctPop);
    const b = acctBtn(); if (b) b.setAttribute('aria-expanded', 'true');
    acctPop.querySelector('.acct-x').addEventListener('click', () => closeAccount(true));
    const f = acctPop.querySelector('#acctpw');
    f.addEventListener('submit', ev => {
      ev.preventDefault();
      submitForm(f, d => clean({
        current: d.current ? '' : 'Enter your current password.',
        password: (d.password || '').length < 8 || !/[A-Za-z]/.test(d.password) || !/\d/.test(d.password) ? 'At least 8 characters with a letter and a number.' : ''
      }), async d => { await api('POST', '/api/me/password', d); f.reset(); toast('Password updated', 'ok'); closeAccount(true); });
    });
    const first = f.querySelector('input'); if (first) first.focus({ preventScroll: true });
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && acctPop) closeAccount(true); });
  document.addEventListener('pointerdown', e => {
    if (!acctPop || acctPop.contains(e.target) || (acctBtn() && acctBtn().contains(e.target)) || e.target.closest('#toasts')) return;
    closeAccount();
  });
  addEventListener('hashchange', () => closeAccount());

  // clicking the search icon on the collapsed rail opens the sidebar
  navRoot.addEventListener('focusin', e => { if (e.target.id === 'gsearch' && !sideOpen && document.body.classList.contains('has-side')) setSide(true, !narrow()); });
  // on small screens the open sidebar floats over content: close it after picking a page or clicking outside
  navRoot.addEventListener('click', e => { if (narrow() && sideOpen && e.target.closest('.links a')) setSide(false); });
  document.addEventListener('pointerdown', e => { if (narrow() && sideOpen && !navRoot.contains(e.target)) setSide(false); });
  document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === '\\' && document.body.classList.contains('has-side')) { e.preventDefault(); setSide(!sideOpen); } });
  navRoot.addEventListener('pointerover', e => {
    const t = e.target.closest('[data-tip]');
    if (!t || sideOpen || !document.body.classList.contains('has-side')) { tip.classList.remove('on'); return; }
    const r = t.getBoundingClientRect(); tip.textContent = t.dataset.tip;
    tip.style.transform = `translate(${Math.round(r.right + 10)}px, ${Math.round(r.top + r.height / 2)}px) translateY(-50%)`;
    tip.classList.add('on');
  });
  navRoot.addEventListener('pointerleave', () => tip.classList.remove('on'));
  new MutationObserver(decorateNav).observe(navRoot, { childList: true });
  decorateNav();

  /* ---------------- TiltedCard on event + meetup cards (see tiltedcard.js) ----------------
   * Each list card is wrapped as-is; app.js re-renders lists often, so instances whose card left the page
   * are destroyed on every scan to release their window listeners. */
  const tilted = new Set();
  const introSeen = new Set(); // cards already introduced on this page: votes/filters re-render lists, don't replay
  addEventListener('hashchange', () => introSeen.clear());
  function tiltCards(root) {
    if (!window.TiltedCard) return;
    tilted.forEach(t => { if (!t.figure.isConnected) { t.destroy(); tilted.delete(t); } });
    const groups = new Map();
    root.querySelectorAll('.list .card.ev:not(.tc-body)').forEach(card => {
      const list = card.closest('.list'); const n = groups.get(list) || 0; groups.set(list, n + 1);
      const idEl = card.querySelector('[data-id]');
      const key = card.dataset.href || (idEl && idEl.dataset.id) || '';
      const fresh = key && !introSeen.has(key); if (key) introSeen.add(key);
      tilted.add(TiltedCard.wrap(card, {
        rotateAmplitude: 4, scaleOnHover: 1.012, perspective: 1400, smoothness: 0.6,
        glare: 0.45, glareColor: '#7fa3cc', shadow: 0.35, parallax: 1,
        captionText: card.dataset.href ? 'View details →' : '', showTooltip: FINE,
        gyroscope: false, intro: !RM && !refreshing() && fresh, introDelay: Math.min(n, 8) * 45
      }));
    });
  }

  /* ---------------- Gooey dropdown filters (Category / Mode / Sort) ----------------
   * Replaces the category chips and the two <select>s with dropdown buttons whose menus use GooeyNav.
   * The original chips/selects stay in the page (hidden) and are driven programmatically, so app.js's
   * own filter logic (A.cat / A.mcat, onchange handlers) does all the work. */
  const DD_SVG = {
    grid: '<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>',
    code: '<path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"/>',
    music: '<path d="M9 18V5.5l11-2V16"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
    ball: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5c2.5 2.3 3.8 5.1 3.8 8.5s-1.3 6.2-3.8 8.5M12 3.5C9.5 5.8 8.2 8.6 8.2 12s1.3 6.2 3.8 8.5M3.5 12h17"/>',
    case: '<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3 12.5h18"/>',
    book: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5zM20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z"/>',
    chat: '<path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4 4v-4a2 2 0 0 1-2-2z"/>',
    globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.4 3.6 5.2 3.6 8.5s-1.2 6.1-3.6 8.5c-2.4-2.4-3.6-5.2-3.6-8.5s1.2-6.1 3.6-8.5z"/>',
    pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
    swap: '<path d="M7 8h11l-3-3M17 16H6l3 3"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    cal: ICONS.events,
    trend: '<path d="M4 17l5.5-5.5 3.5 3.5L20 8M15 8h5v5"/>',
    az: '<path d="M4 17l3.5-10L11 17M5.2 13.5h4.6M14 7h6l-6 10h6"/>'
  };
  const DD_ICON = {
    cat: { All: 'grid', Tech: 'code', Cultural: 'music', Sports: 'ball', Business: 'case', Study: 'book', Social: 'chat' },
    mode: { All: 'grid', Online: 'globe', Offline: 'pin', Hybrid: 'swap' },
    sort: { closing: 'clock', date: 'cal', popular: 'trend', az: 'az' }
  };
  const ddSvg = (cls, name) => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${DD_SVG[name] || DD_SVG.grid}</svg>`;
  const ddEngines = {};
  const ddEngine = kind => ddEngines[kind] || (ddEngines[kind] = window.GooeyNav ? GooeyNav.create({
    theme: 'light', color: '#4f76a3', colors: ['#4f76a3', '#6b8cba', '#86a3cb'],
    particleCount: 12, spread: 26, animationTime: 560, timeVariance: 220, gooeyness: 0.85, wobble: 0.6, hoverEffect: true
  }) : null);
  let ddOpen = null, ddSeq = 0;

  function dropdown(cfg) {
    const wrap = document.createElement('div'); wrap.className = 'gdd'; wrap.dataset.kind = cfg.kind;
    const menuId = `gdd-${cfg.kind}-${++ddSeq}`;
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'gdd-btn';
    btn.setAttribute('aria-haspopup', 'listbox'); btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-controls', menuId);
    btn.innerHTML = '<span class="gdd-k"></span><span class="gdd-v"></span><svg class="gdd-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
    btn.querySelector('.gdd-k').textContent = cfg.label;
    const menu = document.createElement('div'); menu.className = 'gdd-menu'; menu.id = menuId; menu.hidden = true;
    const stage = document.createElement('div'); stage.className = 'gooey-nav__stage gdd-stage';
    const list = document.createElement('div'); list.className = 'gdd-list'; list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', cfg.label);
    cfg.options.forEach((op, i) => {
      const o = document.createElement('div'); o.className = 'gdd-opt'; o.setAttribute('role', 'option'); o.tabIndex = -1;
      o.dataset.gooeyIndex = i; o.innerHTML = ddSvg('gdd-ic', DD_ICON[cfg.kind][op.v]) + '<span class="gdd-lbl"></span>';
      o.querySelector('.gdd-lbl').textContent = op.label; list.append(o);
    });
    const overlay = list.cloneNode(true);
    overlay.classList.add('gooey-nav__list--active', 'gdd-overlay'); overlay.setAttribute('aria-hidden', 'true'); overlay.inert = true;
    overlay.removeAttribute('role'); overlay.removeAttribute('aria-label');
    overlay.querySelectorAll('.gdd-opt').forEach(o => { o.removeAttribute('role'); o.removeAttribute('tabindex'); });
    stage.append(list, overlay); menu.append(stage); wrap.append(btn, menu);

    const opts = [...list.children];
    const idx = () => Math.max(0, cfg.options.findIndex(o => o.v === cfg.get()));
    const sync = () => {
      const i = idx();
      btn.querySelector('.gdd-v').textContent = cfg.options[i].label;
      opts.forEach((o, k) => o.setAttribute('aria-selected', String(k === i)));
      wrap.classList.toggle('is-set', cfg.kind !== 'sort' && i > 0);
    };
    sync();
    const eng = ddEngine(cfg.kind);
    let closeTimer = 0;
    function open() {
      if (ddOpen && ddOpen.wrap !== wrap) ddOpen.close();
      clearTimeout(closeTimer);
      menu.hidden = false; btn.setAttribute('aria-expanded', 'true'); wrap.classList.add('open');
      ddOpen = { wrap, close };
      if (eng) { eng.unbind(); eng.bind(stage, list, overlay, idx()); } // settle on the current choice, no flight
      opts[idx()].focus({ preventScroll: true });
    }
    function close(focusBtn) {
      clearTimeout(closeTimer);
      if (menu.hidden) return;
      menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); wrap.classList.remove('open');
      if (ddOpen && ddOpen.wrap === wrap) ddOpen = null;
      if (focusBtn) btn.focus({ preventScroll: true });
    }
    function choose(i) {
      if (i < 0) return;
      const changed = cfg.options[i].v !== cfg.get();
      if (changed) { cfg.set(cfg.options[i].v); if (eng) eng.go(i); }
      sync();
      // let the goo travel to the new choice before the menu folds away
      closeTimer = setTimeout(() => close(true), changed && !RM ? 560 : 0);
    }
    btn.addEventListener('click', () => (menu.hidden ? open() : close()));
    btn.addEventListener('keydown', e => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(); } });
    list.addEventListener('click', e => { const o = e.target.closest('.gdd-opt'); if (o) choose(opts.indexOf(o)); });
    list.addEventListener('keydown', e => {
      const i = opts.indexOf(document.activeElement); let n = i;
      if (e.key === 'ArrowDown') n = Math.min(opts.length - 1, i + 1);
      else if (e.key === 'ArrowUp') n = Math.max(0, i - 1);
      else if (e.key === 'Home') n = 0;
      else if (e.key === 'End') n = opts.length - 1;
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(i); return; }
      else if (e.key === 'Escape') { e.preventDefault(); close(true); return; }
      else if (e.key === 'Tab') { close(); return; }
      else return;
      e.preventDefault(); opts[n].focus({ preventScroll: true });
    });
    // keyboard focus moves the gooey hover highlight, same as the mouse
    list.addEventListener('focusin', e => { const o = e.target.closest('.gdd-opt'); if (o) o.dispatchEvent(new PointerEvent('pointerover', { bubbles: true })); });
    return wrap;
  }
  document.addEventListener('pointerdown', e => { if (ddOpen && !ddOpen.wrap.contains(e.target)) ddOpen.close(); });

  function buildFilters(root) {
    root.querySelectorAll('.chips:not([data-gdd])').forEach(chips => {
      chips.dataset.gdd = '1';
      const toolbar = chips.nextElementSibling && chips.nextElementSibling.classList.contains('toolbar') ? chips.nextElementSibling : null;
      const chipEls = [...chips.querySelectorAll('.chip')];
      if (!chipEls.length) return;
      const bar = document.createElement('div'); bar.className = 'gdd-bar';
      bar.append(dropdown({
        kind: 'cat', label: 'Category',
        options: chipEls.map(c => ({ v: c.dataset.v, label: c.textContent.trim() })),
        get: () => (chips.querySelector('.chip.on') || chipEls[0]).dataset.v,
        set: v => { const c = chipEls.find(x => x.dataset.v === v); if (c) c.click(); } // app.js handles the click
      }));
      if (toolbar) toolbar.querySelectorAll('select').forEach(sel => {
        const isMode = /mode/i.test(sel.id);
        bar.append(dropdown({
          kind: isMode ? 'mode' : 'sort', label: isMode ? 'Mode' : 'Sort',
          options: [...sel.options].map(op => ({ v: op.value, label: op.text.replace(/^(Mode|Sort):\s*/, '') })),
          get: () => sel.value,
          set: v => { sel.value = v; sel.dispatchEvent(new Event('change', { bubbles: true })); } // fires app.js onchange
        }));
      });
      chips.classList.add('gdd-src'); if (toolbar) toolbar.classList.add('gdd-src');
      chips.before(bar);
    });
  }

  /* ---------------- DOM watcher ---------------- */
  let busy = false;
  function scan() {
    if (busy) return; busy = true;
    try {
      const host = document.querySelector('section.hero, .auth-l'); if (host && aurora) aurora.attach(host);
      const hero = document.querySelector('section.hero'); if (hero && ticket) ticket.attach(hero);
      document.querySelectorAll('#app h1:not([data-fx])').forEach(split);
      tiltCards(document.getElementById('app'));
      buildFilters(document.getElementById('app'));
      // the Account / change-password block now lives in the avatar popup, so drop it from My activity
      const pwf = document.getElementById('pwf');
      if (pwf) { const card = pwf.closest('.card'); const h = card && card.previousElementSibling; if (h && h.tagName === 'H2' && /account/i.test(h.textContent)) h.remove(); if (card) card.remove(); }
      rise(document.getElementById('app'));
      document.querySelectorAll('.stat b:not([data-fx])').forEach(countUp);
    } finally { busy = false; }
  }
  new MutationObserver(scan).observe(document.getElementById('app'), { childList: true, subtree: true });
  scan();

  /* ---------------- SpotlightCard (one update per frame) ---------------- */
  if (FINE && !RM) {
    let spot = null, px = 0, py = 0, queued = false;
    const paint = () => {
      queued = false; if (!spot) return;
      const r = spot.getBoundingClientRect();
      spot.style.setProperty('--mx', (px - r.left) + 'px'); spot.style.setProperty('--my', (py - r.top) + 'px');
    };
    document.addEventListener('pointermove', e => {
      const c = e.target.closest ? e.target.closest('.card:not(.tc-body)') : null; // tilted cards have their own glare
      if (spot !== c) { if (spot) spot.classList.remove('fx-spot'); spot = c; if (c) c.classList.add('fx-spot'); }
      px = e.clientX; py = e.clientY;
      if (c && !queued) { queued = true; requestAnimationFrame(paint); }
    }, { passive: true });
  }
})();
