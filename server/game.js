// Logic trò chơi phía server (authoritative): phòng, lịch sinh hoạt, quản giáo, trạm, minigame, chợ đen, bom, bắt giữ, vượt ngục.
import { randomUUID } from 'node:crypto';
import {
  PHASES, NIGHT_PHASE, RULES, ENERGY, BOOST, GUARD, STATIONS, zoneAt, CELL_SPAWNS, SOLITARY_POS, OFFICE_POS,
  GUARD_ROUTES, INMATE_NPCS, CAT, CAT_SPOTS, LIGHTS, LIGHTHOUSE, spotAt, NIGHT_FREE_KINDS, DEALER, SHOP, NPC_LINES, ITEM_NAMES, ESCAPE_ITEMS, DIG_ITEMS, FENCE_ITEMS, PLAYER_RADIUS, PLAYER_SPEED,
} from '../shared/map.js';
import { stepMove, lineOfSight, blocked, moveSpeed, isRunning } from '../shared/sim.js';
import { distField, nextStep } from '../shared/nav.js';
import { rnd, pick, angDiff, cleanChat } from './util.js';

const r2 = (n) => Math.round(n * 100) / 100;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const INPUT_SLOT = 0.05; // giây: client gửi một lệnh điều khiển mỗi 50 ms
const ESCAPE_SCORE = 450; // điểm xếp hạng cho mỗi lần vượt ngục thành công
const STATION_BY_ID = new Map(STATIONS.map((s) => [s.id, s]));
const SHOP_BY_ID = new Map(SHOP.map((s) => [s.id, s]));
const SHOP_STATION = STATION_BY_ID.get('shop');
const CONTRA = ['spoon', 'pliers', 'map', 'rope', 'torch'];
// thời gian tối thiểu (giây) để một minigame hợp lệ — chống gửi kết quả giả tức thì
const mgMin = (kind, params) => {
  switch (kind) {
    case 'timing': return params.rounds * 0.55;
    case 'keys': return params.seq.length * 0.18;
    case 'wires': return 2;
    case 'sort': return params.n * 0.3;
    case 'memory': return 6;
    case 'pairs': return 3;
    case 'clean': return 4;
    case 'mash': return 2.5;
    case 'balance': return params.dur * 0.8;
    case 'pong': return 5;
    case 'kick': return 4;
    case 'bricks': return 6;
    case 'marbles': return 3.5;
    default: return (params.rounds || 3) * 2;
  }
};
// Vị trí người/NPC trong gói snapshot nén thành số nguyên: x,z theo 0,1 m; góc theo 0,05 rad (client chia lại).
const Q = (v) => Math.round(v * 10);
const QA = (v) => Math.round(v * 20);
const SNAP_NEAR_R = 40; // mét: trong bán kính này gửi đủ tần suất (rộng hơn tầm nhìn camera để không bị giật)
const SNAP_MAX_BUFFERED = 64 * 1024; // byte: nếu hàng đợi gửi của một kết nối vượt ngưỡng này thì bỏ qua gói snapshot (N7)
const SNAP_FAR_EVERY = 5; // ngoài bán kính: cứ 5 gói mới gửi 1 lần (~3 lần/giây)
const MG_LIMIT = { hilo: 25, timing: 30, keys: 30, aim: 45, wires: 45, sort: 45, memory: 50, pairs: 50, clean: 45, mash: 45, balance: 45, pong: 60, kick: 45, bricks: 60, marbles: 60 };
const MG_LIMIT_DEFAULT = 60; // minigame mới chưa khai báo vẫn phải có hạn chót
// Kết quả minigame do client báo nên không kiểm chứng được hoàn toàn; với các việc giá trị cao
// (vượt ngục, trộm đồ, đào hầm) đặt sàn thời gian tối thiểu cao hơn để gửi kết quả giả không còn "gần như tức thì".
const MG_HIGH_VALUE_MIN = 4; // đủ thấp để người chơi giỏi không bị tính là "làm ẩu"
const HIGH_VALUE_KINDS = new Set(['fence', 'item', 'dig']);
// mã hoạt động gửi cho client để diễn hoạt động tác tương ứng
const ACT_CODE = { work: 1, exercise: 2, sleep: 3, dig: 4, fence: 4, read: 5, sweep: 6, chore: 6, meal: 7, item: 8, rest: 10, play: 11 };
// ---- Tù nhân NPC sinh hoạt theo lịch: mỗi giờ đi tới một trạm phù hợp rồi làm việc tại đó ----
const NPC_SPEED = 3.0;
const NPC_PLACES = {
  1: [STATION_BY_ID.get('meal')], 4: [STATION_BY_ID.get('meal')],
  2: STATIONS.filter((s) => s.kind === 'work' || s.kind === 'chore'),
  3: STATIONS.filter((s) => s.kind === 'exercise'),
  5: STATIONS.filter((s) => ['read', 'play', 'sweep', 'rest'].includes(s.kind)),
};
const NPC_BEDS = STATIONS.filter((s) => s.kind === 'sleep' && !s.heal);
// Trường khoảng cách tới các điểm cố định (trạm, giường) tính một lần, dùng chung cho mọi phòng
const STATIC_FIELDS = new Map();
function staticField(x, z) {
  const key = `${Math.round(x * 2)},${Math.round(z * 2)}`;
  let f = STATIC_FIELDS.get(key);
  if (!f) { f = distField(x, z); STATIC_FIELDS.set(key, f); }
  return f;
}
const EVENT_TEXT = {
  rain: '🌧️ Trời mưa to: tiếng động bị át đi, quản giáo khó nghe hơn.',
  blackout: '🔦 Cúp điện toàn trại! Quản giáo nhìn kém hơn.',
  inspect: '🚨 Khám buồng đột xuất! Ai đang ở buồng giam mà giấu đồ lậu sẽ bị tịch thu.',
};

export class Room {
  constructor(id) {
    this.id = id;
    this.players = new Map();
    this.seq = 1;
    this.phase = 0;
    this.phaseT = PHASES[0].dur;
    this.day = 1;
    this.dig = { pr: 0, open: false };
    this.clock = 0;
    this.snapAcc = 0;
    this.snapN = 0;
    this.bytes = 0; // tổng byte đã gửi (để đo băng thông)
    this.lbAcc = 0;
    this.emptySince = Date.now();
    this.bombs = [];
    this.bombSeq = 1;
    this.event = null;
    this.fields = new Map(); // cache trường khoảng cách cho quản giáo
    this.sayAt = new Map();
    this.lightLit = new Map();
    this.npcs = [];
    GUARD_ROUTES.forEach((route, i) => {
      const [x, z] = route[0];
      this.npcs.push({ id: `g${i}`, kind: 'guard', x, z, ry: 0, heading: 0, route, wp: 1, wait: rnd(0, 2), sayT: rnd(15, 45), alert: null, returning: false, shoutCd: 0 });
    });
    INMATE_NPCS.forEach((n, i) => this.npcs.push({ id: `i${i}`, kind: 'inmate', idx: i, x: n.x, z: n.z, ry: n.ry, base: n.ry, sayT: rnd(25, 60), tgt: null, act: 0, stay: 0, delay: 0, phaseSeen: -1 }));
    this.npcs.push({ id: DEALER.id, kind: 'dealer', x: DEALER.x, z: DEALER.z, ry: DEALER.ry, base: DEALER.ry, sayT: rnd(15, 40) });
    this.npcs.push({ id: CAT.id, kind: 'cat', x: CAT.x, z: CAT.z, ry: 0, heading: 0, wait: rnd(1, 3), spot: -1, sayT: rnd(20, 50) });
    this.guards = this.npcs.filter((n) => n.kind === 'guard');
  }

  get size() { return this.players.size; }

  // ---------- Gửi ----------
  send(p, obj) {
    if (p.ws && p.ws.readyState === 1) { const s = JSON.stringify(obj); this.bytes += s.length; p.ws.send(s); }
  }
  broadcast(obj, exceptId = null) {
    const s = JSON.stringify(obj);
    for (const p of this.players.values()) if (p.id !== exceptId && p.ws.readyState === 1) { this.bytes += s.length; p.ws.send(s); }
  }
  toast(p, m, kind = 'info') { this.send(p, { t: 'toast', m, kind }); }
  sys(m) { this.broadcast({ t: 'sys', m }); }
  // Mỗi NPC chỉ nói một câu tại một thời điểm: câu thường bị bỏ qua nếu vừa nói xong, tiếng quát chỉ ngắt được sau 1.2 giây
  // Lời thoại thường còn bị giới hạn chung cả phòng (không ai khác nói trong 4 giây trước đó) để màn hình không bị chữ chồng chất;
  // tiếng quát và phản hồi trực tiếp (always) thì không bị chặn.
  say(id, m, yell = 0, always = false) {
    const last = this.sayAt.get(id) ?? -99;
    if (this.clock - last < (yell ? 1.2 : 12)) return;
    if (!yell && !always && this.clock - (this.lastSayAny ?? -99) < 4) return;
    this.sayAt.set(id, this.clock);
    this.lastSayAny = this.clock;
    this.broadcast({ t: 'say', id, m, y: yell });
  }

