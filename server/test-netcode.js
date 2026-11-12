// Mô phỏng mạng trễ để kiểm thử thuật toán dự đoán + đối chiếu vị trí (shared/predict.js) với server thật (Room).
// Thời gian ảo, chạy nhanh: server 30 nhịp/giây, client 60 khung hình/giây, input mỗi 50 ms, mỗi chiều trễ `lag` + ngẫu nhiên tới `jitter` ms
// (giữ đúng thứ tự gói như TCP). Người chơi chạy (Shift) liên tục, đổi hướng mỗi 1,27 giây (cố ý lệch nhịp gửi 50 ms), 60 giây.
// So sánh thuật toán CŨ (trước tối ưu, chép lại ở đây để đối chứng) với thuật toán MỚI đang dùng trong game.
import { Room } from './game.js';
import { stepMove, moveSpeed } from '../shared/sim.js';
import { predictFromServer, correctionFor } from '../shared/predict.js';

let bad = 0;
const ok = (c, m) => { if (!c) { bad++; console.log('✗', m); } else console.log('✓', m); };

// bộ sinh số ngẫu nhiên cố định để kết quả lặp lại được
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

function simulate({ lag, jitter, algo, secs = 60, seed = 7, stallEvery = 0, stallMs = 0 }) {
  const rand = rng(seed);
  const realNow = Date.now, realRandom = Math.random;
  let vt = 0; // thời gian ảo (ms)
  Date.now = () => 1_000_000 + vt;
  Math.random = rand;
  try {
    const room = new Room(1);
    const toClient = []; // { at, m }
    let inAt = 0, outAt = 0;
    const delay = (prev) => Math.max(prev, vt + lag + rand() * jitter);
    const ws = { readyState: 1, send(s) { const m = JSON.parse(s); if (m.t === 's') { inAt = delay(inAt); toClient.push({ at: inAt, m }); } } };
    const p = room.addPlayer(ws, 'Sim');
    room.phase = 2; room.phaseT = 1e9; room.event = null; room.rollEvent = () => {};
    for (const g of room.guards) { g.x = 60; g.z = 44; g.wait = 1e9; g.alert = null; g.chase = null; }
    room.noise = () => {};
    p.x = 0; p.z = -8; p.t0 = -1e9;

    const me = { x: p.x, z: p.z, labor: 0, boost: 0, en: 100 };
    const hist = [], toServer = [];
    let seq = 0, visX = 0, visZ = 0, lastSend = -100, sentMx = 0, sentMz = 0, sentRun = false;
    const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    const stat = { counted: 0, snaps: 0, pulled: 0, visibleJumps: 0, maxVisOff: 0, maxErr: 0 };
    let cur = { mx: 0, mz: 0, run: true };
    let nextTick = 0, nextFrame = 0, nextInput = 0, lastTickAt = 0, stallUntil = 0, nextStall = stallEvery;
    const moveEnd = (secs - 2) * 1000; // 2 giây cuối đứng yên để xem có hội tụ về đúng vị trí server không

    for (vt = 0; vt < secs * 1000; vt++) {
      // hướng điều khiển hiện tại
      if (vt < moveEnd) { const d = dirs[Math.floor(vt / 1270) % 4]; cur = { mx: d[0], mz: d[1], run: true }; } else cur = { mx: 0, mz: 0, run: false };
      // gói input tới server
      while (toServer.length && toServer[0].at <= vt) { const o = toServer.shift().m; room.setInput(p, o); }
      // nhịp server (có thể bị khựng: stallEvery/stallMs mô phỏng CPU dùng chung)
      if (stallEvery && vt >= nextStall) { stallUntil = vt + stallMs; nextStall += stallEvery; }
      if (vt >= nextTick && vt >= stallUntil) {
        let dt = Math.min(0.25, (vt - lastTickAt) / 1000) || 1 / 30; lastTickAt = vt;
        while (dt > 1e-6) { const s = Math.min(dt, 0.05); p.en = 100; room.tick(s); dt -= s; } // chạy bù bằng bước con, giống server/index.js
        nextTick = vt + 1000 / 30;
      }
      // client gửi input mỗi 50 ms
      const changed = cur.mx !== sentMx || cur.mz !== sentMz || cur.run !== sentRun; // client gửi ngay khi đổi hướng (cách lần trước >= 25 ms)
      if (vt >= nextInput || (changed && vt - lastSend >= 25)) {
        nextInput = vt + 50; seq++; lastSend = vt; sentMx = cur.mx; sentMz = cur.mz; sentRun = cur.run;
        hist.push({ seq, mx: cur.mx, mz: cur.mz, sneak: false, run: cur.run, t: vt });
        if (hist.length > 60) hist.shift();
        outAt = delay(outAt);
        toServer.push({ at: outAt, m: { mx: cur.mx, mz: cur.mz, act: false, sneak: false, run: cur.run, seq, ct: vt } });
      }
      // khung hình client: tự di chuyển (dự đoán)
      if (vt >= nextFrame) {
        nextFrame = vt + 1000 / 60;
        if (cur.mx || cur.mz) stepMove(me, cur.mx, cur.mz, 1 / 60, moveSpeed({ boost: me.boost, en: me.en, sneak: false, run: cur.run }));
        const kd = Math.exp(-(1 / 60) * 9); visX *= kd; visZ *= kd;
      }
      // snapshot tới client
      while (toClient.length && toClient[0].at <= vt) {
        const m = toClient.shift().m.me;
        const moving = !!(cur.mx || cur.mz);
        if (algo === 'old') {
          const d = Math.hypot(m.x - me.x, m.z - me.z);
          if (d > 3) { stat.snaps++; stat.visibleJumps++; stat.pulled += d; me.x = m.x; me.z = m.z; hist.length = 0; continue; }
          while (hist.length && hist[0].seq <= m.seq) hist.shift();
          const tmp = { x: m.x, z: m.z, labor: 0 };
          for (let i = 0; i < hist.length; i++) {
            const h = hist[i]; let dur = Math.min(0.4, ((i + 1 < hist.length ? hist[i + 1].t : vt) - h.t) / 1000);
            const sp = moveSpeed({ boost: 0, en: me.en, sneak: false, run: h.run });
            while (dur > 1e-4) { const s = Math.min(dur, 1 / 30); if (h.mx || h.mz) stepMove(tmp, h.mx, h.mz, s, sp); dur -= s; }
          }
          const ex = tmp.x - me.x, ez = tmp.z - me.z, err = Math.hypot(ex, ez);
          stat.maxErr = Math.max(stat.maxErr, err);
          let k = 0;
          if (err > 2.5) { k = 1; stat.snaps++; } else if (err > 0.3) { k = 0.25; stat.counted++; } else if (!moving && err > 0.02) k = 0.3;
          if (k) { me.x += ex * k; me.z += ez * k; stat.pulled += err * k; if (err * k > 0.08) stat.visibleJumps++; } // thuật toán cũ: dịch thẳng vị trí -> thấy giật
        } else {
          const t = predictFromServer(m, hist, vt, me), ex = t.x - me.x, ez = t.z - me.z, err = Math.hypot(ex, ez);
          stat.maxErr = Math.max(stat.maxErr, err);
          const c = correctionFor(err, moving, me);
          if (c.counted) stat.counted++;
          if (c.snap) { stat.snaps++; stat.visibleJumps++; stat.pulled += err; me.x = t.x; me.z = t.z; visX = visZ = 0; }
          else if (c.k) { const cx = ex * c.k, cz = ez * c.k; me.x += cx; me.z += cz; visX -= cx; visZ -= cz; stat.pulled += err * c.k; } // mới: phần sửa được làm mượt (visOff), không giật
          stat.maxVisOff = Math.max(stat.maxVisOff, Math.hypot(visX, visZ));
        }
      }
    }
    stat.finalGap = Math.hypot(me.x - p.x, me.z - p.z);
    return stat;
  } finally { Date.now = realNow; Math.random = realRandom; }
}

