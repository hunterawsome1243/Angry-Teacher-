'use strict';
(() => {
const W = 1280, H = 720, GY = 650, SUB = 3, GRAV = 0.278;
const { Engine, Composite, Bodies, Body, Events, Sleeping } = Matter;
const $ = id => document.getElementById(id);
const cv = $('cv'), ctx = cv.getContext('2d'), stage = $('stage');
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const TAU = Math.PI * 2;

/* ============================ SAVE ============================ */
let save = { stars: {}, sound: true, voice: true };
try { Object.assign(save, JSON.parse(localStorage.getItem('angryTeacher') || '{}')); } catch (e) {}
const persist = () => { try { localStorage.setItem('angryTeacher', JSON.stringify(save)); } catch (e) {} };

/* ============================ AUDIO ============================ */
let AC = null, noiseBuf = null;
function initAudio() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { AC = null; }
}
function tone(f, f2, dur, type = 'sine', vol = 0.2, delay = 0) {
  if (!AC || !save.sound) return;
  const t = AC.currentTime + delay, o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + dur + 0.03);
}
function noise(dur, vol = 0.3, freq = 1200, delay = 0) {
  if (!AC || !save.sound) return;
  const t = AC.currentTime + delay, s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
  s.buffer = noiseBuf; f.type = 'lowpass'; f.frequency.value = freq;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(AC.destination); s.start(t); s.stop(t + dur + 0.03);
}
let lastSfx = {};
const gate = (k, ms) => { const n = performance.now(); if (n - (lastSfx[k] || 0) < ms) return false; lastSfx[k] = n; return true; };
const SFX = {
  twang() { tone(520, 140, 0.25, 'sawtooth', 0.12); tone(300, 90, 0.3, 'triangle', 0.18); },
  whoosh() { noise(0.25, 0.2, 2500); tone(400, 1200, 0.2, 'square', 0.05); },
  thud(v = 1) { if (gate('thud', 50)) { tone(160, 50, 0.12, 'sine', 0.25 * Math.min(1, v)); noise(0.08, 0.15 * v, 700); } },
  crash() { if (gate('crash', 50)) { noise(0.35, 0.35, 2200); tone(220, 60, 0.2, 'sawtooth', 0.1); tone(110, 40, 0.25, 'square', 0.08, 0.05); } },
  boing() { if (gate('boing', 80)) tone(200, 520, 0.22, 'triangle', 0.25); },
  ow() { tone(900, 500, 0.12, 'square', 0.1); tone(700, 1100, 0.15, 'square', 0.1, 0.1); },
  ding() { [660, 880, 1320].forEach((f, i) => tone(f, 0, 0.35, 'sine', 0.2, i * 0.09)); },
  pop() { tone(700, 200, 0.1, 'sine', 0.25); },
  boom() { noise(0.6, 0.5, 600); tone(90, 30, 0.5, 'sine', 0.5); },
  click() { tone(600, 400, 0.06, 'square', 0.08); },
  win() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0, 0.22, 'square', 0.12, i * 0.13)); },
  lose() { [330, 300, 270, 200].forEach((f, i) => tone(f, f * 0.93, 0.4, 'sawtooth', 0.14, i * 0.3)); },
  star() { tone(880, 1760, 0.25, 'triangle', 0.2); },
};
function speak(text) {
  if (!save.voice || !('speechSynthesis' in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/[^\w\s'?!.,]/g, ''));
    u.pitch = 0.45; u.rate = 1.05; u.volume = 1;
    speechSynthesis.speak(u);
  } catch (e) {}
}
let bubble = { text: '', t: 0 }, shout = 0;
function say(text, voice = true) { bubble = { text, t: 2.2 }; shout = 0.7; if (voice) speak(text); }
const LINES_LAUNCH = ['PAY ATTENTION!', 'THIS WILL BE ON THE TEST!', 'DETENTION!', 'EYES UP HERE!', 'NO PHONES IN CLASS!', 'I SAID SIT UP!', 'WAKE UP, CLASS!', 'HOMEWORK, NOW!'];
const LINES_SMART = ['Finally, learning!', 'Gold star!', 'Now THAT is a bright kid!', 'See? Education!', 'Ten points!'];

/* ============================ LEVEL BUILDING ============================ */
const MATS = {
  wood:  { hp: 45,  d: 0.0012, pierce: true },
  book:  { hp: 40,  d: 0.0014, pierce: true },
  shelf: { hp: 70,  d: 0.0010, pierce: true },
  board: { hp: 50,  d: 0.0009, pierce: true },
  metal: { hp: 150, d: 0.0022, pierce: false },
};
const BOOKCOL = ['#e0453a', '#3c8be0', '#3fae4a', '#f2a81d', '#8c53c9', '#21a8a0'];
const STYPES = {
  slacker: { r: 21, hp: 1, thr: 8,  pts: 5000,  dens: 0.0012 },
  clown:   { r: 21, hp: 2, thr: 8,  pts: 7000,  dens: 0.0012 },
  zombie:  { r: 21, hp: 1, thr: 8,  pts: 7000,  dens: 0.0012, shield: 55 },
  boss:    { r: 34, hp: 5, thr: 14, pts: 15000, dens: 0.0016 },
};
const SKINS = ['#ffd7b0', '#f1b98a', '#c98b5e', '#8d5a3a', '#ffe0c2'];
const SHIRTS = ['#3c8be0', '#3fae4a', '#e0453a', '#8c53c9', '#f2a81d', '#21a8a0'];
const HAIRS = ['#3a2412', '#16120e', '#c2761a', '#6b3a1d', '#e3c15a'];

let engine, students = [], flying = [], toRemove = new Set(), later = [], restore = new Map();
let loading = false, blockCount = 0;

function makeEngine() {
  engine = Engine.create({ enableSleeping: true, positionIterations: 10, velocityIterations: 8 });
  engine.gravity.y = 1;
  const ground = Bodies.rectangle(640, GY + 40, 6000, 80, { isStatic: true, friction: 1, frictionStatic: 1, restitution: 0.1 });
  ground.pw = 0.5; ground.isGround = true;
  const wall = Bodies.rectangle(1330, 0, 40, 3000, { isStatic: true, restitution: 0.3 });
  wall.pw = 0.5;
  Composite.add(engine.world, [ground, wall]);
  Events.on(engine, 'collisionStart', ev => { if (!loading) for (const p of ev.pairs) onPair(p.bodyA, p.bodyB); });
}
const add = b => { Composite.add(engine.world, b); return b; };

function block(mat, cx, bottom, w, h) {
  const M = MATS[mat];
  const b = Bodies.rectangle(cx, bottom - h / 2 - 0.3, w, h, { density: M.d, friction: 0.8, frictionStatic: 1.2, restitution: 0.05, slop: 0.03, sleepThreshold: 30 });
  b.tt = { mat, hp: M.hp, max: M.hp, w, h, col: BOOKCOL[blockCount % BOOKCOL.length], seed: blockCount, hurt: 0 };
  blockCount++;
  b.pw = Math.sqrt(b.mass);
  add(b);
  return bottom - h;
}
const desk = (x, b = GY) => { block('wood', x - 38, b, 10, 44); block('wood', x + 38, b, 10, 44); block('wood', x, b - 44, 100, 12); return b - 56; };
const chair = (x, b = GY) => { block('wood', x - 13, b, 6, 24); block('wood', x + 13, b, 6, 24); block('wood', x, b - 24, 36, 8); block('wood', x - 15, b - 32, 6, 34); return b - 32; };
const books = (x, b, n, w = 70) => { let y = b; for (let i = 0; i < n; i++) y = block('book', x, y, w - (i % 2) * 6, 16); return y; };
const plank = (x, b, w, h = 14) => block('wood', x, b, w, h);
const shelf = (x, b = GY, h = 150) => block('shelf', x, b, 64, h);
const locker = (x, b = GY, h = 120) => block('metal', x, b, 52, h);
const board = (x, b = GY, h = 110) => block('board', x, b, 14, h);
let skinN = 0;
function student(type, cx, bottom) {
  const c = STYPES[type], r = c.r, cy = bottom - r - 0.5;
  const base = { density: c.dens, friction: 0.9, frictionStatic: 1.2, restitution: 0.15, sleepThreshold: 30 };
  const head = Bodies.polygon(cx, cy, 8, r * 1.05, base);
  let body = head, pack = null;
  if (c.shield) {
    pack = Bodies.rectangle(cx - r - 7, cy + 2, 14, 38, { ...base, density: 0.0012 });
    body = Body.create({ parts: [head, pack], friction: 0.9, frictionStatic: 1.2, restitution: 0.1, sleepThreshold: 30 });
  }
  const st = {
    type, cfg: c, hp: c.hp, max: c.hp, smart: false, body, head, pack, shield: c.shield || 0,
    cd: 0, flash: 0, bulb: 0, dodge: 0, t0: rnd(0, 6), skin: SKINS[skinN % SKINS.length],
    shirt: SHIRTS[(skinN * 2 + 1) % SHIRTS.length], hair: HAIRS[(skinN * 3) % HAIRS.length], packFlash: 0,
  };
  skinN++;
  body.st = st; body.pw = Math.sqrt(body.mass);
  students.push(st); add(body);
  return st;
}

const S = student;
const LEVELS = [
  { name: 'Wake Up, Class!', hint: 'Drag back the slingshot, then let go!', ammo: ['textbook', 'textbook', 'textbook', 'pencil'],
    build() { S('slacker', 760, GY); let t = books(980, GY, 3); S('slacker', 980, t); } },
  { name: 'Desk Row', hint: 'Students hide under desks. Smash the desk!', ammo: ['textbook', 'pencil', 'eraser', 'textbook'],
    build() { desk(700); S('slacker', 700, GY); let t = desk(880); S('slacker', 880, t); desk(1050); S('slacker', 1050, GY); chair(790); } },
  { name: 'Class Clown', hint: 'Clowns dodge and take 2 hits!', ammo: ['textbook', 'eraser', 'pencil', 'chalk', 'textbook'],
    build() { let t = books(780, GY, 4); S('clown', 780, t); desk(950); S('slacker', 950, GY); board(1050, GY, 100); S('slacker', 1130, GY); } },
  { name: 'Phone Zombies', hint: 'Backpacks block hits. Hit from above!', ammo: ['textbook', 'pencil', 'chalk', 'eraser', 'textbook'],
    build() { S('zombie', 780, GY); let t = desk(960); S('zombie', 960, t); t = chair(1120); S('slacker', 1128, t); board(880, GY, 90); } },
  { name: 'Library Hour', hint: 'Dictionaries are HEAVY. Tap for an earthquake!', ammo: ['textbook', 'dictionary', 'chalk', 'pencil', 'eraser'],
    build() { let a = shelf(800); S('clown', 800, a); shelf(1000); plank(900, GY - 150, 260); S('zombie', 900, GY - 164); S('slacker', 900, GY); S('slacker', 1180, GY); } },
  { name: 'Locker Room', hint: 'Metal lockers are tough. Go over or around!', ammo: ['dictionary', 'pencil', 'chalk', 'eraser', 'textbook'],
    build() { locker(700); locker(760); plank(730, GY - 120, 130); S('clown', 730, GY - 134); S('slacker', 830, GY);
      let t = desk(960); S('zombie', 960, t); board(1060, GY, 110); S('slacker', 1120, GY); S('zombie', 1205, GY); } },
  { name: 'Pop Quiz Pyramid', hint: 'Topple the pyramid!', ammo: ['dictionary', 'textbook', 'chalk', 'pencil', 'eraser', 'textbook'],
    build() { desk(820); desk(940); desk(1060); S('slacker', 820, GY); S('slacker', 1060, GY);
      desk(880, GY - 56); desk(1000, GY - 56); S('clown', 880, GY - 56); S('slacker', 1000, GY - 56);
      let t = desk(940, GY - 112); S('zombie', 940, t); } },
  { name: 'Double Trouble', hint: 'Two towers, lots of trouble.', ammo: ['dictionary', 'eraser', 'chalk', 'pencil', 'textbook', 'textbook'],
    build() { let t = books(760, GY, 3); S('clown', 760, t); t = desk(900); S('slacker', 900, t); S('slacker', 900, GY); chair(980);
      t = shelf(1060); S('zombie', 1060, t); board(1130, GY, 110); S('clown', 1185, GY); } },
  { name: "Dean's List", hint: 'Lockers stacked high. Find the weak spot!', ammo: ['dictionary', 'textbook', 'pencil', 'chalk', 'eraser', 'dictionary'],
    build() { locker(730); locker(730, GY - 120); board(800, GY, 110); S('slacker', 880, GY);
      shelf(930); shelf(1130); plank(1030, GY - 150, 280); S('zombie', 1000, GY); S('slacker', 1070, GY); S('clown', 1030, GY - 164);
      let t = locker(1215); S('slacker', 1215, t); } },
  { name: 'The Kid Who Never Does Homework', hint: 'BOSS LEVEL! He takes 5 hits. Keep pounding!', ammo: ['dictionary', 'textbook', 'pencil', 'chalk', 'eraser', 'dictionary', 'textbook'],
    build() { let t = desk(700); S('zombie', 700, t); locker(800); locker(800, GY - 120); S('slacker', 870, GY);
      shelf(960); shelf(1170); plank(1065, GY - 150, 330); S('boss', 1065, GY - 164); S('zombie', 1030, GY); S('clown', 1100, GY); } },
];

/* ============================ PROJECTILES ============================ */
const PT = {
  textbook:   { name: 'Textbook',   w: 38, h: 28, dens: 0.006, pw: 2.3, speed: 1.0,  rest: 0.1,  ab: 'SLAM!' },
  pencil:     { name: 'Pencil',     w: 56, h: 8,  dens: 0.010, pw: 2.4, speed: 1.12, rest: 0.05, ab: 'PIERCE!' },
  eraser:     { name: 'Eraser',     w: 34, h: 22, dens: 0.006, pw: 1.8, speed: 1.0,  rest: 0.92, ab: 'HOMING BOUNCE!' },
  chalk:      { name: 'Chalk',      w: 30, h: 9,  dens: 0.008, pw: 1.6, speed: 1.0,  rest: 0.3,  ab: 'SPLIT!' },
  dictionary: { name: 'Dictionary', w: 56, h: 42, dens: 0.007, pw: 4.0, speed: 0.82, rest: 0.05, ab: 'EARTHQUAKE!' },
};
const VMAX = 23, MAXPULL = 125, REST = { x: 231, y: 525 };

function makeProj(type, x, y, angle, opt = {}) {
  const c = PT[type];
  const w = opt.w || c.w, h = opt.h || c.h;
  const o = { density: opt.dens || c.dens, friction: type === 'eraser' ? 0.3 : 0.6, restitution: c.rest, frictionAir: 0, slop: 0.03, angle, sleepThreshold: 60 };
  if (type === 'eraser') o.chamfer = { radius: 6 };
  const b = Bodies.rectangle(x, y, w, h, o);
  b.pw = opt.pw || c.pw;
  b.pj = { type, w, h, used: false, hit: false, age: 0, still: 0, piercing: 0, shock: false, homing: 0, piece: !!opt.piece, dive: false };
  add(b); flying.push(b);
  return b;
}

/* ============================ COLLISIONS ============================ */
function onPair(pa, pb) {
  const A = pa.parent, B = pb.parent;
  if (A === B) return;
  const rel = Math.hypot(A.velocity.x - B.velocity.x, A.velocity.y - B.velocity.y);
  if (rel > 2.5) {
    const pj = A.pj || B.pj;
    if (pj && pj.type === 'eraser') SFX.boing();
    else if (rel > 5) SFX.thud(rel / 14);
  }
  if (A.pj) A.pj.hit = true;
  if (B.pj) B.pj.hit = true;
  impact(A, pa, B, rel);
  impact(B, pb, A, rel);
  for (const X of [A, B]) {
    const pj = X.pj;
    if (pj && pj.shock) { pj.shock = false; shockwave(X.position.x, X.position.y); }
  }
}

function impact(X, part, O, rel) {
  if (X.isStatic) return;
  const imp = rel * (O.pw || 1);
  if (X.tt) hurtBlock(X, imp, O);
  else if (X.st) hurtStudent(X.st, part, imp, O);
}

function hurtBlock(X, imp, O) {
  const t = X.tt;
  if (toRemove.has(X)) return;
  if (O.pj && O.pj.piercing > 0 && MATS[t.mat].pierce) {
    destroyBlock(X); score += t.max;
    restore.set(O, { vx: O.velocity.x, vy: O.velocity.y, keep: 1 });
    return;
  }
  if (imp < 7) return;
  const dmg = (imp - 6) * 0.9;
  t.hp -= dmg; t.hurt = 0.3; score += Math.round(dmg);
  if (t.hp <= 0) {
    destroyBlock(X); score += Math.round(t.max * 0.5);
    if (O.pj) restore.set(O, { vx: O.velocity.x, vy: O.velocity.y, keep: O.pj.type === 'dictionary' ? 0.92 : 0.6 });
  }
}

function destroyBlock(X) {
  if (toRemove.has(X)) return;
  toRemove.add(X);
  const t = X.tt, p = X.position;
  SFX.crash();
  const cols = { wood: ['#c98a4b', '#a86f36', '#e3a866'], book: [t.col, '#fff7dc', t.col], shelf: ['#8a5a30', '#6b4423', BOOKCOL[2]], board: ['#fff', '#ccd', '#8a5a30'], metal: ['#6f8fb3', '#9bb3d1', '#445'] }[t.mat];
  const n = clamp(Math.round(t.w * t.h / 250), 5, 14);
  for (let i = 0; i < n; i++) parts.push({ x: p.x + rnd(-t.w / 2, t.w / 2) * 0.8, y: p.y + rnd(-t.h / 2, t.h / 2) * 0.8, vx: rnd(-4, 4), vy: rnd(-7, -1), g: 0.3, life: rnd(0.6, 1.2), max: 1.2, size: rnd(4, 9), col: cols[i % 3], rot: rnd(0, 6), vr: rnd(-0.3, 0.3), shape: 'rect' });
  parts.push({ x: p.x, y: p.y, vx: 0, vy: 0, g: 0, life: 0.4, max: 0.4, size: 30, col: '#fff', shape: 'ring' });
}

function hurtStudent(st, part, imp, O) {
  if (st.smart) return;
  const eff = imp * (O.pj ? 1.6 : 1);
  if (part === st.pack && st.pack) {
    if (eff >= 6) {
      st.shield -= eff * 0.9 - 2; st.packFlash = 0.3;
      SFX.thud(1);
      if (st.shield <= 0) later.push(() => breakShield(st));
    }
    return;
  }
  if (eff < st.cfg.thr || st.cd > 0) return;
  st.cd = 0.35; st.hp--;
  if (st.hp <= 0) makeSmart(st);
  else { st.flash = 0.9; SFX.ow(); popText(st.cfg.hp - st.hp > 0 && st.type === 'boss' ? ['OUCH!', 'NO WAY!', 'HEY!', 'STOP IT!'][st.max - st.hp - 1] || 'OW!' : 'OW!', st.head.position.x, st.head.position.y - 50, '#fff'); }
}

function breakShield(st) {
  if (!st.pack) return;
  const old = st.body, p = st.head.position, r = st.cfg.r;
  const nb = Bodies.polygon(p.x, p.y, 8, r * 1.05, { density: st.cfg.dens, friction: 0.9, frictionStatic: 1.2, restitution: 0.15, sleepThreshold: 30 });
  Body.setAngle(nb, old.angle); Body.setVelocity(nb, old.velocity); Body.setAngularVelocity(nb, old.angularVelocity);
  const pp = st.pack.position;
  Composite.remove(engine.world, old); add(nb);
  st.body = nb; st.head = nb; st.pack = null; nb.st = st; nb.pw = Math.sqrt(nb.mass);
  SFX.crash(); popText('BACKPACK BUSTED!', p.x, p.y - 50, '#ffd21f');
  for (let i = 0; i < 10; i++) parts.push({ x: pp.x, y: pp.y, vx: rnd(-5, 2), vy: rnd(-7, -1), g: 0.3, life: 1, max: 1, size: rnd(4, 8), col: i % 2 ? '#e0453a' : '#fff7dc', rot: 0, vr: rnd(-.3, .3), shape: 'rect' });
}

function makeSmart(st) {
  st.smart = true; st.bulb = 0; st.flash = 0;
  score += st.cfg.pts;
  const p = st.head.position;
  popText('+' + st.cfg.pts.toLocaleString(), p.x, p.y - 60, '#ffe14d');
  SFX.ding();
  for (let i = 0; i < 26; i++) parts.push({ x: p.x, y: p.y - 10, vx: rnd(-6, 6), vy: rnd(-10, -2), g: 0.25, life: rnd(0.8, 1.6), max: 1.6, size: rnd(4, 8), col: BOOKCOL[i % 6], rot: rnd(0, 6), vr: rnd(-.3, .3), shape: 'rect' });
  if (gate('smartline', 2500)) say(LINES_SMART[Math.floor(rnd(0, LINES_SMART.length))], true);
}

function shockwave(x, y) {
  SFX.boom(); shake = 14;
  parts.push({ x, y, vx: 0, vy: 0, g: 0, life: 0.6, max: 0.6, size: 190, col: '#fff', shape: 'ring' });
  const R = 200;
  for (const b of Composite.allBodies(engine.world)) {
    if (b.isStatic || b.pj) continue;
    const dx = b.position.x - x, dy = b.position.y - y, d = Math.hypot(dx, dy);
    if (d > R || d < 0.1) continue;
    const f = 1 - d / R;
    Sleeping.set(b, false);
    const k = 11 * f / Math.pow(b.mass, 0.3);
    Body.setVelocity(b, { x: b.velocity.x + dx / d * k, y: b.velocity.y + dy / d * k - 3 * f });
    if (b.tt) hurtBlock(b, 26 * f + 6, { pw: 1 });
    else if (b.st) hurtStudent(b.st, b.st.head, 16 * f, { pw: 1 });
  }
}

/* ============================ STATE ============================ */
let mode = 'title', paused = false, over = false;
let li = 0, L = null, score = 0, ammo = [], fired = 0, parts = [], texts = [], shake = 0, T = 0;
let aim = { on: false, x: REST.x, y: REST.y }, reload = 0, winT = 0, loseT = 0, introT = 0, settled = 0;
let P2 = 0, P3 = 0, stagePts = 0;
const canAim = () => mode === 'play' && !paused && !over && fired < ammo.length && flying.length === 0 && reload <= 0;

function startLevel(i) {
  li = i; L = LEVELS[i]; mode = 'play'; paused = false; over = false;
  hideScreens(); $('hud').style.display = 'flex';
  students = []; flying = []; toRemove = new Set(); later = []; restore = new Map(); parts = []; texts = []; blockCount = 0; skinN = 0;
  makeEngine(); loading = true;
  L.build();
  for (let k = 0; k < 160; k++) for (let s = 0; s < SUB; s++) Engine.update(engine, 1000 / 60 / SUB);
  for (const b of Composite.allBodies(engine.world)) if (!b.isStatic) { Body.setVelocity(b, { x: 0, y: 0 }); Body.setAngularVelocity(b, 0); }
  loading = false;
  ammo = L.ammo.slice(); fired = 0; score = 0; aim.on = false; reload = 0.5; winT = loseT = 0; introT = 3.2; bubble.t = 0; settled = 0;
  stagePts = students.reduce((a, s) => a + s.cfg.pts, 0);
  P2 = stagePts + 2500; P3 = stagePts + 12500;
  sayLater = 0.6;
}
let sayLater = 0;

function launch() {
  const vx = REST.x - aim.x, vy = REST.y - aim.y, len = Math.hypot(vx, vy);
  if (len < 22) { aim.on = false; return; }
  const type = ammo[fired++], c = PT[type];
  const sp = Math.min(len / MAXPULL, 1) * VMAX * c.speed, ang = Math.atan2(vy, vx);
  const b = makeProj(type, aim.x, aim.y, ang);
  Body.setVelocity(b, { x: Math.cos(ang) * sp, y: Math.sin(ang) * sp });
  aim.on = false; reload = 0.3; SFX.twang();
  say(LINES_LAUNCH[Math.floor(rnd(0, LINES_LAUNCH.length))], true);
  armT = 0.25;
}
let armT = 0;

function activate() {
  let did = false;
  for (const b of flying.slice()) {
    const pj = b.pj;
    if (pj.used) continue;
    pj.used = true; did = true;
    const v = b.velocity, sp = Math.hypot(v.x, v.y) || 1, p = b.position;
    switch (pj.type) {
      case 'textbook':
        Body.setVelocity(b, { x: v.x * 0.25, y: Math.max(v.y, 0) + 17 }); b.pw *= 1.35; SFX.whoosh(); break;
      case 'pencil':
        pj.piercing = 2.5; Body.setVelocity(b, { x: v.x / sp * Math.max(sp * 1.2, 20), y: v.y / sp * Math.max(sp * 1.2, 20) }); SFX.whoosh(); break;
      case 'eraser': pj.homing = 1.3; SFX.boing(); break;
      case 'chalk': {
        SFX.pop(); toRemove.add(b); const a0 = Math.atan2(v.y, v.x);
        for (const da of [-0.3, 0, 0.3]) {
          const n = makeProj('chalk', p.x, p.y, a0 + da, { w: 14, h: 8, dens: 0.012, pw: 1.45, piece: true });
          n.pj.used = true; Body.setVelocity(n, { x: Math.cos(a0 + da) * sp, y: Math.sin(a0 + da) * sp });
        }
        for (let i = 0; i < 10; i++) parts.push({ x: p.x, y: p.y, vx: rnd(-3, 3), vy: rnd(-3, 3), g: 0.05, life: 0.6, max: 0.6, size: rnd(3, 7), col: '#fff', shape: 'circle' });
        break; }
      case 'dictionary':
        Body.setVelocity(b, { x: v.x * 0.2, y: Math.max(v.y, 0) + 19 }); b.pw *= 1.5; pj.shock = true; SFX.whoosh(); break;
    }
    popText(PT[pj.type].ab, p.x, p.y - 34, '#fff');
  }
  return did;
}

function removeProj(b) {
  flying.splice(flying.indexOf(b), 1);
  toRemove.add(b);
  for (let i = 0; i < 6; i++) parts.push({ x: b.position.x, y: b.position.y, vx: rnd(-2, 2), vy: rnd(-3, 0), g: 0.1, life: 0.5, max: 0.5, size: rnd(3, 6), col: '#fff', shape: 'circle' });
}

/* ============================ UPDATE ============================ */
function postStep() {
  for (const [b, r] of restore) {
    if (toRemove.has(b)) continue;
    Body.setVelocity(b, { x: r.vx * r.keep, y: r.vy * r.keep });
  }
  restore.clear();
  if (later.length) { const l = later; later = []; l.forEach(f => f()); }
  if (toRemove.size) {
    for (const b of toRemove) Composite.remove(engine.world, b);
    for (const b of toRemove) { const i = flying.indexOf(b); if (i >= 0) flying.splice(i, 1); }
    toRemove.clear();
  }
}

function tick() {
  T += 1 / 60;
  if (mode === 'title' || mode === 'levels') { titleTick(); return; }
  if (paused) return;
  const dt = 1 / 60;
  if (introT > 0) introT -= dt;
  if (sayLater > 0) { sayLater -= dt; if (sayLater <= 0 && li === 0) say('Ahem! PAY ATTENTION!', true); }
  if (!over) {
    for (let s = 0; s < SUB; s++) { Engine.update(engine, 1000 / 60 / SUB); postStep(); }
    // per-frame projectile logic
    for (const b of flying.slice()) {
      const pj = b.pj, v = b.velocity, sp = Math.hypot(v.x, v.y);
      pj.age += dt;
      if (pj.piercing > 0) pj.piercing -= dt;
      if (pj.type === 'pencil' && !pj.hit && sp > 1) { Body.setAngle(b, Math.atan2(v.y, v.x)); Body.setAngularVelocity(b, 0); }
      if (pj.homing > 0) {
        pj.homing -= dt;
        let best = null, bd = 1e9;
        for (const s of students) if (!s.smart) { const d = Math.hypot(s.head.position.x - b.position.x, s.head.position.y - b.position.y); if (d < bd) { bd = d; best = s; } }
        if (best) {
          const dx = best.head.position.x - b.position.x, dy = best.head.position.y - b.position.y, d = Math.hypot(dx, dy) || 1, tsp = Math.max(sp, 15);
          Body.setVelocity(b, { x: v.x + (dx / d * tsp - v.x) * 0.12, y: v.y + (dy / d * tsp - v.y) * 0.12 });
        }
      }
      if (pj.age < 0.6 && sp > 3 && T % 0.05 < dt) trail(b);
      else if (sp > 6 && T % 0.08 < dt) trail(b);
      if (sp < 0.35) pj.still += dt; else pj.still = 0;
      const p = b.position;
      if (p.x > 1500 || p.x < -200 || p.y > 900 || pj.age > 8 || (pj.still > 1 && pj.age > 0.8)) removeProj(b);
    }
    postStep();
    // students
    for (const s of students) {
      s.cd = Math.max(0, s.cd - dt); s.flash = Math.max(0, s.flash - dt); s.packFlash = Math.max(0, s.packFlash - dt);
      if (s.smart) s.bulb = Math.min(1, s.bulb + dt * 3);
      s.dodge -= dt;
      if (s.type === 'clown' && !s.smart && s.dodge <= 0) {
        for (const b of flying) {
          const dx = s.head.position.x - b.position.x, dy = s.head.position.y - b.position.y;
          if (dx > 0 && dx < 260 && Math.abs(dy) < 130 && b.velocity.x > 3) {
            s.dodge = 1.8;
            if (Math.random() < 0.55) {
              Sleeping.set(s.body, false);
              Body.setVelocity(s.body, { x: s.body.velocity.x + rnd(1, 3), y: -rnd(5, 7) });
              Body.setAngularVelocity(s.body, rnd(-0.15, 0.15));
              popText('Whoa!', s.head.position.x, s.head.position.y - 50, '#fff');
              SFX.boing();
            }
            break;
          }
        }
      }
    }
    for (const b of Composite.allBodies(engine.world)) if (b.tt && b.tt.hurt > 0) b.tt.hurt -= dt;
    if (reload > 0) reload -= dt;
    // fell out of the world
    for (const s of students) if (s.head.position.y > 900 && !s.smart) makeSmart(s);
    // win / lose
    const allSmart = students.every(s => s.smart);
    if (allSmart) { winT += dt; if (winT > 1.3) finish(true); }
    else if (fired >= ammo.length && flying.length === 0) { loseT += dt; if (loseT > 3) finish(false); }
    else loseT = 0;
  }
  // fx
  for (const p of parts) { p.x += p.vx; p.y += p.vy; p.vy += p.g; p.life -= dt; if (p.rot !== undefined) p.rot += p.vr || 0; }
  parts = parts.filter(p => p.life > 0);
  for (const t of texts) { t.y -= 0.7; t.t -= dt; }
  texts = texts.filter(t => t.t > 0);
  if (bubble.t > 0) bubble.t -= dt;
  if (shout > 0) shout -= dt;
  if (armT > 0) armT -= dt;
  shake *= 0.9;
}
function titleTick() {
  if (Math.floor(T * 0.4) !== Math.floor((T - 1 / 60) * 0.4)) {
    const ls = ['PAY ATTENTION!', 'NO TALKING!', 'OPEN YOUR BOOKS!', 'WHO FORGOT THEIR HOMEWORK?!'];
    bubble = { text: ls[Math.floor(T * 0.4) % ls.length], t: 2 }; shout = 0.6;
  }
  if (bubble.t > 0) bubble.t -= 1 / 60;
  if (shout > 0) shout -= 1 / 60;
  for (const p of parts) { p.x += p.vx; p.y += p.vy; p.vy += p.g; p.life -= 1 / 60; }
  parts = parts.filter(p => p.life > 0);
}
function trail(b) { parts.push({ x: b.position.x, y: b.position.y, vx: 0, vy: 0, g: 0, life: 0.45, max: 0.45, size: 5, col: '#fff', shape: 'circle', a: 0.5 }); }
function popText(text, x, y, col) { texts.push({ text, x, y, t: 1.3, col }); }

/* ============================ FINISH ============================ */
function finish(win) {
  if (over) return;
  over = true; mode = 'result'; $('hud').style.display = 'none';
  const left = Math.max(0, ammo.length - fired), bonus = win ? left * 10000 : 0, total = score + bonus;
  let stars = 0;
  if (win) { stars = 1; if (total >= P2) stars = 2; if (total >= P3) stars = 3; }
  if (win) {
    if ((save.stars[li] || 0) < stars) save.stars[li] = stars;
    persist(); SFX.win(); say('CLASS DISMISSED!', true);
  } else { SFX.lose(); say('SEE ME AFTER CLASS!', true); }
  const smart = students.filter(s => s.smart).length;
  $('rTitle').textContent = win ? (stars === 3 ? 'PERFECT LESSON!' : 'CLASS SMARTENED!') : 'DETENTION FOR YOU!';
  $('rSum').innerHTML = `<div><span>Smart students</span><span>${smart}/${students.length}</span></div>
    <div><span>Destruction + students</span><span>${score.toLocaleString()}</span></div>
    <div><span>Spare supplies ×${left}</span><span>+${bonus.toLocaleString()}</span></div>
    <div class="tot"><span>TOTAL</span><span>${total.toLocaleString()}</span></div>
    ${win ? `<div style="font-size:.75em;opacity:.7"><span>★★ at ${P2.toLocaleString()}</span><span>★★★ at ${P3.toLocaleString()}</span></div>` : ''}`;
  const sp = $('rStars').children;
  for (let i = 0; i < 3; i++) { sp[i].className = ''; sp[i].style.animationDelay = ''; }
  $('rStars').style.display = win ? '' : 'none';
  $('rNext').style.display = win && li < LEVELS.length - 1 ? '' : 'none';
  setTimeout(() => {
    show('sResult');
    for (let i = 0; i < stars; i++) { sp[i].className = 'on'; sp[i].style.animationDelay = (i * 0.35) + 's'; setTimeout(SFX.star, 200 + i * 350); }
  }, win ? 400 : 700);
}

/* ============================ INPUT ============================ */
function ptr(e) { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H }; }
function setAim(p) {
  let dx = p.x - REST.x, dy = p.y - REST.y; const d = Math.hypot(dx, dy);
  if (d > MAXPULL) { dx *= MAXPULL / d; dy *= MAXPULL / d; }
  aim.x = Math.min(REST.x + 8, REST.x + dx); aim.y = Math.min(GY - 14, REST.y + dy);
}
cv.addEventListener('pointerdown', e => {
  if (mode !== 'play') return;
  initAudio(); e.preventDefault();
  if (paused || over) return;
  const p = ptr(e);
  if (flying.length) { activate(); return; }
  if (canAim() && Math.hypot(p.x - REST.x, p.y - REST.y) < 220) {
    aim.on = true; setAim(p); try { cv.setPointerCapture(e.pointerId); } catch (x) {}
  }
});
cv.addEventListener('pointermove', e => { if (aim.on) setAim(ptr(e)); });
const up = () => { if (aim.on) launch(); };
cv.addEventListener('pointerup', up);
cv.addEventListener('pointercancel', () => { aim.on = false; });
addEventListener('keydown', e => {
  if (e.code === 'Space' && mode === 'play' && !paused && !over) { initAudio(); activate(); e.preventDefault(); }
  if ((e.code === 'Escape' || e.code === 'KeyP') && mode === 'play' && !over) setPause(!paused);
  if (e.code === 'KeyR' && mode === 'play' && !over) startLevel(li);
});
cv.addEventListener('contextmenu', e => e.preventDefault());

/* ============================ UI ============================ */
const SCREENS = ['sTitle', 'sLevels', 'sHow', 'sPause', 'sResult'];
function hideScreens() { SCREENS.forEach(s => $(s).classList.remove('show')); }
function show(id) { hideScreens(); $(id).classList.add('show'); }
function setPause(p) { paused = p; if (p) show('sPause'); else hideScreens(); SFX.click(); updateSettingsUI(); }
function updateSettingsUI() {
  $('pSfx').textContent = 'SOUND: ' + (save.sound ? 'ON' : 'OFF');
  $('pVoice').textContent = 'VOICE: ' + (save.voice ? 'ON' : 'OFF');
  $('bSnd').textContent = save.sound ? '🔊' : '🔇';
}
function toTitle() { mode = 'title'; paused = false; over = false; $('hud').style.display = 'none'; show('sTitle'); try { speechSynthesis.cancel(); } catch (e) {} }
function toLevels() {
  mode = 'levels'; paused = false; over = false; $('hud').style.display = 'none';
  const g = $('grid'); g.innerHTML = '';
  for (let i = 0; i < LEVELS.length; i++) {
    const unlocked = i === 0 || (save.stars[i - 1] || 0) > 0, s = save.stars[i] || 0;
    const b = document.createElement('button');
    b.className = 'lv' + (unlocked ? '' : ' lock');
    b.innerHTML = unlocked ? `${i + 1}<i><b>${'★'.repeat(s)}</b>${'★'.repeat(3 - s)}</i>` : '🔒';
    if (unlocked) b.onclick = () => { initAudio(); SFX.click(); startLevel(i); };
    g.appendChild(b);
  }
  show('sLevels');
}
function firstUnfinished() { for (let i = 0; i < LEVELS.length; i++) if (!(save.stars[i] > 0)) return i; return LEVELS.length - 1; }
$('bPlay').onclick = () => { initAudio(); SFX.click(); startLevel(firstUnfinished()); };
$('bLevels').onclick = () => { initAudio(); SFX.click(); toLevels(); };
$('bHow').onclick = () => { initAudio(); SFX.click(); show('sHow'); };
$('bHowBack').onclick = () => { SFX.click(); show(mode === 'play' ? 'sPause' : 'sTitle'); };
$('bLevBack').onclick = () => { SFX.click(); toTitle(); };
$('bPause').onclick = () => setPause(true);
$('bRestart').onclick = () => { SFX.click(); startLevel(li); };
$('bSnd').onclick = () => { initAudio(); save.sound = !save.sound; persist(); updateSettingsUI(); SFX.click(); };
$('pResume').onclick = () => setPause(false);
$('pRetry').onclick = () => { SFX.click(); startLevel(li); };
$('pLevels').onclick = () => { SFX.click(); toLevels(); };
$('pSfx').onclick = () => { save.sound = !save.sound; persist(); updateSettingsUI(); SFX.click(); };
$('pVoice').onclick = () => { save.voice = !save.voice; persist(); updateSettingsUI(); if (!save.voice) try { speechSynthesis.cancel(); } catch (e) {} };
$('rRetry').onclick = () => { SFX.click(); startLevel(li); };
$('rNext').onclick = () => { SFX.click(); startLevel(li + 1); };
$('rLevels').onclick = () => { SFX.click(); toLevels(); };
updateSettingsUI();

let scale = 1;
function resize() {
  let w = innerWidth, h = w * 9 / 16;
  if (h > innerHeight) { h = innerHeight; w = h * 16 / 9; }
  stage.style.width = w + 'px'; stage.style.height = h + 'px'; stage.style.fontSize = (w / W * 20) + 'px';
  const dpr = Math.min(devicePixelRatio || 1, 2);
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); scale = cv.width / W;
}
addEventListener('resize', resize); resize();
document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'play' && !over && !paused) setPause(true); });

