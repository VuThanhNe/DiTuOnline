// Dựng thế giới 3D: texture thủ tục, tường/đồ đạc/trang trí (gộp mesh theo vật liệu cho nhẹ), nhân vật, nhãn chữ.
import * as THREE from 'three';
import { WALLS, PROPS, ZONES, STATIONS, TOWERS, WORLD, GATES, KHOS, DEALER, zoneAt } from '/shared/map.js';

// ===================== Nhãn chữ (độ phân giải kép cho nét) =====================
const TEXT_SCALE = 2;
const scratch = document.createElement('canvas').getContext('2d');
export function makeSprite(scaleK) {
  const cv = document.createElement('canvas');
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sp.renderOrder = 10;
  sp.userData = { cv, tex, scaleK };
  return sp;
}
export function drawText(sp, lines, { font = 'bold 26px system-ui, sans-serif', fg = '#fff', bg = 'rgba(0,0,0,.55)', padX = 14, padY = 8, radius = 10, border = null } = {}) {
  const { cv, tex, scaleK } = sp.userData;
  scratch.font = font;
  const lh = parseInt(font.match(/(\d+)px/)[1], 10) + 6;
  const w = Math.ceil(Math.max(...lines.map((l) => scratch.measureText(l).width)) + padX * 2);
  const h = lines.length * lh + padY * 2;
  cv.width = w * TEXT_SCALE; cv.height = h * TEXT_SCALE;
  const ctx = cv.getContext('2d');
  ctx.scale(TEXT_SCALE, TEXT_SCALE);
  ctx.font = font;
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(border ? 1.5 : 0, border ? 1.5 : 0, w - (border ? 3 : 0), h - (border ? 3 : 0), radius);
  ctx.fill();
  if (border) { ctx.strokeStyle = border; ctx.lineWidth = 3; ctx.stroke(); }
  ctx.fillStyle = fg;
  ctx.textBaseline = 'middle';
  lines.forEach((l, i) => ctx.fillText(l, padX, padY + lh * i + lh / 2));
  tex.needsUpdate = true;
  sp.scale.set((w / 100) * scaleK, (h / 100) * scaleK, 1);
}
export function wrap(text, max = 22) {
  const words = text.split(' '), lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > max) { if (cur) lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
}
export function emojiSprite(ch) {
  const sp = makeSprite(1);
  drawText(sp, [ch], { font: '40px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif', bg: 'rgba(0,0,0,.35)', padX: 8, padY: 4, radius: 18 });
  return sp;
}

// ===================== Texture thủ tục =====================
let ANISO = 4;
function ctex(w, h, draw) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = ANISO;
  return t;
}
function speckle(g, w, h, n, a = 0.12) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = Math.random() < 0.5 ? '#fff' : '#000';
    g.globalAlpha = Math.random() * a;
    g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  g.globalAlpha = 1;
}
function makeTextures() {
  const T = {};
  T.concrete = ctex(256, 256, (g, w, h) => {
    g.fillStyle = '#d6d6d2'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 2400, 0.18);
    g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = 1.5;
    for (let i = 0; i < 5; i++) { g.beginPath(); let x = Math.random() * w, y = Math.random() * h; g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (Math.random() - 0.5) * 40; y += (Math.random() - 0.5) * 40; g.lineTo(x, y); } g.stroke(); }
    g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 2; g.strokeRect(0, 0, w, h);
  });
  T.tiles = ctex(256, 256, (g, w, h) => {
    g.fillStyle = '#f1f1ee'; g.fillRect(0, 0, w, h);
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { g.fillStyle = (i + j) % 2 ? '#e6e6e2' : '#f4f4f1'; g.fillRect(i * 64 + 2, j * 64 + 2, 60, 60); }
    g.strokeStyle = 'rgba(60,60,60,.55)'; g.lineWidth = 3;
    for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, h); g.moveTo(0, i * 64); g.lineTo(w, i * 64); g.stroke(); }
    speckle(g, w, h, 1500, 0.14);
  });
  T.checker = ctex(256, 256, (g, w, h) => {
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { g.fillStyle = (i + j) % 2 ? '#c9c4b8' : '#f4efe4'; g.fillRect(i * 64, j * 64, 64, 64); }
    speckle(g, w, h, 1800, 0.12);
    g.strokeStyle = 'rgba(0,0,0,.15)'; g.lineWidth = 1;
    for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, h); g.moveTo(0, i * 64); g.lineTo(w, i * 64); g.stroke(); }
  });
  T.planks = ctex(256, 256, (g, w, h) => {
    const n = 6, ph = h / n;
    for (let i = 0; i < n; i++) {
      const l = 205 + Math.random() * 40;
      g.fillStyle = `rgb(${l},${l - 22},${l - 55})`; g.fillRect(0, i * ph, w, ph);
      g.strokeStyle = 'rgba(70,40,10,.18)'; g.lineWidth = 1;
      for (let k = 0; k < 7; k++) { const y = i * ph + 3 + Math.random() * (ph - 6); g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + 3, w * 0.7, y - 3, w, y); g.stroke(); }
      g.strokeStyle = 'rgba(40,20,5,.5)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, i * ph); g.lineTo(w, i * ph); g.stroke();
      const jx = Math.random() * w; g.beginPath(); g.moveTo(jx, i * ph); g.lineTo(jx, (i + 1) * ph); g.stroke();
    }
  });
  T.asphalt = ctex(256, 256, (g, w, h) => {
    g.fillStyle = '#c9c9c9'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 5000, 0.3);
  });
  T.stone = ctex(256, 256, (g, w, h) => {
    g.fillStyle = '#d9d9d9'; g.fillRect(0, 0, w, h);
    const rh = 32;
    for (let r = 0; r < h / rh; r++) {
      let x = (r % 2) * 40 - 40;
      while (x < w) {
        const bw = 60 + Math.random() * 50, l = 190 + Math.random() * 50;
        g.fillStyle = `rgb(${l},${l},${l})`; g.fillRect(x + 2, r * rh + 2, bw - 4, rh - 4);
        x += bw;
      }
    }
    speckle(g, w, h, 2500, 0.2);
  });
  T.plaster = ctex(256, 256, (g, w, h) => {
    g.fillStyle = '#f2efe8'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 1800, 0.1);
    for (let i = 0; i < 14; i++) { g.fillStyle = 'rgba(80,70,50,.05)'; g.fillRect(Math.random() * w, 0, 2 + Math.random() * 6, h); }
  });
  T.grass = ctex(256, 256, (g, w, h) => {
    g.fillStyle = '#7c9a64'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 3500; i++) { const l = Math.random(); g.fillStyle = `rgba(${40 + l * 60},${90 + l * 80},${30 + l * 40},.5)`; g.fillRect(Math.random() * w, Math.random() * h, 2, 3); }
  });
  T.books = ctex(256, 128, (g, w, h) => {
    g.fillStyle = '#3a2412'; g.fillRect(0, 0, w, h);
    const rows = 3, rh = h / rows;
    const cols = ['#a93226', '#2e86c1', '#28b463', '#f1c40f', '#8e44ad', '#d35400', '#ecf0f1', '#16a085'];
    for (let r = 0; r < rows; r++) {
      let x = 2;
      while (x < w - 6) {
        const bw = 7 + Math.random() * 9, bh = rh - 8 - Math.random() * 10;
        g.fillStyle = cols[Math.floor(Math.random() * cols.length)];
        g.fillRect(x, r * rh + rh - 3 - bh, bw, bh);
        g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x + bw - 2, r * rh + rh - 3 - bh, 2, bh);
        x += bw + 1;
      }
      g.fillStyle = '#5a3a1e'; g.fillRect(0, r * rh + rh - 3, w, 3);
    }
  });
  T.bins = ctex(256, 128, (g, w, h) => {
    g.fillStyle = '#4a4f57'; g.fillRect(0, 0, w, h);
    const cols = ['#e67e22', '#3498db', '#2ecc71', '#e74c3c', '#f1c40f'];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) {
      g.fillStyle = cols[(r * 3 + c) % cols.length]; g.fillRect(8 + c * 40, 8 + r * 40, 32, 28);
      g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(8 + c * 40, 30 + r * 40, 32, 6);
    }
  });
  T.suit = ctex(64, 64, (g, w, h) => {
    g.fillStyle = '#f08a3c'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1a1a1a'; for (let y = 6; y < h; y += 16) g.fillRect(0, y, w, 5);
  });
  T.awning = ctex(128, 64, (g, w, h) => {
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#f4f4f4' : '#d63031'; g.fillRect((i * w) / 8, 0, w / 8, h); }
  });
  T.metal = ctex(64, 64, (g, w, h) => {
    g.fillStyle = '#c9ccd1'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 500, 0.2);
  });
  return T;
}
// Vạch kẻ sân bóng rổ vẽ riêng (không lặp)
function courtTexture() {
  const S = 20, w = 26 * S, h = 20 * S;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, w, h);
  g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 5;
  g.strokeRect(24, 24, w - 48, h - 48);
  g.beginPath(); g.moveTo(w / 2, 24); g.lineTo(w / 2, h - 24); g.stroke();
  g.beginPath(); g.arc(w / 2, h / 2, 62, 0, Math.PI * 2); g.stroke();
  g.strokeRect(w - 24 - 120, h / 2 - 80, 120, 160);
  g.beginPath(); g.arc(w - 24 - 120, h / 2, 60, -Math.PI / 2, Math.PI / 2, true); g.stroke();
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = ANISO;
  return t;
}

// ===================== Gộp mesh tĩnh =====================
const batch = new Map();
const TMP_M = new THREE.Matrix4(), TMP_Q = new THREE.Quaternion(), TMP_V = new THREE.Vector3(), TMP_S = new THREE.Vector3(1, 1, 1), TMP_E = new THREE.Euler();
function put(geo, material, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0 } = {}) {
  TMP_E.set(rx, ry, rz, 'YXZ');
  TMP_Q.setFromEuler(TMP_E);
  TMP_M.compose(TMP_V.set(x, y, z), TMP_Q, TMP_S);
  geo.applyMatrix4(TMP_M);
  if (!batch.has(material)) batch.set(material, []);
  batch.get(material).push(geo);
}
function uvScale(geo, sx, sy) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * sx, uv.getY(i) * sy);
}
// Hộp có UV tỉ lệ theo kích thước (texture không bị kéo giãn)
function boxGeo(w, h, d, tile) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (tile) {
    const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    const uv = g.attributes.uv;
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, (uv.getX(i) * dims[f][0]) / tile, (uv.getY(i) * dims[f][1]) / tile);
    }
  }
  return g;
}
function mergeGeos(list) {
  let vc = 0, ic = 0;
  for (const g of list) { vc += g.attributes.position.count; ic += g.index.count; }
  const pos = new Float32Array(vc * 3), nor = new Float32Array(vc * 3), uv = new Float32Array(vc * 2), idx = new Uint32Array(ic);
  let vo = 0, io = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    uv.set(g.attributes.uv.array, vo * 2);
    const gi = g.index.array;
    for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + vo;
    vo += g.attributes.position.count; io += gi.length;
    g.dispose();
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  m.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  m.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  m.setIndex(new THREE.BufferAttribute(idx, 1));
  return m;
}

