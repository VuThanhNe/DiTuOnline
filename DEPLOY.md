# Hướng dẫn deploy miễn phí cho ~30 người chơi

Game là **một tiến trình Node.js giữ trạng thái trong bộ nhớ** (phòng, người chơi) và dùng **WebSocket**. Vì vậy cần một máy chủ chạy liên tục, không dùng được hosting tĩnh hay serverless (Vercel, Netlify, Cloudflare Pages...).

## Mức tài nguyên thực tế (đã đo)

Đo trên phòng 30 người, tất cả cùng di chuyển, 60 giây mô phỏng (`node` trên máy dev):

| Tài nguyên | Kết quả | Ý nghĩa |
|---|---|---|
| CPU | ~0,2 ms mỗi nhịp (ngân sách 33 ms) | Rất nhẹ, máy chủ yếu cũng đủ |
| RAM | ~56 MB (RSS) | Vừa gói 512 MB |
| Băng thông gửi đi | ~14 KB/s mỗi người ≈ **1,5 GB/giờ cả phòng đầy** | **Đây là thứ cần canh trên gói miễn phí** |

Nghĩa là gói miễn phí nào có hạn mức băng thông thấp sẽ cạn trước CPU/RAM. Ví dụ hạn mức 100 GB/tháng chỉ đủ ~65 giờ phòng đầy. Phòng ít người thì tốn ít hơn nhiều. Ghi log mỗi phút trong console (`[băng thông]`, `[sảnh]`) để theo dõi.

## Chọn nền tảng

| | Render (free) | Oracle Cloud Always Free |
|---|---|---|
| Độ khó | Dễ nhất, ~10 phút | Trung bình, ~45 phút |
| Luôn chạy | **Không**: ngủ sau 15 phút không có lưu lượng, thức dậy ~1 phút | Có, chạy 24/7 |
| Băng thông | Có hạn mức theo tháng (xem trang Billing) | Rất lớn (tài liệu Oracle ghi 10 TB/tháng) |
| Cần thẻ | Không | Có (để xác minh, không bị trừ nếu giữ trong hạn mức) |
| Hợp với | Chơi thử, vài buổi với bạn bè | Chơi lâu dài, đông người |

**Fly.io và Koyeb**: theo các nguồn tìm được, người dùng mới không còn gói miễn phí thật sự cho dịch vụ chạy liên tục (thông tin có chỗ mâu thuẫn, hãy xem lại trang giá của họ nếu muốn thử). Railway chỉ có tín dụng dùng thử. Vì vậy hướng dẫn dưới đây chỉ nói Render và Oracle.

> Điều kiện gói miễn phí thay đổi thường xuyên. Trước khi dựa vào con số nào hãy đối chiếu trang chính thức (liên kết ở cuối file).

---

## Cách A: Render (dễ nhất)

1. Đảm bảo code đã nằm trên GitHub (repo `VuThanhNe/DiTuOnline`), có file `render.yaml` ở thư mục gốc.
2. Vào <https://dashboard.render.com>, đăng nhập bằng GitHub.
3. **New → Blueprint**, chọn repo, bấm **Apply**. Render đọc `render.yaml` và tạo dịch vụ `di-tu-online` ở gói **Free**.
   - Làm tay thay vì Blueprint: **New → Web Service**, Runtime *Node*, Build Command `npm install --omit=dev`, Start Command `npm start`, Instance Type *Free*, Health Check Path `/healthz`, rồi thêm biến môi trường ở mục 4 bên dưới.
4. Chờ build xong (vài phút). Địa chỉ có dạng `https://di-tu-online.onrender.com`. Gửi link đó cho bạn bè.
5. Kiểm tra: mở `/healthz` (trả `ok`) và `/status` (trả JSON `{"online":0,"capacity":30,"queue":0}`).

