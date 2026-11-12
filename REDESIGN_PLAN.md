# Phương án cải tổ gameplay: bớt nhàm, minigame khó và đáng chơi hơn, vòng lặp vui hơn

Cập nhật 2026-11-12. **Trạng thái: giai đoạn 0 (số đo `[minigame]`), giai đoạn 1 (A1, A2, A4, A5) và phần của giai đoạn 2 (A3 cược, B1 hợp đồng, B2 mức nóng) ĐÃ LÀM** (chi tiết: `CONTEXT.md` Đợt 11, test `npm run test:mg`). Còn lại: A6, A7, B3–B8 (một phần), cấu trúc ván và tiến trình (mục 5), cần chủ dự án trả lời mục 9 và chơi thử để cân bằng.

Bản thiết kế gốc: Phản hồi của người chơi: "hơi nhàm, minigame quá dễ, logic game chưa đủ vui".

## 1. Chẩn đoán (từ mã nguồn hiện tại)

| Quan sát | Hệ quả |
|---|---|
| Vòng lặp chính: đến trạm → minigame → +điểm → đủ 300 → ra Cổng trại. Mọi trạm cùng một công thức. | Sau 10 phút đã biết hết, chỉ còn "cày". |
| Minigame **độ khó cố định**: `timing` 3 vòng vùng 0,18; `keys` 6–7 phím trong 7–9 giây; `wires` luôn 4; `memory` 3 vòng 2 mạng; `sort` 9; `pairs` 6 cặp / 30 giây; `mash` 8 giây... không đổi theo ngày, kỹ năng, mệt mỏi. | Quá dễ, không có tiến bộ, không có căng thẳng. |
| Thất bại gần như không có giá: làm kém chỉ được ít điểm hơn. | Không có rủi ro → không có quyết định. |
| Lịch sinh hoạt cứng (7 giai đoạn) với phạt vắng mặt. | Người chơi bị "đẩy đi" theo lịch hơn là tự chọn. |
| Mục tiêu duy nhất: 300 điểm hoặc vượt ngục. Vượt ngục là phần sâu nhất nhưng chỉ có 2 đường (hầm, hàng rào), cùng kiểu "đủ đồ rồi làm minigame". | Ít lựa chọn chiến thuật, ít lý do để chơi lại. |
| Tương tác giữa người chơi gần như chỉ có tặng Jack và đào hầm chung. | Chơi nhiều người nhưng mỗi người chơi một mình. |
| Không có kết thúc ván, không có tiến trình lâu dài (bảng xếp hạng mất khi restart). | Không có động lực quay lại. |

## 2. Nguyên tắc thiết kế
1. **Mọi lựa chọn phải có đánh đổi** (rủi ro ↔ phần thưởng, thời gian ↔ an toàn).
2. **Độ khó phải bám theo người chơi**: dễ khi mới, khó dần theo kỹ năng và theo ngày.
3. **Mỗi ván khác nhau**: sự kiện, hợp đồng, quản giáo, đường vượt ngục đổi theo ván.
4. **Người chơi tạo ra câu chuyện cho nhau** (hợp tác, phản bội, buôn lậu).
5. Server quyết định (chống gian lận), nhưng không đổi luật cũ trừ khi nêu rõ.

## 3. Trụ cột A: Minigame khó và đáng chơi

### A1. Độ khó thích ứng
- Mỗi trạm/loại có **cấp thành thạo** (0–5) của người chơi, tăng khi đạt tốt, giảm nhẹ khi hỏng. Tham số khó = `base + level·step + day·step2 − mệt/Reddog`.
- Ví dụ (đích cấp 5): `timing` vùng 0,18 → 0,07, tốc độ 2,2 → 3,6, vòng 3 → 5; `keys` 6 → 12 phím, thêm phím nhiễu và giới hạn giờ chặt hơn; `wires` 4 → 8 dây có dây giả; `memory` chuỗi dài dần, mất 1 mạng khi sai; `pairs` 6 → 10 cặp trong 30 giây; `balance` thêm gió/rung ngẫu nhiên; `pong`/`bricks` bóng nhanh dần.
- Điểm thưởng tỉ lệ với độ khó nên người giỏi vẫn tiến nhanh hơn.

### A2. Hạng chất lượng + chuỗi (combo)
Thay "điểm 0–1" bằng 4 hạng: Hỏng / Đạt / Tốt / Hoàn hảo. Làm **Tốt/Hoàn hảo liên tiếp** tăng hệ số thưởng (tối đa x2), hỏng thì mất chuỗi. Thể hiện rõ trên HUD.

### A3. Đánh cược (push-your-luck)
Sau mỗi lượt đạt, hỏi "**Làm tiếp vòng khó hơn để x2 thưởng?**" (tối đa 3 vòng). Hỏng ở vòng cược thì mất lượt thưởng và tốn sức. Đây là nguồn quyết định chính cho người giỏi.

