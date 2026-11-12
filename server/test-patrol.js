// Kiểm tra bản đồ: tuyến tuần tra không xuyên tường, trạm có thể tiếp cận, điểm sinh ra hợp lệ, có đường đi tới mọi trạm.
import { GUARD_ROUTES, STATIONS, CELL_SPAWNS, SOLITARY_POS, OFFICE_POS, INMATE_NPCS, GATES, LABOR_NEED, DEALER } from '../shared/map.js';
import { blocked } from '../shared/sim.js';
import { findPath } from '../shared/nav.js';
let bad = 0;
const fail = (m) => { bad++; console.log('LỖI:', m); };

GUARD_ROUTES.forEach((route, gi) => {
  route.forEach(([x, z], i) => { if (blocked(x, z, 0.5, 0)) fail(`Quản giáo ${gi + 1}: điểm ${i} (${x},${z}) nằm trong vật cản`); });
  for (let i = 0; i < route.length; i++) {
    const [ax, az] = route[i], [bx, bz] = route[(i + 1) % route.length];
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.25);
    for (let k = 0; k <= n; k++) {
      const x = ax + ((bx - ax) * k) / n, z = az + ((bz - az) * k) / n;
      if (blocked(x, z, 0.5, 0)) { fail(`Quản giáo ${gi + 1}: đoạn ${i}->${(i + 1) % route.length} bị chặn tại (${x.toFixed(1)},${z.toFixed(1)})`); break; }
    }
  }
});
for (const s of STATIONS) {
  let ok = false;
  for (let a = 0; a < 360 && !ok; a += 10) for (let d = 0.3; d <= s.r * 0.85 && !ok; d += 0.25) {
    const x = s.x + Math.cos((a * Math.PI) / 180) * d, z = s.z + Math.sin((a * Math.PI) / 180) * d;
    if (!blocked(x, z, 0.45, Infinity)) ok = true;
  }
  if (!ok) fail(`Trạm ${s.id} không có chỗ đứng trong bán kính`);
}
CELL_SPAWNS.forEach(([x, z], i) => blocked(x, z) && fail(`Điểm sinh ${i} bị chặn`));
if (blocked(...SOLITARY_POS)) fail('Biệt giam bị chặn');
if (blocked(...OFFICE_POS)) fail('Chỗ nhốt trong phòng quản giáo bị chặn');
INMATE_NPCS.forEach((n, i) => blocked(n.x, n.z) && fail(`NPC tù nhân ${i} bị chặn`));
if (blocked(DEALER.x, DEALER.z + 0.1, 0.2)) { /* NPC đứng sau quầy: không bắt buộc */ }
// Cửa ra vào phải đi được từ ngoài vào trong
const doors = [[-27, -11], [-27, -15], [26, -11], [26, -15], [26, 6], [26, 10], [-27, 6], [-27, 10], [0, -15], [0, -19]];
doors.forEach(([x, z]) => blocked(x, z) && fail(`Cửa tại (${x},${z}) bị chặn`));

// Cổng khoá: chưa đủ ca lao động thì không vào được, đủ thì vào được
for (const g of GATES) {
  const cx = (g.x1 + g.x2) / 2, cz = (g.z1 + g.z2) / 2;
  if (!blocked(cx, cz, 0.45, g.need - 1)) fail(`Cổng ${g.id} không chặn người chưa đủ ca`);
  if (blocked(cx, cz, 0.45, g.need)) fail(`Cổng ${g.id} vẫn chặn người đã đủ ca`);
}
if (!(LABOR_NEED.spoon < LABOR_NEED.pliers && LABOR_NEED.pliers < LABOR_NEED.map)) fail('Ngưỡng lao động phải tăng dần');

// Có đường đi từ buồng giam tới mọi trạm (trừ trạm trong kho khoá)
const inKho = new Set(['spoon', 'pliers', 'map']);
for (const s of STATIONS) {
  if (inKho.has(s.id)) continue;
  const p = findPath(-27, -19.5, s.x, s.z);
  const l = p[p.length - 1];
  if (Math.hypot(l[0] - s.x, l[1] - s.z) > s.r) fail(`Không có đường đi tới trạm ${s.id}`);
}
console.log(bad ? `${bad} lỗi` : 'Bản đồ ổn: tuyến tuần tra, trạm, cổng khoá, đường đi đều hợp lệ');
process.exit(bad ? 1 : 0);