/* ============================ DRAWING ============================ */
function rr(x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function circ(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); }
const font = (px, w = 'bold') => `${w} ${px}px "Comic Sans MS","Chalkboard SE","Marker Felt","Trebuchet MS",cursive,sans-serif`;

// ---- background (pre-rendered) ----
const bg = document.createElement('canvas'); bg.width = W; bg.height = H;
(function drawBG() {
  const c = bg.getContext('2d'), save_ = ctx;
  // temporarily reuse helpers with bg context
  const g = c.createLinearGradient(0, 0, 0, GY); g.addColorStop(0, '#fbeeba'); g.addColorStop(1, '#f2d283');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  c.fillStyle = '#e9c66f'; c.fillRect(0, 560, W, 90); c.fillStyle = '#d6ac4f'; c.fillRect(0, 556, W, 6);
  // wall stripes
  c.fillStyle = '#ffffff14'; for (let x = 0; x < W; x += 80) c.fillRect(x, 0, 40, 556);
  const R = (x, y, w, h, r) => { c.beginPath(); c.roundRect ? c.roundRect(x, y, w, h, r) : c.rect(x, y, w, h); };
  // floor
  const f = c.createLinearGradient(0, GY, 0, H); f.addColorStop(0, '#c58a4f'); f.addColorStop(1, '#8f5d31');
  c.fillStyle = f; c.fillRect(0, GY, W, H - GY);
  c.strokeStyle = '#6b431f55'; c.lineWidth = 2;
  for (let y = GY + 20; y < H; y += 24) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
  for (let y = GY, r = 0; y < H; y += 24, r++) for (let x = (r % 2) * 90; x < W; x += 180) { c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 24); c.stroke(); }
  c.fillStyle = '#5b3a1c'; c.fillRect(0, GY - 4, W, 6);
  // chalkboard
  c.fillStyle = '#8a5a30'; R(372, 62, 536, 178, 10); c.fill();
  c.fillStyle = '#b5833e'; R(372, 62, 536, 6, 3); c.fill();
  c.fillStyle = '#2f5d50'; R(384, 74, 512, 154, 6); c.fill();
  c.fillStyle = '#ffffff10'; c.beginPath(); c.ellipse(560, 150, 120, 30, -0.3, 0, TAU); c.fill(); c.ellipse(760, 190, 90, 20, 0.2, 0, TAU); c.fill();
  c.fillStyle = '#ecf5ee'; c.font = font(34); c.textAlign = 'left';
  c.fillText('TODAY: PAY ATTENTION!', 410, 120);
  c.font = font(28, 'normal'); c.fillText('2 + 2 = ?     E = mc²', 410, 165);
  c.strokeStyle = '#ecf5ee'; c.lineWidth = 3; c.lineCap = 'round';
  c.beginPath(); c.moveTo(410, 130); for (let x = 410; x < 800; x += 12) c.lineTo(x, 130 + (x / 12 % 2 ? 2 : -1)); c.stroke();
  c.beginPath(); c.arc(820, 175, 20, 0, TAU); c.moveTo(820, 155); c.lineTo(826, 146); c.stroke();
  c.fillStyle = '#ffd6d6'; R(860 - 20, 196, 26, 10, 3); c.fill(); c.fillStyle = '#fff'; R(430, 216, 30, 6, 3); c.fill();
  // clock
  c.fillStyle = '#fff'; c.beginPath(); c.arc(640, 34, 24, 0, TAU); c.fill(); c.strokeStyle = '#c4381c'; c.lineWidth = 5; c.stroke();
  c.strokeStyle = '#222'; c.lineWidth = 3; c.beginPath(); c.moveTo(640, 34); c.lineTo(640, 18); c.moveTo(640, 34); c.lineTo(652, 40); c.stroke();
  // windows
  for (const wx of [960, 1100]) {
    const sg = c.createLinearGradient(0, 70, 0, 250); sg.addColorStop(0, '#62c3ff'); sg.addColorStop(1, '#c9ecff');
    c.fillStyle = '#fff'; R(wx - 8, 62, 136, 198, 6); c.fill();
    c.fillStyle = sg; c.fillRect(wx, 70, 120, 182);
    c.fillStyle = '#fff'; c.beginPath(); c.arc(wx + 35, 130, 18, 0, TAU); c.arc(wx + 58, 122, 24, 0, TAU); c.arc(wx + 82, 132, 16, 0, TAU); c.fill();
    c.fillStyle = '#5ebf4a'; c.fillRect(wx, 230, 120, 22);
    c.fillStyle = '#fff'; c.fillRect(wx + 56, 70, 8, 182); c.fillRect(wx, 156, 120, 8);
  }
  c.fillStyle = '#ffe14d'; c.beginPath(); c.arc(1150, 100, 20, 0, TAU); c.fill();
  // posters
  const poster = (x, y, w, h, col, draw) => { c.save(); c.translate(x + w / 2, y + h / 2); c.rotate((x % 7 - 3) * 0.01); c.translate(-w / 2, -h / 2); c.fillStyle = '#0003'; R(3, 4, w, h, 4); c.fill(); c.fillStyle = col; R(0, 0, w, h, 4); c.fill(); draw(w, h); c.restore(); };
  poster(40, 90, 100, 130, '#fff', (w, h) => { c.fillStyle = '#e0453a'; c.font = font(38); c.textAlign = 'center'; c.fillText('A', 25, 48); c.fillStyle = '#3c8be0'; c.fillText('B', 50, 70); c.fillStyle = '#3fae4a'; c.fillText('C', 76, 48); c.fillStyle = '#333'; c.font = font(14); c.fillText('LEARN!', w / 2, 112); });
  poster(190, 100, 120, 100, '#cfe9ff', (w, h) => { for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) { c.fillStyle = BOOKCOL[(i + j) % 6]; c.fillRect(8 + i * 21, 10 + j * 18, 18, 15); } c.fillStyle = '#333'; c.font = font(11); c.textAlign = 'center'; c.fillText('SCIENCE ROCKS', w / 2, 92); });
  poster(1010 + 0, 280, 110, 90, '#ffd9f0', (w, h) => { c.fillStyle = '#c4381c'; c.font = font(16); c.textAlign = 'center'; c.fillText('KEEP CALM', w / 2, 32); c.fillText('& STUDY', w / 2, 54); c.fillText('♥', w / 2, 78); });
  poster(1150, 290, 90, 110, '#e7ffd9', (w, h) => { c.fillStyle = '#2b7a2b'; c.font = font(22); c.textAlign = 'center'; c.fillText('READ', w / 2, 40); c.fillText('MORE!', w / 2, 66); c.font = font(30); c.fillText('📚', w / 2, 100); });
  poster(320, 290, 100, 70, '#fff3c4', (w, h) => { c.fillStyle = '#8c53c9'; c.font = font(18); c.textAlign = 'center'; c.fillText('NO RUNNING', w / 2, 30); c.fillText('IN CLASS', w / 2, 52); });
})();

