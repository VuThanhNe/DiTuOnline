// Kiểm thử sảnh + hàng chờ: xếp hàng khi đầy, vào tự động khi có chỗ, không chen ngang, AFK nhường chỗ, rớt mạng.
import { Lobby } from './lobby.js';

let bad = 0;
const ok = (c, m) => { if (!c) { bad++; console.log('✗', m); } else console.log('✓', m); };

const mkWs = () => { const w = { readyState: 1, log: [], closed: null, send(s) { w.log.push(JSON.parse(s)); }, close(code, why) { w.closed = [code, why]; w.readyState = 3; } }; return w; };
const lastQ = (w) => [...w.log].reverse().find((m) => m.t === 'queue');
let fakeNow = 1_000_000;
const mk = (opts = {}) => new Lobby({ maxRooms: 1, maxPerRoom: 3, maxQueue: 3, afkSecs: 60, queueHoldSecs: 20, now: () => fakeNow, ...opts });
const run = (lb, secs) => { for (let i = 0; i < secs * 30; i++) lb.tick(1 / 30); };

// --- xếp hàng khi đầy ---
{
  const lb = mk();
  const slots = [];
  const ws = [mkWs(), mkWs(), mkWs(), mkWs(), mkWs()];
  const res = ws.map((w, i) => lb.join(w, `P${i}`, '', (room, p) => slots.push([i, p])));
  ok(res.slice(0, 3).every((r) => r.kind === 'room'), '3 người đầu vào thẳng phòng (sức chứa 3)');
  ok(res[3].kind === 'queued' && res[4].kind === 'queued', 'Người thứ 4 và 5 phải xếp hàng chờ');
  ok(lastQ(ws[3]).pos === 1 && lastQ(ws[4]).pos === 2 && lastQ(ws[4]).total === 2, 'Hàng chờ báo đúng vị trí (1 và 2, tổng 2)');
  ok(lb.status().online === 3 && lb.status().capacity === 3 && lb.status().queue === 2, 'Trạng thái: 3/3 online, 2 đang chờ');

  // có chỗ trống -> người đầu hàng được vào tự động, người sau dịch lên
  const first = res[0].room.players.values().next().value;
  res[0].room.removePlayer(first.id);
  run(lb, 1);
  ok(slots.length === 1 && slots[0][0] === 3, 'Có chỗ trống: người đầu hàng chờ được vào tự động');
  ok(ws[3].log.some((m) => m.t === 'welcome'), 'Người được vào nhận gói welcome');
  ok(lastQ(ws[4]).pos === 1 && lastQ(ws[4]).total === 1, 'Người đứng sau được dịch lên vị trí 1');
  ok(lb.status().online === 3 && lb.status().queue === 1, 'Sau khi vào: lại đủ 3/3, còn 1 người chờ');
}

// --- không chen ngang ---
{
  const lb = mk();
  const ws = [mkWs(), mkWs(), mkWs(), mkWs()];
  const res = ws.slice(0, 3).map((w, i) => lb.join(w, `P${i}`, '', () => {}));
  const waiting = lb.join(ws[3], 'W', '', () => {});
  ok(waiting.kind === 'queued', 'Phòng đầy: người thứ 4 vào hàng chờ');
  const p0 = res[0].room.players.values().next().value;
  res[0].room.removePlayer(p0.id); // trống 1 chỗ nhưng chưa kịp "bơm" hàng chờ
  const late = lb.join(mkWs(), 'Late', '', () => {});
  ok(late.kind === 'queued', 'Chỗ trống dành cho người đầu hàng: người đến sau không được chen ngang');
  ok(lb.queue[0].name === 'W' && lb.queue[1].name === 'Late', 'Thứ tự hàng chờ giữ nguyên (FIFO)');
}

// --- rời hàng / mất kết nối khi đang chờ ---
{
  const lb = mk();
  const w = Array.from({ length: 6 }, mkWs);
  for (let i = 0; i < 3; i++) lb.join(w[i], `P${i}`, '', () => {});
  const e1 = lb.join(w[3], 'A', '', () => {}).entry, e2 = lb.join(w[4], 'B', '', () => {}).entry;
  lb.join(w[5], 'C', '', () => {});
  lb.leave(e1);
  ok(lb.queue.length === 2 && lastQ(w[4]).pos === 1 && lastQ(w[5]).pos === 2, 'Một người rời hàng: những người sau dịch lên');
  w[4].readyState = 3; // B rớt kết nối khi đang chờ
  run(lb, 1);
  ok(lb.queue.length === 1 && lb.queue[0].name === 'C' && lastQ(w[5]).pos === 1, 'Kết nối đã đứt bị loại khỏi hàng chờ');
  void e2;
}

