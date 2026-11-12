// Kiểm thử logic phòng chơi với người chơi giả (không cần mạng).
import { Room } from './game.js';
import { LIGHTS, LIGHTHOUSE, spotAt, PHASES, STATIONS, RULES, GATES, SHOP, DEALER, ZONES, zoneAt } from '../shared/map.js';
import { blocked } from '../shared/sim.js';
let bad = 0;
const ok = (c, m) => { if (!c) { bad++; console.log('✗', m); } else console.log('✓', m); };

function fakeWs(log) { return { readyState: 1, send: (s) => log.push(JSON.parse(s)) }; }
const run = (room, secs) => { for (let i = 0; i < secs * 30; i++) room.tick(1 / 30); };
const st = (id) => STATIONS.find((s) => s.id === id);
const setPhase = (room, i) => { room.phase = i; room.phaseT = PHASES[i].dur; for (const p of room.players.values()) p.done = {}; };
const input = (room, p, mx, mz, act) => { room.setInput(p, { mx, mz, act, seq: 1 }); };
// giữ input sống (server coi input quá 400ms là rỗng)
const runIn = (room, p, mx, mz, act, secs) => { for (let i = 0; i < secs * 30; i++) { input(room, p, mx, mz, act); room.tick(1 / 30); } };
// Đưa quản giáo ra xa và vô hiệu hoá tiếng động
const park = (room) => { for (const g of room.guards) { g.x = 38; g.z = 28; g.wait = 9999; g.alert = null; g.returning = false; g.chase = null; } for (const p of room.players.values()) p.chased = false; };
// Nhấn E để mở minigame rồi nộp kết quả sau khi đủ thời gian
const mg = (room, p, score, secs = 3) => {
  input(room, p, 0, 0, false); room.tick(1 / 30);
  input(room, p, 0, 0, true); room.tick(1 / 30);
  input(room, p, 0, 0, false);
  const g = p.mg;
  if (!g) return false;
  run(room, secs);
  room.mgDone(p, g.token, score);
  return true;
};
const withRandom = (v, fn) => { const o = Math.random; Math.random = () => v; try { fn(); } finally { Math.random = o; } };

const room = new Room(1);
room.updateLights = () => {}; // tắt đèn pha để các thử nghiệm cũ không bị ngẫu nhiên
const logA = [], logB = [];
const A = room.addPlayer(fakeWs(logA), 'An');
const B = room.addPlayer(fakeWs(logB), 'Bình');
ok(room.size === 2, 'Hai người chơi vào phòng');
ok(room.guards.length >= 6, `Có nhiều quản giáo (${room.guards.length})`);
park(room);

// Va chạm tường
A.x = -34.5; A.z = -21.5;
runIn(room, A, 0, -1, false, 4);
ok(A.z > -27, `Tường chặn người chơi (z=${A.z.toFixed(2)})`);

// Trạm bữa ăn đúng giờ (giữ E): điểm + năng lượng
setPhase(room, 1);
A.x = st('meal').x; A.z = -22.5; A.en = 50;
const before = A.pts;
runIn(room, A, 0, 0, true, 3.4);
ok(A.pts === before + 8, `Ăn sáng nhận 8 điểm (pts=${A.pts})`);
ok(A.en >= 80, `Ăn cơm hồi năng lượng (en=${A.en.toFixed(0)})`);
runIn(room, A, 0, 0, true, 3.4);
ok(A.pts === before + 8, 'Không nhận thêm lượt ăn trong cùng bữa');

// Sai giờ
setPhase(room, 2);
A.x = st('meal').x; A.z = -22.5;
runIn(room, A, 0, 0, true, 3.5);
ok(A.pts === before + 8 && A.near && !A.near.ok, 'Sai giờ ăn không được điểm');

// Lao động bằng minigame: điểm + Jack + ca lao động, có trần cap
park(room);
A.pts = 0; A.jack = 0; A.labor = 0; A.en = 100; A.x = st('work1').x; A.z = st('work1').z - 0.9;
for (let i = 0; i < 6; i++) mg(room, A, 0.7, 2);
ok(A.pts === 25 && A.jack === 30 && A.labor === 5, `Lao động tối đa 5 lượt (pts=${A.pts}, jack=${A.jack}, labor=${A.labor})`);
ok(A.en < 100 - 5 * 12 + 15, `Làm việc tốn năng lượng (en=${A.en.toFixed(0)})`);

// Gửi kết quả quá nhanh thì không tính; điểm 0 thì không có thưởng
setPhase(room, 2);
A.pts = 0; A.labor = 0; A.en = 100;
mg(room, A, 1, 0.2);
ok(A.pts === 0 && A.labor === 0, 'Nộp minigame quá nhanh bị coi là làm ẩu');
setPhase(room, 2);
mg(room, A, 0.3, 2); // 0.3 => nửa điểm, không tính ca lao động
ok(A.pts === 3 && A.labor === 0, `Làm ẩu: điểm giảm và không tính ca lao động (pts=${A.pts}, labor=${A.labor})`);
const tok = (() => { setPhase(room, 2); input(room, A, 0, 0, false); room.tick(1 / 30); input(room, A, 0, 0, true); room.tick(1 / 30); return A.mg?.token; })();
room.mgDone(A, 'sai-token', 1);
ok(A.mg && A.mg.token === tok, 'Token sai không được chấp nhận');
room.cancelMg(A);

// Cổng khoá theo số ca lao động
const gate = GATES[0];
A.labor = gate.need - 1; A.x = 35.1; A.z = -20.2; A.hold = null;
runIn(room, A, 0, -1, false, 1.5);
ok(A.z > gate.z2, `Chưa đủ ca lao động: không vào được ${gate.name} (z=${A.z.toFixed(2)})`);
A.labor = gate.need; A.x = 35.1; A.z = -20.2;
runIn(room, A, 0, -1, false, 1.5);
ok(A.z < gate.z1, `Đủ ca lao động: vào được ${gate.name} (z=${A.z.toFixed(2)})`);

