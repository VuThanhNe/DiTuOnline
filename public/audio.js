// Âm thanh: hiệu ứng và giọng NPC tổng hợp bằng WebAudio; nhạc nền là hai file mp3 (public/music/day.mp3, night.mp3).
let ctx = null, master = null, sfxG = null, musG = null, voxG = null, noiseBuf = null;
let muted = false;
try { muted = localStorage.getItem('ditu-muted') === '1'; } catch { /* bỏ qua */ }

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (a, b) => a + Math.random() * (b - a);
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); if (!curTrack) startMusic(); return; } // nhạc từng bị trình duyệt chặn thì thử phát lại khi người chơi chạm vào trang
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 5;
  master = ctx.createGain();
  master.gain.value = muted ? 0 : volume;
  master.connect(comp); comp.connect(ctx.destination);
  sfxG = ctx.createGain(); sfxG.gain.value = 0.85; sfxG.connect(master);
  voxG = ctx.createGain(); voxG.gain.value = 0.7; voxG.connect(master);
  musG = ctx.createGain(); musG.gain.value = 0.3; musG.connect(master); // nhạc nền (file mp3) nhỏ hơn hiệu ứng
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  startMusic();
}

export function toggleMute() {
  muted = !muted;
  try { localStorage.setItem('ditu-muted', muted ? '1' : '0'); } catch { /* bỏ qua */ }
  if (master) master.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.05);
  return muted;
}
export const isMuted = () => muted;

// Âm lượng chung 0..1 (nhớ lại giữa các lần chơi)
let volume = 0.8;
try { const v = parseFloat(localStorage.getItem('ditu-vol')); if (Number.isFinite(v)) volume = Math.max(0, Math.min(1, v)); } catch { /* bỏ qua */ }
export const getVolume = () => volume;
export function setVolume(v) {
  volume = clamp(v, 0, 1);
  try { localStorage.setItem('ditu-vol', String(volume)); } catch { /* bỏ qua */ }
  if (master && !muted) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.05);
}

// Tiếng mưa (nhiễu lọc, lặp liên tục)
let rainSrc = null, rainG = null;
export function setRain(on) {
  if (!ctx) return;
  if (on && !rainSrc) {
    rainSrc = ctx.createBufferSource(); rainSrc.buffer = noiseBuf; rainSrc.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 3500; f.Q.value = 0.4;
    rainG = ctx.createGain(); rainG.gain.value = 0;
    rainSrc.connect(f); f.connect(rainG); rainG.connect(sfxG); rainSrc.start();
    rainG.gain.setTargetAtTime(0.16, ctx.currentTime, 0.6);
  } else if (!on && rainSrc) {
    const s = rainSrc, g = rainG; rainSrc = null; rainG = null;
    g.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
    setTimeout(() => { try { s.stop(); } catch { /* bỏ qua */ } }, 2000);
  }
}

// ---------- Bộ dựng âm cơ bản ----------
function bus(vol, pan, dest) {
  const g = ctx.createGain();
  g.gain.value = vol;
  let out = g;
  if (ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = clamp(pan, -1, 1);
    g.connect(p); out = p;
  }
  out.connect(dest);
  return g;
}
function env(g, t, a, d, vol) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}
function tone(dest, { t = ctx.currentTime, f = 440, f2 = null, type = 'sine', dur = 0.2, vol = 0.3, a = 0.005, detune = 0 }) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.detune.value = detune;
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
  env(g, t, a, dur, vol);
  o.connect(g); g.connect(dest);
  o.start(t); o.stop(t + dur + a + 0.05);
}
function noise(dest, { t = ctx.currentTime, dur = 0.15, vol = 0.3, type = 'lowpass', f = 1000, f2 = null, q = 1, a = 0.003 }) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = true;
  const flt = ctx.createBiquadFilter(), g = ctx.createGain();
  flt.type = type; flt.Q.value = q;
  flt.frequency.setValueAtTime(f, t);
  if (f2) flt.frequency.exponentialRampToValueAtTime(Math.max(30, f2), t + dur);
  env(g, t, a, dur, vol);
  s.connect(flt); flt.connect(g); g.connect(dest);
  s.start(t, Math.random() * 0.5); s.stop(t + dur + a + 0.05);
}

