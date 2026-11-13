import * as THREE from 'three';
import '@fontsource/bangers/400.css';
import '@fontsource/comic-neue/700.css';
import './style.css';
import { Sfx } from './audio.js';
import { ui, $ } from './ui.js';
import { L, CALLS, MECHANIC, BURSTS, pick, verdict } from './lines.js';
import { World, roadPoint, roadYaw, dh, curvature, fieldLift, ROAD_HALF } from './world.js';
import { textTexture, makeCottage } from './models.js';
import { makeCar, makeSheep, makeCow, makeTractor, makeHay, makePothole, makeCowpat, makeVan, makeMechanic, makeCloud, makeSky, makePuff } from './models.js';

try {
  await Promise.race([Promise.all([document.fonts.load('48px Bangers'), document.fonts.load('700 16px "Comic Neue"')]), new Promise((r) => setTimeout(r, 1500))]);
} catch {}

const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sign = (v) => (v < 0 ? -1 : 1);
const HP = Math.PI / 2;
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
document.body.classList.toggle('touch', isTouch);

// --- renderer ---------------------------------------------------------------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xdff2f8, 150, 480);
const camera = new THREE.PerspectiveCamera(70, 1, 0.15, 1500);
scene.add(new THREE.AmbientLight(0xffffff, 1.65));
const sun = new THREE.DirectionalLight(0xffffff, 1.55);
sun.position.set(-0.5, 1, 0.45);
scene.add(sun);

const sky = makeSky();
scene.add(sky);
const clouds = new THREE.Group();
for (let i = 0; i < 11; i++) {
  const c = makeCloud(i % 2), a = (i / 11) * Math.PI * 2 + rand(0.4), r = rand(320, 560);
  c.position.set(Math.sin(a) * r, rand(90, 190), Math.cos(a) * r);
  c.rotation.y = a + Math.PI;
  c.scale.setScalar(rand(1.6, 3.2));
  clouds.add(c);
}
scene.add(clouds);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // keep a decent horizontal view on portrait phones
  const hTarget = (78 * Math.PI) / 180;
  camera.fov = clamp((2 * Math.atan(Math.tan(hTarget / 2) / camera.aspect) * 180) / Math.PI, 62, 96);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// --- game objects -----------------------------------------------------------
const sfx = new Sfx();
const world = new World(scene);
const rig = makeCar();
scene.add(rig.group);
const van = makeVan();
van.visible = false;
scene.add(van);
const mech = makeMechanic();
mech.visible = false;
scene.add(mech);

const TRIP = 5000; // metres from here to home
const PAR = 420; // seconds; every second under this is worth points
const car = {};
const stats = {};
let state = 'title';
let camMode = localStorage.getItem('sj.cam') === 'fp' ? 'fp' : 'chase';
let time = 0, nextSpawn = 0, chatT = 6, firstWordAt = 0;
let obstacles = [];
const v = new THREE.Vector3(), v2 = new THREE.Vector3(), camPos = new THREE.Vector3();
let orbitA = 2.4, camSnap = true;

function resetGame() {
  Object.assign(car, { s: 0, l: -2.2, speed: 0, relYaw: 0, steer: 0, damage: 0, repairs: 3, skid: 0, by: 0, bvy: 0, shake: 0, invuln: 0, wallCd: 0, jolt: 0 });
  Object.assign(stats, { time: 0, shaves: 0, sheepHit: 0, unders: 0, rattles: 0, honks: 0 });
  for (const o of obstacles) scene.remove(o.root);
  obstacles = [];
  nextSpawn = 130;
  chatT = 5;
  firstWordAt = rand(900, 1500);
  van.visible = mech.visible = false;
  camSnap = true;
}
resetGame();
const difficulty = () => clamp(car.s / 4500, 0, 1);

// --- home: finish line, banner and the house itself ---------------------------
{
  const home = new THREE.Group();
  roadPoint(TRIP, 0, v);
  home.position.copy(v);
  home.rotation.set(Math.atan(dh(TRIP)), roadYaw(TRIP), 0, 'YXZ');
  const ink = new THREE.MeshBasicMaterial({ color: 0x16130f });
  const line = new THREE.Mesh(new THREE.BoxGeometry(10, 0.04, 1.2), new THREE.MeshBasicMaterial({ map: textTexture('▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚', { w: 1024, h: 128, bg: '#fffdf3', border: 0, font: 'sans-serif' }) }));
  line.position.y = 0.04;
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(13, 1.9), new THREE.MeshBasicMaterial({ map: textTexture('HOME SWEET HOME', { w: 1024, h: 150, border: 10 }) }));
  banner.position.set(0, 5.6, 0.08);
  const back = new THREE.Mesh(new THREE.BoxGeometry(13.2, 2.1, 0.12), ink);
  back.position.set(0, 5.6, 0);
  home.add(line, banner, back);
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 7, 0.3), ink);
    post.position.set(sx * 6.6, 3.2, 0);
    home.add(post);
  }
  const house = makeCottage(0);
  house.scale.setScalar(1.3);
  house.position.set(17, fieldLift(TRIP + 14, 17), -14);
  house.rotation.y = -HP;
  home.add(house);
  scene.add(home);
}