// ---- teacher ----
function drawTeacher(x, y) {
  const s = shout > 0, sh = s ? Math.sin(T * 60) * 1.5 : 0;
  ctx.save(); ctx.translate(x + sh, y);
  // legs + shoes
  ctx.fillStyle = '#4a4a66'; ctx.fillRect(-26, -62, 20, 62); ctx.fillRect(6, -62, 20, 62);
  ctx.fillStyle = '#222'; rr(-32, -10, 30, 12, 5); ctx.fill(); rr(4, -10, 30, 12, 5); ctx.fill();
  // body
  ctx.fillStyle = '#8a5a3c'; rr(-40, -160, 80, 105, 22); ctx.fill();
  ctx.strokeStyle = '#6d4329'; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(-14, -160); ctx.lineTo(14, -160); ctx.lineTo(0, -130); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#d8342a'; ctx.beginPath(); ctx.moveTo(-5, -150); ctx.lineTo(5, -150); ctx.lineTo(9, -100); ctx.lineTo(0, -90); ctx.lineTo(-9, -100); ctx.closePath(); ctx.fill();
  // head
  const hy = -200;
  ctx.fillStyle = '#6b6b7a'; circ(-2, hy - 38, 20); ctx.fill(); // bun
  ctx.fillStyle = s ? '#ff6a4d' : '#f2a07a'; circ(0, hy, 44); ctx.fill(); ctx.strokeStyle = '#8f3a22'; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = '#7d7d8c'; ctx.beginPath(); ctx.arc(0, hy, 45, Math.PI * 1.05, Math.PI * 1.95); ctx.quadraticCurveTo(0, hy - 18, -44, hy - 10); ctx.fill();
  // glasses
  ctx.strokeStyle = '#222'; ctx.lineWidth = 3; ctx.fillStyle = '#fff9'; circ(-17, hy + 2, 14); ctx.fill(); ctx.stroke(); circ(17, hy + 2, 14); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-3, hy + 2); ctx.lineTo(3, hy + 2); ctx.stroke();
  // eyes + angry brows
  ctx.fillStyle = '#111'; circ(-15, hy + 4, 4); ctx.fill(); circ(19, hy + 4, 4); ctx.fill();
  ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.strokeStyle = '#3a2a1a';
  ctx.beginPath(); ctx.moveTo(-32, hy - 18); ctx.lineTo(-6, hy - 6); ctx.moveTo(32, hy - 18); ctx.lineTo(6, hy - 6); ctx.stroke();
  // mouth
  if (s) { ctx.fillStyle = '#5a0f0f'; ctx.beginPath(); ctx.ellipse(0, hy + 28, 17, 11 + Math.abs(Math.sin(T * 25)) * 5, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillRect(-12, hy + 19, 24, 5); }
  else { ctx.strokeStyle = '#5a0f0f'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-14, hy + 28); ctx.lineTo(14, hy + 28); ctx.stroke(); ctx.lineWidth = 2; for (let i = -10; i <= 10; i += 5) { ctx.beginPath(); ctx.moveTo(i, hy + 24); ctx.lineTo(i, hy + 32); ctx.stroke(); } }
  // steam
  for (let i = 0; i < 3; i++) for (const sd of [-1, 1]) {
    const k = (T * 0.9 + i / 3) % 1; ctx.fillStyle = `rgba(255,255,255,${0.7 * (1 - k)})`;
    circ(sd * (48 + k * 18), hy - 4 - k * 40, 5 + k * 9); ctx.fill();
  }
  ctx.restore();
  // arm to sling
  ctx.save(); ctx.lineCap = 'round';
  const sx = x + 30, sy = y - 150;
  let hx, hy2;
  if (aim.on) { hx = aim.x; hy2 = aim.y; } else { hx = x + 70; hy2 = y - 170 + (armT > 0 ? -25 : 0); }
  const dx = hx - sx, dy = hy2 - sy, d = Math.hypot(dx, dy), L1 = 70;
  const k = Math.min(1, d / 130);
  ctx.strokeStyle = '#6d4329'; ctx.lineWidth = 22;
  ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + dx * 0.5 + dy * 0.1 * (1 - k), sy + dy * 0.5 + 12); ctx.lineTo(hx, hy2); ctx.stroke();
  ctx.fillStyle = '#f2a07a'; circ(hx, hy2, 13); ctx.fill(); ctx.strokeStyle = '#8f3a22'; ctx.lineWidth = 2; ctx.stroke();
  ctx.restore();
}

