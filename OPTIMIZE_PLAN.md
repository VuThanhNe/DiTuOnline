# Kế hoạch tối ưu hoá: làm game mượt và ổn định

Tài liệu này là **bản giao việc** cho một model/lập trình viên khác. Đọc hết phần 1–3 trước khi làm. Làm theo thứ tự ở phần 4; mỗi việc có tiêu chí nghiệm thu đo được.

## 0. Trạng thái (cập nhật 2026-11-12, sau đợt tối ưu đầu tiên)

**Đã làm xong** (chi tiết ở `CONTEXT.md`, mục "Đợt 9"): M1, M2, M3, N2, N3, N5 (phần gửi ngay khi đổi điều khiển), L1, L3, R2, và một phần của C3 (dùng lại object tư thế), C4 (minimap 10 lần/giây). N1 đã sửa `render.yaml` nhưng **chủ dự án phải tạo lại dịch vụ ở Singapore**. R1 hoá ra đã hoạt động sẵn (vào lại bằng `sid` lạ thì được cho vào như người mới).

**Còn lại cho người làm tiếp:** M4 (đo số nền trên Render thật), N4, N6, N7, S1, S2, S3, C1, C2, phần còn lại của C3 và C4, C5, C6, L2 (cần `ffmpeg`), L4, R3, R4.

**Công cụ đã có để đo:** phím **F3** trong game (FPS, ping, khoảng cách gói, số lần bị sửa vị trí, số lệnh vẽ), tham số `?lag=120&jitter=30` (giả lập mạng trễ), `window.__diag()` (đọc số đo bằng script), `/status` (số đo nhịp server), `npm run test:netcode` (mô phỏng mạng trễ với server thật, so thuật toán cũ và mới).

**Lưu ý khi đo bằng trình duyệt tự động:** nếu cửa sổ bị che/thu nhỏ, trình duyệt giới hạn `requestAnimationFrame` còn 1 lần/giây và mọi số đo sẽ sai. Kiểm tra FPS trên bảng F3 trước khi tin số đo.

## 1. Bối cảnh

- Game: "Đi Tù Online", 3D nhiều người chơi trên trình duyệt. Node.js + `ws` (server quyết định mọi thứ), Three.js (client). Đọc `CONTEXT.md` để nắm kiến trúc và lịch sử thay đổi, `DEPLOY.md` để nắm cách deploy.
- Đang chạy trên **Render gói miễn phí** (theo tài liệu Render: máy dùng chung, ngủ sau 15 phút không lưu lượng, có thể bị khởi động lại bất kỳ lúc nào).
- **Triệu chứng người dùng báo:** game "khựng và lag" dù chỉ có 1 người chơi, sau khi deploy lên Render. Chạy trên máy cá nhân (localhost) thì không thấy báo lỗi này.

### Số đo đã có (đo trên máy dev, ngày 2026-11-12)

| Hạng mục | Kết quả | Kết luận |
|---|---|---|
| Client, 1 người, chất lượng Cao, 1536x838, localhost | 70 khung hình/giây, p99 = 18,5 ms, không có khung nào > 33 ms | Trên máy này **dựng hình không phải nút thắt** |
| Server, phòng 30 người cùng di chuyển | 0,19 ms mỗi nhịp (ngân sách 33 ms), RSS 56 MB | Logic server rất nhẹ trên máy dev |
| Băng thông | ~14 KB/s mỗi người (JSON, 15 gói/giây) | ~1,5 GB/giờ khi phòng đầy |
| Tải lần đầu | `three.module.js` 1.315 KB, `client.js` 86 KB, `world.js` 67 KB, `minigames.js` 55 KB, `map.js` 32 KB; **không nén** (server không gửi `Content-Encoding`) | ~1,6 MB JS không nén |
| Nhạc | `public/music/night.mp3` **33 MB**, `day.mp3` 1,5 MB | Bài đêm quá nặng |

Vì localhost mượt mà Render thì lag với 1 người, **nghi vấn hàng đầu là mạng và môi trường server, không phải đồ hoạ**. Nhưng đây mới là suy luận: **việc đầu tiên là đo** (nhóm M) để xác nhận trước khi tối ưu.

