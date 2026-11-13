// Ligne-claire model kit: flat colours, two-tone toon shading and inked outlines.
// Every model is ONE merged geometry: coloured parts plus slightly inflated,
// inside-out black copies of each part (the classic "inverted hull" outline).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const grad = new THREE.DataTexture(new Uint8Array([125, 125, 205, 255]), 4, 1, THREE.RedFormat);
grad.minFilter = grad.magFilter = THREE.NearestFilter;
grad.needsUpdate = true;

export const toonMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: grad });
export const terrainMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: grad, side: THREE.DoubleSide });
export const flatMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
export const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.2, depthWrite: false });

const SPH = new THREE.SphereGeometry(1, 14, 10);
const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 14);
const CONE = new THREE.ConeGeometry(1, 1, 12);
const INK = 0x16130f;
const HP = Math.PI / 2;

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _c = new THREE.Color();
const _p = new THREE.Vector3(), _s = new THREE.Vector3();

function paint(g, color) {
  _c.set(color);
  const n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    a[i * 3] = _c.r;
    a[i * 3 + 1] = _c.g;
    a[i * 3 + 2] = _c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
}

function tbox(w, h, d, tx = 1, tz = 1, shiftZ = 0) {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) > 0) {
      p.setX(i, p.getX(i) * tx);
      p.setZ(i, p.getZ(i) * tz + shiftZ);
    }
  }
  g.computeVertexNormals();
  return g;
}

class Builder {
  constructor(t = 0.04) {
    this.t = t;
    this.geos = [];
  }
  // p: position, s: scale (number or [x,y,z]), r: euler [x,y,z], o: { t: outline thickness (0 = none) }
  add(geo, color, p = [0, 0, 0], s = 1, r = null, o = {}) {
    if (typeof s === 'number') s = [s, s, s];
    _m.compose(_p.set(p[0], p[1], p[2]), r ? _q.setFromEuler(_e.set(r[0], r[1], r[2])) : _q.identity(), _s.set(s[0], s[1], s[2]));
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    const main = g.clone().applyMatrix4(_m);
    paint(main, color);
    this.geos.push(main);
    const t = o.t ?? this.t;
    if (t > 0) {
      g.computeBoundingBox();
      const bb = g.boundingBox, pos = g.attributes.position, nor = g.attributes.normal;
      const c = [(bb.min.x + bb.max.x) / 2, (bb.min.y + bb.max.y) / 2, (bb.min.z + bb.max.z) / 2];
      const half = [(bb.max.x - bb.min.x) / 2, (bb.max.y - bb.min.y) / 2, (bb.max.z - bb.min.z) / 2];
      const k = half.map((hv, i) => (hv > 1e-4 ? 1 + t / s[i] / hv : 1));
      for (let i = 0; i < pos.count; i++) {
        pos.setXYZ(i, c[0] + (pos.getX(i) - c[0]) * k[0], c[1] + (pos.getY(i) - c[1]) * k[1], c[2] + (pos.getZ(i) - c[2]) * k[2]);
      }
      for (let i = 0; i < pos.count; i += 3) {
        for (const a of [pos, nor]) {
          const x = a.getX(i + 1), y = a.getY(i + 1), z = a.getZ(i + 1);
          a.setXYZ(i + 1, a.getX(i + 2), a.getY(i + 2), a.getZ(i + 2));
          a.setXYZ(i + 2, x, y, z);
        }
      }
      g.applyMatrix4(_m);
      paint(g, INK);
      this.geos.push(g);
    }
    return this;
  }
  box(c, size, p, r, o) { return this.add(BOX, c, p, size, r, o); }
  sph(c, s, p, r, o) { return this.add(SPH, c, p, s, r, o); }
  cyl(c, rad, h, p, r, o) { return this.add(CYL, c, p, [rad, h, rad], r, o); }
  wheel(rad, w, p, hub = 0xe8e2d0) {
    this.cyl(0x2b2b2e, rad, w, p, [0, 0, HP]);
    this.cyl(hub, rad * 0.45, w + 0.04, p, [0, 0, HP], { t: 0.015 });
    return this;
  }
  eyes(x, y, z, r = 0.03) {
    this.sph(INK, r, [x, y, z], null, { t: 0 });
    this.sph(INK, r, [-x, y, z], null, { t: 0 });
    return this;
  }
  build() {
    const g = mergeGeometries(this.geos, false);
    g.computeBoundingSphere();
    return g;
  }
  mesh(mat = toonMat) {
    return new THREE.Mesh(this.build(), mat);
  }
}

