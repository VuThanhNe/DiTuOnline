// Bản đồ, lịch sinh hoạt, trạm tương tác và luật chơi — dùng chung cho server và client.

// Nhà tù đã được mở rộng: thêm khu phía đông (y tế, giặt, vườn) và dãy phía nam (giải trí, gym, tắm).
export const WORLD = { minX: -40, maxX: 64, minZ: -30, maxZ: 48 };
export const PLAYER_RADIUS = 0.45;
export const PLAYER_SPEED = 5.0;
const T = 0.6; // độ dày tường

// ---------- Hàm dựng tường (có chừa cửa) ----------
function hwall(z, x1, x2, gaps = [], h = 1.5) {
  return splitWall(x1, x2, gaps).map(([a, b]) => ({ x1: a, z1: z - T / 2, x2: b, z2: z + T / 2, h }));
}
function vwall(x, z1, z2, gaps = [], h = 1.5) {
  return splitWall(z1, z2, gaps).map(([a, b]) => ({ x1: x - T / 2, z1: a, x2: x + T / 2, z2: b, h }));
}
function splitWall(a, b, gaps) {
  const out = [];
  let cur = a;
  for (const [g1, g2] of [...gaps].sort((p, q) => p[0] - q[0])) {
    if (g1 > cur) out.push([cur, g1]);
    cur = g2;
  }
  if (cur < b) out.push([cur, b]);
  return out;
}
function box(x1, z1, x2, z2, h = 1, kind = 'prop') {
  return { x1, z1, x2, z2, h, kind };
}

// ---------- Khu vực (zone) ----------
export const ZONES = [
  { id: 'cell', name: 'Khu buồng giam', short: 'Buồng giam', x1: -37, z1: -27, x2: -17, z2: -13, color: 0x5d6b7a },
  { id: 'canteen', name: 'Nhà ăn', short: 'Nhà ăn', x1: 15, z1: -27, x2: 37, z2: -13, color: 0xb8a98a },
  { id: 'workshop', name: 'Xưởng lao động', short: 'Xưởng', x1: 15, z1: 8, x2: 37, z2: 27, color: 0x6b5a4a },
  { id: 'library', name: 'Thư viện', short: 'Thư viện', x1: -37, z1: 8, x2: -17, z2: 27, color: 0x8a6b45 },
  { id: 'office', name: 'Phòng quản giáo', short: 'Quản giáo', x1: -8, z1: -27, x2: 8, z2: -17, color: 0x4f7a5a },
  { id: 'solitary', name: 'Biệt giam', short: 'Biệt giam', x1: -5, z1: 19, x2: 5, z2: 26, color: 0x2b2b2e },
  { id: 'yard', name: 'Sân tập', short: 'Sân tập', x1: -14, z1: -10, x2: 12, z2: 10, color: 0xc9b98f },
  { id: 'infirmary', name: 'Phòng y tế', short: 'Y tế', x1: 43, z1: -27, x2: 61, z2: -13, color: 0xcfe3e0 },
  { id: 'laundry', name: 'Phòng giặt', short: 'Giặt', x1: 43, z1: -9, x2: 61, z2: 3, color: 0x9fb8c8 },
  { id: 'garden', name: 'Vườn rau', short: 'Vườn', x1: 43, z1: 6, x2: 61, z2: 28, color: 0x6f8f4a },
  { id: 'rec', name: 'Phòng giải trí', short: 'Giải trí', x1: -37, z1: 31, x2: -17, z2: 45, color: 0x8a6fa8 },
  { id: 'gym', name: 'Phòng gym', short: 'Gym', x1: -12, z1: 31, x2: 12, z2: 45, color: 0x5a6a86 },
  { id: 'shower', name: 'Phòng tắm', short: 'Tắm', x1: 15, z1: 31, x2: 37, z2: 45, color: 0x8fc4d0 },
];

export function zoneAt(x, z) {
  for (const zn of ZONES) {
    if (x >= zn.x1 && x <= zn.x2 && z >= zn.z1 && z <= zn.z2) return zn.id;
  }
  return 'outdoor';
}

// ---------- Tường và vật cản ----------
export const WALLS = [];
// Chu vi nhà tù (cao hơn)
WALLS.push(...hwall(WORLD.minZ, WORLD.minX, WORLD.maxX, [], 5), ...hwall(WORLD.maxZ, WORLD.minX, WORLD.maxX, [], 5));
WALLS.push(...vwall(WORLD.minX, WORLD.minZ, WORLD.maxZ, [], 5), ...vwall(WORLD.maxX, WORLD.minZ, WORLD.maxZ, [], 5));

// Khu buồng giam: cửa phía nam
WALLS.push(...hwall(-27, -37, -17), ...hwall(-13, -37, -17, [[-29, -25]]));
WALLS.push(...vwall(-37, -27, -13), ...vwall(-17, -27, -13));
// 4 buồng (vách ngăn, mặt trước để hở)
WALLS.push(...vwall(-32, -27, -20), ...vwall(-27, -27, -20), ...vwall(-22, -27, -20));

// Nhà ăn: cửa phía nam
WALLS.push(...hwall(-27, 15, 37), ...hwall(-13, 15, 37, [[24, 28]]));
WALLS.push(...vwall(15, -27, -13), ...vwall(37, -27, -13));

// Xưởng: cửa phía bắc
WALLS.push(...hwall(8, 15, 37, [[24, 28]]), ...hwall(27, 15, 37));
WALLS.push(...vwall(15, 8, 27), ...vwall(37, 8, 27));

// Thư viện: cửa phía bắc
WALLS.push(...hwall(8, -37, -17, [[-29, -25]]), ...hwall(27, -37, -17));
WALLS.push(...vwall(-37, 8, 27), ...vwall(-17, 8, 27));