// ---- slingshot ----
function drawSlingBack() {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = '#3b2412'; ctx.lineWidth = 22; // back fork
  ctx.beginPath(); ctx.moveTo(250, 520); ctx.lineTo(236, 570); ctx.stroke();
  ctx.strokeStyle = '#7a4a26'; ctx.lineWidth = 16; ctx.beginPath(); ctx.moveTo(250, 520); ctx.lineTo(236, 570); ctx.stroke();
  const px = aim.on ? aim.x : REST.x - 4, py = aim.on ? aim.y : REST.y + 2;
  ctx.strokeStyle = '#2b1a10'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(252, 522); ctx.lineTo(px, py); ctx.stroke();
}
function drawSlingFront() {
  const px = aim.on ? aim.x : REST.x - 4, py = aim.on ? aim.y : REST.y + 2;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = '#3b2412'; ctx.lineWidth = 26; ctx.beginPath(); ctx.moveTo(236, 650); ctx.lineTo(234, 570); ctx.lineTo(212, 518); ctx.stroke();
  ctx.strokeStyle = '#a06234'; ctx.lineWidth = 20; ctx.beginPath(); ctx.moveTo(236, 650); ctx.lineTo(234, 570); ctx.lineTo(212, 518); ctx.stroke();
  ctx.strokeStyle = '#c98a4b'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(231, 640); ctx.lineTo(229, 572); ctx.lineTo(208, 522); ctx.stroke();
  ctx.strokeStyle = '#2b1a10'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(210, 521); ctx.lineTo(px, py); ctx.stroke();
}