// ===================== Thế giới =====================
const matCache = new Map();
export function mat(color, opts = {}) {
  const key = `${color}|${opts.map ? opts.map.uuid : ''}|${opts.rough ?? ''}|${opts.metal ?? ''}|${opts.emissive ?? ''}|${opts.transparent ?? ''}|${opts.opacity ?? ''}`;
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshStandardMaterial({
      color, map: opts.map || null, roughness: opts.rough ?? 0.85, metalness: opts.metal ?? 0.04,
      emissive: opts.emissive ?? 0x000000, transparent: !!opts.transparent, opacity: opts.opacity ?? 1,
    }));
  }
  return matCache.get(key);
}

export function buildWorld(scene, renderer, isTouch) {
  ANISO = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const T = makeTextures();
  const handles = { rings: [], gates: [], digHole: null, lampMat: null, lamps: [], windowMat: null };

  // ---- hàm tiện ích dựng khối ----
  const B = (w, h, d, x, y, z, m, o = {}) => put(boxGeo(w, h, d, o.tile), m, { x, y, z, ry: o.ry || 0, rx: o.rx || 0, rz: o.rz || 0 });
  const Bx = (x1, z1, x2, z2, y1, y2, m, tile) => B(x2 - x1, y2 - y1, z2 - z1, (x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2, m, { tile }); // theo toạ độ góc
  const Cyl = (r, h, x, y, z, m, seg = 10, o = {}) => put(new THREE.CylinderGeometry(r, r, h, seg), m, { x, y, z, rx: o.rx || 0, rz: o.rz || 0, ry: o.ry || 0 });
  const Sph = (r, x, y, z, m) => put(new THREE.SphereGeometry(r, 12, 10), m, { x, y, z });
  const noCast = new Set(); // sàn phẳng: chỉ nhận bóng, không đổ bóng
  const floorPlane = (x1, z1, x2, z2, y, m, tile) => {
    noCast.add(m);
    const g = new THREE.PlaneGeometry(x2 - x1, z2 - z1);
    if (tile) uvScale(g, (x2 - x1) / tile, (z2 - z1) / tile);
    g.rotateX(-Math.PI / 2);
    put(g, m, { x: (x1 + x2) / 2, y, z: (z1 + z2) / 2 });
  };

  // ---- đất ----
  const outside = new THREE.PlaneGeometry(600, 600); uvScale(outside, 150, 150); outside.rotateX(-Math.PI / 2);
  const grassMat = mat(0x8fb070, { map: T.grass });
  noCast.add(grassMat);
  put(outside, grassMat, { y: -0.06 });
  floorPlane(WORLD.minX, WORLD.minZ, WORLD.maxX, WORLD.maxZ, 0, mat(0x9a9c96, { map: T.concrete }), 5);
  // đường đất bao quanh ngoài tường
  floorPlane(WORLD.minX - 8, WORLD.minZ - 6, WORLD.maxX + 8, WORLD.maxZ + 6, -0.03, mat(0x7a7468, { map: T.concrete }), 6);

  // ---- sàn các khu vực ----
  const floorMat = {
    cell: mat(ZONES[0].color, { map: T.tiles }),
    canteen: mat(0xd8cdb4, { map: T.checker }),
    workshop: mat(0x8c7b6a, { map: T.concrete }),
    library: mat(0xb88a55, { map: T.planks }),
    office: mat(0x6f9c7a, { map: T.tiles }),
    solitary: mat(0x3a3a40, { map: T.concrete }),
    yard: mat(0xb9ab85, { map: T.asphalt }),
    infirmary: mat(0xdde9e6, { map: T.tiles }),
    laundry: mat(0xa9bfcf, { map: T.tiles }),
    garden: mat(0x8a6a45, { map: T.grass }),
    rec: mat(0xa88bc4, { map: T.planks }),
    gym: mat(0x4a4f5c, { map: T.asphalt }),
    shower: mat(0x9fd6e0, { map: T.tiles }),
  };
  for (const z of ZONES) floorPlane(z.x1, z.z1, z.x2, z.z2, 0.03, floorMat[z.id], z.id === 'yard' ? 3 : 4);
  // thảm / vạch kẻ cho các khu mới
  floorPlane(46.5, 6.4, 57.5, 27.6, 0.045, mat(0x7a5a38, { map: T.concrete }), 3); // lối đất giữa vườn
  floorPlane(-35, 33.5, -19, 43.5, 0.05, mat(0x7a4f9a), 0); // thảm phòng giải trí
  floorPlane(-10, 38, 10, 42, 0.05, mat(0xc0392b), 0); // thảm cao su phòng gym
  floorPlane(50, -12.8, 54, -9.2, 0.05, mat(0x3d4650)); floorPlane(50, -13.6, 54, -12.4, 0.05, mat(0x3d4650));
  floorPlane(-29.4, 30.4, -24.6, 31.6, 0.05, mat(0x3d4650)); floorPlane(-2.4, 30.4, 2.4, 31.6, 0.05, mat(0x3d4650)); floorPlane(23.6, 30.4, 28.4, 31.6, 0.05, mat(0x3d4650));
  // vạch an toàn trong xưởng
  const yellow = mat(0xf1c40f, { rough: 0.7 });
  for (const zz of [10, 16.5, 24]) floorPlane(16, zz - 0.07, 36, zz + 0.07, 0.045, yellow);
  // sân bóng rổ
  const court = new THREE.Mesh(new THREE.PlaneGeometry(26, 20), new THREE.MeshBasicMaterial({ map: courtTexture(), transparent: true, depthWrite: false }));
  court.rotation.x = -Math.PI / 2; court.position.set(-1, 0.05, 0);
  scene.add(court);
  // thảm đỏ thư viện + thảm cửa
  floorPlane(-31, 15.5, -23, 21, 0.05, mat(0x8e2b2b), 0);
  floorPlane(-29.4, -14.4, -24.6, -12.4, 0.05, mat(0x3d4650));
  floorPlane(24.2, -14.4, 27.8, -12.4, 0.05, mat(0x3d4650));

  // ---- tường ----
  const wallOuter = mat(0x8a8f98, { map: T.stone, rough: 0.95 });
  const wallInner = mat(0xe3ddcd, { map: T.plaster, rough: 0.95 });
  const trimDark = mat(0x4d4a45), capLight = mat(0xb9b2a3), capDark = mat(0x3f4349);
  for (const w of WALLS) {
    const tall = w.h > 3;
    const cx = (w.x1 + w.x2) / 2, cz = (w.z1 + w.z2) / 2, ww = w.x2 - w.x1, dd = w.z2 - w.z1;
    B(ww, w.h, dd, cx, w.h / 2, cz, tall ? wallOuter : wallInner, { tile: tall ? 2.5 : 3 });
    if (tall) B(ww + 0.14, 0.2, dd + 0.14, cx, w.h + 0.1, cz, capDark);
    else {
      B(ww + 0.04, 0.16, dd + 0.04, cx, 0.08, cz, trimDark); // chân tường
      B(ww + 0.08, 0.08, dd + 0.08, cx, w.h + 0.04, cz, capLight); // mũ tường
    }
  }
  // khung cửa (cột hai bên)
  const post = mat(0x555b63, { metal: 0.3 });
  for (const [x, z, h] of [[-29, -13, 2.2], [-25, -13, 2.2], [24, -13, 2.2], [28, -13, 2.2], [24, 8, 2.2], [28, 8, 2.2], [-29, 8, 2.2], [-25, 8, 2.2], [-2, -17, 2.2], [2, -17, 2.2],
    [50, -13, 2.2], [54, -13, 2.2], [50, -9, 2.2], [54, -9, 2.2], [-29, 31, 2.2], [-25, 31, 2.2], [-2, 31, 2.2], [2, 31, 2.2], [24, 31, 2.2], [28, 31, 2.2]]) B(0.34, h, 0.8, x, h / 2, z, post);

  // ---- đồ đạc ----
  const woodD = mat(0x7a5230, { map: T.planks }), woodL = mat(0xb98b58, { map: T.planks }), metal = mat(0xaeb2b8, { map: T.metal, metal: 0.5, rough: 0.5 });
  const dark = mat(0x2d2f33), steel = mat(0x8e9299, { metal: 0.6, rough: 0.4 });
  const tableLegs = (x1, z1, x2, z2, h, m) => { for (const [lx, lz] of [[x1 + 0.12, z1 + 0.12], [x2 - 0.12, z1 + 0.12], [x1 + 0.12, z2 - 0.12], [x2 - 0.12, z2 - 0.12]]) B(0.1, h, 0.1, lx, h / 2, lz, m); };
  const tray = (x, z, y) => { B(0.7, 0.04, 0.45, x, y + 0.02, z, steel); B(0.22, 0.05, 0.22, x - 0.15, y + 0.06, z, mat(0xe67e22)); B(0.2, 0.05, 0.2, x + 0.15, y + 0.06, z, mat(0x27ae60)); Cyl(0.06, 0.1, x + 0.28, y + 0.09, z + 0.1, mat(0xecf0f1), 8); };
  for (const b of PROPS) {
    const cx = (b.x1 + b.x2) / 2, cz = (b.z1 + b.z2) / 2, w = b.x2 - b.x1, d = b.z2 - b.z1, zn = zoneAt(cx, cz);
    if (b.kind === 'stall') {
      Bx(b.x1, b.z1, b.x2, b.z2, 0, b.h, woodD, 1.5);
      B(w + 0.3, 0.08, d + 0.3, cx, b.h + 0.04, cz, woodL, { tile: 1.5 });
      continue;
    }
    // ---- sân thể thao: khung thành, tường gạch, ghế nghỉ ----
    if (b.kind === 'goal') {
      const wh = mat(0xf4f4f4);
      B(0.12, 1.9, 0.12, cx, 0.95, b.z1, wh); B(0.12, 1.9, 0.12, cx, 0.95, b.z2, wh); B(0.12, 0.12, d, cx, 1.9, cz, wh);
      B(0.04, 1.9, d, cx - 0.5, 0.95, cz, mat(0xffffff, { transparent: true, opacity: 0.25 })); B(0.9, 0.04, d, cx - 0.2, 1.9, cz, mat(0xffffff, { transparent: true, opacity: 0.25 }));
      continue;
    }
    if (b.kind === 'bricks') {
      const cols = [0xc0392b, 0xd35400, 0xa93226];
      for (let r = 0; r < 5; r++) for (let q = 0; q < 4; q++) B(0.52, 0.25, 0.4, b.x1 + 0.3 + q * 0.54 + (r % 2) * 0.25 - 0.1, 0.14 + r * 0.26, cz, mat(cols[(r + q) % 3]));
      continue;
    }
    if (b.kind === 'benchy') {
      Bx(b.x1, b.z1, b.x2, b.z2, 0.3, 0.45, woodL, 1);
      for (const [lx, lz] of [[b.x1 + 0.15, cz], [b.x2 - 0.15, cz]]) B(0.12, 0.3, d - 0.1, lx, 0.15, lz, dark);
      continue;
    }
    // ---- đồ đạc khu mới ----
    if (b.kind === 'fencelow') { // hàng rào gỗ thấp quanh vườn
      const horiz = w > d, len = horiz ? w : d;
      Bx(b.x1, b.z1, b.x2, b.z2, 0.55, 0.8, woodL, 1);
      Bx(b.x1, b.z1, b.x2, b.z2, 0.15, 0.3, woodL, 1);
      for (let s = 0; s <= len; s += 1.6) { const px = horiz ? b.x1 + s : cx, pz = horiz ? cz : b.z1 + s; B(0.16, 1.0, 0.16, px, 0.5, pz, woodD); }
      continue;
    }
    if (b.kind === 'plot') { // luống rau
      Bx(b.x1, b.z1, b.x2, b.z2, 0, 0.3, mat(0x5a3d26, { map: T.concrete }), 2);
      const cabbage = [mat(0x4caf50), mat(0x66bb6a), mat(0x8bc34a)];
      for (let rx = b.x1 + 0.7; rx < b.x2 - 0.3; rx += 0.9) for (let rz = b.z1 + 0.7; rz < b.z2 - 0.3; rz += 1.1) Sph(0.26 + ((rx * 7 + rz * 3) % 1) * 0.08, rx, 0.45, rz, cabbage[Math.abs(Math.round(rx + rz)) % 3]);
      continue;
    }
    if (b.kind === 'machine') { // máy giặt
      Bx(b.x1, b.z1, b.x2, b.z2, 0, b.h, mat(0xf1f2f6, { rough: 0.4 }));
      B(w - 0.2, 0.18, 0.06, cx, b.h - 0.14, b.z1 - 0.03, mat(0x3a86ff));
      Cyl(0.4, 0.06, cx, 0.62, b.z1 - 0.04, mat(0xb8e6ff, { transparent: true, opacity: 0.55, rough: 0.1 }), 18, { rx: Math.PI / 2 });
      Cyl(0.46, 0.05, cx, 0.62, b.z1 - 0.02, steel, 18, { rx: Math.PI / 2 });
      continue;
    }
    if (b.kind === 'pingpong') { // bàn bóng bàn
      Bx(b.x1, b.z1, b.x2, b.z2, b.h - 0.08, b.h, mat(0x1e8e5a));
      B(w, 0.012, 0.05, cx, b.h + 0.006, cz, mat(0xffffff)); B(0.05, 0.012, d, cx, b.h + 0.006, cz, mat(0xffffff));
      B(0.03, 0.18, d + 0.1, cx, b.h + 0.1, cz, mat(0xf4f4f4)); // lưới
      tableLegs(b.x1, b.z1, b.x2, b.z2, b.h - 0.08, dark);
      continue;
    }
    if (b.kind === 'sofa') {
      Bx(b.x1, b.z1 + 0.2, b.x2, b.z2, 0, 0.45, mat(0x6c3483));
      Bx(b.x1, b.z1, b.x2, b.z1 + 0.5, 0.45, 1.1, mat(0x7d3c98));
      Bx(b.x1, b.z1, b.x1 + 0.35, b.z2, 0.45, 0.8, mat(0x7d3c98)); Bx(b.x2 - 0.35, b.z1, b.x2, b.z2, 0.45, 0.8, mat(0x7d3c98));
      continue;
    }
    if (b.kind === 'tv') {
      Bx(b.x1, b.z1, b.x2, b.z2, 0.9, 1.8, dark);
      B(w - 0.2, 0.9 - 0.1, 0.04, cx, 1.35, b.z1 - 0.02, mat(0x223a5a, { emissive: 0x1d4f8a }));
      B(1.8, 0.9, 0.7, cx, 0.45, cz - 0.05, mat(0x5a3a1e, { map: T.planks }));
      continue;
    }
    if (b.kind === 'bench') { // ghế tập tạ / ghế dài
      Bx(b.x1, b.z1, b.x2, b.z2, 0.25, 0.4, zn === 'shower' ? woodL : mat(0xa83232));
      for (const [lx, lz] of [[b.x1 + 0.12, cz], [b.x2 - 0.12, cz]]) B(0.1, 0.25, d - 0.1, lx, 0.125, lz, dark);
      if (zn === 'gym') { Cyl(0.04, w + 0.9, cx, 0.95, b.z1 + 0.15, steel, 8, { rz: Math.PI / 2 }); Cyl(0.2, 0.06, b.x1 - 0.3, 0.95, b.z1 + 0.15, dark, 12, { rz: Math.PI / 2 }); Cyl(0.2, 0.06, b.x2 + 0.3, 0.95, b.z1 + 0.15, dark, 12, { rz: Math.PI / 2 }); }
      continue;
    }
    if (b.kind === 'treadmill') {
      Bx(b.x1, b.z1, b.x2, b.z2, 0, 0.18, dark);
      Bx(b.x1 + 0.1, b.z1 + 0.1, b.x2 - 0.1, b.z2 - 0.1, 0.18, 0.24, mat(0x2a2c31));
      B(0.08, 1.1, 0.08, b.x1 + 0.1, 0.7, b.z1 + 0.15, steel); B(0.08, 1.1, 0.08, b.x2 - 0.1, 0.7, b.z1 + 0.15, steel);
      B(w, 0.22, 0.14, cx, 1.2, b.z1 + 0.15, mat(0x20242a, { emissive: 0x0a3a1a }));
      continue;
    }
    if (b.kind === 'rack') { // giá tạ
      Bx(b.x1, b.z1, b.x2, b.z2, 0, 0.9, dark);
      for (let x = b.x1 + 0.4; x < b.x2 - 0.2; x += 0.7) { Cyl(0.16, 0.12, x, 1.05, cz, steel, 10, { rx: Math.PI / 2 }); Cyl(0.1, 0.1, x, 1.35, cz, mat(0xc0392b), 10, { rx: Math.PI / 2 }); }
      continue;
    }
    if (b.kind === 'partition') { // vách buồng tắm
      Bx(b.x1, b.z1, b.x2, b.z2, 0, b.h, mat(0xdcecf2, { map: T.tiles }), 1.5);
      continue;
    }
    if (zn === 'infirmary') {
      if (b.h > 1.5) { // tủ thuốc
        Bx(b.x1, b.z1, b.x2, b.z2, 0, b.h, mat(0xf4f6f8, { metal: 0.2 }), 1.5);
        B(w - 0.2, b.h - 0.5, 0.04, cx, b.h / 2 + 0.1, b.z2 + 0.021, mat(0xb8e6ff, { transparent: true, opacity: 0.4, rough: 0.1 }));
        for (let k = 0; k < 4; k++) B(w - 0.3, 0.03, 0.4, cx, 0.5 + k * 0.4, cz, steel);
      } else if (b.h < 0.6) { // giường bệnh
        B(w, 0.12, d, cx, 0.3, cz, mat(0xdfe6e9, { metal: 0.3 }));
        for (const [lx, lz] of [[b.x1 + 0.08, b.z1 + 0.08], [b.x2 - 0.08, b.z1 + 0.08], [b.x1 + 0.08, b.z2 - 0.08], [b.x2 - 0.08, b.z2 - 0.08]]) B(0.08, 0.3, 0.08, lx, 0.15, lz, steel);
        B(w - 0.1, 0.16, d - 0.1, cx, 0.46, cz, mat(0xffffff));
        B(w - 0.5, 0.1, 0.55, cx, 0.6, b.z1 + 0.4, mat(0xdff3ff));
        B(w - 0.1, 0.1, d * 0.5, cx, 0.58, b.z2 - d * 0.27, mat(0x74b9ff));
      } else { // bàn khám
        Bx(b.x1, b.z1, b.x2, b.z2, b.h - 0.08, b.h, mat(0xf1f2f6));
        tableLegs(b.x1, b.z1, b.x2, b.z2, b.h - 0.08, steel);
        B(0.35, 0.3, 0.3, cx - 0.5, b.h + 0.15, cz, mat(0xff7675)); B(0.5, 0.04, 0.4, cx + 0.5, b.h + 0.02, cz, mat(0xffffff));
      }
      continue;
    }
    if (zn === 'laundry' || zn === 'rec') { // bàn gấp đồ / bàn chơi bài
      Bx(b.x1, b.z1, b.x2, b.z2, b.h - 0.1, b.h, zn === 'rec' ? mat(0x1e8e5a) : woodL, 1.5);
      tableLegs(b.x1, b.z1, b.x2, b.z2, b.h - 0.1, dark);
      if (zn === 'laundry') { B(0.7, 0.14, 0.5, b.x1 + 0.6, b.h + 0.07, cz, mat(0xffffff)); B(0.6, 0.12, 0.45, b.x2 - 0.7, b.h + 0.06, cz, mat(0x74b9ff)); }
      else for (let k = 0; k < 4; k++) B(0.16, 0.012, 0.23, cx - 0.6 + k * 0.4, b.h + 0.01, cz + (k % 2 ? 0.3 : -0.3), mat(k % 2 ? 0xffffff : 0xe74c3c));
      continue;
    }
    if (zn === 'cell') { // giường
      B(w, 0.14, d, cx, 0.32, cz, dark);
      for (const [lx, lz] of [[b.x1 + 0.08, b.z1 + 0.08], [b.x2 - 0.08, b.z1 + 0.08], [b.x1 + 0.08, b.z2 - 0.08], [b.x2 - 0.08, b.z2 - 0.08]]) B(0.1, 0.32, 0.1, lx, 0.16, lz, dark);
      B(w - 0.12, 0.18, d - 0.12, cx, 0.48, cz, mat(0x9aa3ad));
      const bl = [0x4a78b8, 0x5a8f5a, 0xb85a4a, 0x8a6bb8][Math.round((b.x1 + 36.4) / 5) % 4];
      B(w - 0.1, 0.1, d * 0.62, cx, 0.6, b.z2 - d * 0.31 - 0.03, mat(bl));
      B(w - 0.5, 0.12, 0.55, cx, 0.64, b.z1 + 0.45, mat(0xf4f4f4));
      continue;
    }
    if (zn === 'canteen') {
      if (b.h > 1) { // quầy phát cơm
        Bx(b.x1, b.z1, b.x2, b.z2, 0, b.h, metal, 1.5);
        B(w + 0.2, 0.08, d + 0.2, cx, b.h + 0.04, cz, steel);
        for (let x = b.x1 + 1.5; x < b.x2 - 1; x += 2.4) { B(1.6, 0.18, 0.7, x, b.h + 0.17, cz, steel); B(1.4, 0.04, 0.55, x, b.h + 0.27, cz, mat([0xe67e22, 0x27ae60, 0xf1c40f, 0xc0392b][Math.round(x) % 4])); }
        B(w, 0.5, 0.05, cx, b.h + 0.55, b.z1 + 0.05, mat(0xb8e6ff, { transparent: true, opacity: 0.35, rough: 0.1 }));
      } else {
        Bx(b.x1, b.z1, b.x2, b.z2, b.h - 0.08, b.h, metal, 1.5);
        tableLegs(b.x1, b.z1, b.x2, b.z2, b.h - 0.08, dark);
        tray(b.x1 + 1, cz, b.h); tray(b.x2 - 1, cz, b.h);
      }
      continue;
    }
    if (zn === 'workshop') {
      if (b.h > 1.5) { // kệ dụng cụ
        Bx(b.x1, b.z1, b.x2, b.z2, 0, b.h, mat(0x555b63, { metal: 0.4 }), 1.5);
        const f = new THREE.PlaneGeometry(w - 0.2, b.h - 0.3); uvScale(f, 1, 1); put(f, mat(0xffffff, { map: T.bins }), { x: cx, y: b.h / 2, z: b.z1 - 0.01, ry: Math.PI });
      } else {
        Bx(b.x1, b.z1, b.x2, b.z2, b.h - 0.1, b.h, woodL, 1.5);
        tableLegs(b.x1, b.z1, b.x2, b.z2, b.h - 0.1, dark);
        B(0.7, 0.4, 0.5, b.x1 + 0.7, b.h + 0.2, cz, mat(0x6b5a4a));
        B(0.5, 0.25, 0.45, b.x2 - 0.7, b.h + 0.12, cz, mat(0x3d6ea6));
        B(0.25, 0.08, 0.5, cx, b.h + 0.04, cz + 0.1, steel);
      }
      continue;
    }
    if (zn === 'library') {
      if (b.h > 1.5) { // kệ sách
        Bx(b.x1, b.z1, b.x2, b.z2, 0, b.h, mat(0x5a3a1e, { map: T.planks }), 1.5);
        const f = new THREE.PlaneGeometry(w - 0.1, b.h - 0.15); uvScale(f, w / 5, 1); const tx = T.books;
        put(f, mat(0xffffff, { map: tx }), { x: cx, y: b.h / 2, z: b.z1 - 0.01, ry: Math.PI });
      } else {
        Bx(b.x1, b.z1, b.x2, b.z2, b.h - 0.1, b.h, woodL, 1.5);
        tableLegs(b.x1, b.z1, b.x2, b.z2, b.h - 0.1, woodD);
        B(0.6, 0.04, 0.42, cx - 0.5, b.h + 0.02, cz, mat(0xf4f0e0)); B(0.03, 0.05, 0.4, cx - 0.5, b.h + 0.04, cz, mat(0x333333));
        Cyl(0.04, 0.4, cx + 1.0, b.h + 0.2, cz, mat(0x333333), 6); Sph(0.15, cx + 1.0, b.h + 0.5, cz, mat(0xffe9a8, { emissive: 0x554422 }));
      }
      continue;
    }
    if (zn === 'office') {
      Bx(b.x1, b.z1, b.x2, b.z2, b.h - 0.08, b.h, woodD, 1.5);
      tableLegs(b.x1, b.z1, b.x2, b.z2, b.h - 0.08, dark);
      B(0.7, 0.45, 0.06, cx - 0.5, b.h + 0.3, cz, dark); B(0.1, 0.2, 0.1, cx - 0.5, b.h + 0.1, cz, dark);
      B(0.7, 0.04, 0.25, cx - 0.5, b.h + 0.02, cz + 0.4, mat(0x888888));
      B(0.6, 0.06, 0.4, cx + 0.8, b.h + 0.03, cz, mat(0xf4f0e0));
      continue;
    }
    // sân tập: ghế tập tạ / dụng cụ
    if (zn === 'yard') {
      Bx(b.x1, b.z1, b.x2, b.z2, 0, 0.45, dark, 1);
      B(w - 0.15, 0.18, d - 0.15, cx, b.h - 0.05, cz, mat(0xa83232));
      B(0.12, 0.6, 0.12, b.x1 + 0.3, b.h + 0.3, b.z1 + 0.3, steel); B(0.12, 0.6, 0.12, b.x2 - 0.3, b.h + 0.3, b.z1 + 0.3, steel);
      Cyl(0.04, w + 0.4, cx, b.h + 0.62, b.z1 + 0.3, steel, 8, { rz: Math.PI / 2 });
      Cyl(0.18, 0.06, b.x1 - 0.1, b.h + 0.62, b.z1 + 0.3, dark, 12, { rz: Math.PI / 2 }); Cyl(0.18, 0.06, b.x2 + 0.1, b.h + 0.62, b.z1 + 0.3, dark, 12, { rz: Math.PI / 2 });
      continue;
    }
    Bx(b.x1, b.z1, b.x2, b.z2, 0, b.h, mat(0x4a4f57), 1.5);
  }

  // ---- chi tiết thêm ----
  // rổ bóng rổ (phía đông sân)
  Bx(9.9, -1.8, 10.1, -1.4, 0, 3.2, steel);
  B(0.08, 0.9, 1.4, 9.7, 3.1, -1.6, mat(0xf4f4f4));
  Cyl(0.3, 0.04, 9.3, 2.9, -1.6, mat(0xff6b35), 16);
  // xà đơn (kéo xà) gần trạm ex2
  for (const x of [-5.4, -2.6]) B(0.12, 2.6, 0.12, x, 1.3, -4.0, steel);
  Cyl(0.05, 3, -4, 2.6, -4.0, steel, 8, { rz: Math.PI / 2 });
  // đoạn hàng rào có thể cắt (phía đông xưởng, sát tường chu vi)
  // gồm 3 cột + 6 sợi dây thép gai (mỗi lần cắt đứt gỡ 2 sợi; client ẩn dần theo số lần đã cắt)
  for (const z of [36.5, 38, 39.5]) B(0.14, 2.5, 0.14, 63.4, 1.25, z, steel);
  handles.fenceWires = [];
  for (const y of [0.45, 0.85, 1.25, 1.65, 2.0, 2.35]) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 3.1), mat(0x6b7078, { metal: 0.7, rough: 0.35 }));
    w.position.set(63.4, y, 38); w.castShadow = true; scene.add(w);
    handles.fenceWires.push(w);
  }
  // cổng trại ở tường phía đông: khung cổng + song sắt (người đủ điểm cải tạo làm thủ tục mãn hạn ở đây)
  {
    const gp = mat(0x4b5563, { metal: 0.5, rough: 0.5 });
    for (const z of [-6.2, -1.8]) B(0.5, 3.6, 0.5, 63.45, 1.8, z, gp);
    B(0.6, 0.45, 4.9, 63.45, 3.75, -4, gp);
    for (let i = 0; i <= 14; i++) B(0.06, 3.3, 0.06, 63.6, 1.65, -5.9 + i * 0.3, dark);
    B(0.1, 0.1, 4.2, 63.6, 1.0, -4, dark); B(0.1, 0.1, 4.2, 63.6, 2.4, -4, dark);
    B(0.7, 0.2, 0.7, 63.1, 0.1, -3.4, mat(0xf1c40f)); // bục làm thủ tục
  }
  // tháp canh
  const glass = mat(0x2a3f55, { rough: 0.2, metal: 0.3 });
  handles.windowMat = mat(0x6fa8dc, { emissive: 0x000000, rough: 0.2 });
  for (const [x, z] of TOWERS) {
    for (const [dx, dz] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) B(0.18, 6, 0.18, x + dx, 3, z + dz, mat(0x555b63, { metal: 0.3 }));
    B(2.7, 1.5, 2.7, x, 6.75, z, mat(0x3d4349, { map: T.concrete }), { tile: 2 });
    B(2.75, 0.62, 2.75, x, 6.9, z, handles.windowMat);
    put(new THREE.ConeGeometry(2.2, 1.1, 4), capDark, { x, y: 8.0, z, ry: Math.PI / 4 });
  }
  // dây thép gai trên tường chu vi
  const wire = [];
  const addWire = (x1, z1, x2, z2) => {
    const n = Math.round(Math.hypot(x2 - x1, z2 - z1) / 0.6);
    for (let i = 0; i < n; i++) {
      const ax = x1 + ((x2 - x1) * i) / n, az = z1 + ((z2 - z1) * i) / n, bx = x1 + ((x2 - x1) * (i + 1)) / n, bz = z1 + ((z2 - z1) * (i + 1)) / n;
      wire.push(ax, 5.3 + (i % 2) * 0.35, az, bx, 5.3 + ((i + 1) % 2) * 0.35, bz);
      wire.push(ax, 5.55, az, bx, 5.55, bz);
    }
  };
  addWire(WORLD.minX, WORLD.minZ, WORLD.maxX, WORLD.minZ); addWire(WORLD.minX, WORLD.maxZ, WORLD.maxX, WORLD.maxZ); addWire(WORLD.minX, WORLD.minZ, WORLD.minX, WORLD.maxZ); addWire(WORLD.maxX, WORLD.minZ, WORLD.maxX, WORLD.maxZ);
  const wireGeo = new THREE.BufferGeometry(); wireGeo.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
  scene.add(new THREE.LineSegments(wireGeo, new THREE.LineBasicMaterial({ color: 0x20242a })));
  for (let x = WORLD.minX; x <= WORLD.maxX; x += 4) { B(0.1, 0.7, 0.1, x, 5.35, WORLD.minZ, dark); B(0.1, 0.7, 0.1, x, 5.35, WORLD.maxZ, dark); }
  for (let z = WORLD.minZ; z <= WORLD.maxZ; z += 4) { B(0.1, 0.7, 0.1, WORLD.minX, 5.35, z, dark); B(0.1, 0.7, 0.1, WORLD.maxX, 5.35, z, dark); }

  // cột đèn + bóng đèn phát sáng ban đêm
  handles.lampMat = mat(0xfff2c2, { emissive: 0xffd98a });
  handles.lampMat.emissiveIntensity = 0.05;
  const lampPos = [[-12, -9.6], [11, -9.6], [-12, 9.2], [11, 9.2], [-27, -11], [26, -11], [26, 7], [-27, 7], [-38.7, -3], [38.7, -3],
    [40.5, -11], [52, -11.5], [52, 4.5], [41, 18], [41, 30], [-27, 29.5], [0, 29.5], [26, 29.5], [-38.7, 20], [-38.7, 40], [62, 4], [62, -20], [52, 29.5], [58, 40]];
  for (const [x, z] of lampPos) {
    Cyl(0.08, 3.6, x, 1.8, z, steel, 6);
    B(0.7, 0.08, 0.12, x, 3.62, z, steel);
    Sph(0.2, x - 0.3, 3.5, z, handles.lampMat); Sph(0.2, x + 0.3, 3.5, z, handles.lampMat);
    handles.lamps.push([x, z]);
  }

  // chợ đen của Tày Scam: mái hiên, hàng hoá, thùng
  B(0.12, 2.4, 0.12, 28.3, 1.2, -4.9, woodD); B(0.12, 2.4, 0.12, 31.7, 1.2, -4.9, woodD);
  B(0.12, 2.0, 0.12, 28.3, 1.0, -1.9, woodD); B(0.12, 2.0, 0.12, 31.7, 1.0, -1.9, woodD);
  const aw = new THREE.BoxGeometry(3.9, 0.08, 3.4); const awUv = aw.attributes.uv; for (let i = 0; i < awUv.count; i++) awUv.setXY(i, awUv.getX(i) * 1, awUv.getY(i) * 1);
  put(aw, mat(0xffffff, { map: T.awning }), { x: 30, y: 2.4, z: -3.4, rx: -0.14 });
  B(0.9, 0.7, 0.9, 28.8, 0.35, -5.2, woodL); B(0.8, 0.5, 0.8, 31.2, 0.25, -5.1, woodD); B(0.7, 0.5, 0.7, 31.0, 0.95, -5.1, woodL);
  for (let i = 0; i < 4; i++) Cyl(0.09, 0.22, 29 + i * 0.28, 1.12, -2.9, mat(0xd63031), 10); // lon Reddog
  Sph(0.17, 30.5, 1.18, -2.8, dark); Sph(0.17, 30.9, 1.18, -2.8, dark); // thuốc nổ
  put(new THREE.TorusGeometry(0.2, 0.06, 6, 14), mat(0xc9a66b), { x: 31.1, y: 1.08, z: -3.0, rx: Math.PI / 2 }); // cuộn dây thừng
  Cyl(0.06, 0.3, 29.6, 1.15, -3.15, steel, 8, { rz: Math.PI / 2 }); // đèn pin

  // thùng hàng trang trí trong xưởng + nhà ăn + bao tải
  const crate = mat(0xa8793f, { map: T.planks });
  for (const [x, z, s] of [[16.6, 9.6, 1], [17.8, 9.6, 0.8], [17.2, 9.6, 1.5], [36, 10.2, 1], [35.2, 10.2, 0.8]]) B(0.9, 0.9 * s, 0.9, x, 0.45 * s, z, crate, { tile: 1 });
  for (const [x, z] of [[16.2, -14.6], [16.2, -15.8]]) { Cyl(0.35, 0.9, x, 0.45, z, mat(0x3d6ea6), 10); }
  // trong các kho: thùng đồ
  B(0.8, 0.8, 0.8, 36.0, 0.4, -25.8, crate, { tile: 1 }); B(0.8, 0.5, 0.8, 34.7, 0.25, -25.8, crate, { tile: 1 });
  B(0.8, 0.8, 0.8, 36.2, 0.4, 26.0, crate, { tile: 1 }); B(0.9, 0.5, 0.6, 34.9, 0.25, 26.1, crate, { tile: 1 });
  B(0.7, 1.4, 0.5, -36.2, 0.7, 21.2, mat(0x5a3a1e, { map: T.planks })); B(0.7, 0.9, 0.5, -36.2, 0.45, 17.8, mat(0x5a3a1e, { map: T.planks }));
  // tủ hồ sơ phòng quản giáo
  B(0.8, 1.5, 0.6, -7.2, 0.75, -19.4, mat(0x6b7480, { metal: 0.3 })); B(0.8, 1.5, 0.6, -7.2, 0.75, -20.2, mat(0x6b7480, { metal: 0.3 }));
  // vòng chơi bắn bi + điểm sút phạt trên sân tập
  put(new THREE.TorusGeometry(1.6, 0.06, 6, 28), mat(0xffffff), { x: -2, y: 0.07, z: 5.0, rx: Math.PI / 2 });
  for (const [x, z, c] of [[-2.4, 4.8, 0xe74c3c], [-1.6, 5.2, 0x3498db], [-2, 5.5, 0x2ecc71]]) Sph(0.12, x, 0.14, z, mat(c));
  Sph(0.22, -10.5, 0.22, -2.2, mat(0xffffff));
  // phòng y tế: chữ thập đỏ trên tường
  B(1.2, 0.36, 0.06, 52, 2.3, -26.62, mat(0xd63031)); B(0.36, 1.2, 0.06, 52, 2.3, -26.62, mat(0xd63031));
  // vườn rau: bù nhìn, thùng nước, xẻng, bụi hoa
  Cyl(0.05, 1.8, 58.5, 0.9, 16.5, woodD, 6); B(1.4, 0.07, 0.07, 58.5, 1.45, 16.5, woodD); Sph(0.2, 58.5, 1.85, 16.5, mat(0xe8c07a)); put(new THREE.ConeGeometry(0.28, 0.3, 8), mat(0x8a5a2a), { x: 58.5, y: 2.1, z: 16.5 });
  Cyl(0.4, 0.8, 45.2, 0.4, 17.4, mat(0x3d6ea6), 12); Cyl(0.34, 0.04, 45.2, 0.82, 17.4, mat(0x2a4f7a), 12);
  for (const [x, z, c] of [[44.2, 7.2, 0xff6b81], [45.0, 7.6, 0xffd32a], [59.8, 7.2, 0xa29bfe], [60.2, 27, 0xff6b81], [44.2, 27, 0xffd32a]]) { Cyl(0.03, 0.3, x, 0.15, z, mat(0x2e7d32), 5); Sph(0.13, x, 0.38, z, mat(c)); }
  // phòng tắm: vòi sen trong buồng
  for (const x of [20, 32]) { Cyl(0.04, 1.2, x, 1.9, 44.55, steel, 6); put(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 12), steel, { x, y: 2.5, z: 44.3, rx: 0.5 }); B(0.9, 0.04, 0.9, x, 0.04, 41, mat(0x6fb7c7)); }
  // phòng giải trí: poster, phòng gym: gương
  B(1.6, 1.1, 0.04, -20, 2.0, 44.7, mat(0x2d3436)); B(1.4, 0.9, 0.02, -20, 2.0, 44.68, mat(0xff7675));
  B(8, 1.6, 0.04, 0, 1.6, 44.7, mat(0xdfe9f0, { metal: 0.6, rough: 0.1 }));
  // biển hiệu / bảng thực đơn
  B(3.2, 1.0, 0.08, 26, 2.1, -26.55, mat(0x2f3a2f)); B(3.0, 0.8, 0.02, 26, 2.1, -26.5, mat(0x3f5a3f));

  // ---- cây ngoài tường (instanced) ----
  const trunkG = new THREE.CylinderGeometry(0.35, 0.5, 3, 6), leafG = new THREE.ConeGeometry(2.4, 6, 7);
  const spots = [];
  let seed = 12345;
  const rr = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  while (spots.length < 90) {
    const x = 12 + (rr() - 0.5) * 250, z = 9 + (rr() - 0.5) * 220;
    if (x > WORLD.minX - 12 && x < WORLD.maxX + 12 && z > WORLD.minZ - 12 && z < WORLD.maxZ + 12) continue;
    spots.push([x, z, 0.7 + rr() * 0.9]);
  }
  const trunks = new THREE.InstancedMesh(trunkG, mat(0x6b4a2a), spots.length);
  const leaves = new THREE.InstancedMesh(leafG, mat(0x3f7d3a), spots.length);
  const dummy = new THREE.Object3D();
  spots.forEach(([x, z, s], i) => {
    dummy.position.set(x, 1.5 * s, z); dummy.scale.set(s, s, s); dummy.updateMatrix(); trunks.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, 5.2 * s, z); dummy.updateMatrix(); leaves.setMatrixAt(i, dummy.matrix);
  });
  trunks.castShadow = leaves.castShadow = false;
  scene.add(trunks, leaves);

  // ---- xả batch thành mesh ----
  for (const [m, list] of batch) {
    const mesh = new THREE.Mesh(mergeGeos(list), m);
    mesh.castShadow = !noCast.has(m);
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
  batch.clear();

  // ---- biển tên khu vực (sprite) ----
  for (const z of ZONES) {
    if (z.id === 'solitary') continue;
    const sp = makeSprite(0.9);
    drawText(sp, [z.name.toUpperCase()], { font: 'bold 36px system-ui, sans-serif', bg: 'rgba(0,0,0,.5)' });
    sp.position.set((z.x1 + z.x2) / 2, 3.3, z.z1 + 0.9);
    scene.add(sp);
  }
  for (let i = 0; i < 4; i++) {
    const sp = makeSprite(0.6);
    drawText(sp, [`BUỒNG ${i + 1}`], { font: 'bold 26px system-ui, sans-serif', bg: 'rgba(40,60,90,.6)' });
    sp.position.set(-34.5 + i * 5, 2.4, -20.2);
    scene.add(sp);
  }
  { const sp = makeSprite(0.95); drawText(sp, ['CỔNG TRẠI'], { font: 'bold 38px system-ui, sans-serif', bg: 'rgba(30,110,80,.85)' }); sp.position.set(62.4, 4.7, -4); scene.add(sp); }

  // ---- trạm tương tác: vòng sáng + biểu tượng ----
  const icons = { meal: '🍲', work: '🔨', exercise: '🏋️', read: '📖', dig: '⛏️', sweep: '🧹', sleep: '🛏️', shop: '💰', fence: '✂️', chore: '🧺', rest: '💤', play: '🎮', exit: '🚪' };
  const itemIcons = { spoon: '🥄', pliers: '🔧', map: '🗺️' };
  const exIcons = { ex4: '⚽', ex5: '🧱', ex6: '🔵', ex1: '💪', ex2: '🧗', ex3: '🤸', gym1: '🏋️', gym2: '🏃', pong: '🏓', cards: '🃏', tv: '📺', shower1: '🚿', shower2: '🚿', med: '💊', wash1: '🧺', wash2: '🧺', garden1: '🌿', garden2: '💧' };
  for (const s of STATIONS) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.2, 40), new THREE.MeshBasicMaterial({ color: s.color, transparent: true, opacity: 0.85, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(s.x, 0.075, s.z);
    scene.add(ring);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.85, 32), new THREE.MeshBasicMaterial({ color: s.color, transparent: true, opacity: 0.18, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2; disc.position.set(s.x, 0.07, s.z); scene.add(disc);
    handles.rings.push({ ring, disc, s });
    const ic = emojiSprite(s.kind === 'item' ? itemIcons[s.item] : exIcons[s.id] || icons[s.kind]);
    ic.position.set(s.x, 1.9, s.z);
    ic.scale.multiplyScalar(0.85);
    scene.add(ic);
  }

  // ---- hố đào ----
  // Hố đào: lớn dần theo tiến độ, có đống đất xung quanh; khi hầm thông thì có khung gỗ + ánh sáng le lói
  const hs = STATIONS.find((s) => s.id === 'dig');
  const holeG = new THREE.Group();
  holeG.position.set(hs.x, 0, hs.z + 0.2);
  const pit = new THREE.Mesh(new THREE.CircleGeometry(0.9, 28), new THREE.MeshBasicMaterial({ color: 0x050505 }));
  pit.rotation.x = -Math.PI / 2; pit.position.y = 0.09; holeG.add(pit);
  const mound = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.28, 8, 24), mat(0x6b4a2a, { rough: 1 }));
  mound.rotation.x = -Math.PI / 2; mound.position.y = 0.12; mound.scale.z = 0.55; mound.castShadow = true; holeG.add(mound);
  for (let i = 0; i < 6; i++) { // cục đất văng ra
    const a = (i / 6) * Math.PI * 2 + 0.4, c = new THREE.Mesh(new THREE.DodecahedronGeometry(0.13 + (i % 3) * 0.04), mat(0x5a3d26, { rough: 1 }));
    c.position.set(Math.cos(a) * 1.5, 0.1, Math.sin(a) * 1.5); holeG.add(c);
  }
  const frame = new THREE.Group();
  for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.9, 0.14), mat(0x7a5230)); p.position.set(s * 0.8, 0.45, 0); frame.add(p); }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.14, 0.16), mat(0x7a5230)); beam.position.y = 0.92; frame.add(beam);
  const glow = new THREE.Mesh(new THREE.CircleGeometry(0.75, 20), new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.55, depthWrite: false }));
  glow.rotation.x = -Math.PI / 2; glow.position.y = 0.1; frame.add(glow);
  frame.visible = false; holeG.add(frame);
  holeG.visible = false;
  scene.add(holeG);
  handles.digHole = holeG; handles.digPit = pit; handles.digFrame = frame;

  // ---- cổng khoá của các kho ----
  for (const g of GATES) {
    const grp = new THREE.Group();
    const w = g.x2 - g.x1, d = g.z2 - g.z1, horizontal = w > d, len = horizontal ? w : d;
    const bars = new THREE.Group();
    const barM = mat(0x2d3036, { metal: 0.6, rough: 0.4 });
    const n = Math.round(len / 0.22);
    for (let i = 0; i <= n; i++) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.9, 6), barM);
      const o = -len / 2 + (len * i) / n;
      bar.position.set(horizontal ? o : 0, 0.95, horizontal ? 0 : o);
      bars.add(bar);
    }
    const rail = new THREE.Mesh(new THREE.BoxGeometry(horizontal ? len : 0.08, 0.08, horizontal ? 0.08 : len), barM);
    rail.position.y = 1.5; bars.add(rail);
    const rail2 = rail.clone(); rail2.position.y = 0.4; bars.add(rail2);
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.3, 0.28), mat(0xc0392b));
    lock.position.y = 0.95; bars.add(lock);
    grp.add(bars);
    grp.position.set((g.x1 + g.x2) / 2, 0, (g.z1 + g.z2) / 2);
    grp.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    scene.add(grp);
    const label = makeSprite(0.7);
    label.position.set(grp.position.x, 2.7, grp.position.z + (horizontal ? (g.z1 < 0 ? 0.2 : -0.2) : 0));
    scene.add(label);
    handles.gates.push({ g, bars, label, lastLabor: -1, open: false, rise: 0 });
  }
  return handles;
}