// Lấy đồ lậu bằng minigame bẻ khoá
setPhase(room, 5); park(room);
A.en = 100; A.items = {};
A.x = st('spoon').x; A.z = st('spoon').z + 0.5;
mg(room, A, 0.5, 2);
ok(!A.items.spoon, 'Bẻ khoá kém thì không lấy được thìa');
setPhase(room, 5); park(room);
mg(room, A, 1, 7);
ok(A.items.spoon === true, 'Bẻ khoá tốt lấy được thìa');

// Bắt giữ ban đêm
setPhase(room, 6); park(room);
const g = room.guards[0];
g.wait = 999; g.x = -12; g.z = -11.5; g.heading = Math.PI / 2; g.ry = Math.PI / 2; // nhìn về +x
B.x = -6; B.z = -11.5; B.pts = 30; B.jail = 0; B.touchCd = 99; B.bombHeat = 99; // vi phạm (ném bom) để quản giáo bắt
runIn(room, B, 0, 0, false, 1.4);
ok(g.chase && B.chased && B.jail === 0, 'Bị phát hiện: quản giáo lao tới rượt chứ chưa bị bắt ngay');
runIn(room, B, 0, 0, false, 3);
ok(B.jail > 0, `Bị quản giáo đuổi kịp và bắt khi vi phạm (jail=${B.jail.toFixed(1)})`);
ok(B.pts === 20, `Bị trừ 10 điểm (pts=${B.pts})`);
ok(logB.some((m) => m.t === 'caught'), 'Client nhận thông báo bị bắt'); B.bombHeat = 0;
runIn(room, B, 0, 0, false, 21);
ok(B.jail === 0 && B.x < -17, 'Được thả khỏi biệt giam về buồng');

// Tường chắn tầm nhìn
park(room); g.wait = 999;
B.x = 20; B.z = -15; B.detect = 0; B.touchCd = 99; B.bombHeat = 99;
g.x = 20; g.z = -11.5; g.heading = Math.PI; g.ry = Math.PI;
runIn(room, B, 0, 0, false, 2);
ok(B.jail === 0, 'Tường chắn tầm nhìn: không bắt xuyên tường');
B.x = 26; B.z = -15; B.detect = 0; g.x = 26; g.z = -11.5; B.bombHeat = 99;
runIn(room, B, 0, 0, false, 4);
ok(B.jail > 0, 'Đối chứng: qua khe cửa thì bị bắt');
B.jail = 0; B.detect = 0; B.bombHeat = 0;

// Tiếng động thu hút quản giáo (đi theo đường, không xuyên tường)
park(room);
setPhase(room, 6);
const gh = room.guards[2];
gh.x = -12; gh.z = -11.5; gh.wait = 0; gh.route = [[-12, -11.5], [-12, -11.5]];
A.x = st('dig').x; A.z = -23; A.items = { spoon: true, pliers: true }; A.en = 100; A.jail = 0; A.detect = -999; A.hold = null; // đào hầm cần thìa + kìm
const d0 = Math.hypot(gh.x - A.x, gh.z - A.z);
input(room, A, 0, 0, false); room.tick(1 / 30); input(room, A, 0, 0, true); room.tick(1 / 30);
ok(!!A.mg && !!gh.alert, 'Đào hầm gây tiếng động làm quản giáo cảnh giác');
let clipped = false;
for (let i = 0; i < 150; i++) { room.tick(1 / 30); if (blocked(gh.x, gh.z, 0.3, 0)) clipped = true; A.detect = -999; }
ok(Math.hypot(gh.x - A.x, gh.z - A.z) < d0 - 5, `Quản giáo chạy tới chỗ có tiếng động (${d0.toFixed(1)} → ${Math.hypot(gh.x - A.x, gh.z - A.z).toFixed(1)})`);
ok(!clipped, 'Quản giáo đi vòng theo đường, không xuyên tường');
room.cancelMg(A);
A.detect = 0; park(room);

// Chợ đen: mua, tỉ lệ bị lừa, giới hạn thuốc nổ
setPhase(room, 5);
const shop = st('shop');
A.x = shop.x; A.z = shop.z; A.jack = 500; A.items = {}; A.stock = { reddog: 0, bomb: 0 }; A.bombBuys = 0; A.jail = 0; A.stun = 0;
withRandom(0.9, () => room.buy(A, 'reddog'));
ok(A.stock.reddog === 1 && A.jack === 485, `Mua Reddog thành công (jack=${A.jack})`);
withRandom(0.1, () => room.buy(A, 'reddog'));
ok(A.stock.reddog === 1 && A.jack === 470, 'Bị Tày Scam lừa: mất Jack mà không nhận hàng');
withRandom(0.9, () => { room.buy(A, 'bomb'); room.buy(A, 'bomb'); room.buy(A, 'bomb'); });
ok(A.stock.bomb === 2 && A.bombBuys === 2, `Chỉ mua được 2 thuốc nổ mỗi ngày (bomb=${A.stock.bomb})`);
withRandom(0.9, () => { room.buy(A, 'rope'); room.buy(A, 'torch'); room.buy(A, 'rope'); });
ok(A.items.rope && A.items.torch, 'Mua được dây thừng và đèn pin');
const j = A.jack; A.jack = 5; withRandom(0.9, () => room.buy(A, 'rope')); ok(A.jack === 5, 'Không đủ Jack thì không mua được');
A.jack = j;
A.x = 0; A.z = 0; withRandom(0.9, () => room.buy(A, 'torch'));
ok(A.jack === j, 'Đứng xa chợ đen thì không mua được');
// sang ngày mới thì được mua lại
setPhase(room, 6); room.phaseT = 0.01; run(room, 0.2);
ok(A.bombBuys === 0, 'Sang ngày mới: giới hạn mua thuốc nổ được làm mới');

