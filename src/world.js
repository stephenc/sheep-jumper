// The road and the countryside around it.
// Road space: s = metres along the road, l = metres right of the centre line.
import * as THREE from 'three';
import { terrainMat, makeTree, makePole, makeCottage, makeSign, makeSheep } from './models.js';
import { SIGNS } from './lines.js';

export const ROAD_HALF = 5, WALL_IN = 7.6, WALL_OUT = 8.1;
const CHUNK = 80, STEP = 4, SEG = CHUNK / STEP, NCHUNK = 8;

const ease = (s) => {
  const t = Math.min(1, Math.max(0, (s - 60) / 400));
  return t * t * (3 - 2 * t);
};
export const cx = (s) => ease(s) * (28 * Math.sin(s * 0.0075) + 13 * Math.sin(s * 0.019 + 1.3) + 5 * Math.sin(s * 0.041 + 4));
export const dcx = (s) => cx(s + 0.5) - cx(s - 0.5);
export const curvature = (s) => (dcx(s + 2) - dcx(s - 2)) / 4;
export const hgt = (s) => 5 * Math.sin(s * 0.012 + 0.5) + 2.5 * Math.sin(s * 0.031) + 0.6 * Math.sin(s * 0.07 + 2);
export const dh = (s) => hgt(s + 0.5) - hgt(s - 0.5);
export const roadYaw = (s) => -Math.atan(dcx(s));

export function roadPoint(s, l, out) {
  const d = dcx(s), n = Math.hypot(1, d);
  out.x = cx(s) + l / n;
  out.y = hgt(s);
  out.z = -s + (l * d) / n;
  return out;
}

const LIFT_D = [9.5, 22, 50, 110, 220];
function lift(a, s, side) {
  if (a <= 9.5) return 0;
  const k = (a - 9.5) / 210.5;
  const big = Math.pow(k, 1.25) * (30 + 20 * Math.sin(s * 0.006 + side * 1.7) + 9 * Math.sin(s * 0.017 + side * 4.1));
  const roll = Math.min(1, (a - 9.5) / 12) * 1.1 * Math.sin(s * 0.03 + a * 0.09 + side);
  return big + roll;
}
// height of the fields at x-offset d from the centre line (matches the mesh)
export function fieldLift(s, d) {
  const a = Math.abs(d), side = Math.sign(d);
  if (a <= 9.5) return 0;
  for (let i = 1; i < LIFT_D.length; i++) {
    if (a <= LIFT_D[i]) {
      const t = (a - LIFT_D[i - 1]) / (LIFT_D[i] - LIFT_D[i - 1]);
      return lift(LIFT_D[i - 1], s, side) * (1 - t) + lift(LIFT_D[i], s, side) * t;
    }
  }
  return lift(220, s, side);
}

// columns across the terrain strip: 'x' = plain x offset, 'n' = offset along the road normal
const COLS = [
  ['x', -220], ['x', -110], ['x', -50], ['x', -22], ['n', -9.5], ['n', -ROAD_HALF - 0.1], ['n', -ROAD_HALF], ['n', -0.14],
  ['n', 0.14], ['n', ROAD_HALF], ['n', ROAD_HALF + 0.1], ['n', 9.5], ['x', 22], ['x', 50], ['x', 110], ['x', 220],
];
const lin = (hex) => new THREE.Color(hex);
const FIELD = [0x9ccc5f, 0x86bb50, 0xb5d66a, 0xdccf6a, 0x7fb04a, 0xc8dc7a, 0x93c456].map(lin);
const ROAD = lin(0xcfc8b6), ROAD2 = lin(0xc7c0ae), DASH = lin(0xf7f2e2), VERGE = lin(0x8fc45a);
const INKC = lin(0x2a2520);
const STONE = lin(0xa39c8d), STONE_TOP = lin(0xcbc5b6), HEDGE = lin(0x3f8040), HEDGE_TOP = lin(0x4f9648);