**Chọn vùng Singapore.** Server càng gần người chơi thì càng ít trễ. `render.yaml` đã khai báo `region: singapore`, nhưng vùng chỉ được chọn **lúc tạo dịch vụ**. Nếu dịch vụ hiện tại đang ở vùng khác (xem trong trang Settings của dịch vụ), hãy tạo dịch vụ mới (Blueprint, hoặc Web Service rồi chọn Region = Singapore) và xoá dịch vụ cũ. Kiểm tra độ trễ: vào game, nhấn **F3**, xem dòng `ping`.

**Giới hạn của gói miễn phí Render (theo tài liệu của Render):**
- Dịch vụ **ngủ sau 15 phút không có lưu lượng**; tin nhắn WebSocket của kết nối đang mở **có tính là lưu lượng**. Game gửi dữ liệu liên tục khi còn người chơi nên đang chơi thì không ngủ; hết người chơi 15 phút là ngủ. Người vào đầu tiên sau đó phải chờ khoảng 1 phút (game đã tự hiện thông báo "máy chủ đang thức dậy" và tự thử lại).
- 750 giờ chạy mỗi tháng cho cả workspace (dịch vụ ngủ không tốn giờ).
- Băng thông gửi đi có hạn mức (xem ở trang Billing). Dịch vụ tạo lưu lượng cao bất thường có thể bị tạm khoá.
- Render có thể khởi động lại dịch vụ bất kỳ lúc nào, và mỗi lần deploy lại: **phòng và tiến trình mọi người chơi bị reset** (dữ liệu chỉ nằm trong RAM). Người chơi thấy "mất kết nối" rồi vào lại như người mới.
- Muốn không bị ngủ khi chưa có ai chơi: dùng dịch vụ ping như UptimeRobot gọi `/healthz` mỗi 5 phút. Cách này tốn ~720/750 giờ miễn phí mỗi tháng, chỉ nên dùng khi thật cần.

**Cập nhật game:** `git push` lên nhánh `main`, Render tự build và deploy lại (`autoDeploy: true`).

---

## Cách B: Oracle Cloud Always Free (chạy 24/7)

Máy ảo miễn phí trọn đời, chạy liên tục. Theo trang Oracle gói gồm máy Arm Ampere A1 (tới 4 OCPU / 24 GB RAM, **có một nguồn ghi giảm còn 2 OCPU / 12 GB từ giữa 2026, chưa xác nhận**) và 2 máy AMD nhỏ (1/8 OCPU, 1 GB). Game này chỉ cần ~56 MB RAM và rất ít CPU nên **máy AMD nhỏ nhất cũng đủ**.

1. Đăng ký tại <https://www.oracle.com/cloud/free/> (cần thẻ để xác minh). Chọn vùng gần người chơi (không đổi được sau này).
2. **Compute → Instances → Create instance**: image *Ubuntu 22.04*, shape *VM.Standard.E2.1.Micro* (AMD, Always Free) hoặc Ampere A1. Thêm khoá SSH (tải khoá riêng về). Máy Ampere đôi khi báo "Out of capacity": thử lại vào giờ khác hoặc dùng máy AMD.
3. Mở cổng: trong **VCN → Security List**, thêm Ingress Rule TCP cổng `80`, `443` (và `3000` nếu chạy không HTTPS) từ `0.0.0.0/0`.
4. SSH vào máy rồi cài đặt:
   ```bash
   sudo apt update && sudo apt install -y git curl
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt install -y nodejs
   git clone https://github.com/VuThanhNe/DiTuOnline.git
   cd DiTuOnline && npm install --omit=dev
   sudo npm install -g pm2
   PORT=3000 MAX_ROOMS=1 pm2 start server/index.js --name ditu
   pm2 save && pm2 startup     # chạy lệnh mà pm2 in ra để tự khởi động lại sau khi reboot
   ```