  // ---------- Người chơi ----------
  addPlayer(ws, name) {
    const id = `p${this.seq++}`;
    const sp = pick(CELL_SPAWNS);
    const p = {
      id, ws, name, num: String(100 + Math.floor(Math.random() * 900)),
      x: sp[0], z: sp[1], ry: Math.PI, mx: 0, mz: 0, act: false, actPrev: false, lastIn: Date.now(), inSeq: 0,
      pts: 0, items: {}, hold: null, detect: 0, jail: 0, jailKind: 'solitary', done: {}, touchCd: 0,
      rel: 0, esc: 0, lastChat: 0, near: null,
      hp: RULES.hpMax, en: ENERGY.max, jack: 0, labor: 0, stock: { reddog: 0, bomb: 0 }, bombBuys: 0,
      boost: 0, stun: 0, mg: null, hurtT: 0, lastAct: 0,
      sneak: false, rockCd: 0, bombHeat: 0, chased: false, disc: false, discAt: 0,
      warn: 0, fenceCuts: 0, t0: this.clock, exitNoiseT: 0, run: false, runNoiseT: 0, activeAt: Date.now(),
    };
    p.sid = randomUUID(); // mật mã an toàn: ai đoán được sid là chiếm được nhân vật đang mất kết nối
    this.players.set(id, p);
    this.emptySince = null;
    this.send(p, this.welcomeMsg(p));
    this.broadcast({ t: 'join', p: this.pubPlayer(p) }, id);
    this.sys(`${name} (TN-${p.num}) vừa nhập trại.`);
    this.toast(p, PHASES[this.phase].hint, 'hint');
    return p;
  }

  welcomeMsg(p) {
    return {
      t: 'welcome', id: p.id, name: p.name, num: p.num, room: this.id, day: this.day, sid: p.sid,
      players: [...this.players.values()].map((q) => this.pubPlayer(q)),
      npcs: this.npcs.map((n) => ({ id: n.id, kind: n.kind, x: r2(n.x), z: r2(n.z), ry: r2(n.ry) })),
    };
  }

  // Mất kết nối: giữ chỗ để người chơi vào lại được
  disconnect(p) {
    p.ws = { readyState: 3, send() {} };
    p.disc = true; p.discAt = this.clock;
    p.mx = 0; p.mz = 0; p.act = false; p.sneak = false; p.run = false;
  }
  reattach(p, ws) {
    p.ws = ws; p.disc = false; p.lastIn = Date.now(); p.lastSlow = null; p.goalCache = null;
    this.send(p, this.welcomeMsg(p));
    this.toast(p, 'Đã kết nối lại. Chào mừng trở lại!', 'info');
  }

  pubPlayer(p) { return { id: p.id, name: p.name, num: p.num, x: r2(p.x), z: r2(p.z), ry: r2(p.ry) }; }

  // Ghi nhận người chơi vừa thao tác (chat, mua đồ, minigame...) để không bị coi là AFK
  touch(p) { p.activeAt = Date.now(); }

  // Mời một người chơi ra khỏi phòng (vd. đứng im quá lâu khi có hàng chờ)
  kick(p, why) {
    this.send(p, { t: 'kicked', why });
    try { p.ws.close(4000, why); } catch { /* bỏ qua */ }
    this.removePlayer(p.id);
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return;
    this.players.delete(id);
    this.broadcast({ t: 'leave', id });
    if (this.players.size === 0) this.emptySince = Date.now();
  }

  // Lệnh điều khiển được áp dụng ngay khi nhận. Client gửi một lệnh mỗi 50 ms (INPUT_SLOT), nên lệnh số seq ứng với thời điểm
  // seq x 50 ms trên "dòng thời gian của client". p.tl = server đã mô phỏng được bao lâu kể từ đầu ô của lệnh hiện tại.
  // Khi lệnh kế đến muộn (mạng rung), phần mô phỏng lố được mang sang ô của lệnh sau thay vì bị quên; client nhận p.tl qua `ia`
  // và chỉ chạy lại đúng phần còn thiếu (shared/predict.js). Nhờ vậy gói đến sớm/muộn không làm nhân vật bị kéo giật.
  setInput(p, msg) {
    const c = (v) => (Number.isFinite(v) ? clamp(v, -1, 1) : 0);
    const seq = msg.seq | 0;
    // Mốc thời gian phía client của lệnh (ms). Chỉ dùng để ghi sổ cho việc đối chiếu vị trí của CHÍNH người đó, không ảnh hưởng tới di chuyển,
    // nên client khai sai cũng chỉ tự làm mình bị giật. Client cũ không gửi ct thì coi như các lệnh cách nhau đúng 50 ms.
    const ct = Number.isFinite(msg.ct) ? msg.ct : seq * INPUT_SLOT * 1000;
    const ahead = p.inCt === undefined ? 0 : (ct - p.inCt) / 1000; // lệnh mới nằm sau lệnh cũ bao nhiêu giây trên dòng thời gian của client
    p.inCt = ct;
    // p.tl có thể ÂM (lệnh đến sớm hơn nhịp 50 ms: server mô phỏng chưa đủ ô trước) hoặc dương (đến muộn: mô phỏng lố sang ô này).
    // Nhân 0,9 để mốc tự trôi dần về độ trễ trung bình hiện tại, không bị neo mãi vào gói đầu tiên.
    const tl = ((p.tl || 0) - ahead) * 0.9;
    p.tl = seq > (p.inSeq | 0) && ahead > 0 && ahead < 0.5 && Math.abs(tl) < 0.3 ? tl : 0; // số thứ tự bất thường (vào lại, tràn số) hoặc lệch quá xa: bắt đầu lại
    p.mx = c(msg.mx);
    p.mz = c(msg.mz);
    p.act = !!msg.act;
    p.sneak = !!msg.sneak;
    p.run = !!msg.run;
    if (p.mx || p.mz || p.act) p.activeAt = Date.now(); // có thao tác thật (không tính gói input trống gửi liên tục)
    p.inSeq = seq;
    p.lastIn = Date.now();
  }

  chat(p, raw) {
    const now = Date.now();
    if (now - p.lastChat < 900) return;
    const m = cleanChat(raw);
    if (!m) return;
    p.lastChat = now;
    this.broadcast({ t: 'chat', id: p.id, name: p.name, num: p.num, m });
  }

  // Công cụ thử nghiệm (chỉ khi chạy với DEV=1): dịch chuyển, đổi phase, cấp đồ.
  dev(p, m) {
    if (Number.isFinite(m.x) && Number.isFinite(m.z) && !blocked(m.x, m.z, PLAYER_RADIUS, p.labor)) { p.x = m.x; p.z = m.z; this.send(p, { t: 'tp', x: p.x, z: p.z }); }
    if (Number.isInteger(m.phase) && PHASES[m.phase]) { this.phase = m.phase; this.phaseT = PHASES[m.phase].dur; for (const q of this.players.values()) q.done = {}; this.broadcast({ t: 'phase', i: this.phase, day: this.day }); }
    if (m.items) p.items = { spoon: true, pliers: true, map: true, rope: true, torch: true };
    if (Number.isFinite(m.dig)) { this.dig.pr = m.dig; }
    if (Number.isFinite(m.jack)) p.jack = m.jack;
    if (Number.isFinite(m.labor)) p.labor = m.labor;
    if (Number.isFinite(m.en)) p.en = m.en;
  }

  // ---------- Vòng lặp ----------
  tick(dt) {
    this.clock += dt;
    const hold = this.holdSecs ?? RULES.reconnectSecs; // sảnh rút ngắn thời gian giữ chỗ khi có hàng chờ
    for (const p of [...this.players.values()]) if (p.disc && this.clock - p.discAt > hold) this.removePlayer(p.id);
    this.updatePhase(dt);
    this.updateNpcs(dt);
    for (const p of this.players.values()) this.updatePlayer(p, dt);
    this.updateBombs(dt);
    this.updateLights(dt);
    this.updateDetection(dt);
    this.snapAcc += dt;
    if (this.snapAcc >= 1 / 15) { this.snapAcc = Math.min(this.snapAcc - 1 / 15, 1 / 15); this.sendSnapshots(); } // giữ phần dư để đủ 15 gói/giây
    this.lbAcc += dt;
    if (this.lbAcc >= 4) { this.lbAcc = 0; this.sendLeaderboard(); }
  }

  updatePhase(dt) {
    this.phaseT -= dt;
    if (this.phaseT > 0) return;
    this.endPhase();
    for (const p of this.players.values()) this.cancelMg(p); // minigame dở dang không được tính sang giờ/ngày mới (vd. đào hầm)
    this.phase = (this.phase + 1) % PHASES.length;
    this.phaseT = PHASES[this.phase].dur;
    if (this.phase === 0) {
      this.day++;
      for (const p of this.players.values()) { p.bombBuys = 0; p.warn = Math.max(0, p.warn - 1); } // sang ngày mới: được xoá bớt một cảnh cáo
      if (this.dig.pr > 0 || this.dig.open) {
        this.sys('Quản giáo phát hiện và lấp đường hầm trong đêm. Công việc đào phải làm lại từ đầu.');
        this.dig = { pr: 0, open: false };
      }
    }
    if (this.phase === NIGHT_PHASE) this.lightsOut();
    for (const p of this.players.values()) p.done = {}; // thông báo giờ sinh hoạt hiển thị ở giữa phía trên màn hình (client)
    this.broadcast({ t: 'phase', i: this.phase, day: this.day });
    this.rollEvent();
  }

  // Đến giờ ngủ: mọi phạm nhân (không bị giam) tự động được đưa về buồng
  lightsOut() {
    for (const p of this.players.values()) {
      if (p.jail > 0) continue;
      this.cancelMg(p);
      p.hold = null; p.chased = false; p.detect = 0;
      const sp = pick(CELL_SPAWNS);
      p.x = sp[0]; p.z = sp[1];
      this.send(p, { t: 'tp', x: p.x, z: p.z });
      this.toast(p, 'Đến giờ ngủ: bạn đã được đưa về buồng. Ra ngoài ban đêm rất nguy hiểm: quản giáo nhanh hơn và đèn pha hải đăng sẽ quét khắp trại!', 'warn');
    }
    for (const g of this.guards) { g.chase = null; g.alert = null; g.returning = true; }
  }

