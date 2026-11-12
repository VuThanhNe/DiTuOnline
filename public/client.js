import * as THREE from 'three';
import {
  WALLS, ZONES, KHOS, GATES, STATIONS, PHASES, NIGHT_PHASE, RULES, ITEM_NAMES, SHOP, DEALER, ENERGY, BOOST, PLAYER_SPEED, WORLD, PHASE_ICON, clockHour, LIGHTS, LIGHTHOUSE, spotAt,
} from '/shared/map.js';
import { stepMove, rayDist, moveSpeed, isRunning, blocked } from '/shared/sim.js';
import { findPath } from '/shared/nav.js';
import { buildWorld, updateGates, animateGates, setDigProgress, setFenceCuts, makeCharacter, animateCharacter, makeSprite, drawText, wrap, emojiSprite, makeArrowGeometry } from './world.js';
import { initAudio, sfx, sfxAt, voiceAt, setPhaseMusic, toggleMute, isMuted, setRain, setVolume, getVolume } from './audio.js';
import { startMinigame, forceCloseMinigame, minigameActive, minigameEvent } from './minigames.js';

const $ = (id) => document.getElementById(id);
const canvas = $('c');
const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

// ===================== Three.js cơ bản =====================
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
// Chất lượng đồ họa: low (nhẹ nhất) / mid / high (có bloom). Lưu trong localStorage; điện thoại mặc định mid.
const QUALITY_LEVELS = ['low', 'mid', 'high'];
let quality = isTouch ? 'mid' : 'high';
try { const q = localStorage.getItem('ditu-quality'); if (QUALITY_LEVELS.includes(q)) quality = q; } catch { /* bỏ qua */ }
const PR_CAP = { low: 1, mid: 1.5, high: 2 };
let pixelRatio = Math.min(window.devicePixelRatio || 1, PR_CAP[quality]);
renderer.setPixelRatio(pixelRatio);
renderer.shadowMap.enabled = quality !== 'low';
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
const DAY_BG = new THREE.Color(0x9fc9ee);
scene.fog = new THREE.Fog(DAY_BG.clone(), 80, 230);
const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 400);
const hemi = new THREE.HemisphereLight(0xcfe6ff, 0x6b6a55, 0.75);
const sun = new THREE.DirectionalLight(0xfff3dc, 2.1);
sun.castShadow = quality !== 'low';
const SHADOW_SIZE = { low: 1024, mid: 1536, high: 2048 };
sun.shadow.mapSize.set(SHADOW_SIZE[quality], SHADOW_SIZE[quality]);
const SH = 34;
Object.assign(sun.shadow.camera, { left: -SH, right: SH, top: SH, bottom: -SH, near: 1, far: 140 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.04;
scene.add(hemi, sun, sun.target);

// ===================== Ánh sáng theo giờ trong ngày (màu nắng, độ sáng, sương mù, hướng bóng đổ) =====================
// Camera nhìn xuống khoảng 52 độ nên không thấy bầu trời; chỉ cần màu ánh sáng/sương mù và hướng bóng đổ đổi theo đồng hồ.
function discTexture(soft) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const g = cv.getContext('2d'), grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  if (soft) { grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.35, 'rgba(255,255,255,.55)'); grd.addColorStop(1, 'rgba(255,255,255,0)'); }
  else { grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.62, 'rgba(255,255,255,1)'); grd.addColorStop(0.7, 'rgba(255,255,255,.35)'); grd.addColorStop(1, 'rgba(255,255,255,0)'); }
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const SOFT_DOT = discTexture(true);
// Các mốc trời theo giờ (5.5 giờ sáng -> 29.5 = 5.5 giờ sáng hôm sau): [giờ, độ tối, màu đỉnh trời, màu chân trời, màu nắng, cường độ nắng, cường độ ánh sáng nền]
const SKY_KEYS = [
  [5.5, 0.2, 0x6f84b8, 0xf0b088, 0xffc088, 1.5, 0.62], [7, 0, 0x6fa8e8, 0xcfe3f5, 0xfff0d0, 1.9, 0.7], [12, 0, 0x4f93e0, 0xbcd9f2, 0xfff6e0, 2.2, 0.78],
  [17, 0, 0x6aa0dc, 0xf0d9b0, 0xffe0b0, 1.9, 0.7], [19, 0.3, 0x3a4f8a, 0xf08a5a, 0xff9a60, 0.9, 0.5], [21, 0.85, 0x16204a, 0x3a4272, 0x8fa8ff, 0.6, 0.5],
  [23, 1, 0x101830, 0x242c52, 0x9bb2ff, 0.85, 0.62], [28, 1, 0x101830, 0x242c52, 0x9bb2ff, 0.85, 0.62], // đêm đủ sáng để nhìn đường và thao tác (trước đây quá tối) [29.5, 0.2, 0x6f84b8, 0xf0b088, 0xffc088, 1.5, 0.62],
].map(([h, dark, top, hor, sunC, sunI, hemiI]) => ({ h, dark, top: new THREE.Color(top), hor: new THREE.Color(hor), sunC: new THREE.Color(sunC), sunI, hemiI }));
const skyNow = { dark: 0, top: new THREE.Color(), hor: new THREE.Color(), sunC: new THREE.Color(), sunI: 2, hemiI: 0.75 };
function skyAt(hour) {
  let i = 0;
  while (i < SKY_KEYS.length - 2 && hour >= SKY_KEYS[i + 1].h) i++;
  const a = SKY_KEYS[i], b = SKY_KEYS[i + 1], f = Math.max(0, Math.min(1, (hour - a.h) / (b.h - a.h))), s = f * f * (3 - 2 * f);
  skyNow.dark = a.dark + (b.dark - a.dark) * s;
  skyNow.top.copy(a.top).lerp(b.top, s); skyNow.hor.copy(a.hor).lerp(b.hor, s); skyNow.sunC.copy(a.sunC).lerp(b.sunC, s);
  skyNow.sunI = a.sunI + (b.sunI - a.sunI) * s; skyNow.hemiI = a.hemiI + (b.hemiI - a.hemiI) * s;
  return skyNow;
}

// ===================== Bloom (chất lượng cao): nạp động để thiếu thư viện thì vẫn chơi được =====================
let composer = null, bloomPass = null;
async function setupBloom() {
  if (quality !== 'high' || composer) return;
  try {
    const [{ EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }] = await Promise.all([
      import('three/addons/postprocessing/EffectComposer.js'), import('three/addons/postprocessing/RenderPass.js'),
      import('three/addons/postprocessing/UnrealBloomPass.js'), import('three/addons/postprocessing/OutputPass.js'),
    ]);
    const w = window.innerWidth, h = window.innerHeight;
    const rt = new THREE.WebGLRenderTarget(w * pixelRatio, h * pixelRatio, { type: THREE.HalfFloatType, samples: 4 });
    const c = new EffectComposer(renderer, rt);
    c.setPixelRatio(pixelRatio); c.setSize(w, h);
    c.addPass(new RenderPass(scene, camera));
    bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.55, 0.7, 3);
    c.addPass(bloomPass);
    c.addPass(new OutputPass());
    composer = c;
  } catch (e) { console.warn('Không bật được bloom, dùng cách vẽ thường.', e); composer = null; bloomPass = null; }
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  if (composer) { composer.setPixelRatio(pixelRatio); composer.setSize(w, h); }
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  layoutMinimap();
}
window.addEventListener('resize', resize);

const world = buildWorld(scene, renderer, isTouch);
// đèn điểm cho ban đêm (ít hơn trên điện thoại)
// Chỉ vài đèn điểm thật sự phát sáng, luôn là những cột đèn gần người chơi nhất (khu nhà tù đã rộng hơn nhiều).
const lampLights = [];
for (let i = 0; i < (isTouch ? 4 : 8); i++) {
  const l = new THREE.PointLight(0xffd98a, 0, 20, 2);
  l.position.set(0, 3.4, 0);
  scene.add(l);
  lampLights.push(l);
}
let lampTimer = 0;
function assignLamps() {
  const near = world.lamps.map(([x, z]) => [x, z, (x - camFocus.x) ** 2 + (z - camFocus.z) ** 2]).sort((a, b) => a[2] - b[2]);
  lampLights.forEach((l, i) => { if (near[i]) l.position.set(near[i][0], 3.4, near[i][1]); });
}
updateGates(world, 0);

// ===================== Quản giáo: hình quạt tầm nhìn =====================
const guardCones = new Map();
// Hình quạt tầm nhìn được cắt theo tường (bắn tia mỗi khung hình) nên khớp với việc quản giáo thật sự nhìn thấy.
const CONE_N = 26;
function addCone(id) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((CONE_N + 2) * 3), 3));
  const idx = [];
  for (let i = 1; i <= CONE_N; i++) idx.push(0, i + 1, i);
  g.setIndex(idx);
  const cone = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
  cone.frustumCulled = false;
  scene.add(cone);
  guardCones.set(id, cone);
}
function updateCone(cone, e, range) {
  const pos = cone.geometry.attributes.position.array, half = RULES.guardFov / 2;
  pos[0] = 0; pos[1] = 0.1; pos[2] = 0;
  for (let i = 0; i <= CONE_N; i++) {
    const a = e.ry - half + (i / CONE_N) * RULES.guardFov, dx = Math.sin(a), dz = Math.cos(a);
    const d = rayDist(e.x, e.z, dx, dz, range);
    pos[(i + 1) * 3] = dx * d; pos[(i + 1) * 3 + 1] = 0.1; pos[(i + 1) * 3 + 2] = dz * d;
  }
  cone.geometry.attributes.position.needsUpdate = true;
}

// ===================== Đèn pha hải đăng (ban đêm) =====================
// Mỗi đèn: một vòng sáng tròn trên nền (đĩa phát sáng + viền) và một chùm sáng hình nón từ đỉnh tháp xuống vòng sáng
const beams = LIGHTS.map(() => {
  const N = 28, g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((N + 2) * 3), 3));
  const idx = []; for (let i = 1; i <= N; i++) idx.push(0, i + 1, i);
  g.setIndex(idx);
  const cone = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xfff1b0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }));
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ map: SOFT_DOT, color: 0xfff1b0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  const rim = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 48), new THREE.MeshBasicMaterial({ color: 0xfff6c8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  for (const m of [disc, rim]) m.rotation.x = -Math.PI / 2;
  for (const m of [cone, disc, rim]) { m.frustumCulled = false; m.visible = false; m.renderOrder = 1; scene.add(m); }
  return { cone, disc, rim };
});
let lcSync = { lc: 0, at: 0 };
function updateBeams(on, k) {
  const t = lcSync.lc + (performance.now() / 1000 - lcSync.at);
  LIGHTS.forEach((l, i) => {
    const b = beams[i];
    const vis = on && k > 0.05;
    b.cone.visible = b.disc.visible = b.rim.visible = vis;
    if (!vis) return;
    const s = spotAt(l, t), R = LIGHTHOUSE.radius, pos = b.cone.geometry.attributes.position.array, N = 28;
    b.disc.position.set(s.x, 0.14, s.z); b.disc.scale.setScalar(R);
    b.rim.position.set(s.x, 0.15, s.z); b.rim.scale.setScalar(R);
    pos[0] = l.x; pos[1] = 7.2; pos[2] = l.z; // đỉnh nón ở đầu đèn trên tháp
    for (let j = 0; j <= N; j++) { const a = (j / N) * Math.PI * 2; pos[(j + 1) * 3] = s.x + Math.cos(a) * R * 0.92; pos[(j + 1) * 3 + 1] = 0.14; pos[(j + 1) * 3 + 2] = s.z + Math.sin(a) * R * 0.92; }
    b.cone.geometry.attributes.position.needsUpdate = true;
    b.cone.material.opacity = 0.07 * k;
    b.disc.material.opacity = (s.moving ? 0.5 : 0.62) * k;
    b.rim.material.opacity = 0.55 * k;
  });
}

// ===================== Thực thể =====================
const ents = new Map();
const myId = { v: null };