// Tiến độ đào hầm (0..100) và trạng thái đã thông: hố lớn dần, thông thì hiện khung gỗ
export function setDigProgress(handles, pct, open) {
  const g = handles.digHole;
  if (!g) return;
  g.visible = pct > 0 || open;
  const k = open ? 1 : 0.45 + 0.55 * (pct / 100);
  g.scale.set(k, 1, k);
  handles.digFrame.visible = !!open;
}

// Cổng khoá kéo lên như song sắt trượt khi đủ ca lao động (mượt theo thời gian)
export function animateGates(handles, dt) {
  const k = 1 - Math.exp(-dt * 4);
  for (const h of handles.gates) {
    h.rise += ((h.open ? 1 : 0) - h.rise) * k;
    h.bars.position.y = h.rise * 2.1;
    h.bars.visible = h.rise < 0.98;
  }
}

// Hàng rào: ẩn dần các sợi dây đã bị cắt (mỗi lần cắt đứt = 2 sợi)
export function setFenceCuts(handles, cuts) {
  (handles.fenceWires || []).forEach((w, i) => { w.visible = i >= cuts * 2; });
}

// Cập nhật cổng theo số ca lao động của người chơi
export function updateGates(handles, labor) {
  for (const h of handles.gates) {
    if (h.lastLabor === labor) continue;
    h.lastLabor = labor;
    const open = labor >= h.g.need;
    h.open = open;
    drawText(h.label, [open ? `${h.g.name} · ĐÃ MỞ` : `${h.g.name} 🔒 ${labor}/${h.g.need} ca`], {
      font: 'bold 26px system-ui, sans-serif', bg: open ? 'rgba(40,120,60,.8)' : 'rgba(150,40,40,.8)',
    });
  }
}

