const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* =========================================================
   Deep space — scroll drives the camera through a starfield
   ========================================================= */
const canvas = document.getElementById('space');
const ctx = canvas.getContext('2d');

const STAR_COUNT = 1250;
const ORB_COUNT = 14;
const DEPTH = 1400;
const FOV = 520;

let W = 0, H = 0, cx = 0, cy = 0, dpr = 1;
let stars = [];
let orbs = [];

const rand = (min, max) => min + Math.random() * (max - min);

const seedField = () => {
  stars = Array.from({ length: STAR_COUNT }, () => ({
    x: rand(-1900, 1900),
    y: rand(-1300, 1300),
    z: rand(1, DEPTH),
    // A few stars burn brighter than the rest
    mag: Math.random() < 0.13 ? rand(1.8, 3.1) : rand(0.5, 1.2),
    tw: Math.random() * Math.PI * 2,
    tws: rand(0.6, 2.2)
  }));

  orbs = Array.from({ length: ORB_COUNT }, () => ({
    x: rand(-1700, 1700),
    y: rand(-1100, 1100),
    z: rand(200, DEPTH),
    r: rand(45, 170),
    a: rand(0.07, 0.22)
  }));
};

// One reusable orb sprite. Building radial gradients per orb per frame was
// allocating 14 gradient objects every frame — this draws the same thing once.
const ORB_SPRITE = 128;
let orbSprite = null;
const buildOrbSprite = () => {
  orbSprite = document.createElement('canvas');
  orbSprite.width = orbSprite.height = ORB_SPRITE * 2;
  const c = orbSprite.getContext('2d');
  const g = c.createRadialGradient(ORB_SPRITE, ORB_SPRITE, 0, ORB_SPRITE, ORB_SPRITE, ORB_SPRITE);
  g.addColorStop(0, 'rgba(244,242,240,1)');
  g.addColorStop(1, 'rgba(244,242,240,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, ORB_SPRITE * 2, ORB_SPRITE * 2);
};

const resize = () => {
  // 1.5 is plenty for a starfield and saves a lot of fill on hi-dpi screens
  dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  W = window.innerWidth;
  H = window.innerHeight;
  cx = W / 2;
  cy = H / 2;
  canvas.width = Math.floor(W * dpr);
  canvas.height = Math.floor(H * dpr);
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
};

// Camera state: position through space, plus a warp burst from scroll velocity
let camZ = 0;
let warp = 0;
let drift = 0;
let pointerX = 0, pointerY = 0;
let parX = 0, parY = 0;

const drawOrb = (o) => {
  const z = ((o.z - camZ * 0.35) % DEPTH + DEPTH) % DEPTH || 0.001;
  const k = FOV / z;
  const sx = cx + (o.x + parX * 2.4) * k;
  const sy = cy + (o.y + parY * 2.4) * k;
  const r = Math.max(o.r * k, 1);
  if (sx < -r || sx > W + r || sy < -r || sy > H + r) return;

  ctx.globalAlpha = o.a * (1 - z / DEPTH);
  ctx.drawImage(orbSprite, sx - r, sy - r, r * 2, r * 2);
  ctx.globalAlpha = 1;
};

// Stars are batched into a handful of alpha levels so the whole field costs a
// few fill() calls instead of ~1250 separate paths
const LEVELS = 5;
let bufX = [], bufY = [], bufS = [], bufN = [];
const allocBuffers = () => {
  bufX = []; bufY = []; bufS = []; bufN = [];
  for (let i = 0; i < LEVELS; i++) {
    bufX.push(new Float32Array(STAR_COUNT));
    bufY.push(new Float32Array(STAR_COUNT));
    bufS.push(new Float32Array(STAR_COUNT));
    bufN.push(0);
  }
};

const render = (t) => {
  ctx.clearRect(0, 0, W, H);

  // Soft bokeh clouds sit behind the stars
  orbs.forEach(drawOrb);

  const time = t * 0.001;
  ctx.fillStyle = '#f4f2f0';
  ctx.strokeStyle = '#f4f2f0';

  const streaking = warp > 0.6;
  const parallaxX = parX * 12;
  const parallaxY = parY * 12;

  for (let i = 0; i < LEVELS; i++) bufN[i] = 0;

  if (streaking) {
    ctx.lineCap = 'round';
    ctx.beginPath();
  }

  for (let i = 0; i < stars.length; i++) {
    const s = stars[i];
    // Wrap depth so the field is endless
    let z = ((s.z - camZ) % DEPTH + DEPTH) % DEPTH;
    if (z < 1) z = 1;

    const k = FOV / z;
    const sx = cx + (s.x + parallaxX) * k;
    const sy = cy + (s.y + parallaxY) * k;

    if (sx < -60 || sx > W + 60 || sy < -60 || sy > H + 60) continue;

    const fade = 1 - z / DEPTH;
    const twinkle = 0.72 + 0.28 * Math.sin(time * s.tws + s.tw);
    const alpha = Math.min(1, fade * 1.5) * twinkle;
    const size = Math.max(0.35, s.mag * k * 1.7);

    if (streaking) {
      // Streak the stars toward the vanishing point while flying — one shared
      // path, stroked once, instead of a stroke() per star
      const kPrev = FOV / Math.min(DEPTH, z + warp * 6);
      ctx.moveTo(cx + (s.x + parallaxX) * kPrev, cy + (s.y + parallaxY) * kPrev);
      ctx.lineTo(sx, sy);
      continue;
    }

    // Quantise into alpha buckets; each bucket is filled in one pass
    const lvl = Math.min(LEVELS - 1, (alpha * LEVELS) | 0);
    const n = bufN[lvl]++;
    bufX[lvl][n] = sx;
    bufY[lvl][n] = sy;
    bufS[lvl][n] = size;
  }

  if (streaking) {
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1.1;
    ctx.stroke();
    ctx.globalAlpha = 1;
    return;
  }

  for (let lvl = 0; lvl < LEVELS; lvl++) {
    const count = bufN[lvl];
    if (!count) continue;
    ctx.globalAlpha = (lvl + 1) / LEVELS;
    const xs = bufX[lvl], ys = bufY[lvl], ss = bufS[lvl];
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const d = ss[i] * 2;
      // Squares at this size are indistinguishable from discs and far cheaper
      ctx.rect(xs[i] - ss[i], ys[i] - ss[i], d, d);
    }
    ctx.fill();
  }
  ctx.globalAlpha = 1;
};