// ---------- Hiệu ứng ----------
const SFX = {
  step: (o) => noise(o, { dur: 0.06, vol: 0.18, f: 500 + Math.random() * 200, type: 'lowpass' }),
  hammer: (o, t) => { tone(o, { t, f: 220, f2: 70, type: 'square', dur: 0.1, vol: 0.28 }); noise(o, { t, dur: 0.08, vol: 0.3, type: 'highpass', f: 2500 }); tone(o, { t: t + 0.05, f: 1400, type: 'sine', dur: 0.2, vol: 0.08 }); },
  dig: (o, t) => { noise(o, { t, dur: 0.28, vol: 0.4, type: 'bandpass', f: 500, f2: 250, q: 0.8 }); tone(o, { t, f: 90, f2: 45, dur: 0.22, vol: 0.4 }); },
  thud: (o, t) => { tone(o, { t, f: 110, f2: 45, dur: 0.18, vol: 0.5 }); noise(o, { t, dur: 0.1, vol: 0.2, f: 400 }); },
  ball: (o, t) => { tone(o, { t, f: 180, f2: 90, dur: 0.14, vol: 0.45 }); tone(o, { t: t + 0.22, f: 150, f2: 80, dur: 0.1, vol: 0.3 }); },
  page: (o, t) => { noise(o, { t, dur: 0.18, vol: 0.18, type: 'bandpass', f: 3200, f2: 1800, q: 0.6 }); },
  sweep: (o, t) => { noise(o, { t, dur: 0.4, vol: 0.14, type: 'bandpass', f: 1200, f2: 2600, q: 0.5, a: 0.08 }); },
  munch: (o, t) => { for (let i = 0; i < 3; i++) noise(o, { t: t + i * 0.13, dur: 0.07, vol: 0.28, f: 900, q: 1 }); },
  lock: (o, t) => { tone(o, { t, f: 2400, type: 'square', dur: 0.03, vol: 0.12 }); tone(o, { t: t + 0.09, f: 1800, type: 'square', dur: 0.03, vol: 0.12 }); noise(o, { t: t + 0.18, dur: 0.05, vol: 0.2, type: 'highpass', f: 3000 }); },
  pickup: (o, t) => { tone(o, { t, f: 660, dur: 0.12, vol: 0.3, type: 'triangle' }); tone(o, { t: t + 0.1, f: 990, dur: 0.22, vol: 0.3, type: 'triangle' }); },
  coin: (o, t) => { tone(o, { t, f: 1318, dur: 0.08, vol: 0.25, type: 'square' }); tone(o, { t: t + 0.07, f: 1976, dur: 0.3, vol: 0.25, type: 'square' }); },
  scam: (o, t) => { tone(o, { t, f: 330, f2: 90, type: 'sawtooth', dur: 0.8, vol: 0.28, a: 0.02 }); tone(o, { t, f: 335, f2: 95, type: 'sawtooth', dur: 0.8, vol: 0.2, a: 0.02, detune: 30 }); },
  boom: (o, t) => { noise(o, { t, dur: 1.4, vol: 1, f: 900, f2: 50, a: 0.005 }); tone(o, { t, f: 70, f2: 22, dur: 1.2, vol: 1 }); noise(o, { t, dur: 0.25, vol: 0.6, type: 'highpass', f: 1500 }); },
  fuse: (o, t) => { for (let i = 0; i < 6; i++) tone(o, { t: t + i * 0.12, f: 2200 + i * 150, type: 'square', dur: 0.03, vol: 0.08 }); },
  hit: (o, t) => { noise(o, { t, dur: 0.1, vol: 0.6, f: 1200, f2: 300 }); tone(o, { t, f: 140, f2: 50, dur: 0.14, vol: 0.6 }); },
  whistle: (o, t) => { const osc = ctx.createOscillator(), g = ctx.createGain(), l = ctx.createOscillator(), lg = ctx.createGain(); osc.type = 'sine'; osc.frequency.value = 2500; l.frequency.value = 38; lg.gain.value = 120; l.connect(lg); lg.connect(osc.frequency); env(g, t, 0.02, 0.5, 0.35); osc.connect(g); g.connect(o); osc.start(t); l.start(t); osc.stop(t + 0.6); l.stop(t + 0.6); },
  siren: (o, t) => { for (let i = 0; i < 4; i++) tone(o, { t: t + i * 0.3, f: i % 2 ? 620 : 880, type: 'square', dur: 0.28, vol: 0.18, a: 0.01 }); },
  click: (o, t) => tone(o, { t, f: 1000, type: 'square', dur: 0.025, vol: 0.12 }),
  good: (o, t) => { tone(o, { t, f: 784, type: 'triangle', dur: 0.1, vol: 0.28 }); tone(o, { t: t + 0.08, f: 1175, type: 'triangle', dur: 0.2, vol: 0.28 }); },
  perfect: (o, t) => { [523, 659, 784, 1047].forEach((f, i) => tone(o, { t: t + i * 0.07, f, type: 'triangle', dur: 0.18, vol: 0.3 })); },
  bad: (o, t) => { tone(o, { t, f: 150, type: 'sawtooth', dur: 0.2, vol: 0.28 }); tone(o, { t: t + 0.1, f: 110, type: 'sawtooth', dur: 0.25, vol: 0.28 }); },
  drink: (o, t) => { for (let i = 0; i < 3; i++) tone(o, { t: t + i * 0.12, f: 200 - i * 20, f2: 120, dur: 0.1, vol: 0.3 }); noise(o, { t: t + 0.4, dur: 0.6, vol: 0.18, type: 'highpass', f: 5000, a: 0.05 }); },
  win: (o, t) => { [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(o, { t: t + i * 0.11, f, type: 'triangle', dur: 0.3, vol: 0.3 })); },
  rock: (o, t) => { tone(o, { t, f: 260, f2: 90, dur: 0.1, vol: 0.5, type: 'triangle' }); noise(o, { t: t + 0.04, dur: 0.18, vol: 0.4, type: 'bandpass', f: 1500, q: 0.8 }); },
  meow: (o, t) => { tone(o, { t, f: 520, f2: 900, type: 'triangle', dur: 0.2, vol: 0.2 }); tone(o, { t: t + 0.18, f: 900, f2: 420, type: 'triangle', dur: 0.32, vol: 0.2 }); },
  alarm: (o, t) => { for (let i = 0; i < 6; i++) tone(o, { t: t + i * 0.22, f: i % 2 ? 700 : 1000, type: 'sawtooth', dur: 0.2, vol: 0.14 }); },
};