// ===================== Nhân vật =====================
// Khung xương đơn giản nhưng có khớp: hông -> đầu gối, vai -> khuỷu tay, thân nghiêng/xoay, đầu.
// Tư thế đích được tính mỗi khung hình rồi làm mượt (giảm xóc) nên chuyển động không bị giật hay "khớp cứng".
const HAIR = [0x2b1b12, 0x4a3020, 0x151515, 0x7a5a2a, 0x8a8a8a, 0x1f2a44];
const SKIN = [0xf1c9a5, 0xdeb08a, 0xb9855f, 0x8a5a3d];
function hash(s) { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }

const geoCache = new Map();
function G(key, make) { if (!geoCache.has(key)) geoCache.set(key, make()); return geoCache.get(key); }
const gThigh = () => G('thigh', () => new THREE.CylinderGeometry(0.135, 0.11, 0.46, 10).translate(0, -0.23, 0));
const gShin = () => G('shin', () => new THREE.CylinderGeometry(0.105, 0.08, 0.46, 10).translate(0, -0.23, 0));
const gFoot = () => G('foot', () => new THREE.BoxGeometry(0.2, 0.11, 0.36).translate(0, -0.03, 0.08));
const gUpperArm = () => G('uarm', () => new THREE.CylinderGeometry(0.09, 0.075, 0.34, 10).translate(0, -0.17, 0));
const gForeArm = () => G('farm', () => new THREE.CylinderGeometry(0.075, 0.062, 0.32, 10).translate(0, -0.16, 0));
const gHand = () => G('hand', () => new THREE.SphereGeometry(0.08, 10, 8).translate(0, -0.33, 0));
const gTorso = () => G('torso', () => new THREE.CapsuleGeometry(0.26, 0.2, 5, 14).scale(1.2, 1, 0.78));
const gHead = () => G('head', () => new THREE.SphereGeometry(0.25, 20, 16));
const gHairCap = () => G('hair', () => new THREE.SphereGeometry(0.265, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55));
const gEar = () => G('ear', () => new THREE.SphereGeometry(0.05, 8, 6));