// Reddog: tăng tốc và hồi năng lượng
A.en = 20; A.boost = 0; A.jail = 0; A.stun = 0;
room.drink(A);
ok(A.boost > 29 && A.en === 60 && A.stock.reddog === 0, 'Uống Reddog: tăng tốc 30s và +40 năng lượng');
park(room); A.x = -10; A.z = 0; A.detect = -999; setPhase(room, 5);
const x0 = A.x; runIn(room, A, 1, 0, false, 1);
const fast = A.x - x0;
A.boost = 0; A.x = -10; const x1 = A.x; runIn(room, A, 1, 0, false, 1);
ok(fast > (A.x - x1) * 1.3, `Reddog giúp chạy nhanh hơn (${fast.toFixed(1)} vs ${(A.x - x1).toFixed(1)})`);

// Hết năng lượng: không làm việc được
setPhase(room, 2); park(room);
A.en = 0; A.x = st('work1').x; A.z = st('work1').z - 0.9; A.detect = 0;
runIn(room, A, 0, 0, false, 0.2);
ok(A.near && !A.near.ok, 'Hết năng lượng thì không bắt đầu được việc');
// ngủ hồi năng lượng
setPhase(room, 5); A.en = 10; A.x = st('bed1').x; A.z = st('bed1').z;
runIn(room, A, 0, 0, true, 3);
ok(A.en > 30, `Ngủ trên giường hồi năng lượng (en=${A.en.toFixed(0)})`);

// Ném bom: sát thương, hết máu bị nhốt 30s trong phòng quản giáo
park(room);
B.jail = 0; B.stun = 0; B.hp = 30; B.x = -10; B.z = 0; B.detect = -999; B.touchCd = 99; B.items = { map: true };
A.x = -12; A.z = 0; A.ry = Math.PI / 2; A.stock.bomb = 1; A.hp = 100; A.detect = -999; A.touchCd = 99;
const gb = room.guards[3]; gb.x = 20; gb.z = 0; gb.wait = 0; gb.route = [[20, 0], [20, 0]];
room.event = null; // tránh mưa ngẫu nhiên làm tiếng nổ nhỏ đi
room.throwBomb(A);
ok(room.bombs.length === 1 && A.stock.bomb === 0, 'Ném bom thành công');
run(room, 3);
ok(B.hp === 0 && B.jail > 29 && B.jailKind === 'office', `Hết máu bị nhốt ${RULES.hpJailSeconds}s (jail=${B.jail.toFixed(1)})`);
ok(zoneAt(B.x, B.z) === 'office', 'Bị nhốt trong phòng quản giáo');
ok(Object.keys(B.items).length === 0, 'Bị tịch thu đồ khi bị nhốt');
ok(!!gb.alert, 'Tiếng nổ làm quản giáo ở xa cũng chạy tới');
ok(A.hp < 100, `Đứng gần chỗ nổ cũng bị thương (hp=${A.hp})`);
run(room, 31);
ok(B.jail === 0 && B.hp >= RULES.hpAfterJail && B.hp < RULES.hpAfterJail + 3 && B.x < -17, 'Hết 30 giây được thả, hồi một phần máu');

// Đến sát quản giáo: có xác suất bị đánh / lục soát
park(room); A.jail = 0; A.stun = 0; A.hp = 100; A.touchCd = 0; A.items = { spoon: true }; A.stock.bomb = 0; A.detect = 0;
setPhase(room, 5);
const gt = room.guards[0]; gt.x = -10; gt.z = -5; gt.wait = 9999; gt.heading = 0;
A.x = -10; A.z = -4; B.x = 30; B.z = 20;
withRandom(0.05, () => run(room, 0.2));
ok(A.hp === 100 - RULES.beatDamage, `Đến sát quản giáo có thể bị đánh (hp=${A.hp})`);
A.touchCd = 0; A.stun = 0; A.hp = 100;
withRandom(0.3, () => run(room, 0.2));
ok(Object.keys(A.items).length === 0, 'Đến sát quản giáo có thể bị lục soát và tịch thu đồ');
A.touchCd = 0; A.stun = 0; A.items = {}; A.hp = 100;
withRandom(0.99, () => run(room, 0.2));
ok(A.hp === 100, 'Cũng có lúc quản giáo bỏ qua');

// Đào hầm cả phòng + vượt ngục (cần đủ 4 dụng cụ)
park(room); setPhase(room, 6);
A.jail = 0; B.jail = 0; A.stun = 0; B.stun = 0; A.detect = 0; B.detect = 0; A.touchCd = 99; B.touchCd = 99;
A.x = st('dig').x; A.z = -23; A.items = { spoon: true, pliers: true, map: true, rope: true, torch: true }; A.hold = null; A.en = 100; A.boost = 0;
B.x = st('dig').x + 0.8; B.z = -23; B.items = { spoon: true, pliers: true, map: true }; B.en = 100; B.boost = 0; B.hp = 100;
const pr0 = room.dig.pr;
for (let i = 0; i < 8 && !room.dig.open; i++) { park(room); A.detect = 0; B.detect = 0; mg(room, A, 1, 5); park(room); mg(room, B, 1, 5); } // việc giá trị cao (đào hầm) có sàn thời gian 4s
ok(room.dig.pr > pr0 && room.dig.open, `Hầm thông nhờ cả hai cùng đào (pr=${room.dig.pr.toFixed(1)})`);
park(room);
runIn(room, B, 0, 0, true, 3.5);
ok(B.esc === 0 && B.near && !B.near.ok, 'Thiếu dây thừng/đèn pin thì không thoát được');
const escBefore = A.esc;
A.detect = 0; runIn(room, A, 0, 0, true, 3.5);
ok(A.esc === escBefore, `Chui hầm phải giữ E đủ ${RULES.exitHold} giây (mới 3,5 giây thì chưa thoát)`);
A.detect = 0; runIn(room, A, 0, 0, true, RULES.exitHold - 3.5 + 0.5);
ok(A.esc === escBefore + 1, 'Người đủ cả 4 dụng cụ vượt ngục thành công');
ok(Object.keys(A.items).length === 0 && A.pts === 0 && A.jack === 0 && A.labor === 0, 'Reset tù nhân sau khi vượt ngục');

