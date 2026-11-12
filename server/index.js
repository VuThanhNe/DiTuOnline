// Máy chủ HTTP (phục vụ file tĩnh) + WebSocket (trò chơi realtime).
import http from 'node:http';
import fs from 'node:fs';
import zlib from 'node:zlib';
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

// Bộ nhớ đệm bản nén: khoá theo file + kích thước + thời điểm sửa + kiểu nén (file đổi thì tự nén lại)
const COMPRESSIBLE = new Set(['.js', '.css', '.html', '.json', '.svg']);
const zcache = new Map();
function compressed(file, st, enc, cb) {
  const key = `${file}|${st.size}|${st.mtimeMs}|${enc}`;
  const hit = zcache.get(key);
  if (hit) return hit.then((b) => cb(null, b), cb);
  const p = new Promise((resolve, reject) => {
    fs.readFile(file, (err, data) => {
      if (err) return reject(err);
      const done = (e, out) => (e ? reject(e) : resolve(out));
      if (enc === 'br') zlib.brotliCompress(data, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: data.length } }, done);
      else zlib.gzip(data, { level: 6 }, done);
    });
  });
  p.catch(() => zcache.delete(key));
  zcache.set(key, p);
  if (zcache.size > 200) zcache.delete(zcache.keys().next().value);
  p.then((b) => cb(null, b), cb);
}

function handleHttp(req, res) {
  let url, pathname;
  try {
    url = new URL(req.url, 'http://x');
    pathname = decodeURIComponent(url.pathname);
  } catch { res.writeHead(400); return res.end('Bad request'); } // URL/mã phần trăm sai định dạng
  if (pathname.includes('\0')) { res.writeHead(400); return res.end('Bad request'); }
  if (pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }
  if (pathname === '/healthz') { res.writeHead(200); return res.end('ok'); }
  if (pathname === '/status') { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); return res.end(JSON.stringify({ ...lobby.status(), ...tickStats.last })); } // số người online / sức chứa / hàng chờ
  if (pathname === '/') pathname = '/index.html';
  for (const [prefix, dir, cache] of ROUTES) {
    if (!pathname.startsWith(prefix)) continue;
    const file = path.resolve(dir, pathname.slice(prefix.length));
    if (!file.startsWith(dir + path.sep) && file !== dir) break;
    // Gửi theo luồng (không đọc cả file vào RAM) và hỗ trợ Range: cần cho file nhạc lớn, Safari/iOS bắt buộc có Range mới phát được audio
    return fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404); return res.end('Not found'); }
      const ext = path.extname(file);
      const etag = `W/"${st.size.toString(36)}-${Math.round(st.mtimeMs).toString(36)}"`;
      const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': cache, 'Accept-Ranges': 'bytes', ETag: etag };
      if (req.headers['if-none-match'] === etag) { res.writeHead(304, { ETag: etag, 'Cache-Control': cache }); return res.end(); } // trình duyệt đã có bản mới nhất
      // File văn bản (js/css/html/json): gửi bản nén brotli/gzip, nén một lần rồi giữ trong bộ nhớ
      if (COMPRESSIBLE.has(ext) && !req.headers.range && st.size > 1024 && st.size < 4 * 1024 * 1024) {
        const ae = String(req.headers['accept-encoding'] || '');
        const enc = /\bbr\b/.test(ae) ? 'br' : /\bgzip\b/.test(ae) ? 'gzip' : null;
        headers.Vary = 'Accept-Encoding';
        if (enc) {
          return compressed(file, st, enc, (e2, buf) => {
            if (e2) { res.writeHead(500); return res.end(); }
            headers['Content-Encoding'] = enc; headers['Content-Length'] = buf.length; delete headers['Accept-Ranges'];
            res.writeHead(200, headers);
            res.end(req.method === 'HEAD' ? undefined : buf);
          });
        }
      }
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