### Giả thuyết nguyên nhân, xếp theo khả năng

1. **Độ trễ do vùng đặt server.** `render.yaml` không khai báo `region`, nên dịch vụ nhiều khả năng nằm ở vùng mặc định của Render (Mỹ). Người chơi ở Việt Nam sẽ có độ trễ khứ hồi khoảng 200–300 ms. Render có vùng Singapore. *Chưa xác minh dịch vụ hiện đang ở vùng nào: cần xem trong dashboard.*
2. **Đối chiếu vị trí (reconciliation) quá nhạy khi mạng trễ.** `predictFromServer` trong `public/client.js` giả định lệnh đã xác nhận được server áp dụng trọn 50 ms; sai số thật có thể tới 50 ms × tốc độ chạy 7,5 m/s ≈ 0,37 m, **lớn hơn ngưỡng sửa 0,3 m**, nên nhân vật bị kéo 25% mỗi gói → giật. Ngoài ra server coi input cũ quá 400 ms là "thả phím" (`updatePlayer` trong `server/game.js`): mạng nghẽn nửa giây là nhân vật đứng khựng rồi bị giật về.
3. **CPU dùng chung của gói miễn phí.** `setInterval` 30 Hz có thể bị trễ; `dt` bị chặn trên 0,1 s (`server/index.js`) nên khi server khựng thì thời gian game bị "mất", client dự đoán đi xa hơn server → bị kéo lại.
4. **Nội suy người khác dựa vào thời điểm nhận gói** (`track`/`interpolate` trong `client.js`): mạng rung (jitter) là chuyển động rung theo.
5. **Client trên máy yếu/điện thoại** (chưa đo): mỗi nhân vật ~25 mesh, bóng đổ 2048, bloom, tia quét hình quạt của 11 quản giáo, vẽ lại minimap mỗi 2 khung hình, cấp phát bộ nhớ mỗi khung hình (gây GC).
6. **Tải lần đầu chậm**: không nén, không dùng bản `min` của three, nhạc 33 MB.

## 2. Quy tắc khi làm

- **Không đổi luật chơi, cân bằng, hay giao diện** trừ khi việc ghi rõ. Đây là việc tối ưu.
- Sau mỗi việc phải chạy: `npm run test:patrol`, `npm run test:bots`, `npm run test:lobby` (cả ba phải đạt; `test:bots` chạy 3 lần liên tiếp để chắc không chập chờn).
- Việc nào đụng tới client thì phải mở game thật trong trình duyệt, vào chơi, kiểm tra console không có lỗi.
- Mỗi việc một commit riêng, thông điệp nêu mã việc (ví dụ `N2: noi long nguong doi chieu`). **Không `git push`**: chủ dự án tự đẩy (đẩy lên `main` là Render tự deploy).
- Xong mỗi nhóm thì thêm một mục vào `CONTEXT.md` (làm gì, số đo trước/sau).
- Ghi số đo **trước và sau** cho mọi việc có tiêu chí định lượng. Không đo được thì nói rõ là chưa đo, đừng ghi "đã cải thiện".
- `public/style.css` không phải UTF-8 hợp lệ: sửa bằng lệnh giữ nguyên byte (đọc/ghi Latin-1), chỉ thêm ký tự ASCII.
- Biến môi trường `DEV=1` chỉ dùng khi thử ở máy cá nhân.
- Windows: máy dev không có `ffmpeg`; `git` nằm ở `C:\Program Files\Git\cmd\git.exe`.

## 3. Cách chạy và đo

```bash
npm install
npm start                      # http://localhost:3000
PORT=3999 DEV=1 node server/index.js   # bản thử, cho phép lệnh dev qua WebSocket
```

Thước đo dùng chung cho cả kế hoạch (nhóm M sẽ tạo công cụ để lấy các số này):