const cache = new Map();
const cached = (key, fn) => {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
};
const meshOf = (key, fn, mat = toonMat) => new THREE.Mesh(cached(key, fn), mat);

// --- text textures ----------------------------------------------------------
export function textTexture(text, { w = 512, h = 272, bg = '#f7d21e', fg = '#16130f', border = 14, font = 'Bangers' } = {}) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const x = cv.getContext('2d');
  x.fillStyle = fg;
  x.fillRect(0, 0, w, h);
  x.fillStyle = bg;
  x.fillRect(border, border, w - border * 2, h - border * 2);
  const lines = text.split('\n');
  let size = Math.floor((h - border * 4) / lines.length);
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillStyle = fg;
  for (;;) {
    x.font = `${size}px ${font}, Impact, sans-serif`;
    if (Math.max(...lines.map((l) => x.measureText(l).width)) < w - border * 4 - 10 || size < 12) break;
    size -= 4;
  }
  const lh = size * 1.08, y0 = h / 2 - ((lines.length - 1) * lh) / 2 + size * 0.05;
  lines.forEach((l, i) => x.fillText(l, w / 2, y0 + i * lh));
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// --- animals ----------------------------------------------------------------
function sheepGeo(wool, face, ram) {
  const b = new Builder(0.035);
  b.sph(wool, [0.44, 0.38, 0.6], [0, 0.72, 0]);
  b.sph(wool, 0.25, [0, 0.95, -0.22]);
  b.sph(wool, 0.23, [0.13, 0.97, 0.14]);
  b.sph(wool, 0.22, [-0.14, 0.95, 0.26]);
  b.sph(wool, 0.24, [0.05, 0.62, -0.3]);
  b.sph(wool, 0.13, [0, 0.8, 0.62]);
  b.sph(face, [0.15, 0.17, 0.22], [0, 0.96, -0.66], [0.35, 0, 0]);
  b.sph(wool, 0.12, [0, 1.11, -0.56]);
  b.sph(face, [0.11, 0.04, 0.06], [0.2, 1.0, -0.58], [0, 0, -0.4]);
  b.sph(face, [0.11, 0.04, 0.06], [-0.2, 1.0, -0.58], [0, 0, 0.4]);
  for (const sx of [1, -1]) {
    b.sph(0xffffff, 0.062, [sx * 0.085, 1.03, -0.79], null, { t: 0.012 });
    b.sph(INK, 0.026, [sx * 0.09, 1.03, -0.848], null, { t: 0 });
    for (const sz of [1, -1]) b.cyl(face, 0.05, 0.44, [sx * 0.2, 0.22, sz * 0.32]);
  }
  if (ram) {
    for (const sx of [1, -1]) {
      b.add(new THREE.TorusGeometry(0.13, 0.05, 8, 14, Math.PI * 1.5), 0xcfae72, [sx * 0.2, 1.04, -0.56], 1, [0, HP, 0.6]);
      b.box(INK, [0.12, 0.03, 0.03], [sx * 0.09, 1.11, -0.82], [0, 0, sx * -0.5], { t: 0 });
    }
  }
  return b.build();
}
const SHADOW = new THREE.CircleGeometry(1, 16).rotateX(-HP);