function addEntity(id, kind, name, x, z, ry, num = '') {
  const group = makeCharacter(kind, id, num);
  group.position.set(x, 0, z);
  scene.add(group);
  const cat = kind === 'cat';
  const tag = makeSprite(0.9);
  const bg = kind === 'guard' ? 'rgba(30,60,120,.85)' : kind === 'dealer' ? 'rgba(130,100,10,.9)' : cat ? 'rgba(150,80,20,.9)' : 'rgba(0,0,0,.62)';
  drawText(tag, [name], { font: 'bold 34px system-ui, sans-serif', bg, padX: 16, padY: 8, radius: 14 });
  const tagY = cat ? 1.15 : 2.6, bubbleY = cat ? 1.5 : 3.0;
  tag.position.set(0, tagY, 0);
  group.add(tag);
  const bubble = makeSprite(1.05);
  bubble.center.set(0.5, 0); // neo đáy bong bóng để nhiều dòng chữ không đè lên tên
  bubble.position.set(0, bubbleY, 0);
  bubble.visible = false;
  group.add(bubble);
  let alertIcon = null;
  if (kind === 'guard') { alertIcon = emojiSprite('❗'); alertIcon.position.set(0, 3.2, 0); alertIcon.visible = false; group.add(alertIcon); }
  const e = { id, kind, group, tag, bubble, alertIcon, x, z, ry, tx: x, tz: z, try: ry, buf: [], ivl: 0.07, fx: null, stepDist: 0, lx: x, lz: z, flags: 0, bubbleT: 0, phase: Math.random() * 6, alert: 0, speed: 0 };
  ents.set(id, e);
  return e;
}
function removeEntity(id) {
  const e = ents.get(id);
  if (!e) return;
  scene.remove(e.group);
  ents.delete(id);
}
function say(id, text, secs = 5) {
  const e = ents.get(id);
  if (!e) return;
  // chữ to, đậm, viền tối để dễ đọc từ xa
  drawText(e.bubble, wrap(text, 20), { font: '800 40px system-ui, "Segoe UI", sans-serif', fg: '#0b0b0b', bg: 'rgba(255,255,255,.98)', padX: 20, padY: 12, radius: 18, border: '#1b1b1b' });
  e.bubble.visible = true;
  e.bubbleT = secs;
}
const lerpAngle = (a, b, t) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};
const meRing = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.78, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }));
meRing.rotation.x = -Math.PI / 2;
scene.add(meRing);

// ===================== Bom =====================
const bombs = new Map();
const blasts = [];
const flights = []; // vật bay theo đường parabol: bom, đá ném
const scorches = []; // vết cháy xém trên nền sau vụ nổ, mờ dần
const BOMB_FLIGHT = 0.45;
function addBomb(id, x, z, fuse, ox, oz) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 12), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5 }));
  body.position.y = 0.3; body.castShadow = true;
  const spark = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff6a00 }));
  spark.position.set(0.1, 0.68, 0);
  g.add(body, spark);
  const flying = ox !== undefined && Math.hypot(x - ox, z - oz) > 0.8;
  g.position.set(flying ? ox : x, flying ? 1.1 : 0, flying ? oz : z);
  scene.add(g);
  const b = { g, spark, t: fuse, fly: null };
  if (flying) { b.fly = { ox, oz, x, z, t: 0, dur: Math.min(0.7, BOMB_FLIGHT + Math.hypot(x - ox, z - oz) * 0.03) }; }
  bombs.set(id, b);
}
// Đá ném đánh lạc hướng: viên đá nhỏ bay một vòng cung rồi nảy
function addRockFlight(ox, oz, x, z) {
  const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.13), new THREE.MeshStandardMaterial({ color: 0x8d8d8d, roughness: 1 }));
  m.castShadow = true; m.position.set(ox, 1.3, oz); scene.add(m);
  flights.push({ m, ox, oz, x, z, t: 0, dur: 0.4 + Math.hypot(x - ox, z - oz) * 0.025 });
}
function explode(id, x, z) {
  const b = bombs.get(id);
  if (b) { scene.remove(b.g); bombs.delete(id); }
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 16), new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.85, depthWrite: false }));
  m.position.set(x, 0.8, z);
  scene.add(m);
  const light = new THREE.PointLight(0xff9a40, 400, 30, 2);
  light.position.set(x, 2, z);
  scene.add(light);
  // tia chớp sáng chói + sóng xung kích lan trên mặt đất
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: SOFT_DOT, color: 0xfff0c0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false }));
  flash.position.set(x, 1.2, z); flash.scale.setScalar(2); scene.add(flash);
  const wave = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), new THREE.MeshBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  wave.rotation.x = -Math.PI / 2; wave.position.set(x, 0.12, z); scene.add(wave);
  blasts.push({ m, light, flash, wave, t: 0 });
  // vết cháy xém trên nền (mờ dần sau ~25 giây)
  const sc = new THREE.Mesh(new THREE.CircleGeometry(2.4, 28), new THREE.MeshBasicMaterial({ color: 0x0c0a08, transparent: true, opacity: 0.55, depthWrite: false }));
  sc.rotation.x = -Math.PI / 2; sc.position.set(x, 0.065, z); scene.add(sc);
  scorches.push({ m: sc, t: 0 });
  if (scorches.length > 8) { const o = scorches.shift(); scene.remove(o.m); o.m.geometry.dispose(); o.m.material.dispose(); }
  // khói bốc lên + mảnh vụn + tàn lửa
  spawn(x, 0.4, z, 26, 0x4a4a4a, 2.2, 3.2, 2.2);
  spawn(x, 0.3, z, 18, 0x8a8a8a, 3.4, 5.2, 1.6);
  const d = Math.hypot(x - me.x, z - me.z);
  if (d < 40) shake = Math.max(shake, 1 - d / 40);
}

// ===================== Trạng thái =====================
const me = { x: 0, z: 0, ry: 0, jail: 0, labor: 0, boost: 0, en: 100, stun: 0 };
let joined = false;
let snap = null;
let ws = null;
let seq = 0;
let zoom = isTouch ? 1.35 : 1;
// Góc nhìn: 'top' = camera cố định trên cao (mặc định, thấy rõ hình quạt tầm nhìn quản giáo); 'third' = ngôi thứ ba xoay được (kiểu Roblox)
let camMode = 'top', camYaw = 0, camPitch = 0.5, settingsOpen = false;
let intentionalUnlock = false, lastUnlockAt = 0, mouseHintShown = null;
try { const cm = localStorage.getItem('ditu-cam'); if (cm === 'top' || cm === 'third') camMode = cm; } catch { /* bỏ qua */ }
let shake = 0;
let phasesSeen = 0;
let arrowsOn = true;
let lastPhase = -1;
let actBlocked = false;
let shopOpen = false;
let lastDet = 0;
let curEvent = null;
let sid = '', myName = '', reconnecting = false, reconnectTries = 0;
let queuedNow = false, kicked = false, rejected = false, connectTries = 0; // hàng chờ khi phòng đầy / bị mời ra / hàng chờ đầy / số lần thử khi máy chủ đang ngủ

function send(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }

// ===================== Mạng =====================
function connect(name) {
  myName = name;
  kicked = false;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const sock = new WebSocket(`${proto}://${location.host}/ws`);
  ws = sock;
  let opened = false;
  if (!reconnecting && !connectTries) { $('connmsg').textContent = 'Đang kết nối...'; $('enter').disabled = true; }
  // máy chủ miễn phí có thể đang "ngủ" và mất tới ~1 phút để thức dậy
  const wake = setTimeout(() => { if (ws === sock && !opened && !reconnecting) $('connmsg').textContent = 'Máy chủ miễn phí đang thức dậy, có thể mất tới 1 phút. Xin đợi...'; }, 6000);
  sock.onopen = () => { opened = true; clearTimeout(wake); connectTries = 0; sock.send(JSON.stringify({ t: 'join', name, sid })); };
  sock.onmessage = (ev) => { try { onMsg(JSON.parse(ev.data)); } catch (e) { console.error(e); } };
  sock.onclose = () => {
    clearTimeout(wake);
    if (ws !== sock) return;
    if (kicked) return; // bị mời ra vì AFK: đã có thông báo, không tự vào lại
    if (rejected) { rejected = false; $('enter').disabled = false; return; } // hàng chờ đầy: đã có thông báo
    if (queuedNow && !joined) { queuedNow = false; $('leaveq').classList.add('hidden'); document.title = 'Đi Tù Online'; $('connmsg').textContent = 'Mất kết nối khi đang chờ. Hãy bấm Nhập trại để xếp hàng lại.'; $('enter').disabled = false; return; }
    if (!opened && !joined && !reconnecting && connectTries < 4) { // chưa kết nối được lần nào: thử lại vài lần (máy chủ có thể đang thức dậy)
      connectTries++;
      $('connmsg').textContent = `Đang đánh thức máy chủ... (lần thử ${connectTries + 1}/5)`;
      setTimeout(() => { if (ws === sock) connect(myName); }, 3000);
      return;
    }
    connectTries = 0;
    if (joined || reconnecting) {
      // tự động thử vào lại (server giữ chỗ 60 giây)
      joined = false;
      if (sid && reconnectTries < 25) {
        reconnecting = true; reconnectTries++;
        showBanner('Mất kết nối, đang thử vào lại...', 'escape', 0);
        setTimeout(() => connect(myName), 2000);
      } else { reconnecting = false; showBanner('Mất kết nối với máy chủ.\nHãy tải lại trang.', 'escape', 0); }
    } else { $('connmsg').textContent = 'Không kết nối được máy chủ. Thử lại sau.'; $('enter').disabled = false; }
  };
}

// Xoá toàn bộ nhân vật/quản giáo cũ (khi vào lại để dựng lại từ đầu)
function resetEntities() {
  for (const id of [...ents.keys()]) removeEntity(id);
  for (const c of guardCones.values()) scene.remove(c);
  guardCones.clear();
  for (const b of bombs.values()) scene.remove(b.g);
  bombs.clear();
}

const NPC_KIND = { guard: 'guard', inmate: 'npc', dealer: 'dealer', cat: 'cat' };
const NPC_NAME = { guard: 'Quản giáo', inmate: 'Tù nhân', dealer: 'Tày Scam', cat: 'cathehe' };

function onMsg(m) {
  switch (m.t) {
    case 'queue': { // phòng đầy: đang xếp hàng chờ, server báo vị trí
      queuedNow = true;
      const txt = `Phòng đang đầy (${m.online}/${m.cap} người chơi). Bạn là người thứ ${m.pos} trong hàng chờ (${m.total} người đang chờ). Hãy để trang này mở: bạn sẽ được vào tự động khi có chỗ.`;
      document.title = `(#${m.pos}) Đi Tù Online - hàng chờ`;
      if (reconnecting) showBanner(`Phòng đang đầy. Bạn ở vị trí #${m.pos} trong hàng chờ,\nsẽ được vào lại tự động.`, 'escape', 0);
      else { $('connmsg').textContent = txt; $('leaveq').classList.remove('hidden'); $('enter').disabled = true; }
      break;
    }
    case 'queuefull': rejected = true; $('connmsg').textContent = 'Hàng chờ đang đầy. Hãy thử lại sau ít phút.'; break;
    case 'kicked': kicked = true; joined = false; reconnecting = false; showBanner('Bạn bị mời ra khỏi phòng vì đứng yên quá lâu\nkhi có người đang chờ. Tải lại trang để xếp hàng vào lại.', 'escape', 0); break;
    case 'welcome': {
      if (queuedNow) { queuedNow = false; $('leaveq').classList.add('hidden'); document.title = 'Đi Tù Online'; setTimeout(() => { toast('🎉 Đến lượt bạn! Chúc chơi vui.', 'good'); sfx('good', 0.8); }, 400); }
      resetEntities();
      sid = m.sid || sid;
      if (reconnecting) { reconnecting = false; reconnectTries = 0; $('banner').classList.add('hidden'); }
      myId.v = m.id;
      const mine = m.players.find((p) => p.id === m.id);
      me.x = mine.x; me.z = mine.z;
      for (const p of m.players) addEntity(p.id, 'player', `TN-${p.num} ${p.name}`, p.x, p.z, p.ry, p.num);
      for (const n of m.npcs) addEntity(n.id, NPC_KIND[n.kind], NPC_NAME[n.kind], n.x, n.z, n.ry);
      for (const n of m.npcs.filter((n) => n.kind === 'guard')) addCone(n.id);
      joined = true;
      $('start').classList.add('hidden');
      $('hud').classList.remove('hidden');
      if (isTouch) $('touch').classList.remove('hidden');
      layoutMinimap();
      break;
    }
    case 'join': addEntity(m.p.id, 'player', `TN-${m.p.num} ${m.p.name}`, m.p.x, m.p.z, m.p.ry, m.p.num); break;
    case 'leave': removeEntity(m.id); break;
    case 's': onSnapshot(m); break;
    case 'say': {
      say(m.id, m.m, m.y ? 2.5 : 3); // lời thoại NPC/quản giáo hiện ngắn hơn (trước 4-5 giây) cho đỡ rối màn hình
      const e = ents.get(m.id);
      if (e && e.kind === 'cat') sfxAt('meow', e.x, e.z, me.x, me.z, 26);
      else if (e && e.kind !== 'player') voiceAt(e.kind, m.m, e.x, e.z, me.x, me.z, !!m.y);
      break;
    }
    case 'chat': say(m.id, m.m, 6); addChat(`TN-${m.num} ${m.name}`, m.m); break;
    case 'sys': addChat(null, m.m); break;
    case 'toast': toast(m.m, m.kind); if (m.kind === 'good') sfx('good', 0.7); else if (m.kind === 'warn') sfx('bad', 0.6); break;
    case 'phase': phasesSeen++; break; // banner được hiện khi snapshot báo đổi giai đoạn
    case 'tp': me.x = m.x; me.z = m.z; camFocus.set(m.x, 0, m.z); break;
    case 'caught':
      forceCloseMinigame(); closeShop();
      toast(m.kind === 'office' ? `Kiệt sức! Bị nhốt ${m.secs} giây.` : `Bị bắt vì ${m.why}! Biệt giam ${m.secs} giây.`, 'warn');
      sfx('siren');
      captureFx(m.kind === 'office' ? '😵 KIỆT SỨC' : '🚔 BỊ BẮT!', m.kind === 'office' ? 'Bị đưa về phòng quản giáo' : m.why);
      break;
    case 'anim': { const e = ents.get(m.id); if (e) e.fx = { k: m.k, t: 0 }; break; }
    case 'rockfly': addRockFlight(m.ox, m.oz, m.x, m.z); break;
    case 'win': showBanner(m.kind === 'release' ? 'MÃN HẠN TÙ!\nBạn đã cải tạo tốt và được trả tự do.' : 'VƯỢT NGỤC THÀNH CÔNG!\nBạn đã trốn thoát khỏi trại giam.', m.kind, 5000); sfx('win'); break;
    case 'lb': renderLb(m); break;
    case 'snd':
      if (m.self) sfx(m.k);
      else { sfxAt(m.k, m.x, m.z, me.x, me.z, m.k === 'boom' ? 70 : 32); if (Math.hypot(m.x - me.x, m.z - me.z) < 45) fxAt(m.k, m.x, m.z); }
      break;
    case 'bomb': addBomb(m.id, m.x, m.z, m.fuse, m.ox, m.oz); break;
    case 'boom': explode(m.id, m.x, m.z); break;
    case 'mg': openMinigame(m); break;
    case 'hilores': minigameEvent(m); break; // kết quả ván bài lớn/nhỏ do server quyết định
    case 'mgx': forceCloseMinigame(); break;
    case 'shop': openShop(); break;
    case 'event': toast(m.e === 'rain' ? '🌧️ Trời mưa.' : m.e === 'blackout' ? '🔦 Cúp điện!' : '🚨 Khám buồng đột xuất!', 'phase'); sfx(m.e === 'inspect' ? 'whistle' : 'alarm', 0.6); break;
  }
}