// Vòng lặp 30 nhịp/giây. Nếu máy chủ bị khựng (CPU dùng chung), thời gian đã trôi được chạy bù bằng nhiều bước con ngắn
// (tối đa 0,25 giây mỗi lần) thay vì bị cắt bỏ: thời gian trong game không bị "mất" nên người chơi không bị kéo giật về.
const TICK_MS = 1000 / 30;
const tickStats = { n: 0, sum: 0, max: 0, lagSum: 0, lagMax: 0, last: { tickAvgMs: 0, tickMaxMs: 0, loopLagMs: 0, loopLagMaxMs: 0 } };
let last = Date.now();
// Vòng tự hiệu chỉnh (S1): thời điểm nhịp kế tính theo đồng hồ gốc, nên nhịp trễ thì nhịp sau đến sớm hơn bù lại, không trôi nhịp.
let nextAt = last + TICK_MS;
function loop() {
  const now = Date.now();
  const elapsed = now - last;
  last = now;
  nextAt += TICK_MS;
  if (nextAt < now - 250) nextAt = now + TICK_MS; // trễ quá nhiều (máy treo): đặt lại mốc thay vì chạy dồn liên tục
  setTimeout(loop, Math.max(1, nextAt - Date.now()));
  let dt = Math.min(0.25, elapsed / 1000);
  const t0 = process.hrtime.bigint();
  while (dt > 1e-6) {
    const step = Math.min(dt, 0.05);
    try { lobby.tick(step); } catch (e) { console.error('[lobby]', e); }
    dt -= step;
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6, lag = Math.max(0, elapsed - TICK_MS);
  tickStats.n++; tickStats.sum += ms; tickStats.lagSum += lag;
  if (ms > tickStats.max) tickStats.max = ms;
  if (lag > tickStats.lagMax) tickStats.lagMax = lag;
}
setTimeout(loop, TICK_MS);
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
    if (msg.t === 'ping') { if (Number.isFinite(msg.c)) ws.send(JSON.stringify({ t: 'pong', c: msg.c })); return; } // đo độ trễ; không tính là thao tác chơi
    if (!player) return;
    if (msg.t !== 'in') room.touch(player); // mọi thao tác ngoài gói input liên tục đều tính là đang chơi (chống bị coi là AFK)
    if (msg.t === 'in') room.setInput(player, msg);
    else if (msg.t === 'chat') room.chat(player, msg.m);
    else if (msg.t === 'mgdone') room.mgDone(player, msg.token, Number(msg.score));
    else if (msg.t === 'mgcancel') room.cancelMg(player, false);
    else if (msg.t === 'hilo') room.hilo(player, msg.token, msg.pick);
    else if (msg.t === 'betgo') room.betGo(player);
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
  if (tickStats.n) {
    tickStats.last = { tickAvgMs: +(tickStats.sum / tickStats.n).toFixed(2), tickMaxMs: +tickStats.max.toFixed(1), loopLagMs: +(tickStats.lagSum / tickStats.n).toFixed(1), loopLagMaxMs: +tickStats.lagMax.toFixed(0) };
    tickStats.n = 0; tickStats.sum = 0; tickStats.max = 0; tickStats.lagSum = 0; tickStats.lagMax = 0;
  }
  const st = lobby.status();
  if (st.online > 0) console.log(`[nhịp] xử lý TB ${tickStats.last.tickAvgMs} ms, lâu nhất ${tickStats.last.tickMaxMs} ms; trễ vòng lặp TB ${tickStats.last.loopLagMs} ms, lớn nhất ${tickStats.last.loopLagMaxMs} ms`);
  if (st.online > 0 || st.queue > 0) console.log(`[sảnh] ${st.online}/${st.capacity} người chơi, ${st.queue} người đang chờ`);
  for (const r of lobby.rooms) {
    if (r.size > 0) {
      const kbs = r.bytes / 1024 / 60 / r.size;
      console.log(`[băng thông] phòng ${r.id}: ${r.size} người, ${kbs.toFixed(1)} KB/s/người (~${(kbs * 3.6).toFixed(0)} MB/giờ/người)`);
    }
    r.bytes = 0;
    // số đo minigame trong phút qua (để cân độ khó): lượt, tỉ lệ hỏng, tỉ lệ hoàn hảo, thời gian TB, độ khó TB
    const parts = Object.entries(r.mgStats).filter(([, v]) => v.n > 0).map(([k, v]) => `${k}: ${v.n} lượt, hỏng ${Math.round((v.fail / v.n) * 100)}%, hoàn hảo ${Math.round((v.perfect / v.n) * 100)}%, ${(v.sumT / v.n).toFixed(1)}s, D${(v.sumD / v.n).toFixed(1)}`);
    if (parts.length) console.log(`[minigame] phòng ${r.id}: ${parts.join(' | ')}`);
    r.mgStats = {};
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

// Tắt máy êm: Render gửi SIGTERM mỗi lần deploy lại. Báo cho người chơi rồi đóng kết nối sạch sẽ.
let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('[tắt máy] đang đóng kết nối...');
  for (const r of lobby.rooms) r.sys('⚠️ Máy chủ đang khởi động lại để cập nhật. Vui lòng tải lại trang sau khoảng 1 phút (tiến trình của ván này sẽ mất).');
  setTimeout(() => { for (const ws of wss.clients) { try { ws.close(1012, 'Server restart'); } catch { /* bỏ qua */ } } server.close(); }, 800);
  setTimeout(() => process.exit(0), 2500).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