// ---- projectile art (centered, pointing +x) ----
function drawProjArt(type, w, h) {
  ctx.lineJoin = 'round'; ctx.lineWidth = 2.5; ctx.strokeStyle = '#2a1a0a';
  switch (type) {
    case 'textbook':
      ctx.fillStyle = '#d8453b'; rr(-w / 2, -h / 2, w, h, 4); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff7dc'; ctx.fillRect(-w / 2 + 5, h / 2 - 7, w - 8, 5);
      ctx.fillStyle = '#a82a22'; ctx.fillRect(-w / 2, -h / 2, 7, h - 2);
      ctx.fillStyle = '#ffd21f'; ctx.fillRect(-w / 2 + 12, -h / 2 + 5, w - 20, 4); ctx.fillRect(-w / 2 + 12, -h / 2 + 12, w - 28, 3);
      break;
    case 'pencil':
      ctx.fillStyle = '#ffd21f'; ctx.fillRect(-w / 2 + 8, -h / 2, w - 24, h); ctx.strokeRect(-w / 2 + 8, -h / 2, w - 24, h);
      ctx.fillStyle = '#f29aa8'; rr(-w / 2, -h / 2, 10, h, 3); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#b8bcc6'; ctx.fillRect(-w / 2 + 9, -h / 2, 5, h);
      ctx.fillStyle = '#f2c48a'; ctx.beginPath(); ctx.moveTo(w / 2 - 16, -h / 2); ctx.lineTo(w / 2, 0); ctx.lineTo(w / 2 - 16, h / 2); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#333'; ctx.beginPath(); ctx.moveTo(w / 2 - 5, -1.8); ctx.lineTo(w / 2, 0); ctx.lineTo(w / 2 - 5, 1.8); ctx.fill();
      break;
    case 'eraser':
      ctx.fillStyle = '#ff9bb3'; rr(-w / 2, -h / 2, w, h, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#3c8be0'; ctx.fillRect(-w / 2 + 9, -h / 2 + 1, 14, h - 2);
      ctx.fillStyle = '#fff'; ctx.font = font(9); ctx.textAlign = 'center'; ctx.fillText('★', -w / 2 + 16, 4);
      break;
    case 'chalk':
      ctx.fillStyle = '#f7f7f0'; rr(-w / 2, -h / 2, w, h, 3); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffd6e8'; ctx.fillRect(-w / 2 + 2, -h / 2 + 1, w * 0.3, h - 2);
      break;
    case 'dictionary':
      ctx.fillStyle = '#2e4f9c'; rr(-w / 2, -h / 2, w, h, 5); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff7dc'; ctx.fillRect(-w / 2 + 6, h / 2 - 8, w - 9, 6);
      ctx.fillStyle = '#1e3572'; ctx.fillRect(-w / 2, -h / 2, 9, h);
      ctx.fillStyle = '#ffd21f'; rr(-w / 2 + 14, -h / 2 + 7, w - 24, 14, 3); ctx.fill();
      ctx.fillStyle = '#2e4f9c'; ctx.font = font(11, '900'); ctx.textAlign = 'center'; ctx.fillText('DICT', -w / 2 + 14 + (w - 24) / 2, -h / 2 + 18);
      break;
  }
}
function drawProjAt(type, x, y, ang, sc = 1) {
  const c = PT[type]; ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.scale(sc, sc); drawProjArt(type, c.w, c.h); ctx.restore();
}

// ---- blocks ----
function drawBlock(b) {
  const t = b.tt, w = t.w, h = t.h;
  ctx.save(); ctx.translate(b.position.x, b.position.y); ctx.rotate(b.angle);
  if (t.hurt > 0) ctx.translate(Math.sin(T * 80) * 1.5, 0);
  ctx.lineWidth = 2.5; ctx.strokeStyle = '#2a1a0a'; ctx.lineJoin = 'round';
  switch (t.mat) {
    case 'wood':
      ctx.fillStyle = '#c98a4b'; rr(-w / 2, -h / 2, w, h, 3); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#a86f3688'; ctx.lineWidth = 1.5;
      if (w > h) for (let i = -h / 4; i <= h / 4; i += h / 3) { ctx.beginPath(); ctx.moveTo(-w / 2 + 4, i); ctx.lineTo(w / 2 - 4, i); ctx.stroke(); }
      else for (let i = -w / 4; i <= w / 4; i += w / 3) { ctx.beginPath(); ctx.moveTo(i, -h / 2 + 3); ctx.lineTo(i, h / 2 - 3); ctx.stroke(); }
      break;
    case 'book':
      ctx.fillStyle = t.col; rr(-w / 2, -h / 2, w, h, 3); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff7dc'; ctx.fillRect(-w / 2 + 6, -h / 2 + h * 0.62, w - 8, h * 0.28);
      ctx.fillStyle = '#0003'; ctx.fillRect(-w / 2, -h / 2, 6, h);
      ctx.fillStyle = '#ffd21f'; ctx.fillRect(-w / 2 + 12, -h / 2 + 3, w * 0.3, 3);
      break;
    case 'metal':
      ctx.fillStyle = '#6f93b8'; rr(-w / 2, -h / 2, w, h, 4); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#8fb2d4'; ctx.fillRect(-w / 2 + 4, -h / 2 + 4, 6, h - 8);
      ctx.strokeStyle = '#2a3a4f'; ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-w / 2 + 12, -h / 2 + 10 + i * 6); ctx.lineTo(w / 2 - 8, -h / 2 + 10 + i * 6); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(-w / 2, h * 0.1); ctx.lineTo(w / 2, h * 0.1); ctx.stroke();
      ctx.fillStyle = '#ffd21f'; circ(w / 2 - 10, h * 0.2, 3); ctx.fill();
      break;
    case 'shelf':
      ctx.fillStyle = '#8a5a30'; rr(-w / 2, -h / 2, w, h, 4); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#4a2f18'; ctx.fillRect(-w / 2 + 5, -h / 2 + 5, w - 10, h - 10);
      for (let r = 0; r < Math.floor(h / 38); r++) {
        const y0 = -h / 2 + 5 + r * 38, yb = y0 + 34;
        ctx.fillStyle = '#8a5a30'; ctx.fillRect(-w / 2 + 5, yb, w - 10, 4);
        let x = -w / 2 + 7;
        for (let i = 0; x < w / 2 - 12; i++) { const bw = 6 + ((t.seed * 7 + r * 5 + i * 3) % 5), bh = 22 + ((i * 11 + r * 3) % 10); ctx.fillStyle = BOOKCOL[(i + r + t.seed) % 6]; ctx.fillRect(x, yb - bh, bw, bh); x += bw + 1; }
      }
      break;
    case 'board':
      ctx.fillStyle = '#fff'; rr(-w / 2, -h / 2, w, h, 3); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#9aa'; ctx.fillRect(-w / 2, -h / 2, w, 4); ctx.fillRect(-w / 2, h / 2 - 5, w, 5);
      ctx.strokeStyle = '#3c8be0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-3, -h / 2 + 14); ctx.lineTo(3, -h / 2 + 24); ctx.lineTo(-3, -h / 2 + 34); ctx.lineTo(3, -h / 2 + 44); ctx.stroke();
      ctx.strokeStyle = '#e0453a'; ctx.beginPath(); ctx.moveTo(-3, -h / 2 + 58); ctx.lineTo(3, -h / 2 + 62); ctx.stroke();
      break;
  }
  const f = t.hp / t.max;
  if (f < 0.65) {
    ctx.strokeStyle = '#000a'; ctx.lineWidth = 2; ctx.beginPath();
    const n = f < 0.35 ? 3 : 1;
    for (let i = 0; i < n; i++) { const cx = (i - (n - 1) / 2) * w * 0.3, cy = (i % 2 ? 0.2 : -0.2) * h; ctx.moveTo(cx, cy - h * 0.35); ctx.lineTo(cx + 4, cy - h * 0.1); ctx.lineTo(cx - 3, cy + h * 0.1); ctx.lineTo(cx + 3, cy + h * 0.35); }
    ctx.stroke();
  }
  ctx.restore();
}