function openMinigame(m) {
  closeShop(); releaseMouse(); // minigame cần con trỏ chuột
  startMinigame(m, {
    touch: isTouch,
    send,
    onDone: (score, cancelled) => {
      if (cancelled) send({ t: 'mgcancel' });
      else send({ t: 'mgdone', token: m.token, score: +score.toFixed(3) });
      actBlocked = keys.has('KeyE') || keys.has('Space') || touchAct; // phải nhả phím rồi mới bấm lại được
    },
  });
}

// Nội suy có bộ đệm: mỗi gói tin của người/NPC khác được cất vào e.buf, rồi vẽ chậm hơn thực tế một khoảng ngắn
// (xấp xỉ 1,25 lần khoảng cách giữa các gói) để luôn có hai mẫu để nội suy ở giữa, không đoán trước nên không bao giờ "vọt quá".
function track(e, x, z, ry, now) {
  const last = e.buf[e.buf.length - 1];
  if (last) {
    if (Math.hypot(x - last.x, z - last.z) > 8) e.buf.length = 0; // dịch chuyển xa: nhảy thẳng, bỏ lịch sử
    else e.ivl += (Math.min(0.5, Math.max(0.02, now - last.t)) - e.ivl) * 0.3;
  }
  e.buf.push({ t: now, x, z, ry });
  if (e.buf.length > 24) e.buf.shift();
}

// Vị trí hiển thị của thực thể khác tại thời điểm nowS (giây)
function interpolate(e, nowS) {
  const b = e.buf;
  if (!b.length) return;
  const rt = nowS - Math.max(0.1, e.ivl * 1.25);
  while (b.length > 2 && b[1].t <= rt) b.shift();
  let x, z, ry;
  if (b.length === 1 || rt <= b[0].t) ({ x, z, ry } = b[0]);
  else if (rt >= b[1].t) ({ x, z, ry } = b[1]);
  else { const f = (rt - b[0].t) / (b[1].t - b[0].t); x = b[0].x + (b[1].x - b[0].x) * f; z = b[0].z + (b[1].z - b[0].z) * f; ry = lerpAngle(b[0].ry, b[1].ry, f); }
  e.x = x; e.z = z; e.ry = ry;
}

// Dự đoán phía client + đối chiếu với server: lưu lại các lệnh đã gửi (seq), khi nhận vị trí server (đã xử lý tới seq nào đó)
// thì chạy lại các lệnh chưa được xác nhận trên vị trí đó để biết vị trí "đúng" hiện giờ, rồi chỉ sửa phần lệch thật sự.
const inputHist = [];
function predictFromServer(m) {
  while (inputHist.length && inputHist[0].seq <= m.seq) inputHist.shift();
  const tmp = { x: m.x, z: m.z, labor: me.labor };
  const now = performance.now();
  for (let i = 0; i < inputHist.length; i++) {
    const h = inputHist[i];
    let dur = Math.min(0.4, ((i + 1 < inputHist.length ? inputHist[i + 1].t : now) - h.t) / 1000);
    const sp = moveSpeed({ boost: me.boost, en: me.en, sneak: h.sneak, run: h.run });
    while (dur > 1e-4) { const st = Math.min(dur, 1 / 30); if (h.mx || h.mz) stepMove(tmp, h.mx, h.mz, st, sp); dur -= st; }
  }
  return tmp;
}

let meSlow = {}; // thông tin ít đổi, server chỉ gửi khi thay đổi (me2)
function onSnapshot(s) {
  if (s.me2) meSlow = s.me2;
  s.me = Object.assign({}, s.me, meSlow);
  snap = s;
  if (s.lc !== undefined) lcSync = { lc: s.lc, at: performance.now() / 1000 };
  const nowT = performance.now() / 1000;
  for (const [id, x, z, ry, f] of s.p) {
    const e = ents.get(id);
    if (!e) continue;
    if (id === myId.v) { e.flags = f; me.codeFlags = f & 0xf0; continue; } // bản thân: vị trí do dự đoán, không nội suy
    track(e, x / 10, z / 10, ry / 20, nowT);
    e.try = ry / 20; e.flags = f;
  }
  for (const [id, x, z, ry, al] of s.n) {
    const e = ents.get(id);
    if (!e) continue;
    track(e, x / 10, z / 10, ry / 20, nowT);
    e.try = ry / 20; e.alert = al;
    if (e.kind === 'npc') e.flags = al; // tù nhân NPC: cờ hoạt động giống người chơi
  }
  const m = s.me;
  const d = Math.hypot(m.x - me.x, m.z - me.z);
  me.jail = m.jail; me.labor = m.labor; me.boost = m.boost; me.en = m.en; me.stun = m.stun;
  if (d > 3 || m.jail > 0) { me.x = m.x; me.z = m.z; inputHist.length = 0; } // dịch chuyển / bị giam: theo server hoàn toàn
  else {
    // đối chiếu: lệch nhỏ thì bỏ qua (tránh giật), lệch vừa thì kéo dần, lúc đứng yên thì hội tụ về vị trí đúng
    const t = predictFromServer(m), ex = t.x - me.x, ez = t.z - me.z, err = Math.hypot(ex, ez);
    if (err > 2.5) { me.x = t.x; me.z = t.z; }
    else if (err > 0.3) { me.x += ex * 0.25; me.z += ez * 0.25; }
    else if (!inputVec().moving && err > 0.02) { me.x += ex * 0.3; me.z += ez * 0.3; }
  }
  if (s.ev !== curEvent) { curEvent = s.ev; setRain(curEvent === 'rain'); }
  if (s.ph !== lastPhase) {
    if (lastPhase === -1) phasesSeen = 0;
    lastPhase = s.ph;
    setPhaseMusic(s.ph);
    showPhaseBanner(s.ph);
  }
  if (m.det > 0.6 && lastDet <= 0.6) sfx('alarm', 0.8);
  lastDet = m.det;
  if (m.jail > 0) closeShop();
  updateHud(s);
}

// ===================== HUD =====================
let digPct = 0, digOpen = false, shopKey = '', itemsKey = '', stockKey = '';

// Thông báo giờ sinh hoạt ở giữa phía trên màn hình mỗi khi chuyển giai đoạn
let phaseBannerTimer = 0;
function showPhaseBanner(ph) {
  const el = $('phasebanner');
  el.querySelector('.pi').textContent = PHASE_ICON[ph];
  el.querySelector('.pn').textContent = PHASES[ph].name.toUpperCase();
  el.querySelector('.ph').textContent = PHASES[ph].hint;
  el.classList.remove('show'); void el.offsetWidth;
  el.classList.toggle('night', ph === NIGHT_PHASE);
  el.classList.add('show');
  clearTimeout(phaseBannerTimer);
  phaseBannerTimer = setTimeout(() => el.classList.remove('show'), 5500);
  sfx('good', 0.5);
}