let faceTex = null;
function faceTexture() {
  if (faceTex) return faceTex;
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 96;
  const g = cv.getContext('2d');
  g.fillStyle = '#fff'; for (const x of [38, 90]) { g.beginPath(); g.ellipse(x, 40, 11, 13, 0, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#15110e'; for (const x of [40, 92]) { g.beginPath(); g.arc(x, 43, 7, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#fff'; for (const x of [43, 95]) { g.beginPath(); g.arc(x, 40, 2.5, 0, Math.PI * 2); g.fill(); }
  g.strokeStyle = '#3a2418'; g.lineWidth = 5; g.lineCap = 'round';
  g.beginPath(); g.moveTo(24, 20); g.lineTo(52, 17); g.moveTo(76, 17); g.lineTo(104, 20); g.stroke();
  g.strokeStyle = '#8a3b3b'; g.lineWidth = 5; g.beginPath(); g.arc(64, 62, 14, 0.25 * Math.PI, 0.75 * Math.PI); g.stroke();
  faceTex = new THREE.CanvasTexture(cv); faceTex.colorSpace = THREE.SRGBColorSpace; faceTex.anisotropy = 4;
  return faceTex;
}
let _suitTex = null;
function makeSuitTexture() {
  if (_suitTex) return _suitTex;
  _suitTex = ctex(64, 64, (g, w, h) => {
    g.fillStyle = '#f08a3c'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1a1a1a'; for (let y = 6; y < h; y += 16) g.fillRect(0, y, w, 4);
  });
  return _suitTex;
}
let suitMat = null;
function numberTexture(label) {
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 64;
  const g = cv.getContext('2d');
  g.fillStyle = '#f5f5f5'; g.fillRect(0, 0, 128, 64);
  g.fillStyle = '#111'; g.font = 'bold 34px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, 64, 34);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function makeCharacter(kind, seedStr = '', numLabel = '') {
  if (kind === 'cat') return makeCat();
  const h = hash(seedStr + kind);
  const skin = mat(SKIN[h % SKIN.length], { rough: 0.7 });
  const hair = mat(HAIR[(h >> 3) % HAIR.length]);
  const g = new THREE.Group();
  g.rotation.order = 'YXZ'; // xoay hướng trước, nghiêng (ngủ, cúi) sau
  const mesh = (geo, m, parent, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
  const bx = (w, hh, d) => new THREE.BoxGeometry(w, hh, d);
  const pivot = (parent, x, y, z = 0) => { const p = new THREE.Group(); p.position.set(x, y, z); parent.add(p); return p; };
  if (!suitMat) suitMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: makeSuitTexture(), roughness: 0.85 });
  const isGuard = kind === 'guard', isDealer = kind === 'dealer';
  const bodyM = isGuard ? mat(0x2f4b7c) : isDealer ? mat(0x1f7a4a) : suitMat;
  const legM = isGuard ? mat(0x1c2b4a) : isDealer ? mat(0x2b2b30) : mat(0xe9792f);
  const shoe = mat(0x1a1a1a);

  const hipL = pivot(g, -0.16, 0.93), hipR = pivot(g, 0.16, 0.93);
  const kneeL = pivot(hipL, 0, -0.46), kneeR = pivot(hipR, 0, -0.46);
  for (const [hip, knee] of [[hipL, kneeL], [hipR, kneeR]]) {
    mesh(gThigh(), legM, hip); mesh(gShin(), legM, knee); mesh(gFoot(), shoe, knee, 0, -0.39, 0);
  }

  const upper = pivot(g, 0, 0.93);
  mesh(gTorso(), bodyM, upper, 0, 0.36, 0);
  const shL = pivot(upper, -0.39, 0.62), shR = pivot(upper, 0.39, 0.62);
  const elL = pivot(shL, 0, -0.34), elR = pivot(shR, 0, -0.34);
  for (const [sh, el] of [[shL, elL], [shR, elR]]) {
    mesh(G('shoulder', () => new THREE.SphereGeometry(0.095, 10, 8)), bodyM, sh);
    mesh(gUpperArm(), bodyM, sh); mesh(gForeArm(), bodyM, el); mesh(gHand(), skin, el, 0, 0.0, 0);
  }

  const head = pivot(upper, 0, 0.98);
  mesh(gHead(), skin, head);
  for (const sx of [-1, 1]) mesh(gEar(), skin, head, sx * 0.25, 0, 0);
  const face = new THREE.Mesh(G('face', () => new THREE.PlaneGeometry(0.4, 0.3)), new THREE.MeshBasicMaterial({ map: faceTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  face.position.set(0, 0.0, 0.243); head.add(face);

  if (isGuard) {
    mesh(bx(0.58, 0.14, 0.58), mat(0x1c2b4a), head, 0, 0.23, 0); // mũ
    mesh(bx(0.58, 0.05, 0.3), mat(0x111827), head, 0, 0.17, 0.34); // lưỡi trai
    mesh(bx(0.64, 0.09, 0.4), mat(0x111111), upper, 0, 0.0, 0); // thắt lưng
    mesh(bx(0.1, 0.13, 0.03), mat(0xf1c40f, { metal: 0.6 }), upper, 0.17, 0.52, 0.22); // huy hiệu
    const baton = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.55, 6), mat(0x111111), elR, 0.02, -0.34, 0.14); baton.rotation.x = 1.0;
  } else if (isDealer) {
    mesh(bx(0.56, 0.12, 0.56), mat(0x222222), head, 0, 0.22, 0); mesh(bx(0.4, 0.05, 0.25), mat(0x222222), head, 0, 0.19, -0.3); // mũ lưỡi trai ngược
    mesh(bx(0.4, 0.09, 0.05), mat(0x050505), head, 0, 0.03, 0.255); // kính đen
    const chain = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 6, 16), mat(0xffd700, { metal: 0.9, rough: 0.2 }));
    chain.position.set(0, 0.62, 0.2); chain.rotation.x = Math.PI / 2.4; upper.add(chain);
  } else {
    g.scale.setScalar(0.95 + ((h >> 9) % 11) / 100); // dáng người cao thấp khác nhau
    const style = (h >> 6) % 6; // kiểu tóc/râu theo từng người
    if (kind === 'npc') mesh(G('beanie', () => new THREE.SphereGeometry(0.28, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2)), mat(0x2d6a4f), head, 0, 0.02, 0); // mũ len
    else if (style === 2) { /* đầu trọc */ }
    else mesh(gHairCap(), hair, head, 0, 0.0, -0.01); // tóc
    if (kind !== 'npc' && style === 3) mesh(bx(0.5, 0.42, 0.14), hair, head, 0, -0.14, -0.2); // tóc dài xõa sau gáy
    if (kind !== 'npc' && style === 4) { mesh(bx(0.3, 0.1, 0.06), hair, head, 0, -0.14, 0.23); mesh(bx(0.38, 0.05, 0.05), hair, head, 0, -0.07, 0.235); } // râu + ria
    if (kind !== 'npc' && style === 5) mesh(bx(0.5, 0.06, 0.1), mat(0xe9792f), head, 0, 0.12, 0.2); // băng đô cam
    if (numLabel) {
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.23), new THREE.MeshBasicMaterial({ map: numberTexture(numLabel) }));
      plate.position.set(0, 0.4, -0.2); plate.rotation.y = Math.PI; upper.add(plate);
    }
  }
  g.userData = { rig: { hipL, hipR, kneeL, kneeR, shL, shR, elL, elR, upper, head }, cur: Object.create(null), walkT: Math.random() * 6 };
  return g;
}

