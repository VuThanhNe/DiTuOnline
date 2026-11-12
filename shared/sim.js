// Mô phỏng di chuyển và tầm nhìn — dùng chung server/client để dự đoán khớp nhau.
import { COLLIDERS, WALLS, WORLD, PLAYER_RADIUS, PLAYER_SPEED, RULES, ENERGY, BOOST } from './map.js';

// Tốc độ di chuyển (m/s) dùng chung cho server và client dự đoán: tăng lực, hết sức, đi lén, chạy (chạy cần còn sức, không đi lén).
export function moveSpeed({ boost = 0, en = 100, sneak = false, run = false }) {
  const boosted = boost > 0, running = run && !sneak && en > 0.5;
  let mult = boosted ? BOOST.speed : 1;
  if (running) mult = boosted ? RULES.runSpeed * 1.2 : RULES.runSpeed;
  return PLAYER_SPEED * mult * (en <= 0 ? ENERGY.tiredSpeed : 1) * (sneak ? RULES.sneakSpeed : 1);
}
export const isRunning = ({ run, sneak, en }) => !!run && !sneak && en > 0.5;

export function circleHitsBox(x, z, r, b) {
  const cx = Math.max(b.x1, Math.min(x, b.x2));
  const cz = Math.max(b.z1, Math.min(z, b.z2));
  const dx = x - cx, dz = z - cz;
  return dx * dx + dz * dz < r * r;
}

// labor: số ca lao động của người chơi; cổng khoá (có thuộc tính need) chỉ chặn khi chưa đủ ca.
export function blocked(x, z, r = PLAYER_RADIUS, labor = 0) {
  if (x < WORLD.minX + r || x > WORLD.maxX - r || z < WORLD.minZ + r || z > WORLD.maxZ - r) return true;
  for (const b of COLLIDERS) {
    if (b.need !== undefined && labor >= b.need) continue;
    if (circleHitsBox(x, z, r, b)) return true;
  }
  return false;
}

// Di chuyển p={x,z,labor} theo hướng (mx,mz), trượt dọc tường.
export function stepMove(p, mx, mz, dt, speed = PLAYER_SPEED) {
  const len = Math.hypot(mx, mz);
  if (len < 0.001) return false;
  const k = Math.min(1, len) / len;
  const dx = mx * k * speed * dt, dz = mz * k * speed * dt;
  const labor = p.labor || 0;
  let moved = false;
  if (!blocked(p.x + dx, p.z, PLAYER_RADIUS, labor)) { p.x += dx; moved = true; }
  if (!blocked(p.x, p.z + dz, PLAYER_RADIUS, labor)) { p.z += dz; moved = true; }
  return moved;
}

// Đoạn thẳng (ax,az)->(bx,bz) có cắt hộp tường không (slab method).
export function segHitsBox(ax, az, bx, bz, b) {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  const p = [-dx, dx, -dz, dz];
  const q = [ax - b.x1, b.x2 - ax, az - b.z1, b.z2 - az];
  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < 1e-9) { if (q[i] < 0) return false; }
    else {
      const t = q[i] / p[i];
      if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
      else { if (t < t0) return false; if (t < t1) t1 = t; }
    }
  }
  return true;
}

// Khoảng cách tia (ax,az)+t*(dx,dz) tới tường gần nhất, tối đa max (dùng cắt hình quạt tầm nhìn).
export function rayDist(ax, az, dx, dz, max) {
  let best = max;
  for (const b of WALLS) {
    let t0 = 0, t1 = best;
    let ok = true;
    for (let i = 0; i < 2 && ok; i++) {
      const o = i ? az : ax, d = i ? dz : dx, lo = i ? b.z1 : b.x1, hi = i ? b.z2 : b.x2;
      if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) ok = false; }
      else {
        let a = (lo - o) / d, c = (hi - o) / d;
        if (a > c) { const s = a; a = c; c = s; }
        if (a > t0) t0 = a;
        if (c < t1) t1 = c;
        if (t0 > t1) ok = false;
      }
    }
    if (ok && t0 < best) best = t0;
  }
  return best;
}

// Tầm nhìn bị tường chặn (chỉ tính tường, không tính đồ đạc thấp).
export function lineOfSight(ax, az, bx, bz) {
  for (const w of WALLS) if (segHitsBox(ax, az, bx, bz, w)) return false;
  return true;
}