// Đồng hồ ngày đêm ở góc phải: vòng 24 giờ, mặt trời / mặt trăng chạy theo giờ trong ngày
const dialCv = $('dialc'), dialCtx = dialCv.getContext('2d');
let dialKey = '';
function drawDial(s) {
  const hour = clockHour(s.ph, s.pt), night = s.ph === NIGHT_PHASE;
  const hh = Math.floor(hour) % 24, mm = Math.floor((hour % 1) * 60);
  const key = `${hh}:${mm}:${night ? 1 : 0}:${s.ph}`;
  if (key === dialKey) return;
  dialKey = key;
  const g = dialCtx, S = dialCv.width, R = S * 0.42, cx = S / 2, cy = S / 2;
  const ang = (h) => ((h - 12) / 24) * Math.PI * 2 - Math.PI / 2;
  g.clearRect(0, 0, S, S);
  g.beginPath(); g.arc(cx, cy, R, ang(6), ang(18)); g.lineTo(cx, cy); g.closePath(); g.fillStyle = '#5fa8e8'; g.fill(); // ban ngày (6h-18h)
  g.beginPath(); g.arc(cx, cy, R, ang(18), ang(30)); g.lineTo(cx, cy); g.closePath(); g.fillStyle = '#141c3a'; g.fill(); // ban đêm
  g.lineWidth = S * 0.035; g.strokeStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1.5;
  for (const [a] of [[5.5], [6], [7], [12], [17], [19], [21]]) { const t = ang(a); g.beginPath(); g.moveTo(cx + Math.cos(t) * R * 0.72, cy + Math.sin(t) * R * 0.72); g.lineTo(cx + Math.cos(t) * R, cy + Math.sin(t) * R); g.stroke(); }
  g.fillStyle = night ? '#9fb4ff' : '#10305a'; g.font = `bold ${S * 0.16}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, cx, cy);
  const t = ang(hour), mx = cx + Math.cos(t) * (R + S * 0.02), my = cy + Math.sin(t) * (R + S * 0.02);
  g.beginPath(); g.arc(mx, my, S * 0.1, 0, Math.PI * 2); g.fillStyle = night ? '#e8ecff' : '#ffd23f'; g.fill(); g.lineWidth = 2; g.strokeStyle = '#fff'; g.stroke();
  g.font = `${S * 0.13}px system-ui, "Segoe UI Emoji"`; g.fillStyle = '#000'; g.fillText(night ? '🌙' : '☀️', mx, my + 1);
  $('dialstate').textContent = night ? '🌙 BAN ĐÊM' : '☀️ BAN NGÀY';
  $('dialstate').className = night ? 'night' : 'day';
  $('dialphase').textContent = PHASES[s.ph].name;
}

function updateHud(s) {
  drawDial(s);
  const ph = PHASES[s.ph];
  $('phase').textContent = `Ngày ${s.day} · ${ph.name}`;
  $('clock').textContent = `Còn ${s.pt} giây`;
  $('hint').textContent = ph.hint;
  const m = s.me;
  const g = $('goal');
  if (m.goal && m.jail <= 0) { g.classList.remove('hidden'); g.textContent = `➜ Mục tiêu: ${m.goal.label}`; } else g.classList.add('hidden');
  $('hpbar').style.width = `${m.hp}%`; $('hptext').textContent = `${m.hp}/${RULES.hpMax}`;
  $('enbar').style.width = `${m.en}%`; $('entext').textContent = `${m.en}/${ENERGY.max}`;
  $('ptsbar').style.width = `${Math.min(100, (m.pts / RULES.releasePoints) * 100)}%`;
  $('ptstext').textContent = `${m.pts}/${RULES.releasePoints}`;
  $('jack').textContent = `💰 ${m.jack} Jack`;
  $('labor').textContent = `🔨 ${m.labor} ca lao động`;
  // Chỉ dựng lại DOM khi nội dung đổi (dựng lại 15 lần/giây gây giật hình)
  const ik = Object.keys(ITEM_NAMES).map((k) => (m.items[k] ? 1 : 0)).join('');
  if (ik !== itemsKey) {
    itemsKey = ik;
    const itemsEl = $('items');
    itemsEl.innerHTML = '';
    for (const k of Object.keys(ITEM_NAMES)) {
      const d = document.createElement('span');
      d.className = 'item' + (m.items[k] ? ' on' : '');
      d.textContent = ITEM_NAMES[k];
      itemsEl.appendChild(d);
    }
  }
  const sk = `${m.stock.reddog}|${m.stock.bomb}|${m.boost}|${m.rock}|${curEvent}|${m.chased}|${m.warn}|${m.fc}`;
  if (sk !== stockKey) {
    stockKey = sk;
    const st = $('stock');
    st.innerHTML = '';
    const mk = (label, n, cls, fn) => { const d = document.createElement('span'); d.className = `stock ${n > 0 ? cls : 'off'}`; d.textContent = label; if (n > 0) d.addEventListener('click', fn); st.appendChild(d); };
    mk(`🥤 Reddog x${m.stock.reddog} [R]`, m.stock.reddog, '', () => send({ t: 'drink' }));
    mk(`💣 Bom x${m.stock.bomb} [giữ Q]`, m.stock.bomb, '', () => {});
    if (m.boost > 0) { const d = document.createElement('span'); d.className = 'stock boost'; d.textContent = `⚡ Tăng lực ${m.boost}s`; st.appendChild(d); }
    { const d = document.createElement('span'); d.className = `stock ${m.rock > 0 ? 'off' : ''}`; d.textContent = m.rock > 0 ? `🪨 Đá (${m.rock}s) [giữ T]` : '🪨 Ném đá [giữ T]'; st.appendChild(d); }
    if (curEvent) { const d = document.createElement('span'); d.className = 'stock boost'; d.textContent = curEvent === 'rain' ? '🌧️ Mưa' : curEvent === 'blackout' ? '🔦 Cúp điện' : '🚨 Khám buồng'; st.appendChild(d); }
    if (m.chased) { const d = document.createElement('span'); d.className = 'stock boost'; d.textContent = '🏃 ĐANG BỊ RƯỢT!'; st.appendChild(d); }
    if (m.warn > 0) { const d = document.createElement('span'); d.className = 'stock boost'; d.textContent = m.warn >= RULES.warnWatch ? `⚠️ Bị để mắt (${m.warn} cảnh cáo)` : `⚠️ Cảnh cáo ${m.warn}/${RULES.warnWatch}`; st.appendChild(d); }
    if (m.fc > 0) { const d = document.createElement('span'); d.className = 'stock boost'; d.textContent = `✂️ Dây thép ${m.fc}/${RULES.fenceCuts}`; st.appendChild(d); }
  }
  digPct = s.dig[0]; digOpen = !!s.dig[1];
  $('digrow').textContent = digOpen ? 'Đường hầm: ĐÃ THÔNG!' : (digPct > 0 ? `Đường hầm: ${digPct}%` : '');
  setDigProgress(world, digPct, digOpen);
  setFenceCuts(world, m.fc || 0);
  updateGates(world, m.labor);

  const pr = $('prompt');
  if (m.near && m.jail <= 0 && !minigameActive() && !shopOpen) {
    pr.classList.remove('hidden');
    pr.classList.toggle('bad', !m.near.ok);
    const key = isTouch ? 'Nút E' : '[E]';
    const st2 = STATIONS.find((x) => x.id === m.near.id);
    const verb = st2 && (st2.mg || st2.kind === 'shop') ? `Nhấn ${key}` : `Giữ ${key}`;
    $('prtext').textContent = m.near.ok ? `${verb}: ${m.near.label}` : `${m.near.label} — ${m.near.why}`;
    $('holdbar').style.width = m.hold === -1 ? `${digPct}%` : `${Math.round(m.hold * 100)}%`;
  } else pr.classList.add('hidden');

  const det = $('detect');
  if (m.det > 0.02) { det.classList.remove('hidden'); det.querySelector('i').style.width = `${Math.round(m.det * 100)}%`; }
  else det.classList.add('hidden');

  const jail = $('jail');
  if (m.jail > 0) { jail.classList.remove('hidden'); $('jailsecs').textContent = m.jail; $('jailttl').textContent = m.jk === 'office' ? 'BỊ NHỐT Ở PHÒNG QUẢN GIÁO' : 'BIỆT GIAM'; $('jailhint').textContent = 'Phải chờ hết thời gian, không thể rút ngắn án'; } else jail.classList.add('hidden');

  if (shopOpen) renderShop(m);
}

function toast(text, kind = 'info') {
  const box = $('toasts');
  const d = document.createElement('div');
  d.className = `toast ${kind}`;
  d.textContent = text;
  box.appendChild(d);
  while (box.children.length > 4) box.removeChild(box.firstChild);
  setTimeout(() => d.remove(), 5000);
}

// Cảnh bị bắt: màn hình đỏ sẫm + chữ lớn che phần dịch chuyển tức thời vào biệt giam, rồi mờ dần
const fxOverlay = document.createElement('div');
Object.assign(fxOverlay.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '60', display: 'grid', placeItems: 'center', opacity: '0', transition: 'opacity .2s', color: '#fff', textAlign: 'center', fontFamily: 'system-ui, sans-serif', background: 'radial-gradient(ellipse at center, rgba(120,0,0,.5), rgba(0,0,0,.93))' });
fxOverlay.innerHTML = '<div><div class="fxt" style="font-size:clamp(34px,7vw,72px);font-weight:900;letter-spacing:2px;text-shadow:0 4px 20px #000"></div><div class="fxs" style="font-size:clamp(14px,2.4vw,22px);opacity:.85;margin-top:8px"></div></div>';
document.body.appendChild(fxOverlay);
let fxTimer = 0;
function captureFx(title, sub) {
  fxOverlay.querySelector('.fxt').textContent = title;
  fxOverlay.querySelector('.fxs').textContent = sub || '';
  fxOverlay.style.transition = 'opacity .2s'; fxOverlay.style.opacity = '1';
  shake = Math.max(shake, 0.45);
  clearTimeout(fxTimer);
  fxTimer = setTimeout(() => { fxOverlay.style.transition = 'opacity .8s'; fxOverlay.style.opacity = '0'; }, 1100);
}

function addChat(who, text) {
  const log = $('chatlog');
  const d = document.createElement('div');
  if (who) { const b = document.createElement('b'); b.textContent = who + ': '; d.appendChild(b); d.appendChild(document.createTextNode(text)); }
  else { d.className = 'sys'; d.textContent = text; }
  log.appendChild(d);
  while (log.children.length > 7) log.removeChild(log.firstChild);
  setTimeout(() => d.remove(), 30000);
}

function renderLb(m) {
  $('online').textContent = `${m.online} online`;
  const ol = $('lb');
  ol.innerHTML = '';
  for (const r of m.list) {
    const li = document.createElement('li');
    li.textContent = `${r.name} `;
    const b = document.createElement('b');
    b.textContent = r.score;
    li.appendChild(b);
    if (r.rel || r.esc) li.appendChild(document.createTextNode(` (${r.rel ? '🏁' + r.rel : ''}${r.esc ? '🚨' + r.esc : ''})`));
    ol.appendChild(li);
  }
}

let bannerTimer = 0;
function showBanner(text, cls, ms) {
  const b = $('banner');
  b.textContent = text;
  b.className = cls;
  clearTimeout(bannerTimer);
  if (ms) bannerTimer = setTimeout(() => b.classList.add('hidden'), ms);
}

// ===================== Chợ đen =====================
function openShop() { releaseMouse(); shopOpen = true; $('shop').classList.remove('hidden'); shopKey = ''; if (snap) renderShop(snap.me); }
function closeShop() { shopOpen = false; $('shop').classList.add('hidden'); }
function renderShop(m) {
  const key = `${m.jack}|${m.buys}|${m.items.rope ? 1 : 0}${m.items.torch ? 1 : 0}`;
  if (key === shopKey) return;
  shopKey = key;
  $('shopjack').textContent = `Bạn đang có: 💰 ${m.jack} Jack`;
  const list = $('shoplist');
  list.innerHTML = '';
  for (const it of SHOP) {
    const row = document.createElement('div');
    row.className = 'shopitem';
    const owned = (it.id === 'rope' || it.id === 'torch') && m.items[it.id];
    const limited = it.limit && m.buys >= it.limit && it.id === 'bomb';
    row.innerHTML = `<div class="ico">${it.icon}</div><div class="txt"><b></b><span></span></div>`;
    row.querySelector('b').textContent = `${it.name}${it.id === 'bomb' ? ` (${m.buys}/${it.limit} hôm nay)` : ''}`;
    row.querySelector('span').textContent = it.desc;
    const btn = document.createElement('button');
    btn.textContent = owned ? 'Đã có' : `${it.price} Jack`;
    btn.disabled = owned || limited || m.jack < it.price;
    btn.addEventListener('click', () => { sfx('click'); send({ t: 'buy', id: it.id }); });
    const pp = Math.ceil(it.price * RULES.premiumMul);
    const pbtn = document.createElement('button');
    pbtn.className = 'premium';
    pbtn.title = `Trả thêm 30% phí "uy tín": tỉ lệ bị lừa giảm còn ${Math.round(RULES.premiumScam * 100)}%`;
    pbtn.textContent = owned ? '—' : `Uy tín ${pp}`;
    pbtn.disabled = owned || limited || m.jack < pp;
    pbtn.addEventListener('click', () => { sfx('click'); send({ t: 'buy', id: it.id, premium: true }); });
    const col = document.createElement('div'); col.className = 'btncol'; col.append(btn, pbtn);
    row.appendChild(col);
    list.appendChild(row);
  }
}
$('shopclose').addEventListener('click', closeShop);

// ===================== Điều khiển =====================
const keys = new Set();
let typing = false;
let joy = { x: 0, z: 0 };
let touchAct = false;

window.addEventListener('keydown', (e) => {
  if (!joined) { if (e.key === 'Enter' && document.activeElement === $('name')) $('enter').click(); return; }
  if (minigameActive()) return;
  if (typing) {
    if (e.key === 'Enter') {
      const v = $('chatin').value.trim();
      if (v) send({ t: 'chat', m: v });
      $('chatin').value = ''; $('chatin').blur(); typing = false;
    } else if (e.key === 'Escape') { $('chatin').value = ''; $('chatin').blur(); typing = false; }
    return;
  }
  if (e.key === 'Escape' && helpOpen) { toggleHelp(false); return; }
  if (e.key === 'Escape' && shopOpen) { closeShop(); return; }
  if (e.key === 'Escape') { // Esc: huỷ ngắm đang giữ; không thì mở/đóng menu cài đặt (nếu vừa thoát khoá chuột bằng chính phím Esc này thì menu đã được mở rồi)
    if (aiming) { releaseAim(false); return; }
    if (performance.now() - lastUnlockAt < 250) return;
    toggleSettings(); return;
  }
  if (settingsOpen) return;
  if (e.key === 'Enter') { e.preventDefault(); $('chatin').focus(); typing = true; return; }
  if (e.repeat) { if (e.code === 'Space') e.preventDefault(); return; }
  if (e.code === 'KeyQ') startAim('bomb'); // giữ để ngắm, thả ra thì ném
  else if (e.code === 'KeyR') send({ t: 'drink' });
  else if (e.code === 'KeyT') startAim('rock');
  else if (e.code === 'KeyG') send({ t: 'give' });
  else if (e.code === 'KeyN') toggleMap();
  else if (e.code === 'KeyK') toggleHelp();
  else if (e.code === 'KeyM') { $('soundbtn').textContent = toggleMute() ? '🔇' : '🔊'; }
  else if (e.code === 'KeyH') { arrowsOn = !arrowsOn; toast(arrowsOn ? 'Bật mũi tên chỉ đường.' : 'Tắt mũi tên chỉ đường.', 'info'); }
  keys.add(e.code);
  if (e.code === 'Space') e.preventDefault();
});
window.addEventListener('keyup', (e) => {
  keys.delete(e.code);
  if ((e.code === 'KeyE' || e.code === 'Space') && !touchAct) actBlocked = false;
  if ((e.code === 'KeyQ' && aiming === 'bomb') || (e.code === 'KeyT' && aiming === 'rock')) releaseAim(true); // buông phím: ném
});
window.addEventListener('blur', () => { keys.clear(); releaseAim(false); });
$('chatin').addEventListener('focus', () => { typing = true; keys.clear(); });
$('chatin').addEventListener('blur', () => { typing = false; });
canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoom = Math.max(0.6, Math.min(1.8, zoom + Math.sign(e.deltaY) * 0.08)); }, { passive: false });
$('soundbtn').addEventListener('click', () => { $('soundbtn').textContent = toggleMute() ? '🔇' : '🔊'; });
// Chọn chất lượng đồ họa (trong bảng hướng dẫn): lưu lại và áp dụng ở lần tải trang sau
{
  const sel = $('qual');
  if (sel) {
    sel.value = quality;
    sel.addEventListener('change', () => { try { localStorage.setItem('ditu-quality', sel.value); } catch { /* bỏ qua */ } toast('Đã lưu chất lượng đồ họa. Hãy tải lại trang (F5) để áp dụng.', 'info'); });
  }
}

// Bảng hướng dẫn thao tác (nút ❓ cạnh bản đồ nhỏ)
let helpOpen = false;
function toggleHelp(force) {
  helpOpen = force === undefined ? !helpOpen : force;
  if (helpOpen) releaseMouse();
  $('help').classList.toggle('hidden', !helpOpen);
}
// Menu cài đặt (Esc): âm lượng, góc nhìn, đồ họa, hướng dẫn
function toggleSettings(force) {
  settingsOpen = force === undefined ? !settingsOpen : force;
  $('settings').classList.toggle('hidden', !settingsOpen);
  if (settingsOpen) { releaseMouse(); keys.clear(); $('setvol').value = Math.round(getVolume() * 100); }
}

// ----- Khoá chuột ở giữa màn hình (góc nhìn thứ ba): di chuột để xoay camera, nhân vật đi theo hướng giữa màn hình -----
const overlayOpen = () => settingsOpen || shopOpen || helpOpen || minigameActive();
function releaseMouse() { if (document.pointerLockElement) { intentionalUnlock = true; document.exitPointerLock(); } }
function requestMouse() {
  if (camMode !== 'third' || !joined || overlayOpen() || document.pointerLockElement === canvas) return;
  try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch { /* bỏ qua */ }
}
const mouseHint = document.createElement('div');
Object.assign(mouseHint.style, { position: 'fixed', left: '50%', bottom: '88px', transform: 'translateX(-50%)', zIndex: '4', pointerEvents: 'none', padding: '8px 14px', borderRadius: '10px', background: 'rgba(18,21,26,.82)', color: '#fff', font: '600 13px system-ui, sans-serif', display: 'none', border: '1px solid rgba(255,255,255,.2)' });
mouseHint.textContent = '🖱️ Nhấp vào màn hình để khoá chuột và xoay camera (Esc: thả chuột / cài đặt)';
const crosshair = document.createElement('div');
Object.assign(crosshair.style, { position: 'fixed', left: '50%', top: '50%', width: '6px', height: '6px', margin: '-3px 0 0 -3px', borderRadius: '50%', background: 'rgba(255,255,255,.75)', boxShadow: '0 0 0 1.5px rgba(0,0,0,.55)', zIndex: '4', pointerEvents: 'none', display: 'none' });
document.body.append(mouseHint, crosshair);
function updateMouseHint() {
  const locked = document.pointerLockElement === canvas;
  const key = `${camMode}|${joined}|${locked}|${overlayOpen()}|${isTouch}`;
  if (key === mouseHintShown) return;
  mouseHintShown = key;
  const on = camMode === 'third' && joined && !isTouch && !overlayOpen();
  mouseHint.style.display = on && !locked ? 'block' : 'none';
  crosshair.style.display = on && locked ? 'block' : 'none';
}
document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas || camMode !== 'third') return;
  camYaw -= e.movementX * 0.0028;
  camPitch = Math.max(0.12, Math.min(1.25, camPitch + e.movementY * 0.0022));
});
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  mouseHintShown = null;
  if (locked) return;
  lastUnlockAt = performance.now();
  if (intentionalUnlock) { intentionalUnlock = false; return; }
  if (camMode === 'third' && joined && !overlayOpen()) toggleSettings(true); // người chơi nhấn Esc để thả chuột: mở luôn menu cài đặt
});
const CAM_NOTES = {
  top: 'Camera trên cao cố định: thấy rõ cả hình quạt tầm nhìn của quản giáo và đường đi, phù hợp chơi lén lút.',
  third: 'Camera sau lưng nhân vật, kéo chuột (hoặc vuốt màn hình) để xoay, cuộn chuột để zoom. Tường cao có thể che tầm nhìn và khó thấy quản giáo từ xa hơn.',
};
function setCamMode(m) {
  camMode = m;
  try { localStorage.setItem('ditu-cam', m); } catch { /* bỏ qua */ }
  camera.fov = m === 'third' ? 62 : 45;
  camera.updateProjectionMatrix();
  if (m === 'top') { camYaw = 0; releaseMouse(); } // quay về hướng cố định để phím W/A/S/D khớp với màn hình
  mouseHintShown = null;
  $('camsel').value = m; $('camnote').textContent = CAM_NOTES[m];
}
$('camsel').addEventListener('change', () => setCamMode($('camsel').value));
$('setvol').addEventListener('input', () => { setVolume($('setvol').value / 100); $('vol').value = $('setvol').value; });
$('setguide').addEventListener('click', () => toggleHelp(true));
$('setresume').addEventListener('click', () => toggleSettings(false));
$('helpclose2').addEventListener('click', () => toggleSettings(false));
$('settings').addEventListener('pointerdown', (e) => { if (e.target === $('settings')) toggleSettings(false); });
setCamMode(camMode);
// kéo để xoay camera (chỉ ở góc nhìn thứ ba)
{
  let drag = null;
  canvas.style.touchAction = 'none';
  // chuột: nhấp để khoá chuột (xem requestMouse); cảm ứng/bút: vuốt để xoay
  canvas.addEventListener('pointerdown', (e) => {
    if (camMode !== 'third' || !joined) return;
    if (e.pointerType === 'mouse') { requestMouse(); return; }
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    camYaw -= (e.clientX - drag.x) * 0.006;
    camPitch = Math.max(0.12, Math.min(1.25, camPitch + (e.clientY - drag.y) * 0.004));
    drag.x = e.clientX; drag.y = e.clientY;
  });
  const end = (e) => { if (drag && e.pointerId === drag.id) drag = null; };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
}
$('helpbtn').addEventListener('click', () => toggleHelp());
$('helpclose').addEventListener('click', () => toggleHelp(false));
$('help').addEventListener('pointerdown', (e) => { if (e.target === $('help')) toggleHelp(false); });

function inputVec() {
  if (typing || minigameActive() || shopOpen || helpOpen || settingsOpen) return { mx: 0, mz: 0, act: false, moving: false, sneak: false, run: false };
  let mx = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  let mz = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
  if (!mx && !mz) { mx = joy.x; mz = joy.z; }
  // góc nhìn thứ ba: "tiến" là hướng camera đang nhìn, nên xoay vector điều khiển theo góc xoay camera
  if (camMode === 'third' && (mx || mz)) { const c = Math.cos(camYaw), s = Math.sin(camYaw); [mx, mz] = [mx * c + mz * s, -mx * s + mz * c]; }
  if (aiming && isTouch) { aimVec = [mx, mz]; mx = 0; mz = 0; } // cảm ứng: đang giữ nút ném thì joystick dùng để ngắm, không đi
  const act = (keys.has('KeyE') || keys.has('Space') || touchAct) && !actBlocked;
  const sneak = keys.has('KeyC') || sneakToggle;
  const run = (keys.has('ShiftLeft') || keys.has('ShiftRight') || runToggle) && !sneak; // chạy: tốn năng lượng, ồn
  return { mx, mz, act, moving: Math.abs(mx) + Math.abs(mz) > 0.1, sneak, run };
}
let sneakToggle = false, runToggle = false;

// ===================== Ném bom / ném đá: giữ phím để ngắm, thả phím thì ném =====================
// Hướng ngắm: chuột (góc nhìn trên cao: về phía con trỏ trên mặt đất; ngôi thứ ba khoá chuột: về phía giữa màn hình); cảm ứng: joystick.
let aiming = null, aimAng = 0, aimVec = [0, 0], mouseX = window.innerWidth / 2, mouseY = window.innerHeight / 2;
window.addEventListener('mousemove', (e) => { mouseX = e.clientX; mouseY = e.clientY; });
const AIM_N = 18, aimPos = new Float32Array(AIM_N * 3);
const aimGeo = new THREE.BufferGeometry(); aimGeo.setAttribute('position', new THREE.BufferAttribute(aimPos, 3));
const aimDots = new THREE.Points(aimGeo, new THREE.PointsMaterial({ size: 0.42, map: SOFT_DOT, color: 0xff8a40, transparent: true, opacity: 0.95, depthWrite: false, depthTest: false }));
const aimRing = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48), new THREE.MeshBasicMaterial({ color: 0xff8a40, transparent: true, opacity: 0.8, depthWrite: false, depthTest: false, side: THREE.DoubleSide }));
const aimFill = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ color: 0xff8a40, transparent: true, opacity: 0.13, depthWrite: false, depthTest: false }));
aimRing.rotation.x = aimFill.rotation.x = -Math.PI / 2;
for (const o of [aimDots, aimRing, aimFill]) { o.visible = false; o.frustumCulled = false; o.renderOrder = 5; scene.add(o); }
const _aimRay = new THREE.Raycaster(), _aimNdc = new THREE.Vector2(), _aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), _aimHit = new THREE.Vector3();

function canAimNow() { return joined && snap && snap.me.jail <= 0 && !me.stun && !typing && !overlayOpen(); }
function startAim(what) {
  if (aiming || !canAimNow()) return;
  const m = snap.me;
  if (what === 'bomb' && !(m.stock && m.stock.bomb > 0)) { toast('Bạn không có thuốc nổ.', 'warn'); return; }
  if (what === 'rock' && m.rock > 0) { toast(`Chờ ${m.rock}s để ném đá tiếp.`, 'info'); return; }
  aiming = what; aimVec = [0, 0];
  const col = what === 'bomb' ? 0xff8a40 : 0xd6dae0;
  aimDots.material.color.setHex(col); aimRing.material.color.setHex(col); aimFill.material.color.setHex(col);
  aimDots.visible = aimRing.visible = aimFill.visible = true;
  updateAim();
}
function releaseAim(throwIt) {
  if (!aiming) return;
  const what = aiming;
  aiming = null;
  aimDots.visible = aimRing.visible = aimFill.visible = false;
  if (throwIt && canAimNow()) send({ t: what, a: +aimAng.toFixed(3) }); // góc theo quy ước của ry: sin = x, cos = z
}
function computeAimAngle() {
  if (isTouch) return aimVec[0] || aimVec[1] ? Math.atan2(aimVec[0], aimVec[1]) : aimAng;
  if (camMode === 'third' && document.pointerLockElement === canvas) return Math.atan2(-Math.sin(camYaw), -Math.cos(camYaw)); // giữa màn hình
  _aimNdc.set((mouseX / window.innerWidth) * 2 - 1, -(mouseY / window.innerHeight) * 2 + 1);
  _aimRay.setFromCamera(_aimNdc, camera);
  if (_aimRay.ray.intersectPlane(_aimPlane, _aimHit)) { const dx = _aimHit.x - me.x, dz = _aimHit.z - me.z; if (dx * dx + dz * dz > 0.04) return Math.atan2(dx, dz); }
  return aimAng;
}
function updateAim() {
  if (!aiming) return;
  if (!canAimNow()) { releaseAim(false); return; }
  aimAng = computeAimAngle();
  me.ry = aimAng; // nhân vật quay mặt về hướng ngắm
  const bomb = aiming === 'bomb', range = bomb ? RULES.bombRange : RULES.rockRange, r = bomb ? 0.3 : 0.2;
  const sx = Math.sin(aimAng), cz = Math.cos(aimAng);
  let d = 0;
  while (d < range && !blocked(me.x + sx * (d + 0.5), me.z + cz * (d + 0.5), r, me.labor)) d += 0.5; // cùng cách tính với server
  for (let i = 0; i < AIM_N; i++) { const f = ((i + 1) / AIM_N) * d; aimPos[i * 3] = me.x + sx * f; aimPos[i * 3 + 1] = 0.16; aimPos[i * 3 + 2] = me.z + cz * f; }
  aimGeo.attributes.position.needsUpdate = true;
  const rad = bomb ? RULES.bombRadius : 0.8, lx = me.x + sx * d, lz = me.z + cz * d;
  aimRing.position.set(lx, 0.17, lz); aimFill.position.set(lx, 0.16, lz);
  aimRing.scale.setScalar(rad); aimFill.scale.setScalar(rad);
}

// Joystick cảm ứng
(() => {
  const el = $('joy'), knob = $('knob');
  let id = null;
  const set = (e) => {
    const r = el.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2), dz = e.clientY - (r.top + r.height / 2);
    const len = Math.hypot(dx, dz), max = r.width / 2;
    if (len > max) { dx = (dx / len) * max; dz = (dz / len) * max; }
    knob.style.transform = `translate(${dx}px, ${dz}px)`;
    joy = { x: dx / max, z: dz / max };
  };
  el.addEventListener('pointerdown', (e) => { id = e.pointerId; el.setPointerCapture(id); set(e); });
  el.addEventListener('pointermove', (e) => { if (e.pointerId === id) set(e); });
  const end = (e) => { if (e.pointerId !== id) return; id = null; joy = { x: 0, z: 0 }; knob.style.transform = ''; };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  const act = $('actbtn');
  act.addEventListener('pointerdown', (e) => { touchAct = true; act.classList.add('on'); act.setPointerCapture(e.pointerId); });
  const up = () => { touchAct = false; act.classList.remove('on'); if (!keys.has('KeyE') && !keys.has('Space')) actBlocked = false; };
  act.addEventListener('pointerup', up); act.addEventListener('pointercancel', up);
  // nút ném trên điện thoại: giữ để ngắm (hướng cần joystick), nhả ra thì ném
  for (const [id, what] of [['bombbtn', 'bomb'], ['rockbtn', 'rock']]) {
    const b = $(id);
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.setPointerCapture(e.pointerId); b.classList.add('on'); startAim(what); });
    b.addEventListener('pointerup', () => { b.classList.remove('on'); releaseAim(true); });
    b.addEventListener('pointercancel', () => { b.classList.remove('on'); releaseAim(false); });
  }
  $('drinkbtn').addEventListener('click', () => send({ t: 'drink' }));
  $('chatbtn').addEventListener('click', () => { $('chatin').focus(); }); // dùng ô chat có sẵn thay cho hộp thoại của trình duyệt
  $('runbtn').addEventListener('click', () => { runToggle = !runToggle; $('runbtn').classList.toggle('on', runToggle); });
  $('sneakbtn').addEventListener('click', () => { sneakToggle = !sneakToggle; $('sneakbtn').classList.toggle('on', sneakToggle); });
  $('phase').addEventListener('click', () => $('topleft').classList.toggle('compact')); // thu gọn bảng trên điện thoại
  const vol = $('vol');
  vol.value = Math.round(getVolume() * 100);
  vol.addEventListener('input', () => setVolume(vol.value / 100));
})();

setInterval(() => {
  if (!joined || !ws || ws.readyState !== 1) return;
  const v = inputVec();
  const mx = +v.mx.toFixed(3), mz = +v.mz.toFixed(3);
  ++seq;
  const still = me.stun || me.jail > 0; // choáng / bị giam thì server không cho di chuyển: lịch sử dự đoán cũng phải đứng yên
  inputHist.push({ seq, mx: still ? 0 : mx, mz: still ? 0 : mz, sneak: v.sneak, run: v.run, t: performance.now() }); // để đối chiếu với vị trí server (predictFromServer)
  if (inputHist.length > 60) inputHist.shift();
  ws.send(JSON.stringify({ t: 'in', mx, mz, act: v.act, sneak: v.sneak, run: v.run, seq }));
}, 50);

// Rời hàng chờ
$('leaveq').addEventListener('click', () => {
  const s = ws; ws = null; queuedNow = false;
  if (s) s.close();
  $('leaveq').classList.add('hidden'); $('enter').disabled = false; $('connmsg').textContent = ''; document.title = 'Đi Tù Online';
});
// Số người đang chơi / hàng chờ ở màn hình đầu
async function pollStatus() {
  if (joined) return;
  try {
    const s = await (await fetch('/status', { cache: 'no-store' })).json();
    $('srvstat').textContent = `Đang chơi: ${s.online}/${s.capacity}${s.queue ? ` · đang chờ: ${s.queue}` : ''}`;
  } catch { /* máy chủ chưa sẵn sàng: bỏ qua */ }
}
pollStatus(); setInterval(pollStatus, 8000);

$('enter').addEventListener('click', () => { connectTries = 0; initAudio(); connect($('name').value); try { localStorage.setItem('ditu-name', $('name').value); } catch { /* bỏ qua */ } });
try { $('name').value = localStorage.getItem('ditu-name') || ''; } catch { /* bỏ qua */ }
if (isMuted()) $('soundbtn').textContent = '🔇';
document.addEventListener('pointerdown', () => initAudioIfStarted(), { once: true });
function initAudioIfStarted() { if (joined) initAudio(); }

// ===================== Bản đồ nhỏ =====================
const mm = $('minimap');
const mmc = mm.getContext('2d');
let mmStatic = null, mmScale = 5, mmBig = false, mmFrame = 0;
function hex(c) { return `#${c.toString(16).padStart(6, '0')}`; }
function layoutMinimap() {
  const r = mm.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(80, Math.round(r.width * dpr)), h = Math.round(w * 0.75);
  if (mm.width === w && mm.height === h && mmStatic) return;
  mm.width = w; mm.height = h;
  mmScale = w / (WORLD.maxX - WORLD.minX);
  mmStatic = null;
}
function toggleMap() { mmBig = !mmBig; mm.classList.toggle('big', mmBig); setTimeout(layoutMinimap, 230); layoutMinimap(); }
mm.addEventListener('click', toggleMap);
const wx = (x) => (x - WORLD.minX) * mmScale, wz = (z) => (z - WORLD.minZ) * mmScale;
const ZONE_ICON = { cell: '🛏️', canteen: '🍲', workshop: '🔨', library: '📖', office: '👮', solitary: '⛓️', yard: '🏀', infirmary: '💊', laundry: '🧺', garden: '🌱', rec: '🎮', gym: '🏋️', shower: '🚿' };

function buildMinimapStatic() {
  const cv = document.createElement('canvas');
  cv.width = mm.width; cv.height = mm.height;
  const g = cv.getContext('2d');
  g.fillStyle = '#1d2a22'; g.fillRect(0, 0, cv.width, cv.height);
  g.fillStyle = '#4a4f4a'; g.fillRect(wx(WORLD.minX), wz(WORLD.minZ), (WORLD.maxX - WORLD.minX) * mmScale, (WORLD.maxZ - WORLD.minZ) * mmScale);
  const tiny = cv.width < 260;
  for (const z of ZONES) {
    g.fillStyle = hex(z.color) + 'cc';
    g.fillRect(wx(z.x1), wz(z.z1), (z.x2 - z.x1) * mmScale, (z.z2 - z.z1) * mmScale);
  }
  for (const k of KHOS) {
    g.fillStyle = 'rgba(255,200,60,.35)';
    g.fillRect(wx(k.x1), wz(k.z1), (k.x2 - k.x1) * mmScale, (k.z2 - k.z1) * mmScale);
  }
  g.fillStyle = '#e8e4d8';
  for (const w of WALLS) {
    const tall = w.h > 3;
    g.fillStyle = tall ? '#9aa0aa' : '#f3efe2';
    g.fillRect(wx(w.x1), wz(w.z1), Math.max(1, (w.x2 - w.x1) * mmScale), Math.max(1, (w.z2 - w.z1) * mmScale));
  }
  // nhãn phòng
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const fs = Math.max(9, Math.round(cv.width / (tiny ? 22 : 34)));
  for (const z of ZONES) {
    const cx = wx((z.x1 + z.x2) / 2), cy = wz((z.z1 + z.z2) / 2);
    if (tiny) { g.font = `${fs + 3}px system-ui, "Segoe UI Emoji"`; g.fillText(ZONE_ICON[z.id], cx, cy); }
    else {
      g.font = `bold ${fs}px system-ui, sans-serif`;
      g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.75)'; g.strokeText(z.short, cx, cy - fs * 0.1);
      g.fillStyle = '#fff'; g.fillText(z.short, cx, cy - fs * 0.1);
    }
  }
  if (!tiny) {
    g.font = `bold ${Math.max(8, fs - 2)}px system-ui, sans-serif`;
    for (const k of KHOS) { const cx = wx((k.x1 + k.x2) / 2), cy = wz((k.z1 + k.z2) / 2); g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.8)'; g.strokeText(k.name, cx, cy); g.fillStyle = '#ffd166'; g.fillText(k.name, cx, cy); }
  }
  // chợ đen
  g.font = `${tiny ? fs + 3 : fs + 4}px system-ui, "Segoe UI Emoji"`;
  g.fillText('💰', wx(DEALER.x), wz(DEALER.z + 2.2));
  if (!tiny) { g.font = `bold ${Math.max(8, fs - 2)}px system-ui, sans-serif`; g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.8)'; g.strokeText('Chợ đen', wx(DEALER.x), wz(DEALER.z + 4.4)); g.fillStyle = '#ffd166'; g.fillText('Chợ đen', wx(DEALER.x), wz(DEALER.z + 4.4)); }
  mmStatic = cv;
}

