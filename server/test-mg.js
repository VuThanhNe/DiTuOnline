// Kiểm thử tiến trình minigame: độ khó thích ứng, hạng/chuỗi, cược, hợp đồng, mức nóng (không cần mạng).
import { Room } from './game.js';
import { PHASES, STATIONS } from '../shared/map.js';
let bad = 0;
const ok = (c, m) => { if (!c) { bad++; console.log('✗', m); } else console.log('✓', m); };
const fakeWs = (log) => ({ readyState: 1, send: (s) => log.push(JSON.parse(s)) });
const run = (room, secs) => { for (let i = 0; i < secs * 30; i++) room.tick(1 / 30); };
const setPhase = (room, i) => { room.phase = i; room.phaseT = PHASES[i].dur; for (const p of room.players.values()) p.done = {}; };
const park = (room) => { for (const g of room.guards) { g.x = 38; g.z = 28; g.wait = 9999; g.alert = null; g.returning = false; g.chase = null; } };
const input = (room, p, act) => room.setInput(p, { mx: 0, mz: 0, act, seq: 1 });
const open = (room, p) => { input(room, p, false); room.tick(1 / 30); input(room, p, true); room.tick(1 / 30); input(room, p, false); return p.mg; };
const finish = (room, p, score) => { const g = p.mg; run(room, Math.max(g.min, 3) + 0.5); room.mgDone(p, g.token, score); };

const room = new Room(1);
room.updateLights = () => {}; room.event = null; room.rollEvent = () => {};
const log = [];
const A = room.addPlayer(fakeWs(log), 'An');
park(room);

// ----- Tham số theo độ khó -----
const byKind = (k) => STATIONS.find((s) => s.mg === k && !['dig', 'fence', 'item'].includes(s.kind));
const base = (k) => room.mgParams(byKind(k), 0), hard = (k) => room.mgParams(byKind(k), 6);
ok(base('sort').n === 9 && hard('sort').n > base('sort').n, `sort: ${base('sort').n} -> ${hard('sort').n} mục`);
ok(hard('wires').n <= 5 && hard('wires').limit < 28, `wires: tối đa 5 dây, hạn ${hard('wires').limit}s`);
ok(hard('keys').seq.length > base('keys').seq.length && hard('keys').limit < base('keys').limit, `keys: ${base('keys').seq.length} -> ${hard('keys').seq.length} phím, hạn ${base('keys').limit} -> ${hard('keys').limit}s`);
ok(hard('timing').zone < base('timing').zone && hard('timing').rounds > base('timing').rounds, `timing: vùng ${base('timing').zone} -> ${hard('timing').zone.toFixed(2)}, vòng ${hard('timing').rounds}`);
for (const k of ['memory', 'pairs', 'clean', 'mash', 'balance', 'pong', 'kick', 'bricks', 'marbles']) {
  if (!byKind(k)) continue;
  ok(JSON.stringify(hard(k)) !== JSON.stringify(base(k)), `${k}: tham số đổi khi khó nhất`);
}
ok(hard('bricks').target <= 22 && (!byKind('pairs') || hard('pairs').limit >= 20), 'Trần tham số hợp lệ (gạch ≤ 22, thẻ còn đủ giờ)');
const dig = STATIONS.find((s) => s.kind === 'dig'), dp0 = room.mgParams(dig, 0), dp6 = room.mgParams(dig, 6);
ok(dp6.zone === dp0.zone && dp6.rounds === dp0.rounds && dp6.need === dp0.need, 'Đào hầm không bị scale độ khó');
const fence = STATIONS.find((s) => s.kind === 'fence');
ok(room.mgParams(fence, 6).seq.length === room.mgParams(fence, 0).seq.length, 'Cắt hàng rào giữ nguyên độ khó');

// ----- Một lượt minigame thật -----
const s = STATIONS.find((x) => x.kind === 'work' && x.mg === 'timing') || STATIONS.find((x) => x.kind === 'work' && x.mg && x.mg !== 'hilo');
setPhase(room, s.phases[0]);
A.x = s.x; A.z = s.z; A.en = 100; park(room);
ok(open(room, A) !== null, `Mở minigame ${s.mg} ở ${s.id}`);
const d0 = room.mgDifficulty(A, s.mg);
ok(d0 === 0, `Người mới, ngày 1: độ khó 0 (${d0})`);
const pts0 = A.pts;
finish(room, A, 1);
ok(A.pts > pts0 && A.streak === 1, `Hoàn hảo: +${A.pts - pts0} điểm, chuỗi ${A.streak}`);
ok(A.mst[s.mg] >= 0.4 - 1e-9, `Lên cấp thành thạo (${A.mst[s.mg].toFixed(2)})`);
ok(A.contracts.some((c) => c.type === 'good' && c.prog === 1), 'Hợp đồng "Tốt trở lên" tiến 1');
const offer = log.filter((m) => m.t === 'bet').pop();
ok(offer && offer.n === 1 && offer.mul > 1, `Có lời mời cược vòng 1 (x${offer && offer.mul})`);

