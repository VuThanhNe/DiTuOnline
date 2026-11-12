# Đi Tù Online

Game giả lập đời sống trong trại giam, 3D, nhiều người chơi realtime, chạy trên trình duyệt (PC và điện thoại).

## Chạy thử

```bash
npm install
npm start          # mở http://localhost:3000
```

Yêu cầu Node.js 18 trở lên. Biến môi trường: `PORT`, `TRUST_PROXY=1`, `MAX_CONN_PER_IP`, `MAX_ROOMS`, `MAX_PLAYERS_PER_ROOM`, `MAX_QUEUE`, `AFK_SECS` (bảng đầy đủ trong DEPLOY.md), `DEV=1` (lệnh dịch chuyển/đổi giờ để thử nghiệm, **không bật khi chạy thật**).

## Deploy miễn phí và hàng chờ

Xem **[DEPLOY.md](DEPLOY.md)**: hướng dẫn từng bước cho Render (dễ nhất) và Oracle Cloud Always Free (chạy 24/7), số liệu tải đã đo cho phòng 30 người, và danh sách biến môi trường.

Sức chứa mặc định là 1 phòng x 30 người (`MAX_ROOMS`, `MAX_PLAYERS_PER_ROOM`). **Phòng đầy thì người mới xếp hàng chờ** (hiện vị trí, tự vào khi có chỗ, có nút Rời hàng chờ). Có người chờ thì người rớt mạng chỉ được giữ chỗ 20 giây và người đứng im quá `AFK_SECS` (180 giây) bị mời ra nhường chỗ. `GET /status` trả `{"online","capacity","queue"}`.

Nhạc nền: `public/music/day.mp3` (ban ngày) và `public/music/night.mp3` (giờ tắt đèn). Muốn đổi nhạc thì thay hai file này, giữ nguyên tên. Kế hoạch tối ưu hiệu năng: xem [OPTIMIZE_PLAN.md](OPTIMIZE_PLAN.md).

## Luật chơi

- Một ngày gồm 7 giờ sinh hoạt (điểm danh, bữa sáng, lao động, tập luyện, bữa tối, tự do, tắt đèn).
- Mỗi hoạt động là một minigame (14 loại: canh nhịp, gõ phím, nối dây, phân loại, bóng bàn, đập gạch...). Chơi tốt được nhiều điểm và Jack hơn.
- Đủ 300 điểm cải tạo thì ra **Cổng trại** (tường phía đông, ban ngày) giữ E 5 giây để mãn hạn. Không tự động mãn hạn: bạn có thể tiếp tục kế hoạch vượt ngục.
- Bỏ điểm danh, bỏ bữa ăn, trốn lao động sẽ bị **cảnh cáo** và trừ điểm. Đủ 3 cảnh cáo là quản giáo để mắt tới bạn (nhìn xa hơn, phát hiện nhanh hơn); sang ngày mới được xoá bớt một cảnh cáo.
- Có 2 tù nhân NPC sinh hoạt theo lịch như bạn: đi ăn, làm việc, tập luyện, giải trí rồi về buồng ngủ.
- Có thanh máu và năng lượng. Hết máu bị nhốt 30 giây ở phòng quản giáo. Năng lượng hồi nhờ ăn, ngủ, Reddog.
- Kho thìa, kìm, bản đồ bị khoá: cần đủ 3, 8, 14 ca lao động (chỉnh `LABOR_NEED` trong `shared/map.js`).
- Chợ đen Tày Scam (đơn vị Jack, 50% bị lừa mất tiền): Reddog, thuốc nổ (2 lần/ngày), dây thừng, đèn pin.
- Vượt ngục (khó): **đào hầm** lúc tắt đèn cần thìa + kìm, cả phòng góp đủ 64 giây công (đào ẩu thì đất sụt mất công); hầm thông rồi cần thêm bản đồ + dây thừng + đèn pin và giữ E 5 giây để chui ra.
- Quản giáo nghe tiếng động (làm việc, đào, bom, chạy...) sẽ chạy tới; đến sát có thể bị đánh hoặc khám người (tỉ lệ thấp). Đang làm việc hoặc đứng ở trạm hợp lệ của giờ đó thì không bị gây sự.
- **Ban đêm rời buồng giam là vi phạm:** bị quản giáo thấy là bị rượt và nhốt biệt giam. Mỗi tháp canh có một **vòng sáng tròn** đi lần lượt từng khu (dừng vài giây ở mỗi khu), chỉ ai đứng trong vòng sáng mới bị chiếu thấy. Quan sát đường đi của vòng sáng để lách qua.
- **Ném bom / ném đá:** giữ Q (bom) hoặc T (đá) để ngắm, di chuột để chỉ hướng (có vạch ngắm và điểm rơi), thả phím để ném, Esc để huỷ. Trên điện thoại giữ nút 💣 / 🪨, dùng joystick ngắm rồi nhả.
- **Chạy** (giữ Shift) nhanh hơn 1,5 lần nhưng tốn năng lượng và gây tiếng động; **đi lén** giữ phím C.
- Phòng giải trí: chơi bài đoán lá tiếp theo **lớn hơn hay nhỏ hơn** (cược 5 Jack: đúng +5, sai -5, bằng nhau là thua).