| Chỉ số | Cách lấy | Mục tiêu |
|---|---|---|
| Độ trễ khứ hồi (ping) | tin nhắn ping/pong riêng của game | hiển thị được; < 100 ms với người chơi Việt Nam sau khi đổi vùng |
| Số lần bị kéo vị trí mỗi phút | đếm lần `err > ngưỡng` trong đối chiếu | < 5 lần/phút khi chạy liên tục ở độ trễ 150 ms |
| Khung hình client | thời gian khung trung bình, p95, p99, số khung > 33 ms | p95 < 20 ms trên máy tính tầm trung; ≥ 30 khung hình/giây trên điện thoại tầm trung |
| Nhịp server | thời gian mỗi nhịp (trung bình, lớn nhất), độ trễ vòng lặp sự kiện | lớn nhất < 15 ms với 30 người trên Render |
| Dung lượng tải lần đầu | tổng byte truyền qua mạng (đã nén) | < 500 KB không tính nhạc |
| Băng thông mỗi người | log `[băng thông]` có sẵn | giảm ≥ 40% so với 14 KB/s |

## 4. Bảng việc

Mức ưu tiên: **P0** làm ngay (nhiều khả năng là nguyên nhân chính), **P1** nên làm, **P2** làm nếu còn thời gian. Công sức: S ≤ 1 giờ, M = nửa ngày, L = 1 ngày trở lên.

### Nhóm M — Đo trước (bắt buộc làm đầu tiên)

| Mã | Ưu tiên | Việc | File | Nghiệm thu | Công |
|---|---|---|---|---|---|
| M1 | P0 | **Bảng chẩn đoán (phím F3)**: hiện FPS, thời gian khung p95, ping, khoảng cách giữa các gói snapshot (trung bình + lớn nhất trong 5 giây), số lần bị kéo vị trí trong 60 giây gần nhất, số draw call (`renderer.info.render.calls`), số tam giác. Thêm tin nhắn `ping`/`pong` (client gửi mỗi 2 giây kèm mốc thời gian, server trả lại nguyên vẹn). | `public/client.js`, `server/index.js`, `public/index.html` | Nhấn F3 thấy đủ các số, cập nhật mỗi giây; không ảnh hưởng FPS khi tắt | M |
| M2 | P0 | **Giả lập mạng trễ ở client**: tham số URL `?lag=150&jitter=40` làm trễ cả gói gửi lẫn gói nhận (bọc `ws.send` và `onmessage` bằng `setTimeout`). Chỉ hoạt động khi có tham số. | `public/client.js` | Với `?lag=150` ping trên bảng F3 tăng ~300 ms; tái hiện được hiện tượng khựng ở localhost | S |
| M3 | P0 | **Đo server**: mỗi phút ghi log thời gian nhịp trung bình/lớn nhất và độ trễ vòng lặp sự kiện (so sánh thời điểm thực tế với lịch 33 ms); thêm các số này vào `/status`. | `server/index.js`, `server/lobby.js` | `/status` có `tickAvgMs`, `tickMaxMs`, `loopLagMs`; log xuất hiện trên Render | S |
| M4 | P0 | **Ghi lại số nền**: chơi 5 phút trên bản Render hiện tại và ở localhost với `?lag=150&jitter=40`, ghi các số của bảng F3 và `/status` vào `CONTEXT.md` (mục "Số nền trước tối ưu"). Hỏi chủ dự án vùng (region) của dịch vụ Render và địa chỉ trang. | `CONTEXT.md` | Có bảng số nền để so sánh về sau | S |

### Nhóm N — Mạng và đồng bộ (nghi vấn chính)