// Phòng quản giáo: cửa phía nam
WALLS.push(...hwall(-27, -8, 8), ...hwall(-17, -8, 8, [[-2, 2]]));
WALLS.push(...vwall(-8, -27, -17), ...vwall(8, -27, -17));

// Biệt giam: kín hoàn toàn
WALLS.push(...hwall(19, -5, 5), ...hwall(26, -5, 5));
WALLS.push(...vwall(-5, 19, 26), ...vwall(5, 19, 26));

// ----- Khu mở rộng phía đông -----
// Phòng y tế: cửa phía nam
WALLS.push(...hwall(-27, 43, 61), ...hwall(-13, 43, 61, [[50, 54]]));
WALLS.push(...vwall(43, -27, -13), ...vwall(61, -27, -13));
// Phòng giặt: cửa phía bắc
WALLS.push(...hwall(-9, 43, 61, [[50, 54]]), ...hwall(3, 43, 61));
WALLS.push(...vwall(43, -9, 3), ...vwall(61, -9, 3));
// ----- Dãy phía nam -----
// Phòng giải trí, phòng gym, phòng tắm: cửa phía bắc
WALLS.push(...hwall(31, -37, -17, [[-29, -25]]), ...hwall(45, -37, -17));
WALLS.push(...vwall(-37, 31, 45), ...vwall(-17, 31, 45));
WALLS.push(...hwall(31, -12, 12, [[-2, 2]]), ...hwall(45, -12, 12));
WALLS.push(...vwall(-12, 31, 45), ...vwall(12, 31, 45));
WALLS.push(...hwall(31, 15, 37, [[24, 28]]), ...hwall(45, 15, 37));
WALLS.push(...vwall(15, 31, 45), ...vwall(37, 31, 45));

// ---------- Các kho chứa đồ lậu (cửa khoá, cần đủ ca lao động mới vào được) ----------
export const LABOR_NEED = { spoon: 3, pliers: 8, map: 14 };
// Kho bếp (góc đông bắc nhà ăn)
WALLS.push(...hwall(-22, 33.6, 36.7, [[34.2, 36.0]]), ...vwall(33.6, -26.7, -22));
// Kho dụng cụ (góc đông nam xưởng)
WALLS.push(...hwall(22.5, 33.8, 36.7, [[34.4, 36.1]]), ...vwall(33.8, 22.5, 26.7));
// Kho sách cũ (phía tây thư viện)
WALLS.push(...hwall(17, -36.7, -33.6), ...hwall(22, -36.7, -33.6), ...vwall(-33.6, 17, 22, [[18.1, 19.9]]));

// Cổng khoá: chặn người chơi chưa đủ số ca lao động (không tính vào tường để quản giáo vẫn nhìn thấy xuyên qua)
export const GATES = [
  { id: 'gate_spoon', name: 'Kho bếp', item: 'spoon', need: LABOR_NEED.spoon, x1: 34.2, z1: -22.3, x2: 36.0, z2: -21.7, h: 1.5 },
  { id: 'gate_pliers', name: 'Kho dụng cụ', item: 'pliers', need: LABOR_NEED.pliers, x1: 34.4, z1: 22.2, x2: 36.1, z2: 22.8, h: 1.5 },
  { id: 'gate_map', name: 'Kho sách cũ', item: 'map', need: LABOR_NEED.map, x1: -33.9, z1: 18.1, x2: -33.3, z2: 19.9, h: 1.5 },
];
// Các phòng nhỏ (để đánh dấu trên bản đồ nhỏ)
export const KHOS = [
  { id: 'kho_bep', name: 'Kho bếp', x1: 33.9, z1: -26.7, x2: 36.7, z2: -22.3 },
  { id: 'kho_dc', name: 'Kho DC', x1: 34.1, z1: 22.8, x2: 36.7, z2: 26.7 },
  { id: 'kho_sach', name: 'Kho sách', x1: -36.7, z1: 17.3, x2: -33.9, z2: 21.7 },
];