  // Sự kiện ngẫu nhiên kéo dài hết một giờ sinh hoạt (từ ngày 2)
  rollEvent() {
    this.event = null;
    if (this.day >= 2 && Math.random() < RULES.eventChance) {
      const pool = this.phase === 5 ? ['rain', 'blackout', 'inspect'] : ['rain', 'blackout'];
      this.event = pick(pool);
      this.sys(EVENT_TEXT[this.event]);
      this.broadcast({ t: 'event', e: this.event });
      if (this.event === 'inspect') {
        for (const p of this.players.values()) {
          if (p.jail > 0 || zoneAt(p.x, p.z) !== 'cell') continue;
          if (CONTRA.some((k) => p.items[k]) || p.stock.bomb > 0) {
            p.items = {}; p.stock.bomb = 0;
            p.pts = Math.max(0, p.pts - RULES.searchPenalty);
            this.toast(p, 'Khám buồng: đồ lậu của bạn bị tịch thu!', 'warn');
          }
        }
      }
    }
  }

  // Hết một giờ sinh hoạt: ai bỏ bê nghĩa vụ thì bị cảnh cáo (người mới vào chưa đủ 60% thời lượng giờ đó thì được bỏ qua)
  endPhase() {
    const ph = this.phase;
    for (const p of this.players.values()) {
      if (p.jail > 0 || this.clock - p.t0 < PHASES[ph].dur * 0.6) continue;
      if (ph === 0) {
        if (zoneAt(p.x, p.z) === 'cell') { p.jack += 5; this.addPoints(p, 10, 'điểm danh đủ'); }
        else this.violation(p, 'vắng mặt khi điểm danh', RULES.absentPenalty);
      } else if (ph === 1 || ph === 4) {
        if (!(p.done.meal > 0)) {
          p.en = Math.max(0, p.en - RULES.skipMealEnergy);
          this.violation(p, `bỏ bữa ăn (đói, -${RULES.skipMealEnergy} sức)`, RULES.skipMealPenalty);
        }
      } else if (ph === 2) {
        if (!((p.done.work || 0) + (p.done.chore || 0))) this.violation(p, 'trốn lao động', RULES.skipWorkPenalty);
      }
    }
  }

  violation(p, why, penalty) {
    p.warn++;
    p.pts = Math.max(0, p.pts - penalty);
    this.toast(p, `⚠️ Cảnh cáo ${p.warn}: ${why}. -${penalty} điểm.`, 'warn');
    if (p.warn === RULES.warnWatch) this.toast(p, 'Quản giáo đã để mắt tới bạn: họ nhìn xa hơn và phát hiện bạn nhanh hơn. Cư xử tốt đến hết ngày để được xoá bớt cảnh cáo.', 'warn');
  }

  addPoints(p, n, why, extra = '') {
    const was = p.pts;
    p.pts += n;
    this.toast(p, `+${n} điểm cải tạo (${why})${extra}`, 'good');
    // Đủ điểm không tự động mãn hạn: người chơi phải tự ra cổng trại làm thủ tục (có thể chọn vượt ngục thay vì ra cổng)
    if (was < RULES.releasePoints && p.pts >= RULES.releasePoints) this.toast(p, '🎉 Đủ điểm cải tạo! Ra Cổng trại (phía đông) làm thủ tục mãn hạn, hoặc cứ tiếp tục kế hoạch vượt ngục.', 'item');
  }

  resetInmate(p) {
    const sp = pick(CELL_SPAWNS);
    p.warn = 0; p.fenceCuts = 0; p.chased = false;
    p.x = sp[0]; p.z = sp[1]; p.pts = 0; p.items = {}; p.hold = null; p.detect = 0; p.jail = 0; p.mg = null;
    p.hp = RULES.hpMax; p.en = ENERGY.max; p.jack = 0; p.labor = 0; p.stock = { reddog: 0, bomb: 0 }; p.boost = 0; p.stun = 0;
    this.send(p, { t: 'tp', x: p.x, z: p.z });
  }

  release(p) {
    p.rel++;
    this.send(p, { t: 'win', kind: 'release', day: this.day });
    this.sys(`🎉 ${p.name} (TN-${p.num}) đã cải tạo tốt và được mãn hạn tù!`);
    this.resetInmate(p);
  }

  escape(p) {
    p.esc++;
    this.send(p, { t: 'win', kind: 'escape', day: this.day });
    this.sys(`🚨 ${p.name} (TN-${p.num}) đã VƯỢT NGỤC thành công!`);
    this.resetInmate(p);
  }

  cancelMg(p, notify = true) {
    if (!p.mg) return;
    p.mg = null;
    if (notify) this.send(p, { t: 'mgx' });
  }

  // Tín hiệu hoạt ảnh một lần (đánh, bị đánh, khám người, còng tay) để client diễn đúng cử động
  anim(id, k) { this.broadcast({ t: 'anim', id, k }); }

  lockUp(p, kind, secs, pos, why, penalty) {
    this.cancelMg(p);
    p.fenceCuts = 0;
    p.jail = secs;
    p.jailKind = kind;
    p.pts = Math.max(0, p.pts - penalty);
    p.items = {};
    p.stock.bomb = 0;
    p.hold = null;
    p.detect = 0;
    p.chased = false;
    for (const g of this.guards) if (g.chase && g.chase.pid === p.id) { g.chase = null; g.returning = true; }
    p.x = pos[0]; p.z = pos[1];
    this.send(p, { t: 'caught', why, secs, kind });
    this.send(p, { t: 'tp', x: p.x, z: p.z });
  }

  catchPlayer(p, why, g = null) {
    if (g) this.anim(g.id, 'grab');
    this.anim(p.id, 'handsup');
    this.lockUp(p, 'solitary', RULES.jailSeconds, SOLITARY_POS, why, RULES.jailPenalty);
    this.sys(`${p.name} bị quản giáo bắt (${why}) và đưa vào biệt giam.`);
  }

  hurt(p, dmg, why) {
    if (p.jail > 0) return;
    p.hp -= dmg;
    p.hurtT = 8;
    this.cancelMg(p);
    p.stun = Math.max(p.stun, 0.8);
    this.anim(p.id, 'hit');
    this.broadcast({ t: 'snd', k: 'hit', x: r2(p.x), z: r2(p.z) });
    if (p.hp <= 0) {
      p.hp = 0;
      this.lockUp(p, 'office', RULES.hpJailSeconds, OFFICE_POS, why, RULES.searchPenalty);
      this.sys(`${p.name} kiệt sức vì bị thương (${why}) và bị nhốt vào phòng quản giáo ${RULES.hpJailSeconds} giây.`);
    }
  }

  // ---------- Tiếng động thu hút quản giáo ----------
  noise(x, z, R, snd = null) {
    if (snd) this.broadcast({ t: 'snd', k: snd, x: r2(x), z: r2(z) });
    if (!R) return;
    if (this.event === 'rain') R *= 0.5;
    for (const g of this.guards) {
      if (g.chase) continue;
      if (Math.hypot(g.x - x, g.z - z) > R) continue;
      const first = !g.alert;
      g.alert = { x, z, t: 0, wait: GUARD.alertWait };
      g.returning = false; g.wait = 0;
      if (first && g.shoutCd <= 0) { g.shoutCd = 20; this.say(g.id, pick(NPC_LINES.guardAlert), 1); }
    }
  }

  // Tiếng động của một trạm: làm việc hợp lệ (đúng giờ, đúng việc, ban ngày) thì KHÔNG thu hút quản giáo (chỉ phát âm thanh),
  // nên quản giáo không chạy tới/báo động khi người chơi đang làm đúng việc. Lén lút hoặc ban đêm thì gây tiếng động như cũ.
  stationNoise(p, s) {
    if (!s.snd) return;
    const night = this.phase === NIGHT_PHASE;
    const legit = s.phases && s.phases.includes(this.phase) && !night && s.kind !== 'item' && s.kind !== 'dig';
    const R = legit ? 0 : (s.nr || 0) * (night ? 1.25 : 1);
    this.noise(p.x, p.z, R, s.snd);
  }