// Mèo cathehe: thân tròn, đuôi vẫy, 4 chân đi chéo.
function makeCat() {
  const g = new THREE.Group();
  g.rotation.order = 'YXZ';
  const fur = mat(0xe0913a), furD = mat(0xb06a22), white = mat(0xfff4e6), pink = mat(0xff9aa8), dark = mat(0x15110e);
  const mesh = (geo, m, parent, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
  const body = new THREE.Group(); body.position.set(0, 0.36, 0); g.add(body);
  const torso = mesh(new THREE.CapsuleGeometry(0.17, 0.38, 5, 12), fur, body); torso.rotation.x = Math.PI / 2;
  mesh(new THREE.SphereGeometry(0.15, 10, 8).scale(0.9, 0.7, 1), white, body, 0, -0.06, 0.12); // ức trắng
  for (let i = 0; i < 3; i++) mesh(new THREE.BoxGeometry(0.34, 0.03, 0.05), furD, body, 0, 0.145, -0.1 + i * 0.13); // sọc lưng
  const head = new THREE.Group(); head.position.set(0, 0.1, 0.36); body.add(head);
  mesh(new THREE.SphereGeometry(0.17, 14, 12), fur, head);
  mesh(new THREE.SphereGeometry(0.075, 8, 6).scale(1.2, 0.8, 0.9), white, head, 0, -0.06, 0.13);
  for (const sx of [-1, 1]) {
    const ear = mesh(new THREE.ConeGeometry(0.06, 0.13, 4), fur, head, sx * 0.1, 0.17, -0.01); ear.rotation.z = -sx * 0.25;
    mesh(new THREE.SphereGeometry(0.03, 8, 6), dark, head, sx * 0.065, 0.03, 0.15);
    mesh(new THREE.SphereGeometry(0.012, 6, 4), white, head, sx * 0.058, 0.04, 0.178);
  }
  mesh(new THREE.SphereGeometry(0.025, 6, 4), pink, head, 0, -0.02, 0.17);
  const tail = new THREE.Group(); tail.position.set(0, 0.06, -0.32); body.add(tail);
  const t1 = mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.3, 6).translate(0, 0.15, 0), fur, tail); t1.rotation.x = -0.9;
  const tail2 = new THREE.Group(); tail2.position.set(0, 0.28, -0.22); tail.add(tail2);
  const t2 = mesh(new THREE.CylinderGeometry(0.03, 0.036, 0.28, 6).translate(0, 0.14, 0), furD, tail2); t2.rotation.x = -0.3;
  const legs = [];
  for (const [x, z] of [[-0.1, 0.22], [0.1, 0.22], [-0.1, -0.22], [0.1, -0.22]]) {
    const p = new THREE.Group(); p.position.set(x, -0.08, z); body.add(p);
    mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.3, 6).translate(0, -0.15, 0), fur, p);
    mesh(new THREE.SphereGeometry(0.05, 8, 6), white, p, 0, -0.3, 0.02);
    legs.push(p);
  }
  g.userData = { cat: { body, head, tail, tail2, legs }, cur: Object.create(null), walkT: Math.random() * 6 };
  return g;
}