export function makeSheep(kind = 'white') {
  const g = new THREE.Group();
  const body = meshOf('sheep-' + kind, () =>
    kind === 'black' ? sheepGeo(0x3a3a3f, 0x1c1c1f, false) : kind === 'ram' ? sheepGeo(0xe9e0c8, 0x2a2622, true) : sheepGeo(0xfaf6ea, 0x2a2a2e, false)
  );
  if (kind === 'ram') body.scale.setScalar(1.25);
  const sh = new THREE.Mesh(SHADOW, shadowMat);
  sh.scale.set(0.55, 1, 0.7);
  sh.position.y = 0.04;
  g.add(body, sh);
  g.userData = { body, shadow: sh };
  return g;
}

export function makeCow() {
  const g = new THREE.Group();
  const body = meshOf('cow', () => {
    const b = new Builder(0.045);
    const W = 0xfbf8f0, K = 0x26262a, P = 0xf2a6a6;
    b.sph(W, [0.55, 0.52, 1.0], [0, 1.1, 0]);
    b.sph(K, [0.38, 0.36, 0.42], [0.2, 1.27, 0.25]);
    b.sph(K, [0.3, 0.33, 0.36], [-0.27, 1.12, -0.42]);
    b.sph(K, [0.25, 0.2, 0.3], [0.1, 0.78, 0.6]);
    b.sph(W, [0.26, 0.3, 0.36], [0, 1.32, -1.12], [0.3, 0, 0]);
    b.sph(P, [0.2, 0.15, 0.14], [0, 1.16, -1.42]);
    b.sph(K, [0.16, 0.05, 0.08], [0.33, 1.47, -1.0]);
    b.sph(K, [0.16, 0.05, 0.08], [-0.33, 1.47, -1.0]);
    b.add(CONE, 0xe8dcc0, [0.16, 1.65, -1.02], [0.045, 0.2, 0.045], [0, 0, -0.3]);
    b.add(CONE, 0xe8dcc0, [-0.16, 1.65, -1.02], [0.045, 0.2, 0.045], [0, 0, 0.3]);
    b.eyes(0.13, 1.4, -1.4, 0.035);
    b.sph(P, 0.2, [0, 0.62, 0.45]);
    for (const sx of [1, -1]) for (const sz of [1, -1]) b.cyl(W, 0.09, 0.72, [sx * 0.3, 0.36, sz * 0.62]);
    b.cyl(W, 0.03, 0.7, [0, 1.0, 1.02], [0.25, 0, 0]);
    b.sph(K, 0.07, [0, 0.66, 1.1]);
    return b.build();
  });
  const sh = new THREE.Mesh(SHADOW, shadowMat);
  sh.scale.set(0.7, 1, 1.3);
  sh.position.y = 0.04;
  g.add(body, sh);
  g.userData = { body, shadow: sh };
  return g;
}