  updatePlayer(p, dt) {
    p.tl = (p.tl || 0) + dt; // đã mô phỏng thêm dt giây với lệnh hiện tại
    if (p.touchCd > 0) p.touchCd -= dt;
    if (p.stun > 0) p.stun -= dt;
    if (p.boost > 0) p.boost -= dt;
    if (p.hurtT > 0) p.hurtT -= dt;
    if (p.rockCd > 0) p.rockCd -= dt;
    if (p.bombHeat > 0) p.bombHeat -= dt;
    if (p.jail > 0) {
      // trong biệt giam: bắt buộc phải chờ hết án, không có cách rút ngắn
      p.actPrev = p.act;
      if (p.mg) this.cancelMg(p);
      p.jail -= dt;
      if (p.jail <= 0) {
        this.cancelMg(p);
        const sp = pick(CELL_SPAWNS);
        p.x = sp[0]; p.z = sp[1]; p.jail = 0;
        if (p.jailKind === 'office') p.hp = RULES.hpAfterJail;
        this.send(p, { t: 'tp', x: p.x, z: p.z });
        this.toast(p, 'Bạn được thả ra. Cư xử tử tế nhé.', 'info');
      }
      p.near = null;
      return;
    }
    if (p.hp < RULES.hpMax && p.hurtT <= 0) p.hp = Math.min(RULES.hpMax, p.hp + RULES.hpRegen * dt);
    if (Date.now() - p.lastIn > 1000) { p.mx = 0; p.mz = 0; p.act = false; } // 1 giây (trước 0,4 giây): mạng nghẽn ngắn không làm nhân vật khựng lại

    // đang chơi minigame: đứng yên, vẫn gây tiếng động
    if (p.mg) {
      const s = STATION_BY_ID.get(p.mg.sid);
      p.near = this.nearStation(p);
      p.actPrev = p.act;
      if (!p.near || p.near.s.id !== p.mg.sid || this.clock > p.mg.expire) { this.cancelMg(p); return; }
      p.mg.noiseT -= dt;
      if (p.mg.noiseT <= 0) { p.mg.noiseT = 1.8; this.stationNoise(p, s); }
      return;
    }
    if (p.stun > 0) { p.hold = null; p.near = this.nearStation(p); p.actPrev = p.act; return; }

    const moving = p.mx * p.mx + p.mz * p.mz > 0.01;
    if (moving) {
      const running = isRunning(p); // chạy: nhanh hơn nhưng tốn sức và ồn
      const speed = moveSpeed({ boost: p.boost, en: p.en, sneak: p.sneak, run: p.run });
      stepMove(p, p.mx, p.mz, dt, speed);
      p.ry = Math.atan2(p.mx, p.mz);
      p.en = Math.max(0, p.en - (running ? ENERGY.runDrain : ENERGY.moveDrain) * dt * (p.boost > 0 ? 1.5 : 1));
      if ((p.boost > 0 || running) && !p.sneak) { p.lastAct += dt; if (p.lastAct > (running ? 0.9 : 1.2)) { p.lastAct = 0; this.noise(p.x, p.z, running ? RULES.runNoise : 7, null); } }
    } else if (!p.hold) {
      p.en = Math.min(ENERGY.max, p.en + ENERGY.regen * dt);
    }
    p.near = this.nearStation(p);
    this.interact(p, dt, moving);
  }

  // ---------- Trạm tương tác ----------
  availability(p, s) {
    const ph = this.phase;
    if (s.kind === 'shop') return { ok: true, label: s.label };
    if (s.kind === 'dig') {
      if (ph !== NIGHT_PHASE && !this.dig.open) return { ok: false, label: 'Điểm đào hầm', why: 'Chỉ đào được lúc tắt đèn' };
      if (this.dig.open) {
        const miss = ESCAPE_ITEMS.filter((k) => !p.items[k]).map((k) => ITEM_NAMES[k]);
        if (!miss.length) return { ok: true, label: 'Chui qua đường hầm để vượt ngục' };
        return { ok: false, label: 'Đường hầm đã thông', why: `Còn thiếu: ${miss.join(', ')}` };
      }
      const missDig = DIG_ITEMS.filter((k) => !p.items[k]).map((k) => ITEM_NAMES[k]);
      if (missDig.length) return { ok: false, label: 'Điểm đào hầm', why: `Cần có để đào: ${missDig.join(', ')}` };
      if (p.en < s.cost) return { ok: false, label: 'Đào hầm', why: 'Quá mệt — hãy ăn, uống Reddog hoặc ngủ' };
      return { ok: true, label: 'Đào hầm (cả phòng cùng đào)' };
    }
    if (s.kind === 'exit') {
      if (s.phases && !s.phases.includes(ph)) return { ok: false, label: s.label, why: 'Cổng trại chỉ mở ban ngày (trừ giờ điểm danh)' };
      if (p.pts < RULES.releasePoints) return { ok: false, label: s.label, why: `Cần đủ ${RULES.releasePoints} điểm cải tạo (hiện ${p.pts})` };
      return { ok: true, label: s.label };
    }
    const nightFree = ph === NIGHT_PHASE && NIGHT_FREE_KINDS.includes(s.kind);
    if (s.phases && !s.phases.includes(ph) && !nightFree) return { ok: false, label: s.label, why: 'Chưa đến giờ' };
    if (s.kind === 'fence') {
      const miss = FENCE_ITEMS.filter((k) => !p.items[k]).map((k) => ITEM_NAMES[k]);
      if (miss.length) return { ok: false, label: s.label, why: `Còn thiếu: ${miss.join(', ')}` };
      if (p.en < s.cost) return { ok: false, label: s.label, why: 'Quá mệt — hãy ăn, uống Reddog hoặc ngủ' };
      return { ok: true, label: s.label };
    }
    if (s.kind === 'sleep') {
      if (p.en >= ENERGY.max - 0.5 && (!s.heal || p.hp >= RULES.hpMax - 0.5)) return { ok: false, label: s.label, why: s.heal ? 'Bạn đang khoẻ mạnh' : 'Bạn đang tràn đầy năng lượng' };
      return { ok: true, label: s.label };
    }
    if (s.kind === 'rest' && p.hp >= RULES.hpMax - 0.5 && p.en >= ENERGY.max - 0.5 && !s.pts) return { ok: false, label: s.label, why: 'Bạn đang khoẻ mạnh' };
    if (s.mg === 'hilo' && p.jack < RULES.hiloStake) return { ok: false, label: s.label, why: `Cần ít nhất ${RULES.hiloStake} Jack để đặt cược` };
    if (s.item && p.items[s.item]) return { ok: false, label: s.label, why: 'Bạn đã có rồi' };
    if (s.group && (p.done[s.group] || 0) >= s.cap) return { ok: false, label: s.label, why: 'Đã đủ lượt trong giờ này' };
    if (s.cost && p.en < s.cost) return { ok: false, label: s.label, why: 'Quá mệt — hãy ăn, uống Reddog hoặc ngủ' };
    return { ok: true, label: s.label };
  }

  nearStation(p) {
    let best = null, bd = Infinity;
    for (const s of STATIONS) {
      const d = Math.hypot(p.x - s.x, p.z - s.z);
      if (d <= s.r && d < bd) { best = s; bd = d; }
    }
    if (!best) return null;
    return { s: best, ...this.availability(p, best) };
  }

  interact(p, dt, moving) {
    const n = p.near;
    const rising = p.act && !p.actPrev;
    p.actPrev = p.act;
    if (!p.act || !n || !n.ok || moving) { p.hold = null; return; }
    const s = n.s;

    if (s.kind === 'shop') { if (rising) this.send(p, { t: 'shop' }); return; }

    if (s.kind === 'dig' && this.dig.open) { // chui ra khỏi hầm: giữ E (lâu và ồn: quản giáo nghe thấy tiếng sột soạt)
      if (!p.hold || p.hold.sid !== 'escape') p.hold = { sid: 'escape', t: 0, need: RULES.exitHold };
      p.hold.t += dt;
      p.exitNoiseT -= dt;
      if (p.exitNoiseT <= 0) { p.exitNoiseT = 1.5; this.noise(p.x, p.z, 18, null); }
      if (p.hold.t >= p.hold.need) this.escape(p);
      return;
    }

    if (s.kind === 'sleep') {
      p.hold = { sid: s.id, t: 0, need: 0 };
      p.en = Math.min(ENERGY.max, p.en + ENERGY.sleepRate * dt);
      p.hp = Math.min(RULES.hpMax, p.hp + (s.heal ? 7 : 2) * dt);
      return;
    }

    if (s.mg) { if (rising) this.startMg(p, s); return; }

    // trạm giữ E (ăn cơm)
    if (!p.hold || p.hold.sid !== s.id) p.hold = { sid: s.id, t: 0, need: s.hold };
    p.hold.t += dt;
    if (p.hold.t < s.hold) return;
    p.hold = null;
    if (s.kind === 'exit') { this.release(p); return; }
    if (s.kind === 'meal') {
      p.done[s.group] = (p.done[s.group] || 0) + 1;
      p.en = Math.min(ENERGY.max, p.en + ENERGY.mealGain);
      p.hp = Math.min(RULES.hpMax, p.hp + 10);
      this.stationNoise(p, s);
      this.addPoints(p, s.pts, 'ăn cơm', ` · +${ENERGY.mealGain} năng lượng`);
    } else if (s.kind === 'rest') { // xem tivi, tắm, khám sức khoẻ: hồi máu / sức, có chút điểm
      p.done[s.group] = (p.done[s.group] || 0) + 1;
      p.hp = Math.min(RULES.hpMax, p.hp + (s.gain?.hp || 0));
      p.en = Math.min(ENERGY.max, p.en + (s.gain?.en || 0));
      if (s.jack) p.jack += s.jack;
      this.addPoints(p, s.pts, s.label.toLowerCase(), ` · hồi ${s.gain?.hp || 0} máu, ${s.gain?.en || 0} sức${s.jack ? ` · +${s.jack} Jack` : ''}`);
    }
  }