// Hết đêm: hầm bị lấp
room.phaseT = 0.01; run(room, 0.2);
ok(room.phase === 0 && !room.dig.open && room.dig.pr === 0, 'Sang ngày mới: hầm bị lấp, lịch quay lại điểm danh');

// Điểm danh
park(room);
for (const p of [A, B]) { p.x = -30; p.z = -19; p.jail = 0; p.pts = 0; p.jack = 0; p.detect = 0; }
room.phaseT = 0.01; run(room, 0.2);
ok(A.pts === 10 && A.jack === 5, `Điểm danh đủ được 10 điểm + 5 Jack (pts=${A.pts})`);

// Mãn hạn tù: đủ điểm KHÔNG tự động mãn hạn, phải ra Cổng trại giữ E
park(room); setPhase(room, 1); A.pts = RULES.releasePoints - 5; A.x = st('meal').x; A.z = -22.5; A.detect = 0; A.touchCd = 99; A.done = {}; A.en = 100;
runIn(room, A, 0, 0, true, 3.4);
ok(A.rel === 0 && A.pts >= RULES.releasePoints, `Đủ ${RULES.releasePoints} điểm không tự động mãn hạn (pts=${A.pts}, rel=${A.rel})`);
A.pts = RULES.releasePoints - 1; A.x = st('exit').x; A.z = st('exit').z; A.hold = null; A.detect = 0;
runIn(room, A, 0, 0, true, 0.2);
ok(A.near && A.near.s.id === 'exit' && !A.near.ok, 'Chưa đủ điểm thì cổng trại không mở');
A.pts = RULES.releasePoints; A.detect = 0;
runIn(room, A, 0, 0, true, 2);
ok(A.rel === 0, 'Giữ E chưa đủ lâu thì chưa mãn hạn');
A.detect = 0; runIn(room, A, 0, 0, true, st('exit').hold);
ok(A.rel === 1 && A.pts === 0, 'Ra cổng trại giữ E đủ lâu: mãn hạn tù');

// Lịch sinh hoạt: bỏ bê nghĩa vụ bị cảnh cáo, đủ 3 cảnh cáo thì bị để mắt
park(room); setPhase(room, 2); room.phaseT = 0.01;
for (const gg of room.guards) { gg.x = 38; gg.z = 28; }
A.x = -30; A.z = -19; A.pts = 20; A.warn = 0; A.done = {}; A.t0 = -999; A.jail = 0; A.chased = false;
run(room, 0.2);
ok(A.warn === 1 && A.pts === 20 - RULES.skipWorkPenalty, `Trốn lao động bị cảnh cáo và trừ điểm (warn=${A.warn}, pts=${A.pts})`);
A.warn = RULES.warnWatch - 1; A.pts = 20; setPhase(room, 1); room.phaseT = 0.01; A.done = {}; A.en = 100; A.t0 = -999;
run(room, 0.2);
ok(A.warn === RULES.warnWatch && Math.abs(A.en - (100 - RULES.skipMealEnergy)) < 1, `Bỏ bữa ăn: cảnh cáo thứ 3 và bị đói (warn=${A.warn}, en=${A.en.toFixed(1)})`);
// bị để mắt: cùng khoảng cách quản giáo nhìn thấy sớm hơn (xa hơn mức thường)
setPhase(room, 5); park(room); room.event = null; // sự kiện ngẫu nhiên (cúp điện...) làm đổi tầm nhìn nên phải cố định
const gwatch = room.guards[0]; gwatch.x = -10; gwatch.z = -5; gwatch.ry = 0; gwatch.wait = 9999; gwatch.heading = 0;
A.x = -10; A.z = -5 + RULES.guardRange * 1.1; A.bombHeat = 99; A.detect = 0; A.touchCd = 99; A.chased = false; A.jail = 0; A.mg = null; A.stun = 0;
A.warn = 0; run(room, 0.3);
const detNormal = A.detect;
A.detect = 0; A.warn = RULES.warnWatch; run(room, 0.3);
ok(detNormal === 0 && A.detect > 0, `Bị quản giáo để mắt: bị phát hiện từ xa hơn (thường ${detNormal.toFixed(2)}, để mắt ${A.detect.toFixed(2)})`);
A.warn = 0; A.bombHeat = 0; A.detect = 0; A.pts = 0;

// Mục tiêu gợi ý cho mũi tên chỉ đường
setPhase(room, 2); A.x = -27; A.z = -19.5; A.en = 100; A.done = {};
const goal = room.goalFor(A);
ok(goal && /Làm việc/.test(goal.label), `Giờ lao động: mục tiêu gợi ý là trạm làm việc (${goal && goal.label})`);

// ---- Tính năng mới ----
// Chạy thoát: quản giáo mất dấu thì bỏ cuộc
park(room); setPhase(room, 2);
A.jail = 0; A.stun = 0; A.hp = 100; A.touchCd = 99; A.detect = 0; A.x = -20; A.z = -11.5;
const gc = room.guards[0]; gc.wait = 0; gc.x = -26; gc.z = -11.5; gc.heading = Math.PI / 2; gc.ry = Math.PI / 2; gc.chase = { pid: A.id, why: 'thử', t: 0, lost: 0 }; A.chased = true;
A.x = 38.5; A.z = -11.5; // ra rất xa, khuất tầm
for (let i = 0; i < 30 * 8; i++) { input(room, A, 0, 0, false); room.tick(1 / 30); A.touchCd = 99; }
ok(!gc.chase && !A.chased && A.jail === 0, 'Chạy thoát khỏi tầm nhìn thì quản giáo bỏ cuộc');
park(room);

