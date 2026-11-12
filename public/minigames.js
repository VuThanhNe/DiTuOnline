// Các minigame: canh nhịp (timing), gõ đúng phím (keys), căn góc và lực ném (aim) và các trò kiểu Among Us:
// nối dây (wires), phân loại (sort), nhớ chuỗi (memory), ghép thẻ (pairs), dọn rác (clean), bấm liên tục (mash), giữ thăng bằng (balance), bóng bàn (pong).
// Kết quả là điểm 0..1 gửi lên server; server mới là nơi quyết định thưởng.
import { sfx } from './audio.js';

const W = 560, H = 280;
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (a, b) => a + Math.random() * (b - a);

let active = null;
export const minigameActive = () => !!active;

function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.roundRect(x, y, w, h, r);
}
function center(g, text, y, size = 22, color = '#fff') {
  g.fillStyle = color; g.font = `bold ${size}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, W / 2, y);
}

// ---------------- Canh nhịp ----------------
function timingGame(params, boosted) {
  const rounds = params.rounds || 3;
  const zoneW = params.zone * (boosted ? 1.3 : 1);
  const g = { t: 0, round: 0, pos: 0.5, c: rnd(0.25, 0.75), results: [], pause: 0, over: false, score: 0, flash: 0, ok: null, hint: 'Nhấn E / Space / chạm khi vạch chạy vào vùng xanh' };
  const newRound = () => { g.c = rnd(0.2, 0.8); g.ok = null; };
  g.update = (dt) => {
    g.t += dt;
    if (g.pause > 0) {
      g.pause -= dt;
      if (g.pause <= 0) { if (g.round >= rounds) g.over = true; else newRound(); }
      return;
    }
    g.pos = 0.5 + 0.5 * Math.sin(g.t * (params.speed + g.round * 0.35));
  };
  g.press = () => {
    if (g.pause > 0 || g.over) return;
    const hit = Math.abs(g.pos - g.c) <= zoneW / 2;
    g.results.push(hit);
    g.ok = hit;
    sfx(hit ? 'good' : 'bad');
    g.round++;
    g.pause = 0.6;
    g.score = g.results.filter(Boolean).length / rounds;
  };
  g.key = (code) => { if (code === 'KeyE' || code === 'Space' || code === 'Enter') g.press(); };
  g.draw = (c) => {
    const bx = 50, bw = W - 100, by = 120, bh = 46;
    c.fillStyle = '#1b2230'; roundRect(c, bx, by, bw, bh, 10); c.fill();
    const zx = bx + (g.c - zoneW / 2) * bw;
    c.fillStyle = g.ok === false ? '#6b3030' : '#2f9e55'; roundRect(c, zx, by, zoneW * bw, bh, 8); c.fill();
    const px = bx + g.pos * bw;
    c.fillStyle = '#ffd166'; c.fillRect(px - 3, by - 10, 6, bh + 20);
    for (let i = 0; i < rounds; i++) {
      const r = g.results[i];
      c.beginPath(); c.arc(W / 2 - (rounds - 1) * 20 + i * 40, 215, 11, 0, Math.PI * 2);
      c.fillStyle = r === undefined ? '#2a3342' : r ? '#2f9e55' : '#c0392b'; c.fill();
    }
    center(c, `Lượt ${Math.min(g.round + 1, rounds)}/${rounds}`, 70, 18, '#aab4c0');
    if (g.ok !== null && g.pause > 0) center(c, g.ok ? 'TRÚNG!' : 'TRƯỢT!', 245, 20, g.ok ? '#8dff9b' : '#ff8b7a');
  };
  return g;
}

// ---------------- Gõ đúng phím ----------------
const DIR_CODES = { KeyW: 'U', ArrowUp: 'U', KeyS: 'D', ArrowDown: 'D', KeyA: 'L', ArrowLeft: 'L', KeyD: 'R', ArrowRight: 'R' };
const ARROW = { U: '↑', D: '↓', L: '←', R: '→' };
function keysGame(params, touch) {
  let seq = params.seq.slice();
  let letters = params.letters;
  if (touch && letters) { seq = seq.map(() => 'UDLR'[Math.floor(Math.random() * 4)]); letters = false; }
  const g = { idx: 0, mistakes: 0, left: params.limit, shake: 0, over: false, score: 0, hint: letters ? 'Gõ đúng chữ cái theo thứ tự' : 'Nhấn đúng mũi tên (W A S D hoặc phím mũi tên) theo thứ tự', seq, letters };
  const finish = () => {
    g.over = true;
    g.score = g.idx >= seq.length ? Math.max(0, 1 - 0.25 * g.mistakes) : (g.idx / seq.length) * 0.5 * Math.max(0, 1 - 0.25 * g.mistakes);
  };
  g.input = (sym) => {
    if (g.over) return;
    if (sym === seq[g.idx]) { g.idx++; sfx('click'); if (g.idx >= seq.length) { sfx(g.mistakes ? 'good' : 'perfect'); finish(); } }
    else { g.mistakes++; g.shake = 0.25; g.left -= 0.8; sfx('bad'); }
  };
  g.key = (code) => {
    if (letters) { if (/^Key[A-Z]$/.test(code)) g.input(code.slice(3)); }
    else if (DIR_CODES[code]) g.input(DIR_CODES[code]);
  };
  g.update = (dt) => {
    if (g.over) return;
    g.left -= dt; g.shake = Math.max(0, g.shake - dt);
    if (g.left <= 0) { g.left = 0; finish(); }
  };
  g.draw = (c) => {
    const n = seq.length, gap = 66, x0 = W / 2 - ((n - 1) * gap) / 2;
    const sh = g.shake > 0 ? Math.sin(g.shake * 90) * 6 : 0;
    for (let i = 0; i < n; i++) {
      const x = x0 + i * gap + sh, y = 130;
      const done = i < g.idx, cur = i === g.idx;
      c.fillStyle = done ? '#2f9e55' : cur ? '#f2823a' : '#2a3342';
      roundRect(c, x - 26, y - 28 + (cur ? -6 : 0), 52, 56, 10); c.fill();
      c.fillStyle = '#fff'; c.font = 'bold 30px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(letters ? seq[i] : ARROW[seq[i]], x, y + (cur ? -6 : 0) + 2);
    }
    const bw = W - 120;
    c.fillStyle = '#1b2230'; roundRect(c, 60, 215, bw, 14, 7); c.fill();
    c.fillStyle = g.left < 2 ? '#c0392b' : '#4a90d9'; roundRect(c, 60, 215, Math.max(0, (g.left / params.limit) * bw), 14, 7); c.fill();
    center(c, `Sai: ${g.mistakes}`, 75, 18, g.mistakes ? '#ff8b7a' : '#aab4c0');
  };
  return g;
}

// ---------------- Căn góc & lực ném ----------------
function aimGame(params, boosted) {
  const rounds = params.rounds || 3;
  const G = 480, sx = 60, gy = H - 50;
  const g = { round: 0, results: [], stage: 'angle', t: 0, angle: 45, power: 0.5, ball: null, pause: 0, over: false, score: 0, ok: null, hint: 'Nhấn E / Space / chạm: lần 1 chốt GÓC, lần 2 chốt LỰC để ném bóng vào rổ' };
  const newShot = () => { g.hx = rnd(300, 470); g.hh = rnd(70, 140); g.stage = 'angle'; g.ball = null; g.ok = null; g.t = 0; };
  newShot();
  const rim = boosted ? 32 : 26;
  g.update = (dt) => {
    g.t += dt;
    if (g.pause > 0) { g.pause -= dt; if (g.pause <= 0) { if (g.round >= rounds) g.over = true; else newShot(); } return; }
    if (g.stage === 'angle') g.angle = 50 + 32 * Math.sin(g.t * 2.3);
    else if (g.stage === 'power') g.power = 0.58 + 0.42 * Math.sin(g.t * 2.1 + 1);
    else if (g.stage === 'fly') {
      const b = g.ball;
      const steps = 4, h = dt / steps;
      for (let i = 0; i < steps && g.stage === 'fly'; i++) {
        const prevY = b.y;
        b.t += h;
        b.x = sx + b.vx * b.t;
        b.y = b.vy * b.t - 0.5 * G * b.t * b.t;
        if (b.vy - G * b.t < 0 && prevY >= g.hh && b.y < g.hh && Math.abs(b.x - g.hx) <= rim) { g.finishShot(true); }
        else if (b.y < -40 || b.x > W + 40) g.finishShot(false);
      }
    }
  };
  g.finishShot = (hit) => {
    g.results.push(hit); g.ok = hit; g.round++; g.pause = 0.9; g.stage = 'done';
    g.score = g.results.filter(Boolean).length / rounds;
    sfx(hit ? 'perfect' : 'bad');
  };
  g.press = () => {
    if (g.stage === 'angle') { g.stage = 'power'; g.t = 0; sfx('click'); }
    else if (g.stage === 'power') {
      const a = (g.angle * Math.PI) / 180, v = 160 + g.power * 380;
      g.ball = { t: 0, x: sx, y: 0, vx: v * Math.cos(a), vy: v * Math.sin(a) };
      g.stage = 'fly'; sfx('click');
    }
  };
  g.key = (code) => { if (code === 'KeyE' || code === 'Space' || code === 'Enter') g.press(); };
  g.draw = (c) => {
    c.fillStyle = '#26303f'; c.fillRect(20, gy + 12, W - 40, 6);
    // người ném
    c.fillStyle = '#f2823a'; c.fillRect(sx - 9, gy - 34, 18, 34); c.beginPath(); c.arc(sx, gy - 44, 9, 0, Math.PI * 2); c.fillStyle = '#f1c9a5'; c.fill();
    // rổ
    const hy = gy - g.hh;
    c.strokeStyle = '#aab4c0'; c.lineWidth = 4; c.beginPath(); c.moveTo(g.hx + rim + 8, hy + 80); c.lineTo(g.hx + rim + 8, hy - 40); c.stroke();
    c.fillStyle = '#e8eaee'; c.fillRect(g.hx + rim + 4, hy - 44, 6, 44);
    c.strokeStyle = '#ff6b35'; c.lineWidth = 5; c.beginPath(); c.moveTo(g.hx - rim, hy); c.lineTo(g.hx + rim, hy); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = 1.5;
    for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(g.hx + i * rim * 0.4, hy); c.lineTo(g.hx + i * rim * 0.2, hy + 24); c.stroke(); }
    // vạch chỉ góc
    if (g.stage === 'angle' || g.stage === 'power') {
      const a = (g.angle * Math.PI) / 180;
      c.strokeStyle = '#ffd166'; c.lineWidth = 4; c.beginPath(); c.moveTo(sx, gy - 30); c.lineTo(sx + Math.cos(a) * 70, gy - 30 - Math.sin(a) * 70); c.stroke();
      c.fillStyle = '#ffd166'; c.font = 'bold 16px system-ui'; c.textAlign = 'left'; c.fillText(`${Math.round(g.angle)}°`, sx + 14, gy + 34);
    }
    if (g.stage === 'power') {
      c.fillStyle = '#1b2230'; roundRect(c, 20, 60, 16, 130, 6); c.fill();
      c.fillStyle = '#f2823a'; const hh = g.power * 130; roundRect(c, 20, 190 - hh, 16, hh, 6); c.fill();
    }
    if (g.ball) { c.beginPath(); c.arc(g.ball.x, gy - 30 - g.ball.y, 8, 0, Math.PI * 2); c.fillStyle = '#ff8c42'; c.fill(); c.strokeStyle = '#7a3b10'; c.lineWidth = 1.5; c.stroke(); }
    for (let i = 0; i < rounds; i++) {
      const r = g.results[i];
      c.beginPath(); c.arc(W - 90 + i * 28, 30, 9, 0, Math.PI * 2);
      c.fillStyle = r === undefined ? '#2a3342' : r ? '#2f9e55' : '#c0392b'; c.fill();
    }
    c.fillStyle = '#aab4c0'; c.font = '16px system-ui'; c.textAlign = 'left'; c.fillText(g.stage === 'angle' ? 'Chốt góc' : g.stage === 'power' ? 'Chốt lực' : '', 24, 30);
    if (g.ok !== null) center(c, g.ok ? 'VÀO RỔ!' : 'TRƯỢT!', 120, 28, g.ok ? '#8dff9b' : '#ff8b7a');
  };
  return g;
}

// ---------------- Nối dây (kiểu Among Us) ----------------
const WIRE_COLORS = ['#e74c3c', '#3498db', '#f1c40f', '#2ecc71', '#b36bff'];
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function wiresGame(params) {
  const n = params.n || 4, limit = params.limit || 28;
  const L = shuffle([...Array(n).keys()]), R = shuffle([...Array(n).keys()]);
  const ys = Array.from({ length: n }, (_, i) => 62 + i * ((H - 130) / (n - 1)));
  const g = { left: limit, over: false, score: 0, mistakes: 0, shake: 0, done: new Array(n).fill(false), drag: null, sel: null, pad: null,
    hint: 'Kéo chuột nối các dây CÙNG MÀU (hoặc bấm số bên trái rồi số bên phải)' };
  const finish = () => {
    g.over = true;
    const k = g.done.filter(Boolean).length;
    g.score = k >= n ? Math.max(0.4, 1 - 0.2 * g.mistakes) : (k / n) * 0.5;
  };
  const tryConnect = (ls, rs) => {
    if (L[ls] === R[rs]) { g.done[ls] = true; sfx('click'); if (g.done.every(Boolean)) { sfx(g.mistakes ? 'good' : 'perfect'); finish(); } }
    else { g.mistakes++; g.shake = 0.3; sfx('bad'); }
  };
  const slotAt = (x, y, side) => {
    if (side === 'L' ? x > 130 : x < W - 130) return -1;
    for (let i = 0; i < n; i++) if (Math.abs(y - ys[i]) < 22) return i;
    return -1;
  };
  g.pointer = (type, x, y) => {
    if (g.over) return;
    if (type === 'down') { const s = slotAt(x, y, 'L'); if (s >= 0 && !g.done[s]) g.drag = { s, x, y }; }
    else if (type === 'move' && g.drag) { g.drag.x = x; g.drag.y = y; }
    else if (type === 'up' && g.drag) {
      const r = slotAt(x, y, 'R');
      if (r >= 0) tryConnect(g.drag.s, r);
      g.drag = null;
    }
  };
  g.key = (code) => {
    const m = /^(Digit|Numpad)([1-9])$/.exec(code);
    if (!m || g.over) return;
    const i = +m[2] - 1;
    if (i >= n) return;
    if (g.sel === null) { if (!g.done[i]) g.sel = i; }
    else { const s = g.sel; g.sel = null; tryConnect(s, i); }
  };
  g.update = (dt) => { if (g.over) return; g.left -= dt; g.shake = Math.max(0, g.shake - dt); if (g.left <= 0) { g.left = 0; finish(); } };
  g.draw = (c) => {
    const sh = g.shake > 0 ? Math.sin(g.shake * 90) * 5 : 0;
    c.fillStyle = '#1b2230'; roundRect(c, 20, 20, 90, H - 70, 12); c.fill(); roundRect(c, W - 110, 20, 90, H - 70, 12); c.fill();
    for (let i = 0; i < n; i++) {
      if (g.done[i]) { // dây đã nối
        const ri = R.indexOf(L[i]);
        c.strokeStyle = WIRE_COLORS[L[i]]; c.lineWidth = 9; c.lineCap = 'round';
        c.beginPath(); c.moveTo(100, ys[i]); c.bezierCurveTo(240, ys[i], W - 240, ys[ri], W - 100, ys[ri]); c.stroke();
      }
    }
    for (let i = 0; i < n; i++) {
      c.fillStyle = WIRE_COLORS[L[i]]; roundRect(c, 80 + sh, ys[i] - 14, 32, 28, 6); c.fill();
      c.fillStyle = WIRE_COLORS[R[i]]; roundRect(c, W - 112 - sh, ys[i] - 14, 32, 28, 6); c.fill();
      c.fillStyle = '#fff'; c.font = 'bold 15px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(String(i + 1), 52 + sh, ys[i]); c.fillText(String(i + 1), W - 52 - sh, ys[i]);
      if (g.sel === i) { c.strokeStyle = '#fff'; c.lineWidth = 3; roundRect(c, 76, ys[i] - 18, 40, 36, 8); c.stroke(); }
    }
    if (g.drag) {
      c.strokeStyle = WIRE_COLORS[L[g.drag.s]]; c.lineWidth = 9; c.lineCap = 'round';
      c.beginPath(); c.moveTo(100, ys[g.drag.s]); c.lineTo(g.drag.x, g.drag.y); c.stroke();
    }
    c.fillStyle = '#1b2230'; roundRect(c, 150, H - 38, W - 300, 12, 6); c.fill();
    c.fillStyle = g.left < 6 ? '#c0392b' : '#4a90d9'; roundRect(c, 150, H - 38, Math.max(0, (g.left / limit) * (W - 300)), 12, 6); c.fill();
    center(c, `Sai: ${g.mistakes}`, 30, 16, g.mistakes ? '#ff8b7a' : '#aab4c0');
  };
  return g;
}

// ---------------- Phân loại (trái / phải) ----------------
const SORT_THEMES = {
  goods: { names: ['Hàng thường', 'Hàng dễ vỡ'], icons: [['📦', '🧱'], ['🏺', '🥚']], colors: ['#d9822b', '#3d8fe0'], left: 'thùng gỗ', right: 'hàng dễ vỡ' },
  laundry: { names: ['Đồ trắng', 'Đồ màu'], icons: [['🧦', '🥼'], ['👕', '👖']], colors: ['#dfe6e9', '#e17055'], left: 'trắng', right: 'màu' },
};
function sortGame(params) {
  const th = SORT_THEMES[params.theme] || SORT_THEMES.goods;
  const n = params.n || 9;
  const items = Array.from({ length: n }, () => { const side = Math.random() < 0.5 ? 0 : 1; return { side, icon: th.icons[side][Math.floor(Math.random() * 2)] }; });
  const g = { idx: 0, t: 0, results: [], fly: [], over: false, score: 0, pad: 'lr', mistakes: 0, shake: 0, hint: `Bấm ← hoặc → để bỏ vào thùng CÙNG MÀU với món đồ (${th.names[0]} / ${th.names[1]})` };
  const T = (i) => Math.max(1.15, 2.4 - i * 0.14);
  const next = () => { g.idx++; g.t = 0; if (g.idx >= n) { g.over = true; const ok = g.results.filter(Boolean).length; g.score = ok / n; if (ok === n) sfx('perfect'); } };
  g.input = (sym) => {
    if (g.over || (sym !== 'L' && sym !== 'R')) return;
    const it = items[g.idx], pick = sym === 'L' ? 0 : 1, ok = pick === it.side;
    g.results.push(ok); g.fly.push({ x: W / 2, y: 100 + g.t * 20, dir: pick ? 1 : -1, life: 0.35, icon: it.icon, ok });
    sfx(ok ? 'click' : 'bad'); if (!ok) { g.mistakes++; g.shake = 0.2; }
    next();
  };
  g.key = (code) => { if (code === 'ArrowLeft' || code === 'KeyA') g.input('L'); else if (code === 'ArrowRight' || code === 'KeyD') g.input('R'); };
  g.update = (dt) => {
    for (const f of g.fly) f.life -= dt; g.fly = g.fly.filter((f) => f.life > 0);
    g.shake = Math.max(0, g.shake - dt);
    if (g.over) return;
    g.t += dt;
    if (g.t >= T(g.idx)) { g.results.push(false); g.mistakes++; g.shake = 0.2; sfx('bad'); next(); }
  };
  g.draw = (c) => {
    // băng chuyền
    c.fillStyle = '#222b38'; c.fillRect(0, 70, W, 70);
    c.fillStyle = '#2d3846'; for (let x = -40 + ((g.t * 120) % 40); x < W; x += 40) c.fillRect(x, 70, 18, 70);
    // thùng hai bên
    for (const s of [0, 1]) {
      const x = s ? W - 170 : 30, sh = g.shake > 0 ? Math.sin(g.shake * 80) * 4 : 0;
      c.fillStyle = th.colors[s]; roundRect(c, x + sh, 170, 140, 80, 12); c.fill();
      c.fillStyle = 'rgba(0,0,0,.25)'; roundRect(c, x + 10 + sh, 178, 120, 64, 8); c.fill();
      c.fillStyle = '#fff'; c.font = 'bold 17px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineWidth = 4; c.strokeStyle = 'rgba(0,0,0,.7)'; c.strokeText(`${s ? '→' : '←'} ${th.names[s]}`, x + 70 + sh, 210);
      c.fillText(`${s ? '→' : '←'} ${th.names[s]}`, x + 70 + sh, 210);
    }
    if (!g.over && g.idx < n) {
      const it = items[g.idx], tl = 1 - g.t / T(g.idx);
      c.fillStyle = th.colors[it.side]; roundRect(c, W / 2 - 40, 78, 80, 56, 12); c.fill(); c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 3; c.stroke(); // thẻ màu = thùng cần bỏ vào
      c.font = '40px system-ui, "Segoe UI Emoji", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#000';
      c.fillText(it.icon, W / 2, 108);
      c.fillStyle = '#1b2230'; roundRect(c, W / 2 - 60, 150, 120, 8, 4); c.fill();
      c.fillStyle = tl < 0.3 ? '#c0392b' : '#ffd166'; roundRect(c, W / 2 - 60, 150, 120 * tl, 8, 4); c.fill();
    }
    for (const f of g.fly) { const k = 1 - f.life / 0.35; c.globalAlpha = 1 - k * 0.6; c.font = '40px system-ui, "Segoe UI Emoji"'; c.textAlign = 'center'; c.fillText(f.icon, f.x + f.dir * k * 190, f.y + k * 100); }
    c.globalAlpha = 1;
    for (let i = 0; i < n; i++) { c.beginPath(); c.arc(W / 2 - (n - 1) * 11 + i * 22, 24, 7, 0, Math.PI * 2); const r = g.results[i]; c.fillStyle = r === undefined ? '#2a3342' : r ? '#2f9e55' : '#c0392b'; c.fill(); }
  };
  return g;
}

// ---------------- Nhớ chuỗi (Simon) ----------------
const SIMON = { U: { x: 280, y: 78, c: '#e74c3c' }, L: { x: 190, y: 145, c: '#3498db' }, R: { x: 370, y: 145, c: '#2ecc71' }, D: { x: 280, y: 212, c: '#f1c40f' } };
function memoryGame(params) {
  const rounds = params.rounds || 3;
  const g = { round: 0, lives: params.lives || 2, seq: [], idx: 0, mode: 'wait', t: 0.8, showI: 0, lit: null, litT: 0, over: false, score: 0, lost: 0, shake: 0, pad: 'udlr', left: 55,
    hint: params.theme === 'aerobic' ? 'Xem mẫu rồi lặp lại đúng thứ tự: ← ↑ → ↓ (hoặc WASD)' : 'Ghi nhớ rồi nhập lại chuỗi: ← ↑ → ↓ (hoặc WASD, bấm chuột)' };
  const build = () => { g.seq = Array.from({ length: g.round + 3 }, () => 'UDLR'[Math.floor(Math.random() * 4)]); g.mode = 'wait'; g.t = 0.8; g.showI = 0; g.idx = 0; };
  build();
  const finish = (allDone) => { g.over = true; g.score = allDone ? Math.max(0.6, 1 - 0.2 * g.lost) : (g.round / rounds) * 0.5; };
  g.update = (dt) => {
    if (g.over) return;
    g.left -= dt; g.shake = Math.max(0, g.shake - dt);
    if (g.litT > 0) { g.litT -= dt; if (g.litT <= 0) g.lit = null; }
    if (g.left <= 0) { finish(false); return; }
    if (g.mode === 'wait') { g.t -= dt; if (g.t <= 0) { g.mode = 'show'; g.t = 0; g.showI = 0; } }
    else if (g.mode === 'show') {
      g.t -= dt;
      if (g.t <= 0) {
        if (g.showI >= g.seq.length) { g.mode = 'input'; g.idx = 0; g.lit = null; }
        else { g.lit = g.seq[g.showI]; g.litT = 0.4; g.showI++; g.t = 0.62; sfx('click'); }
      }
    } else if (g.mode === 'between') { g.t -= dt; if (g.t <= 0) build(); }
  };
  g.input = (sym) => {
    if (g.over || g.mode !== 'input' || !SIMON[sym]) return;
    g.lit = sym; g.litT = 0.18;
    if (sym === g.seq[g.idx]) {
      sfx('click'); g.idx++;
      if (g.idx >= g.seq.length) {
        g.round++;
        if (g.round >= rounds) { sfx(g.lost ? 'good' : 'perfect'); finish(true); } else { g.mode = 'between'; g.t = 0.8; sfx('good'); }
      }
    } else {
      sfx('bad'); g.shake = 0.3; g.lives--; g.lost++;
      if (g.lives < 0) finish(false); else { g.mode = 'wait'; g.t = 1.0; g.showI = 0; g.idx = 0; }
    }
  };
  g.key = (code) => { if (DIR_CODES[code]) g.input(DIR_CODES[code]); };
  g.pointer = (type, x, y) => { if (type !== 'down') return; for (const s in SIMON) if (Math.hypot(x - SIMON[s].x, y - SIMON[s].y) < 36) g.input(s); };
  g.draw = (c) => {
    const sh = g.shake > 0 ? Math.sin(g.shake * 90) * 5 : 0;
    for (const s in SIMON) {
      const p = SIMON[s], on = g.lit === s;
      c.globalAlpha = on ? 1 : 0.38;
      c.fillStyle = p.c; roundRect(c, p.x - 36 + sh, p.y - 30, 72, 60, 14); c.fill();
      c.globalAlpha = 1;
      if (on) { c.strokeStyle = '#fff'; c.lineWidth = 4; roundRect(c, p.x - 36 + sh, p.y - 30, 72, 60, 14); c.stroke(); }
      c.fillStyle = '#fff'; c.font = 'bold 28px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(ARROW[s], p.x + sh, p.y);
    }
    center(c, `Lượt ${Math.min(g.round + 1, rounds)}/${rounds}`, 24, 16, '#aab4c0');
    center(c, g.mode === 'show' || g.mode === 'wait' ? 'Xem kỹ...' : g.mode === 'input' ? `Đến lượt bạn! (${g.idx}/${g.seq.length})` : 'Tốt!', 258, 18, g.mode === 'input' ? '#ffd166' : '#aab4c0');
    for (let i = 0; i <= (params.lives || 2); i++) { c.fillStyle = i < g.lives + 1 ? '#e74c3c' : '#2a3342'; c.font = '18px system-ui, "Segoe UI Emoji"'; c.textAlign = 'center'; c.fillText('❤', W - 80 + i * 22, 24); }
  };
  return g;
}

// ---------------- Lật thẻ ghép cặp ----------------
const PAIR_SETS = {
  goods: ['📦', '🔧', '⚙️', '🔩', '🧰', '🪛'], words: ['🍎', '🏠', '🚗', '🌳', '📖', '🌞'], cards: ['♠️', '♥️', '♦️', '♣️', '⭐', '🌙'],
};
function pairsGame(params) {
  const sy = PAIR_SETS[params.theme] || PAIR_SETS.goods, np = Math.min(sy.length, params.pairs || 6);
  const cards = shuffle([...sy.slice(0, np), ...sy.slice(0, np)]).map((s) => ({ s, open: false, done: false }));
  const cols = 4, rows = Math.ceil(cards.length / cols), cw = 92, ch = 66, gap = 12;
  const gx = (W - (cols * cw + (cols - 1) * gap)) / 2, gy = 46;
  const g = { cards, first: -1, lock: 0, mistakes: 0, matched: 0, over: false, score: 0, cur: 0, left: params.limit || 30, pad: null, flashBad: 0,
    hint: 'Lật hai thẻ giống nhau: bấm chuột / chạm, hoặc dùng mũi tên + E' };
  const finish = () => {
    g.over = true;
    if (g.matched >= np) g.score = g.mistakes <= 4 ? 1 : Math.max(0.6, 1 - 0.07 * (g.mistakes - 4));
    else g.score = (g.matched / np) * 0.5;
  };
  const flip = (i) => {
    if (g.over || g.lock > 0 || i < 0 || i >= cards.length) return;
    const cd = cards[i];
    if (cd.open || cd.done) return;
    cd.open = true; sfx('click');
    if (g.first < 0) { g.first = i; return; }
    const a = cards[g.first];
    if (a.s === cd.s) { a.done = cd.done = true; g.matched++; g.first = -1; sfx('good'); if (g.matched >= np) { sfx(g.mistakes <= 4 ? 'perfect' : 'good'); finish(); } }
    else { g.mistakes++; g.lock = 0.75; g.second = i; sfx('bad'); }
  };
  g.pointer = (type, x, y) => {
    if (type !== 'down') return;
    for (let i = 0; i < cards.length; i++) {
      const cx = gx + (i % cols) * (cw + gap), cy = gy + Math.floor(i / cols) * (ch + gap);
      if (x >= cx && x <= cx + cw && y >= cy && y <= cy + ch) { g.cur = i; flip(i); return; }
    }
  };
  g.key = (code) => {
    if (code === 'ArrowLeft' || code === 'KeyA') g.cur = (g.cur + cards.length - 1) % cards.length;
    else if (code === 'ArrowRight' || code === 'KeyD') g.cur = (g.cur + 1) % cards.length;
    else if (code === 'ArrowUp' || code === 'KeyW') g.cur = (g.cur + cards.length - cols) % cards.length;
    else if (code === 'ArrowDown' || code === 'KeyS') g.cur = (g.cur + cols) % cards.length;
    else if (code === 'KeyE' || code === 'Space' || code === 'Enter') flip(g.cur);
  };
  g.update = (dt) => {
    if (g.over) return;
    g.left -= dt;
    if (g.lock > 0) { g.lock -= dt; if (g.lock <= 0) { cards[g.first].open = false; cards[g.second].open = false; g.first = -1; } }
    if (g.left <= 0) { g.left = 0; finish(); }
  };
  g.draw = (c) => {
    for (let i = 0; i < cards.length; i++) {
      const cd = cards[i], x = gx + (i % cols) * (cw + gap), y = gy + Math.floor(i / cols) * (ch + gap);
      c.fillStyle = cd.done ? '#2f6f46' : cd.open ? '#f4f0e0' : '#3a4a68'; roundRect(c, x, y, cw, ch, 10); c.fill();
      if (cd.open || cd.done) { c.font = '34px system-ui, "Segoe UI Emoji", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#111'; c.fillText(cd.s, x + cw / 2, y + ch / 2 + 2); }
      else { c.fillStyle = 'rgba(255,255,255,.18)'; c.font = 'bold 30px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('?', x + cw / 2, y + ch / 2); }
      if (i === g.cur) { c.strokeStyle = '#ffd166'; c.lineWidth = 3; roundRect(c, x - 3, y - 3, cw + 6, ch + 6, 12); c.stroke(); }
    }
    const bw = W - 120;
    c.fillStyle = '#1b2230'; roundRect(c, 60, H - 28, bw, 10, 5); c.fill();
    c.fillStyle = g.left < 6 ? '#c0392b' : '#4a90d9'; roundRect(c, 60, H - 28, Math.max(0, (g.left / (params.limit || 30)) * bw), 10, 5); c.fill();
    center(c, `Cặp: ${g.matched}/${np} · Sai: ${g.mistakes}`, 22, 16, '#aab4c0');
  };
  return g;
}

// ---------------- Dọn rác / nhổ cỏ (bấm đúng vật) ----------------
const CLEAN_ICONS = { dust: ['🍂', '🧻', '🥤', '🍃'], weed: ['🌿', '🌱', '☘️'] };
function cleanGame(params) {
  const n = params.n || 10, icons = CLEAN_ICONS[params.theme] || CLEAN_ICONS.dust, weed = params.theme === 'weed';
  const g = { spawned: 0, hits: 0, misses: 0, targets: [], fx: [], nextT: 0.5, over: false, score: 0, pad: null, cursor: { x: W / 2, y: H / 2 }, keys: new Set(),
    hint: weed ? 'Bấm nhanh vào cỏ dại trước khi chúng biến mất' : 'Bấm vào rác để nhặt trước khi hết giờ (mũi tên + E nếu không có chuột)' };
  const TTL = 2.3;
  const hit = (x, y) => {
    if (g.over) return;
    for (const t of g.targets) if (!t.dead && Math.hypot(t.x - x, t.y - y) < 34) { t.dead = true; g.hits++; g.fx.push({ x: t.x, y: t.y, life: 0.4 }); sfx('click'); return; }
  };
  g.pointer = (type, x, y) => { if (type === 'down') { g.cursor.x = x; g.cursor.y = y; hit(x, y); } else if (type === 'move') { g.cursor.x = x; g.cursor.y = y; } };
  g.key = (code) => { g.keys.add(code); if (code === 'KeyE' || code === 'Space' || code === 'Enter') hit(g.cursor.x, g.cursor.y); };
  g.keyup = (code) => g.keys.delete(code);
  g.update = (dt) => {
    for (const f of g.fx) f.life -= dt; g.fx = g.fx.filter((f) => f.life > 0);
    if (g.over) return;
    const kx = (g.keys.has('ArrowRight') || g.keys.has('KeyD') ? 1 : 0) - (g.keys.has('ArrowLeft') || g.keys.has('KeyA') ? 1 : 0);
    const ky = (g.keys.has('ArrowDown') || g.keys.has('KeyS') ? 1 : 0) - (g.keys.has('ArrowUp') || g.keys.has('KeyW') ? 1 : 0);
    g.cursor.x = clamp(g.cursor.x + kx * 280 * dt, 20, W - 20); g.cursor.y = clamp(g.cursor.y + ky * 280 * dt, 20, H - 20);
    for (const t of g.targets) { t.age += dt; if (!t.dead && t.age >= TTL) { t.dead = true; t.lost = true; g.misses++; sfx('bad'); } }
    g.targets = g.targets.filter((t) => !t.dead);
    g.nextT -= dt;
    if (g.spawned < n && g.nextT <= 0 && g.targets.length < 3) {
      g.nextT = rnd(0.55, 0.85); g.spawned++;
      g.targets.push({ x: rnd(50, W - 50), y: rnd(50, H - 60), age: 0, icon: icons[Math.floor(Math.random() * icons.length)], dead: false });
    }
    if (g.spawned >= n && g.targets.length === 0) { g.over = true; g.score = g.hits / n; sfx(g.hits === n ? 'perfect' : 'good'); }
  };
  g.draw = (c) => {
    c.fillStyle = weed ? '#233b24' : '#3a372f'; c.fillRect(0, 0, W, H);
    c.fillStyle = 'rgba(255,255,255,.04)'; for (let i = 0; i < 40; i++) c.fillRect((i * 97) % W, (i * 53) % H, 14, 3);
    for (const t of g.targets) {
      const k = 1 - t.age / TTL;
      c.strokeStyle = k < 0.3 ? '#ff5a4a' : '#ffd166'; c.lineWidth = 4; c.beginPath(); c.arc(t.x, t.y, 30, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); c.stroke();
      c.font = '34px system-ui, "Segoe UI Emoji"'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(t.icon, t.x, t.y + 2);
    }
    for (const f of g.fx) { c.strokeStyle = `rgba(141,255,155,${f.life / 0.4})`; c.lineWidth = 3; c.beginPath(); c.arc(f.x, f.y, 14 + (0.4 - f.life) * 70, 0, Math.PI * 2); c.stroke(); }
    c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.arc(g.cursor.x, g.cursor.y, 9, 0, Math.PI * 2); c.moveTo(g.cursor.x - 15, g.cursor.y); c.lineTo(g.cursor.x + 15, g.cursor.y); c.moveTo(g.cursor.x, g.cursor.y - 15); c.lineTo(g.cursor.x, g.cursor.y + 15); c.stroke();
    center(c, `Đã dọn: ${g.hits}/${n} · Bỏ lỡ: ${g.misses}`, 20, 16, '#cfd8dc');
  };
  return g;
}

// ---------------- Bấm liên tục (hít đất / đào / nâng tạ) ----------------
const MASH_ICON = { pushup: '💪', pickaxe: '⛏️', weights: '🏋️' };
function mashGame(params, boosted) {
  const T = params.time || 8, gain = (0.065 * (boosted ? 1.4 : 1)) / (params.need || 1);
  const g = { fill: 0, best: 0, left: T, bump: 0, over: false, score: 0, pad: 'press', hint: 'Bấm E / Space / chạm thật nhanh để lấp đầy thanh trước khi hết giờ' };
  g.press = () => {
    if (g.over) return;
    g.fill = Math.min(1, g.fill + gain); g.best = Math.max(g.best, g.fill); g.bump = 1; sfx('click');
    if (g.fill >= 1) { g.over = true; g.score = g.left > T * 0.35 ? 1 : 0.75; sfx(g.score >= 1 ? 'perfect' : 'good'); }
  };
  g.key = (code) => { if (code === 'KeyE' || code === 'Space' || code === 'Enter') g.press(); };
  g.update = (dt) => {
    g.bump = Math.max(0, g.bump - dt * 6);
    if (g.over) return;
    g.left -= dt; g.fill = Math.max(0, g.fill - dt * (0.17 + g.fill * 0.17));
    if (g.left <= 0) { g.left = 0; g.over = true; g.score = g.best * 0.55; }
  };
  g.draw = (c) => {
    const ico = MASH_ICON[params.theme] || '💪', s = 1 + g.bump * 0.28, dy = -Math.sin(g.bump * 3) * 14;
    c.save(); c.translate(W / 2, 110 + dy); c.scale(s, s); c.font = '78px system-ui, "Segoe UI Emoji"'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(ico, 0, 0); c.restore();
    const bx = 70, bw = W - 140;
    c.fillStyle = '#1b2230'; roundRect(c, bx, 190, bw, 30, 15); c.fill();
    const col = g.fill > 0.75 ? '#8dff9b' : g.fill > 0.35 ? '#ffd166' : '#ff8b7a';
    c.fillStyle = col; roundRect(c, bx, 190, Math.max(8, bw * g.fill), 30, 15); c.fill();
    center(c, `${Math.round(g.fill * 100)}%`, 205, 16, '#10151c');
    center(c, `Còn ${g.left.toFixed(1)} giây`, 245, 16, g.left < 2.5 ? '#ff8b7a' : '#aab4c0');
    center(c, 'BẤM LIÊN TỤC!', 30, 20, '#ffc857');
  };
  return g;
}

// ---------------- Giữ thăng bằng (giữ E để nâng, nhả để hạ) ----------------
const BAL_ICON = { pull: '🧗', water: '💧', run: '🏃' };
function balanceGame(params, boosted) {
  const dur = params.dur || 10, need = params.need || 6.5, zone = (params.zone || 0.3) * (boosted ? 1.25 : 1);
  const g = { t: 0, y: 0.1, vy: 0, hold: false, acc: 0, over: false, score: 0, pad: 'hold', c: 0.5, hint: 'Giữ E / Space / chạm để nâng, nhả để hạ: giữ ô tròn trong vùng xanh' };
  const target = (t) => clamp(0.5 + 0.24 * Math.sin(t * 0.95) + 0.13 * Math.sin(t * 1.9 + 1), 0.14, 0.86);
  g.key = (code) => { if (code === 'KeyE' || code === 'Space' || code === 'Enter') g.hold = true; };
  g.keyup = (code) => { if (code === 'KeyE' || code === 'Space' || code === 'Enter') g.hold = false; };
  g.setHold = (v) => { g.hold = v; };
  g.update = (dt) => {
    if (g.over) return;
    g.t += dt;
    g.vy += (g.hold ? 2.9 : -2.3) * dt; g.vy = clamp(g.vy, -1.1, 1.1);
    g.y += g.vy * dt;
    if (g.y < 0) { g.y = 0; g.vy = 0; } if (g.y > 1) { g.y = 1; g.vy = 0; }
    g.c = target(g.t);
    if (Math.abs(g.y - g.c) <= zone / 2) g.acc += dt;
    if (g.t >= dur) { g.over = true; g.score = Math.min(1, g.acc / need); if (g.score >= 0.99) sfx('perfect'); }
  };
  g.draw = (c) => {
    const tx = W / 2 - 14, ty = 28, th = H - 80, yy = (v) => ty + (1 - v) * th;
    c.fillStyle = '#1b2230'; roundRect(c, tx, ty, 28, th, 14); c.fill();
    const inz = Math.abs(g.y - g.c) <= zone / 2;
    c.fillStyle = inz ? '#3ddc84' : '#2f9e55'; roundRect(c, tx - 4, yy(g.c + zone / 2), 36, zone * th, 12); c.fill();
    c.fillStyle = '#ffd166'; c.beginPath(); c.arc(W / 2, yy(g.y), 14, 0, Math.PI * 2); c.fill(); c.strokeStyle = '#7a5a10'; c.lineWidth = 3; c.stroke();
    c.font = '44px system-ui, "Segoe UI Emoji"'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(BAL_ICON[params.theme] || '🧗', W / 2 - 150, yy(g.y));
    const bx = W - 130; c.fillStyle = '#1b2230'; roundRect(c, bx, ty, 22, th, 11); c.fill();
    const k = Math.min(1, g.acc / need); c.fillStyle = k >= 1 ? '#8dff9b' : '#4a90d9'; roundRect(c, bx, ty + th * (1 - k), 22, Math.max(6, th * k), 11); c.fill();
    center(c, 'Tiến độ', ty + th + 12, 13, '#aab4c0');
    center(c, `${Math.max(0, dur - g.t).toFixed(1)}s`, 22, 16, '#aab4c0');
    if (g.hold) { c.fillStyle = 'rgba(255,209,102,.2)'; c.fillRect(0, 0, 6, H); c.fillRect(W - 6, 0, 6, H); }
  };
  return g;
}

// ---------------- Bóng bàn (đỡ bóng) ----------------
function pongGame(params, boosted) {
  const need = params.hits || 8, pw = boosted ? 112 : 92;
  const g = { px: W / 2, hits: 0, lives: params.lives || 3, lost: 0, over: false, score: 0, keys: new Set(), pad: 'holdlr', serve: 0.8, ball: null, hint: 'Di chuyển vợt bằng A/D hoặc ←/→ hoặc chuột để đỡ bóng đủ lần' };
  const launch = () => { const a = rnd(-0.6, 0.6); const sp = 235 + g.hits * 12; g.ball = { x: rnd(120, W - 120), y: 40, vx: Math.sin(a) * sp, vy: Math.cos(a) * sp }; };
  launch();
  g.key = (code) => g.keys.add(code);
  g.keyup = (code) => g.keys.delete(code);
  g.holdDir = (d, on) => { if (on) g.keys.add(d === 'L' ? 'ArrowLeft' : 'ArrowRight'); else g.keys.delete(d === 'L' ? 'ArrowLeft' : 'ArrowRight'); };
  g.pointer = (type, x) => { if (type === 'move' || type === 'down') g.px = clamp(x, pw / 2, W - pw / 2); };
  g.update = (dt) => {
    if (g.over) return;
    const dir = (g.keys.has('ArrowRight') || g.keys.has('KeyD') ? 1 : 0) - (g.keys.has('ArrowLeft') || g.keys.has('KeyA') ? 1 : 0);
    g.px = clamp(g.px + dir * 430 * dt, pw / 2, W - pw / 2);
    if (g.serve > 0) { g.serve -= dt; return; }
    const b = g.ball;
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.x < 10) { b.x = 10; b.vx = Math.abs(b.vx); } if (b.x > W - 10) { b.x = W - 10; b.vx = -Math.abs(b.vx); }
    if (b.y < 10) { b.y = 10; b.vy = Math.abs(b.vy); }
    if (b.vy > 0 && b.y >= H - 34 && b.y <= H - 16 && Math.abs(b.x - g.px) <= pw / 2 + 8) {
      const off = clamp((b.x - g.px) / (pw / 2), -1, 1), sp = Math.hypot(b.vx, b.vy) + 10, a = off * 1.0;
      b.vx = Math.sin(a) * sp; b.vy = -Math.cos(a) * sp; b.y = H - 35; g.hits++; sfx('click');
      if (g.hits >= need) { g.over = true; g.score = Math.max(0.6, 1 - 0.15 * g.lost); sfx(g.lost ? 'good' : 'perfect'); }
    } else if (b.y > H + 12) {
      g.lives--; g.lost++; sfx('bad');
      if (g.lives <= 0) { g.over = true; g.score = (g.hits / need) * 0.6; } else { launch(); g.serve = 0.7; }
    }
  };
  g.draw = (c) => {
    c.fillStyle = '#1b6b48'; c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(255,255,255,.6)'; c.lineWidth = 3; c.strokeRect(8, 8, W - 16, H - 16);
    c.setLineDash([10, 8]); c.beginPath(); c.moveTo(8, H / 2); c.lineTo(W - 8, H / 2); c.stroke(); c.setLineDash([]);
    c.fillStyle = '#e8eaee'; roundRect(c, g.px - pw / 2, H - 26, pw, 12, 6); c.fill(); c.fillStyle = '#d63031'; roundRect(c, g.px - pw / 2 + 6, H - 24, pw - 12, 8, 4); c.fill();
    if (g.ball) { c.beginPath(); c.arc(g.ball.x, g.ball.y, 8, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill(); }
    center(c, `Đỡ bóng: ${g.hits}/${need}`, 28, 18, '#fff');
    for (let i = 0; i < (params.lives || 3); i++) { c.font = '16px system-ui, "Segoe UI Emoji"'; c.textAlign = 'center'; c.fillStyle = '#fff'; c.fillText(i < g.lives ? '❤️' : '🖤', W - 70 + i * 22, 28); }
  };
  return g;
}

// ---------------- Đá bóng (sút phạt: chốt hướng sút, né thủ môn) ----------------
function kickGame(params) {
  const rounds = params.rounds || 3, gl = 150, gr = 410, gy = 60;
  const g = { round: 0, results: [], stage: 'aim', t: 0, mark: W / 2, keeper: W / 2, ball: null, pause: 0, over: false, score: 0, ok: null, pad: 'press',
    hint: 'Bấm E / Space / chạm để chốt hướng sút: sút vào khung thành, tránh thủ môn' };
  const kdir = () => rnd(1.4, 2.2);
  let ks = kdir();
  g.update = (dt) => {
    g.t += dt;
    if (g.pause > 0) { g.pause -= dt; if (g.pause <= 0) { if (g.round >= rounds) g.over = true; else { g.stage = 'aim'; g.ball = null; g.ok = null; ks = kdir(); } } return; }
    g.keeper = (gl + gr) / 2 + Math.sin(g.t * ks) * 90;
    if (g.stage === 'aim') g.mark = W / 2 + Math.sin(g.t * (2.3 + g.round * 0.4)) * 190;
    else if (g.stage === 'fly') {
      g.ball.k += dt * 3.2; g.ball.x = W / 2 + (g.ball.tx - W / 2) * Math.min(1, g.ball.k); g.ball.y = H - 40 - (H - 40 - gy - 20) * Math.min(1, g.ball.k);
      if (g.ball.k >= 1) {
        const inGoal = g.ball.tx > gl && g.ball.tx < gr, saved = Math.abs(g.ball.tx - g.keeper) < 40;
        const hit = inGoal && !saved;
        g.results.push(hit); g.ok = hit; g.round++; g.pause = 1; g.stage = 'done'; g.score = g.results.filter(Boolean).length / rounds;
        sfx(hit ? 'perfect' : 'bad');
      }
    }
  };
  g.press = () => { if (g.stage === 'aim') { g.stage = 'fly'; g.ball = { tx: g.mark, k: 0, x: W / 2, y: H - 40 }; sfx('click'); } };
  g.key = (code) => { if (code === 'KeyE' || code === 'Space' || code === 'Enter') g.press(); };
  g.draw = (c) => {
    c.fillStyle = '#1e6b3a'; c.fillRect(0, 0, W, H);
    c.strokeStyle = '#fff'; c.lineWidth = 5; c.strokeRect(gl, gy - 30, gr - gl, 60); // khung thành
    c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 1; for (let x = gl; x <= gr; x += 14) { c.beginPath(); c.moveTo(x, gy - 30); c.lineTo(x, gy + 30); c.stroke(); }
    c.fillStyle = '#ffd166'; c.fillRect(g.keeper - 18, gy - 10, 36, 40); c.fillStyle = '#f1c9a5'; c.beginPath(); c.arc(g.keeper, gy - 18, 10, 0, Math.PI * 2); c.fill();
    if (g.stage === 'aim') { c.strokeStyle = '#ff5a4a'; c.lineWidth = 3; c.beginPath(); c.arc(g.mark, gy, 14, 0, Math.PI * 2); c.moveTo(g.mark - 20, gy); c.lineTo(g.mark + 20, gy); c.moveTo(g.mark, gy - 20); c.lineTo(g.mark, gy + 20); c.stroke(); }
    const b = g.ball || { x: W / 2, y: H - 40 };
    c.font = '30px system-ui, "Segoe UI Emoji"'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#fff'; c.fillText('⚽', b.x, b.y);
    for (let i = 0; i < rounds; i++) { c.beginPath(); c.arc(W - 90 + i * 28, 30, 9, 0, Math.PI * 2); const r = g.results[i]; c.fillStyle = r === undefined ? '#2a3342' : r ? '#2f9e55' : '#c0392b'; c.fill(); }
    if (g.ok !== null) center(c, g.ok ? 'VÀO!' : 'TRƯỢT!', 150, 30, g.ok ? '#8dff9b' : '#ff8b7a');
  };
  return g;
}

// ---------------- Đập gạch (đỡ bóng phá gạch) ----------------
function bricksGame(params, boosted) {
  const target = params.target || 14, pw = boosted ? 100 : 80, cols = 8, rows = 3, bw = 56, bh = 18, gx = (W - cols * (bw + 4)) / 2 + 2;
  const bricks = []; for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) bricks.push({ x: gx + q * (bw + 4), y: 44 + r * (bh + 4), alive: true, c: ['#e74c3c', '#f39c12', '#f1c40f'][r] });
  const g = { px: W / 2, keys: new Set(), broken: 0, lives: params.lives || 2, over: false, score: 0, left: 32, serve: 0.8, pad: 'holdlr', ball: null,
    hint: 'Di chuyển vợt (A/D, ←/→ hoặc chuột) đỡ bóng để phá gạch' };
  const launch = () => { const a = rnd(-0.5, 0.5); g.ball = { x: g.px, y: H - 50, vx: Math.sin(a) * 230, vy: -Math.cos(a) * 230 }; };
  launch();
  g.key = (code) => g.keys.add(code); g.keyup = (code) => g.keys.delete(code);
  g.holdDir = (d, on) => { const k = d === 'L' ? 'ArrowLeft' : 'ArrowRight'; if (on) g.keys.add(k); else g.keys.delete(k); };
  g.pointer = (type, x) => { if (type === 'move' || type === 'down') g.px = clamp(x, pw / 2, W - pw / 2); };
  const finish = (all) => { g.over = true; g.score = all ? Math.max(0.6, 1 - 0.2 * (2 - g.lives)) : Math.min(0.55, (g.broken / target) * 0.55); sfx(all ? 'perfect' : 'bad'); };
  g.update = (dt) => {
    if (g.over) return;
    g.left -= dt; if (g.left <= 0) { finish(false); return; }
    const dir = (g.keys.has('ArrowRight') || g.keys.has('KeyD') ? 1 : 0) - (g.keys.has('ArrowLeft') || g.keys.has('KeyA') ? 1 : 0);
    g.px = clamp(g.px + dir * 420 * dt, pw / 2, W - pw / 2);
    if (g.serve > 0) { g.serve -= dt; g.ball.x = g.px; return; }
    const b = g.ball; b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.x < 8) { b.x = 8; b.vx = Math.abs(b.vx); } if (b.x > W - 8) { b.x = W - 8; b.vx = -Math.abs(b.vx); } if (b.y < 8) { b.y = 8; b.vy = Math.abs(b.vy); }
    for (const k of bricks) if (k.alive && b.x > k.x - 6 && b.x < k.x + bw + 6 && b.y > k.y - 6 && b.y < k.y + bh + 6) { k.alive = false; g.broken++; b.vy = -b.vy; sfx('click'); if (g.broken >= target) finish(true); break; }
    if (b.vy > 0 && b.y >= H - 34 && b.y <= H - 18 && Math.abs(b.x - g.px) <= pw / 2 + 6) { const off = clamp((b.x - g.px) / (pw / 2), -1, 1), sp = Math.hypot(b.vx, b.vy) + 6; b.vx = Math.sin(off) * sp; b.vy = -Math.abs(Math.cos(off) * sp); b.y = H - 35; }
    else if (b.y > H + 10) { g.lives--; sfx('bad'); if (g.lives <= 0) finish(false); else { launch(); g.serve = 0.7; } }
  };
  g.draw = (c) => {
    for (const k of bricks) if (k.alive) { c.fillStyle = k.c; roundRect(c, k.x, k.y, bw, bh, 4); c.fill(); }
    c.fillStyle = '#e8eaee'; roundRect(c, g.px - pw / 2, H - 28, pw, 12, 6); c.fill();
    if (g.ball) { c.beginPath(); c.arc(g.ball.x, g.ball.y, 8, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill(); }
    center(c, `Gạch: ${g.broken}/${target} · Còn ${Math.ceil(g.left)}s · ${'❤'.repeat(Math.max(0, g.lives))}`, 20, 15, '#cfd8dc');
  };
  return g;
}

// ---------------- Bắn bi (hất bi ra khỏi vòng) ----------------
function marblesGame(params) {
  const shots = params.shots || 4, need = params.need || 3, cx = W / 2, cy = 92, R = 76, sx = W / 2, sy = H - 36;
  const targets = [[-26, -10], [24, -14], [-4, 20], [30, 18], [-34, 22]].slice(0, 4 + 1).map(([dx, dy]) => ({ x: cx + dx, y: cy + dy, vx: 0, vy: 0, out: false }));
  const g = { shot: 0, stage: 'angle', t: 0, angle: 0, power: 0.5, m: null, out: 0, over: false, score: 0, pause: 0, pad: 'press',
    hint: 'Bấm lần 1 chốt HƯỚNG, lần 2 chốt LỰC để bắn bi hất bi đối phương ra khỏi vòng' };
  const finish = () => { g.over = true; g.score = Math.min(1, g.out / need); sfx(g.score >= 1 ? 'perfect' : 'good'); };
  g.press = () => {
    if (g.stage === 'angle') { g.stage = 'power'; g.t = 0; sfx('click'); }
    else if (g.stage === 'power') { const sp = 260 + g.power * 420; g.m = { x: sx, y: sy, vx: Math.sin(g.angle) * sp, vy: -Math.cos(g.angle) * sp }; g.stage = 'roll'; g.shot++; sfx('click'); }
  };
  g.key = (code) => { if (code === 'KeyE' || code === 'Space' || code === 'Enter') g.press(); };
  g.update = (dt) => {
    g.t += dt;
    if (g.over) return;
    if (g.stage === 'angle') g.angle = Math.sin(g.t * 2.2) * 0.5;
    else if (g.stage === 'power') g.power = 0.5 + 0.5 * Math.sin(g.t * 3 - 1.2);
    else if (g.stage === 'roll') {
      const all = [g.m, ...targets.filter((t) => !t.out)];
      for (const o of all) { o.x += o.vx * dt; o.y += o.vy * dt; const f = Math.exp(-1.9 * dt); o.vx *= f; o.vy *= f; }
      for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
        const a = all[i], b = all[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
        if (d > 0 && d < 20) { const nx = dx / d, ny = dy / d, rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny; if (rel > 0) { a.vx -= rel * nx; a.vy -= rel * ny; b.vx += rel * nx; b.vy += rel * ny; sfx('click'); } const pu = (20 - d) / 2; a.x -= nx * pu; a.y -= ny * pu; b.x += nx * pu; b.y += ny * pu; }
      }
      for (const t of targets) if (!t.out && Math.hypot(t.x - cx, t.y - cy) > R) { t.out = true; g.out++; sfx('good'); }
      const moving = all.some((o) => Math.hypot(o.vx, o.vy) > 12) && g.m.x > -30 && g.m.x < W + 30 && g.m.y > -30 && g.m.y < H + 30;
      if (!moving) { g.stage = 'done'; g.pause = 0.6; }
    } else if (g.stage === 'done') {
      g.pause -= dt;
      if (g.pause <= 0) { if (g.out >= need || g.shot >= shots) finish(); else { g.stage = 'angle'; g.t = 0; g.m = null; } }
    }
  };
  g.draw = (c) => {
    c.fillStyle = '#6b4a2a'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#8a6a45'; c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 4; c.stroke();
    const col = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#b36bff'];
    targets.forEach((t, i) => { if (t.out) return; c.beginPath(); c.arc(t.x, t.y, 10, 0, Math.PI * 2); c.fillStyle = col[i % 5]; c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.stroke(); });
    const m = g.m || { x: sx, y: sy }; c.beginPath(); c.arc(m.x, m.y, 10, 0, Math.PI * 2); c.fillStyle = '#ecf0f1'; c.fill(); c.strokeStyle = '#555'; c.lineWidth = 2; c.stroke();
    if (g.stage === 'angle' || g.stage === 'power') { c.strokeStyle = '#ffd166'; c.lineWidth = 4; c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx + Math.sin(g.angle) * 90, sy - Math.cos(g.angle) * 90); c.stroke(); }
    if (g.stage === 'power') { c.fillStyle = '#1b2230'; roundRect(c, 20, H - 150, 16, 120, 6); c.fill(); c.fillStyle = '#f2823a'; const h = g.power * 120; roundRect(c, 20, H - 30 - h, 16, h, 6); c.fill(); }
    center(c, `Đã hất ra: ${g.out}/${need} · Lượt ${Math.min(g.shot + (g.stage === 'roll' || g.stage === 'done' ? 0 : 1), shots)}/${shots}`, 20, 15, '#fff');
  };
  return g;
}
// ---------------- Chơi bài: lá tiếp theo lớn hơn hay nhỏ hơn? ----------------
// Server rút cả hai lá và chỉ gửi lá đầu; người chơi chọn, server trả lá thứ hai + kết quả (đúng +5 Jack, sai -5 Jack, bằng nhau là thua).
const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
function drawCardFace(c, x, y, w, h, card, faceDown) {
  c.fillStyle = faceDown ? '#3a4a68' : '#f7f3e6'; roundRect(c, x, y, w, h, 10); c.fill();
  c.strokeStyle = faceDown ? '#6a7da6' : '#c9c2a8'; c.lineWidth = 3; roundRect(c, x, y, w, h, 10); c.stroke();
  if (faceDown || !card) {
    c.fillStyle = 'rgba(255,255,255,.2)'; c.font = 'bold 44px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('?', x + w / 2, y + h / 2);
    return;
  }
  const red = card.s === 1 || card.s === 2;
  c.fillStyle = red ? '#c0392b' : '#1b1b1b'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = `bold ${Math.round(h * 0.34)}px system-ui, sans-serif`; c.fillText(RANKS[card.r], x + w / 2, y + h * 0.36);
  c.font = `${Math.round(h * 0.36)}px system-ui, "Segoe UI Symbol", sans-serif`; c.fillText(SUITS[card.s], x + w / 2, y + h * 0.7);
  c.font = `bold ${Math.round(h * 0.13)}px system-ui`; c.textAlign = 'left'; c.fillText(RANKS[card.r] + SUITS[card.s], x + 8, y + 16);
}
function hiloGame(params, token, send) {
  const cw = 104, ch = 150, cy = 38;
  const g = { first: params.card, second: null, stage: 'pick', t: 0, flip: 0, win: false, delta: 0, over: false, score: 0, pad: 'hilo', hi: false,
    hint: 'Lá tiếp theo lớn hơn hay nhỏ hơn? ↑/W hoặc chuột: LỚN HƠN · ↓/S: NHỎ HƠN (bằng nhau là thua)' };
  const BTN = { lo: [30, 214, 230, 50], hi: [300, 214, 230, 50] };
  g.pick = (side) => {
    if (g.stage !== 'pick') return;
    g.stage = 'wait'; g.chosen = side;
    sfx('click');
    send && send({ t: 'hilo', token, pick: side });
  };
  g.key = (code) => {
    if (code === 'ArrowUp' || code === 'KeyW' || code === 'KeyH') g.pick('hi');
    else if (code === 'ArrowDown' || code === 'KeyS' || code === 'KeyL') g.pick('lo');
  };
  g.pointer = (type, x, y) => {
    if (type !== 'down') return;
    for (const side of ['lo', 'hi']) { const [bx, by, bw, bh] = BTN[side]; if (x >= bx && x <= bx + bw && y >= by && y <= by + bh) g.pick(side); }
  };
  g.event = (m) => { g.second = m.card; g.win = !!m.win; g.delta = m.d | 0; g.stage = 'reveal'; g.t = 0; sfx(g.win ? 'good' : 'bad'); };
  g.update = (dt) => {
    if (g.stage !== 'reveal') return;
    g.t += dt; g.flip = Math.min(1, g.t / 0.35);
    if (g.t > 1.7) { g.over = true; g.score = g.win ? 1 : 0; }
  };
  g.draw = (c) => {
    drawCardFace(c, 150, cy, cw, ch, g.first, false);
    // lá thứ hai: úp, rồi lật (co ngang rồi mở ra)
    const wScale = g.stage === 'reveal' ? Math.max(0.04, Math.abs(1 - 2 * Math.min(1, g.flip))) : 1;
    const faceUp = g.stage === 'reveal' && g.flip >= 0.5;
    c.save(); c.translate(306 + cw / 2, 0); c.scale(wScale, 1); c.translate(-(306 + cw / 2), 0);
    drawCardFace(c, 306, cy, cw, ch, g.second, !faceUp);
    c.restore();
    c.fillStyle = '#aab4c0'; c.font = 'bold 18px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('VS', W / 2, cy + ch / 2);
    for (const side of ['lo', 'hi']) {
      const [bx, by, bw, bh] = BTN[side], on = g.chosen === side;
      c.fillStyle = on ? '#f2823a' : '#2a3342'; roundRect(c, bx, by, bw, bh, 12); c.fill();
      c.strokeStyle = on ? '#ffd166' : '#3b4656'; c.lineWidth = 2; roundRect(c, bx, by, bw, bh, 12); c.stroke();
      c.fillStyle = on ? '#1b1206' : '#fff'; c.font = 'bold 20px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(side === 'hi' ? '▲ LỚN HƠN' : '▼ NHỎ HƠN', bx + bw / 2, by + bh / 2);
    }
    if (g.stage === 'wait') center(c, 'Đang lật bài...', 200, 14, '#aab4c0');
    if (g.stage === 'reveal') center(c, g.win ? `ĐÚNG! +${g.delta} Jack` : `SAI! ${g.delta} Jack`, 200, 20, g.win ? '#8dff9b' : '#ff8b7a');
  };
  return g;
}

// ---------------- Khung điều khiển ----------------
function makeGame(def, touch, send) {
  const p = def.params, b = def.boosted;
  switch (def.kind) {
    case 'hilo': return hiloGame(p, def.token, send);
    case 'timing': { const g = timingGame(p, b); g.pad = 'press'; return g; }
    case 'keys': { const g = keysGame(p, touch); g.pad = 'udlr'; return g; }
    case 'wires': return wiresGame(p);
    case 'sort': return sortGame(p);
    case 'memory': return memoryGame(p);
    case 'pairs': return pairsGame(p);
    case 'clean': return cleanGame(p);
    case 'mash': return mashGame(p, b);
    case 'balance': return balanceGame(p, b);
    case 'pong': return pongGame(p, b);
    case 'kick': return kickGame(p);
    case 'bricks': return bricksGame(p, b);
    case 'marbles': return marblesGame(p);
    default: { const g = aimGame(p, b); g.pad = 'press'; return g; }
  }
}

export function startMinigame(def, { touch = false, send = null, onDone }) {
  stopMinigame();
  const box = $('mg'), cv = $('mgc'), c = cv.getContext('2d');
  cv.width = W * 2; cv.height = H * 2; // độ phân giải kép cho nét
  const game = makeGame(def, touch, send);
  $('mgtitle').textContent = def.title;
  $('mghint').textContent = game.hint + ' · Esc để huỷ';
  const pad = $('mgpad');
  pad.innerHTML = '';
  const btn = (label, cls = '') => { const b = document.createElement('button'); b.textContent = label; if (cls) b.className = cls; pad.appendChild(b); return b; };
  if (touch) {
    if (game.pad === 'udlr') for (const s of ['L', 'U', 'D', 'R']) btn(ARROW[s]).addEventListener('pointerdown', (e) => { e.preventDefault(); game.input(s); });
    else if (game.pad === 'lr') for (const s of ['L', 'R']) btn(ARROW[s]).addEventListener('pointerdown', (e) => { e.preventDefault(); game.input(s); });
    else if (game.pad === 'hilo') {
      btn('▼ NHỎ').addEventListener('pointerdown', (e) => { e.preventDefault(); game.pick('lo'); });
      btn('▲ LỚN').addEventListener('pointerdown', (e) => { e.preventDefault(); game.pick('hi'); });
    }
    else if (game.pad === 'press') btn('BẤM', 'wide').addEventListener('pointerdown', (e) => { e.preventDefault(); game.press(); });
    else if (game.pad === 'hold') {
      const b = btn('GIỮ', 'wide');
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.setPointerCapture(e.pointerId); game.setHold(true); });
      const up = () => game.setHold(false); b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
    } else if (game.pad === 'holdlr') {
      for (const s of ['L', 'R']) {
        const b = btn(ARROW[s]);
        b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.setPointerCapture(e.pointerId); game.holdDir(s, true); });
        const up = () => game.holdDir(s, false); b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
      }
    }
  }
  box.classList.remove('hidden');
  let raf = 0, last = performance.now(), finished = false, endT = 0;
  const finish = (cancel) => {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('keyup', onKeyUp, true);
    cv.removeEventListener('pointerdown', onDown);
    cv.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    box.classList.add('hidden');
    active = null;
    onDone(cancel ? null : game.score, cancel);
  };
  const onKey = (e) => {
    e.preventDefault(); e.stopImmediatePropagation();
    if (e.repeat) return;
    if (e.code === 'Escape') { finish(true); return; }
    game.key && game.key(e.code);
  };
  const onKeyUp = (e) => { e.preventDefault(); e.stopImmediatePropagation(); game.keyup && game.keyup(e.code); };
  const pos = (e) => { const r = cv.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H]; };
  const onDown = (e) => {
    e.preventDefault();
    const [x, y] = pos(e);
    if (game.pointer) game.pointer('down', x, y);
    else if (game.press) game.press();
    else if (game.setHold) game.setHold(true);
  };
  const onMove = (e) => { if (game.pointer) { const [x, y] = pos(e); game.pointer('move', x, y); } };
  const onUp = (e) => {
    if (game.pointer) { const [x, y] = pos(e); game.pointer('up', x, y); }
    if (game.setHold && !game.pointer) game.setHold(false);
  };
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', onKeyUp, true);
  cv.addEventListener('pointerdown', onDown);
  cv.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  const loop = (now) => {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    game.update(dt);
    c.setTransform(2, 0, 0, 2, 0, 0);
    c.fillStyle = '#10151c'; c.fillRect(0, 0, W, H);
    game.draw(c);
    if (game.over) {
      endT += dt;
      center(c, game.score >= 0.99 ? 'HOÀN HẢO!' : game.score >= 0.6 ? 'Khá tốt' : game.score > 0 ? 'Tạm được' : 'Hỏng rồi', 245, 22, game.score >= 0.6 ? '#8dff9b' : '#ffb4a8');
      if (endT > 0.8) finish(false);
    }
  };
  active = { cancel: () => finish(true), event: (m) => game.event && game.event(m) };
  raf = requestAnimationFrame(loop);
  return active;
}

// Tin nhắn từ server dành cho minigame đang mở (vd. kết quả ván bài lớn/nhỏ)
export function minigameEvent(m) { if (active && active.event) active.event(m); }

export function stopMinigame() {
  if (active) active.cancel();
}
// Dùng khi server huỷ minigame (bị đánh, bị khám xét...): đóng khung không gửi gì thêm.
export function forceCloseMinigame() {
  if (!active) return;
  const a = active; active = null;
  a.cancel();
}
