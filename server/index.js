// Máy chủ HTTP (phục vụ file tĩnh) + WebSocket (trò chơi realtime).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Room } from './game.js';
import { cleanName } from './util.js';
import { RULES } from '../shared/map.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 3000;
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const MAX_CONN_PER_IP = Number(process.env.MAX_CONN_PER_IP) || 6;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};
const ROUTES = [
  ['/vendor/three/', path.join(ROOT, 'node_modules/three/build'), 'public, max-age=86400'],
  ['/vendor/three-addons/', path.join(ROOT, 'node_modules/three/examples/jsm'), 'public, max-age=86400'], // EffectComposer, UnrealBloomPass...
  ['/shared/', path.join(ROOT, 'shared'), 'no-cache'],
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
  if (pathname === '/') pathname = '/index.html';
  for (const [prefix, dir, cache] of ROUTES) {
    if (!pathname.startsWith(prefix)) continue;
    const file = path.resolve(dir, pathname.slice(prefix.length));
    if (!file.startsWith(dir + path.sep) && file !== dir) break;
    return fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': cache });
      res.end(data);
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

// ---------- Phòng ----------
const rooms = [];
let roomSeq = 1;
function findRoom() {
  for (const r of rooms) if (r.size < RULES.maxPlayersPerRoom) return r;
  const r = new Room(roomSeq++);
  rooms.push(r);
  return r;
}
rooms.push(new Room(roomSeq++));

let last = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  for (let i = rooms.length - 1; i >= 0; i--) {
    const r = rooms[i];
    if (i > 0 && r.size === 0 && r.emptySince && now - r.emptySince > 60000) { rooms.splice(i, 1); continue; }
    if (r.size > 0 || i === 0) {
      try { r.tick(dt); } catch (e) { console.error(`[tick] phòng ${r.id}:`, e); } // lỗi một phòng không kéo sập phòng khác
    }
  }
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

  let room = null, player = null;
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
    if (msg.t === 'join' && !player) {
      // vào lại sau khi mất kết nối
      const sid = typeof msg.sid === 'string' ? msg.sid.slice(0, 40) : '';
      if (sid) {
        for (const r of rooms) {
          for (const p of r.players.values()) if (p.disc && p.sid === sid) { room = r; player = p; }
        }
        if (player) room.reattach(player, ws);
      }
      if (!player) {
        room = findRoom();
        player = room.addPlayer(ws, cleanName(msg.name));
      }
    } else if (!player) return;
    else if (msg.t === 'in') room.setInput(player, msg);
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
    if (room && player && player.ws === ws) room.disconnect(player); // giữ chỗ để vào lại
  });
  ws.on('error', () => {});
});

// Ghi log băng thông mỗi phút (để biết gói miễn phí có đủ không)
setInterval(() => {
  for (const r of rooms) {
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