| Mã | Ưu tiên | Việc | File | Nghiệm thu | Công |
|---|---|---|---|---|---|
| N1 | P0 | **Đặt server gần người chơi**: thêm `region: singapore` vào `render.yaml` và ghi hướng dẫn vào `DEPLOY.md`. Theo hiểu biết hiện có, Render không cho đổi vùng của dịch vụ đã tạo: cần tạo dịch vụ mới ở Singapore rồi xoá dịch vụ cũ (**xác nhận lại trong tài liệu Render; việc tạo/xoá do chủ dự án làm**). | `render.yaml`, `DEPLOY.md` | Ping trên bảng F3 từ Việt Nam < 100 ms | S |
| N2 | P0 | **Sửa đối chiếu vị trí cho mạng trễ**: (a) ngưỡng bỏ qua tỉ lệ theo tốc độ hiện tại (ví dụ `max(0,35; tốc độ × 0,08)`); (b) phần lệch không cộng thẳng vào vị trí mà đưa vào một "độ lệch hiển thị" giảm dần mượt trong ~150 ms; (c) chạy lại lệnh đã xác nhận cuối cùng cho đúng khoảng thời gian server thật sự đã áp dụng: server gửi kèm trong `me` thời gian (ms) đã áp dụng lệnh `seq` hiện tại, client dùng số đó thay cho giả định "đủ 50 ms". | `public/client.js` (`predictFromServer`, `onSnapshot`), `server/game.js` (`setInput`, `sendSnapshots`) | Với `?lag=150&jitter=40`, chạy (Shift) liên tục 60 giây quanh sân: số lần bị kéo < 5, không thấy giật bằng mắt; va tường vẫn dừng đúng chỗ | M |
| N3 | P0 | **Server chịu được gói đến trễ**: nới ngưỡng "input cũ" từ 400 ms lên ~1000 ms; khi `dt` thực tế lớn hơn 0,1 s thì chạy nhiều bước con (tối đa 5 bước 0,05 s) thay vì cắt bỏ thời gian, để thời gian game không bị mất khi máy chủ khựng. | `server/game.js` (`updatePlayer`), `server/index.js`, `server/lobby.js` | Với `?jitter=200` nhân vật không tự khựng lại; test hiện có vẫn đạt; thêm test cho bước con | S |
| N4 | P1 | **Nội suy theo đồng hồ server**: snapshot đã có `lc` (đồng hồ phòng). Dùng `lc` làm mốc thời gian của mẫu trong `track`, ước lượng độ lệch đồng hồ client–server bằng giá trị nhỏ nhất trượt, và nội suy theo thời gian server thay cho thời điểm nhận gói. Bộ đệm nội suy tự điều chỉnh theo jitter đo được (tối thiểu 100 ms, tối đa 300 ms). | `public/client.js` (`track`, `interpolate`) | Với `?lag=150&jitter=60`, quản giáo và người khác di chuyển đều, không rung; không vọt quá | M |
| N5 | P1 | **Gửi input khi thay đổi**: ngoài nhịp 50 ms, gửi ngay khi hướng/phím đổi (giới hạn ≥ 16 ms giữa hai gói); khi đứng yên không thao tác thì giảm còn 5 gói/giây (vẫn đủ để server không coi là mất input sau N3). | `public/client.js` | Độ trễ từ lúc nhấn phím tới lúc server nhận giảm trung bình ~25 ms; số gói input khi đứng yên giảm ≥ 70% | S |
| N6 | P1 | **Giảm băng thông snapshot**: (a) chỉ gửi thực thể có thay đổi vị trí/góc/cờ so với lần gửi trước cho người đó (thực thể đứng yên gửi lại mỗi 1 giây); (b) cân nhắc mã hoá nhị phân (`ArrayBuffer`: id 1 byte, x/z 2 byte, góc 1 byte, cờ 1 byte) cho mảng `p` và `n`, giữ JSON cho phần `me`. Không bật `perMessageDeflate` (tốn CPU trên máy 0,1 CPU). | `server/game.js` (`sendSnapshots`), `public/client.js` (`onSnapshot`), `server/test-bandwidth.js` | `npm run test:bandwidth` giảm ≥ 40%; `test:bots` phần snapshot vẫn đạt (cập nhật test nếu đổi định dạng) | L |
| N7 | P2 | **Chống dồn gói cho kết nối chậm**: trước khi gửi snapshot, nếu `ws.bufferedAmount` > 64 KB thì bỏ qua gói đó (snapshot sau thay thế được). | `server/game.js` (`send`) | Test giả lập `bufferedAmount` lớn: không gửi; bộ nhớ server không tăng khi có client treo | S |

### Nhóm S — Server