// ---- students ----
function drawStudent(st) {
  const hp = st.head.position, r = st.cfg.r, ang = st.body.angle, smart = st.smart, boss = st.type === 'boss';
  if (st.pack) {
    const p = st.pack.position;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(ang);
    ctx.fillStyle = st.packFlash > 0 ? '#fff' : '#e0453a'; ctx.strokeStyle = '#2a1a0a'; ctx.lineWidth = 2.5;
    rr(-7, -19, 14, 38, 6); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#a82a22'; rr(-5, 2, 10, 12, 3); ctx.fill();
    ctx.fillStyle = '#ffd21f'; ctx.fillRect(-7, -8, 14, 3);
    const f = st.shield / st.cfg.shield;
    if (f < 0.5) { ctx.strokeStyle = '#000a'; ctx.beginPath(); ctx.moveTo(-6, -14); ctx.lineTo(2, -6); ctx.lineTo(-4, 2); ctx.stroke(); }
    ctx.restore();
  }
  ctx.save(); ctx.translate(hp.x, hp.y); ctx.rotate(ang);
  const wob = st.flash > 0 ? Math.sin(T * 50) * 2 : 0; ctx.translate(wob, 0);
  ctx.lineWidth = 2.5; ctx.strokeStyle = '#2a1a0a';
  // head
  ctx.fillStyle = st.skin; circ(0, 0, r); ctx.fill();
  ctx.save(); circ(0, 0, r); ctx.clip();
  ctx.fillStyle = st.shirt; ctx.fillRect(-r, r * 0.55, r * 2, r);
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(-r * .3, r * .55); ctx.lineTo(r * .3, r * .55); ctx.lineTo(0, r * .8); ctx.fill();
  // hair
  if (st.type === 'clown') {
    const cs = ['#ff5a5a', '#ffb627', '#5ad16e', '#4aa3ff'];
    for (let i = 0; i < 7; i++) { ctx.fillStyle = cs[i % 4]; circ(-r + i * r / 3, -r * 0.72 + (i % 2) * 4, r * 0.4); ctx.fill(); }
  } else {
    ctx.fillStyle = st.hair; ctx.beginPath(); ctx.moveTo(-r, -r * 0.1);
    for (let i = 0; i <= 6; i++) ctx.lineTo(-r + i * r / 3, -r * 0.45 + (i % 2) * r * 0.22);
    ctx.lineTo(r, -r); ctx.lineTo(-r, -r); ctx.fill();
  }
  ctx.restore();
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
  // boss spikes / cap
  if (boss && !smart) {
    ctx.fillStyle = '#d8342a'; ctx.beginPath(); ctx.arc(0, -r * 0.35, r * 0.95, Math.PI * 1.02, Math.PI * 1.98); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#b22a20'; rr(r * 0.6, -r * 0.5, r * 0.75, r * 0.2, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = font(r * 0.45, '900'); ctx.textAlign = 'center'; ctx.fillText('HW?', -r * 0.05, -r * 0.55);
  }
  // face
  const ey = -r * 0.05, ex = r * 0.38;
  const hit = st.flash > 0;
  if (hit) {
    ctx.strokeStyle = '#222'; ctx.lineWidth = 3; ctx.beginPath();
    for (const sx of [-1, 1]) { ctx.moveTo(sx * ex - 5, ey - 5); ctx.lineTo(sx * ex + 5, ey + 5); ctx.moveTo(sx * ex + 5, ey - 5); ctx.lineTo(sx * ex - 5, ey + 5); }
    ctx.stroke(); ctx.fillStyle = '#7a1f1f'; ctx.beginPath(); ctx.ellipse(0, r * 0.4, r * 0.18, r * 0.22, 0, 0, TAU); ctx.fill();
  } else if (smart) {
    for (const sx of [-1, 1]) { ctx.fillStyle = '#fff'; circ(sx * ex, ey, r * 0.22); ctx.fill(); ctx.fillStyle = '#222'; circ(sx * ex, ey - 1, r * 0.11); ctx.fill(); ctx.fillStyle = '#fff'; circ(sx * ex + 1.5, ey - 3, 1.8); ctx.fill(); }
    ctx.strokeStyle = '#222'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(0, r * 0.22, r * 0.36, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    ctx.lineWidth = 2.5; ctx.fillStyle = '#9fd8ff55';
    for (const sx of [-1, 1]) { circ(sx * ex, ey, r * 0.34); ctx.fill(); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(-ex + r * 0.34, ey); ctx.lineTo(ex - r * 0.34, ey); ctx.stroke();
    // grad cap
    ctx.fillStyle = '#222'; rr(-r * 0.6, -r * 0.92, r * 1.2, r * 0.38, 4); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-r * 1.1, -r * 0.9); ctx.lineTo(0, -r * 1.22); ctx.lineTo(r * 1.1, -r * 0.9); ctx.lineTo(0, -r * 0.62); ctx.closePath(); ctx.fillStyle = '#2b2b2b'; ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#ffd21f'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(r * 0.9, -r * 0.9); ctx.lineTo(r * 1.05, -r * 0.5); ctx.stroke(); ctx.fillStyle = '#ffd21f'; circ(r * 1.05, -r * 0.45, 3); ctx.fill();
  } else {
    const z = st.type === 'zombie';
    for (const sx of [-1, 1]) {
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#222'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(sx * ex, ey, r * 0.23, r * 0.2, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#222'; circ(sx * ex + (z ? 0 : Math.sin(T + st.t0) * 2), ey + (z ? 2 : 3), r * 0.09); ctx.fill();
      if (!z) { ctx.fillStyle = st.skin; ctx.fillRect(sx * ex - r * 0.26, ey - r * 0.22, r * 0.52, r * 0.22); ctx.fillStyle = '#222'; ctx.fillRect(sx * ex - r * 0.26, ey - 1, r * 0.52, 2.5); }
      else { ctx.strokeStyle = '#6a4a8a88'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx * ex, ey + 5, r * 0.22, 0.2, Math.PI - 0.2); ctx.stroke(); }
    }
    if (st.type === 'clown') {
      ctx.fillStyle = '#e0302a'; circ(0, r * 0.1, r * 0.17); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#222'; ctx.lineWidth = 2.5; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, r * 0.2, r * 0.45, 0.1 * Math.PI, 0.9 * Math.PI); ctx.fill(); ctx.stroke();
    } else if (boss) {
      ctx.strokeStyle = '#222'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-r * 0.5, r * 0.25); ctx.quadraticCurveTo(0, r * 0.6, r * 0.5, r * 0.15); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-ex - 8, ey - 12); ctx.lineTo(-ex + 8, ey - 7); ctx.moveTo(ex + 8, ey - 12); ctx.lineTo(ex - 8, ey - 7); ctx.stroke();
    } else if (z) {
      ctx.fillStyle = '#222'; ctx.beginPath(); ctx.ellipse(0, r * 0.45, r * 0.14, r * 0.1, 0, 0, TAU); ctx.fill();
      // phone
      ctx.fillStyle = '#111'; rr(-8, r * 0.55, 16, 22, 3); ctx.fill();
      ctx.fillStyle = `hsl(200,90%,${60 + Math.sin(T * 6 + st.t0) * 10}%)`; ctx.fillRect(-6, r * 0.55 + 3, 12, 15);
      ctx.fillStyle = st.skin; circ(-11, r * 0.75, 4.5); ctx.fill(); circ(11, r * 0.75, 4.5); ctx.fill();
    } else {
      ctx.fillStyle = '#7a1f1f'; ctx.beginPath(); ctx.ellipse(-2, r * 0.42, r * 0.17, r * 0.14, 0, 0, TAU); ctx.fill();
      const dl = 6 + (Math.sin(T * 2 + st.t0) + 1) * 5; ctx.strokeStyle = '#8fd3ff'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-r * 0.12, r * 0.5); ctx.lineTo(-r * 0.12, r * 0.5 + dl); ctx.stroke(); ctx.fillStyle = '#8fd3ff'; circ(-r * 0.12, r * 0.5 + dl + 2, 3); ctx.fill();
    }
  }
  ctx.restore();
  // overlays in world space
  if (smart) {
    const k = st.bulb, by = hp.y - r - 34 - Math.sin(T * 4 + st.t0) * 3;
    ctx.save(); ctx.translate(hp.x, by); ctx.scale(k, k);
    const gl = ctx.createRadialGradient(0, 0, 2, 0, 0, 34); gl.addColorStop(0, '#fff6a8cc'); gl.addColorStop(1, '#fff6a800');
    ctx.fillStyle = gl; circ(0, 0, 34); ctx.fill();
    ctx.strokeStyle = '#ffd21f'; ctx.lineWidth = 2.5;
    for (let i = 0; i < 8; i++) { const a = i * TAU / 8 + T; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 15, Math.sin(a) * 15); ctx.lineTo(Math.cos(a) * 21, Math.sin(a) * 21); ctx.stroke(); }
    ctx.fillStyle = '#fff27a'; ctx.strokeStyle = '#2a1a0a'; ctx.lineWidth = 2.5; circ(0, 0, 10); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#9aa'; ctx.fillRect(-5, 9, 10, 6); ctx.strokeRect(-5, 9, 10, 6);
    ctx.restore();
  } else {
    if (st.type === 'slacker' || st.type === 'boss' && false) {
      const k = (T * 0.6 + st.t0) % 1; ctx.fillStyle = `rgba(40,60,120,${1 - k})`; ctx.font = font(18 + k * 6, '900'); ctx.textAlign = 'center'; ctx.fillText('z', hp.x + 18 + k * 14, hp.y - r - 4 - k * 26);
    }
    if (st.max > 1) {
      for (let i = 0; i < st.max; i++) { ctx.fillStyle = i < st.hp ? '#ff4d6d' : '#0004'; ctx.strokeStyle = '#2a1a0a'; ctx.lineWidth = 1.5; circ(hp.x + (i - (st.max - 1) / 2) * 13, hp.y - r - 12, 5); ctx.fill(); ctx.stroke(); }
    }
    if (st.flash > 0) {
      for (let i = 0; i < 3; i++) { const a = T * 6 + i * TAU / 3; ctx.fillStyle = '#ffd21f'; ctx.font = font(18, '900'); ctx.textAlign = 'center'; ctx.fillText('★', hp.x + Math.cos(a) * 30, hp.y - r * 0.9 + Math.sin(a) * 9); }
    }
  }
}