let rafId = null;
const loop = (t) => {
  if (flight) stepFlight();

  // Constant gentle drift forward, plus whatever the scroll is adding
  drift += 0.22;
  camZ = scrollDepth + drift;

  warp += (targetWarp - warp) * 0.12;
  if (!flight) targetWarp *= 0.9;

  parX += (pointerX - parX) * 0.05;
  parY += (pointerY - parY) * 0.05;

  render(t);
  rafId = requestAnimationFrame(loop);
};

/* =========================================================
   Scroll → camera depth, HUD state, ticker skew
   ========================================================= */
const railFill = document.getElementById('railFill');
const sectionName = document.getElementById('sectionName');
const scrollHint = document.getElementById('scrollHint');
const tickerInner = document.querySelector('.ticker-inner');

let scrollDepth = 0;
let targetWarp = 0;
let lastScrollY = window.scrollY;
let scrollTicking = false;

// The ticker leans into the scroll and springs back
let targetSkew = 0, currentSkew = 0, skewRaf = null;
const runSkew = () => {
  currentSkew += (targetSkew - currentSkew) * 0.14;
  targetSkew *= 0.88;
  if (Math.abs(currentSkew) < 0.02 && Math.abs(targetSkew) < 0.02) {
    tickerInner.style.transform = '';
    skewRaf = null;
    return;
  }
  tickerInner.style.transform = `skewX(${currentSkew.toFixed(2)}deg)`;
  skewRaf = requestAnimationFrame(runSkew);
};