function drawMinimap(time) {
  if (!mmStatic) buildMinimapStatic();
  const c = mmc, W = mm.width, H = mm.height;
  c.drawImage(mmStatic, 0, 0);
  // ổ khoá các kho
  for (const g of GATES) {
    const open = me.labor >= g.need;
    c.font = `${Math.max(9, W / 28)}px system-ui, "Segoe UI Emoji"`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(open ? '🔓' : '🔒', wx((g.x1 + g.x2) / 2), wz((g.z1 + g.z2) / 2));
  }
  const s = snap;
  // đường đi tới mục tiêu
  if (arrowPath && arrowPath.length > 1 && arrowsActive()) {
    c.strokeStyle = 'rgba(255,224,102,.95)'; c.lineWidth = Math.max(2, W / 130); c.setLineDash([W / 60, W / 80]);
    c.beginPath(); c.moveTo(wx(arrowPath[0][0]), wz(arrowPath[0][1]));
    for (let i = 1; i < arrowPath.length; i += 2) c.lineTo(wx(arrowPath[i][0]), wz(arrowPath[i][1]));
    c.stroke(); c.setLineDash([]);
  }
  if (s && s.me.goal && !s.me.goal.free) { // mục tiêu nhấp nháy (giờ tự do không có điểm đến cụ thể)
    const gx = wx(s.me.goal.x), gz = wz(s.me.goal.z), pr = 0.5 + 0.5 * Math.sin(time * 5);
    c.beginPath(); c.arc(gx, gz, W / 70 + pr * W / 100, 0, Math.PI * 2); c.fillStyle = `rgba(255,209,102,${0.5 + pr * 0.4})`; c.fill();
    c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.stroke();
  }
  const night = s && s.ph === NIGHT_PHASE;
  for (const e of ents.values()) {
    if (e.id === myId.v) continue;
    const x = wx(e.x), y = wz(e.z);
    if (e.kind === 'guard') {
      const rad = (night ? RULES.guardRangeNight : RULES.guardRange) * mmScale;
      c.save(); c.translate(x, y); c.rotate(Math.PI - e.ry); // ry=0 hướng +z (xuống dưới màn hình)
      c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, rad, -Math.PI / 2 - RULES.guardFov / 2, -Math.PI / 2 + RULES.guardFov / 2); c.closePath();
      c.fillStyle = e.alert ? 'rgba(255,60,60,.28)' : 'rgba(255,224,102,.18)'; c.fill(); c.restore();
      c.beginPath(); c.arc(x, y, W / 90 + 1.5, 0, Math.PI * 2); c.fillStyle = e.alert ? '#ff3b30' : '#3b82f6'; c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 1; c.stroke();
    } else if (e.kind === 'player') {
      c.beginPath(); c.arc(x, y, W / 110 + 1.2, 0, Math.PI * 2); c.fillStyle = '#ff9f43'; c.fill();
    } else if (e.kind === 'cat') {
      c.font = `${Math.max(10, W / 30)}px system-ui, "Segoe UI Emoji"`; c.textAlign = 'center'; c.fillText('🐱', x, y);
    } else if (e.kind === 'dealer') {
      c.font = `${Math.max(10, W / 26)}px system-ui, "Segoe UI Emoji"`; c.textAlign = 'center'; c.fillText('🕴️', x, y);
    } else {
      c.beginPath(); c.arc(x, y, W / 160 + 1, 0, Math.PI * 2); c.fillStyle = 'rgba(255,255,255,.45)'; c.fill();
    }
  }
  for (const b of bombs.values()) { c.beginPath(); c.arc(wx(b.g.position.x), wz(b.g.position.z), W / 80, 0, Math.PI * 2); c.fillStyle = Math.sin(time * 20) > 0 ? '#ff4500' : '#222'; c.fill(); }
  // bản thân: mũi tên trắng
  c.save(); c.translate(wx(me.x), wz(me.z)); c.rotate(Math.PI - me.ry);
  const r = W / 60 + 3;
  c.beginPath(); c.moveTo(0, -r * 1.2); c.lineTo(r, r); c.lineTo(0, r * 0.45); c.lineTo(-r, r); c.closePath();
  c.fillStyle = '#fff'; c.fill(); c.lineWidth = 1.5; c.strokeStyle = '#111'; c.stroke(); c.restore();
  c.beginPath(); c.arc(wx(me.x), wz(me.z), r * 1.9 + Math.sin(time * 4) * 1.5, 0, Math.PI * 2); c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 1.5; c.stroke();
}