// --- vehicles ---------------------------------------------------------------
export function makeCar() {
  const RED = 0xd9352b, DARK = 0x242428, CHROME = 0xc9ccd2, SEAT = 0x8a5a3a, SKIN = 0xf4cfa9;
  const group = new THREE.Group();
  const b = new Builder(0.04);
  b.box(RED, [1.5, 0.5, 3.5], [0, 0.62, 0]);
  b.add(tbox(1.2, 0.42, 1.38, 0.72, 1, 0), RED, [0, 1.0, -1.05]);
  b.box(CHROME, [0.78, 0.55, 0.08], [0, 0.93, -1.76]);
  for (let i = -2; i <= 2; i++) b.box(DARK, [0.05, 0.42, 0.02], [i * 0.14, 0.93, -1.805], null, { t: 0 });
  b.cyl(CHROME, 0.035, 0.1, [0, 1.25, -1.7]);
  for (const sx of [1, -1]) {
    b.sph(0xffe27a, 0.15, [sx * 0.56, 1.0, -1.68]);
    b.box(DARK, [0.34, 0.1, 0.98], [sx * 0.8, 0.78, -1.25]);
    b.box(DARK, [0.34, 0.1, 0.98], [sx * 0.8, 0.78, 1.2]);
    b.box(DARK, [0.22, 0.06, 1.5], [sx * 0.82, 0.42, 0]);
    b.wheel(0.36, 0.22, [sx * 0.78, 0.36, -1.25]);
    b.wheel(0.36, 0.22, [sx * 0.78, 0.36, 1.2]);
    b.box(RED, [0.08, 0.32, 2.0], [sx * 0.71, 1.02, 0.85]);
    b.sph(0xb3261e, 0.07, [sx * 0.6, 0.8, 1.77]);
  }
  b.box(RED, [1.5, 0.38, 0.3], [0, 1.02, -0.3]);
  b.box(RED, [1.5, 0.32, 0.08], [0, 1.02, 1.8]);
  b.box(SEAT, [1.3, 0.14, 0.5], [0, 0.93, 0.12]);
  b.box(SEAT, [1.3, 0.55, 0.12], [0, 1.18, 0.42]);
  b.box(SEAT, [1.3, 0.14, 0.5], [0, 0.93, 1.2]);
  b.box(SEAT, [1.3, 0.55, 0.12], [0, 1.18, 1.52]);
  b.cyl(DARK, 0.025, 0.3, [0.38, 1.2, -0.2], [1.0, 0, 0], { t: 0 });
  // spare wheel + luggage
  b.cyl(0x2b2b2e, 0.33, 0.16, [0, 0.95, 1.93], [HP, 0, 0]);
  b.cyl(0xe8e2d0, 0.14, 0.2, [0, 0.95, 1.93], [HP, 0, 0], { t: 0.015 });
  b.box(0x9a6a3c, [0.8, 0.3, 0.42], [-0.15, 1.6, 1.62], [0, 0.08, 0]);
  b.box(0x3f7f5f, [0.5, 0.24, 0.36], [0.05, 1.87, 1.62], [0, -0.15, 0]);
  b.box(0xe9c46a, [0.06, 0.32, 0.44], [-0.35, 1.6, 1.62], [0, 0.08, 0], { t: 0 });
  b.box(0xe9c46a, [0.06, 0.32, 0.44], [0.05, 1.6, 1.62], [0, 0.08, 0], { t: 0 });
  b.box(CHROME, [1.6, 0.1, 0.08], [0, 0.5, 1.82]);
  const body = b.mesh();
  group.add(body);
  // windscreen frame is separate so the first-person view can drop it
  const frame = new Builder(0.02)
    .box(0x55585e, [0.045, 0.84, 0.045], [0.72, 1.6, -0.34], [-0.12, 0, 0])
    .box(0x55585e, [0.045, 0.84, 0.045], [-0.72, 1.6, -0.34], [-0.12, 0, 0])
    .box(0x55585e, [1.49, 0.045, 0.045], [0, 2.0, -0.29])
    .mesh();
  group.add(frame);

  const bumper = new Builder(0.04).box(CHROME, [1.66, 0.11, 0.09], [0.83, 0, 0]).mesh();
  bumper.position.set(-0.83, 0.5, -1.84);
  group.add(bumper);

  const wheel = new Builder(0.02).add(new THREE.TorusGeometry(0.17, 0.025, 8, 18), DARK).box(DARK, [0.32, 0.03, 0.02], [0, 0, 0], null, { t: 0 }).mesh();
  wheel.position.set(0.38, 1.3, -0.08);
  wheel.rotation.x = -0.55;
  group.add(wheel);

  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.17), new THREE.MeshBasicMaterial({ map: textTexture('EWE 2', { w: 256, h: 72, border: 5 }) }));
  plate.position.set(0, 0.52, 1.87);
  group.add(plate);

  // occupants: each its own mesh so heads can bob
  const occ = [];
  const person = (fn, x, z) => {
    const bb = new Builder(0.03);
    fn(bb);
    const m = bb.mesh();
    m.position.set(x, 0.99, z);
    m.userData.baseY = 0.99;
    group.add(m);
    occ.push(m);
    return m;
  };
  const driver = person((p) => {
    p.box(0x3a6ea5, [0.44, 0.52, 0.26], [0, 0.27, 0]);
    p.sph(SKIN, 0.17, [0, 0.7, 0]);
    p.cyl(0x6b7a45, 0.185, 0.07, [0, 0.85, 0.01]);
    p.box(0x6b7a45, [0.22, 0.03, 0.16], [0, 0.82, -0.2]);
    p.box(0xd9352b, [0.3, 0.08, 0.3], [0, 0.53, 0]);
    p.eyes(0.06, 0.72, -0.16);
  }, 0.38, 0.12);
  person((p) => {
    // teenager, mostly hood
    p.box(0x7a4fa3, [0.42, 0.5, 0.26], [0, 0.27, 0]);
    p.sph(0x7a4fa3, 0.2, [0, 0.69, 0.04]);
    p.sph(SKIN, 0.16, [0, 0.67, -0.04]);
    p.sph(0x2a2320, [0.15, 0.07, 0.1], [0.02, 0.76, -0.13], [0.4, 0, 0.2]);
    p.cyl(0xa6e22e, 0.07, 0.05, [0.2, 0.68, 0], [0, 0, HP]);
    p.cyl(0xa6e22e, 0.07, 0.05, [-0.2, 0.68, 0], [0, 0, HP]);
    p.eyes(0.06, 0.67, -0.19);
  }, -0.38, 0.12);
  person((p) => {
    // nana
    p.box(0xb9a0d8, [0.46, 0.5, 0.28], [0, 0.27, 0]);
    p.sph(SKIN, 0.17, [0, 0.68, 0]);
    p.sph(0xe2e2e6, [0.185, 0.17, 0.17], [0, 0.72, 0.05]);
    p.sph(0xe2e2e6, 0.09, [0, 0.9, 0.06]);
    for (const sx of [1, -1]) p.add(new THREE.TorusGeometry(0.05, 0.012, 6, 12), INK, [sx * 0.065, 0.69, -0.165], 1, null, { t: 0 });
    p.eyes(0.065, 0.69, -0.16, 0.02);
    p.box(0xf4f0e6, [0.5, 0.1, 0.32], [0, 0.5, 0]);
  }, -0.4, 1.2);
  person((p) => {
    // baby, permanently mid-scream
    p.box(0x9fd3e6, [0.4, 0.5, 0.34], [0, 0.22, 0.03]);
    p.sph(0xf7d154, [0.15, 0.17, 0.13], [0, 0.3, -0.08]);
    p.sph(SKIN, 0.14, [0, 0.56, -0.08]);
    p.sph(0x5a1a1a, [0.055, 0.065, 0.03], [0, 0.52, -0.21], null, { t: 0 });
    p.sph(0xe9a23b, 0.04, [0, 0.71, -0.08]);
    p.box(INK, [0.05, 0.012, 0.01], [0.055, 0.6, -0.21], [0, 0, 0.4], { t: 0 });
    p.box(INK, [0.05, 0.012, 0.01], [-0.055, 0.6, -0.21], [0, 0, -0.4], { t: 0 });
  }, 0.42, 1.2);
  person((p) => {
    // Biscuit the dog
    const BR = 0xb9772f, DK = 0x7a4a1c;
    p.sph(BR, [0.16, 0.22, 0.16], [0, 0.22, 0]);
    p.sph(BR, 0.15, [0, 0.55, -0.02]);
    p.sph(0xe8cfa0, [0.09, 0.075, 0.12], [0, 0.51, -0.17]);
    p.sph(INK, 0.035, [0, 0.54, -0.285], null, { t: 0 });
    p.sph(DK, [0.05, 0.13, 0.08], [0.16, 0.52, 0], [0, 0, 0.25]);
    p.sph(DK, [0.05, 0.13, 0.08], [-0.16, 0.52, 0], [0, 0, -0.25]);
    p.box(0xf08a9b, [0.05, 0.1, 0.015], [0.02, 0.43, -0.25], [0.3, 0, 0], { t: 0.008 });
    p.eyes(0.06, 0.6, -0.15, 0.024);
  }, 0.02, 1.06);

  const shadow = new THREE.Mesh(SHADOW, shadowMat);
  shadow.scale.set(1.15, 1, 2.2);
  shadow.position.y = 0.035;
  group.add(shadow);
  return { group, body, frame, bumper, wheel, driver, occ, shadow };
}