### A4. Hậu quả khi hỏng
Hỏng nặng: mất sức nhiều hơn, tiếng động lớn (quản giáo nghe), hoặc bị "ghi lỗi" (trạm lao động: lỗi sản xuất → tăng cảnh cáo). Việc hợp lệ ban ngày vẫn không bị báo động nếu làm đạt.

### A5. Biến thể mỗi lượt (mutator)
Mỗi lượt ngẫu nhiên thêm 1 biến thể nhẹ: đảo phím, bị che một phần màn hình, thêm nhiễu âm thanh, có đồng hồ đếm ngược chặt, hai việc song song. Làm cùng một minigame không còn lặp lại y hệt.

### A6. Minigame hợp tác 2 người
Ít nhất 3 loại: khiêng đồ (hai người giữ nhịp đồng bộ), đào hầm đôi (một người canh, một người đào, có tín hiệu), ghép mật mã (mỗi người thấy một nửa). Thưởng cao hơn làm một mình.

### A7. Chấm điểm trên server (chống gian lận)
Client gửi nhật ký thao tác (phím/thời điểm/vị trí), server tính lại điểm. Làm trước cho `timing`, `keys`, `mash`, `wires`, `sort`; các loại vật lý (`pong`, `bricks`) kiểm tra xác suất hợp lý. Thiếu bước này thì tăng độ khó cũng vô nghĩa vì có thể gửi điểm giả.

## 4. Trụ cột B: Logic game vui hơn

### B1. Hợp đồng và nhiệm vụ (thay "cày điểm")
Mỗi ngày/mỗi giai đoạn có **3 hợp đồng ngẫu nhiên** (cá nhân hoặc phòng): "làm 3 ca xưởng đạt Tốt", "giao gói hàng cho Tày Scam mà không bị khám", "lấy đồ từ buồng X lúc điểm danh". Thưởng Jack/điểm/vật phẩm hiếm. Một số hợp đồng **chỉ ban đêm / có rủi ro**.

### B2. Mức "nóng" (heat) và uy tín
- Mức nóng cá nhân tăng khi gây ồn, vi phạm, bị khám; giảm khi làm đúng việc. Mức cao → quản giáo tuần tra gần bạn hơn, khám nhiều hơn.
- Uy tín với **quản giáo** (hối lộ, được nới lỏng, biết lịch tuần tra) và với **băng nhóm tù** (bảo kê, giao dịch). Có thể chọn phe, có thể bị phản.

### B3. Nhiều đường vượt ngục, mỗi đường một "chuỗi" khác nhau
Hiện có hầm và hàng rào. Thêm 2–3 đường, **mỗi ván chỉ mở ngẫu nhiên 2–3 đường**:
- **Cải trang**: lấy đồng phục quản giáo, qua cổng bằng minigame giả giọng/giấy tờ.
- **Hối lộ**: mua chuộc một quản giáo (tốn nhiều Jack, có xác suất bị phản).
- **Xe giao hàng / cống ngầm**: cần phối hợp hai người, có cửa sổ thời gian.
Mỗi đường có đồ, minigame, rủi ro riêng, nên phải chọn chiến thuật.

### B4. Vai trò (chuyên môn)
Chọn/được chia vai ở đầu ván: **Thợ đào** (đào nhanh), **Trộm** (mở khoá, lấy đồ), **Nhà buôn** (giá chợ đen tốt, giao dịch), **Mật báo** (xem tuần tra, nhưng bị ghét). Mỗi vai có 1 kỹ năng chủ động và 1 điểm yếu → cần hợp tác.

### B5. Kinh tế và giao dịch giữa người chơi
Chuyền đồ, cầm đồ, mua bán trực tiếp, hàng lậu giá dao động theo ngày. Thêm "chợ ngầm" giữa người chơi thay vì chỉ NPC Tày Scam. Có chỗ tiêu Jack để Jack luôn có giá trị.

### B6. Sự kiện có lựa chọn
Sự kiện hiện chỉ là mưa/cúp điện/khám buồng. Thêm sự kiện **có hai lựa chọn khó**: ban thanh tra đến (giấu đồ hay bán đồ), bạo loạn (tham gia hay giúp quản giáo), có người nhờ báo tin (phản bội lấy thưởng?). Một số sự kiện mở cơ hội vượt ngục tạm thời.

### B7. Quản giáo thông minh hơn khi ván trôi qua
Ngày càng khó: quản giáo nhớ vị trí bạn bị bắt, đổi tuyến tuần tra theo ngày, có quản giáo trưởng đi khám bất ngờ, có camera/cửa khoá mới. Tránh việc tuần tra đoán trước được sau vài ngày.

### B8. Lịch sinh hoạt bớt cưỡng ép
Giữ lịch, nhưng đổi phạt thành **thưởng cho người đúng lịch** (điểm danh đủ = thưởng nhỏ, ưu tiên hàng ăn) và chỉ phạt nặng khi bị bắt gặp. Giờ tự do trở thành thời điểm chiến lược (buôn bán, lập kế hoạch, đào hầm chuẩn bị) thay vì "làm mọi thứ bạn muốn" mơ hồ.