// ===================== Mũi tên chỉ đường dưới đất (ngày đầu) =====================
const arrowGeo = makeArrowGeometry();
const arrowMat = new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.92, depthWrite: false, side: THREE.DoubleSide });
const ARROW_N = 14, ARROW_GAP = 2.4;
const arrows = [];
for (let i = 0; i < ARROW_N; i++) { const a = new THREE.Mesh(arrowGeo, arrowMat); a.visible = false; a.renderOrder = 2; scene.add(a); arrows.push(a); }
const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 6, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }));
beacon.visible = false; scene.add(beacon);
let arrowPath = null, arrowCum = [], arrowTotal = 0, arrowTimer = 0, arrowGoalKey = '';
const arrowsActive = () => arrowsOn && phasesSeen < PHASES.length && snap && snap.me.goal && !snap.me.goal.free && snap.me.jail <= 0;

function updateArrows(dt, time) {
  const active = arrowsActive();
  if (!active) { arrowPath = null; for (const a of arrows) a.visible = false; beacon.visible = false; return; }
  const goal = snap.me.goal;
  arrowTimer -= dt;
  if (arrowTimer <= 0) {
    arrowTimer = 0.45;
    arrowPath = findPath(me.x, me.z, goal.x, goal.z, 260);
    arrowCum = [0];
    for (let i = 1; i < arrowPath.length; i++) arrowCum.push(arrowCum[i - 1] + Math.hypot(arrowPath[i][0] - arrowPath[i - 1][0], arrowPath[i][1] - arrowPath[i - 1][1]));
    arrowTotal = arrowCum[arrowCum.length - 1];
  }
  beacon.visible = true;
  beacon.position.set(goal.x, 3, goal.z);
  beacon.material.opacity = 0.16 + 0.1 * Math.sin(time * 4);
  if (!arrowPath || arrowPath.length < 2) { for (const a of arrows) a.visible = false; return; }
  const off = (time * 2.4) % ARROW_GAP;
  let seg = 1;
  for (let k = 0; k < ARROW_N; k++) {
    const a = arrows[k];
    const s = off + k * ARROW_GAP + 1.2;
    if (s > arrowTotal - 1.5) { a.visible = false; continue; }
    while (seg < arrowCum.length - 1 && arrowCum[seg] < s) seg++;
    const p0 = arrowPath[seg - 1], p1 = arrowPath[seg];
    const L = Math.max(1e-4, arrowCum[seg] - arrowCum[seg - 1]), f = Math.max(0, Math.min(1, (s - arrowCum[seg - 1]) / L));
    // hướng nhìn xa hơn một chút để mũi tên không giật ở góc cua
    const q = arrowPath[Math.min(arrowPath.length - 1, seg + 1)];
    const dx = (p1[0] - p0[0]) * 0.6 + (q[0] - p1[0]) * 0.4, dz = (p1[1] - p0[1]) * 0.6 + (q[1] - p1[1]) * 0.4;
    a.position.set(p0[0] + (p1[0] - p0[0]) * f, 0.11, p0[1] + (p1[1] - p0[1]) * f);
    a.rotation.y = Math.atan2(dx, dz);
    const fade = Math.min(1, (arrowTotal - s) / 4);
    a.scale.setScalar(0.85 + 0.15 * Math.sin(time * 6 - k * 0.8));
    a.visible = fade > 0;
  }
}