| Mã | Ưu tiên | Việc | File | Nghiệm thu | Công |
|---|---|---|---|---|---|
| S1 | P1 | **Vòng lặp nhịp ổn định**: thay `setInterval(…, 33)` bằng vòng tự hiệu chỉnh (tính thời điểm nhịp kế theo đồng hồ, dùng `setTimeout` bù trễ) để không trôi nhịp; kết hợp bước con của N3. | `server/index.js` | `loopLagMs` trung bình giảm so với số nền; nhịp trung bình đúng 30 Hz ± 1 | S |
| S2 | P1 | **Giảm việc mỗi nhịp**: `nearStation` + `availability` chạy cho mọi người mỗi nhịp (30 Hz) → chỉ tính lại khi người chơi di chuyển > 0,3 m hoặc mỗi 0,2 s; `goalFor` + `JSON.stringify(slow)` chạy mỗi snapshot (15 Hz) → 4 Hz; `updateDetection` bỏ qua người chơi ở xa mọi quản giáo bằng kiểm tra khoảng cách trước khi tính tầm nhìn. | `server/game.js` | Thời gian nhịp trung bình với 30 người giảm ≥ 30% (đo bằng script tải, xem mục 5); hành vi không đổi (test đạt) | M |
| S3 | P2 | **Bộ nhớ đệm tìm đường**: `distField` cấp phát 2 mảng lớn mỗi lần gọi; dùng lại hàng đợi BFS dùng chung, giới hạn số trường trong `Room.fields` (LRU tối đa 32). | `shared/nav.js`, `server/game.js` | Không còn cấp phát mảng mới mỗi lần rượt đuổi (kiểm tra bằng `--trace-gc` hoặc đếm) ; `test:patrol` đạt | S |

### Nhóm C — Dựng hình phía client (quan trọng cho máy yếu và điện thoại)

| Mã | Ưu tiên | Việc | File | Nghiệm thu | Công |
|---|---|---|---|---|---|
| C1 | P1 | **Tự điều chỉnh chất lượng theo FPS**: hiện chỉ giảm `pixelRatio` và không bao giờ tăng lại. Làm bộ điều chỉnh có trễ (hysteresis): FPS < 40 trong 3 giây thì hạ một bậc (tắt bloom → bóng đổ 1024 → `pixelRatio` 1 → tắt bóng đổ); FPS > 57 trong 10 giây thì nâng một bậc. Áp dụng ngay, không cần tải lại trang. Giữ lựa chọn thủ công trong menu (thêm mức "Tự động", mặc định). | `public/client.js` | Giả lập máy yếu (CPU throttle 4x trong DevTools): FPS ổn định ≥ 30 sau 10 giây; trên máy mạnh giữ mức Cao | M |
| C2 | P1 | **Giảm draw call nhân vật**: mỗi nhân vật ~25 mesh riêng. Gộp các phần không chuyển động tương đối trong cùng một khớp thành một geometry (ví dụ đùi+ống chân không gộp được vì có khớp, nhưng đầu+tai+tóc+mũ gộp được; thân+thắt lưng+huy hiệu gộp được), dùng chung material theo bảng màu (vertex color). Mục tiêu ≤ 10 mesh mỗi nhân vật. Tắt `castShadow` cho nhân vật cách camera > 25 m. | `public/world.js` (`makeCharacter`), `public/client.js` | Số draw call (bảng F3) với 30 người + NPC giảm ≥ 50%; hình dáng nhân vật không đổi khi so ảnh chụp trước/sau | L |
| C3 | P1 | **Bớt cấp phát mỗi khung hình (giảm khựng do dọn rác)**: `animateCharacter` tạo object `T` mới mỗi nhân vật mỗi khung → dùng lại một object; `separateBubbles` tạo mảng/object mỗi khung → dùng lại và bỏ qua hẳn khi không có bong bóng nào đang hiện; `findPath` (mũi tên chỉ đường, mỗi 0,45 s) chạy BFS trên cả lưới và cấp phát mảng → cache theo ô đích, chỉ tính lại khi mục tiêu đổi hoặc người chơi lệch khỏi đường > 2 m. | `public/world.js`, `public/client.js`, `shared/nav.js` | Trong tab Performance của DevTools: không còn đợt GC lớn định kỳ; số khung > 33 ms trong 60 giây = 0 trên máy dev | M |
| C4 | P1 | **Giảm việc vẽ phụ**: minimap vẽ lại mỗi 2 khung → 10 lần/giây (và 4 lần/giây khi thu nhỏ); hình quạt quản giáo: 26 tia × mọi tường mỗi 2 khung → chỉ cập nhật khi quản giáo di chuyển/xoay quá ngưỡng, và lọc trước các tường trong bán kính tầm nhìn; `updateHud` chỉ ghi DOM khi giá trị đổi (hiện ghi `style.width`/`textContent` 15 lần/giây cho mọi thanh). | `public/client.js`, `shared/sim.js` | Thời gian script mỗi khung (DevTools) giảm ≥ 25% so với số nền; minimap và hình quạt vẫn đúng | M |
| C5 | P2 | **Bóng đổ và ánh sáng**: `shadowMap.autoUpdate = false`, cập nhật bóng 30 lần/giây (hoặc khi camera/mặt trời dịch chuyển); đèn điểm ban đêm (8 cái) tốn kém với `MeshStandardMaterial` → giảm còn 4 trên máy tính, 2 trên điện thoại; cân nhắc `MeshLambertMaterial` cho vật thể tĩnh ở mức Thấp. | `public/client.js`, `public/world.js` | FPS ban đêm không thấp hơn ban ngày quá 10% | M |
| C6 | P2 | **Dọn tài nguyên khi thực thể rời đi**: `removeEntity` chỉ `scene.remove`, không `dispose` texture canvas của bảng tên/bong bóng, geometry và material riêng → rò rỉ bộ nhớ GPU khi nhiều người ra vào. Thêm dispose đúng cách (không dispose geometry/material dùng chung trong cache). | `public/client.js`, `public/world.js` | Cho 200 lượt vào/ra giả lập: `renderer.info.memory.textures` không tăng dần | S |