// Đồ đạc có va chạm
export const PROPS = [
  // nhà ăn: bàn
  box(18, -20, 22, -18.8, 0.9), box(30, -20, 34, -18.8, 0.9),
  box(18, -16.8, 22, -15.6, 0.9), box(30, -16.8, 34, -15.6, 0.9),
  // quầy phát cơm
  box(19, -26.6, 33, -25.4, 1.1),
  // xưởng: bàn làm việc
  box(18.5, 13.3, 21.5, 14.7, 1), box(18.5, 19.3, 21.5, 20.7, 1),
  box(30.5, 13.3, 33.5, 14.7, 1), box(30.5, 19.3, 33.5, 20.7, 1),
  // kệ dụng cụ xưởng
  box(22, 25.6, 30, 26.6, 1.8),
  // thư viện: kệ sách + bàn đọc
  box(-35, 25, -19, 26.3, 1.9),
  box(-32, 13.3, -28, 14.7, 0.9), box(-26, 13.3, -22, 14.7, 0.9),
  // sân tập: dụng cụ
  box(-9, 2.4, -7, 3.6, 0.5, 'benchy'), box(-5, -6.6, -3, -5.4, 0.5, 'benchy'), box(5, -3.6, 7, -2.4, 1.3, 'bricks'), box(-13.8, -3, -12.8, 1, 1.9, 'goal'),
  // phòng quản giáo: bàn làm việc
  box(-6, -25, -2, -23.8, 0.9), box(2, -25, 6, -23.8, 0.9),
  // giường trong buồng
  box(-36.4, -26.4, -34.4, -23.6, 0.5), box(-31.4, -26.4, -29.4, -23.6, 0.5),
  box(-26.4, -26.4, -24.4, -23.6, 0.5), box(-21.4, -26.4, -19.4, -23.6, 0.5),
  // quầy của Tày Scam
  box(28.4, -3.3, 31.6, -2.5, 1.0, 'stall'),
  // phòng y tế: 3 giường bệnh, tủ thuốc, bàn khám
  box(44.6, -26.4, 46.6, -23.6, 0.5), box(49.6, -26.4, 51.6, -23.6, 0.5), box(54.6, -26.4, 56.6, -23.6, 0.5),
  box(58, -26.6, 60.4, -25.6, 1.9), box(57, -20, 60, -18.8, 0.9),
  // phòng giặt: máy giặt dọc tường nam, bàn gấp đồ
  box(44, 1.5, 46, 2.8, 1.1, 'machine'), box(47, 1.5, 49, 2.8, 1.1, 'machine'), box(55, 1.5, 57, 2.8, 1.1, 'machine'), box(58, 1.5, 60, 2.8, 1.1, 'machine'),
  box(45.5, -5.8, 49.5, -4.6, 0.9), box(55, -5.8, 59, -4.6, 0.9),
  // vườn rau: luống đất + hàng rào thấp (có cổng phía bắc và phía tây)
  box(44.5, 9, 49, 13, 0.35, 'plot'), box(55, 9, 59.5, 13, 0.35, 'plot'), box(44.5, 20, 49, 24, 0.35, 'plot'), box(55, 20, 59.5, 24, 0.35, 'plot'),
  box(43, 5.8, 50, 6.2, 1.0, 'fencelow'), box(54, 5.8, 61, 6.2, 1.0, 'fencelow'), box(43, 27.8, 61, 28.2, 1.0, 'fencelow'),
  box(42.8, 6, 43.2, 14, 1.0, 'fencelow'), box(42.8, 18, 43.2, 28, 1.0, 'fencelow'), box(60.8, 6, 61.2, 28, 1.0, 'fencelow'),
  // phòng giải trí: bàn bóng bàn, sofa + tivi, bàn chơi bài
  box(-35.5, 34, -32, 36, 0.85, 'pingpong'), box(-30, 37.6, -24, 39.2, 0.7, 'sofa'), box(-29, 44.2, -25, 44.8, 1.6, 'tv'), box(-22, 34, -19, 36.4, 0.8),
  // phòng gym: ghế tập tạ, máy chạy bộ, giá tạ
  box(-9, 35, -7, 36.2, 0.5, 'bench'), box(-9, 40.5, -7, 41.7, 0.5, 'bench'), box(4, 34, 5.2, 36.4, 0.9, 'treadmill'), box(7, 34, 8.2, 36.4, 0.9, 'treadmill'), box(-10.5, 43, -5, 44, 1.3, 'rack'),
  // phòng tắm: vách ngăn các buồng tắm + ghế dài
  box(17.9, 38, 18.1, 44, 1.9, 'partition'), box(21.9, 38, 22.1, 44, 1.9, 'partition'), box(29.9, 38, 30.1, 44, 1.9, 'partition'), box(33.9, 38, 34.1, 44, 1.9, 'partition'),
  box(24.5, 34, 28.5, 35, 0.5, 'bench'),
];

export const COLLIDERS = [...WALLS, ...PROPS, ...GATES];

// Tháp canh ở bốn góc
export const TOWERS = [[-38, -28], [62, -28], [-38, 46], [62, 46], [12, -28], [12, 46]];

// ---------- Điểm xuất hiện ----------
export const CELL_SPAWNS = [[-34.5, -21.5], [-29.5, -21.5], [-24.5, -21.5], [-19.5, -21.5], [-34.5, -18.5], [-29.5, -18.5], [-24.5, -18.5], [-19.5, -18.5]];
export const SOLITARY_POS = [0, 22.5];
export const OFFICE_POS = [0, -21.5]; // nơi bị nhốt khi hết máu

// ---------- Lịch sinh hoạt ----------
export const PHASES = [
  { id: 'rollcall', name: 'Điểm danh', dur: 30, hint: 'Về buồng giam điểm danh.' },
  { id: 'breakfast', name: 'Bữa sáng', dur: 40, hint: 'Ăn sáng ở nhà ăn.' },
  { id: 'work', name: 'Giờ lao động', dur: 100, hint: 'Làm việc ở xưởng, phòng giặt hoặc vườn rau.' },
  { id: 'exercise', name: 'Giờ tập luyện', dur: 70, hint: 'Tập thể dục ở sân tập và phòng gym.' },
  { id: 'dinner', name: 'Bữa tối', dur: 40, hint: 'Ăn tối ở nhà ăn.' },
  { id: 'free', name: 'Sinh hoạt tự do', dur: 70, hint: 'Tự do: đọc sách, giải trí, tắm, khám sức khoẻ, quét sân, ngủ, chợ đen.' },
  { id: 'night', name: 'Tắt đèn', dur: 90, hint: 'Đã tự động về buồng ngủ. Ra ngoài ban đêm là vi phạm: quản giáo thấy sẽ rượt rồi nhốt biệt giam, đèn pha hải đăng quét khắp trại!' },
];
export const NIGHT_PHASE = 6;
// Giờ trong ngày (giờ thật của đồng hồ) tương ứng mỗi giai đoạn: [bắt đầu, kết thúc]. Đêm kéo dài qua 24h tới 5:30 sáng.
export const PHASE_CLOCK = [[5.5, 6], [6, 7], [7, 12], [12, 17], [17, 19], [19, 21], [21, 29.5]];
export const PHASE_ICON = ['📣', '🍞', '🔨', '🏃', '🍲', '🎲', '🌙'];
export function clockHour(phase, remain) {
  const [a, b] = PHASE_CLOCK[phase];
  const dur = PHASES[phase].dur;
  return (a + (b - a) * (1 - Math.max(0, Math.min(1, remain / dur)))) % 24;
}
export const DAY_LENGTH = PHASES.reduce((s, p) => s + p.dur, 0);