- Bị quản giáo thấy vi phạm thì họ **lao tới rượt** (5,3 m/s); chạy khuất tầm 4 giây là cắt đuôi được. Giữ Shift để đi lén (chậm, khó bị phát hiện, không gây tiếng bước chân). Phím T ném đá dụ quản giáo, G tặng Jack.
- Lối thoát thứ hai: cắt hàng rào góc đông nam lúc tắt đèn (cần kìm + dây thừng + đèn pin). Phải cắt **3 sợi dây thép liên tiếp**, mỗi sợi một minigame gõ 12 phím; hỏng một lần là báo động và làm lại từ đầu. Có quản giáo canh khu này.
- Từ ngày 2 có sự kiện ngẫu nhiên: mưa (át tiếng động), cúp điện (quản giáo nhìn kém), khám buồng đột xuất.
- Biệt giam phải chờ hết án, không rút ngắn được. Mất kết nối có 60 giây để vào lại đúng nhân vật cũ.
- Đồ họa: ánh sáng đổi theo giờ trong ngày (bình minh, trưa, hoàng hôn, đêm). **Esc mở menu cài đặt**: âm lượng, góc nhìn (trên cao cố định, hoặc ngôi thứ ba: nhấp vào màn hình để khoá chuột ở giữa, di chuột để xoay camera và nhân vật đi theo hướng đó, Esc để thả chuột), chất lượng đồ họa Thấp / Vừa / Cao (Cao có bloom, áp dụng sau khi tải lại trang) và Hướng dẫn.
- Chợ đen có thêm mua "uy tín" (+30% giá, tỉ lệ bị lừa còn 25%).

Điều khiển: WASD, E (nhấn/giữ), Shift chạy, C đi lén, Esc cài đặt, giữ Q ngắm rồi thả để ném bom, R uống Reddog, giữ T ngắm rồi thả để ném đá, G tặng Jack, N bản đồ lớn, M tắt nhạc, H bật/tắt mũi tên chỉ đường (hiện trong ngày đầu), K hướng dẫn, Enter chat.

## Cấu trúc

- `shared/map.js`: bản đồ, trạm, chợ đen, luật chơi, cân bằng. `shared/sim.js`, `shared/nav.js`: va chạm, tìm đường.
- `server/game.js`: logic phòng chơi (server quyết định mọi thứ). `server/index.js`: HTTP và WebSocket.
- `public/`: `client.js` (HUD, minimap, camera), `world.js` (dựng 3D), `audio.js` (SFX, giọng NPC, nhạc), `minigames.js`.

## Kiểm thử

```bash
npm run test:patrol
npm run test:bots
npm run test:lobby
```