// ===================== Hạt (bụi, khói, tia lửa) và mưa =====================
const MAXP = 400;
const pPos = new Float32Array(MAXP * 3), pCol = new Float32Array(MAXP * 3), pVel = new Float32Array(MAXP * 3), pLife = new Float32Array(MAXP);
let pHead = 0;
const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.62, map: SOFT_DOT, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false })); // hạt tròn mềm thay cho điểm vuông
particles.frustumCulled = false;
scene.add(particles);
function spawn(x, y, z, n, color, speed, up, life) {
  const c = new THREE.Color(color);
  for (let k = 0; k < n; k++) {
    const i = pHead; pHead = (pHead + 1) % MAXP;
    pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z;
    const a = Math.random() * Math.PI * 2, s = Math.random() * speed;
    pVel[i * 3] = Math.cos(a) * s; pVel[i * 3 + 1] = up * (0.4 + Math.random()); pVel[i * 3 + 2] = Math.sin(a) * s;
    pCol[i * 3] = c.r; pCol[i * 3 + 1] = c.g; pCol[i * 3 + 2] = c.b;
    pLife[i] = life * (0.6 + Math.random() * 0.6);
  }
}
const FX = { dig: [0x8a6a45, 10, 2.2, 5, 0.7], hammer: [0xffc34a, 8, 2.8, 4, 0.45], thud: [0xcfc7b0, 6, 1.4, 3, 0.6], boom: [0x555555, 40, 5, 9, 1.4], sweep: [0xb5a98a, 5, 0.8, 1.5, 0.8], rock: [0xbbbbbb, 5, 1.5, 3, 0.5], lock: [0xffffff, 4, 1.5, 2, 0.35] };
function fxAt(kind, x, z) {
  const f = FX[kind];
  if (!f) return;
  spawn(x, 0.3, z, f[1], f[0], f[2], f[3], f[4]);
  if (kind === 'boom') spawn(x, 0.5, z, 30, 0xff8a2a, 6, 7, 0.7);
}
function updateParticles(dt) {
  for (let i = 0; i < MAXP; i++) {
    if (pLife[i] <= 0) { pPos[i * 3 + 1] = -50; continue; }
    pLife[i] -= dt;
    pVel[i * 3 + 1] -= 9 * dt;
    pPos[i * 3] += pVel[i * 3] * dt; pPos[i * 3 + 1] = Math.max(0.02, pPos[i * 3 + 1] + pVel[i * 3 + 1] * dt); pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
  }
  pGeo.attributes.position.needsUpdate = true;
  pGeo.attributes.color.needsUpdate = true;
}
// mưa: các vệt rơi quanh camera
const RAIN_N = 260;
const rainPos = new Float32Array(RAIN_N * 6);
const rainGeo = new THREE.BufferGeometry();
rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0xaecbe8, transparent: true, opacity: 0.55 }));
rain.frustumCulled = false; rain.visible = false;
scene.add(rain);
const rainSeed = Array.from({ length: RAIN_N }, () => [Math.random() * 60 - 30, Math.random() * 30, Math.random() * 50 - 25]);
function updateRain(dt, on) {
  rain.visible = on;
  if (!on) return;
  for (let i = 0; i < RAIN_N; i++) {
    const r = rainSeed[i];
    r[1] -= 38 * dt;
    if (r[1] < 0) r[1] += 30;
    const x = camFocus.x + r[0], z = camFocus.z + r[2];
    const o = i * 6;
    rainPos[o] = x; rainPos[o + 1] = r[1]; rainPos[o + 2] = z; rainPos[o + 3] = x + 0.15; rainPos[o + 4] = r[1] + 1.1; rainPos[o + 5] = z - 0.15;
  }
  rainGeo.attributes.position.needsUpdate = true;
}

// ===================== Chống chồng chữ: bong bóng thoại gần nhau tự đẩy lên cao =====================
// Làm việc trong không gian camera: mỗi bong bóng là một hình chữ nhật (neo ở đáy giữa), nếu đè lên bong bóng thấp hơn thì dịch lên trên nó.
const _bv = new THREE.Vector3(), _bup = new THREE.Vector3(), bubbleList = [];
function separateBubbles(dt) {
  camera.updateMatrixWorld();
  const mi = camera.matrixWorldInverse;
  const upY = Math.max(0.25, _bup.set(0, 1, 0).transformDirection(mi).y); // 1 mét theo phương thẳng đứng thế giới = upY mét theo phương dọc màn hình
  bubbleList.length = 0;
  for (const e of ents.values()) {
    const base = e.kind === 'cat' ? 1.5 : 3.0;
    if (!e.bubble.visible || !e.group.visible) { e.bOff = 0; e.bubble.position.y = base; continue; }
    _bv.set(e.x, base * e.group.scale.y, e.z).applyMatrix4(mi);
    bubbleList.push({ e, base, vx: _bv.x, vy: _bv.y, w: e.bubble.scale.x, h: e.bubble.scale.y });
  }
  bubbleList.sort((a, b) => a.vy - b.vy);
  const placed = [];
  for (const b of bubbleList) {
    let off = 0;
    for (let iter = 0; iter < 10; iter++) {
      let hit = false;
      for (const p of placed) {
        if (Math.abs(b.vx - p.vx) < (b.w + p.w) / 2 && b.vy + off < p.top && b.vy + off + b.h > p.bot) { off = p.top + 0.08 - b.vy; hit = true; }
      }
      if (!hit) break;
    }
    placed.push({ vx: b.vx, bot: b.vy + off, top: b.vy + off + b.h, w: b.w });
    const target = off / upY;
    b.e.bOff = (b.e.bOff || 0) + (target - (b.e.bOff || 0)) * Math.min(1, dt * 14);
    b.e.bubble.position.y = b.base + b.e.bOff;
  }
}