function drawParts() {
  for (const p of parts) {
    const a = Math.max(0, Math.min(1, p.life / p.max));
    ctx.globalAlpha = (p.a || 1) * a;
    if (p.shape === 'ring') { ctx.strokeStyle = p.col; ctx.lineWidth = 6 * a; circ(p.x, p.y, p.size * (1 - a) + 6); ctx.stroke(); }
    else if (p.shape === 'circle') { ctx.fillStyle = p.col; circ(p.x, p.y, p.size * (p.a ? 0.6 + a * 0.6 : 1)); ctx.fill(); }
    else { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.col; ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); ctx.restore(); }
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center';
  for (const t of texts) {
    ctx.globalAlpha = Math.min(1, t.t * 2); ctx.font = font(28, '900'); ctx.lineWidth = 6; ctx.strokeStyle = '#2a1a0a'; ctx.strokeText(t.text, t.x, t.y); ctx.fillStyle = t.col; ctx.fillText(t.text, t.x, t.y);
  }
  ctx.globalAlpha = 1;
}

function drawBubble(x, y) {
  if (bubble.t <= 0) return;
  ctx.save(); ctx.globalAlpha = Math.min(1, bubble.t * 3);
  ctx.font = font(26, '900'); const w = ctx.measureText(bubble.text).width + 40, h = 54, bx = Math.max(10, x - 20), by = y - h;
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#2a1a0a'; ctx.lineWidth = 4; rr(bx, by, w, h, 18); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(bx + 30, by + h - 2); ctx.lineTo(bx + 20, by + h + 24); ctx.lineTo(bx + 54, by + h - 2); ctx.fillStyle = '#fff'; ctx.fill();
  ctx.beginPath(); ctx.moveTo(bx + 30, by + h); ctx.lineTo(bx + 20, by + h + 24); ctx.lineTo(bx + 54, by + h); ctx.stroke();
  ctx.fillStyle = '#c4381c'; ctx.textAlign = 'left'; ctx.fillText(bubble.text, bx + 20, by + 37);
  ctx.restore();
}