// Đi lén: chậm hơn
setPhase(room, 5); park(room); A.x = -10; A.z = 0; A.detect = -999; A.touchCd = 99;
let xs = A.x; for (let i = 0; i < 30; i++) { room.setInput(A, { mx: 1, mz: 0, act: false, sneak: true, seq: 1 }); room.tick(1 / 30); }
const sneakDist = A.x - xs;
A.x = -10; xs = A.x; for (let i = 0; i < 30; i++) { room.setInput(A, { mx: 1, mz: 0, act: false, sneak: false, seq: 1 }); room.tick(1 / 30); }
ok(sneakDist < (A.x - xs) * 0.7, `Đi lén chậm hơn (${sneakDist.toFixed(1)} vs ${(A.x - xs).toFixed(1)})`);

// Ném đá đánh lạc hướng
park(room); A.x = -10; A.z = 0; A.ry = Math.PI / 2; A.rockCd = 0;
const gr = room.guards[2]; gr.x = 12; gr.z = 0; gr.wait = 0; gr.route = [[12, 0], [12, 0]];
room.event = null; // mưa ngẫu nhiên làm tiếng động nhỏ đi
room.throwRock(A);
ok(!!gr.alert && A.rockCd > 5, 'Ném đá tạo tiếng động dụ quản giáo');
room.throwRock(A);
ok(A.rockCd > 5, 'Ném đá có thời gian hồi');
park(room);

// Tặng Jack
B.jail = 0; B.stun = 0; B.x = -9; B.z = 0; A.jack = 30; B.jack = 0; A.stun = 0;
room.give(A);
ok(A.jack === 30 - RULES.giveJack && B.jack === RULES.giveJack, 'Tặng Jack cho người đứng gần');

// Chợ đen "uy tín": trả thêm để giảm rủi ro bị lừa
A.x = st('shop').x; A.z = st('shop').z; A.jack = 200; A.items = {}; A.stock = { reddog: 0, bomb: 0 }; A.jail = 0;
withRandom(0.3, () => room.buy(A, 'reddog', false));
ok(A.stock.reddog === 0, 'Mua thường: 30% vẫn rơi vào vùng bị lừa (<50%)');
withRandom(0.3, () => room.buy(A, 'reddog', true));
ok(A.stock.reddog === 1 && A.jack === 200 - 15 - Math.ceil(15 * RULES.premiumMul), 'Mua "uy tín": phí cao hơn nhưng ít bị lừa hơn');

// Không ném bom trong buồng giam; ném bom là vi phạm nếu bị thấy
A.stock.bomb = 1; A.x = -30; A.z = -19; A.ry = 0;
room.throwBomb(A);
ok(A.stock.bomb === 1 && room.bombs.length === 0, 'Không ném được bom trong khu buồng giam');
A.x = -10; A.z = 0; A.touchCd = 99; A.detect = 0; setPhase(room, 5);
const gv = room.guards[0]; gv.wait = 9999; gv.x = -14; gv.z = 0; gv.heading = Math.PI / 2; gv.ry = Math.PI / 2;
room.throwBomb(A);
runIn(room, A, 0, 0, false, 1);
ok(A.detect > 0.2 || A.chased, 'Ném bom mà bị quản giáo thấy thì bị coi là vi phạm');
park(room); room.bombs.length = 0; A.detect = 0; A.chased = false; A.bombHeat = 0;

// Biệt giam: nhấn E không còn mở minigame, bắt buộc chờ hết án
A.jail = 20; A.jailKind = 'solitary'; A.x = 0; A.z = 22.5; A.actPrev = false; A.hold = null;
input(room, A, 0, 0, false); room.tick(1 / 30); input(room, A, 0, 0, true); room.tick(1 / 30);
ok(!A.mg, 'Trong biệt giam nhấn E không mở minigame giảm án');
const j0 = A.jail; run(room, 2);
ok(Math.abs((j0 - A.jail) - 2) < 0.2, 'Án biệt giam chỉ giảm theo thời gian thực');
A.jail = 0; A.mg = null;

// Cắt hàng rào: lối thoát thứ hai (cần kìm + dây thừng)
setPhase(room, 6); park(room);
for (const gg of room.guards) { gg.x = -30; gg.z = 0; }
A.jail = 0; A.stun = 0; A.en = 100; A.items = { pliers: true }; A.x = st('fence').x; A.z = st('fence').z; A.detect = 0; A.hold = null;
runIn(room, A, 0, 0, false, 0.1);
ok(A.near && A.near.s.id === 'fence' && !A.near.ok, 'Thiếu dây thừng thì không cắt được hàng rào');
A.items = { pliers: true, rope: true };
runIn(room, A, 0, 0, false, 0.1);
ok(A.near && A.near.s.id === 'fence' && !A.near.ok, 'Thiếu đèn pin thì không cắt được hàng rào');
A.items = { pliers: true, rope: true, torch: true };
const escF = A.esc;
mg(room, A, 1, 5);
ok(A.esc === escF && A.fenceCuts === 1, `Cắt xong sợi đầu chưa thoát được (fenceCuts=${A.fenceCuts}/${RULES.fenceCuts})`);
mg(room, A, 0.2, 5); // hỏng một lần là phải làm lại từ đầu
ok(A.esc === escF && A.fenceCuts === 0, 'Cắt hỏng: phải cắt lại từ sợi đầu tiên');
for (let i = 0; i < RULES.fenceCuts; i++) { A.en = 100; A.detect = 0; A.touchCd = 99; mg(room, A, 1, 5); }
ok(A.esc === escF + 1, `Cắt đủ ${RULES.fenceCuts} sợi liên tiếp mới vượt ngục thành công`);