const K = ['hipL', 'hipR', 'hipLz', 'hipRz', 'kneeL', 'kneeR', 'shL', 'shR', 'shLz', 'shRz', 'elL', 'elR', 'lean', 'twist', 'bob', 'headX', 'headY', 'rootX', 'lift', 'rootZ', 'sleep'];
const damp = (cur, key, tgt, k) => { cur[key] = (cur[key] ?? tgt) + (tgt - (cur[key] ?? tgt)) * k; return cur[key]; };
const angLerp = (a, b, t) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return a + d * t; };

// ---------- Dụng cụ cầm tay (dựng khi cần, gắn vào bàn tay phải) ----------
const TOOL_OF_ACT = { 1: 'hammer', 4: 'pick', 5: 'book', 6: 'broom', 7: 'spoon', 8: 'lockpick', 11: 'paddle' };
const TOOL_BUILD = {
  hammer: (add) => { add(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), mat(0x7a5230), 0, -0.25, 0); add(new THREE.BoxGeometry(0.26, 0.13, 0.13), mat(0x555b63, { metal: 0.6 }), 0, -0.5, 0); },
  pick: (add) => { add(new THREE.CylinderGeometry(0.03, 0.03, 0.75, 6), mat(0x7a5230), 0, -0.33, 0); add(new THREE.BoxGeometry(0.5, 0.06, 0.07), mat(0x6c727a, { metal: 0.6 }), 0, -0.7, 0); },
  book: (add) => { add(new THREE.BoxGeometry(0.3, 0.04, 0.22), mat(0xa93226), 0, -0.1, 0.1); add(new THREE.BoxGeometry(0.28, 0.03, 0.2), mat(0xf4efe0), 0, -0.08, 0.1); },
  broom: (add) => { add(new THREE.CylinderGeometry(0.025, 0.025, 1.0, 6), mat(0x8a5a2a), 0, -0.35, 0); add(new THREE.BoxGeometry(0.34, 0.2, 0.1), mat(0xc9a227), 0, -0.9, 0); },
  spoon: (add) => { add(new THREE.CylinderGeometry(0.015, 0.015, 0.22, 5), mat(0xc0c4ca, { metal: 0.7 }), 0, -0.1, 0); add(new THREE.SphereGeometry(0.045, 8, 6), mat(0xc0c4ca, { metal: 0.7 }), 0, -0.22, 0); },
  lockpick: (add) => { add(new THREE.CylinderGeometry(0.012, 0.012, 0.2, 5), mat(0xd0d3d8, { metal: 0.8 }), 0, -0.1, 0); add(new THREE.BoxGeometry(0.05, 0.015, 0.015), mat(0xd0d3d8, { metal: 0.8 }), 0.02, -0.2, 0); },
  paddle: (add) => { add(new THREE.CylinderGeometry(0.02, 0.02, 0.18, 6), mat(0x7a5230), 0, -0.09, 0); add(new THREE.CylinderGeometry(0.11, 0.11, 0.025, 14), mat(0xd63031), 0, -0.26, 0); },
};
function getTool(ud, r, name) {
  if (!ud.tools) ud.tools = {};
  if (ud.tools[name]) return ud.tools[name];
  const g = new THREE.Group();
  TOOL_BUILD[name]((geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; g.add(o); });
  g.position.set(0, -0.32, 0.02); g.rotation.x = 1.25; // nắm trong lòng bàn tay, đầu dụng cụ chúc ra phía trước
  g.visible = false;
  r.elR.add(g);
  ud.tools[name] = g;
  return g;
}

// Hiệu ứng một lần (đòn đánh, bị đánh, khám người, còng tay) chồng lên tư thế nền; e.fx = { k, t } do client đặt khi nhận 'anim' từ server
const FX_DUR = { throw: 0.55, swing: 0.65, hit: 0.7, search: 1.3, grab: 0.8, handsup: 1.7 };
function applyFx(e, T, dt) {
  const fx = e.fx;
  if (!fx) return false;
  fx.t += dt;
  const dur = FX_DUR[fx.k] || 0.6;
  if (fx.t >= dur) { e.fx = null; return false; }
  const u = fx.t / dur, env = Math.sin(Math.PI * u);
  if (fx.k === 'swing') { // giơ gậy rồi quật xuống
    if (u < 0.4) { T.shR = -2.7 * (u / 0.4); T.elR = -0.3; T.lean = -0.12 * (u / 0.4); }
    else { const s = (u - 0.4) / 0.6; T.shR = -2.7 + 3.6 * Math.min(1, s * 1.6); T.elR = -0.2; T.lean = 0.35 * Math.min(1, s * 2); T.twist = -0.5 * Math.min(1, s * 2); }
    T.shL = -0.4;
  } else if (fx.k === 'throw') { // vung tay ra sau rồi ném mạnh về phía trước
    if (u < 0.3) { T.shR = 0.9 * (u / 0.3); T.lean = -0.1; }
    else { const s = Math.min(1, (u - 0.3) / 0.4); T.shR = 0.9 - 3.1 * s; T.lean = 0.25 * s; T.twist = -0.35 * s; }
    T.elR = -0.4; T.shL = -0.3;
  } else if (fx.k === 'hit') { // giật người ra sau, hai tay văng
    T.lean = -0.5 * env; T.headX = -0.55 * env; T.shLz = -1.0 * env; T.shRz = 1.0 * env; T.shL = 0.6 * env; T.shR = 0.6 * env; T.rootX = -0.22 * env;
  } else if (fx.k === 'search') { // hai tay vỗ lục soát
    T.shL = T.shR = -1.25 + Math.sin(fx.t * 14) * 0.28; T.elL = T.elR = -0.55; T.lean = 0.22; T.headX = 0.3;
  } else if (fx.k === 'grab') { // túm lấy người bị bắt
    T.shL = T.shR = -1.5; T.elL = T.elR = -0.25; T.lean = 0.28 * env + 0.1; T.shLz = -0.15; T.shRz = 0.15;
  } else if (fx.k === 'handsup') { // giơ hai tay đầu hàng
    const up = Math.min(1, fx.t / 0.2);
    T.shL = T.shR = -2.9 * up; T.shLz = -0.3 * up; T.shRz = 0.3 * up; T.elL = T.elR = -0.35; T.headX = -0.12;
  }
  return true;
}