// ---------- Luật chơi ----------
export const RULES = {
  hiloStake: 5, // chơi bài lớn/nhỏ: thắng +5 Jack, thua -5 Jack
  releasePoints: 300,
  jailSeconds: 20,
  jailPenalty: 10,
  searchPenalty: 5,
  digTarget: 64, // tổng giây đào của cả phòng (cần ~8 lượt đào tốt)
  digPerSession: 8, // giây đào tối đa cho mỗi lượt minigame đào
  digCaveIn: 4, // đào hỏng (điểm < 0.6): đất sụt, mất bấy nhiêu giây công
  exitHold: 5, // giữ E bao lâu để chui ra khỏi đường hầm (gây tiếng động suốt thời gian đó)
  fenceCuts: 3, // phải cắt liên tiếp bấy nhiêu sợi dây thép; hỏng một lần là làm lại từ đầu
  // lịch sinh hoạt: vi phạm bị cảnh cáo; đủ warnWatch cảnh cáo thì bị quản giáo "để mắt" tới
  absentPenalty: 5,
  skipWorkPenalty: 5,
  skipMealPenalty: 3,
  skipMealEnergy: 15,
  warnWatch: 3,
  watchDetectMul: 1.5, // bị để mắt: mức phát hiện tăng nhanh hơn
  watchRangeMul: 1.25, // bị để mắt: quản giáo nhìn xa hơn
  guardRange: 9,
  guardRangeNight: 11,
  guardFov: (110 * Math.PI) / 180,
  guardCloseRange: 2.2,
  detectSeconds: 1.1,
  maxPlayersPerRoom: 30,
  // máu / năng lượng
  hpMax: 100,
  hpJailSeconds: 30,
  hpAfterJail: 50,
  hpRegen: 0.3, // hồi mỗi giây nếu lâu không bị thương
  beatDamage: 20,
  beatChance: 0.15, // mỗi lần đến sát quản giáo
  searchChance: 0.05, // đến sát quản giáo bị lục soát (đã giảm từ 0.15)
  searchChanceContra: 0.2, // mang đồ lậu (đã giảm từ 0.4)
  runSpeed: 1.5, // chạy nhanh hơn đi bộ bấy nhiêu lần (1.8 nếu đang tăng lực Reddog)
  runNoise: 8, // chạy gây tiếng động bán kính này (mỗi ~1 giây)
  touchCooldown: 7,
  // bom
  bombDamage: 45,
  bombRadius: 5,
  bombFuse: 2.2,
  bombHeatSecs: 6, // sau khi ném bom, nếu bị quản giáo thấy trong thời gian này sẽ bị coi là vi phạm
  // truy đuổi / đi lén / ném đá / chợ đen
  chaseSpeed: 5.3,
  chaseGiveUp: 4,
  catchDist: 1.3,
  sneakSpeed: 0.55,
  sneakDetect: 0.6,
  rockCooldown: 6,
  rockRange: 7,
  bombRange: 3.5, // bom ném tối đa tới đây (cả bom lẫn đá đều ngắm bằng cách giữ phím rồi thả)
  rockNoise: 16,
  legitTouchMul: 0.25, // làm đúng việc, đúng giờ thì ít bị quản giáo gây sự
  premiumMul: 1.3,
  premiumScam: 0.25,
  giveJack: 10,
  eventChance: 0.35,
  blackoutRange: 0.65,
  reconnectSecs: 60,
  bombBuyPerDay: 2,
  scamChance: 0.5,
};
export const ENERGY = { max: 100, regen: 0.3, moveDrain: 0.07, runDrain: 4, mealGain: 30, sleepRate: 8, drinkGain: 40, tiredSpeed: 0.5 }; // runDrain: sức tiêu hao mỗi giây khi chạy
export const BOOST = { secs: 30, speed: 1.5, dig: 2 };
export const GUARD = { patrol: 2.5, patrolNight: 3.9, alert: 4.8, alertNight: 6.6, back: 3.4, backNight: 5, alertWait: 3, alertMax: 20 };
// Đèn pha trên các tháp canh (hải đăng): ban đêm quét quanh nhà tù, ai ngoài buồng giam bị chiếu trúng sẽ bị quản giáo rượt ngay
// Mỗi đèn là một VÒNG SÁNG TRÒN (bán kính `radius`) đi lần lượt từng khu trong tuyến của nó: dừng `dwell` giây ở mỗi điểm rồi di chuyển
// sang điểm kế với tốc độ `speed` m/s. Tại một thời điểm mỗi đèn chỉ chiếu một vùng nhỏ (trước đây là cả một tia dài 36 m quét cùng lúc nhiều điểm).
// Vị trí vòng sáng là hàm xác định của đồng hồ phòng (spotAt) nên server và client luôn khớp.
export const LIGHTHOUSE = { radius: 6.5, dwell: 4.5, speed: 5, chaseSpeed: 6.4 };
export const LIGHTS = [
  // tháp tây bắc: hành lang phía nam buồng giam, thư viện, sân tập phía tây
  { x: -38, z: -28, off: 0, route: [[-27, -9], [-27, 10], [-27, 18], [-9, 0]] },
  // tháp đông bắc: nhà ăn, hành lang, phòng giặt, y tế
  { x: 62, z: -28, off: 11, route: [[26, -9], [40, -11], [52, -4], [52, -19]] },
  // tháp tây nam: phòng giải trí, gym, khu biệt giam
  { x: -38, z: 46, off: 23, route: [[-27, 29.5], [-27, 38], [0, 38], [0, 24]] },
  // tháp đông nam: vườn rau, phòng tắm, đoạn hàng rào cắt được
  { x: 62, z: 46, off: 6, route: [[52, 17], [45, 34], [26, 38], [58, 38]] },
  // tháp bắc: văn phòng, chợ đen, trục giữa
  { x: 12, z: -28, off: 17, route: [[0, -13], [12, -10], [30, -1], [12, 8]] },
  // tháp nam: xưởng, sân phía nam
  { x: 12, z: 46, off: 29, route: [[26, 17], [26, 25], [10, 28], [-8, 16]] },
];
const _spotCache = new WeakMap();
// Tâm vòng sáng của đèn l tại thời điểm t (giây): đứng yên `dwell` giây ở mỗi điểm, rồi trượt mượt sang điểm kế
export function spotAt(l, t) {
  let c = _spotCache.get(l);
  if (!c) {
    const n = l.route.length, tr = [];
    let total = 0;
    for (let i = 0; i < n; i++) { const a = l.route[i], b = l.route[(i + 1) % n]; const d = Math.hypot(b[0] - a[0], b[1] - a[1]) / LIGHTHOUSE.speed; tr.push(d); total += LIGHTHOUSE.dwell + d; }
    c = { tr, total };
    _spotCache.set(l, c);
  }
  let u = (((t + l.off) % c.total) + c.total) % c.total;
  const n = l.route.length;
  for (let i = 0; i < n; i++) {
    const a = l.route[i], b = l.route[(i + 1) % n];
    if (u < LIGHTHOUSE.dwell) return { x: a[0], z: a[1], moving: false };
    u -= LIGHTHOUSE.dwell;
    if (u < c.tr[i]) { const f = u / c.tr[i], s = f * f * (3 - 2 * f); return { x: a[0] + (b[0] - a[0]) * s, z: a[1] + (b[1] - a[1]) * s, moving: true }; }
    u -= c.tr[i];
  }
  return { x: l.route[0][0], z: l.route[0][1], moving: false };
}
export const NIGHT_FREE_KINDS = ['work', 'chore', 'exercise', 'read', 'sweep', 'play']; // ban đêm vẫn làm được các việc này (rủi ro cao)

