// Máy chủ HTTP (phục vụ file tĩnh) + WebSocket (trò chơi realtime).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Lobby } from './lobby.js';
import { cleanName } from './util.js';
import { RULES } from '../shared/map.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 3000;
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const MAX_CONN_PER_IP = Number(process.env.MAX_CONN_PER_IP) || 6;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.mp3': 'audio/mpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};
const ROUTES = [
  ['/vendor/three/', path.join(ROOT, 'node_modules/three/build'), 'public, max-age=86400'],
  ['/vendor/three-addons/', path.join(ROOT, 'node_modules/three/examples/jsm'), 'public, max-age=86400'], // EffectComposer, UnrealBloomPass...
  ['/shared/', path.join(ROOT, 'shared'), 'no-cache'],
  ['/music/', path.join(ROOT, 'public/music'), 'public, max-age=604800'], // nhạc nền: cho trình duyệt giữ lại 7 ngày, khỏi tải lại
  ['/', path.join(ROOT, 'public'), 'no-cache'],
];

// Lưới an toàn: một lỗi bất ngờ không được làm sập mọi phòng đang chơi.
process.on('uncaughtException', (e) => console.error('[uncaughtException]', e));
process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e));

function handleHttp(req, res) {
  let url, pathname;
  try {
    url = new URL(req.url, 'http://x');
    pathname = decodeURIComponent(url.pathname);
  } catch { res.writeHead(400); return res.end('Bad request'); } // URL/mã phần trăm sai định dạng
  if (pathname.includes('\0')) { res.writeHead(400); return res.end('Bad request'); }
  if (pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }
  if (pathname === '/healthz') { res.writeHead(200); return res.end('ok'); }
  if (pathname === '/status') { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); return res.end(JSON.stringify(lobby.status())); } // số người online / sức chứa / hàng chờ
  if (pathname === '/') pathname = '/index.html';
  for (const [prefix, dir, cache] of ROUTES) {
    if (!pathname.startsWith(prefix)) continue;
    const file = path.resolve(dir, pathname.slice(prefix.length));
    if (!file.startsWith(dir + path.sep) && file !== dir) break;
    // Gửi theo luồng (không đọc cả file vào RAM) và hỗ trợ Range: cần cho file nhạc lớn, Safari/iOS bắt buộc có Range mới phát được audio
    return fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404); return res.end('Not found'); }
      const headers = { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': cache, 'Accept-Ranges': 'bytes' };
      let start = 0, end = st.size - 1, code = 200;
      const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
      if (m && (m[1] || m[2]) && st.size > 0) {
        if (m[1]) { start = Number(m[1]); if (m[2]) end = Math.min(end, Number(m[2])); }
        else start = Math.max(0, st.size - Number(m[2])); // dạng "bytes=-N": N byte cuối
        if (start > end || start >= st.size) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); return res.end(); }
        code = 206; headers['Content-Range'] = `bytes ${start}-${end}/${st.size}`;
      }
      headers['Content-Length'] = st.size ? end - start + 1 : 0;
      res.writeHead(code, headers);
      if (req.method === 'HEAD' || !st.size) return res.end();
      fs.createReadStream(file, { start, end }).on('error', () => res.destroy()).pipe(res);
    });
  }
  res.writeHead(404); res.end('Not found');
}

const server = http.createServer((req, res) => {
  try { handleHttp(req, res); } catch (e) {
    console.error('[http]', e);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  }
});

// ---------- Sảnh: phòng + hàng chờ ----------
// MAX_ROOMS x MAX_PLAYERS_PER_ROOM là tổng số người chơi cùng lúc; hết chỗ thì người mới xếp hàng chờ (tối đa MAX_QUEUE người).
// Mặc định 1 phòng x 30 người: vừa sức máy chủ miễn phí. AFK_SECS: có người chờ thì ai đứng im quá lâu sẽ bị mời ra.
const lobby = new Lobby({
  maxRooms: Number(process.env.MAX_ROOMS) || 1,
  maxPerRoom: Number(process.env.MAX_PLAYERS_PER_ROOM) || RULES.maxPlayersPerRoom,
  maxQueue: Number(process.env.MAX_QUEUE) || 100,
  afkSecs: Number(process.env.AFK_SECS) || 180,
});