// --- hàng chờ đầy ---
{
  const lb = mk({ maxQueue: 2 });
  for (let i = 0; i < 3; i++) lb.join(mkWs(), `P${i}`, '', () => {});
  lb.join(mkWs(), 'A', '', () => {}); lb.join(mkWs(), 'B', '', () => {});
  const r = lb.join(mkWs(), 'C', '', () => {});
  ok(r.kind === 'full', 'Hàng chờ đầy thì từ chối (kind=full)');
}

// --- AFK nhường chỗ khi có người chờ ---
{
  const lb = mk();
  const ws = [mkWs(), mkWs(), mkWs(), mkWs()];
  const slots = [];
  const res = ws.slice(0, 3).map((w, i) => lb.join(w, `P${i}`, '', () => {}));
  const players = [...res[0].room.players.values()];
  players.forEach((p) => { p.activeAt = fakeNow; });
  run(lb, 5);
  ok(res[0].room.size === 3, 'Không có ai chờ: người đứng im không bị mời ra');
  lb.join(ws[3], 'W', '', (room, p) => slots.push(p));
  players[0].activeAt = fakeNow - 120_000; // người này đã đứng im 120 giây (> 60 giây)
  run(lb, 2);
  ok(ws[0].log.some((m) => m.t === 'kicked' && m.why === 'afk') && ws[0].closed, 'Có người chờ: người đứng im quá lâu bị mời ra (nhận kicked, kết nối đóng)');
  ok(slots.length === 1 && res[0].room.size === 3, 'Chỗ của người AFK được trao cho người đầu hàng chờ');
  ok(ws[1].closed === null && ws[2].closed === null, 'Những người đang chơi bình thường không bị ảnh hưởng');
}

// --- rớt mạng: giữ chỗ ngắn khi có hàng chờ ---
{
  const lb = mk();
  const ws = [mkWs(), mkWs(), mkWs(), mkWs()];
  const slots = [];
  const res = ws.slice(0, 3).map((w, i) => lb.join(w, `P${i}`, '', () => {}));
  const room = res[0].room;
  const p = res[1].player;
  [...room.players.values()].forEach((q) => { q.activeAt = fakeNow; });
  lb.join(ws[3], 'W', '', (r, np) => slots.push(np));
  room.disconnect(p);
  run(lb, 10);
  ok(slots.length === 0 && room.players.has(p.id), 'Mới rớt mạng 10 giây: vẫn giữ chỗ để vào lại');
  run(lb, 15);
  ok(slots.length === 1 && !room.players.has(p.id), 'Rớt mạng quá 20 giây khi có hàng chờ: nhường chỗ cho người chờ');
}

// --- vào lại bằng sid khi phòng đầy: không phải xếp hàng ---
{
  const lb = mk();
  const ws = [mkWs(), mkWs(), mkWs()];
  const res = ws.map((w, i) => lb.join(w, `P${i}`, '', () => {}));
  const p = res[1].player;
  res[1].room.disconnect(p);
  const back = lb.join(mkWs(), 'P1', p.sid, () => {});
  ok(back.kind === 'room' && back.player === p, 'Rớt mạng rồi vào lại bằng sid: về đúng nhân vật cũ, không phải xếp hàng dù phòng đầy');
}

// --- nhiều phòng ---
{
  const lb = mk({ maxRooms: 2 });
  const r = Array.from({ length: 6 }, (_, i) => lb.join(mkWs(), `P${i}`, '', () => {}));
  const r7 = lb.join(mkWs(), 'X', '', () => {});
  ok(r.every((x) => x.kind === 'room') && lb.rooms.length === 2 && lb.capacity === 6, 'MAX_ROOMS=2: có thêm phòng thứ hai, sức chứa 6');
  ok(r7.kind === 'queued', 'Đủ 2 phòng đầy thì mới xếp hàng');
}

console.log(bad ? `\n${bad} kiểm thử lỗi` : '\nTất cả kiểm thử hàng chờ đạt');
process.exit(bad ? 1 : 0);