export function sfx(kind, vol = 1, pan = 0) {
  if (!ctx || !SFX[kind] || vol < 0.02) return;
  const o = bus(vol, pan, sfxG);
  SFX[kind](o, ctx.currentTime);
}
// Phát âm thanh theo vị trí trong thế giới (xa thì nhỏ dần, lệch trái/phải theo vị trí)
export function sfxAt(kind, x, z, mx, mz, R = 32) {
  const d = Math.hypot(x - mx, z - mz);
  if (d > R) return;
  sfx(kind, Math.pow(1 - d / R, 1.4), (x - mx) / 18);
}

// ---------- Giọng NPC (không nói chữ thật, chỉ nghe như quát tháo / lầm bầm) ----------
const VOWELS = [[800, 1200], [550, 900], [500, 1800], [350, 800], [320, 2300], [650, 1100]];
const VOICE = {
  guard: { f0: [88, 125], harsh: 1, dist: true },
  npc: { f0: [135, 185], harsh: 0.35, dist: false },
  dealer: { f0: [175, 230], harsh: 0.5, dist: false },
};
let distCurve = null;
function curve() {
  if (distCurve) return distCurve;
  distCurve = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const x = (i / 128) - 1; distCurve[i] = Math.tanh(x * 4); }
  return distCurve;
}