// ---------- Trạm tương tác ----------
// mg: kiểu minigame (timing | keys | aim); hold: giữ E (không minigame)
// cost: năng lượng tiêu hao; snd/nr: âm thanh phát ra và bán kính tiếng động thu hút quản giáo
export const STATIONS = [
  { id: 'meal', kind: 'meal', x: 26, z: -24.2, r: 3.2, label: 'Lấy khẩu phần ăn', phases: [1, 4], hold: 3, pts: 8, group: 'meal', cap: 1, color: 0xffc857, snd: 'munch', nr: 8 },
  { id: 'spoon', kind: 'item', item: 'spoon', mg: 'memory', mgTitle: 'Bẻ khoá kho bếp (nhớ mã khoá)', x: 35.3, z: -24.5, r: 1.5, label: 'Lén lấy chiếc thìa', phases: null, cost: 5, color: 0xc0c0c0, snd: 'lock', nr: 14 },
  { id: 'work1', kind: 'work', mg: 'timing', mgTitle: 'Ép khuôn', x: 20, z: 13.3, r: 2.2, label: 'Làm việc (ép khuôn)', phases: [2], pts: 5, jack: 6, cost: 12, group: 'work', cap: 5, color: 0x6ab04c, snd: 'hammer', nr: 14 },
  { id: 'work2', kind: 'work', mg: 'sort', theme: 'goods', mgTitle: 'Phân loại hàng', x: 20, z: 19.3, r: 2.2, label: 'Làm việc (phân loại)', phases: [2], pts: 5, jack: 6, cost: 12, group: 'work', cap: 5, color: 0x6ab04c, snd: 'hammer', nr: 14 },
  { id: 'work3', kind: 'work', mg: 'wires', mgTitle: 'Lắp ráp dây điện', x: 32, z: 13.3, r: 2.2, label: 'Làm việc (lắp dây điện)', phases: [2], pts: 5, jack: 6, cost: 12, group: 'work', cap: 5, color: 0x6ab04c, snd: 'hammer', nr: 14 },
  { id: 'work4', kind: 'work', mg: 'pairs', theme: 'goods', mgTitle: 'Kiểm hàng (ghép đúng cặp)', x: 32, z: 19.3, r: 2.2, label: 'Làm việc (kiểm hàng)', phases: [2], pts: 5, jack: 6, cost: 12, group: 'work', cap: 5, color: 0x6ab04c, snd: 'hammer', nr: 14 },
  { id: 'pliers', kind: 'item', item: 'pliers', mg: 'wires', mgTitle: 'Bẻ khoá kho dụng cụ (nối mạch)', x: 35.4, z: 24.6, r: 1.4, label: 'Lén lấy chiếc kìm', phases: null, cost: 5, color: 0xe55039, snd: 'lock', nr: 14 },
  { id: 'ex1', kind: 'exercise', mg: 'mash', theme: 'pushup', mgTitle: 'Hít đất (bấm liên tục)', x: -8, z: 1.4, r: 2.2, label: 'Hít đất', phases: [3, 5], pts: 3, jack: 1, cost: 8, group: 'exercise', cap: 5, color: 0x4a69bd, snd: 'thud', nr: 12 },
  { id: 'ex2', kind: 'exercise', mg: 'balance', theme: 'pull', mgTitle: 'Kéo xà (giữ thăng bằng)', x: -4, z: -4.6, r: 2.2, label: 'Kéo xà', phases: [3, 5], pts: 3, jack: 1, cost: 8, group: 'exercise', cap: 5, color: 0x4a69bd, snd: 'thud', nr: 12 },
  { id: 'ex3', kind: 'exercise', mg: 'memory', theme: 'aerobic', mgTitle: 'Tập thể dục (nhảy theo nhịp)', x: 1, z: -1.6, r: 2.2, label: 'Tập thể dục', phases: [3, 5], pts: 3, jack: 1, cost: 8, group: 'exercise', cap: 5, color: 0x4a69bd, snd: 'thud', nr: 12 },
  { id: 'ex4', kind: 'exercise', mg: 'kick', mgTitle: 'Đá bóng (sút phạt)', x: -10.5, z: -1, r: 2.2, label: 'Đá bóng', phases: [3, 5], pts: 3, jack: 1, cost: 8, group: 'exercise', cap: 5, color: 0x4a69bd, snd: 'ball', nr: 12 },
  { id: 'ex5', kind: 'exercise', mg: 'bricks', mgTitle: 'Đập gạch (đỡ bóng phá gạch)', x: 6, z: -0.6, r: 2.2, label: 'Đập gạch', phases: [3, 5], pts: 3, jack: 1, cost: 8, group: 'exercise', cap: 5, color: 0x4a69bd, snd: 'thud', nr: 12 },
  { id: 'ex6', kind: 'exercise', mg: 'marbles', mgTitle: 'Bắn bi (hất bi ra khỏi vòng)', x: -2, z: 6.5, r: 2.2, label: 'Bắn bi', phases: [3, 5], pts: 3, jack: 1, cost: 8, group: 'exercise', cap: 5, color: 0x4a69bd, snd: 'click', nr: 6 },
  { id: 'read1', kind: 'read', mg: 'keys', letters: true, mgTitle: 'Ôn bài', x: -30, z: 12.4, r: 2.4, label: 'Đọc sách', phases: [5], pts: 3, jack: 2, cost: 6, group: 'read', cap: 2, color: 0x82ccdd, snd: 'page', nr: 5 },
  { id: 'read2', kind: 'read', mg: 'pairs', theme: 'words', mgTitle: 'Học từ vựng (ghép đúng cặp)', x: -24, z: 12.4, r: 2.4, label: 'Đọc sách', phases: [5], pts: 3, jack: 2, cost: 6, group: 'read', cap: 2, color: 0x82ccdd, snd: 'page', nr: 5 },
  { id: 'sweep1', kind: 'sweep', mg: 'clean', theme: 'dust', mgTitle: 'Quét sân (dọn rác)', x: 10, z: -7, r: 2.2, label: 'Quét sân', phases: [5], pts: 2, jack: 4, cost: 7, group: 'sweep', cap: 2, color: 0x9bd36a, snd: 'sweep', nr: 8 },
  { id: 'sweep2', kind: 'sweep', mg: 'clean', theme: 'dust', mgTitle: 'Quét sân (dọn rác)', x: -12, z: 5, r: 2.2, label: 'Quét sân', phases: [5], pts: 2, jack: 4, cost: 7, group: 'sweep', cap: 2, color: 0x9bd36a, snd: 'sweep', nr: 8 },
  // ----- Khu mở rộng: giờ lao động (giặt đồ, làm vườn) -----
  { id: 'wash1', kind: 'chore', mg: 'sort', theme: 'laundry', mgTitle: 'Giặt đồ (tách đồ trắng / đồ màu)', x: 48, z: 0.2, r: 2.2, label: 'Giặt quần áo', phases: [2], pts: 4, jack: 5, cost: 10, group: 'chore', cap: 4, color: 0x74b9ff, snd: 'sweep', nr: 8 },
  { id: 'wash2', kind: 'chore', mg: 'sort', theme: 'laundry', mgTitle: 'Giặt đồ (tách đồ trắng / đồ màu)', x: 56, z: 0.2, r: 2.2, label: 'Giặt quần áo', phases: [2], pts: 4, jack: 5, cost: 10, group: 'chore', cap: 4, color: 0x74b9ff, snd: 'sweep', nr: 8 },
  { id: 'garden1', kind: 'chore', mg: 'clean', theme: 'weed', mgTitle: 'Nhổ cỏ (bấm vào cỏ dại)', x: 51.5, z: 11, r: 2.4, label: 'Nhổ cỏ vườn rau', phases: [2], pts: 4, jack: 5, cost: 10, group: 'chore', cap: 4, color: 0x7bed9f, snd: 'sweep', nr: 6 },
  { id: 'garden2', kind: 'chore', mg: 'balance', theme: 'water', mgTitle: 'Tưới cây (giữ vòi nước)', x: 51.5, z: 22, r: 2.4, label: 'Tưới cây', phases: [2], pts: 4, jack: 5, cost: 10, group: 'chore', cap: 4, color: 0x2ed573, snd: 'sweep', nr: 6 },
  // ----- Giờ tập luyện: phòng gym -----
  { id: 'gym1', kind: 'exercise', mg: 'mash', theme: 'weights', mgTitle: 'Nâng tạ (bấm liên tục)', x: -6, z: 38.6, r: 2.2, label: 'Nâng tạ', phases: [3], pts: 4, jack: 2, cost: 10, group: 'gym', cap: 3, color: 0x5352ed, snd: 'thud', nr: 12 },
  { id: 'gym2', kind: 'exercise', mg: 'balance', theme: 'run', mgTitle: 'Chạy máy (giữ nhịp)', x: 6.6, z: 38.6, r: 2.2, label: 'Chạy máy chạy bộ', phases: [3], pts: 4, jack: 2, cost: 10, group: 'gym', cap: 3, color: 0x5352ed, snd: 'thud', nr: 12 },
  // ----- Sinh hoạt tự do: giải trí, tắm, y tế -----
  { id: 'pong', kind: 'play', mg: 'pong', mgTitle: 'Chơi bóng bàn', x: -33.8, z: 38.4, r: 2.2, label: 'Chơi bóng bàn', phases: [5], pts: 3, jack: 2, cost: 5, group: 'play', cap: 3, color: 0xa29bfe, snd: 'ball', nr: 6 },
  // Chơi bài "lớn hơn hay nhỏ hơn": server phát lá thứ nhất, người chơi chọn, server phát lá thứ hai: đúng +5 Jack, sai -5 Jack (không có điểm cải tạo)
  { id: 'cards', kind: 'play', mg: 'hilo', mgTitle: 'Chơi bài: lớn hơn hay nhỏ hơn?', x: -20.5, z: 38.4, r: 2.2, label: 'Chơi bài (đoán lớn / nhỏ)', phases: [5], pts: 0, jack: 0, cost: 5, group: 'play', cap: 3, color: 0xa29bfe, snd: 'page', nr: 5 },
  { id: 'tv', kind: 'rest', x: -27, z: 41.2, r: 2.4, label: 'Xem tivi', phases: [5], hold: 5, pts: 2, jack: 1, gain: { hp: 5, en: 12 }, group: 'tv', cap: 1, color: 0xfd79a8 },
  { id: 'shower1', kind: 'rest', x: 20, z: 41, r: 2, label: 'Tắm rửa', phases: [5], hold: 5, pts: 3, gain: { hp: 20, en: 12 }, group: 'shower', cap: 1, color: 0x55efc4 },
  { id: 'shower2', kind: 'rest', x: 32, z: 41, r: 2, label: 'Tắm rửa', phases: [5], hold: 5, pts: 3, gain: { hp: 20, en: 12 }, group: 'shower', cap: 1, color: 0x55efc4 },
  { id: 'med', kind: 'rest', x: 52, z: -19.5, r: 2.4, label: 'Khám sức khoẻ', phases: [5], hold: 4, pts: 2, gain: { hp: 50, en: 5 }, group: 'med', cap: 1, color: 0xff7675 },
  { id: 'bedm1', kind: 'sleep', heal: true, x: 45.6, z: -22.5, r: 1.5, label: 'Nằm giường bệnh nghỉ ngơi', phases: [5], color: 0xdfe6e9 },
  { id: 'bedm2', kind: 'sleep', heal: true, x: 50.6, z: -22.5, r: 1.5, label: 'Nằm giường bệnh nghỉ ngơi', phases: [5], color: 0xdfe6e9 },
  { id: 'map', kind: 'item', item: 'map', mg: 'keys', mgTitle: 'Bẻ khoá kho sách', x: -35.3, z: 19.5, r: 1.3, label: 'Lén chép bản đồ', phases: null, cost: 5, color: 0xf6e58d, snd: 'lock', nr: 14 },
  { id: 'bed1', kind: 'sleep', x: -35.4, z: -22.5, r: 1.5, label: 'Ngủ lấy lại sức', phases: [5, 6], color: 0x7b8fb5 },
  { id: 'bed2', kind: 'sleep', x: -30.4, z: -22.5, r: 1.5, label: 'Ngủ lấy lại sức', phases: [5, 6], color: 0x7b8fb5 },
  { id: 'bed4', kind: 'sleep', x: -20.4, z: -22.5, r: 1.5, label: 'Ngủ lấy lại sức', phases: [5, 6], color: 0x7b8fb5 },
  { id: 'dig', kind: 'dig', mg: 'mash', theme: 'pickaxe', mgTitle: 'Đào hầm (bấm liên tục)', x: -24.5, z: -25.6, r: 3.2, label: 'Đào hầm', phases: [6], cost: 10, color: 0x6d4c41, snd: 'dig', nr: 32 },
  { id: 'fence', kind: 'fence', mg: 'keys', letters: true, mgLen: 12, mgTitle: 'Cắt hàng rào (3 sợi dây thép)', x: 63, z: 38, r: 1.2, label: 'Cắt hàng rào để trốn (cần kìm + dây thừng + đèn pin)', phases: [6], cost: 14, color: 0xff7043, snd: 'lock', nr: 34 },
  { id: 'exit', kind: 'exit', x: 62.4, z: -4, r: 2.2, label: 'Cổng trại: làm thủ tục mãn hạn', phases: [1, 2, 3, 4, 5], hold: 5, color: 0x55efc4 },
  { id: 'shop', kind: 'shop', x: 30, z: -1.2, r: 2.6, label: 'Chợ đen của Tày Scam', phases: null, color: 0xffd23f },
];