let last = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  try { lobby.tick(dt); } catch (e) { console.error('[lobby]', e); }
}, 1000 / 30);
// ---------- WebSocket ----------
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 1024 });
const ipCount = new Map();

wss.on('connection', (ws, req) => {
  ws.on('error', () => {}); // đăng ký sớm: kết nối bị từ chối vẫn có thể phát lỗi (frame quá lớn/sai)
  // Proxy tin cậy thêm IP thật vào CUỐI danh sách; phần tử đầu do client tự điền nên có thể giả mạo.
  const fwd = TRUST_PROXY ? String(req.headers['x-forwarded-for'] || '').split(',').pop().trim() : '';
  const ip = fwd || req.socket.remoteAddress || '?';
  const n = (ipCount.get(ip) || 0) + 1;
  if (n > MAX_CONN_PER_IP) { ws.close(1008, 'Too many connections'); return; }
  ipCount.set(ip, n);

  let room = null, player = null, queued = null;
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  let msgCount = 0;
  const rl = setInterval(() => { msgCount = 0; }, 1000);

  ws.on('message', (raw) => {
    if (++msgCount > 80) { ws.close(1008, 'Rate limit'); return; }
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (!msg || typeof msg.t !== 'string') return;
    try { handleMsg(msg); } catch (e) { console.error('[msg]', msg.t, e); }
  });

  function handleMsg(msg) {
    if (msg.t === 'join' && !player && !queued) {
      // vào lại sau khi mất kết nối (theo sid), vào phòng nếu còn chỗ, hoặc xếp hàng chờ khi phòng đầy
      const sid = typeof msg.sid === 'string' ? msg.sid.slice(0, 40) : '';
      const res = lobby.join(ws, cleanName(msg.name), sid, (r, p) => { room = r; player = p; queued = null; });
      if (res.kind === 'room') { room = res.room; player = res.player; }
      else if (res.kind === 'queued') queued = res.entry;
      else { ws.send(JSON.stringify({ t: 'queuefull' })); ws.close(1013, 'Queue full'); }
      return;
    }
    if (!player) return;
    if (msg.t !== 'in') room.touch(player); // mọi thao tác ngoài gói input liên tục đều tính là đang chơi (chống bị coi là AFK)
    if (msg.t === 'in') room.setInput(player, msg);
    else if (msg.t === 'chat') room.chat(player, msg.m);
    else if (msg.t === 'mgdone') room.mgDone(player, msg.token, Number(msg.score));
    else if (msg.t === 'mgcancel') room.cancelMg(player, false);
    else if (msg.t === 'hilo') room.hilo(player, msg.token, msg.pick);
    else if (msg.t === 'buy') room.buy(player, msg.id, !!msg.premium);
    else if (msg.t === 'rock') room.throwRock(player, Number(msg.a));
    else if (msg.t === 'give') room.give(player);
    else if (msg.t === 'bomb') room.throwBomb(player, Number(msg.a));
    else if (msg.t === 'drink') room.drink(player);
    else if (msg.t === 'dev' && process.env.DEV === '1') room.dev(player, msg); // chỉ để thử nghiệm, tắt mặc định
  }

  ws.on('close', () => {
    clearInterval(rl);
    const left = (ipCount.get(ip) || 1) - 1;
    if (left > 0) ipCount.set(ip, left); else ipCount.delete(ip); // không để Map phình dần
    if (queued) lobby.leave(queued); // đang xếp hàng mà thoát thì nhường vị trí
    if (room && player && player.ws === ws) room.disconnect(player); // giữ chỗ để vào lại
  });
  ws.on('error', () => {});
});

// Ghi log băng thông mỗi phút (để biết gói miễn phí có đủ không)
setInterval(() => {
  const st = lobby.status();
  if (st.online > 0 || st.queue > 0) console.log(`[sảnh] ${st.online}/${st.capacity} người chơi, ${st.queue} người đang chờ`);
  for (const r of lobby.rooms) {
    if (r.size > 0) {
      const kbs = r.bytes / 1024 / 60 / r.size;
      console.log(`[băng thông] phòng ${r.id}: ${r.size} người, ${kbs.toFixed(1)} KB/s/người (~${(kbs * 3.6).toFixed(0)} MB/giờ/người)`);
    }
    r.bytes = 0;
  }
}, 60000);

setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 20000);

server.listen(PORT, () => console.log(`Đi Tù Online chạy tại http://localhost:${PORT}`));