const onScroll = () => {
  if (flight) return;   // in flight mode the camera, not the document, moves
  const y = window.scrollY;
  const max = document.documentElement.scrollHeight - window.innerHeight;
  const velocity = y - lastScrollY;
  lastScrollY = y;

  railFill.style.height = (max > 0 ? (y / max) * 100 : 0) + '%';
  scrollHint.classList.toggle('gone', y > 120);

  if (!prefersReducedMotion) {
    // Scrolling pushes the camera deeper into the field
    scrollDepth = y * 0.55;
    targetWarp = Math.min(26, Math.abs(velocity) * 0.55);

    targetSkew = Math.max(-10, Math.min(10, velocity * 0.35));
    if (!skewRaf) skewRaf = requestAnimationFrame(runSkew);
  }

  scrollTicking = false;
};

window.addEventListener('scroll', () => {
  if (!scrollTicking) {
    requestAnimationFrame(onScroll);
    scrollTicking = true;
  }
}, { passive: true });

window.addEventListener('pointermove', (e) => {
  pointerX = (e.clientX / window.innerWidth - 0.5) * 2;
  pointerY = (e.clientY / window.innerHeight - 0.5) * 2;
}, { passive: true });

/* =========================================================
   FLIGHT MODE
   Scroll input doesn't move the document — it moves a camera.
   Each panel sits at its own station in depth and flies past.
   ========================================================= */
const panels = [...document.querySelectorAll('.panel')];
const LAST = panels.length - 1;

const FOCAL = 1000;        // camera focal length
const DEPTH_UNIT = 2100;   // depth between stations — big gap = long zoom from far away
const FAR = 4.2;           // how many stations ahead stay visible, receding into the dark
const EASE = 0.062;        // how quickly the camera catches up

let flight = false;
let target = 0;    // station we're heading for
let current = 0;   // where the camera actually is

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// How a thing at depth z reads: faint in the far dark, sharp at the lens, gone past it
const depthOpacity = (z) => z >= 0
  ? 1 - smoothstep(1.1, FAR, z)
  : 1 - smoothstep(0.12, 0.72, -z);

const depthScale = (z) => {
  const denom = FOCAL + z * DEPTH_UNIT;
  return denom < 60 ? 7 : clamp(FOCAL / denom, 0.01, 7);
};

// Small dead zone so whatever sits at the lens stays perfectly sharp.
// Capped low and dropped entirely once something is far away: blurring a
// full-screen layer is the single most expensive thing on the page, and at
// that distance the layer is tiny and faint enough that nobody can tell.
const BLUR_CUTOFF = 1.5;
const depthBlur = (z) => {
  const d = Math.abs(z);
  if (d > BLUR_CUTOFF) return 0;
  return clamp((d - 0.07) * 6, 0, 9);
};