export const ITEM_NAMES = { spoon: 'Thìa', pliers: 'Kìm', map: 'Bản đồ', rope: 'Dây thừng', torch: 'Đèn pin' };
export const ESCAPE_ITEMS = ['pliers', 'map', 'rope', 'torch']; // phải có đủ để chui khỏi đường hầm
export const DIG_ITEMS = ['spoon', 'pliers']; // để đào hầm: thìa xúc đất, kìm cắt rễ cây và ống nước
export const FENCE_ITEMS = ['pliers', 'rope', 'torch']; // để cắt hàng rào: kìm, dây thừng leo, đèn pin soi dây thép gai

// ---------- Chợ đen ----------
export const DEALER = { id: 'dealer', name: 'Tày Scam', x: 30, z: -3.9, ry: 0 };
export const SHOP = [
  { id: 'reddog', name: 'Nước tăng lực Reddog', icon: '🥤', price: 15, desc: 'Phím R: +40 sức, tăng tốc 30 giây.', limit: 0 },
  { id: 'bomb', name: 'Thuốc nổ', icon: '💣', price: 25, desc: 'Phím Q: gây sát thương, dụ quản giáo. Tối đa 2 lần/ngày.', limit: RULES.bombBuyPerDay },
  { id: 'rope', name: 'Dây thừng', icon: '🪢', price: 50, desc: 'Cần để vượt ngục.', limit: 0 },
  { id: 'torch', name: 'Đèn pin', icon: '🔦', price: 40, desc: 'Cần để vượt ngục.', limit: 0 },
];