// Sự kiện mưa làm giảm tầm tiếng động
park(room); setPhase(room, 5); room.event = 'rain';
const gm = room.guards[1]; gm.x = 0; gm.z = 0; gm.wait = 0; gm.route = [[0, 0], [0, 0]];
room.noise(14, 0, 20, null);
ok(!gm.alert, 'Trời mưa: tiếng động bị át nên quản giáo ở xa không nghe thấy');
room.event = null; room.noise(14, 0, 20, null);
ok(!!gm.alert, 'Bình thường: cùng tiếng động đó thì quản giáo nghe thấy');
park(room);

// Mất kết nối rồi vào lại
const keepX = A.x, sid = A.sid;
room.disconnect(A);
ok(A.disc && room.size === 2, 'Mất kết nối: vẫn giữ chỗ của người chơi');
const logA2 = []; room.reattach(A, fakeWs(logA2));
ok(!A.disc && logA2.some((m) => m.t === 'welcome' && m.sid === sid) && A.x === keepX, 'Vào lại được với đúng nhân vật cũ');
room.disconnect(A); run(room, RULES.reconnectSecs + 2);
ok(room.size === 1, 'Quá thời gian chờ thì người chơi bị xoá khỏi phòng');
A.ws = fakeWs(logA); A.disc = false; room.players.set(A.id, A);

// Chat: giới hạn tốc độ + lọc
logA.length = 0;
room.chat(A, 'xin chào <b>mọi người</b>'); room.chat(A, 'spam');
ok(logA.filter((m) => m.t === 'chat').length === 1 && !logA.find((m) => m.t === 'chat').m.includes('<'), 'Chat được làm sạch và giới hạn tốc độ');

// Snapshot hợp lệ
park(room);
A.lastSlow = null; // buộc gửi lại me2
run(room, 1);
const snaps = logA.filter((m) => m.t === 's');
const lastSnap = snaps.at(-1);
ok(snaps.length > 5 && snaps.some((s) => s.p.length === 2 && s.n.length === room.npcs.length), 'Gói "xa" định kỳ có đủ người chơi và NPC');
ok(room.npcs.some((n) => n.id === DEALER.id), 'Có NPC Tày Scam');
const slowAll = Object.assign({}, ...snaps.filter((s) => s.me2).map((s) => s.me2));
ok(lastSnap.me && 'hp' in lastSnap.me && 'en' in lastSnap.me && 'jack' in slowAll && 'labor' in slowAll, 'Snapshot có máu, năng lượng (me) và Jack, ca lao động (me2)');
ok(snaps[0].me2 && snaps.filter((s) => s.me2).length < snaps.length / 2, 'me2 gửi ngay lần đầu và chỉ gửi lại khi thay đổi');

// Rời phòng
room.removePlayer(B.id);
ok(room.size === 1 && logA.some((m) => m.t === 'leave'), 'Người rời phòng được broadcast');