### Nhóm L — Tải trang và tài nguyên

| Mã | Ưu tiên | Việc | File | Nghiệm thu | Công |
|---|---|---|---|---|---|
| L1 | P0 | **Nén gzip/brotli cho file tĩnh**: nén sẵn một lần lúc khởi động (hoặc nén lần đầu rồi giữ trong bộ nhớ) cho `.js`, `.css`, `.html`, `.json`; trả theo `Accept-Encoding`, thêm `Vary: Accept-Encoding`. Không nén `.mp3`. Giữ nguyên hỗ trợ `Range` cho nhạc. | `server/index.js` | `curl -H "Accept-Encoding: br"` trả `Content-Encoding: br`; tổng JS truyền qua mạng < 500 KB | S |
| L2 | P0 | **Nhạc ban đêm 33 MB**: mã hoá lại cả hai bài xuống ~96–128 kbps (mục tiêu bài đêm < 8 MB). Cần `ffmpeg` (máy dev chưa có: hỏi chủ dự án cài hoặc nhờ họ xuất lại file). Giữ tên `public/music/day.mp3`, `night.mp3`. Bản gốc nằm ở `sounds/` (không đưa lên git). | `public/music/` | `night.mp3` < 8 MB, nghe không vỡ tiếng; nhạc vẫn chuyển ngày/đêm đúng | S |
| L3 | P1 | **Bộ nhớ đệm trình duyệt**: file của game đang `no-cache` (mỗi lần vào đều hỏi lại server). Thêm `ETag`/`Last-Modified` và trả `304` khi không đổi; dùng `three.module.min.js` (675 KB thay vì 1.315 KB) trong importmap. | `server/index.js`, `public/index.html` | Lần tải thứ hai: các file JS trả 304 hoặc lấy từ cache; game vẫn chạy với bản min | S |
| L4 | P2 | **Màn hình tải**: hiện tiến độ khi tải mã và dựng thế giới (hiện màn hình đứng im vài giây trên mạng chậm); nút "Nhập trại" chỉ bật khi đã dựng xong. | `public/index.html`, `public/client.js` | Trên mạng giả lập "Slow 4G" có thanh tiến độ, không có khoảng trắng đứng im > 1 giây | S |