const fmt = (s) => `sửa ${String(s.counted).padStart(3)} lần, nhảy thẳng ${s.snaps}, giật thấy được ${String(s.visibleJumps).padStart(3)}, tổng bị kéo ${s.pulled.toFixed(1).padStart(6)} m, lệch lớn nhất ${s.maxErr.toFixed(2)} m, cuối cùng cách server ${s.finalGap.toFixed(3)} m`;
const cases = [
  { name: 'mạng nội bộ (0 ms)', lag: 0, jitter: 0 },
  { name: 'Singapore (30±10 ms mỗi chiều)', lag: 30, jitter: 10 },
  { name: 'Mỹ (120±30 ms mỗi chiều)', lag: 120, jitter: 30 },
  { name: 'Mỹ, mạng xấu (150±60 ms)', lag: 150, jitter: 60 },
  { name: 'Mỹ + server khựng 150 ms mỗi 2 giây', lag: 120, jitter: 30, stallEvery: 2000, stallMs: 150 },
];
const results = [];
for (const c of cases) {
  const o = simulate({ ...c, algo: 'old' }), n = simulate({ ...c, algo: 'new' });
  results.push({ c, o, n });
  console.log(`\n${c.name}`);
  console.log('  cũ :', fmt(o));
  console.log('  mới:', fmt(n), `(lệch hiển thị lớn nhất ${n.maxVisOff.toFixed(2)} m)`);
}
console.log('');
for (const { c, o, n } of results) {
  ok(n.snaps === 0, `${c.name}: không lần nào bị nhảy thẳng vị trí`);
  ok(n.finalGap < 0.05, `${c.name}: đứng yên thì hội tụ đúng vị trí server (${n.finalGap.toFixed(3)} m)`);
  ok(n.visibleJumps <= o.visibleJumps, `${c.name}: số lần giật thấy được không tệ hơn thuật toán cũ (${n.visibleJumps} so với ${o.visibleJumps})`);
}
const us = results[2].n, bad150 = results[3].n;
ok(us.counted <= 8, `Độ trễ kiểu server ở Mỹ: bị sửa vị trí không quá 8 lần trong 60 giây chạy liên tục (${us.counted})`);
ok(bad150.counted <= 20, `Mạng xấu 150±60 ms: bị sửa vị trí không quá 20 lần trong 60 giây (${bad150.counted})`);

console.log(bad ? `\n${bad} kiểm thử lỗi` : '\nTất cả kiểm thử đồng bộ mạng đạt');
process.exit(bad ? 1 : 0);