export function voice(kind, text, vol = 1, pan = 0, yell = false) {
  if (!ctx || vol < 0.03) return;
  const v = VOICE[kind] || VOICE.npc;
  const o = bus(vol * (yell ? 1.15 : 0.7), pan, voxG);
  let out = o;
  if (v.dist) { const ws = ctx.createWaveShaper(); ws.curve = curve(); ws.connect(o); out = ws; }
  const syl = clamp(Math.round(text.length / 3.4), 3, 13);
  const base = rnd(v.f0[0], v.f0[1]) * (yell ? 1.12 : 1);
  let t = ctx.currentTime + 0.02;
  for (let i = 0; i < syl; i++) {
    const [f1, f2] = VOWELS[Math.floor(Math.random() * VOWELS.length)];
    const dur = rnd(0.09, yell ? 0.2 : 0.15);
    const accent = i === 0 || Math.random() < 0.25 ? 1.2 : 1;
    const f0 = base * accent * (1 + Math.sin((i / syl) * Math.PI) * (yell ? 0.25 : 0.12));
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.linearRampToValueAtTime(f0 * (yell ? 0.8 : 0.93), t + dur);
    for (const f of [f1, f2]) {
      const b = ctx.createBiquadFilter();
      b.type = 'bandpass'; b.frequency.value = f * rnd(0.92, 1.08); b.Q.value = 5 + v.harsh * 3;
      const bg = ctx.createGain(); bg.gain.value = f === f1 ? 1 : 0.6;
      osc.connect(b); b.connect(bg); bg.connect(g);
    }
    if (v.harsh > 0.4) { // hơi thở gắt
      const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
      const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 1800; nf.Q.value = 0.7;
      const ng = ctx.createGain(); ng.gain.value = 0.25 * v.harsh;
      s.connect(nf); nf.connect(ng); ng.connect(g); s.start(t, Math.random()); s.stop(t + dur + 0.05);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(yell ? 0.9 : 0.55, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(out);
    osc.start(t); osc.stop(t + dur + 0.05);
    t += dur + rnd(0.02, 0.07);
  }
}
export function voiceAt(kind, text, x, z, mx, mz, yell = false) {
  const R = yell ? 34 : 24;
  const d = Math.hypot(x - mx, z - mz);
  if (d > R) return;
  voice(kind, text, Math.pow(1 - d / R, 1.2), (x - mx) / 18, yell);
}

// ---------- Nhạc nền: hai file mp3 (ban ngày / ban đêm), phát lặp và chuyển mượt khi đổi giờ ----------
// File nằm ở public/music/. Bài ban đêm chỉ được tải khi tới giờ tắt đèn (preload = none) để vào game không phải tải trước.
const TRACKS = { day: '/music/day.mp3', night: '/music/night.mp3' };
const NIGHT_PHASE_INDEX = 6;
const players = {};
let curPhase = -1, curTrack = null;

function getTrack(name) {
  if (players[name]) return players[name];
  const el = new Audio();
  el.src = TRACKS[name]; el.loop = true; el.preload = 'none';
  const gain = ctx.createGain(); gain.gain.value = 0;
  ctx.createMediaElementSource(el).connect(gain); gain.connect(musG); // đi qua musG -> master nên nút tắt tiếng và thanh âm lượng vẫn có tác dụng
  return (players[name] = { el, gain });
}

function playTrack(name) {
  if (!ctx || name === curTrack) return;
  const t = ctx.currentTime, prev = curTrack;
  if (prev) { // bài cũ nhỏ dần rồi tạm dừng (giữ vị trí để lần sau phát tiếp)
    const old = players[prev];
    old.gain.gain.setTargetAtTime(0, t, 0.5);
    setTimeout(() => { if (curTrack !== prev) old.el.pause(); }, 2500);
  }
  curTrack = name;
  const p = getTrack(name);
  p.gain.gain.setTargetAtTime(1, t, 0.7);
  const pr = p.el.play();
  if (pr && pr.catch) pr.catch(() => { if (curTrack === name) curTrack = null; }); // bị trình duyệt chặn: lần gọi sau sẽ thử lại
}

export function setPhaseMusic(i) {
  curPhase = i;
  playTrack(i === NIGHT_PHASE_INDEX ? 'night' : 'day');
}

function startMusic() { playTrack(curPhase === NIGHT_PHASE_INDEX ? 'night' : 'day'); }