export function makeTractor() {
  return meshOf('tractor', () => {
    const b = new Builder(0.05);
    const G = 0x2f9150, Y = 0xf2c230, DARK = 0x2b2b2e;
    b.box(G, [0.85, 0.62, 1.9], [0, 1.05, -0.55]);
    b.box(DARK, [0.7, 0.4, 0.06], [0, 1.05, -1.52]);
    b.box(G, [1.3, 0.3, 1.2], [0, 0.85, 0.6]);
    for (const sx of [1, -1]) {
      b.wheel(0.78, 0.36, [sx * 0.86, 0.78, 0.7], Y);
      b.wheel(0.4, 0.24, [sx * 0.66, 0.4, -1.15], Y);
      b.box(G, [0.42, 0.08, 1.3], [sx * 0.86, 1.62, 0.7]);
      b.box(DARK, [0.06, 1.3, 0.06], [sx * 0.6, 1.7, 0.15]);
      b.box(DARK, [0.06, 1.3, 0.06], [sx * 0.6, 1.7, 1.2]);
      b.sph(0xffe27a, 0.1, [sx * 0.3, 1.2, -1.52]);
    }
    b.box(Y, [1.4, 0.08, 1.3], [0, 2.38, 0.67]);
    b.cyl(DARK, 0.05, 0.8, [0.28, 1.7, -1.1]);
    b.box(0x6b4a2e, [0.5, 0.4, 0.4], [0, 1.2, 0.75]);
    // Seamus
    b.box(0x8c6b3f, [0.46, 0.5, 0.28], [0, 1.62, 0.6]);
    b.sph(0xf4cfa9, 0.17, [0, 2.02, 0.58]);
    b.cyl(0x4a4a3a, 0.2, 0.06, [0, 2.17, 0.58]);
    b.box(0x4a4a3a, [0.2, 0.03, 0.14], [0, 2.14, 0.4]);
    return b.build();
  });
}