// --- input ------------------------------------------------------------------
const keys = new Set();
const touch = { l: false, r: false, brake: false };
window.addEventListener('keydown', (e) => {
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code);
  if (e.code === 'Space' || e.code === 'KeyH') honk();
  if (e.code === 'KeyC') toggleCam();
  if (e.code === 'KeyM') toggleMute();
  if (e.code === 'Enter') {
    if (state === 'title') start();
    else if (state === 'broken') callForHelp();
    else if (state === 'over') start();
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());
function hold(id, on, off) {
  const el = $(id);
  const down = (e) => {
    e.preventDefault();
    el.classList.add('down');
    on();
  };
  const up = (e) => {
    e.preventDefault();
    el.classList.remove('down');
    off && off();
  };
  el.addEventListener('pointerdown', down);
  for (const t of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(t, up);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}
hold('tL', () => (touch.l = true), () => (touch.l = false));
hold('tR', () => (touch.r = true), () => (touch.r = false));
hold('tBrake', () => (touch.brake = true), () => (touch.brake = false));
hold('tHorn', () => honk());
document.addEventListener('gesturestart', (e) => e.preventDefault());

function toggleCam() {
  camMode = camMode === 'fp' ? 'chase' : 'fp';
  localStorage.setItem('sj.cam', camMode);
  camSnap = true;
}
function toggleMute() {
  sfx.setMuted(!sfx.muted);
  $('btnMute').textContent = sfx.muted ? '🔇' : '🔊';
}
$('btnCam').addEventListener('click', toggleCam);
$('btnMute').addEventListener('click', toggleMute);
$('btnStart').addEventListener('click', start);
$('btnAgain').addEventListener('click', start);
$('btnCall').addEventListener('click', callForHelp);
$('btnRattle').addEventListener('click', rattle);
$('phone').addEventListener('click', () => skipPause && skipPause());
document.addEventListener('click', (e) => e.target.closest?.('button')?.blur());
document.addEventListener('visibilitychange', () => sfx.suspend(document.hidden));

ui.onSpeak = (who, text) => sfx.voice(who, text.length);

// --- talking ----------------------------------------------------------------
function wail(text, n = 2, prio = 1) {
  ui.say('baby', text, prio, n * 650 + 300);
  ui.babyCry(n * 650 + 200);
  sfx.cry(n, 0.16);
}
function react(kind, prio = 1) {
  const opts = [];
  if (L.nana[kind]) opts.push('nana', 'nana', 'nana');
  if (L.teen[kind]) opts.push('teen', 'teen');
  if (L.dog[kind]) opts.push('dog');
  if (!opts.length) return;
  const who = pick(opts);
  ui.say(who, pick(L[who][kind]), prio);
}
function chatter() {
  const r = Math.random();
  if (r < 0.2) wail(pick(L.baby.cry), 2, 0);
  else if (r < 0.62) ui.say('nana', pick(L.nana.idle), 0);
  else if (r < 0.86) ui.say('teen', pick(L.teen.idle), 0);
  else ui.say('dog', pick(L.dog.idle), 0);
}

// --- particles --------------------------------------------------------------
const parts = [];
function puff(kind, pos, vel, life = 1, size = 0.3, grow = 0.6, grav = 0) {
  let p = parts.find((q) => q.life <= 0 && q.kind === kind);
  if (!p) {
    if (parts.length > 90) return;
    p = { kind, mesh: makePuff(kind), vel: new THREE.Vector3() };
    scene.add(p.mesh);
    parts.push(p);
  }
  p.mesh.visible = true;
  p.mesh.position.copy(pos);
  p.vel.copy(vel);
  Object.assign(p, { life, max: life, size, grow, grav });
}
function burstPuffs(kind, pos, n, sp = 4, size = 0.3) {
  for (let i = 0; i < n; i++) puff(kind, pos, v2.set(rand(-sp, sp), rand(1, sp), rand(-sp, sp)), rand(0.5, 1), size * rand(0.6, 1.3), 0.5, 6);
}
function updateParts(dt) {
  for (const p of parts) {
    if (p.life <= 0) continue;
    p.life -= dt;
    if (p.life <= 0) {
      p.mesh.visible = false;
      continue;
    }
    p.vel.y -= p.grav * dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    const k = p.life / p.max;
    p.mesh.scale.setScalar((p.size + (1 - k) * p.grow) * Math.min(1, k * 4));
  }
}

// --- obstacles --------------------------------------------------------------
function place(o) {
  roadPoint(o.s, o.l, v);
  const fl = Math.abs(o.l) > 9.5 ? fieldLift(o.s, o.l) : 0;
  o.root.position.set(v.x, v.y + fl, v.z);
  o.root.rotation.set(Math.atan(dh(o.s)), roadYaw(o.s) + o.yaw, 0, 'YXZ');
  if (o.body) {
    o.body.position.y = o.y;
    o.body.rotation.x = o.spin;
    if (o.shadow) o.shadow.visible = o.y < 6;
  } else o.root.position.y += o.y;
}
function addOb(type, root, props) {
  const o = Object.assign({ type, root, body: root.userData.body || null, shadow: root.userData.shadow || null, s: 0, l: 0, y: 0, yaw: 0, spin: 0, rs: 0.55, rl: 0.55, dmg: 0, hit: false, near: true, t: rand(10) }, props);
  scene.add(root);
  obstacles.push(o);
  place(o);
  return o;
}
function addSheep(props, kind) {
  kind = kind || (Math.random() < 0.07 ? 'black' : 'white');
  return addOb('sheep', makeSheep(kind), { dmg: kind === 'ram' ? 22 : 12, kind, state: 'graze', dir: 1, vl: 4, hop: rand(3), hopRate: 8.4, hopH: 0.35, yaw: rand(6.28), ...props });
}

function spawnEvent(s, force) {
  const table = [['flock', 30, 0], ['graze', 22, 0], ['pothole', 12, 150], ['jumper', 14, 350], ['hay', 8, 250], ['cowpat', 8, 300], ['tractor', 7, 500], ['cow', 6, 650], ['ram', 5, 900]].filter((t) => car.s >= t[2]);
  let r = rand(table.reduce((a, t) => a + t[1], 0)), type = force;
  if (!type) for (const t of table) if ((r -= t[1]) < 0) { type = t[0]; break; }
  const diff = difficulty(), side = Math.random() < 0.5 ? -1 : 1;
  switch (type) {
    case 'flock': {
      const n = 3 + Math.floor(rand(3 + diff * 3));
      for (let i = 0; i < n; i++) addSheep({ s: s + rand(-6, 6), l: side * rand(10.5, 15), state: 'wait', dir: -side, yaw: side * HP, vl: rand(3, 5.2), trigT: rand(2.2, 3.6) });
      break;
    }
    case 'jumper': {
      const n = 1 + Math.floor(rand(1.6 + diff));
      for (let i = 0; i < n; i++) {
        const vl = rand(6, 8);
        addSheep({ s: s + rand(-5, 5), l: side * rand(10, 12), state: 'wait', dir: -side, yaw: side * HP, vl, hopH: rand(2.5, 3.1), hopRate: (vl * Math.PI) / 6, hop: 0, trigT: rand(1.5, 2.8), jumper: true });
      }
      break;
    }
    case 'graze': {
      const n = 1 + Math.floor(rand(2.6));
      for (let i = 0; i < n; i++) addSheep({ s: s + rand(8), l: rand(-4, 4) });
      break;
    }
    case 'pothole': {
      const n = 1 + Math.floor(rand(2));
      for (let i = 0; i < n; i++) addOb('pothole', makePothole(), { s: s + i * rand(6, 14), l: rand(-4, 4), yaw: rand(6), rs: 0.7, rl: 0.9, dmg: 6, near: false });
      break;
    }
    case 'hay': {
      const n = 1 + Math.floor(rand(2));
      for (let i = 0; i < n; i++) addOb('hay', makeHay(), { s: s + rand(5), l: rand(-4, 4), yaw: rand(6), rs: 0.75, rl: 0.75, dmg: 14 });
      break;
    }
    case 'cowpat':
      addOb('cowpat', makeCowpat(), { s, l: rand(-3.5, 3.5), rs: 0.5, rl: 0.55, near: false });
      break;
    case 'tractor':
      addOb('tractor', makeTractor(), { s, l: -2.3, rs: 1.9, rl: 1.05, dmg: 30, boost: 0 });
      break;
    case 'cow':
      addOb('cow', makeCow(), { s, l: rand(-2, 2), yaw: side * HP, rs: 0.75, rl: 1.35, dmg: 28 });
      break;
    case 'ram':
      addSheep({ s, l: rand(-3, 3), yaw: Math.PI, state: 'ram', spd: 8, rs: 0.7, rl: 0.65 }, 'ram');
      break;
  }
}

function fling(o, dl) {
  o.hit = true;
  o.state = 'fly';
  o.vy = rand(11, 15);
  o.vs = car.speed * 1.1 + 4;
  o.vlat = sign(dl) * rand(3, 7);
  o.spinV = rand(8, 14) * (Math.random() < 0.5 ? -1 : 1);
}

function updateObstacle(o, dt) {
  o.t += dt;
  const ds = o.s - car.s;
  if (o.type === 'sheep') {
    switch (o.state) {
      case 'graze':
        o.spin = Math.max(0, Math.sin(o.t * 1.3)) * 0.12;
        if (o.fleeAt && time >= o.fleeAt) flee(o);
        break;
      case 'stare':
        o.y = (o.baseY || 0) + Math.abs(Math.sin(o.t * 3)) * 0.04;
        break;
      case 'wait':
        o.spin = Math.max(0, Math.sin(o.t * 1.3)) * 0.12;
        if (ds < car.speed * o.trigT + 6 && state === 'drive') {
          o.state = 'cross';
          o.spin = 0;
          if (Math.random() < 0.4) sfx.baa({ vol: 0.12, pitch: rand(0.85, 1.2) });
        }
        break;
      case 'cross':
      case 'flee': {
        o.yaw = -o.dir * HP;
        o.l += o.dir * o.vl * dt;
        o.hop += dt * o.hopRate;
        const a = Math.abs(o.l), wb = 1.3 * (1 - ((a - 8) / 1.7) ** 2);
        o.y = Math.abs(Math.sin(o.hop)) * o.hopH + Math.max(0, wb);
        o.spin = Math.cos(o.hop * 2) * (o.jumper ? 0.35 : 0.12);
        if (a > 13.5 && o.l * o.dir > 0) {
          o.state = 'field';
          o.y = 0;
          o.spin = 0;
          o.hit = true;
        }
        break;
      }
      case 'ram':
        if (ds < 170 && state === 'drive') {
          o.s -= o.spd * dt;
          o.l += clamp(car.l - o.l, -1.4 * dt, 1.4 * dt);
          o.hop += dt * 11;
          o.y = Math.abs(Math.sin(o.hop)) * 0.22;
          o.spin = -0.18;
        }
        break;
      case 'fly':
        o.vy -= 22 * dt;
        o.y += o.vy * dt;
        o.s += o.vs * dt;
        o.l += o.vlat * dt;
        o.spin += o.spinV * dt;
        if (o.y <= 0 && o.vy < 0) {
          o.y = 0;
          o.spin = 0;
          sfx.baa({ vol: 0.1, pitch: 1.1, dur: 0.4 });
          roadPoint(o.s, o.l, v);
          burstPuffs('dust', v, 4, 2, 0.25);
          o.dir = sign(o.l);
          o.vl = 7;
          o.hopRate = 10;
          o.hopH = 0.4;
          o.state = 'flee';
        }
        break;
    }
  } else if (o.type === 'tractor') {
    o.boost = Math.max(0, o.boost - 14 * dt);
    o.s += (7 + o.boost) * dt;
    o.l = -2.3 + Math.sin(o.t * 0.5) * 0.5;
    o.root.rotation.z = Math.sin(o.t * 9) * 0.012;
    if (ds < 120 && Math.random() < dt * 4) {
      roadPoint(o.s - 1.1, o.l + 0.28, v);
      v.y += 2.2;
      puff('dark', v, v2.set(0, 1.5, 0), 0.9, 0.12, 0.4);
    }
  } else if (o.type === 'cow') {
    if (o.leaving) {
      o.l += o.dir * 1.3 * dt;
      o.yaw = -o.dir * HP;
      if (Math.abs(o.l) > 6.6) o.leaving = false;
    }
    o.spin = Math.sin(o.t * 0.8) * 0.02;
  }
  place(o);
  if (o.type === 'tractor') o.root.rotation.z = Math.sin(o.t * 9) * 0.012;

  if (state !== 'drive') return;
  const dl = o.l - car.l;
  if (!o.hit && Math.abs(ds) < 1.9 + o.rs && Math.abs(dl) < 0.85 + o.rl) {
    if (o.y > 1.45) o.over = true;
    else if (car.invuln <= 0) onHit(o, dl);
  }
  if (!o.passed && ds < -2.4) {
    o.passed = true;
    if (o.over && !o.hit) {
      stats.unders++;
      ui.burst(pick(BURSTS.under), 'good');
      sfx.ding(3);
      react('under', 2);
    } else if (!o.hit && o.near && Math.abs(dl) < 0.85 + o.rl + 1.0 && car.speed > 8) {
      stats.shaves++;
      ui.burst(pick(BURSTS.near), 'good small');
      sfx.ding(1);
      if (Math.random() < 0.45) react('near', 0);
    }
  }
}

function flee(o) {
  o.state = 'flee';
  o.fleeAt = 0;
  o.dir = o.l === 0 ? sign(rand(-1, 1)) : sign(o.l);
  o.vl = 7.5;
  o.hopRate = 11;
  sfx.baa({ vol: 0.14, pitch: rand(1, 1.3), dur: 0.45 });
}

function damage(n) {
  car.damage = Math.min(100, car.damage + n);
  ui.hpHit();
  if (car.damage >= 100 && state === 'drive') breakdown();
}

function onHit(o, dl) {
  roadPoint(o.s, o.l, v);
  v.y += 0.8;
  car.jolt = 1;
  switch (o.type) {
    case 'sheep': {
      const ram = o.kind === 'ram';
      fling(o, dl);
      car.speed *= ram ? 0.55 : 0.72;
      car.shake = 0.5;
      sfx.crash(ram ? 1 : 0.7);
      ram ? sfx.baa({ pitch: 0.6, dur: 1.2, vol: 0.3, fall: 0.6 }) : sfx.baaFlying();
      ui.burst(pick(ram ? BURSTS.ram : BURSTS.sheep));
      burstPuffs('smoke', v, 7, 4, 0.22);
      stats.sheepHit++;
      react(ram ? 'ram' : 'sheep');
      break;
    }
    case 'cow':
      o.hit = true;
      o.leaving = true;
      o.dir = sign(o.l);
      car.speed *= 0.2;
      car.shake = 0.8;
      sfx.crash(1);
      sfx.moo();
      ui.burst(pick(BURSTS.cow));
      react('cow');
      break;
    case 'tractor':
      o.boost = 24;
      o.s = Math.max(o.s, car.s + 1.9 + o.rs + 0.3);
      car.speed *= 0.35;
      car.shake = 0.8;
      sfx.clang();
      setTimeout(() => sfx.tractorHorn(), 350);
      ui.burst(pick(BURSTS.tractor));
      react('tractor');
      break;
    case 'hay':
      o.hit = true;
      o.root.visible = false;
      car.speed *= 0.7;
      car.shake = 0.4;
      sfx.poof();
      sfx.crash(0.4);
      burstPuffs('hay', v, 14, 6, 0.3);
      ui.burst(pick(BURSTS.hay));
      react('hay');
      break;
    case 'pothole':
      o.hit = true;
      car.bvy = 4.5;
      car.shake = 0.3;
      sfx.thunk();
      ui.burst(pick(BURSTS.pothole), 'small');
      react('pothole');
      break;
    case 'cowpat':
      o.hit = true;
      car.skid = 1.7;
      sfx.squelch();
      ui.burst(pick(BURSTS.cowpat), 'small');
      react('cowpat');
      break;
  }
  if (o.dmg) {
    if (Math.random() < 0.4) setTimeout(() => state === 'drive' && wail(pick(L.baby.cry), 2, 0), 900);
    damage(o.dmg);
  }
}

function honk() {
  if (state !== 'drive' || time < (car.honkAt || 0)) return;
  car.honkAt = time + 0.9;
  sfx.horn();
  stats.honks++;
  let moved = 0;
  for (const o of obstacles) {
    const ds = o.s - car.s;
    if (ds < -4 || ds > 95) continue;
    if (o.type === 'sheep') {
      if (o.state === 'graze' && !o.fleeAt) {
        if (Math.random() < 0.18) {
          o.fleeAt = Infinity;
          setTimeout(() => ui.burst(pick(BURSTS.stubborn), 'small'), 400);
        } else {
          o.fleeAt = time + rand(0.1, 0.5);
          moved++;
        }
      } else if ((o.state === 'cross' || o.state === 'wait') && !o.spooked) {
        o.spooked = true;
        o.vl *= 1.5;
        o.hopRate *= 1.5;
      } else if (o.state === 'ram') o.spd = 14;
    } else if (o.type === 'tractor') setTimeout(() => sfx.tractorHorn(), 500);
    else if (o.type === 'cow') setTimeout(() => sfx.moo(0.18), 500);
  }
  if (Math.random() < 0.3) react('honk', 0);
}

// --- driving ----------------------------------------------------------------
function drive(dt) {
  const left = keys.has('ArrowLeft') || keys.has('KeyA') || touch.l;
  const right = keys.has('ArrowRight') || keys.has('KeyD') || touch.r;
  const brake = keys.has('ArrowDown') || keys.has('KeyS') || touch.brake;
  const dying = state === 'dying' || state === 'home', auto = state === 'title';
  const input = dying || auto ? 0 : (right ? 1 : 0) - (left ? 1 : 0);
  const onVerge = Math.abs(car.l) > ROAD_HALF + 0.3;
  let maxSp = (23 + 12 * difficulty()) * (car.damage > 70 ? 0.85 : 1) * (onVerge ? 0.65 : 1);
  if (auto) maxSp = 13;
  if (dying) car.speed -= 13 * dt;
  else if (brake) car.speed -= 26 * dt;
  else if (car.speed < maxSp) car.speed += 7 * dt;
  else car.speed -= 8 * dt;
  car.speed = Math.max(0, car.speed);

  car.steer += (input - car.steer) * Math.min(1, dt * 9);
  car.skid = Math.max(0, car.skid - dt);
  let target = car.steer * 0.3;
  if (car.skid > 0) target += Math.sin(time * 9) * 0.28;
  if (auto) target = clamp((-2.2 - car.l) * 0.1, -0.2, 0.2);
  car.relYaw += (target - car.relYaw) * Math.min(1, dt * (car.skid > 0 ? 2 : 6.5));
  const push = auto ? 0 : curvature(car.s) * car.speed * car.speed * 0.2;
  car.l += (car.speed * Math.sin(car.relYaw) - push) * dt;
  car.s += car.speed * Math.cos(car.relYaw) * dt;

  car.wallCd -= dt;
  if (Math.abs(car.l) > 6.6) {
    const sd = sign(car.l);
    car.l = sd * 6.6;
    car.relYaw = -sd * 0.1;
    if (car.wallCd <= 0 && car.speed > 4 && state === 'drive') {
      car.wallCd = 0.55;
      car.speed *= 0.78;
      car.shake = 0.4;
      car.jolt = 0.6;
      sfx.scrape();
      ui.burst(pick(BURSTS.wall), 'small');
      roadPoint(car.s + 1, sd * 7.5, v);
      v.y += 0.6;
      burstPuffs('dust', v, 6, 3, 0.25);
      react('wall');
      damage(5);
    }
  }
  if (onVerge && car.speed > 3 && Math.random() < dt * 14) car.bvy += rand(0.6, 1.6);

  if (state === 'dying' && car.speed <= 0.05) broken();
  if (state === 'drive' && car.s >= TRIP) arrive();
  if (state === 'home' && car.speed <= 0.05 && !homeDone) {
    homeDone = true;
    setTimeout(() => finish(true), 1600);
  }
  if (state === 'drive') {
    car.invuln -= dt;
    chatT -= dt;
    if (chatT <= 0) {
      chatT = rand(6, 11);
      chatter();
    }
    if (firstWordAt && car.s > firstWordAt) {
      firstWordAt = 0;
      ui.say('baby', L.baby.firstWord, 2, 2200);
      sfx.baa({ pitch: 1.9, dur: 0.35, vol: 0.2 });
      setTimeout(() => ui.say('nana', L.nana.firstWord, 2), 2300);
      chatT = 8;
    }
    while (car.s + 320 > nextSpawn && nextSpawn < TRIP - 50) {
      spawnEvent(nextSpawn, nextSpawn < 140 ? 'flock' : null);
      nextSpawn += 58 - 30 * difficulty() + rand(22);
    }
  }
}

function updateCar(dt) {
  // suspension
  car.bvy += (-car.by * 140 - car.bvy * 11) * dt;
  car.by += car.bvy * dt;
  car.shake = Math.max(0, car.shake - dt * 1.6);
  car.jolt = Math.max(0, car.jolt - dt * 2.5);
  const hurt = car.damage / 100, moving = Math.min(1, car.speed / 12);
  roadPoint(car.s, car.l, v);
  const g = rig.group;
  g.position.set(v.x, v.y + Math.max(-0.12, car.by), v.z);
  const wob = Math.sin(time * 23) * 0.012 * hurt * moving + Math.sin(time * 31) * 0.004 * moving;
  g.rotation.set(Math.atan(dh(car.s)) + car.bvy * 0.012 + wob, roadYaw(car.s) - car.relYaw, -car.relYaw * 0.22 + wob * 1.6, 'YXZ');
  rig.wheel.rotation.z = -car.steer * 1.1;
  rig.bumper.rotation.z = -Math.max(0, hurt - 0.3) * 0.5;
  rig.bumper.rotation.y = Math.max(0, hurt - 0.6) * 0.5;
  rig.occ.forEach((m, i) => {
    m.position.y = m.userData.baseY + Math.sin(time * (9 + i * 1.7) + i) * 0.012 * moving + car.jolt * 0.09 * Math.abs(Math.sin(time * 20 + i)) - car.by * 0.3;
    m.rotation.z = car.relYaw * 0.5 + Math.sin(time * 3 + i * 2) * 0.03;
  });
  rig.driver.visible = !(camMode === 'fp' && (state === 'drive' || state === 'dying'));
  rig.frame.visible = rig.driver.visible;

  // smoke signals
  if (state !== 'title' && hurt > 0.3) {
    const rate = (hurt - 0.3) * 22 + (state === 'drive' ? 0 : 5);
    if (Math.random() < dt * rate) {
      v2.set(rand(-0.3, 0.3), 1.2, -1.45);
      g.localToWorld(v2);
      puff(hurt > 0.7 ? 'dark' : 'smoke', v2, v.set(rand(-0.4, 0.4), rand(1.5, 2.6), rand(-0.4, 0.4)), rand(0.9, 1.5), 0.14, 0.55);
    }
  }
}

function updateCamera(dt) {
  const g = rig.group;
  const k = camSnap ? 1 : 1 - Math.exp(-dt * 10);
  const sh = car.shake * 0.25;
  if (state === 'drive' || state === 'dying' || state === 'home') {
    if (camMode === 'fp') {
      g.updateMatrixWorld();
      camera.position.set(0.38, 1.82, 0.1).applyMatrix4(g.matrixWorld);
      camera.quaternion.copy(g.quaternion);
      camera.rotateX(-0.09 + rand(-sh, sh) * 0.1);
      camera.rotateZ(rand(-sh, sh) * 0.1);
    } else {
      const yaw = roadYaw(car.s) - car.relYaw * 0.45;
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      v.set(g.position.x - fx * 6.8, g.position.y + 3.1, g.position.z - fz * 6.8);
      camPos.lerp(v, k);
      camera.position.copy(camPos).add(v2.set(rand(-sh, sh), rand(-sh, sh), 0));
      camera.lookAt(g.position.x + fx * 9, g.position.y + 1.1, g.position.z + fz * 9);
    }
  } else {
    orbitA += dt * (state === 'title' ? 0.12 : 0.16);
    const R = state === 'title' ? 8.5 : 7.6;
    v.set(g.position.x + Math.sin(orbitA) * R, g.position.y + 3.0 + Math.sin(orbitA * 0.7) * 0.6, g.position.z + Math.cos(orbitA) * R);
    camPos.lerp(v, camSnap ? 1 : 1 - Math.exp(-dt * 3));
    camera.position.copy(camPos);
    camera.lookAt(g.position.x, g.position.y + 1.1, g.position.z);
  }
  camSnap = false;
  sky.position.copy(camera.position);
  clouds.position.set(camera.position.x, 0, camera.position.z);
  clouds.rotation.y += dt * 0.003;
}

// --- breakdown, rescue, repair ----------------------------------------------
let waitT = 0, waitDur = 16, babyT = 0, calm = 0, moanT = 0, repairT = 0, repairStep = 0, skipPause = null;
const pause = (ms) =>
  new Promise((res) => {
    const done = () => {
      clearTimeout(t);
      skipPause = null;
      res();
    };
    const t = setTimeout(done, ms);
    skipPause = done;
  });

function breakdown() {
  state = 'dying';
  sfx.sputter();
  ui.say('nana', pick(L.nana.dying), 2);
  ui.burst('PHUT!', 'small');
  $('touch').classList.add('hidden');
}
function broken() {
  state = 'broken';
  car.speed = 0;
  camSnap = false;
  camPos.copy(camera.position);
  orbitA = Math.atan2(camera.position.x - rig.group.position.x, camera.position.z - rig.group.position.z);
  wail(pick(L.baby.cry), 3, 1);
  setTimeout(() => {
    if (state !== 'broken') return;
    const none = car.repairs <= 0;
    $('brokenText').textContent = pick(['Something fell off. It sounded important.', 'The engine has made its feelings known.', 'There is wool in places wool should not be.']);
    $('brokenLeft').textContent = none ? 'Repairs left: none. Ring anyway?' : `Repairs left: ${car.repairs} of 3`;
    ui.show('broken');
  }, 900);
}

async function callForHelp() {
  if (state !== 'broken') return;
  state = 'phone';
  ui.show('broken', false);
  ui.show('phone');
  const status = $('phoneStatus'), text = $('phoneText');
  status.textContent = 'DIALLING…';
  text.textContent = '☎ 0800 EWE TURN';
  sfx.dial();
  await pause(1200);
  status.textContent = 'RINGING…';
  text.textContent = 'ring ring… ring ring…';
  sfx.ring();
  await pause(1800);
  if (car.repairs <= 0) {
    status.textContent = 'CALL REJECTED';
    text.textContent = 'The number you have dialled has blocked you. It was very clear about this. Goodbye.';
    sfx.sad();
    await pause(4200);
    ui.show('phone', false);
    return gameOver();
  }
  const lines = CALLS[3 - car.repairs];
  car.repairs--;
  status.textContent = 'ON HOLD ♪ Baa Baa Black Sheep';
  sfx.startHold();
  for (const line of lines) {
    text.textContent = line;
    await pause(2300 + line.length * 28);
  }
  sfx.stopHold();
  ui.show('phone', false);
  startWait();
}

function addStarer(ds, dl, baseY = 0) {
  const s = car.s + ds, l = clamp(car.l + dl, -6.8, 6.8);
  const yaw = baseY ? Math.PI : Math.atan2(-(car.l - l), car.s - s);
  const o = addSheep({ s, l, yaw, state: 'stare', hit: true, near: false, baseY, y: baseY, starer: true });
  if (baseY) o.shadow.visible = false;
  return o;
}
function startWait() {
  state = 'wait';
  waitT = 0;
  waitDur = 15;
  babyT = 0.5;
  calm = 0;
  moanT = 1.2;
  for (const o of obstacles) if (Math.abs(o.s - car.s) < 14 && !o.starer) { scene.remove(o.root); o.dead = true; }
  const side = car.l > 0 ? -1 : 1;
  addStarer(4.2, side * 1.4);
  addStarer(3.4, -side * 1.9);
  addStarer(0.6, side * 2.6);
  addStarer(-1.4, side * 3.4);
  addStarer(-0.4, -side * 2.4);
  addStarer(1.05, 0, 1.2); // the one on the bonnet
  sfx.baa({ vol: 0.15 });
  $('waitTitle').textContent = 'WAITING FOR RESCUE…';
  $('btnRattle').classList.remove('hidden');
  ui.show('wait');
}
const ETA = ['Estimated arrival: between now and Tuesday.', 'Derek has stopped for a sandwich.', 'Derek is stuck behind a tractor.', 'Derek is stuck behind some sheep.', 'Derek is here! Act natural.'];
function updateWait(dt) {
  waitT += dt;
  $('waitFill').style.width = Math.min(100, (waitT / waitDur) * 100) + '%';
  $('waitText').textContent = ETA[Math.min(4, Math.floor((waitT / waitDur) * 4.6))];
  moanT -= dt;
  if (moanT <= 0) {
    moanT = 2.9;
    const who = pick(['nana', 'nana', 'nana', 'teen', 'teen', 'dog']);
    ui.say(who, pick(L[who].wait), 1);
    if (Math.random() < 0.5) sfx.baa({ vol: 0.08, pitch: rand(0.8, 1.3) });
  }
  if (calm > 0) {
    calm -= dt;
    if (calm <= 0) {
      wail(pick(L.baby.louder), 3, 2);
      babyT = 3.2;
    }
  } else {
    babyT -= dt;
    if (babyT <= 0) {
      babyT = 3.3;
      wail(pick(L.baby.cry), 2, 0);
    }
  }
  const lead = 4.5;
  if (waitT > waitDur - lead) {
    if (!van.visible) {
      van.visible = true;
      sfx.beep(2);
    }
    const u = clamp((waitT - (waitDur - lead)) / lead, 0, 1), e = 1 - (1 - u) ** 3;
    placeAt(van, car.s - 7.2 - (1 - e) * 120, car.l * e + -2.2 * (1 - e));
    van.userData.beacon.visible = Math.sin(time * 14) > 0;
  }
  if (waitT >= waitDur) startRepair();
}
function placeAt(obj, s, l, yaw = 0) {
  roadPoint(s, l, v);
  obj.position.copy(v);
  obj.rotation.set(Math.atan(dh(s)), roadYaw(s) + yaw, 0, 'YXZ');
}
function rattle() {
  if (state !== 'wait') return;
  stats.rattles++;
  sfx.rattle();
  calm = 2.6;
  ui.babyCalm();
  ui.say('baby', pick(L.baby.calm), 2, 2000);
}
function startRepair() {
  state = 'repair';
  repairT = 0;
  repairStep = -1;
  const side = car.l > 0 ? -1 : 1;
  mech.visible = true;
  placeAt(mech, car.s + 1.3, car.l + side * 1.5, side * HP);
  $('waitTitle').textContent = 'DEREK IS HITTING IT WITH A HAMMER';
  $('btnRattle').classList.add('hidden');
  $('waitFill').style.width = '100%';
  ui.hush();
}
function updateRepair(dt) {
  repairT += dt;
  const lines = MECHANIC[2 - car.repairs] || MECHANIC[0];
  const step = Math.min(2, Math.floor(repairT / 1.9));
  if (step !== repairStep) {
    repairStep = step;
    $('waitText').textContent = lines[step];
    sfx.voice('mech', lines[step].length);
    sfx.ratchet(0.7);
    sfx.hammer(1.2);
    sfx.hammer(1.45);
  }
  mech.rotation.x = Math.sin(time * 14) * 0.08;
  van.userData.beacon.visible = Math.sin(time * 14) > 0;
  if (Math.random() < dt * 6) {
    v2.set(rand(-0.4, 0.4), 1.25, -1.2);
    rig.group.localToWorld(v2);
    puff('smoke', v2, v.set(rand(-1, 1), rand(1, 3), rand(-1, 1)), 0.5, 0.08, 0.25);
  }
  car.damage = Math.max(0, car.damage - dt * 20);
  if (repairT > 5.9) finishRepair();
}
function finishRepair() {
  car.damage = 0;
  car.invuln = 2.5;
  car.speed = 0;
  mech.visible = false;
  ui.show('wait', false);
  sfx.jingle();
  setTimeout(() => sfx.horn(), 500);
  for (const o of obstacles) {
    if (o.starer) {
      o.baseY ? fling(o, 1) : flee(o);
      if (o.baseY) { o.vs = 6; o.vy = 9; o.shadow.visible = true; }
    } else if (o.s - car.s < 150 && o.s > car.s - 5) {
      scene.remove(o.root);
      o.dead = true;
    }
  }
  nextSpawn = Math.max(nextSpawn, car.s + 150);
  Object.assign(van.userData, { leaving: 1, s0: car.s - 7.2, l0: car.l });
  state = 'drive';
  camSnap = true;
  chatT = 7;
  ui.say('nana', pick(L.nana.repaired), 2);
  if (isTouch) $('touch').classList.remove('hidden');
}

let homeDone = false;
function arrive() {
  state = 'home';
  homeDone = false;
  sfx.jingle();
  setTimeout(() => sfx.horn(), 400);
  ui.burst('HOME!', 'good');
  ui.say('nana', "Home! I never doubted you. I doubted you constantly.", 2);
  $('touch').classList.add('hidden');
}
const clock = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
function homeVerdict(t) {
  if (t < 200) return 'Home before my tea went cold. Suspicious.';
  if (t < 300) return 'Not bad. I only prayed twice.';
  if (t < 420) return "We're home. I've aged. The baby has aged.";
  return 'I left the oven on. That was this morning. It is no longer morning.';
}
function gameOver() {
  finish(false);
}
function finish(home) {
  state = 'over';
  const dist = Math.min(TRIP, Math.round(car.s)), t = stats.time;
  const timeBonus = home ? Math.max(0, Math.round((PAR - t) * 25)) : 0;
  const score = (home ? 5000 + timeBonus + car.repairs * 500 : dist) + stats.shaves * 50 + stats.unders * 200;
  const best = Math.max(score, +localStorage.getItem('sj.best') || 0);
  localStorage.setItem('sj.best', best);
  if (home) localStorage.setItem('sj.bestTime', Math.min(t, +localStorage.getItem('sj.bestTime') || 1e9));
  const rows = home
    ? [['Made it home', 5000], [`Time ${clock(t)} (speed bonus)`, timeBonus], [`Repairs unused ×${car.repairs}`, car.repairs * 500]]
    : [[`Got ${(dist / 1000).toFixed(2)} km of ${TRIP / 1000} km`, dist], [`Time wasted: ${clock(t)}`, 0]];
  rows.push([`Close shaves ×${stats.shaves}`, stats.shaves * 50], [`Sheep jumped UNDER ×${stats.unders}`, stats.unders * 200]);
  const trivia = `Sheep launched: ${stats.sheepHit} · Honks: ${stats.honks} · Rattles shaken: ${stats.rattles} (did not help)`;
  $('overKicker').textContent = home ? `HOME IN ${clock(t)}` : 'ROADSIDE ASSISTANCE HAS BLOCKED YOUR NUMBER';
  $('overTitle').textContent = home ? 'HOME SWEET HOME' : 'THE SHEEP HAVE WON';
  $('stats').innerHTML = rows.map(([a, b]) => `<span>${a}</span><b>${b}</b>`).join('') + `<span class="total">SCORE${score >= best && score > 0 ? ' — NEW BEST!' : ''}</span><b class="total">${score}</b><span class="trivia">${trivia}</span>`;
  $('verdict').textContent = home ? homeVerdict(t) : verdict(dist);
  ui.show('hud', false);
  ui.show('seats', false);
  ui.show('over');
}

function start() {
  sfx.init();
  resetGame();
  state = 'drive';
  for (const id of ['title', 'over', 'broken', 'phone', 'wait']) ui.show(id, false);
  ui.show('hud');
  ui.show('seats');
  ui.babyCalm();
  $('touch').classList.toggle('hidden', !isTouch);
  world.update(car.s);
  sfx.horn();
  setTimeout(() => state === 'drive' && ui.say('nana', pick(L.nana.start), 2), 700);
}
const best0 = +localStorage.getItem('sj.best') || 0;
const bt0 = +localStorage.getItem('sj.bestTime');
if (best0) $('best').textContent = `Best score: ${best0}` + (bt0 ? ` · Fastest home: ${clock(bt0)}` : '');

// --- main loop --------------------------------------------------------------
let lastT = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  time += dt;

  if (!['title', 'over', 'home'].includes(state)) stats.time += dt; // the clock never stops, not even for Derek
  if (state === 'drive' || state === 'dying' || state === 'title' || state === 'home') drive(dt);
  else if (state === 'wait') updateWait(dt);
  else if (state === 'repair') updateRepair(dt);

  if (van.visible && van.userData.leaving) {
    // Derek leaves the way he came: in reverse, at speed
    van.userData.leaving += dt;
    const t = van.userData.leaving - 1;
    placeAt(van, van.userData.s0 - t * t * 30, van.userData.l0);
    if (t > 2.2) {
      van.visible = false;
      van.userData.leaving = 0;
    }
  }

  world.update(car.s);
  updateCar(dt);
  let anyDead = false;
  for (const o of obstacles) {
    if (o.dead) { anyDead = true; continue; }
    updateObstacle(o, dt);
    if (o.s < car.s - 40 || (o.state === 'field' && o.s < car.s - 15)) {
      scene.remove(o.root);
      o.dead = anyDead = true;
    }
  }
  if (anyDead) obstacles = obstacles.filter((o) => !o.dead);
  updateParts(dt);
  updateCamera(dt);
  sfx.engine(car.speed, state === 'drive' || state === 'title' || state === 'home');
  if (state !== 'title' && state !== 'over') ui.hud({ togo: Math.max(0, TRIP - car.s), time: stats.time, speed: car.speed, shaves: stats.shaves, damage: car.damage, repairs: car.repairs });
  renderer.render(scene, camera);
}

// debug / test handle
window.__sj = { car, stats, get state() { return state; }, get obstacles() { return obstacles; }, spawnEvent, damage, start };

world.update(0);
requestAnimationFrame(frame);