5. Ubuntu của Oracle chặn cổng bằng iptables, mở cổng:
   ```bash
   sudo iptables -I INPUT -p tcp --dport 3000 -j ACCEPT
   sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT
   sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT
   sudo netfilter-persistent save
   ```
   Chơi thử ngay tại `http://<IP-công-khai>:3000`.
6. (Khuyến nghị) HTTPS với tên miền miễn phí, ví dụ DuckDNS (`tenban.duckdns.org` trỏ về IP máy). Cài Caddy và tạo `/etc/caddy/Caddyfile`:
   ```
   tenban.duckdns.org {
       reverse_proxy localhost:3000
   }
   ```
   Caddy tự lấy chứng chỉ HTTPS và hỗ trợ WebSocket. Khi có proxy, chạy game với `TRUST_PROXY=1` (`TRUST_PROXY=1 PORT=3000 pm2 restart ditu --update-env`).
7. Cập nhật game: `cd DiTuOnline && git pull && npm install --omit=dev && pm2 restart ditu`.

---

## Biến môi trường

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `PORT` | 3000 | Cổng lắng nghe (Render tự đặt) |
| `TRUST_PROXY` | tắt | Đặt `1` khi đứng sau proxy (Render, Caddy, nginx) để lấy IP thật |
| `MAX_ROOMS` | 1 | Số phòng tối đa |
| `MAX_PLAYERS_PER_ROOM` | 30 | Số người tối đa mỗi phòng |
| `MAX_QUEUE` | 100 | Số người tối đa trong hàng chờ |
| `AFK_SECS` | 180 | Có người chờ thì ai đứng im quá số giây này bị mời ra |
| `MAX_CONN_PER_IP` | 6 | Số kết nối tối đa mỗi IP (tính cả người đang chờ) |
| `DEV` | tắt | **Không bao giờ bật khi chạy thật** (cho phép dịch chuyển, đổi giờ) |

Tổng sức chứa = `MAX_ROOMS × MAX_PLAYERS_PER_ROOM`. Muốn đông hơn 30 người cùng lúc, tăng `MAX_ROOMS` (mỗi phòng là một thế giới riêng) nhưng băng thông tăng theo.

## Hàng chờ hoạt động thế nào

- Phòng đầy thì người mới thấy "Bạn là người thứ N trong hàng chờ" và được **vào tự động** khi có chỗ (theo thứ tự đến trước vào trước, không ai chen ngang).
- Người đang chờ bấm **Rời hàng chờ** để thoát. Tab trình duyệt hiện vị trí trong tiêu đề.
- Có người chờ thì người **rớt mạng chỉ được giữ chỗ 20 giây** (thường là 60 giây) và người **đứng im quá `AFK_SECS`** bị mời ra để nhường chỗ (họ có thể xếp hàng lại).
- Người rớt mạng vào lại bằng cùng trình duyệt trong thời gian giữ chỗ thì **không phải xếp hàng**.
- `/status` trả `{"online","capacity","queue"}`; màn hình đầu game cũng hiện số người đang chơi/đang chờ.
- Thử hàng chờ khi chạy thử: đặt `MAX_PLAYERS_PER_ROOM=1` rồi mở hai tab. Chạy test: `npm run test:lobby`.

## Danh sách kiểm tra sau khi deploy

- [ ] `/healthz` trả `ok`, `/status` trả JSON.
- [ ] Mở 2 tab, cả hai vào được, thấy nhau trong game.
- [ ] Không đặt biến `DEV`.
- [ ] Theo dõi log: dòng `[băng thông]` cho biết MB/giờ mỗi người, so với hạn mức của nền tảng.

## Nguồn tham khảo (kiểm tra lại số liệu ở đây)

- Render, gói miễn phí: <https://render.com/docs/free>
- Oracle Cloud Free Tier: <https://www.oracle.com/cloud/free/>
- So sánh gói miễn phí các nền tảng (có thể đã cũ): <https://flaviocopes.com/hosting-free-tiers/>