// ---------- Tuần tra của quản giáo ----------
export const GUARD_ROUTES = [
  // 1: khu buồng giam + sân
  [[-27, -11.5], [-27, -17], [-20, -17], [-27, -17], [-27, -11.5], [-12, -11.5], [0, -11.5], [0, 0], [-11, 0], [-11, 8], [0, 8], [0, -11.5]],
  // 2: hành lang nhà ăn + xưởng
  [[0, -11.5], [26, -11.5], [26, -17], [26, -11.5], [26, 6.5], [26, 12], [26, 6.5], [11, 6.5], [11, -11.5]],
  // 3: thư viện + sân phía nam
  [[-27, 6.5], [-27, 12], [-27, 6.5], [-12, 6.5], [-12, 16], [10, 16], [10, 6.5], [-12, 6.5]],
  // 4: vòng ngoài phía đông (sau chợ đen)
  [[34, -11.5], [38.5, -11.5], [38.5, 6.5], [34, 6.5]],
  // 5: vòng ngoài phía tây
  [[-28, -11.5], [-38.5, -11.5], [-38.5, 6.5], [-28, 6.5]],
  // 6: bên trong nhà ăn
  [[26, -11.5], [26, -22.5], [17, -22.5], [26, -22.5], [35.5, -20.6], [26, -22.5]],
  // 7: bên trong xưởng
  [[26, 6.5], [26, 16.5], [17, 16.5], [26, 16.5], [35, 16.5], [26, 16.5], [26, 22]],
  // 8: hành lang khu y tế + phòng giặt (phía đông)
  [[40, -11], [52, -11], [52, -17], [52, -11], [60, -11], [52, -11], [52, -4], [52, -11]],
  // 9: vườn rau + lối đi phía đông
  [[40, 4.5], [52, 4.5], [52, 16], [44.5, 16], [58, 16], [52, 16], [52, 26], [52, 16], [52, 4.5]],
  // 10: dãy phía nam (giải trí, gym, tắm)
  [[-27, 29.5], [-27, 35], [-27, 29.5], [-5, 29.5], [0, 29.5], [0, 37], [0, 29.5], [26, 29.5], [26, 32.5], [26, 29.5], [45, 29.5], [45, 40], [45, 29.5]],
  // 11: góc đông nam, canh đoạn hàng rào có thể cắt
  [[46, 34], [60, 34], [62, 42], [52, 44], [46, 34]],
];