const paintFlight = () => {
  for (let i = 0; i < panels.length; i++) {
    const p = panels[i];
    const z = i - current;              // stations ahead of the camera

    // A panel with depth layers isn't one flat plane — each layer carries its
    // own depth, so the section pulls apart as you fly through it
    if (p._layers.length) {
      let visible = false;
      p.style.opacity = '1';
      p.style.transform = 'none';
      p.style.filter = 'none';

      for (const { el, dz } of p._layers) {
        const lz = z + dz;
        const lo = depthOpacity(lz);
        if (lo < 0.004) { el.style.visibility = 'hidden'; continue; }
        const lb = depthBlur(lz);
        visible = true;
        el.style.visibility = 'visible';
        el.style.opacity = lo.toFixed(3);
        el.style.transform = `scale(${depthScale(lz).toFixed(4)})`;
        el.style.filter = lb > 0.4 ? `blur(${lb.toFixed(1)}px)` : 'none';
      }

      p.style.visibility = visible ? 'visible' : 'hidden';
      const inner = p.querySelector('.panel-inner');
      if (inner) inner.style.pointerEvents = Math.abs(z) < 0.3 ? 'auto' : 'none';
      continue;
    }

    const o = depthOpacity(z);
    if (o < 0.004) {
      p.style.visibility = 'hidden';
      continue;
    }

    const blur = depthBlur(z);
    p.style.visibility = 'visible';
    p.style.opacity = o.toFixed(3);
    p.style.transform = `scale(${depthScale(z).toFixed(4)})`;
    p.style.filter = blur > 0.4 ? `blur(${blur.toFixed(1)}px)` : 'none';

    // Only the station at the lens takes clicks — and only its content, since
    // the panel itself is a full-screen box that would otherwise eat every click
    const inner = p.querySelector('.panel-inner');
    if (inner) inner.style.pointerEvents = Math.abs(z) < 0.3 ? 'auto' : 'none';
  }

  railFill.style.height = ((current / LAST) * 100).toFixed(2) + '%';

  const label = panels[clamp(Math.round(current), 0, LAST)].dataset.section || '';
  if (sectionName.textContent !== label) sectionName.textContent = label;
};

const stepFlight = () => {
  const prev = current;
  current += (target - current) * EASE;
  if (Math.abs(target - current) < 0.0002) current = target;

  const vel = current - prev;
  scrollDepth = current * 950;                    // camera pushes through the stars
  targetWarp = Math.min(34, Math.abs(vel) * 1300); // fast travel streaks them

  paintFlight();
};

const hideHint = () => scrollHint.classList.add('gone');

// Free-flying while you scroll, but settle onto the nearest station once you
// stop — otherwise content comes to rest oversized and slightly out of focus
let snapTimer = null;
const scheduleSnap = () => {
  clearTimeout(snapTimer);
  snapTimer = setTimeout(() => {
    target = clamp(Math.round(target), 0, LAST);
  }, 170);
};

const nudge = (d) => {
  target = clamp(target + d, 0, LAST);
  hideHint();
  scheduleSnap();
};

const goTo = (i) => {
  target = clamp(i, 0, LAST);
  hideHint();
};

/* ---------- Flight input ---------- */
window.addEventListener('wheel', (e) => {
  if (!flight) return;
  e.preventDefault();
  // Normalise line/page deltas so trackpads and mice feel the same
  const dy = e.deltaMode === 1 ? e.deltaY * 16
    : e.deltaMode === 2 ? e.deltaY * window.innerHeight
    : e.deltaY;
  // Tuned so one normal wheel gesture advances about one station — any faster
  // and a flick skips a whole section before the snap can catch it
  nudge(dy * 0.00105);
}, { passive: false });

let touchY = null;
window.addEventListener('touchstart', (e) => {
  if (flight) touchY = e.touches[0].clientY;
}, { passive: true });

window.addEventListener('touchmove', (e) => {
  if (!flight || touchY === null) return;
  e.preventDefault();
  const y = e.touches[0].clientY;
  nudge((touchY - y) * 0.0035);
  touchY = y;
}, { passive: false });

window.addEventListener('touchend', () => { touchY = null; }, { passive: true });

window.addEventListener('keydown', (e) => {
  if (!flight || menu.classList.contains('open')) return;
  const k = e.key;
  if (k === 'ArrowDown' || k === 'PageDown' || k === ' ') {
    e.preventDefault(); goTo(Math.round(current) + 1);
  } else if (k === 'ArrowUp' || k === 'PageUp') {
    e.preventDefault(); goTo(Math.round(current) - 1);
  } else if (k === 'Home') {
    e.preventDefault(); goTo(0);
  } else if (k === 'End') {
    e.preventDefault(); goTo(LAST);
  }
});

// In-page links become jumps between stations
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (!a) return;
  const idx = panels.findIndex(p => p.id === a.getAttribute('href').slice(1));
  if (idx < 0 || !flight) return;
  e.preventDefault();
  goTo(idx);
});