function panel(x, y, w, h) { ctx.fillStyle = '#10251fcc'; ctx.strokeStyle = '#ffe14d'; ctx.lineWidth = 3; rr(x, y, w, h, 12); ctx.fill(); ctx.stroke(); }
function drawHUD() {
  panel(14, 12, 250, 50);
  ctx.textAlign = 'left'; ctx.fillStyle = '#ffe14d'; ctx.font = font(14, '900'); ctx.fillText('SCORE', 28, 32);
  ctx.fillStyle = '#fff'; ctx.font = font(26, '900'); ctx.fillText(score.toLocaleString(), 28, 55);
  const sm = students.filter(s => s.smart).length;
  ctx.textAlign = 'right'; ctx.fillStyle = '#ffe14d'; ctx.font = font(14, '900'); ctx.fillText('SMART', 252, 32);
  ctx.fillStyle = '#fff'; ctx.font = font(26, '900'); ctx.fillText(`${sm}/${students.length}`, 252, 55);
  // ammo
  const n = ammo.length; panel(14, 70, 18 + n * 44, 52);
  for (let i = 0; i < n; i++) {
    const used = i < fired, cur = i === fired;
    ctx.globalAlpha = used ? 0.25 : 1;
    const c = PT[ammo[i]], sc = Math.min(1, 34 / Math.max(c.w, c.h));
    drawProjAt(ammo[i], 40 + i * 44, 96, cur ? Math.sin(T * 5) * 0.2 : 0, sc * (cur ? 1.1 : 0.9));
    ctx.globalAlpha = 1;
  }
  if (introT > 0 && L) {
    ctx.save(); ctx.globalAlpha = Math.min(1, introT * 1.5, (3.2 - introT) * 4);
    ctx.textAlign = 'center'; ctx.font = font(40, '900'); ctx.lineWidth = 8; ctx.strokeStyle = '#2a1a0a'; ctx.fillStyle = '#ffe14d';
    ctx.strokeText(`${li + 1}. ${L.name}`, W / 2, 300); ctx.fillText(`${li + 1}. ${L.name}`, W / 2, 300);
    ctx.font = font(24, '900'); ctx.lineWidth = 6; ctx.strokeText(L.hint, W / 2, 340); ctx.fillStyle = '#fff'; ctx.fillText(L.hint, W / 2, 340);
    ctx.restore();
  }
  if (flying.length && flying.some(b => !b.pj.used)) {
    const b = flying.find(b => !b.pj.used), k = 1 + Math.sin(T * 10) * 0.06;
    ctx.save(); ctx.translate(W / 2, 690); ctx.scale(k, k); ctx.textAlign = 'center'; ctx.font = font(28, '900'); ctx.lineWidth = 7; ctx.strokeStyle = '#2a1a0a'; ctx.fillStyle = '#fff';
    const s = `TAP for ${PT[b.pj.type].ab}`; ctx.strokeText(s, 0, 0); ctx.fillText(s, 0, 0); ctx.restore();
  }
}

function drawAimPreview() {
  if (!aim.on) return;
  const vx = REST.x - aim.x, vy = REST.y - aim.y, len = Math.hypot(vx, vy);
  const type = ammo[fired], c = PT[type], sp = Math.min(len / MAXPULL, 1) * VMAX * c.speed, a = Math.atan2(vy, vx);
  let x = aim.x, y = aim.y, dx = Math.cos(a) * sp, dy = Math.sin(a) * sp;
  for (let i = 0; i < 90; i++) {
    x += dx; y += dy; dy += GRAV;
    if (i % 3 === 2 && i < 66) { ctx.globalAlpha = 1 - i / 75; ctx.fillStyle = '#fff'; ctx.strokeStyle = '#2a1a0a'; ctx.lineWidth = 2; circ(x, y, 4.5 - i * 0.025); ctx.fill(); ctx.stroke(); }
    if (y > GY) break;
  }
  ctx.globalAlpha = 1;
}

let camX = 0;
function render() {
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.save();
  if (shake > 0.5) ctx.translate(rnd(-shake, shake) * 0.5, rnd(-shake, shake) * 0.5);
  ctx.drawImage(bg, 0, 0);
  drawTeacher(110, GY);
  if (mode === 'play' || mode === 'result') {
    drawSlingBack();
    // pouch projectile
    if (aim.on) { const a = Math.atan2(REST.y - aim.y, REST.x - aim.x); drawProjAt(ammo[fired], aim.x, aim.y, a); }
    else if (canAim()) drawProjAt(ammo[fired], REST.x - 4, REST.y + 2, -0.3);
    drawSlingFront();
    for (const b of Composite.allBodies(engine.world)) if (b.tt) drawBlock(b);
    for (const s of students) drawStudent(s);
    for (const b of flying) {
      const pj = b.pj;
      if (pj.piercing > 0) { ctx.fillStyle = '#fff6'; circ(b.position.x, b.position.y, 22); ctx.fill(); }
      drawProjAt(pj.type, b.position.x, b.position.y, b.angle, 1);
    }
    drawAimPreview();
    drawParts();
    drawBubble(120, 330);
    ctx.restore();
    drawHUD();
  } else {
    drawSlingBack(); drawSlingFront();
    drawBubble(120, 330);
    drawParts();
    ctx.restore();
  }
}

let acc = 0, last = performance.now();
function frame(now) {
  acc += Math.min(100, now - last); last = now;
  let n = 0;
  while (acc >= 1000 / 60 && n < 4) { tick(); acc -= 1000 / 60; n++; }
  if (n === 4) acc = 0;
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// small hook for automated testing
window.__AT = { startLevel, tick, get state() { return { students, flying, ammo, fired, score, over, mode, engine }; }, aimAndFire(dx, dy) { aim.x = REST.x + dx; aim.y = REST.y + dy; aim.on = true; launch(); }, activate, LEVELS };
})();