export function makeHay() {
  const g = new THREE.Group();
  const body = meshOf('hay', () => {
    const b = new Builder(0.045);
    b.cyl(0xe6c35c, 0.7, 1.3, [0, 0.7, 0], [0, 0, HP]);
    b.cyl(0xb8923a, 0.705, 0.06, [0.3, 0.7, 0], [0, 0, HP], { t: 0 });
    b.cyl(0xb8923a, 0.705, 0.06, [-0.3, 0.7, 0], [0, 0, HP], { t: 0 });
    b.cyl(0xb8923a, 0.3, 1.31, [0, 0.7, 0], [0, 0, HP], { t: 0 });
    return b.build();
  });
  const sh = new THREE.Mesh(SHADOW, shadowMat);
  sh.scale.set(0.8, 1, 0.8);
  sh.position.y = 0.04;
  g.add(body, sh);
  g.userData = { body, shadow: sh };
  return g;
}

export function makePothole() {
  return meshOf('pothole', () => {
    const b = new Builder(0);
    b.cyl(0x6d6558, 1, 0.02, [0, 0.05, 0], null);
    b.cyl(0x3d362d, 0.78, 0.02, [0.05, 0.06, 0.02]);
    b.cyl(0x26211b, 0.45, 0.02, [0.12, 0.07, 0]);
    const g = b.build();
    g.scale(0.95, 1, 0.7);
    return g;
  });
}

export function makeCowpat() {
  return meshOf('cowpat', () => {
    const b = new Builder(0.03);
    b.sph(0x6b4a2a, [0.55, 0.07, 0.5], [0, 0.06, 0]);
    b.sph(0x7a5632, [0.33, 0.1, 0.3], [0.03, 0.12, 0.02]);
    b.sph(0x6b4a2a, [0.15, 0.1, 0.15], [0.05, 0.2, 0]);
    return b.build();
  });
}

