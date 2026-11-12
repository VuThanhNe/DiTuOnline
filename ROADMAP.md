# Lộ trình phát triển tiếp theo

Cập nhật 2026-11-12. Chi tiết kỹ thuật từng mã việc nằm trong `OPTIMIZE_PLAN.md`; lịch sử thay đổi trong `CONTEXT.md`.

## Giai đoạn 1 — Xác nhận bằng số đo thật (làm trước, cần chủ dự án)

| # | Việc | Ai | Nghiệm thu |
|---|---|---|---|
| 1 | Tạo lại dịch vụ Render ở **Singapore** (N1), push code | Chủ dự án | Ping F3 từ Việt Nam < 100 ms |
| 2 | Chơi 5 phút trên Render thật, ghi số F3 + `/status` vào `CONTEXT.md` (M4) | Chủ dự án + Claude | Có bảng "số nền" |
| 3 | Thử trên máy yếu/điện thoại + CPU throttle 4x: xem bậc tự động ở F3 (C1) | Chủ dự án | FPS ≥ 30, không tụt bậc oan |
| 4 | Cài `ffmpeg`, nén `night.mp3` 33 MB xuống < 8 MB (L2) | Chủ dự án | Tải lần đầu nhẹ hơn rõ rệt |

Nếu sau bước 1–2 triệu chứng khựng đã hết thì các giai đoạn sau là cải thiện thêm, không gấp.

## Giai đoạn 2 — Tối ưu còn lại (P1)

| Mã | Việc | Công | Ghi chú |
|---|---|---|---|
| N4 | Nội suy người khác theo đồng hồ server (`lc`), bộ đệm tự theo jitter | M | Hết rung khi mạng nhiễu |
| S2 | `nearStation`/`availability` và `updateDetection` bỏ qua khi không cần | M | Giảm ≥ 30% thời gian nhịp; viết `test-load.js` để đo |
| C2 | Gộp mesh nhân vật (≈25 → ≤10), tắt bóng nhân vật ở xa | L | Làm sau khi có số draw call thật |
| N6 | Snapshot chỉ gửi thực thể đổi, cân nhắc nhị phân | L | Giảm ≥ 40% băng thông; phải sửa test |

## Giai đoạn 3 — Tối ưu P2 và vận hành

C5 (bóng cập nhật 30 lần/giây, bớt đèn điểm), S3 (cache tìm đường), L4 (màn hình tải có tiến độ), R3 (giữ server thức, đọc log), R4 (GitHub Actions chạy test).

## Giai đoạn 4 — Nội dung và độ tin cậy của game

Các việc dưới đây thuộc về gameplay, chưa nằm trong kế hoạch tối ưu; làm sau khi mạng ổn định.

| Việc | Lý do | Công |
|---|---|---|
| Chấm điểm minigame trên server (client gửi nhật ký phím/thời điểm) | Hiện điểm do client báo, dễ gian lận | L |
| Chơi thử với người thật rồi cân bằng lại (300 điểm, giá chợ đen, ca lao động, độ khó đào hầm/cắt rào) | Số liệu hiện là ước tính | M |
| Chuyền đồ giữa người chơi, canh gác hộ, tố giác | Còn trong danh sách "chưa làm" | L |
| Lưu bảng xếp hạng bền vững (tệp hoặc DB nhỏ) | Hiện mất khi server khởi động lại | M |
| Biểu tượng trạm thay emoji, bổ sung danh sách từ tục | Hoàn thiện giao diện/kiểm duyệt chat | S |

## Nguyên tắc
Đo trước, sửa sau; không đổi luật chơi để "đỡ lag"; mỗi việc một commit; sau mỗi việc chạy đủ `test:patrol`, `test:bots`, `test:lobby`, `test:netcode`.
