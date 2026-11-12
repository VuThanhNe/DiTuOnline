// Đo băng thông: N người chơi giả đi lung tung trong 1 phòng, in KB/s và MB/giờ mỗi người.
import { Room } from './game.js';
import { blocked } from '../shared/sim.js';

const N = Number(process.argv[2]) || 30;
const SECS = Number(process.argv[3]) || 60;
const room = new Room(1);
let bytes = 0;
const mk = () => ({ readyState: 1, send: (s) => { bytes += s.length; } });
const ps = [];
for (let i = 0; i < N; i++) ps.push(room.addPlayer(mk(), 'Bot' + i));
// rải người chơi khắp bản đồ
for (const p of ps) { for (let k = 0; k < 200; k++) { const x = -38 + Math.random() * 76, z = -28 + Math.random() * 56; if (!blocked(x, z)) { p.x = x; p.z = z; break; } } }
bytes = 0;
const dir = ps.map(() => [0, 0]);
for (let tk = 0; tk < SECS * 30; tk++) {
  if (tk % 30 === 0) for (let i = 0; i < N; i++) dir[i] = Math.random() < 0.2 ? [0, 0] : [Math.random() * 2 - 1, Math.random() * 2 - 1];
  for (let i = 0; i < N; i++) room.setInput(ps[i], { mx: dir[i][0], mz: dir[i][1], act: false, seq: tk });
  room.tick(1 / 30);
}
const kbs = bytes / 1024 / SECS / N;
console.log(`${N} người, ${SECS}s mô phỏng: ${kbs.toFixed(1)} KB/s/người = ${(kbs * 3.6).toFixed(0)} MB/giờ/người`);