  // ---------- Minigame ----------
  mgParams(s) {
    const kind = s.mg;
    if (kind === 'timing') {
      const dig = s.kind === 'dig';
      return { rounds: dig ? 4 : 3, speed: dig ? 2.6 : 2.2 + Math.random() * 0.6, zone: dig ? 0.15 : 0.18 };
    }
    if (kind === 'keys' && s.kind === 'fence') { // cắt hàng rào: chuỗi dài, thời gian ngắn
      const pool = 'ASDFGHJKLQWERTYUIOP', seq = [];
      for (let i = 0; i < (s.mgLen || 12); i++) seq.push(pool[Math.floor(Math.random() * pool.length)]);
      return { seq, letters: true, limit: 8 };
    }
    if (kind === 'keys') {
      const letters = !!s.letters;
      const len = s.mgLen || (s.kind === 'item' ? 6 : letters ? 5 : s.kind === 'work' ? 7 : 6);
      const seq = [];
      const pool = letters ? 'ASDFGHJKLQWERTYUIOP' : 'UDLR';
      for (let i = 0; i < len; i++) seq.push(pool[Math.floor(Math.random() * pool.length)]);
      return { seq, letters, limit: letters ? 9 : 7 };
    }
    if (kind === 'hilo') return {}; // lá bài do startMg rút
    if (kind === 'wires') return { n: 4 };
    if (kind === 'sort') return { n: 9, theme: s.theme || 'goods' };
    if (kind === 'memory') return { rounds: 3, lives: 2, theme: s.theme || 'code' };
    if (kind === 'pairs') return { pairs: 6, limit: 30, theme: s.theme || 'goods' };
    if (kind === 'clean') return { n: 10, theme: s.theme || 'dust' };
    if (kind === 'mash') return { need: s.kind === 'dig' ? 1.35 : 1, time: s.kind === 'dig' ? 8 : 8, theme: s.theme || 'pushup' };
    if (kind === 'balance') return { dur: 10, need: 6.5, zone: 0.3, theme: s.theme || 'pull' };
    if (kind === 'pong') return { hits: 8, lives: 3 };
    if (kind === 'kick') return { rounds: 3 };
    if (kind === 'bricks') return { target: 14, lives: 2 };
    if (kind === 'marbles') return { shots: 4, need: 3 };
    return { rounds: 3 }; // aim
  }

  startMg(p, s) {
    if (p.mg) return;
    const params = this.mgParams(s);
    p.en = Math.max(0, p.en - (s.cost || 0));
    const min = HIGH_VALUE_KINDS.has(s.kind) ? Math.max(mgMin(s.mg, params), MG_HIGH_VALUE_MIN) : mgMin(s.mg, params);
    p.mg = { sid: s.id, kind: s.mg, token: randomUUID().slice(0, 12), t0: this.clock, min, expire: this.clock + Math.max(MG_LIMIT[s.mg] ?? MG_LIMIT_DEFAULT, min + 5), noiseT: 1.2 };
    if (s.mg === 'hilo') { // chơi bài: server rút sẵn cả hai lá, chỉ cho client xem lá đầu (không thể gian lận lá thứ hai)
      const c1 = this.drawCard(), c2 = this.drawCard();
      p.mg.hilo = { c1, c2, done: false };
      params.card = c1;
    }
    p.hold = null;
    this.send(p, { t: 'mg', kind: s.mg, token: p.mg.token, title: s.mgTitle || s.label, params, boosted: p.boost > 0 });
    this.stationNoise(p, s);
  }

  drawCard() { return { r: 1 + Math.floor(Math.random() * 13), s: Math.floor(Math.random() * 4) }; } // r: 1=A .. 11=J, 12=Q, 13=K; s: chất

  // Chơi bài lớn/nhỏ: người chơi chọn 'hi' (lớn hơn) hoặc 'lo' (nhỏ hơn) so với lá thứ nhất; bằng nhau tính là thua.
  hilo(p, token, pick) {
    const g = p.mg;
    if (!g || g.kind !== 'hilo' || g.token !== String(token) || g.hilo.done || p.jail > 0) return;
    if (pick !== 'hi' && pick !== 'lo') return;
    g.hilo.done = true;
    const { c1, c2 } = g.hilo;
    const win = pick === 'hi' ? c2.r > c1.r : c2.r < c1.r;
    const before = p.jack;
    p.jack = win ? p.jack + RULES.hiloStake : Math.max(0, p.jack - RULES.hiloStake);
    const s = STATION_BY_ID.get(g.sid);
    if (s) p.done[s.group] = (p.done[s.group] || 0) + 1;
    this.send(p, { t: 'hilores', card: c2, win, d: p.jack - before });
    this.toast(p, win ? `Đoán đúng! +${RULES.hiloStake} Jack` : `Đoán sai! -${before - p.jack} Jack`, win ? 'good' : 'warn');
    p.mg = null; // ván bài kết thúc ngay; client tự đóng khung sau khi lật bài
  }

  mgDone(p, token, rawScore) {
    const g = p.mg;
    if (!g || g.token !== String(token)) return;
    p.mg = null;
    let score = Number.isFinite(rawScore) ? clamp(rawScore, 0, 1) : 0;
    if (this.clock - g.t0 < g.min) score = 0; // gửi quá nhanh: coi như làm ẩu
    if (p.jail > 0) return;
    const s = STATION_BY_ID.get(g.sid);
    if (!s) return;
    // cắt hàng rào: phải còn đủ dụng cụ lúc hoàn thành (không dùng availability() vì sức đã bị trừ lúc bắt đầu).
    // Đào hầm không cần kiểm lại giờ: minigame bị huỷ mỗi khi đổi giờ sinh hoạt (updatePhase).
    if (s.kind === 'fence' && !FENCE_ITEMS.every((k) => p.items[k])) return;
    this.settle(p, s, score);
  }

  settle(p, s, score) {
    const tier = score >= 0.99 ? 1.5 : score >= 0.6 ? 1 : score > 0 ? 0.5 : 0;
    if (s.kind === 'fence') {
      if (score >= 0.9) { // phải cắt liên tiếp RULES.fenceCuts sợi: mỗi sợi là một lượt ồn ào
        p.fenceCuts++;
        if (p.fenceCuts >= RULES.fenceCuts) { p.fenceCuts = 0; this.escape(p); }
        else { this.toast(p, `Cắt đứt sợi dây thép ${p.fenceCuts}/${RULES.fenceCuts}. Tiếp tục trước khi quản giáo tới!`, 'item'); this.noise(p.x, p.z, 20, 'bad'); }
      } else {
        p.fenceCuts = 0; // hỏng một lần là phải cắt lại từ đầu
        this.toast(p, 'Cắt hỏng! Dây thép bật lại, báo động vang khắp trại — làm lại từ sợi đầu tiên.', 'warn');
        this.noise(p.x, p.z, 42, 'bad');
        this.broadcast({ t: 'snd', k: 'alarm', x: r2(p.x), z: r2(p.z) });
      }
      return;
    }
    if (s.kind === 'dig') {
      if (score < 0.6) { // đào ẩu: đất sụt, mất công đào
        const lost = Math.min(this.dig.pr, RULES.digCaveIn);
        this.dig.pr -= lost;
        this.toast(p, lost > 0 ? `Đất sụt! Mất ${lost.toFixed(0)} giây công đào.` : 'Đào hụt, đất lở lấp mất chỗ vừa đào.', 'warn');
        this.noise(p.x, p.z, 24, 'bad');
        return;
      }
      const gain = RULES.digPerSession * score * (p.boost > 0 ? BOOST.dig : 1);
      if (gain <= 0) { this.toast(p, 'Đào hụt, chẳng được gì.', 'warn'); this.noise(p.x, p.z, 10, 'bad'); return; }
      this.dig.pr = Math.min(RULES.digTarget, this.dig.pr + gain);
      this.toast(p, `Đào được ${gain.toFixed(1)} giây công (${Math.round((this.dig.pr / RULES.digTarget) * 100)}%)`, 'good');
      if (this.dig.pr >= RULES.digTarget && !this.dig.open) {
        this.dig.open = true;
        this.sys('⛏️ Đường hầm đã thông! Ai đủ kìm, bản đồ, dây thừng và đèn pin có thể chui ra ngoài trước khi trời sáng.');
      }
      return;
    }
    if (s.kind === 'item') {
      if (score >= 0.8) {
        p.items[s.item] = true;
        this.broadcast({ t: 'snd', k: 'pickup', x: r2(p.x), z: r2(p.z) });
        this.toast(p, `Bạn đã lấy được: ${ITEM_NAMES[s.item]}. Đừng để quản giáo khám xét!`, 'item');
      } else {
        this.toast(p, 'Bẻ khoá thất bại! Tiếng động có thể làm quản giáo chú ý.', 'warn');
        this.noise(p.x, p.z, 14, 'bad');
      }
      return;
    }
    if (tier === 0) { this.toast(p, 'Làm hỏng hoàn toàn, không được gì!', 'warn'); return; }
    p.done[s.group] = (p.done[s.group] || 0) + 1;
    const pts = Math.max(1, Math.round(s.pts * tier));
    const jack = s.jack ? Math.max(1, Math.round(s.jack * tier)) : 0;
    p.jack += jack;
    let extra = jack ? ` · +${jack} Jack` : '';
    if (s.kind === 'work' || s.kind === 'chore') {
      if (score >= 0.6) { p.labor++; extra += ` · ca lao động #${p.labor}`; }
      else extra += ' · ca làm ẩu, không tính';
    }
    this.addPoints(p, pts, tier === 1.5 ? `${s.label} xuất sắc` : s.label.toLowerCase(), extra);
  }

