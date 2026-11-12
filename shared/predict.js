// Dự đoán phía client + đối chiếu với server (dùng chung cho client và bộ kiểm thử mô phỏng mạng trễ).
// Client lưu các lệnh đã gửi (hist: { seq, mx, mz, sneak, run, t(ms) }). Khi nhận vị trí server (đã xử lý tới lệnh m.seq,
// và đã áp dụng lệnh đó được m.ia mili giây), chạy lại phần lệnh server CHƯA xử lý trên vị trí server để biết vị trí "đúng" hiện giờ.
import { stepMove, moveSpeed } from './sim.js';

export function predictFromServer(m, hist, now, st) {
  while (hist.length && hist[0].seq < m.seq) hist.shift();
  const tmp = { x: m.x, z: m.z, labor: st.labor };
  // skip: phần dòng thời gian (tính từ lúc gửi lệnh m.seq) mà server đã xử lý xong
  // m.ia âm: server mô phỏng còn THIẾU so với mốc gửi lệnh m.seq (lệnh đến sớm) -> phải chạy bù thêm chừng đó
  let skip = hist.length && hist[0].seq === m.seq ? Math.max(-0.3, Math.min(0.6, (m.ia || 0) / 1000)) : 0;
  for (let i = 0; i < hist.length; i++) {
    const h = hist[i];
    let dur = Math.min(0.6, ((i + 1 < hist.length ? hist[i + 1].t : now) - h.t) / 1000);
    if (skip > 0) { const cut = Math.min(skip, dur); dur -= cut; skip -= cut; } else if (skip < 0) { dur -= skip; skip = 0; }
    const sp = moveSpeed({ boost: st.boost, en: st.en, sneak: h.sneak, run: h.run });
    while (dur > 1e-4) { const s = Math.min(dur, 1 / 30); if (h.mx || h.mz) stepMove(tmp, h.mx, h.mz, s, sp); dur -= s; }
  }
  return tmp;
}

// Quyết định sửa bao nhiêu phần của độ lệch err (mét). Trả { k, snap, counted }:
// snap = nhảy thẳng (lệch rất xa: dịch chuyển); k = tỉ lệ kéo về trong lần này; counted = tính là một lần "bị sửa vị trí".
export function correctionFor(err, moving, st) {
  const tol = Math.max(0.3, moveSpeed({ boost: st.boost, en: st.en, sneak: false, run: true }) * 0.05); // sai số cho phép tỉ lệ theo tốc độ
  if (err > 3) return { k: 1, snap: true, counted: true };
  if (err > tol) return { k: 0.35, snap: false, counted: true };
  if (!moving && err > 0.02) return { k: 0.3, snap: false, counted: false }; // đứng yên: hội tụ về vị trí đúng
  if (moving && err > 0.08) return { k: 0.06, snap: false, counted: false }; // đang đi: kéo rất nhẹ để không tích luỹ sai số
  return { k: 0, snap: false, counted: false };
}