// ===================== Vòng lặp vẽ =====================
const camFocus = new THREE.Vector3(0, 0, 0);
const NIGHT_FOG = new THREE.Color(0x070b18);
let coneFrame = 0, last = performance.now(), time = 0, nightK = 0, evK = 0, stepT = 0, fpsAcc = 0, fpsN = 0, sneaking = false;
const NIGHT_BG = new THREE.Color(0x070b18), RAIN_GREY = new THREE.Color(0x6f7782);
const hemiSky = new THREE.Color(0xcfe6ff), hemiNight = new THREE.Color(0x5a72b8);

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now; time += dt;

  // tự giảm độ phân giải nếu máy yếu
  fpsAcc += dt; fpsN++;
  if (fpsN >= 90) {
    if (fpsAcc / fpsN > 0.026 && pixelRatio > 1) { pixelRatio = Math.max(1, pixelRatio - 0.25); renderer.setPixelRatio(pixelRatio); resize(); }
    fpsAcc = 0; fpsN = 0;
  }

  let moving = false;
  sneaking = false;
  if (joined) {
    const v = inputVec();
    const canMove = me.jail <= 0 && !me.stun && v.moving;
    if (canMove) {
      const speed = moveSpeed({ boost: me.boost, en: me.en, sneak: v.sneak, run: v.run });
      stepMove(me, v.mx, v.mz, dt, speed);
      me.ry = Math.atan2(v.mx, v.mz);
      moving = true;
      sneaking = v.sneak;
    }
    if (aiming) updateAim(); // ngắm: cập nhật vạch ngắm và quay mặt nhân vật về hướng ngắm
    const mine = ents.get(myId.v);
    if (mine) { mine.x = me.x; mine.z = me.z; mine.try = me.ry; mine.flags = (me.jail > 0 ? 1 : 0) | (snap && snap.me.hold ? 2 : 0) | (minigameActive() ? 2 : 0) | (me.boost > 0 ? 8 : 0) | (me.codeFlags || 0); }
    if (moving && !sneaking) { const rn = isRunning({ run: v.run, sneak: v.sneak, en: me.en }); stepT -= dt; if (stepT <= 0) { stepT = rn || me.boost > 0 ? 0.22 : 0.33; sfx('step', rn ? 0.5 : 0.35, 0); } }
  }

  // ngày / đêm theo đồng hồ trong game: bình minh, nắng gắt, hoàng hôn, đêm; mưa thì u ám, cúp điện thì tối sầm
  const night = snap && snap.ph === NIGHT_PHASE;
  const hourRaw = snap ? clockHour(snap.ph, snap.pt) : 9, hour = hourRaw < 5.5 ? hourRaw + 24 : hourRaw;
  const sk = skyAt(hour);
  const evTarget = curEvent === 'blackout' ? 0.8 : curEvent === 'rain' ? 0.35 : 0;
  evK += (evTarget - evK) * Math.min(1, dt * 1.5);
  nightK += (Math.max(sk.dark, evK) - nightK) * Math.min(1, dt * 3);
  hemi.intensity = sk.hemiI * (1 - evK * 0.45);
  hemi.color.copy(hemiSky).lerp(hemiNight, nightK);
  sun.intensity = sk.sunI * (1 - evK * 0.65);
  sun.color.copy(sk.sunC);
  scene.background = scene.background || new THREE.Color();
  scene.background.copy(sk.hor).lerp(curEvent === 'blackout' ? NIGHT_BG : RAIN_GREY, Math.min(1, evK * 1.2));
  scene.fog.color.copy(scene.background);
  renderer.toneMappingExposure = 1.05 - nightK * 0.1;
  if (bloomPass) bloomPass.threshold = 3.2 - nightK * 1.8; // ban ngày không có gì bị loá; ban đêm chỉ đèn/cửa sổ/chùm đèn pha (độ sáng > 1) mới toả sáng, chữ trắng thì không
  // chữ bong bóng thoại và bảng tên dịu đi về đêm (trắng tinh trên nền tối rất chói)
  const textDim = 1 - 0.42 * nightK;
  for (const e of ents.values()) { e.bubble.material.color.setScalar(textDim); e.tag.material.color.setScalar(textDim); if (e.alertIcon) e.alertIcon.material.color.setScalar(textDim); }
  const lampK = curEvent === 'blackout' ? 0 : nightK; // cúp điện thì đèn tắt
  world.lampMat.emissiveIntensity = 0.05 + lampK * 2.4;
  world.windowMat.emissive.setRGB(1 * lampK, 0.85 * lampK, 0.4 * lampK);
  for (const l of lampLights) l.intensity = 100 * lampK;

  const nowS = now / 1000;
  for (const e of ents.values()) {
    const isMe = e.id === myId.v;
    if (!isMe) interpolate(e, nowS); // người/NPC khác: nội suy giữa hai gói tin đã nhận (vẽ chậm một nhịp ngắn, không bao giờ vọt quá)
    else e.ry = lerpAngle(e.ry, e.try, 1 - Math.exp(-dt * 14));
    // quãng đường thật đã đi trong khung hình này (cả bản thân lẫn người khác): dùng cho nhịp bước chân
    e.stepDist = Math.hypot(e.x - e.lx, e.z - e.lz); e.lx = e.x; e.lz = e.z;
    // người ở xa ngoài tầm nhìn camera: không dựng/hoạt hoạ để giảm tải (NPC, quản giáo, người chơi khác)
    const far = !isMe && (Math.abs(e.x - camFocus.x) > 64 || Math.abs(e.z - camFocus.z) > 52);
    e.group.visible = !far;
    if (far) continue;
    e.group.position.x = e.x; e.group.position.z = e.z;
    e.group.rotation.y = e.ry;
    // tốc độ làm mượt để nhịp chân không nhảy cóc
    const inst = e.stepDist / Math.max(dt, 0.001);
    e.speed += (inst - e.speed) * (1 - Math.exp(-dt * 10));
    animateCharacter(e, dt, e.speed < 0.25 ? 0 : e.speed, time, e.kind === 'guard' && e.alert === 1);
    if (e.alertIcon) { e.alertIcon.visible = e.alert === 1; if (e.alert === 1) e.alertIcon.position.y = 3.2 + Math.abs(Math.sin(time * 8)) * 0.25; }
    if (e.bubbleT > 0) { e.bubbleT -= dt; if (e.bubbleT <= 0) e.bubble.visible = false; }
  }

  // hình quạt tầm nhìn quản giáo (chỉ cập nhật cho quản giáo ở gần, mỗi 2 khung hình)
  const range = (night ? RULES.guardRangeNight : RULES.guardRange) * (curEvent === 'blackout' ? RULES.blackoutRange : 1);
  coneFrame++;
  for (const [id, cone] of guardCones) {
    const e = ents.get(id);
    if (!e) continue;
    const near = Math.abs(e.x - camFocus.x) < 46 && Math.abs(e.z - camFocus.z) < 36;
    cone.visible = near;
    if (!near) continue;
    cone.position.set(e.x, 0, e.z);
    if ((coneFrame + cone.id) % 2 === 0) updateCone(cone, e, range);
    cone.material.color.set(e.alert === 1 ? 0xff5a4a : 0xffe066);
    cone.material.opacity = (e.alert === 1 ? 0.3 : 0.2) + (night ? 0.08 : 0);
  }
  updateBeams(night && curEvent !== 'blackout', nightK);
  lampTimer -= dt;
  if (lampTimer <= 0) { lampTimer = 0.6; assignLamps(); }

  // vòng trạm nhấp nháy
  const pulse = 0.55 + Math.sin(time * 3) * 0.3;
  const goal = snap && snap.me.goal && !snap.me.goal.free ? snap.me.goal : null;
  for (const { ring, disc, s } of world.rings) {
    ring.material.opacity = pulse;
    const isGoal = goal && Math.hypot(goal.x - s.x, goal.z - s.z) < 0.1;
    disc.material.opacity = isGoal ? 0.35 + Math.sin(time * 6) * 0.15 : 0.16;
  }
  if (snap && snap.me.near) for (const { ring, s } of world.rings) if (s.id === snap.me.near.id) ring.material.opacity = 1;

  // bom + vụ nổ
  for (const b of bombs.values()) {
    b.spark.visible = Math.sin(time * 28) > -0.2;
    if (b.fly) { // đang bay theo vòng cung rồi nảy nhẹ khi chạm đất
      const f = b.fly; f.t += dt;
      const u = Math.min(1, f.t / f.dur);
      b.g.position.x = f.ox + (f.x - f.ox) * u; b.g.position.z = f.oz + (f.z - f.oz) * u;
      b.g.position.y = 1.1 * (1 - u) + Math.sin(Math.PI * u) * (0.6 + Math.hypot(f.x - f.ox, f.z - f.oz) * 0.22);
      b.g.rotation.x += dt * 14; b.g.rotation.z += dt * 9;
      if (u >= 1) { b.fly = null; b.g.rotation.set(0, 0, 0); sfxAt('thud', f.x, f.z, me.x, me.z, 20); }
    } else b.g.position.y = Math.max(0, b.g.position.y - dt * 4);
  }
  for (let i = flights.length - 1; i >= 0; i--) { // viên đá ném
    const f = flights[i]; f.t += dt;
    const u = Math.min(1, f.t / f.dur);
    f.m.position.set(f.ox + (f.x - f.ox) * u, 1.3 * (1 - u) + Math.sin(Math.PI * u) * (0.9 + Math.hypot(f.x - f.ox, f.z - f.oz) * 0.12) + 0.13, f.oz + (f.z - f.oz) * u);
    f.m.rotation.x += dt * 18; f.m.rotation.y += dt * 11;
    if (u >= 1) { scene.remove(f.m); f.m.geometry.dispose(); f.m.material.dispose(); flights.splice(i, 1); }
  }
  for (let i = blasts.length - 1; i >= 0; i--) {
    const b = blasts[i];
    b.t += dt;
    const k = b.t / 0.6;
    b.m.scale.setScalar(0.5 + k * RULES.bombRadius * 1.1);
    b.m.material.opacity = Math.max(0, 0.85 * (1 - k));
    b.light.intensity = Math.max(0, 400 * (1 - k * 1.5));
    b.flash.scale.setScalar(2 + k * 14); b.flash.material.opacity = Math.max(0, 1 - k * 2.2);
    b.wave.scale.setScalar(0.6 + k * RULES.bombRadius * 1.5); b.wave.material.opacity = Math.max(0, 0.8 * (1 - k));
    if (k >= 1) {
      scene.remove(b.m, b.light, b.flash, b.wave);
      b.m.geometry.dispose(); b.m.material.dispose(); b.flash.material.dispose(); b.wave.geometry.dispose(); b.wave.material.dispose();
      blasts.splice(i, 1);
    }
  }
  for (let i = scorches.length - 1; i >= 0; i--) { // vết cháy xém mờ dần
    const s = scorches[i]; s.t += dt;
    s.m.material.opacity = Math.max(0, 0.55 * (1 - s.t / 25));
    if (s.t >= 25) { scene.remove(s.m); s.m.geometry.dispose(); s.m.material.dispose(); scorches.splice(i, 1); }
  }
  shake = Math.max(0, shake - dt * 1.6);

  meRing.position.set(me.x, 0.1, me.z);
  updateParticles(dt);
  updateRain(dt, curEvent === 'rain');
  animateGates(world, dt);
  if (curEvent === 'rain' && Math.random() < dt * 40) spawn(camFocus.x + (Math.random() - 0.5) * 40, 0.05, camFocus.z + (Math.random() - 0.5) * 30, 1, 0xaecbe8, 0.5, 1.4, 0.25); // bắn nước mưa trên nền
  updateArrows(dt, time);

  // Camera cố định: góc nhìn luôn giống nhau, chỉ điểm bám theo người chơi được làm mượt (không bị lệch góc khi chạy)
  const k = 1 - Math.exp(-dt * 12);
  camFocus.x += (me.x - camFocus.x) * k;
  camFocus.z += (me.z - camFocus.z) * k;
  if (Math.hypot(me.x - camFocus.x, me.z - camFocus.z) > 6) { camFocus.x = me.x; camFocus.z = me.z; }
  const sx = shake ? (Math.random() - 0.5) * shake * 1.2 : 0, sz = shake ? (Math.random() - 0.5) * shake * 1.2 : 0;
  if (camMode === 'third') { // ngôi thứ ba: camera quay quanh nhân vật theo yaw/pitch người chơi kéo
    const d = 9 * zoom, cp = Math.cos(camPitch);
    camera.position.set(camFocus.x + Math.sin(camYaw) * cp * d + sx, 1.5 + Math.sin(camPitch) * d, camFocus.z + Math.cos(camYaw) * cp * d + sz);
    camera.lookAt(camFocus.x + sx, 1.3, camFocus.z + sz);
  } else {
    const dist = 17 * zoom, height = 24 * zoom;
    camera.position.set(camFocus.x + sx, height, camFocus.z + dist + sz);
    camera.lookAt(camFocus.x + sx, 0.6, camFocus.z - 1 + sz);
  }
  updateMouseHint();
  separateBubbles(dt);
  // bóng đổ đi theo người chơi (cắt theo ô texel để không nhấp nháy); mặt trời/mặt trăng chạy theo giờ nên bóng dài ngắn và đổi hướng
  const texel = (SH * 2) / sun.shadow.mapSize.x;
  const fx = Math.round(camFocus.x / texel) * texel, fz = Math.round(camFocus.z / texel) * texel;
  let arc, arcT;
  if (hour < 21) arcT = Math.max(0, Math.min(1, (hour - 6) / 12)); // mặt trời: 6h mọc phía đông -> 18h lặn phía tây, rồi hạ thấp tới 21h
  else if (hour < 28) arcT = (hour - 21) / 7; // mặt trăng: 21h -> 4h
  else arcT = 0; // gần sáng: mặt trời chớm mọc phía đông
  arc = arcT * Math.PI;
  sun.target.position.set(fx, 0, fz);
  sun.position.set(fx - Math.cos(arc) * 30, Math.max(10, Math.sin(arc) * 48), fz + 16);

  if (composer) composer.render(); else renderer.render(scene, camera);
  if (joined && (mmFrame++ & 1) === 0) drawMinimap(time);
}
resize();
requestAnimationFrame(frame);
setupBloom().then(resize);
