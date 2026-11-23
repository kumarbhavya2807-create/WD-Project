/* FlipCard: vanilla-JS port of React Bits <FlipCard/> (reactbits.dev/micro/flip-card, JS-CSS variant).
 * Same props, same behaviour: spring flip, drag-to-flip with fling, pointer tilt + glare, lift on hover,
 * keyboard (Enter/Space), reduced-motion cross-fade. `motion` springs are replaced by a tiny integrator.
 * Styles: flipcard.css (verbatim from the registry).
 *
 *   const fc = FlipCard.create({ front: Node, back: Node, axis: 'y', ...sameOptionsAsReact });
 *   host.append(fc.el); fc.flip(); fc.flipped; fc.setFaces(front, back);
 * Clicks on links/buttons inside a face work normally and don't flip the card (addition to the original). */
(() => {
  'use strict';
  const SLOP = { fine: 4, coarse: 8 };
  const TILT_SPRING = { stiffness: 240, damping: 24, mass: 0.6 };
  const LIFT_SPRING = { stiffness: 320, damping: 26 };
  const FLING = 0.16, HISTORY_MS = 90;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const snap = deg => Math.round(deg / 180) * 180;
  const isBack = deg => Math.abs(Math.round(deg / 180)) % 2 === 1;

  class Spring {
    constructor(v, { stiffness, damping, mass = 1 }, restDelta = 0.01) { this.v = this.to = v; this.vel = 0; this.k = stiffness; this.c = damping; this.m = mass; this.rd = restDelta; }
    set(to) { this.to = to; }
    jump(v) { this.v = this.to = v; this.vel = 0; }
    get moving() { return this.v !== this.to || this.vel !== 0; }
    step(dt) {
      if (!this.moving) return;
      const a = (-this.k * (this.v - this.to) - this.c * this.vel) / this.m;
      this.vel += a * dt; this.v += this.vel * dt;
      if (Math.abs(this.vel) < this.rd * 10 && Math.abs(this.v - this.to) < this.rd) this.jump(this.to);
    }
  }

  const DEFAULTS = {
    front: null, back: null, defaultFlipped: false, onFlipChange: null, axis: 'y', flipOnClick: true, draggable: true,
    dragDistance: 0, tilt: true, tiltMax: 12, glare: true, glareOpacity: 0.22, hoverScale: 1.03, perspective: 1100,
    stiffness: 170, damping: 20, width: 300, height: 400, radius: 22, background: '#27272a', color: '#f5f5f5',
    shadow: true, shadowColor: '#000000', shadowOpacity: 0.45, disabled: false, ariaLabel: 'Flip card', className: ''
  };

  function create(options) {
    const o = { ...DEFAULTS, ...options };
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let shown = !!o.defaultFlipped, target = shown ? 180 : 0, grip = null, raf = 0, last = 0;

    const turn = new Spring(target, { stiffness: o.stiffness, damping: o.damping }, 0.05);
    const tiltX = new Spring(0, TILT_SPRING), tiltY = new Spring(0, TILT_SPRING);
    const lift = new Spring(1, LIFT_SPRING), sheen = new Spring(0, LIFT_SPRING);
    let gx = 50, gy = 50;

    const el = document.createElement('div');
    el.className = 'flip-card' + (o.className ? ' ' + o.className : '');
    el.setAttribute('role', 'button'); el.tabIndex = o.disabled ? -1 : 0;
    el.setAttribute('aria-label', o.ariaLabel); el.dataset.axis = o.axis;
    if (o.draggable && !o.disabled && !reduce) el.dataset.draggable = '';
    if (o.disabled) { el.dataset.disabled = ''; el.setAttribute('aria-disabled', 'true'); }
    Object.entries({ '--fc-w': o.width + 'px', '--fc-h': o.height + 'px', '--fc-radius': o.radius + 'px', '--fc-bg': o.background, '--fc-ink': o.color, '--fc-shadow': o.shadowColor, '--fc-shadow-o': o.shadowOpacity, '--fc-glare': o.glareOpacity })
      .forEach(([k, v]) => el.style.setProperty(k, v));
    const shadowEl = o.shadow ? Object.assign(document.createElement('span'), { className: 'flip-card__shadow' }) : null;
    if (shadowEl) { shadowEl.setAttribute('aria-hidden', 'true'); el.append(shadowEl); }
    const rotor = Object.assign(document.createElement('div'), { className: 'flip-card__rotor' });
    const faceF = Object.assign(document.createElement('div'), { className: 'flip-card__face flip-card__face--front' });
    const faceB = Object.assign(document.createElement('div'), { className: 'flip-card__face flip-card__face--back' });
    rotor.append(faceF, faceB); el.append(rotor);

    function setFaces(front, back) {
      [[faceF, front], [faceB, back]].forEach(([f, content]) => {
        f.replaceChildren();
        if (content) f.append(content);
        if (o.glare) { const g = document.createElement('span'); g.className = 'flip-card__glare'; g.setAttribute('aria-hidden', 'true'); f.append(g); }
      });
    }
    function syncAria() {
      el.setAttribute('aria-pressed', String(shown));
      faceF.inert = shown; faceF.setAttribute('aria-hidden', String(shown));
      faceB.inert = !shown; faceB.setAttribute('aria-hidden', String(!shown));
      if (reduce) el.dataset.fade = shown ? 'back' : 'front';
    }
    function render() {
      if (reduce) return;
      const t = turn.v, p = o.perspective;
      rotor.style.transform = o.axis === 'x'
        ? `perspective(${p}px) scale(${lift.v}) rotateY(${tiltY.v}deg) rotateX(${t + tiltX.v}deg)`
        : `perspective(${p}px) scale(${lift.v}) rotateX(${tiltX.v}deg) rotateY(${t + tiltY.v}deg)`;
      rotor.style.setProperty('--fc-gx', gx + '%'); rotor.style.setProperty('--fc-gy', gy + '%');
      rotor.style.setProperty('--fc-sheen', Math.max(0, sheen.v));
      if (shadowEl) {
        const f = Math.abs(Math.cos((t * Math.PI) / 180));
        shadowEl.style.transform = o.axis === 'x' ? `scaleY(${0.08 + 0.92 * f})` : `scaleX(${0.08 + 0.92 * f})`;
        shadowEl.style.opacity = 0.1 + 0.9 * f * f;
      }
    }
    function tick(now) {
      const dt = Math.min(0.064, (now - last) / 1000 || 0.016); last = now;
      // sub-step for stability with stiff springs
      const n = Math.ceil(dt / 0.004);
      for (let i = 0; i < n; i++) [turn, tiltX, tiltY, lift, sheen].forEach(s => s.step(dt / n));
      render();
      raf = [turn, tiltX, tiltY, lift, sheen].some(s => s.moving) ? requestAnimationFrame(tick) : 0;
    }
    const kick = () => { if (!raf && !reduce) { last = performance.now(); raf = requestAnimationFrame(tick); } else if (reduce) render(); };

    function settle(to, velocity, instant) {
      target = to;
      if (instant || reduce) turn.jump(to); else { turn.set(to); turn.vel = velocity || 0; }
      kick();
      const next = isBack(to);
      if (next === shown) return;
      shown = next; syncAria();
      if (o.onFlipChange) o.onFlipChange(next);
    }
    const flip = instant => { const base = snap(turn.v); settle(isBack(base) ? base - 180 : base + 180, 0, instant); };
    const rest = () => { tiltX.set(0); tiltY.set(0); sheen.set(0); lift.set(1); kick(); };
    const interactive = t => t.closest && t.closest('a,button,input,select,textarea') && el.contains(t.closest('a,button,input,select,textarea'));

    el.addEventListener('pointerdown', e => {
      if (o.disabled || e.button !== 0 || grip || interactive(e.target)) return;
      try { el.setPointerCapture(e.pointerId); } catch {}
      grip = { id: e.pointerId, x: e.clientX, y: e.clientY, base: turn.v, moved: false, slop: e.pointerType === 'touch' ? SLOP.coarse : SLOP.fine, hist: [] };
      turn.jump(turn.v);
      if (!reduce) { lift.set(o.hoverScale); kick(); }
    });
    el.addEventListener('pointermove', e => {
      const g = grip;
      if (g && g.id === e.pointerId) {
        const d = o.axis === 'x' ? e.clientY - g.y : e.clientX - g.x;
        if (!g.moved) {
          if (Math.abs(d) < g.slop || !o.draggable || reduce) return;
          g.moved = true; el.dataset.dragging = ''; tiltX.set(0); tiltY.set(0); sheen.set(0);
        }
        const span = o.dragDistance > 0 ? o.dragDistance : o.axis === 'x' ? o.height : o.width;
        const deg = g.base + (o.axis === 'x' ? -1 : 1) * (d / span) * 180;
        turn.jump(deg);
        const now = performance.now(); g.hist.push({ t: now, v: deg });
        while (g.hist.length > 2 && now - g.hist[0].t > HISTORY_MS) g.hist.shift();
        kick(); return;
      }
      if (!o.tilt || reduce || o.disabled || e.pointerType === 'touch') return;
      const r = el.getBoundingClientRect();
      const px = clamp((e.clientX - r.left) / r.width, 0, 1), py = clamp((e.clientY - r.top) / r.height, 0, 1);
      tiltX.set((0.5 - py) * 2 * o.tiltMax); tiltY.set((px - 0.5) * 2 * o.tiltMax);
      gx = px * 100; gy = py * 100; sheen.set(1); kick();
    });
    function release(e, cancelled) {
      const g = grip; if (!g || g.id !== e.pointerId) return;
      grip = null;
      try { if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId); } catch {}
      delete el.dataset.dragging;
      if (e.pointerType === 'touch' || !el.matches(':hover')) rest();
      if (!g.moved) { if (!cancelled && o.flipOnClick) flip(false); else settle(target, 0, false); return; }
      const here = turn.v; let velocity = 0; const a = g.hist[0], b = g.hist[g.hist.length - 1];
      if (!cancelled && a && b && b.t > a.t && performance.now() - b.t < 60) velocity = ((b.v - a.v) / (b.t - a.t)) * 1000;
      const to = cancelled ? snap(g.base) : clamp(snap(here + velocity * FLING), snap(here) - 180, snap(here) + 180);
      settle(to, velocity, false);
    }
    el.addEventListener('pointerup', e => release(e, false));
    el.addEventListener('pointercancel', e => release(e, true));
    el.addEventListener('lostpointercapture', e => release(e, true));
    el.addEventListener('pointerenter', e => { if (!reduce && !o.disabled && e.pointerType !== 'touch') { lift.set(o.hoverScale); kick(); } });
    el.addEventListener('pointerleave', () => { if (!grip) rest(); });
    el.addEventListener('keydown', e => {
      if (o.disabled || e.target !== el || (e.key !== 'Enter' && e.key !== ' ')) return;
      e.preventDefault(); if (!e.repeat) flip(true);
    });
    el.addEventListener('click', e => { if (!o.disabled && e.detail === 0 && e.target === el) flip(true); });
    el.addEventListener('dragstart', e => e.preventDefault());

    setFaces(o.front, o.back); syncAria(); render();
    return {
      el, setFaces, flip: () => flip(false),
      get flipped() { return shown; },
      set flipped(v) { if (!!v !== shown) flip(false); }
    };
  }
  window.FlipCard = { create };
})();