### Nhóm R — Ổn định khi vận hành

| Mã | Ưu tiên | Việc | File | Nghiệm thu | Công |
|---|---|---|---|---|---|
| R1 | P1 | **Vào lại sau khi server khởi động lại**: khi server restart, `sid` cũ không còn → người chơi hiện bị kẹt ở "đang thử vào lại". Nếu vào lại bằng `sid` không tồn tại thì server cho vào như người mới và báo rõ "máy chủ vừa khởi động lại, tiến trình đã mất"; client dừng vòng thử lại. | `server/lobby.js`, `public/client.js` | Tắt/bật lại server khi đang chơi: trong 10 giây người chơi vào lại được phòng mới kèm thông báo | S |
| R2 | P1 | **Tắt máy êm (SIGTERM)**: Render gửi SIGTERM khi deploy lại. Bắt tín hiệu, gửi thông báo "máy chủ sắp khởi động lại" cho mọi người, đóng kết nối sạch, thoát sau tối đa 5 giây. | `server/index.js` | `kill -TERM`: client nhận thông báo; tiến trình thoát mã 0 trong 5 giây | S |
| R3 | P2 | **Giữ server thức / theo dõi**: ghi vào `DEPLOY.md` cách dùng dịch vụ ping `/healthz` mỗi 5 phút (kèm cảnh báo tốn giờ miễn phí) và cách đọc log `[sảnh]`, `[băng thông]`, số đo của M3. Không tự đăng ký dịch vụ ngoài. | `DEPLOY.md` | Có mục hướng dẫn | S |
| R4 | P2 | **Kiểm thử tự động khi đẩy mã**: thêm GitHub Actions chạy 3 bộ test trên Node 20. | `.github/workflows/test.yml` | Push lên nhánh thì workflow chạy và đạt | S |

## 5. Thứ tự làm và phụ thuộc

1. **M1 → M2 → M3 → M4** (đo). Không bỏ qua: các tiêu chí nghiệm thu phía sau dựa vào công cụ này.
2. **N1** (đổi vùng; cần chủ dự án thao tác trên Render) song song với **L1, L2**.
3. **N2 → N3** (phụ thuộc M1, M2). Sau bước này báo cáo số đo cho chủ dự án: nếu triệu chứng đã hết thì các nhóm sau là cải thiện thêm.
4. **N4, N5, S1, R1, R2**.
5. **C1 → C3 → C4 → C2** (C2 tốn công nhất, làm sau khi đã có số đo draw call từ M1).
6. **N6, S2, L3**, rồi các việc P2.

Script đo tải server (dùng cho S2, viết lại vào `server/test-load.js`): tạo `Room`, thêm 30 người chơi giả (`ws` giả có `readyState: 1` và `send` đếm byte), mỗi 6 nhịp gọi `setInput` với hướng thay đổi, chạy 1800 nhịp `tick(1/30)`, đo thời gian mỗi nhịp bằng `process.hrtime.bigint()`. Số nền hiện tại: trung bình 0,19 ms, lớn nhất 22 ms (nhịp đầu), 14,5 KB/s mỗi người.

## 6. Những điều KHÔNG làm trong kế hoạch này

- Không viết lại sang engine/khung khác, không đổi sang WebRTC/UDP.
- Không thêm cơ sở dữ liệu hay tài khoản.
- Không đổi luật chơi để "đỡ lag" (ví dụ giảm số quản giáo) nếu chưa hỏi chủ dự án.
- Không bật `perMessageDeflate` cho WebSocket trên gói miễn phí.

## 7. Báo cáo khi xong

Với mỗi nhóm, báo: việc nào xong, số đo trước/sau, việc nào chưa làm và vì sao, có gì cần chủ dự án thao tác (ví dụ tạo lại dịch vụ Render ở Singapore, cài `ffmpeg`, `git push`).