// ----- Cược: thắng -----
A.en = 100; park(room); run(room, 0.1); A.x = s.x; A.z = s.z; run(room, 0.1);
room.betGo(A);
ok(A.mg && A.mg.bet === 1, 'Nhận cược: vòng khó hơn bắt đầu');
const sent = log.filter((m) => m.t === 'mg').pop();
ok(sent && /Cược vòng 1/.test(sent.title), `Tiêu đề có cược: "${sent && sent.title}"`);
ok(A.mg.D >= 1.5, `Vòng cược khó hơn (D=${A.mg.D.toFixed(1)})`);
const pts1 = A.pts;
finish(room, A, 1);
ok(A.pts - pts1 >= (pts1 - pts0), `Thắng cược thưởng không ít hơn lượt thường (${A.pts - pts1} vs ${pts1 - pts0})`);
ok(A.streak === 2, `Chuỗi tăng (x${A.streak})`);

// ----- Cược: thua -----
A.en = 100; park(room); A.x = s.x; A.z = s.z; run(room, 0.1);
room.betGo(A);
ok(A.mg && A.mg.bet === 2, 'Cược vòng 2');
const pts2 = A.pts, en2 = A.en;
finish(room, A, 0.1);
ok(A.pts < pts2, `Thua cược mất điểm (${pts2} -> ${A.pts})`);
ok(A.en <= en2 - 5 + 1e-6, 'Thua cược mất ≥ 5 sức');
ok(A.streak === 0, 'Thua thì mất chuỗi');
ok(!A.offer, 'Thua thì không có lời mời cược mới');

// ----- Hỏng thường -----
A.en = 100; A.x = s.x; A.z = s.z; park(room); run(room, 0.1);
open(room, A); finish(room, A, 0);
ok(A.streak === 0 && A.en <= 95 + 1e-6, 'Hỏng hoàn toàn: mất chuỗi và 5 sức');

// ----- Lời mời cược hết hạn / sai trạm -----
A.offer = { sid: s.id, bet: 1, exp: room.clock - 1 };
room.betGo(A);
ok(!A.mg, 'Lời mời hết hạn thì không bắt đầu');

// ----- Hợp đồng hoàn thành -----
A.contracts = [{ type: 'perfect', label: 'x', need: 1, prog: 0, done: false, rew: { pts: 20, jack: 7 }, seen: [] }];
const j0 = A.jack, p0 = A.pts;
A.en = 100; A.x = s.x; A.z = s.z; park(room); run(room, 0.1);
open(room, A); finish(room, A, 1);
ok(A.contracts[0].done && A.jack >= j0 + 7 && A.pts >= p0 + 20, 'Hoàn thành hợp đồng: nhận điểm + Jack');

// ----- Cấp thành thạo làm khó hơn -----
A.mst[s.mg] = 5;
ok(room.mgDifficulty(A, s.mg) >= 5, `Cấp 5 -> độ khó ${room.mgDifficulty(A, s.mg).toFixed(1)}`);
room.day = 6;
ok(room.mgDifficulty(A, s.mg) === 6, 'Độ khó bị chặn ở 6');

// ----- Hợp đồng mới mỗi ngày -----
const before = A.contracts;
room.phase = PHASES.length - 1; room.phaseT = 0.01;
run(room, 0.2);
ok(A.contracts !== before && A.contracts.length === 3 && A.contracts.every((c) => !c.done), 'Sang ngày mới: 3 hợp đồng mới');

// ----- Mức nóng -----
A.heat = 0; room.addHeat(A, 30);
ok(A.heat === 30, 'Thêm nóng');
run(room, 10);
ok(A.heat < 30 && A.heat > 20, `Nóng nguội dần (${A.heat.toFixed(1)})`);
room.addHeat(A, 500);
ok(A.heat === 100, 'Nóng chặn ở 100');

// ----- Snapshot có dữ liệu mới -----
log.length = 0; A.lastSlow = null; room.sendSnapshots();
const snap = log.find((m) => m.t === 's');
ok(snap && snap.me.heat >= 0 && snap.me2 && Array.isArray(snap.me2.ct) && snap.me2.ct.length === 3 && 'st' in snap.me2, 'Snapshot gửi hợp đồng, chuỗi, mức nóng');

console.log(bad ? `\n${bad} kiểm thử lỗi` : '\nTất cả kiểm thử minigame đạt');
process.exit(bad ? 1 : 0);
