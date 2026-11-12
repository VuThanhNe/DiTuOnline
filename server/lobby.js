// Sảnh: quản lý các phòng chơi và HÀNG CHỜ khi phòng đầy.
// - Tổng sức chứa = maxRooms x maxPerRoom (mặc định 1 phòng x 30 người, phù hợp máy chủ miễn phí).
// - Hết chỗ thì người mới vào hàng chờ (FIFO); có chỗ trống là người đầu hàng được vào tự động.
// - Chỗ trống luôn dành cho người đầu hàng chờ (người mới đến sau không chen ngang).
// - Có người đang chờ thì: người mất kết nối chỉ được giữ chỗ ngắn hơn, và người đứng im quá lâu (AFK) bị mời ra nhường chỗ.
import { Room } from './game.js';
import { RULES } from '../shared/map.js';

export class Lobby {
  constructor({ maxRooms = 1, maxPerRoom = RULES.maxPlayersPerRoom, maxQueue = 100, afkSecs = 180, queueHoldSecs = 20, now = () => Date.now() } = {}) {
    this.maxRooms = Math.max(1, maxRooms);
    this.maxPerRoom = Math.max(1, maxPerRoom);
    this.maxQueue = maxQueue;
    this.afkMs = afkSecs * 1000;
    this.queueHoldSecs = queueHoldSecs;
    this.now = now;
    this.rooms = [];
    this.roomSeq = 1;
    this.queue = []; // { ws, name, since, onAdmit, lastPos, lastSent }
    this.rooms.push(new Room(this.roomSeq++));
    this.pumpAcc = 0;
  }

  get capacity() { return this.maxRooms * this.maxPerRoom; }
  get online() { let n = 0; for (const r of this.rooms) n += r.size; return n; }
  status() { return { online: this.online, capacity: this.capacity, queue: this.queue.length }; }

  findRoom() {
    for (const r of this.rooms) if (r.size < this.maxPerRoom) return r;
    if (this.rooms.length < this.maxRooms) { const r = new Room(this.roomSeq++); this.rooms.push(r); return r; }
    return null;
  }

  // Trả về { kind: 'room', room, player } | { kind: 'queued', entry } | { kind: 'full' }
  // onAdmit(room, player) được gọi khi người đang chờ được cho vào.
  join(ws, name, sid, onAdmit) {
    if (sid) { // vào lại sau khi mất kết nối: đúng nhân vật cũ, không phải xếp hàng
      for (const r of this.rooms) for (const p of r.players.values()) if (p.disc && p.sid === sid) { r.reattach(p, ws); return { kind: 'room', room: r, player: p }; }
    }
    if (this.queue.length === 0) {
      const r = this.findRoom();
      if (r) return { kind: 'room', room: r, player: r.addPlayer(ws, name) };
    }
    if (this.queue.length >= this.maxQueue) return { kind: 'full' };
    const entry = { ws, name, since: this.now(), onAdmit, lastPos: -1, lastSent: 0 };
    this.queue.push(entry);
    this.notifyQueue(true);
    return { kind: 'queued', entry };
  }

  leave(entry) {
    const i = this.queue.indexOf(entry);
    if (i >= 0) { this.queue.splice(i, 1); this.notifyQueue(true); }
  }

  sendQueueMsg(e, pos) {
    if (e.ws.readyState !== 1) return;
    e.ws.send(JSON.stringify({ t: 'queue', pos, total: this.queue.length, online: this.online, cap: this.capacity }));
    e.lastPos = pos; e.lastSent = this.now();
  }

  // Báo vị trí cho người đang chờ khi đổi vị trí (hoặc định kỳ 5 giây một lần để số người online cũng được cập nhật)
  notifyQueue(force = false) {
    const t = this.now();
    this.queue.forEach((e, i) => { if (force || e.lastPos !== i + 1 || t - e.lastSent > 5000) this.sendQueueMsg(e, i + 1); });
  }

  // Cho người đầu hàng vào khi có chỗ; bỏ những kết nối đã đứt
  pump() {
    this.queue = this.queue.filter((e) => e.ws.readyState === 1);
    while (this.queue.length) {
      const r = this.findRoom();
      if (!r) break;
      const e = this.queue.shift();
      const p = r.addPlayer(e.ws, e.name);
      e.onAdmit(r, p);
    }
    this.notifyQueue();
  }

  // Gọi mỗi nhịp của máy chủ (dt giây): chạy từng phòng, dọn phòng trống, nhường chỗ khi có hàng chờ
  tick(dt) {
    const t = this.now();
    const waiting = this.queue.length > 0;
    for (let i = this.rooms.length - 1; i >= 0; i--) {
      const r = this.rooms[i];
      r.holdSecs = waiting ? this.queueHoldSecs : RULES.reconnectSecs; // có người chờ: người rớt mạng chỉ được giữ chỗ ngắn
      if (i > 0 && r.size === 0 && r.emptySince && t - r.emptySince > 60000) { this.rooms.splice(i, 1); continue; }
      if (r.size > 0 || i === 0) {
        try { r.tick(dt); } catch (e) { console.error(`[tick] phòng ${r.id}:`, e); } // lỗi một phòng không kéo sập phòng khác
      }
      if (waiting) { // mời người đứng im quá lâu ra để nhường chỗ
        for (const p of [...r.players.values()]) if (!p.disc && t - (p.activeAt || t) > this.afkMs) r.kick(p, 'afk');
      }
    }
    this.pumpAcc += dt;
    if (this.pumpAcc >= 0.5) { this.pumpAcc = 0; this.pump(); }
  }
}