function hash(a, b) {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function rng(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const _v = new THREE.Vector3();
function row(s) {
  const c = COLS.map(([t, d]) => {
    if (t === 'n') {
      roadPoint(s, d, _v);
      return [_v.x, _v.y, _v.z];
    }
    return [cx(s) + d, hgt(s) + lift(Math.abs(d), s, Math.sign(d)), -s];
  });
  const hedge = hash(Math.floor(s / 240), 7) < 0.45;
  const H = hedge ? 1.35 : 0.95;
  const walls = [-1, 1].map((side) => {
    const a = roadPoint(s, side * WALL_IN, _v), ai = [a.x, a.y - 0.3, a.z], at = [a.x, a.y + H, a.z];
    const b = roadPoint(s, side * WALL_OUT, _v), bo = [b.x, b.y - 0.3, b.z], bt = [b.x, b.y + H, b.z];
    return [ai, [a.x, a.y + H - 0.08, a.z], at, bt, [b.x, b.y + H - 0.08, b.z], bo];
  });
  return { c, walls, hedge };
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.chunks = [];
    const maxVerts = SEG * (15 + 10) * 6;
    for (let i = 0; i < NCHUNK; i++) {
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(maxVerts * 3), col = new Float32Array(maxVerts * 3);
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(maxVerts * 3), 3));
      const mesh = new THREE.Mesh(geo, terrainMat);
      mesh.frustumCulled = false;
      const props = new THREE.Group();
      scene.add(mesh, props);
      this.chunks.push({ index: null, geo, pos, col, mesh, props });
    }
  }

  update(carS) {
    const first = Math.floor(carS / CHUNK) - 1;
    for (let k = 0; k < NCHUNK; k++) {
      const idx = first + k;
      const ch = this.chunks[((idx % NCHUNK) + NCHUNK) % NCHUNK];
      if (ch.index !== idx) this.build(ch, idx);
    }
  }

  build(ch, index) {
    ch.index = index;
    const s0 = index * CHUNK, P = ch.pos, C = ch.col;
    let n = 0;
    const tri = (a, b, c, col) => {
      for (const v of [a, b, c]) {
        P[n * 3] = v[0]; P[n * 3 + 1] = v[1]; P[n * 3 + 2] = v[2];
        C[n * 3] = col.r; C[n * 3 + 1] = col.g; C[n * 3 + 2] = col.b;
        n++;
      }
    };
    const quad = (a, b, c, d, col) => {
      tri(a, b, c, col);
      tri(a, c, d, col);
    };
    let prev = row(s0);
    for (let i = 1; i <= SEG; i++) {
      const s = s0 + i * STEP, cur = row(s), gi = Math.round(s / STEP);
      for (let j = 0; j < 15; j++) {
        let col;
        if (j === 6 || j === 8) col = gi % 2 ? ROAD : ROAD2;
        else if (j === 7) col = gi % 3 === 0 ? DASH : gi % 2 ? ROAD : ROAD2;
        else if (j === 5 || j === 9) col = INKC;
        else if (j === 4 || j === 10) col = VERGE;
        else {
          const band = j < 4 ? j : j - 7; // 0..3 left, 4..7 right
          const len = [150, 110, 64, 40, 40, 64, 110, 150][band];
          col = FIELD[Math.floor(hash(band + 1, Math.floor((s - 2 + band * 23) / len)) * FIELD.length)];
        }
        quad(prev.c[j], prev.c[j + 1], cur.c[j + 1], cur.c[j], col);
      }
      for (let w = 0; w < 2; w++) {
        const a = prev.walls[w], b = cur.walls[w];
        const side = prev.hedge ? HEDGE : STONE, top = prev.hedge ? HEDGE_TOP : STONE_TOP;
        quad(a[0], a[1], b[1], b[0], side);
        quad(a[1], a[2], b[2], b[1], INKC);
        quad(a[2], a[3], b[3], b[2], top);
        quad(a[3], a[4], b[4], b[3], INKC);
        quad(a[4], a[5], b[5], b[4], side);
      }
      prev = cur;
    }
    ch.geo.setDrawRange(0, n);
    ch.geo.attributes.position.needsUpdate = true;
    ch.geo.attributes.color.needsUpdate = true;
    ch.geo.computeVertexNormals();
    this.populate(ch, index);
  }

  populate(ch, index) {
    const g = ch.props, s0 = index * CHUNK, r = rng(index * 7919 + 13);
    g.clear();
    const put = (obj, s, d, yaw = r() * 6.28, sc = 1) => {
      obj.position.set(cx(s) + d, hgt(s) + fieldLift(s, d) - 0.05, -s);
      obj.rotation.y = yaw;
      obj.scale.setScalar(sc);
      g.add(obj);
    };
    const side = () => (r() < 0.5 ? -1 : 1);
    const nTrees = 5 + Math.floor(r() * 6);
    for (let i = 0; i < nTrees; i++) {
      const v = r() < 0.5 ? 0 : r() < 0.5 ? 1 : r() < 0.5 ? 2 : 3;
      put(makeTree(v), s0 + r() * CHUNK, side() * (14 + r() * r() * 60), undefined, 0.8 + r() * 0.6);
    }
    for (let i = 0; i < 2; i++) put(makeTree(3), s0 + r() * CHUNK, side() * (12.5 + r() * 3), undefined, 0.7 + r() * 0.5);
    const nSheep = Math.floor(r() * 4);
    for (let i = 0; i < nSheep; i++) {
      const sh = makeSheep(r() < 0.08 ? 'black' : 'white');
      sh.userData.shadow.visible = false;
      put(sh, s0 + r() * CHUNK, side() * (13 + r() * 30));
    }
    for (let i = 0; i < 2; i++) put(makePole(), s0 + i * 40 + 10, -11.8, roadYaw(s0 + i * 40 + 10));
    if (index > 0 && r() < 0.22) {
      const sd = side(), s = s0 + 20 + r() * 40;
      put(makeCottage(r() < 0.5 ? 0 : 1), s, sd * (22 + r() * 10), roadYaw(s) - sd * Math.PI / 2 + (r() - 0.5) * 0.4);
    }
    if (index >= 1 && index % 2 === 1) {
      const k = (index - 1) >> 1, s = s0 + 40, sd = k % 2 ? -1 : 1;
      put(makeSign(SIGNS[k % SIGNS.length], k), s, sd * 12.2, roadYaw(s) - sd * 0.35);
    }
  }
}