## 5. Trụ cột C: Cấu trúc ván và tiến trình lâu dài
- **Ván có kết thúc rõ**: ví dụ 7–10 ngày game (~50–70 phút) hoặc đến khi một người thoát thành công. Cuối ván có màn tổng kết (ai thoát, ai bị bắt, ai giàu nhất, danh hiệu).
- **Tiến trình giữa các ván**: cấp bậc, danh hiệu, thành tích, đồ cosmetic (màu áo, tóc, mũ). Bảng xếp hạng lưu bền (tệp/SQLite).
- **Mục tiêu phụ** để mỗi ván khác nhau: "thoát không để ai thấy", "thoát cùng đồng đội", "giàu nhất khi mãn hạn".

## 6. Số đo để biết có vui hơn không (cần có telemetry nhẹ)
Ghi log phía server (ẩn danh, không lưu thông tin cá nhân): tỉ lệ hỏng từng minigame, thời gian từng lượt, số lần vượt ngục thử/thành công, thời gian ở mỗi giai đoạn, số người bỏ giữa ván.

| Chỉ số | Hiện tại (ước đoán) | Mục tiêu |
|---|---|---|
| Tỉ lệ hỏng/đạt thấp của minigame (người chơi trung bình) | ~0–5% | 25–40% ở cấp 3+ |
| Thời gian tới lần thử vượt ngục đầu tiên | không đo | 15–25 phút |
| Tỉ lệ người chơi ở lại ≥ 20 phút | không đo | ≥ 50% |
| Số đường vượt ngục khác nhau được dùng trong 10 ván | 2 | ≥ 4 |
| Phản hồi "nhàm" khi hỏi lại | có | giảm rõ rệt (hỏi 5 người thử) |

## 7. Lộ trình làm

| Giai đoạn | Việc | Công | Nghiệm thu |
|---|---|---|---|
| **0. Nền** (làm trước) | Telemetry nhẹ ở server; chơi thử với 3–5 người thật và ghi phản hồi; chốt thứ tự ưu tiên | S–M | Có bảng số liệu nền (mục 6) |
| **1. Minigame** (thắng nhanh) | A1 độ khó thích ứng, A2 hạng + chuỗi, A4 hậu quả, A5 mutator, chỉnh tham số các loại | M | Tỉ lệ hỏng đạt mục tiêu; test bots cập nhật |
| **2. Vòng lặp lõi** | B1 hợp đồng, B2 nóng/uy tín, A3 đánh cược, B8 chỉnh lịch | L | Người thử thấy luôn có việc đáng làm, không chỉ cày |
| **3. Chiều sâu** | B3 thêm đường vượt ngục, B4 vai trò, B6 sự kiện có lựa chọn, B7 quản giáo thông minh | L+ | Mỗi ván có chiến thuật khác nhau |
| **4. Xã hội và tiến trình** | B5 giao dịch, A6 minigame đôi, cấu trúc ván + tổng kết, lưu xếp hạng, danh hiệu/cosmetic | L+ | Có lý do quay lại, có kết thúc ván |
| **5. Chống gian lận** | A7 chấm điểm server (có thể làm song song giai đoạn 1–2) | L | Gửi điểm giả bị từ chối |

Đề xuất **làm 0 → 1 trước** (ít rủi ro, thấy thay đổi ngay), rồi 2. Các phần sau tuỳ phản hồi.

## 8. Rủi ro và lưu ý
- Tăng độ khó dễ làm **người mới nản**: bắt buộc có độ khó thích ứng và hướng dẫn nhẹ ở cấp thấp, không tăng thẳng.
- Nhiều tính năng (vai trò, hợp đồng, phe phái) làm **cân bằng khó**: thêm từng cái, chơi thử rồi mới thêm tiếp.
- Cần cập nhật `server/test-bots.js` theo luật mới; mỗi giai đoạn chạy đủ 4 bộ test.
- Giữ hiệu năng: logic mới phải nhẹ (xem `OPTIMIZE_PLAN.md`); không đưa thêm việc nặng vào nhịp 30 Hz.
- Thay đổi gameplay lớn nên đi cùng **phiên bản/ghi chú** để người chơi biết luật đã đổi.

## 9. Cần chủ dự án quyết định
1. Ưu tiên chính: **minigame khó hơn** hay **vòng lặp/cốt truyện mới** (đề xuất cả hai, minigame trước)?
2. Có muốn **ván có kết thúc** (7–10 ngày) thay vì chơi liên tục không?
3. Có chấp nhận **lưu dữ liệu người chơi** (xếp hạng, danh hiệu) không? Nếu có thì cần tệp/DB và chỗ lưu bền (gói miễn phí Render không giữ ổ đĩa).
4. Hướng tone: giữ nghiêm túc/lén lút, hay thêm hài hước (sự kiện vui, NPC kỳ quặc)?
5. Ai sẽ chơi thử và khi nào (giai đoạn 0 cần 3–5 người)?