/* ---------- Mode switching ---------- */
// Flight needs room and a pointer; small or reduced-motion visits scroll normally
const canFly = () =>
  !prefersReducedMotion &&
  window.innerWidth >= 900 &&
  window.innerHeight >= 640;

const panelObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) entry.target.classList.add('visible');
  });
}, { threshold: 0.18 });

// Whichever panel owns the middle of the screen names the HUD section
const labelObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (!flight && entry.isIntersecting) {
      sectionName.textContent = entry.target.dataset.section || '';
    }
  });
}, { rootMargin: '-45% 0px -45% 0px' });

panels.forEach(p => {
  panelObserver.observe(p);
  labelObserver.observe(p);
  p._layers = [...p.querySelectorAll('[data-z]')]
    .map(el => ({ el, dz: parseFloat(el.dataset.z) || 0 }));
});

const setMode = (on) => {
  if (on === flight) return;
  flight = on;
  document.documentElement.classList.toggle('flight', on);

  if (on) {
    target = current = clamp(Math.round(current), 0, LAST);
    // Nearer stations paint over farther ones, but all stay under the HUD (z 55+)
    panels.forEach((p, i) => { p.style.zIndex = String(40 - i); });
    paintFlight();
  } else {
    // Hand control back to the document
    panels.forEach(p => {
      p.style.cssText = '';
      p._layers.forEach(({ el }) => { el.style.cssText = ''; });
      p.classList.add('visible');
    });
    scrollDepth = 0;
    panels[clamp(Math.round(current), 0, LAST)].scrollIntoView({ block: 'start' });
  }
};

/* =========================================================
   Overlay menu
   ========================================================= */
const menuBtn = document.getElementById('menuBtn');
const menu = document.getElementById('menu');
const menuLinks = menu.querySelectorAll('a');

menuLinks.forEach((link, i) => {
  link.style.transitionDelay = `${i * 55}ms, ${i * 55}ms, 0s`;
});

const setMenu = (open) => {
  menu.classList.toggle('open', open);
  menuBtn.setAttribute('aria-expanded', String(open));
  menuBtn.textContent = open ? 'CLOSE' : 'MENU';
  document.body.style.overflow = open ? 'hidden' : '';
};

menuBtn.addEventListener('click', () => setMenu(!menu.classList.contains('open')));
menuLinks.forEach(link => link.addEventListener('click', () => setMenu(false)));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && menu.classList.contains('open')) setMenu(false);
});

/* =========================================================
   Project feature list
   ========================================================= */
const readMoreBtn = document.getElementById('readMoreBtn');
const featureList = document.getElementById('featureList');

readMoreBtn.addEventListener('click', () => {
  const expanded = featureList.classList.toggle('expanded');
  readMoreBtn.textContent = expanded ? 'Show Less' : 'Read More';
  readMoreBtn.setAttribute('aria-expanded', String(expanded));
});

/* =========================================================
   Stat counters
   ========================================================= */
const animateCount = (el) => {
  const target = parseInt(el.dataset.count, 10);
  const duration = 1100;
  const start = performance.now();
  const tick = (now) => {
    const p = Math.min((now - start) / duration, 1);
    el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

const statObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      animateCount(entry.target);
      statObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.5 });

document.querySelectorAll('.stat-num[data-count]').forEach(el => statObserver.observe(el));

/* =========================================================
   Boot
   ========================================================= */
resize();
buildOrbSprite();
allocBuffers();
seedField();
setMode(canFly());

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    resize();
    seedField();
    setMode(canFly());
    if (flight) paintFlight();
  }, 180);
});

if (prefersReducedMotion) {
  render(0);
} else {
  rafId = requestAnimationFrame(loop);
  // Don't burn frames on a hidden tab
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(rafId);
      rafId = null;
    } else if (!rafId) {
      rafId = requestAnimationFrame(loop);
    }
  });
}

onScroll();