// ---- Cập nhật mới ----
// Đang làm việc đúng giờ: quản giáo đứng sát cũng không đánh / lục soát, dù đã trừ sức
park(room); setPhase(room, 2);
A.jail = 0; A.stun = 0; A.hp = 100; A.items = { spoon: true }; A.en = 100; A.touchCd = 0; A.chased = false;
A.x = st('work1').x; A.z = st('work1').z; A.done = {};
withRandom(0, () => { mg(room, A, 1, 0); }); // mở minigame rồi nộp sau 0 giây là được (chỉ cần mở)
A.x = st('work1').x; A.z = st('work1').z; A.touchCd = 0; A.stun = 0;
input(room, A, 0, 0, false); room.tick(1 / 30); input(room, A, 0, 0, true); room.tick(1 / 30);
const gw = room.guards[0]; gw.x = A.x + 0.5; gw.z = A.z; gw.wait = 9999;
let hit = false;
withRandom(0, () => { for (let i = 0; i < 60; i++) { A.touchCd = 0; input(room, A, 0, 0, false); room.tick(1 / 30); if (A.hp < 100 || A.stun > 0 && !A.mg) hit = true; } });
ok(!hit && A.hp === 100, 'Đang làm việc ban ngày: quản giáo sát bên cũng không tấn công/lục soát');
A.mg = null;
// Đến giờ ngủ / đèn pha (phòng mới vì các người chơi cũ đã rời phòng)
const room2 = new Room(2);
const A2 = room2.addPlayer(fakeWs([]), 'Cúc'), B2 = room2.addPlayer(fakeWs([]), 'Dũng');
park(room2); A2.x = 20; A2.z = 0; B2.x = 30; B2.z = 5;
room2.phase = 5; room2.phaseT = 0.01; run(room2, 0.2);
ok(room2.phase === 6 && zoneAt(A2.x, A2.z) === 'cell' && zoneAt(B2.x, B2.z) === 'cell', 'Đến giờ ngủ: người chơi tự động về buồng');
park(room2);
ok(room2.availability(A2, st('work1')).ok, 'Ban đêm vẫn làm việc được tùy ý');
const L = LIGHTS[4];
room2.clock = 0;
const sp0 = spotAt(L, 0);
A2.x = sp0.x + 1; A2.z = sp0.z + 1; A2.jail = 0; A2.chased = false;
ok(!blocked(A2.x, A2.z, 0.45, 0) && zoneAt(A2.x, A2.z) !== 'cell', 'Vị trí thử nằm ngoài buồng');
room2.updateLights(0.03);
ok(room2.guards.some((g) => g.chase && g.chase.pid === A2.id), 'Đứng trong vòng sáng của đèn hải đăng thì quản giáo lao tới rượt');
// đứng ngoài mọi vòng sáng thì không bị chiếu
{
  for (const g of room2.guards) { g.chase = null; g.alert = null; }
  A2.chased = false; A2.detect = 0;
  const spots = LIGHTS.map((l) => spotAt(l, room2.clock));
  let safe = null;
  for (let x = -30; x <= 60 && !safe; x += 4) for (let z = -20; z <= 40 && !safe; z += 4) {
    if (blocked(x, z, 0.45, 0) || zoneAt(x, z) === 'cell' || zoneAt(x, z) === 'solitary') continue;
    if (spots.every((s) => Math.hypot(x - s.x, z - s.z) > LIGHTHOUSE.radius + 2)) safe = [x, z];
  }
  ok(!!safe, 'Có chỗ nằm ngoài mọi vòng sáng (mỗi lúc đèn chỉ chiếu một vùng nhỏ)');
  A2.x = safe[0]; A2.z = safe[1];
  room2.updateLights(0.03);
  ok(!room2.guards.some((g) => g.chase && g.chase.pid === A2.id), 'Ngoài vòng sáng thì không bị đèn hải đăng chiếu');
}
// đèn đi lần lượt từng khu: dừng ở mọi điểm của tuyến, mỗi điểm vài giây
for (const l of LIGHTS) {
  const seen = new Set(); let maxStill = 0, still = 0, prev = null;
  for (let t = 0; t < 120; t += 0.25) {
    const s = spotAt(l, t);
    l.route.forEach((p, i) => { if (Math.hypot(p[0] - s.x, p[1] - s.z) < 0.05) seen.add(i); });
    if (prev && Math.hypot(s.x - prev.x, s.z - prev.z) < 0.01) { still += 0.25; maxStill = Math.max(maxStill, still); } else still = 0;
    prev = s;
  }
  ok(seen.size === l.route.length && maxStill >= LIGHTHOUSE.dwell - 0.6, `Đèn tháp (${l.x},${l.z}) lần lượt ghé đủ ${l.route.length} khu và dừng ~${LIGHTHOUSE.dwell}s mỗi khu`);
}
// điểm hàng rào chỉ bị chiếu một phần thời gian (còn nhiều lúc tối để cắt dây)
{
  let lit = 0, n = 0;
  for (let t = 0; t < 300; t += 0.5) { n++; if (LIGHTS.some((l) => { const s = spotAt(l, t); return Math.hypot(63 - s.x, 38 - s.z) <= LIGHTHOUSE.radius; })) lit++; }
  ok(lit / n < 0.35 && lit / n > 0.05, `Hàng rào bị đèn chiếu ${(100 * lit / n).toFixed(0)}% thời gian (còn nhiều khoảng tối để cắt dây)`);
}
// Ban đêm rời buồng giam là vi phạm: quản giáo thấy thì rượt rồi đưa vào biệt giam (không chỉ lục soát)
{
  const r4 = new Room(4);
  const P = r4.addPlayer(fakeWs([]), 'Đêm');
  park(r4); r4.phase = 6; r4.phaseT = 9999; r4.event = 'blackout'; // cúp điện để đèn hải đăng không xen vào
  const g4 = r4.guards[0]; g4.x = -10; g4.z = -5; g4.ry = 0; g4.heading = 0; g4.wait = 9999;
  P.x = -10; P.z = -1.5; P.jail = 0; P.detect = 0; P.touchCd = 99; P.chased = false; P.t0 = -999;
  for (let i = 0; i < 12 * 30 && P.jail <= 0; i++) { r4.tick(1 / 30); if (P.jail <= 0) { g4.wait = Math.max(g4.wait, 5); } }
  ok(P.jail > 0 && P.jailKind === 'solitary', `Ban đêm ra ngoài bị quản giáo thấy: bị bắt vào biệt giam (jail=${P.jail.toFixed(0)})`);
  // ngay trong buồng thì không sao
  const r5 = new Room(5);
  const Q = r5.addPlayer(fakeWs([]), 'Ngủ');
  park(r5); r5.phase = 6; r5.phaseT = 9999; r5.event = 'blackout';
  const g5 = r5.guards[0]; g5.x = -27; g5.z = -15; g5.ry = 0; g5.heading = 0; g5.wait = 9999;
  Q.x = -27; Q.z = -19.5; Q.jail = 0; Q.detect = 0; Q.touchCd = 99; Q.t0 = -999;
  run(r5, 5);
  ok(Q.jail <= 0 && !Q.chased && Q.detect === 0, 'Ban đêm ở yên trong buồng giam: không bị coi là vi phạm');
}

// Chạy: nhanh hơn, tốn sức, gây tiếng động
{
  const r6 = new Room(6);
  const R = r6.addPlayer(fakeWs([]), 'Chạy');
  park(r6); r6.phase = 5; r6.phaseT = 9999;
  const walk = () => { R.x = 0; R.z = 0; R.en = 100; R.jail = 0; R.stun = 0; R.boost = 0; r6.setInput(R, { mx: 1, mz: 0, act: false, run: false, seq: 1 }); const x0 = R.x; for (let i = 0; i < 30; i++) { r6.setInput(R, { mx: 1, mz: 0, act: false, run: false, seq: 1 }); r6.tick(1 / 30); } return R.x - x0; };
  const dWalk = walk(), enWalk = R.en;
  R.x = 0; R.z = 0; R.en = 100; const xr = R.x;
  for (let i = 0; i < 30; i++) { r6.setInput(R, { mx: 1, mz: 0, act: false, run: true, seq: 1 }); r6.tick(1 / 30); }
  const dRun = R.x - xr;
  ok(dRun > dWalk * 1.35, `Chạy nhanh hơn đi bộ (${dRun.toFixed(1)}m so với ${dWalk.toFixed(1)}m trong 1 giây)`);
  ok(R.en < enWalk - 2, `Chạy tốn năng lượng (${R.en.toFixed(1)} so với ${enWalk.toFixed(1)})`);
  R.en = 0; R.x = 0; const xt = R.x;
  for (let i = 0; i < 30; i++) { r6.setInput(R, { mx: 1, mz: 0, act: false, run: true, seq: 1 }); r6.tick(1 / 30); }
  ok(R.x - xt < dWalk, 'Hết sức thì không chạy được (còn chậm hơn đi bộ)');
}