  // ---------- Chợ đen ----------
  // premium: trả thêm 30% "phí uy tín" để Tày Scam bớt lừa (25% thay vì 50%)
  buy(p, id, premium = false) {
    const it0 = SHOP_BY_ID.get(String(id));
    if (!it0 || p.jail > 0 || p.stun > 0) return;
    const it = premium ? { ...it0, price: Math.ceil(it0.price * RULES.premiumMul) } : it0;
    if (Math.hypot(p.x - SHOP_STATION.x, p.z - SHOP_STATION.z) > SHOP_STATION.r + 1) { this.toast(p, 'Bạn đứng quá xa Tày Scam.', 'warn'); return; }
    if (p.jack < it.price) { this.toast(p, `Không đủ Jack (cần ${it.price}).`, 'warn'); return; }
    if (it.id === 'bomb' && p.bombBuys >= RULES.bombBuyPerDay) { this.toast(p, `Mỗi ngày chỉ mua được ${RULES.bombBuyPerDay} lần thuốc nổ.`, 'warn'); return; }
    if ((it.id === 'rope' || it.id === 'torch') && p.items[it.id]) { this.toast(p, 'Bạn đã có món này rồi.', 'warn'); return; }
    p.jack -= it.price;
    if (it.id === 'bomb') p.bombBuys++;
    if (Math.random() < (premium ? RULES.premiumScam : RULES.scamChance)) {
      this.say(DEALER.id, pick(NPC_LINES.dealerScam), 0, true);
      this.send(p, { t: 'snd', k: 'scam', x: r2(p.x), z: r2(p.z), self: 1 });
      this.toast(p, `Bị Tày Scam lừa! Mất ${it.price} Jack mà không nhận được ${it.name}.`, 'warn');
      return;
    }
    if (it.id === 'reddog') p.stock.reddog++;
    else if (it.id === 'bomb') p.stock.bomb++;
    else p.items[it.id] = true;
    this.say(DEALER.id, pick(NPC_LINES.dealerOk), 0, true);
    this.send(p, { t: 'snd', k: 'coin', x: r2(p.x), z: r2(p.z), self: 1 });
    this.toast(p, `Đã mua: ${it.name} (-${it.price} Jack).`, 'item');
  }

  drink(p) {
    if (p.jail > 0 || p.stun > 0 || p.stock.reddog <= 0) return;
    p.stock.reddog--;
    p.en = Math.min(ENERGY.max, p.en + ENERGY.drinkGain);
    p.boost = BOOST.secs;
    this.broadcast({ t: 'snd', k: 'drink', x: r2(p.x), z: r2(p.z) });
    this.toast(p, `Reddog! Chạy và đào nhanh hơn trong ${BOOST.secs} giây.`, 'good');
  }

  // Hướng ném do người chơi ngắm (góc a, cùng quy ước với ry: sin(a)=x, cos(a)=z); không có góc thì ném theo hướng đang quay mặt
  aimAngle(p, a) {
    const ang = Number.isFinite(a) ? a : p.ry;
    p.ry = ang;
    return ang;
  }

  throwBomb(p, a) {
    if (p.jail > 0 || p.stun > 0 || p.mg || p.stock.bomb <= 0) return;
    if (zoneAt(p.x, p.z) === 'cell') { this.toast(p, 'Không ném bom trong khu buồng giam — cả buồng sẽ bị liên lụy!', 'warn'); return; }
    const ang = this.aimAngle(p, a);
    p.stock.bomb--;
    p.bombHeat = RULES.bombHeatSecs;
    this.anim(p.id, 'throw');
    let d = 0;
    while (d < RULES.bombRange && !blocked(p.x + Math.sin(ang) * (d + 0.5), p.z + Math.cos(ang) * (d + 0.5), 0.3, p.labor)) d += 0.5;
    const b = { id: this.bombSeq++, x: p.x + Math.sin(ang) * d, z: p.z + Math.cos(ang) * d, t: RULES.bombFuse, owner: p.id };
    this.bombs.push(b);
    this.broadcast({ t: 'bomb', id: b.id, x: r2(b.x), z: r2(b.z), fuse: RULES.bombFuse, ox: r2(p.x), oz: r2(p.z) });
    this.noise(p.x, p.z, 8, 'fuse');
  }

  // Ném đá đánh lạc hướng: tạo tiếng động ở chỗ đá rơi
  throwRock(p, a) {
    if (p.jail > 0 || p.stun > 0 || p.mg || p.rockCd > 0) return;
    const ang = this.aimAngle(p, a);
    p.rockCd = RULES.rockCooldown;
    this.anim(p.id, 'throw');
    let d = 0;
    while (d < RULES.rockRange && !blocked(p.x + Math.sin(ang) * (d + 0.5), p.z + Math.cos(ang) * (d + 0.5), 0.2, p.labor)) d += 0.5;
    const x = p.x + Math.sin(ang) * d, z = p.z + Math.cos(ang) * d;
    this.broadcast({ t: 'rockfly', ox: r2(p.x), oz: r2(p.z), x: r2(x), z: r2(z) });
    this.noise(x, z, RULES.rockNoise, 'rock');
  }

  // Tặng Jack cho người chơi đứng gần
  give(p) {
    if (p.jail > 0 || p.stun > 0 || p.jack < RULES.giveJack) return;
    let best = null, bd = 2.5;
    for (const q of this.players.values()) {
      if (q === p || q.jail > 0) continue;
      const d = Math.hypot(q.x - p.x, q.z - p.z);
      if (d < bd) { bd = d; best = q; }
    }
    if (!best) { this.toast(p, 'Không có ai đứng đủ gần để tặng.', 'info'); return; }
    p.jack -= RULES.giveJack; best.jack += RULES.giveJack;
    this.toast(p, `Đã tặng ${best.name} ${RULES.giveJack} Jack.`, 'info');
    this.toast(best, `${p.name} tặng bạn ${RULES.giveJack} Jack.`, 'good');
  }