// Chỉ 2 tù nhân NPC (trước đây 13) để màn hình bớt chật chội, người chơi là chính
export const INMATE_NPCS = [
  { x: -6, z: -1, ry: 1.2 }, { x: 33, z: -17.5, ry: 2 },
];

// Chú mèo cathehe đi dạo quanh nhà tù: các điểm nó hay ghé (đều là chỗ trống, đi tới được)
export const CAT = { id: 'cat', name: 'cathehe', x: 3, z: 12.5 };
export const CAT_SPOTS = [
  [3, 12.5], [-27, 6.5], [-27, -10], [0, 0], [-12, 16], [26, 6.5], [26, -9], [38, -8], [30, 6], [10, 16],
  [41, 30], [52, 4.5], [52, -11], [52, 16], [52, 24], [-27, 29.5], [0, 29.5], [26, 29.5], [-27, 36], [0, 36], [20, 36],
  [52, -6], [-38.75, 10], [-8, 22], [38, 20], [38, -20],
];

// ---------- Lời thoại NPC ----------
export const NPC_LINES = {
  guard: [
    'KAYFF BỊ EM ĐÉP CHÉN NGƯỜI YÊU', 'NGOAN NÀO', 'KAYHUAHUA', 'TRẢ 3 TỶ CHO ANH TAO',
    'Giữ trật tự!', 'Ai đi lung tung thì vào biệt giam.', 'Hôm nay yên ắng quá nhỉ...', 'Đừng có nghĩ đến chuyện khác.',
  ],
  guardNight: ['Tắt đèn rồi, về buồng!', 'Ai còn ngoài hành lang?', 'Nghe có tiếng động...', 'Ngủ đi, đừng để tôi đi kiểm tra lần nữa.'],
  guardAlert: ['Ai đó?! Đứng lại!', 'Tiếng gì thế kia?!', 'Có động! Qua đó xem!', 'Ra đây ngay!', 'Đứa nào đang làm trò?!'],
  guardSearch: ['Giơ tay lên! Khám người!', 'Đứng yên! Tao khám!', 'Lại đây, lục túi xem nào!'],
  guardBeat: ['CON CHÓ LÀY', 'Dám cãi à?!', 'Biết thân biết phận chưa!'],
  inmate: [
    'MÀY TRẢ 3 TỶ CHO TAO...', 'DMM QUỲ XUỐNG', 'HẾT WC NÀY MÌNH CƯỚI EM NHÉ', 'VỊT CHẠY NÀY, 2-3 GO',
    'DÙ LÀ CƠN MƯA BĂNG GIÁAA', '6789',
  ],
  dealer: [
    'NHÀ TÔI 3 ĐỜI SCAM CSGO!', 'NỐT RUỒI LỆCH CHUẨN', 'Thuốc nổ giá hữu nghị nè!', 'Tao uy tín lắm, tin tao đi!',
    'Mua dây thừng không? Chắc chắn!', 'Bảo hành... à thôi, không bảo hành.',
  ],
  dealerScam: ['BÀI HỌC ĐẦU TIÊN LÀ ĐỪNG TIN', 'Hết hàng rồi nhé, cảm ơn nhé!', 'Ơ, thế mày không nhận được à? Lạ nhỉ...', 'Chuyện làm ăn mà, có lời có lỗ!'],
  dealerOk: ['Giao dịch vui vẻ!', 'Lần sau lại ghé nhé!', 'Đừng nói với quản giáo nhé!'],
  cat: ['Meo~', 'Meooo!', 'Mrrrr...', 'Meo meo!', 'Cathehe đây~', 'Meo? (xin cá)', 'Nyaa~'],
};