export function makeVan() {
  const g = new THREE.Group();
  const body = meshOf('van', () => {
    const b = new Builder(0.05);
    const Y = 0xf5c518, DARK = 0x2b2b2e;
    b.box(Y, [1.9, 1.55, 3.0], [0, 1.25, 0.5]);
    b.add(tbox(1.9, 0.75, 1.3, 1, 0.55, 0.28), Y, [0, 1.6, -1.6]);
    b.box(Y, [1.9, 0.8, 1.3], [0, 0.85, -1.6]);
    b.box(0xbfe3f2, [1.6, 0.5, 0.05], [0, 1.62, -1.98], [-0.42, 0, 0], { t: 0.02 });
    b.box(0xc9ccd2, [1.96, 0.14, 0.1], [0, 0.5, -2.27]);
    for (const sx of [1, -1]) {
      b.wheel(0.4, 0.26, [sx * 0.9, 0.4, -1.5]);
      b.wheel(0.4, 0.26, [sx * 0.9, 0.4, 1.3]);
      b.sph(0xfff3b0, 0.12, [sx * 0.7, 0.85, -2.25]);
      for (let i = 0; i < 6; i++) b.box(i % 2 ? Y : DARK, [0.02, 0.2, 0.5], [sx * 0.955, 0.75, -0.75 + i * 0.5], null, { t: 0 });
    }
    b.box(DARK, [1.2, 0.08, 0.3], [0, 2.06, -0.6]);
    return b.build();
  });
  const beacon = new THREE.Mesh(SPH, new THREE.MeshBasicMaterial({ color: 0xff8a00 }));
  beacon.scale.setScalar(0.14);
  beacon.position.set(0, 2.2, -0.6);
  const tex = textTexture('EWE-TURN RESCUE', { w: 512, h: 96, bg: '#f5c518', border: 0 });
  for (const sx of [1, -1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.5), new THREE.MeshBasicMaterial({ map: tex }));
    p.position.set(sx * 0.962, 1.5, 0.5);
    p.rotation.y = sx * HP;
    g.add(p);
  }
  g.add(body, beacon);
  g.userData = { beacon };
  return g;
}

export function makeMechanic() {
  return meshOf('mech', () => {
    const b = new Builder(0.035);
    const O = 0x2f5fa8;
    b.box(O, [0.2, 0.8, 0.24], [0.13, 0.4, 0]);
    b.box(O, [0.2, 0.8, 0.24], [-0.13, 0.4, 0]);
    b.box(O, [0.52, 0.62, 0.3], [0, 1.1, 0]);
    b.sph(0xf4cfa9, 0.18, [0, 1.6, 0]);
    b.cyl(0xf28c28, 0.19, 0.08, [0, 1.76, 0]);
    b.box(0xf28c28, [0.24, 0.03, 0.16], [0, 1.73, -0.2]);
    b.box(0x4a3020, [0.2, 0.05, 0.04], [0, 1.53, -0.17], null, { t: 0 });
    b.eyes(0.065, 1.63, -0.165);
    b.box(O, [0.14, 0.5, 0.14], [0.34, 1.25, -0.15], [-0.9, 0, 0]);
    b.box(0x8a8a90, [0.06, 0.4, 0.06], [0.34, 1.55, -0.45], [-0.3, 0, 0]);
    b.box(0x55585e, [0.14, 0.14, 0.26], [0.34, 1.76, -0.5]);
    return b.build();
  });
}

// --- scenery ----------------------------------------------------------------
export function makeTree(v = 0) {
  if (v === 2)
    return meshOf('poplar', () => new Builder(0.07).cyl(0x7a5230, 0.16, 1.6, [0, 0.8, 0]).sph(0x5aa046, [0.95, 3.0, 0.95], [0, 4.2, 0]).build());
  if (v === 3)
    return meshOf('bush', () => new Builder(0.06).sph(0x5fa04a, [1.0, 0.7, 0.9], [0, 0.5, 0]).sph(0x6aad52, [0.7, 0.55, 0.7], [0.7, 0.4, 0.2]).build());
  const col = v === 0 ? 0x4c9a3f : 0x3f8a4a;
  return meshOf('tree' + v, () => {
    const b = new Builder(0.08);
    b.cyl(0x7a5230, 0.2, 2.2, [0, 1.1, 0]);
    b.sph(col, 1.7, [0, 3.5, 0]);
    b.sph(col, 1.15, [1.1, 3.0, 0.3]);
    b.sph(col, 1.25, [-0.95, 3.1, -0.4]);
    b.sph(col, 1.0, [0.2, 4.6, 0.2]);
    return b.build();
  });
}