  updateBombs(dt) {
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i];
      b.t -= dt;
      if (b.t > 0) continue;
      this.bombs.splice(i, 1);
      this.broadcast({ t: 'boom', id: b.id, x: r2(b.x), z: r2(b.z) });
      this.noise(b.x, b.z, 48, 'boom');
      const owner = this.players.get(b.owner);
      for (const q of this.players.values()) {
        if (q.jail > 0) continue;
        const d = Math.hypot(q.x - b.x, q.z - b.z);
        if (d > RULES.bombRadius) continue;
        const dmg = Math.round(RULES.bombDamage * (1 - 0.6 * (d / RULES.bombRadius)));
        this.toast(q, `Trúng bom! -${dmg} máu.`, 'warn');
        this.hurt(q, dmg, owner && owner.id !== q.id ? `bị ${owner.name} ném bom` : 'tự nổ');
      }
    }
  }

  // ---------- Quản giáo phát hiện / khám xét ----------
  updateDetection(dt) {
    const night = this.phase === NIGHT_PHASE;
    const baseRange = (night ? RULES.guardRangeNight : RULES.guardRange) * (this.event === 'blackout' ? RULES.blackoutRange : 1);
    for (const p of this.players.values()) {
      if (p.jail > 0) { p.detect = 0; p.chased = false; continue; }
      const watched = p.warn >= RULES.warnWatch; // bị quản giáo để mắt: nhìn xa hơn, phát hiện nhanh hơn
      const range = baseRange * (watched ? RULES.watchRangeMul : 1);
      const zone = zoneAt(p.x, p.z);
      const mgStation = p.mg ? STATION_BY_ID.get(p.mg.sid) : null;
      let violation = null;
      if (zone === 'office') violation = 'xâm nhập phòng quản giáo';
      else if (mgStation && mgStation.kind === 'dig') violation = 'đào hầm trái phép';
      else if (mgStation && mgStation.kind === 'fence') violation = 'cắt hàng rào';
      else if (mgStation && mgStation.kind === 'item') violation = 'trộm đồ trong kho';
      else if (p.bombHeat > 0) violation = 'ném bom';
      else if (night && zone !== 'cell') violation = 'ra ngoài sau giờ tắt đèn'; // ban đêm rời buồng giam là vi phạm: bị thấy thì bị rượt và đưa vào biệt giam
      let seen = false, touch = null, seenBy = null;
      for (const g of this.guards) {
        const dx = p.x - g.x, dz = p.z - g.z;
        const d = Math.hypot(dx, dz);
        if (d > range) continue;
        const inCone = d <= RULES.guardCloseRange || Math.abs(angDiff(Math.atan2(dx, dz), g.ry)) <= RULES.guardFov / 2;
        if (!inCone) continue;
        if (!lineOfSight(g.x, g.z, p.x, p.z)) continue;
        seen = true;
        if (!seenBy || d < Math.hypot(p.x - seenBy.x, p.z - seenBy.z)) seenBy = g;
        if (d <= RULES.guardCloseRange && !touch) touch = g;
      }
      if (p.chased) { p.detect = 1; continue; } // đang bị quản giáo rượt: chạy đi!
      if (violation && seen) p.detect = Math.min(1, p.detect + (dt / RULES.detectSeconds) * (p.sneak ? RULES.sneakDetect : 1) * (watched ? RULES.watchDetectMul : 1));
      else p.detect = Math.max(0, p.detect - dt * 0.8);
      if (p.detect >= 1 && seenBy) { // bị phát hiện: quản giáo gần nhất lao tới bắt
        seenBy.chase = { pid: p.id, why: violation || 'vi phạm nội quy', t: 0, lost: 0 };
        seenBy.alert = null; seenBy.returning = false;
        p.chased = true;
        this.say(seenBy.id, 'Đứng lại!! Đừng có chạy!', 1);
        this.broadcast({ t: 'snd', k: 'whistle', x: r2(seenBy.x), z: r2(seenBy.z) });
        continue;
      }
      if (touch && p.touchCd <= 0) { p.touchCd = RULES.touchCooldown; this.guardTouch(p, touch); }
    }
  }

  // Đến quá gần quản giáo: có xác suất bị đánh hoặc lục soát.
  guardTouch(p, g) {
    const contra = CONTRA.some((k) => p.items[k]) || p.stock.bomb > 0;
    // Trạm mà người chơi đang thực sự làm (minigame hoặc giữ E), không phụ thuộc vào việc trạm còn "khả dụng" sau khi trừ sức
    const sid = p.mg ? p.mg.sid : p.hold ? p.hold.sid : null;
    const ws = sid ? STATION_BY_ID.get(sid) : null;
    const okStation = (s) => s && s.phases && s.phases.includes(this.phase) && s.kind !== 'item' && s.kind !== 'dig' && s.kind !== 'fence' && this.phase !== NIGHT_PHASE;
    // đang làm đúng việc, đúng giờ (ban ngày): quản giáo không được đánh hay lục soát
    if (okStation(ws)) return;
    // đang đứng trong vùng một trạm hợp lệ của giờ này (đang đi tới chỗ làm việc/tập luyện): cũng không bị gây sự
    if (p.near && p.near.ok && okStation(p.near.s)) return;
    const r = Math.random();
    if (r < RULES.beatChance) {
      this.anim(g.id, 'swing');
      this.say(g.id, pick(NPC_LINES.guardBeat), 1);
      this.toast(p, `Quản giáo quật bạn một gậy! -${RULES.beatDamage} máu.`, 'warn');
      this.hurt(p, RULES.beatDamage, 'bị quản giáo đánh');
    } else if (r < RULES.beatChance + (contra ? RULES.searchChanceContra : RULES.searchChance)) {
      this.say(g.id, pick(NPC_LINES.guardSearch), 1);
      this.anim(g.id, 'search');
      this.anim(p.id, 'handsup');
      this.broadcast({ t: 'snd', k: 'whistle', x: r2(p.x), z: r2(p.z) });
      this.cancelMg(p);
      p.stun = Math.max(p.stun, 1.8);
      if (contra) {
        p.items = {}; p.stock.bomb = 0;
        p.pts = Math.max(0, p.pts - RULES.searchPenalty);
        this.toast(p, `Bị quản giáo khám xét! Mất hết đồ lậu và ${RULES.searchPenalty} điểm.`, 'warn');
      } else {
        this.toast(p, 'Quản giáo lục soát nhưng không tìm thấy gì. Biến đi!', 'info');
      }
    }
  }

  // ---------- NPC ----------
  field(tx, tz, ttl = 4) {
    const key = `${Math.floor(tx)},${Math.floor(tz)}`;
    const hit = this.fields.get(key);
    if (hit && this.clock - hit.t < ttl) return hit.f;
    if (this.fields.size > 40) for (const [k, v] of this.fields) if (this.clock - v.t > 4) this.fields.delete(k);
    const f = distField(tx, tz);
    this.fields.set(key, { f, t: this.clock });
    return f;
  }

  // Đi một bước về phía đích bằng đường đi trên lưới. Trả về false nếu không đi được nữa (đã tới/không có đường).
  walkGuard(g, tx, tz, step, ttl = 4) { return this.stepAlong(g, this.field(tx, tz, ttl), step); }

  stepAlong(g, f, step) {
    const nxt = nextStep(f, g.x, g.z);
    if (!nxt) return false;
    const dx = nxt[0] - g.x, dz = nxt[1] - g.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-6) return false;
    const k = Math.min(1, step / d);
    g.x += dx * k; g.z += dz * k;
    g.heading = Math.atan2(dx, dz);
    g.ry += angDiff(g.heading, g.ry) * Math.min(1, 0.25 + step * 4);
    return true;
  }

  chaseSpeed(g) { return g.lightChase ? LIGHTHOUSE.chaseSpeed : this.phase === NIGHT_PHASE ? RULES.chaseSpeed + 0.9 : RULES.chaseSpeed; }

  // Đèn pha hải đăng: ban đêm quét quanh trại. Ai ngoài buồng giam bị chiếu trúng sẽ bị quản giáo gần nhất rượt ngay.
  updateLights(dt) {
    if (this.phase !== NIGHT_PHASE || this.event === 'blackout') return;
    for (const p of this.players.values()) {
      if (p.jail > 0 || p.chased) continue;
      const zone = zoneAt(p.x, p.z);
      if (zone === 'cell' || zone === 'solitary') continue;
      let lit = false;
      for (const l of LIGHTS) { // chỉ bị chiếu khi đứng trong vòng sáng tròn của một đèn
        const s = spotAt(l, this.clock);
        if (Math.hypot(p.x - s.x, p.z - s.z) <= LIGHTHOUSE.radius) { lit = true; break; }
      }
      if (!lit) continue;
      let best = null, bd = Infinity;
      for (const g of this.guards) { if (g.chase) continue; const d = Math.hypot(g.x - p.x, g.z - p.z); if (d < bd) { bd = d; best = g; } }
      if (!best) continue;
      best.chase = { pid: p.id, why: 'bị đèn pha hải đăng chiếu thấy', t: 0, lost: 0 };
      best.lightChase = true; best.alert = null; best.returning = false;
      p.chased = true; p.detect = 1;
      this.toast(p, '🔦 Đèn pha hải đăng chiếu trúng bạn! Quản giáo đang lao tới!', 'warn');
      this.say(best.id, 'Đèn pha thấy rồi! Bắt lấy nó!!', 1);
      this.broadcast({ t: 'snd', k: 'whistle', x: r2(best.x), z: r2(best.z) });
    }
  }

  updateGuard(g, dt, night) {
    if (!g.chase) g.lightChase = false;
    if (g.shoutCd > 0) g.shoutCd -= dt;
    if (g.chase) { // rượt bắt người chơi
      const c = g.chase, p = this.players.get(c.pid);
      if (!p || p.jail > 0) { if (p) p.chased = false; g.chase = null; g.returning = true; return; }
      c.t += dt;
      const d = Math.hypot(p.x - g.x, p.z - g.z);
      const sees = d <= 14 && lineOfSight(g.x, g.z, p.x, p.z);
      c.lost = sees ? 0 : c.lost + dt;
      if (d <= RULES.catchDist && sees) { g.chase = null; g.returning = true; this.catchPlayer(p, c.why, g); return; }
      if (c.lost > RULES.chaseGiveUp || c.t > 25) { // chạy thoát: quản giáo bỏ cuộc, tới chỗ thấy cuối cùng
        p.chased = false; p.detect = 0.3;
        g.alert = { x: p.x, z: p.z, t: 0, wait: GUARD.alertWait };
        g.chase = null;
        this.toast(p, 'Bạn đã cắt đuôi được quản giáo!', 'good');
        return;
      }
      if (sees && d < 3) { // gần rồi thì lao thẳng
        const dx = p.x - g.x, dz = p.z - g.z, k = Math.min(1, (this.chaseSpeed(g) * dt) / d);
        g.x += dx * k; g.z += dz * k; g.heading = Math.atan2(dx, dz);
        g.ry += angDiff(g.heading, g.ry) * Math.min(1, dt * 14);
      } else if (this.walkGuard(g, p.x, p.z, this.chaseSpeed(g) * dt, 0.3)) g.ry += angDiff(g.heading, g.ry) * Math.min(1, dt * 14);
      return;
    }
    if (g.alert) { // chạy tới nơi có tiếng động
      const a = g.alert;
      a.t += dt;
      const d = Math.hypot(a.x - g.x, a.z - g.z);
      const moved = d > 1.3 && a.t < GUARD.alertMax && this.walkGuard(g, a.x, a.z, (night ? GUARD.alertNight : GUARD.alert) * dt);
      if (!moved) {
        a.wait -= dt;
        g.ry = g.heading + Math.sin(this.clock * 3) * 1.1;
        if (a.wait <= 0 || a.t >= GUARD.alertMax) { g.alert = null; g.returning = true; }
      }
      return;
    }
    if (g.returning) { // quay về tuyến tuần tra
      const [tx, tz] = g.route[g.wp];
      if (Math.hypot(tx - g.x, tz - g.z) > 0.8 && this.walkGuard(g, tx, tz, (night ? GUARD.backNight : GUARD.back) * dt)) return;
      g.returning = false;
    }
    if (g.wait > 0) {
      g.wait -= dt;
      g.ry = g.heading + Math.sin(this.clock * 2 + g.wp) * 0.8;
      return;
    }
    const [tx, tz] = g.route[g.wp];
    const dx = tx - g.x, dz = tz - g.z;
    const d = Math.hypot(dx, dz);
    const step = (night ? GUARD.patrolNight : GUARD.patrol) * dt;
    if (d <= step) {
      g.x = tx; g.z = tz;
      g.wp = (g.wp + 1) % g.route.length;
      if (Math.random() < 0.5) g.wait = rnd(0.8, 2.8);
    } else {
      g.x += (dx / d) * step; g.z += (dz / d) * step;
      g.heading = Math.atan2(dx, dz);
      g.ry += angDiff(g.heading, g.ry) * Math.min(1, dt * 8);
    }
  }

  // Mèo cathehe: đi dạo giữa các điểm quen thuộc, thỉnh thoảng ngồi nghỉ (wait > 0)
  updateCat(c, dt) {
    if (c.wait > 0) {
      c.wait -= dt;
      if (c.wait <= 0) {
        let i = c.spot;
        while (i === c.spot) i = Math.floor(Math.random() * CAT_SPOTS.length);
        c.spot = i;
      }
      return;
    }
    const [tx, tz] = CAT_SPOTS[c.spot < 0 ? 0 : c.spot];
    if (Math.hypot(tx - c.x, tz - c.z) < 0.9 || !this.walkGuard(c, tx, tz, 1.7 * dt, 30)) { c.wait = rnd(4, 11); return; }
  }

  // Tù nhân NPC: theo lịch, đi tới trạm của giờ sinh hoạt hiện tại rồi làm việc (hoạt động hiện ở cờ snapshot)
  npcGoto(n) {
    const ph = this.phase;
    let st = null, x, z;
    if (ph === 0 || ph === NIGHT_PHASE) {
      if (ph === NIGHT_PHASE && n.idx < NPC_BEDS.length) { st = NPC_BEDS[n.idx]; x = st.x; z = st.z; }
      else { const sp = CELL_SPAWNS[(n.idx * 3 + 1) % CELL_SPAWNS.length]; x = sp[0]; z = sp[1]; }
      n.stay = Infinity;
    } else {
      const list = NPC_PLACES[ph];
      st = list[Math.floor(Math.random() * list.length)];
      x = st.x; z = st.z;
      n.stay = rnd(20, 45);
    }
    n.tgt = { x, z, st, stopR: st ? 0.8 + Math.random() * 1.2 : 0.6, f: staticField(x, z) };
  }

  updateInmate(n, dt) {
    if (n.phaseSeen !== this.phase) { n.phaseSeen = this.phase; n.tgt = null; n.act = 0; n.delay = rnd(0, 8); } // mỗi người xuất phát lệch nhau vài giây
    if (n.delay > 0) { n.delay -= dt; return; }
    if (!n.tgt) this.npcGoto(n);
    const t = n.tgt;
    const night = this.phase === NIGHT_PHASE;
    if (Math.hypot(t.x - n.x, t.z - n.z) > t.stopR && this.stepAlong(n, t.f, (night ? NPC_SPEED + 0.8 : NPC_SPEED) * dt)) { n.act = 0; return; }
    // đã tới nơi: quay mặt về trạm và làm việc
    n.act = t.st ? (ACT_CODE[t.st.kind] || 0) : 0;
    const face = t.st ? Math.atan2(t.st.x - n.x, t.st.z - n.z) : n.ry;
    n.ry += angDiff(t.st && t.st.kind === 'sleep' ? 0 : face, n.ry) * Math.min(1, dt * 6);
    n.stay -= dt;
    if (n.stay <= 0) n.tgt = null;
  }

  updateNpcs(dt) {
    const night = this.phase === NIGHT_PHASE;
    for (const n of this.npcs) {
      if (n.kind === 'guard') this.updateGuard(n, dt, night);
      else if (n.kind === 'cat') this.updateCat(n, dt);
      else if (n.kind === 'inmate') this.updateInmate(n, dt);
      else n.ry = n.base + Math.sin(this.clock * 0.6 + n.x) * 0.5;
      n.sayT -= dt;
      if (n.sayT <= 0) {
        n.sayT = rnd(30, 70); // thưa hơn nhiều (trước 9-24 giây); lời thoại tự nhiên cũng không quát, chỉ phản ứng mới quát
        if (n.kind === 'cat') { n.sayT = rnd(40, 80); this.say(n.id, pick(NPC_LINES.cat)); continue; }
        if (n.kind === 'guard') {
          if (n.alert) continue;
          this.say(n.id, pick(night && Math.random() < 0.7 ? NPC_LINES.guardNight : NPC_LINES.guard), 0);
        } else if (n.kind === 'dealer') { n.sayT = rnd(30, 60); this.say(n.id, pick(NPC_LINES.dealer)); }
        else this.say(n.id, pick(NPC_LINES.inmate));
      }
    }
  }

  // ---------- Mục tiêu gợi ý (mũi tên chỉ đường) ----------
  goalFor(p) {
    if (p.jail > 0) return null;
    const ph = this.phase;
    if (ph === 0) return zoneAt(p.x, p.z) === 'cell' ? null : { x: -27, z: -19.5, label: 'Về buồng giam' };
    if (p.pts >= RULES.releasePoints && ph !== NIGHT_PHASE) { const ex = STATION_BY_ID.get('exit'); return { x: ex.x, z: ex.z, label: 'Ra Cổng trại để mãn hạn' }; }
    if (ph === 5) return { free: true, label: 'Làm mọi thứ bạn muốn' }; // giờ sinh hoạt tự do: không gợi ý trạm nào, không có mũi tên
    let best = null, bd = Infinity;
    for (const s of STATIONS) {
      if (s.kind === 'shop' || s.kind === 'dig' || s.kind === 'item' || s.kind === 'fence') continue;
      if (s.kind === 'sleep' && !(ph === NIGHT_PHASE || p.en < 50)) continue;
      if (!s.phases || !s.phases.includes(ph)) continue;
      if (!this.availability(p, s).ok) continue;
      const d = Math.hypot(p.x - s.x, p.z - s.z);
      if (d < bd) { bd = d; best = s; }
    }
    if (best) return { x: best.x, z: best.z, label: best.label };
    return null;
  }

  // ---------- Đồng bộ ----------
  // Giảm băng thông: người/NPC trong NEAR_R mét gửi đủ 15 lần/giây, ở xa chỉ gửi mỗi FAR_EVERY lần;
  // thông tin ít đổi (kho đồ, mục tiêu, chợ...) chỉ gửi lại khi thay đổi (me2).
  sendSnapshots() {
    const n = ++this.snapN;
    const farTurn = n % SNAP_FAR_EVERY === 0;
    const allP = [];
    for (const p of this.players.values()) {
      const st = p.mg ? STATION_BY_ID.get(p.mg.sid) : p.hold ? STATION_BY_ID.get(p.hold.sid) : null;
      const code = p.mg ? (st ? ACT_CODE[st.kind] || 0 : 9) : p.hold ? (st ? ACT_CODE[st.kind] || 0 : 4) : 0;
      allP.push([p.id, Q(p.x), Q(p.z), QA(p.ry), (p.jail > 0 ? 1 : 0) | ((p.hold || p.mg) ? 2 : 0) | (p.stun > 0 ? 4 : 0) | (p.boost > 0 ? 8 : 0) | (code << 4)]);
    }
    // cờ NPC: mèo 2 = đang ngồi; quản giáo 1 = báo động/rượt; tù nhân = (2 nếu đang làm việc) | (mã hoạt động << 4), giống cờ người chơi
    const allN = this.npcs.map((nn) => [nn.id, Q(nn.x), Q(nn.z), QA(nn.ry), nn.kind === 'cat' ? (nn.wait > 0 ? 2 : 0) : nn.kind === 'inmate' ? (nn.act ? 2 | (nn.act << 4) : 0) : nn.alert || nn.chase ? 1 : 0]);
    const base = {
      t: 's', lc: r2(this.clock), ph: this.phase, pt: Math.ceil(this.phaseT), day: this.day, ev: this.event,
      dig: [Math.round((this.dig.pr / RULES.digTarget) * 100), this.dig.open ? 1 : 0],
    };
    for (const p of this.players.values()) {
      if (p.ws && p.ws.bufferedAmount > SNAP_MAX_BUFFERED) continue; // kết nối chậm/nghẽn: bỏ gói này, gói sau thay thế được (tránh dồn bộ nhớ)
      const inRange = (e) => farTurn || (e[1] / 10 - p.x) ** 2 + (e[2] / 10 - p.z) ** 2 <= SNAP_NEAR_R * SNAP_NEAR_R;
      // Chỉ `goalFor` (tốn nhất) được cache và tính lại 4 lần/giây; mọi trường khác (lời nhắc trạm, đồ, Jack...) luôn mới nhất.
      if (!p.goalCache || n % 4 === 0) p.goalCache = this.goalFor(p);
      const near = p.near ? { id: p.near.s.id, label: p.near.label, ok: p.near.ok, why: p.near.why || '' } : null;
      const slow = {
        items: p.items, near, jk: p.jailKind, jack: p.jack, labor: p.labor,
        boost: Math.ceil(Math.max(0, p.boost)), rock: Math.ceil(Math.max(0, p.rockCd)),
        stock: p.stock, buys: p.bombBuys, goal: p.goalCache,
      };
      const key = JSON.stringify(slow);
      const out = {
        ...base,
        p: allP.filter((e) => e[0] === p.id || inRange(e)),
        n: allN.filter(inRange),
        me: {
          pts: p.pts, jail: Math.ceil(p.jail), det: r2(p.detect),
          hold: p.hold && p.hold.need ? r2(p.hold.t / p.hold.need) : (p.hold ? -1 : 0),
          seq: p.inSeq, ia: Math.round((p.tl || 0) * 1000), x: r2(p.x), z: r2(p.z), // ia: số ms lệnh seq đã được áp dụng
          hp: Math.round(p.hp), en: Math.round(p.en), chased: p.chased ? 1 : 0, stun: p.stun > 0 ? 1 : 0,
          warn: p.warn, fc: p.fenceCuts,
        },
      };
      if (key !== p.lastSlow || n % 75 === 0) { out.me2 = slow; p.lastSlow = key; }
      this.send(p, out);
    }
  }

  sendLeaderboard() {
    const list = [...this.players.values()]
      .map((p) => ({ name: p.name, num: p.num, pts: p.pts, rel: p.rel, esc: p.esc, score: p.pts + p.rel * RULES.releasePoints + p.esc * ESCAPE_SCORE }))
      .sort((a, b) => b.score - a.score).slice(0, 8);
    this.broadcast({ t: 'lb', list, online: this.players.size });
  }
}

export { blocked, PLAYER_RADIUS };