// speed: tốc độ di chuyển (m/s); flags: cờ trạng thái (bit0 bị giam, bit1 đang làm việc, bit2 choáng, bit3 tăng lực, bit4..7 mã hoạt động)
export function animateCharacter(e, dt, speed, time, urgent) {
  const ud = e.group.userData;
  if (ud.cat) return animateCat(e, dt, speed, time);
  const r = ud.rig;
  if (!r) return;
  const T = {};
  for (const k of K) T[k] = 0;
  const flags = e.flags | 0;
  const act = (flags & 2) ? (flags >> 4) & 15 : -1;
  const jailed = (flags & 1) && e.kind === 'player';
  const moving = speed > 0.35;
  const boost = flags & 8 ? 1.25 : 1;
  const amp = Math.min(1.3, speed / 3.4) * (urgent ? 1.1 : 1);
  // nhịp chân gắn với quãng đường thật đã đi (không phải tốc độ làm mượt) nên bước chân khớp mặt đất, ít trượt
  if (moving) ud.walkT += (e.stepDist !== undefined ? e.stepDist * 2.45 : dt * Math.min(speed, 9) * 1.85) * (boost > 1 ? 1.1 : 1);
  const w = ud.walkT, s = Math.sin(w), c = Math.cos(w), ph = e.phase;
  const tt = time;

  // --- nền: đứng yên thở nhẹ ---
  T.shLz = -0.1 + Math.sin(tt * 1.7 + ph) * 0.02; T.shRz = 0.1 - Math.sin(tt * 1.7 + ph) * 0.02;
  T.elL = -0.12; T.elR = -0.12;
  T.bob = 0;
  T.headX = Math.sin(tt * 0.9 + ph) * 0.03;
  T.headY = Math.sin(tt * 0.5 + ph * 1.7) * 0.18 * (moving ? 0 : 1);
  let tool = null;
  if (jailed && !moving) { // bị còng: hai tay chắp trước bụng, cúi đầu
    T.shL = T.shR = -0.55; T.shLz = 0.18; T.shRz = -0.18; T.elL = T.elR = -1.55; T.headX = 0.42; T.lean = 0.1;
  } else if (moving && act < 0) { // --- đi / chạy ---
    T.hipL = s * 0.78 * amp; T.hipR = -s * 0.78 * amp;
    T.kneeL = Math.max(0, -c) * 1.05 * amp + 0.06; T.kneeR = Math.max(0, c) * 1.05 * amp + 0.06;
    T.shL = -s * 0.7 * amp; T.shR = s * 0.7 * amp;
    T.elL = -0.25 - Math.max(0, s) * 0.55 * amp; T.elR = -0.25 - Math.max(0, -s) * 0.55 * amp;
    T.lean = 0.07 + 0.1 * amp; T.twist = s * 0.16 * amp; T.headY = -T.twist * 0.7;
    T.lift = (1 - Math.abs(s)) * 0.06 * amp;
    T.shLz = -0.08; T.shRz = 0.08;
    if (speed > 6.5) { T.lean += 0.12; T.elL -= 0.4; T.elR -= 0.4; }
  } else if (act >= 0) { // --- đang làm việc ---
    const t = tt;
    if (act === 1) { T.lean = 0.15; T.shR = -1.55 + Math.sin(t * 9) * 0.9; T.elR = -0.7; T.shL = -0.9; T.elL = -0.9; T.twist = Math.sin(t * 9) * 0.1; }
    else if (act === 2) { const j = Math.abs(Math.sin(t * 4.5)); T.lift = j * 0.2; T.shLz = -(0.2 + 1.8 * j); T.shRz = 0.2 + 1.8 * j; T.hipLz = -0.32 * j; T.hipRz = 0.32 * j; T.elL = T.elR = -0.15; T.headX = -0.1; }
    else if (act === 3) { T.rootX = -Math.PI / 2; T.lift = 0.84; T.rootZ = -1.2; T.sleep = 1; T.shLz = -0.15; T.shRz = 0.15; T.elL = T.elR = -0.1; T.headX = 0.05; } // nằm trên giường (giường nằm phía bắc trạm)
    else if (act === 4) { const q = Math.sin(t * 9); T.lean = 0.5; T.lift = -0.08; T.hipL = T.hipR = -0.45; T.kneeL = T.kneeR = 0.75; T.shL = -0.9 + q * 0.9; T.shR = -0.9 - q * 0.9; T.elL = T.elR = -0.4; T.headX = 0.2; }
    else if (act === 5) { T.shL = T.shR = -1.2; T.elL = T.elR = -1.3; T.headX = 0.4; T.shLz = -0.18; T.shRz = 0.18; }
    else if (act === 6) { const q = Math.sin(t * 6.5); T.lean = 0.26; T.shL = -0.9 + q * 0.5; T.shR = -0.9 - q * 0.5; T.elL = T.elR = -0.5; T.twist = q * 0.28; T.headX = 0.25; T.hipL = q * 0.15; T.hipR = -q * 0.15; }
    else if (act === 7) { T.shR = -1.6 + Math.sin(t * 8) * 0.3; T.elR = -1.5; T.shL = -0.15; T.headX = 0.1 + Math.sin(t * 8) * 0.12; }
    else if (act === 8) { T.shR = -1.2 + Math.sin(t * 14) * 0.15; T.elR = -1.0; T.shL = -1.0; T.elL = -1.0; T.lean = 0.2; T.headX = 0.25; }
    else if (act === 10) { T.headX = 0.08 + Math.sin(t * 0.8) * 0.08; T.shL = T.shR = -0.3; T.elL = T.elR = -0.5; T.lean = -0.04; }
    else if (act === 11) { const q = Math.sin(t * 9); T.lean = 0.12; T.shR = -1.3 + q * 0.6; T.elR = -0.8; T.shL = -0.8; T.elL = -0.6; T.twist = q * 0.22; T.hipL = 0.2; T.hipR = -0.2; }
    else { T.shL = T.shR = -1.1 + Math.sin(tt * 12) * 0.12; T.elL = T.elR = -1.0; T.lean = 0.12; T.headX = 0.2; } // minigame / giữ E
    tool = TOOL_OF_ACT[act] || null;
  } else { // --- đứng yên: thả lỏng ---
    T.shL = Math.sin(tt * 1.4 + ph) * 0.05; T.shR = -Math.sin(tt * 1.4 + ph) * 0.05;
    T.bob = Math.sin(tt * 2 + ph) * 0.012;
  }
  const fxOn = applyFx(e, T, dt);

  // hiện đúng dụng cụ đang dùng, ẩn các dụng cụ còn lại
  if (ud.tools) for (const n in ud.tools) ud.tools[n].visible = n === tool && !fxOn;
  if (tool && !fxOn) getTool(ud, r, tool).visible = true;

  const k = 1 - Math.exp(-dt * (fxOn ? 26 : act >= 0 ? 12 : 18));
  const cur = ud.cur;
  for (const key of K) damp(cur, key, T[key], k);
  r.hipL.rotation.set(cur.hipL, 0, cur.hipLz); r.hipR.rotation.set(cur.hipR, 0, cur.hipRz);
  r.kneeL.rotation.x = cur.kneeL; r.kneeR.rotation.x = cur.kneeR;
  r.shL.rotation.set(cur.shL, 0, cur.shLz); r.shR.rotation.set(cur.shR, 0, cur.shRz);
  r.elL.rotation.x = cur.elL; r.elR.rotation.x = cur.elR;
  r.upper.rotation.set(cur.lean, cur.twist, 0);
  r.upper.position.y = 0.93 + cur.bob;
  r.head.rotation.set(cur.headX, cur.headY, 0);
  e.group.rotation.x = cur.rootX;
  e.group.position.y = cur.lift;
  e.group.position.z += cur.rootZ; // nằm ngủ: dịch người lên phần giường phía bắc trạm
  if (cur.sleep > 0.02) e.group.rotation.y = angLerp(e.group.rotation.y, 0, Math.min(1, cur.sleep)); // nằm quay đầu về phía bắc, chân về phía trạm
  e.group.rotation.z = (flags & 4) && !fxOn ? Math.sin(time * 30) * 0.1 : 0;
}

function animateCat(e, dt, speed, time) {
  const ud = e.group.userData, c = ud.cat, cur = ud.cur;
  const sit = e.alert === 2 && speed < 0.3;
  const moving = speed > 0.25;
  if (moving) ud.walkT += dt * Math.min(speed, 4) * 5.2;
  const w = ud.walkT, s = Math.sin(w);
  const T = { bodyX: 0, bodyY: 0.36, headX: 0, tailX: 0, tailZ: 0, l0: 0, l1: 0, l2: 0, l3: 0, bob: 0 };
  if (moving) {
    T.l0 = s * 0.7; T.l3 = s * 0.7; T.l1 = -s * 0.7; T.l2 = -s * 0.7;
    T.bob = Math.abs(Math.sin(w)) * 0.03; T.tailX = 0.15; T.tailZ = Math.sin(time * 4 + e.phase) * 0.25; T.headX = Math.sin(w * 2) * 0.05;
  } else if (sit) { // ngồi: mông hạ, hai chân trước thẳng, vẫy đuôi chậm
    T.bodyX = -0.55; T.bodyY = 0.28; T.headX = 0.55 + Math.sin(time * 1.2 + e.phase) * 0.08; T.l0 = T.l1 = 0.55; T.l2 = T.l3 = -1.2;
    T.tailZ = Math.sin(time * 2.2 + e.phase) * 0.5;
  } else { T.tailZ = Math.sin(time * 1.6 + e.phase) * 0.2; T.headX = Math.sin(time * 1.1 + e.phase) * 0.1; }
  const k = 1 - Math.exp(-dt * 14);
  for (const key in T) damp(cur, key, T[key], k);
  c.body.rotation.x = cur.bodyX; c.body.position.y = cur.bodyY + cur.bob;
  c.head.rotation.x = cur.headX;
  c.tail.rotation.set(cur.tailX, 0, cur.tailZ); c.tail2.rotation.z = cur.tailZ * 0.8;
  c.legs[0].rotation.x = cur.l0; c.legs[1].rotation.x = cur.l1; c.legs[2].rotation.x = cur.l2; c.legs[3].rotation.x = cur.l3;
}

// Mũi tên chỉ đường dưới đất (hình chữ V hướng +z)
export function makeArrowGeometry() {
  const pos = new Float32Array([
    0, 0, 0.55, -0.5, 0, -0.35, 0, 0, -0.1,
    0, 0, 0.55, 0, 0, -0.1, 0.5, 0, -0.35,
  ]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex([0, 2, 1, 3, 5, 4]);
  g.computeVertexNormals();
  return g;
}
