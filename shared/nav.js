// Lưới tìm đường (dùng cho quản giáo đi tới nơi có tiếng động và cho mũi tên chỉ đường của client).
import { WORLD } from './map.js';
import { blocked } from './sim.js';

export const CELL = 0.5;
export const NW = Math.round((WORLD.maxX - WORLD.minX) / CELL);
export const NH = Math.round((WORLD.maxZ - WORLD.minZ) / CELL);
const NONE = 65535;
let grid = null;

function ensure() {
  if (grid) return;
  grid = new Uint8Array(NW * NH);
  for (let j = 0; j < NH; j++) {
    for (let i = 0; i < NW; i++) {
      grid[j * NW + i] = blocked(WORLD.minX + (i + 0.5) * CELL, WORLD.minZ + (j + 0.5) * CELL, 0.55, 0) ? 1 : 0;
    }
  }
}
const ci = (x) => Math.max(0, Math.min(NW - 1, Math.floor((x - WORLD.minX) / CELL)));
const cj = (z) => Math.max(0, Math.min(NH - 1, Math.floor((z - WORLD.minZ) / CELL)));
const cx = (i) => WORLD.minX + (i + 0.5) * CELL;
const cz = (j) => WORLD.minZ + (j + 0.5) * CELL;

// Ô trống gần nhất quanh (i,j)
function nearestFree(i, j, maxR = 8) {
  if (!grid[j * NW + i]) return [i, j];
  for (let r = 1; r <= maxR; r++) {
    let best = null, bd = Infinity;
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a >= NW || b >= NH || grid[b * NW + a]) continue;
        const d = di * di + dj * dj;
        if (d < bd) { bd = d; best = [a, b]; }
      }
    }
    if (best) return best;
  }
  return null;
}

// Trường khoảng cách (BFS 4 hướng) từ điểm đích tới mọi ô.
export function distField(tx, tz) {
  ensure();
  const f = new Uint16Array(NW * NH).fill(NONE);
  const s = nearestFree(ci(tx), cj(tz));
  if (!s) return f;
  const q = new Int32Array(NW * NH);
  let h = 0, t = 0;
  f[s[1] * NW + s[0]] = 0;
  q[t++] = s[1] * NW + s[0];
  while (h < t) {
    const cur = q[h++];
    const i = cur % NW, j = (cur / NW) | 0, d = f[cur] + 1;
    if (i > 0 && !grid[cur - 1] && f[cur - 1] === NONE) { f[cur - 1] = d; q[t++] = cur - 1; }
    if (i < NW - 1 && !grid[cur + 1] && f[cur + 1] === NONE) { f[cur + 1] = d; q[t++] = cur + 1; }
    if (j > 0 && !grid[cur - NW] && f[cur - NW] === NONE) { f[cur - NW] = d; q[t++] = cur - NW; }
    if (j < NH - 1 && !grid[cur + NW] && f[cur + NW] === NONE) { f[cur + NW] = d; q[t++] = cur + NW; }
  }
  return f;
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

// Bước kế tiếp từ (x,z) theo trường khoảng cách; null nếu đã tới đích hoặc không có đường.
export function nextStep(f, x, z) {
  ensure();
  let i = ci(x), j = cj(z);
  let cur = grid[j * NW + i] ? NONE : f[j * NW + i];
  if (grid[j * NW + i]) { // đang đứng sát tường: đi tới ô trống gần nhất có khoảng cách tốt nhất
    let best = null, bv = NONE;
    for (let r = 1; r <= 3 && !best; r++) {
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a >= NW || b >= NH || grid[b * NW + a]) continue;
        const v = f[b * NW + a];
        if (v < bv) { bv = v; best = [a, b]; }
      }
    }
    return best && bv !== NONE ? [cx(best[0]), cz(best[1])] : null;
  }
  if (cur === 0 || cur === NONE) return null;
  let best = null, bv = cur;
  for (const [di, dj] of DIRS) {
    const a = i + di, b = j + dj;
    if (a < 0 || b < 0 || a >= NW || b >= NH || grid[b * NW + a]) continue;
    if (di && dj && (grid[j * NW + a] || grid[b * NW + i])) continue; // không cắt góc tường
    const v = f[b * NW + a];
    if (v < bv) { bv = v; best = [a, b]; }
  }
  return best ? [cx(best[0]), cz(best[1])] : null;
}

// Đường đi (danh sách điểm) từ (sx,sz) tới (tx,tz) — dùng vẽ mũi tên chỉ đường.
export function findPath(sx, sz, tx, tz, maxSteps = 400) {
  const f = distField(tx, tz);
  const pts = [[sx, sz]];
  let x = sx, z = sz;
  for (let n = 0; n < maxSteps; n++) {
    const nx = nextStep(f, x, z);
    if (!nx) break;
    x = nx[0]; z = nx[1];
    pts.push([x, z]);
  }
  return pts;
}