export function makePole() {
  return meshOf('pole', () => new Builder(0.05).cyl(0x6b5a48, 0.09, 6.5, [0, 3.25, 0]).box(0x6b5a48, [1.5, 0.1, 0.1], [0, 6, 0]).sph(0xe8e2d0, 0.07, [0.6, 6.12, 0]).sph(0xe8e2d0, 0.07, [-0.6, 6.12, 0]).build());
}

export function makeCottage(v = 0) {
  return meshOf('cottage' + v, () => {
    const b = new Builder(0.08);
    b.box(0xf7f3e8, [5.2, 2.6, 4], [0, 1.3, 0]);
    b.add(tbox(5.7, 1.7, 4.6, 1, 0.03), v ? 0xcfae55 : 0xc8553a, [0, 3.45, 0]);
    b.box(0xf7f3e8, [0.6, 1.3, 0.6], [1.7, 4.0, 0]);
    b.box(v ? 0x3a6ea5 : 0x2f8f4e, [0.8, 1.6, 0.1], [0, 0.8, 2.02], null, { t: 0.04 });
    for (const sx of [1, -1]) b.box(0x7fb6d9, [0.8, 0.8, 0.1], [sx * 1.6, 1.5, 2.02], null, { t: 0.04 });
    return b.build();
  });
}

const signPosts = () =>
  cached('signposts', () => new Builder(0.04).cyl(0x8a8a90, 0.07, 3.6, [1.2, 1.8, -0.06]).cyl(0x8a8a90, 0.07, 3.6, [-1.2, 1.8, -0.06]).box(INK, [3.36, 1.86, 0.05], [0, 2.75, -0.03], null, { t: 0 }).build());
const signTex = new Map();
const BOARD = new THREE.PlaneGeometry(3.2, 1.7);
export function makeSign(text, i = 0) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(signPosts(), toonMat));
  if (!signTex.has(text)) {
    const bg = ['#f7d21e', '#f7f3e8', '#f7d21e', '#bfe3a0'][i % 4];
    signTex.set(text, new THREE.MeshBasicMaterial({ map: textTexture(text, { bg }) }));
  }
  const board = new THREE.Mesh(BOARD, signTex.get(text));
  board.position.set(0, 2.75, 0.005);
  g.add(board);
  return g;
}

export function makeCloud(v = 0) {
  return meshOf(
    'cloud' + v,
    () => {
      const b = new Builder(1.1);
      const W = 0xffffff;
      b.sph(W, [15, 5, 8], [0, 0, 0]);
      b.sph(W, [9, 4.5, 6], [11, -1, 2]);
      b.sph(W, [10, 4, 6], [-12, -1.2, -1]);
      b.sph(W, [8, 4.5, 6], [v ? -4 : 4, 3.2, 0]);
      return b.build();
    },
    flatMat
  );
}

export function makeSky() {
  const g = new THREE.SphereGeometry(900, 24, 12);
  const p = g.attributes.position, a = new Float32Array(p.count * 3);
  const top = new THREE.Color(0x6fc3ee), hor = new THREE.Color(0xdff2f8), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const k = Math.min(1, Math.max(0, p.getY(i) / 500));
    c.copy(hor).lerp(top, Math.pow(k, 0.6));
    a.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  m.renderOrder = -10;
  m.frustumCulled = false;
  return m;
}

export function makePuff(kind) {
  const col = { smoke: 0xf4f4f0, dark: 0x6f6f74, hay: 0xe6c35c, dust: 0xcfc4a8 }[kind];
  return meshOf('puff-' + kind, () => new Builder(0.07).add(new THREE.SphereGeometry(1, 8, 6), col).build());
}