// Ném theo góc ngắm: hướng ném do người chơi chỉ định (không phụ thuộc hướng đang quay mặt)
{
  const r8 = new Room(8);
  const T = r8.addPlayer(fakeWs([]), 'Ngắm');
  park(r8); r8.phase = 5; r8.phaseT = 9999; r8.event = null;
  T.x = 0; T.z = 2; T.ry = Math.PI; T.jail = 0; T.stun = 0; T.stock.bomb = 2; T.hold = null; T.mg = null;
  r8.throwBomb(T, Math.PI / 2); // ngắm sang +x trong khi đang quay mặt về -z
  const bb = r8.bombs[0];
  ok(bb && Math.abs(bb.z - 2) < 0.01 && bb.x > 2.5 && bb.x <= 3.6, `Ném bom theo góc ngắm (+x), không theo hướng quay mặt (bom ở x=${bb && bb.x.toFixed(1)}, z=${bb && bb.z.toFixed(1)})`);
  ok(Math.abs(T.ry - Math.PI / 2) < 1e-6, 'Quay mặt theo hướng vừa ném');
  r8.bombs.length = 0; T.stock.bomb = 1;
  r8.throwBomb(T); // không có góc: dùng hướng đang quay mặt
  ok(r8.bombs[0] && r8.bombs[0].x > 2.5, 'Không gửi góc thì ném theo hướng đang quay mặt');
  T.rockCd = 0; T.x = 0; T.z = 2;
  const ev = []; T.ws = fakeWs(ev); const g0 = r8.guards[0]; g0.x = 38; g0.z = 28;
  r8.throwRock(T, Math.PI); // về phía -z
  ok(T.rockCd > 0, 'Ném đá xong phải chờ hồi');
}

// Chơi bài lớn hơn / nhỏ hơn: server rút lá, đúng +5 Jack, sai -5 Jack
{
  const r7 = new Room(7);
  const C = r7.addPlayer(fakeWs([]), 'Bài');
  park(r7); r7.phase = 5; r7.phaseT = 9999;
  const play = (pickSide, c1, c2) => {
    C.x = st('cards').x; C.z = st('cards').z; C.jail = 0; C.stun = 0; C.en = 100; C.done = {}; C.hold = null; C.detect = 0; C.touchCd = 99; C.mg = null; C.actPrev = false;
    r7.setInput(C, { mx: 0, mz: 0, act: false, seq: 1 }); r7.tick(1 / 30); r7.setInput(C, { mx: 0, mz: 0, act: true, seq: 2 }); r7.tick(1 / 30);
    if (!C.mg || C.mg.kind !== 'hilo') return null;
    C.mg.hilo.c1 = { r: c1, s: 0 }; C.mg.hilo.c2 = { r: c2, s: 1 };
    r7.hilo(C, C.mg.token, pickSide);
    return true;
  };
  C.jack = 10;
  ok(play('hi', 5, 9) && C.jack === 15 && !C.mg, `Đoán lớn hơn đúng: +5 Jack (jack=${C.jack})`);
  ok(play('hi', 9, 5) && C.jack === 10, `Đoán lớn hơn sai: -5 Jack (jack=${C.jack})`);
  ok(play('lo', 9, 5) && C.jack === 15, 'Đoán nhỏ hơn đúng: +5 Jack');
  ok(play('lo', 7, 7) && C.jack === 10, 'Hai lá bằng nhau tính là thua');
  C.jack = 3;
  C.x = st('cards').x; C.z = st('cards').z; C.mg = null; C.hold = null; r7.tick(1 / 30);
  ok(C.near && C.near.s.id === 'cards' && !C.near.ok, 'Dưới 5 Jack thì không được ngồi vào bàn bài (không thể chơi miễn phí)');
}

// Tù nhân NPC sinh hoạt theo lịch: giờ lao động thì ra xưởng/giặt/vườn làm việc, tối thì về buồng
{
  const r3 = new Room(3);
  r3.phase = 2; r3.phaseT = 9999;
  for (let i = 0; i < 90 * 30; i++) r3.tick(1 / 30); // 90 giây
  const inm = r3.npcs.filter((n) => n.kind === 'inmate');
  const working = inm.filter((n) => n.act && n.tgt && n.tgt.st && ['work', 'chore'].includes(n.tgt.st.kind));
  ok(inm.length === 2, `Chỉ có 2 tù nhân NPC (${inm.length})`);
  ok(working.length >= 1, `Giờ lao động: tù nhân NPC đang làm việc tại trạm (${working.length}/${inm.length})`);
  ok(inm.every((n) => !blocked(n.x, n.z, 0.3, 0)), 'Tù nhân NPC không bị kẹt trong tường');
  r3.phase = 6; r3.phaseT = 9999;
  for (let i = 0; i < 120 * 30; i++) r3.tick(1 / 30);
  const inCell = inm.filter((n) => zoneAt(n.x, n.z) === 'cell');
  ok(inCell.length === inm.length, `Ban đêm: tù nhân NPC đã về buồng giam (${inCell.length}/${inm.length})`);
  const sleepers = inm.filter((n) => n.act === 3);
  ok(sleepers.length >= 1, `Ban đêm có tù nhân NPC nằm ngủ trên giường (${sleepers.length})`);
}
console.log(bad ? `\n${bad} kiểm thử lỗi` : '\nTất cả kiểm thử đạt');
process.exit(bad ? 1 : 0);
