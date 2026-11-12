# Context dự án: Đi Tù Online

Game giả lập đời sống trại giam, 3D, nhiều người chơi realtime, chạy trên trình duyệt (PC + điện thoại). Node.js 18+, WebSocket (`ws`), Three.js. Thư mục: `D:\ditu`. Chạy: `npm start` (cổng 3000). Kiểm thử: `npm run test:patrol`, `npm run test:bots` (cả hai đang đạt).

## Kiến trúc
- `shared/map.js`: bản đồ, trạm, chợ đen, luật chơi và hằng số cân bằng (RULES, ENERGY, BOOST, GUARD, LABOR_NEED, SHOP...). Sửa gameplay chủ yếu ở đây.
- `shared/sim.js`: va chạm, di chuyển, tầm nhìn, `rayDist` (cắt hình quạt). `shared/nav.js`: lưới tìm đường 0.5m (BFS) cho quản giáo và mũi tên chỉ đường.
- `server/game.js`: lớp `Room`, server quyết định mọi thứ. `server/index.js`: HTTP + WebSocket. Tin nhắn client→server: `join(sid), in(mx,mz,act,sneak), chat, mgdone, mgcancel, buy(id,premium), bomb, drink, rock, give`.
- `public/`: `client.js` (mạng, HUD, minimap, camera, mũi tên, hạt/mưa), `world.js` (dựng 3D, gộp mesh theo vật liệu), `audio.js` (WebAudio: SFX, giọng NPC, nhạc), `minigames.js`, `index.html`, `style.css`.

## Luật chơi hiện tại
- 7 giờ/ngày (PHASES, 420s): điểm danh, sáng, lao động, tập, tối, tự do, tắt đèn. Đủ **300 điểm** thì được quyền mãn hạn nhưng **không tự động**: phải ra **Cổng trại** (trạm `exit`, tường đông, giữ E 5s, chỉ ban ngày) để làm thủ tục. Đồng hồ ngày đêm ở góc phải (PHASE_CLOCK, clockHour trong map.js); đổi giai đoạn thì có banner giữa phía trên màn hình.
- **Lịch sinh hoạt có ràng buộc** (`endPhase`/`violation` trong game.js): vắng điểm danh (-5 điểm), bỏ bữa (-3 điểm, -15 sức), trốn lao động (-5 điểm) đều bị **cảnh cáo**. Đủ 3 cảnh cáo (`warnWatch`) thì bị quản giáo "để mắt" (nhìn xa x1,25, phát hiện nhanh x1,5). Sang ngày mới xoá 1 cảnh cáo. Người mới vào chưa đủ 60% giờ đó thì được bỏ qua.
- Hoạt động là minigame, 14 loại: canh nhịp, gõ phím, căn góc ném (aim, không còn trạm dùng), nối dây, phân loại, nhớ chuỗi, ghép thẻ, dọn rác/nhổ cỏ, bấm liên tục, thăng bằng, bóng bàn, đá bóng, đập gạch, bắn bi. Mỗi trạm chọn loại qua mg trong STATIONS; tham số sinh ở mgParams (server), thời gian tối thiểu ở mgMin. Thưởng điểm + Jack theo chất lượng; làm tốt mới tính **ca lao động**.
- **Kho khoá theo ca lao động:** thìa 3, kìm 8, bản đồ 14.
- Có **máu** (hết = nhốt 30s ở phòng quản giáo) và **năng lượng** (hồi nhờ ăn, ngủ, Reddog).
- **Chợ đen Tày Scam** (đơn vị Jack, 50% bị lừa; mua "uy tín" +30% giá thì 25%): Reddog 15, thuốc nổ 25 (2 lần/ngày), dây thừng 50, đèn pin 40.
- **Vượt ngục (đã tăng độ khó):** (a) **đào hầm** lúc tắt đèn: cần thìa + kìm để đào (`DIG_ITEMS`), cả phòng phải góp đủ **64 giây công** (`digTarget`, ~8 lượt đào tốt, mỗi lượt khó hơn: mash need 1.35/8s); đào ẩu (<0.6) thì **đất sụt** mất 4 giây công; tiếng động to hơn (nr 32). Hầm thông thì cần kìm + bản đồ + dây thừng + đèn pin (`ESCAPE_ITEMS`) và giữ E **5 giây** (ồn, quản giáo nghe thấy) để chui ra. (b) **cắt hàng rào** ở góc đông nam (63,38) lúc tắt đèn: cần kìm + dây thừng + đèn pin (`FENCE_ITEMS`), phải cắt **3 sợi liên tiếp** (`fenceCuts`, mỗi sợi một minigame gõ 12 phím trong 8s, mỗi lần thành công gây tiếng động 20); **hỏng một lần là làm lại từ đầu** kèm báo động (tiếng động 42). Có thêm quản giáo số 11 tuần tra khu này. Hầm bị lấp mỗi sáng.
- **10 quản giáo** (7 tuyến cũ + 3 tuyến cho khu mới): nghe tiếng động (bán kính theo hoạt động, hợp lệ chỉ 45%) thì chạy tới theo đường đi; bị phát hiện vi phạm thì **rượt** (5,3 m/s, cắt đuôi sau 4s mất dấu); đến sát có xác suất bị đánh (-20 máu) hoặc khám. **Đang làm việc đúng giờ ban ngày (minigame hoặc giữ E ở trạm hợp lệ) thì không bị đánh/khám** (guardTouch).
- Phím: WASD, E (nhấn/giữ), Q bom, R Reddog, T ném đá, G tặng Jack, **Shift chạy**, **C đi lén**, N bản đồ lớn, M tắt nhạc, H mũi tên chỉ đường, K hướng dẫn, **Esc cài đặt**, Enter chat.

## Các cập nhật đã làm (theo thứ tự)
**Đợt 1 (theo góp ý ban đầu):**
- Đồ họa: bóng đổ, texture thủ tục, chi tiết phòng, nhân vật tinh hơn, chữ nét hơn, tự giảm độ phân giải nếu máy yếu.
- Minimap có nhãn phòng; mũi tên chỉ đường dưới đất (lượt chơi đầu); camera cố định không lệch góc.
- Âm thanh: SFX theo vị trí, giọng NPC quát tháo, nhạc ngày chậm/đêm dồn dập.
- Logic: kho khoá theo lao động, Tày Scam, quản giáo nhiều + nghe tiếng động, máu/năng lượng, nhiều hoạt động + minigame.

**Đợt 2 (cải tiến):**
- Hình quạt tầm nhìn cắt theo tường; cấm ném bom trong khu buồng giam, ném bom bị thấy là vi phạm; giảm bị đánh khi làm đúng việc.
- Quản giáo rượt bắt thật; đi lén; ném đá; tặng Jack; mua "uy tín".
- Sự kiện ngẫu nhiên từ ngày 2 (mưa, cúp điện, khám buồng); lối thoát cắt hàng rào; gõ tường giảm án trong biệt giam.
- Mất kết nối vào lại trong 60s (`sid`); kiểm tra thời gian tối thiểu minigame chặt hơn.
- Tư thế riêng theo hoạt động, hạt (bụi/khói/tia lửa), mưa + tiếng mưa, giai điệu cố định, thanh âm lượng, tinh chỉnh giao diện điện thoại.

## Chưa làm / hạn chế
- Chưa có chuyền đồ giữa người chơi, canh gác hộ, tố giác. (Tù nhân NPC đã có lịch sinh hoạt từ Đợt 5.)
- Điểm minigame do client báo lên (server chỉ kiểm tra thời gian tối thiểu), chưa chấm hoàn toàn trên server.
- Cân bằng (300 điểm, giá, ngưỡng ca lao động) chỉ là ước tính, chưa có người chơi thử.
- Điểm/bảng xếp hạng lưu trong bộ nhớ, chưa có tài khoản/DB; danh sách từ tục còn ngắn.

## Đợt 3: giảm băng thông (để chạy gói miễn phí)
- `sendSnapshots` (server/game.js): người/NPC trong `SNAP_NEAR_R` (28 m) gửi đủ 15 lần/giây, ở xa chỉ gửi mỗi `SNAP_FAR_EVERY` (5) gói. Vị trí nén thành số nguyên (x,z theo 0,1 m; góc theo 0,05 rad), client chia lại trong `onSnapshot`.
- Thông tin ít đổi (kho đồ, mục tiêu, Jack, ca lao động, chợ đen...) tách khỏi `me` thành `me2`, chỉ gửi khi thay đổi (và mỗi 5 giây để an toàn); client gộp vào `s.me`.
- Đo thử 30 người trong phòng đầy: từ ~81 xuống ~36 MB/giờ/người. Server ghi log băng thông mỗi phút (`[băng thông]`). Đo lại: `npm run test:bandwidth`.
- Sửa 2 test chập chờn do sự kiện mưa ngẫu nhiên (đặt `room.event = null` trong test ném đá và ném bom).
- Còn hạn chế: điểm minigame vẫn do client báo (server có token, thời gian tối thiểu, trần lượt theo nhóm và năng lượng). Muốn chặt hơn cần client gửi nhật ký phím/thời điểm để server chấm lại.

## Đợt 5: luật mới, tù nhân NPC, đồng bộ mạng, đồ họa + animation
**Sửa lỗi / bảo mật trước đó (đợt 4b):** server không sập với URL xấu (`/%zz`), mọi tick/tin nhắn có try/catch, `sid`/token dùng `crypto.randomUUID`, `X-Forwarded-For` lấy phần tử cuối, huỷ minigame khi đổi giờ, minigame giá trị cao (fence/item/dig) có sàn thời gian 4s (`MG_HIGH_VALUE_MIN`) — vẫn chưa chấm điểm trên server.
**Luật (A1, A2, A4):** xem phần Luật chơi (mãn hạn qua Cổng trại, cảnh cáo, vượt ngục khó hơn). `release()` chỉ gọi từ trạm `exit`; `addPoints` chỉ báo "đủ điểm". Snapshot `me` có thêm `warn`, `fc` (số sợi dây đã cắt). `resetInmate` cũng xoá `warn`, `fenceCuts`, `chased`.
**Tù nhân NPC (A9):** `updateInmate`/`npcGoto` trong game.js: mỗi giờ sinh hoạt tự đi tới trạm hợp lý (ăn, làm việc, tập, giải trí...) bằng `stepAlong` + trường khoảng cách tĩnh dùng chung (`staticField`, cache mức module), làm việc tại chỗ, thỉnh thoảng đổi trạm; tối về buồng (4 người đầu nằm giường, act 3). Cờ snapshot NPC tù nhân giống cờ người chơi (`2 | act<<4`), client gán vào `e.flags`.
**Đồng bộ mạng (A10):** người/NPC khác được nội suy có đệm (`track`/`interpolate` trong client.js, trễ ~1,25 lần khoảng cách gói, tối thiểu 0,1s, không ngoại suy nên không vọt quá). Bản thân: dự đoán + đối chiếu theo `seq` (`inputHist`, `predictFromServer`): chạy lại các lệnh chưa được server xác nhận trên vị trí server, lệch <0,3m bỏ qua, 0,3–2,5m kéo dần, >2,5m nhảy thẳng. Lệnh lúc choáng/bị giam ghi là đứng yên.
**Đồ họa (B):** ánh sáng theo đồng hồ (SKY_KEYS: bình minh/trưa/hoàng hôn/đêm; màu nắng, sương, hướng và độ dài bóng đổi theo giờ; mưa xám, cúp điện tối); không dựng bầu trời vì camera nhìn xuống ~52° không thấy trời. Bloom (`setupBloom`, nạp động `three/addons/...` qua route `/vendor/three-addons/`, ngưỡng thấp ban đêm, tắt ban ngày) chỉ ở chất lượng **Cao**; menu chất lượng Thấp/Vừa/Cao trong bảng hướng dẫn (lưu `localStorage ditu-quality`, áp dụng sau khi tải lại). Hạt tròn mềm, vụ nổ nhiều lớp (chớp sáng, sóng xung kích, khói, vết cháy xém), nước mưa bắn trên nền. Cổng kho kéo lên (`animateGates`), hố đào lớn dần + khung gỗ khi thông (`setDigProgress`), hàng rào có 6 sợi dây ẩn dần theo số lần cắt (`setFenceCuts`), cổng trại phía đông. Nhân vật có kiểu tóc/râu/băng đô và dáng cao thấp khác nhau; nhân vật ngoài tầm nhìn bị ẩn.
**Animation (C):** bom bay vòng cung rồi nảy, đá ném có quỹ đạo (`rockfly`); server phát `anim` (`swing`, `hit`, `search`, `grab`, `handsup`) và client chồng lên tư thế nền (`applyFx` trong world.js); cầm dụng cụ theo hoạt động (búa, cuốc, sách, chổi, thìa, vợt...; dựng lười, `getTool`); bị giam thì chắp tay cúi đầu; ngủ nằm trên giường; nhịp bước theo quãng đường thật đã đi (`e.stepDist`, sửa luôn lỗi nhân vật của chính mình không có animation đi); cảnh bị bắt có lớp phủ đỏ + rung màn hình (`captureFx`).
**Chưa làm / lưu ý:** chấm điểm minigame vẫn do client (A11); biểu tượng trạm vẫn là emoji; nhân vật vẫn là ~25 mesh riêng (chưa gộp/instancing); hướng cầm dụng cụ và vị trí nằm ngủ chỉ mới kiểm bằng mắt ở mức tổng quát, nên chỉnh thêm `getTool` (rotation/position) và `rootZ` nếu thấy lệch; cân bằng độ khó mới (64s đào, 3 sợi dây, giá cảnh cáo) chưa có người chơi thử. Test: `test:bots` có thêm kiểm tra cổng trại, cảnh cáo/để mắt, hàng rào 3 sợi, NPC theo lịch (97 kiểm tra).

## Đợt 6: sửa theo phản hồi người chơi
**Luật quản giáo:** ban đêm rời buồng giam là vi phạm (`updateDetection`: "ra ngoài sau giờ tắt đèn"), bị thấy thì rượt rồi **biệt giam** (trước đây chỉ bị khám). `guardTouch` miễn đánh/khám khi đang làm hoặc đang đứng trong vùng một trạm hợp lệ của giờ đó (`p.near.ok`). Tỉ lệ bị lục soát giảm: `searchChance` 0.05 (từ 0.15), `searchChanceContra` 0.2 (từ 0.4). Lưu ý: ban đêm làm việc/tập vẫn "được" về mặt trạm (`NIGHT_FREE_KINDS`) nhưng cũng là vi phạm nếu bị thấy.
**Đèn hải đăng:** quét chậm (|speed| 0.16–0.21 rad/s, một vòng ~30–40 giây, trước đây ~11–14 giây), chùm rộng hơn (`half` 0.2).
**NPC:** chỉ còn 2 tù nhân NPC (`INMATE_NPCS`). Lời thoại NPC/quản giáo hiện 3s (quát 2.5s) thay vì 5/4s — đây là cách hiểu "giảm thời gian sau mỗi lần text" (chưa đổi tần suất nói).
**Chạy:** giữ Shift (hoặc nút 🏃 trên điện thoại): `RULES.runSpeed` 1.5x (1.8x nếu đang tăng lực), tốn `ENERGY.runDrain` 4 sức/giây, gây tiếng động bán kính `runNoise` 8 mỗi ~0.9s, hết sức thì không chạy được. **Đi lén đổi sang phím C** (trước là Shift). Tốc độ tính chung bằng `moveSpeed`/`isRunning` trong shared/sim.js (server + client dự đoán dùng chung); input gửi thêm `run`.
**Mục tiêu giờ tự do:** `goalFor` trả `{ free: true, label: 'Làm mọi thứ bạn muốn' }` ở giờ 5 (không mũi tên/beacon); vẫn ưu tiên "Ra Cổng trại" nếu đủ 300 điểm.
**Chơi bài lớn/nhỏ:** trạm `cards` dùng minigame `hilo`. Server rút cả hai lá trong `startMg` (client chỉ nhận lá đầu), client gửi `{t:'hilo', token, pick:'hi'|'lo'}`, server (`Room.hilo`) trả `hilores {card, win, d}`: đúng +5 Jack, sai -5 Jack (`RULES.hiloStake`), bằng nhau là thua; cần ít nhất 5 Jack mới được ngồi vào bàn; tính vào cap `play`. Client: `hiloGame` trong minigames.js, `minigameEvent` chuyển tin server vào ván đang mở.
**Menu Esc (`#settings`):** âm lượng, góc nhìn, đồ họa, nút Hướng dẫn. **Góc nhìn:** `top` (cố định, mặc định) hoặc `third` (ngôi thứ ba xoay được kiểu Roblox: kéo chuột/vuốt để xoay, W/A/S/D tiến theo hướng camera nhờ xoay vector điều khiển theo `camYaw`; lưu `localStorage ditu-cam`). Không làm góc nhìn thứ nhất (kiểu Minecraft): hợp với game hành động hơn là lén lút, mất tầm nhìn tổng quát và hình quạt tầm nhìn quản giáo.
**Ban đêm:** sáng hơn (SKY_KEYS đêm hemi 0.5–0.62, mặt trăng 0.6–0.85, `hemiNight` sáng hơn, đèn cột 100); chữ bong bóng/bảng tên dịu đi về đêm (`textDim`) và ngưỡng bloom đêm nâng lên để chữ trắng không bị chói.
**Test:** `test:bots` 110 kiểm tra (thêm: đèn quét chậm, đêm ra ngoài bị biệt giam / ở trong buồng không sao, chạy nhanh + tốn sức, bài lớn/nhỏ, chỉ 2 NPC).

**Đợt 6b (phản hồi tiếp):**
- **Giảm tần suất nói:** NPC/quản giáo tự nói mỗi 30–70 giây (mèo 40–80, Tày Scam 30–60; trước 9–24), lời thoại tự nhiên không còn quát; `Room.say` thêm giới hạn chung cả phòng (không ai khác nói trong 4 giây, cùng một NPC cách nhau 12 giây). Tiếng quát phản ứng (bị phát hiện, đánh, khám, đèn pha) và phản hồi mua hàng của Tày Scam (`always`) không bị chặn; `shoutCd` báo động 20s. Lời thoại hiện 3s ở client.
- **Camera ngôi thứ ba dùng khoá chuột (Pointer Lock):** nhấp vào màn hình để khoá chuột ở giữa, di chuột xoay camera (`camYaw/camPitch`), nhân vật đi theo hướng camera; có chấm ngắm giữa màn hình và dòng nhắc khi chưa khoá. Esc thả chuột và mở luôn menu cài đặt (`pointerlockchange` + `lastUnlockAt` tránh bật/tắt đôi); mở cửa hàng, minigame, hướng dẫn, cài đặt thì tự thả chuột (`releaseMouse`). Cảm ứng/bút vẫn vuốt để xoay. Chưa kiểm tra được khoá chuột thật bằng tự động hoá (cần thao tác của người dùng).
- **Chống chồng chữ (`separateBubbles` trong client.js):** mỗi khung hình tính hình chữ nhật của các bong bóng trong không gian camera, cái nào đè lên cái thấp hơn thì được đẩy lên (làm mượt qua `e.bOff`); đã kiểm với 3 người đứng sát nhau cùng nói.

**Đợt 6c (đèn hải đăng + ném giữ để ngắm):**
- **Đèn hải đăng dạng vòng sáng tròn, đi lần lượt từng khu:** `LIGHTHOUSE = { radius: 6.5, dwell: 4.5, speed: 5, chaseSpeed }`; mỗi đèn trong `LIGHTS` có `route` (4 điểm: hành lang/thư viện/sân, nhà ăn/phòng giặt/y tế, giải trí/gym, vườn/tắm/hàng rào, văn phòng/chợ đen, xưởng...) và `off` (lệch pha). `spotAt(light, t)` (shared/map.js) trả tâm vòng sáng: đứng yên 4,5s ở mỗi điểm rồi trượt mượt sang điểm kế; server (`updateLights`) và client (`updateBeams`) cùng dùng nên khớp. Chỉ ai đứng trong vòng sáng (và ngoài buồng giam) mới bị chiếu. Hàng rào (63,38) bị chiếu khoảng 17% thời gian. Client vẽ đĩa phát sáng + viền + chùm hình nón từ đỉnh tháp xuống vòng sáng.
- **Ném bom/đá: giữ phím để ngắm, thả phím thì ném** (`startAim`/`releaseAim`/`updateAim` trong client.js). Giữ Q (bom) hoặc T (đá): hiện vạch chấm tới điểm rơi (tính bằng cùng thuật toán `blocked` như server) + vòng điểm rơi (bom: bán kính nổ `bombRadius`; đá: nhỏ). Hướng ngắm: chuột trỏ trên mặt đất (góc nhìn trên cao) / giữa màn hình (ngôi thứ ba khoá chuột) / joystick (cảm ứng, lúc đó joystick không làm nhân vật đi). Esc huỷ ngắm. Gửi `{t:'bomb'|'rock', a: góc}`; server `aimAngle` dùng góc đó (không có thì dùng `p.ry`), cập nhật `p.ry`, phát hoạt ảnh `throw`. `RULES.bombRange` 3.5, `rockRange` 7. Nút 💣/🪨 trên điện thoại: giữ để ngắm, nhả để ném; bấm vào huy hiệu trên HUD không còn ném.
- Test: `test:bots` có thêm kiểm tra vòng sáng (trong/ngoài vòng, ghé đủ khu và dừng ~4,5s, hàng rào bị chiếu 5–35% thời gian) và ném theo góc ngắm.

## Đợt 7: deploy miễn phí + hàng chờ
- **`server/lobby.js` (class `Lobby`)** thay cho đoạn quản lý phòng trong index.js: `rooms`, `queue`, `join(ws, name, sid, onAdmit)` trả `{kind:'room'|'queued'|'full'}`, `leave`, `tick(dt)`, `status()`. Sức chứa = `MAX_ROOMS` (mặc định 1) x `MAX_PLAYERS_PER_ROOM` (30), trước đây tạo phòng không giới hạn. Phòng đầy thì xếp hàng FIFO (tối đa `MAX_QUEUE`=100, quá thì `queuefull`); chỗ trống luôn dành cho người đầu hàng (không chen ngang); vào lại bằng `sid` thì bỏ qua hàng chờ. Khi có người chờ: `Room.holdSecs` = 20s (thay vì `reconnectSecs` 60s) và người đứng im quá `AFK_SECS` (180s, theo `p.activeAt`, cập nhật khi có input thật hoặc bất kỳ tin nhắn nào ngoài `in` qua `Room.touch`) bị `Room.kick(p,'afk')`.
- Giao thức mới server→client: `queue {pos,total,online,cap}`, `queuefull`, `kicked {why}`; `GET /status` → `{online,capacity,queue}`.
- Client: màn hình đầu hiện "Đang chơi x/y · đang chờ z" (`pollStatus`), thông báo vị trí hàng chờ + nút "Rời hàng chờ" (`#leaveq`), tiêu đề tab `(#N) ...`, toast "Đến lượt bạn!" khi được vào; bị `kicked` thì không tự vào lại; chưa kết nối được lần nào thì tự thử lại tối đa 5 lần và hiện "máy chủ đang thức dậy" (máy chủ miễn phí ngủ).
- Deploy: `render.yaml` (Blueprint Render, gói free), `Dockerfile` + `.dockerignore`, `DEPLOY.md` (Render, Oracle Always Free, bảng biến môi trường, danh sách kiểm tra, nguồn). Số đo phòng 30 người di chuyển: ~0,2 ms CPU/tick, RSS ~56 MB, ~14 KB/s/người (~1,5 GB/giờ cả phòng) — băng thông là thứ dễ cạn nhất trên gói miễn phí. Điều kiện các gói miễn phí được tra ngày 2026-11-12 và có thể đã đổi.
- Test: `npm run test:lobby` (23 kiểm tra: xếp hàng, vào tự động, không chen ngang, rời hàng, hàng đầy, AFK, rớt mạng, vào lại bằng sid, nhiều phòng); đã chạy thật đầu-cuối với server giới hạn 2 chỗ + client trình duyệt (xếp hàng #1 rồi vào tự động khi chỗ được nhả).

## Đợt 8: nhạc nền bằng file + kế hoạch tối ưu
- **Nhạc nền** không còn tổng hợp bằng WebAudio: `public/audio.js` phát hai file `public/music/day.mp3` (mọi giờ ban ngày) và `night.mp3` (giờ tắt đèn, phase 6), lặp lại, chuyển mượt khi đổi giờ (bài cũ nhỏ dần rồi tạm dừng, lần sau phát tiếp từ chỗ cũ), đi qua `musG` nên nút tắt tiếng/thanh âm lượng vẫn có tác dụng; `preload = none` nên bài đêm chỉ tải khi cần. Bản gốc (tên tiếng Việt) ở `sounds/` (đã đưa vào `.gitignore`). **`night.mp3` nặng 33 MB**: cần mã hoá lại (xem L2 trong OPTIMIZE_PLAN.md).
- `server/index.js`: file tĩnh gửi theo luồng, hỗ trợ `Range` (206/416) và `HEAD`; route `/music/` cache 7 ngày; MIME `.mp3`.
- **`OPTIMIZE_PLAN.md`**: bản giao việc tối ưu (đo trước, mạng/đồng bộ, server, dựng hình, tải trang, ổn định) kèm số nền và tiêu chí nghiệm thu. Người dùng báo game khựng trên Render dù 1 người; localhost đo được 70 FPS (p99 18,5 ms) nên nghi vấn chính là độ trễ vùng server + đối chiếu vị trí, chưa xác nhận.

## Đợt 9: tối ưu đồng bộ mạng, tải trang, công cụ đo
**Đồng bộ vị trí (nguyên nhân chính gây khựng khi server ở xa):**
- Thuật toán nằm ở `shared/predict.js` (`predictFromServer`, `correctionFor`), client và `server/test-netcode.js` dùng chung.
- Lỗi cũ: (1) client so thẳng vị trí của mình với vị trí server (`d > 3` thì nhảy về), trong khi lúc mạng trễ server luôn ở sau một đoạn = tốc độ x độ trễ; (2) giả định lệnh đã xác nhận được server áp dụng trọn 50 ms; (3) lệnh chỉ gửi mỗi 50 ms nên đổi hướng giữa hai lần gửi thì client rẽ trước server; (4) phần sửa được cộng thẳng vào vị trí nên thấy giật.
- Cách mới: mỗi lệnh `in` kèm `ct` (mốc thời gian client, ms). Server giữ `p.tl` = đã mô phỏng bao lâu so với mốc của lệnh hiện tại (có thể âm/dương, nhân 0,9 mỗi lệnh để tự trôi về độ trễ trung bình; `setInput` + `updatePlayer` trong game.js) và gửi về qua `me.ia`. Client chạy lại đúng phần lệnh server chưa xử lý. Ngưỡng sửa tỉ lệ theo tốc độ; phần sửa được "trả góp" qua `visOffX/visOffZ` (nhân vật trượt về trong ~0,15 s). Lệnh được gửi ngay khi đổi hướng/phím (`sendInputIfChanged`, cách nhau ≥ 25 ms) ngoài nhịp 50 ms.
- Server: input cũ quá **1000 ms** mới coi là thả phím (trước 400 ms); vòng lặp nhịp chạy bù bằng bước con ≤ 0,05 s (tối đa 0,25 s) thay vì cắt thời gian khi máy chủ khựng.
- **Số đo (mô phỏng `npm run test:netcode`, 60 giây chạy liên tục, số lần bị sửa vị trí cũ → mới):** Singapore 30±10 ms: 91 → 6; Mỹ 120±30 ms: 99 → 4; mạng xấu 150±60 ms: 209 → 13; Mỹ + server khựng 150 ms mỗi 2 giây: 185 → 15. Thuật toán cũ dịch thẳng vị trí (thấy giật), mới làm mượt nên số lần "giật thấy được" là 0. **Đo trong trình duyệt thật** với `?lag=120&jitter=30` (ping ~297 ms): chạy 13 giây bị sửa 1 lần, đi bộ 13 giây 0 lần, lệch hiển thị lớn nhất 0,14 m. Chưa đo trên Render thật.
- Đã thử và bỏ: xếp hàng lệnh ở server (mỗi nhịp lấy một lệnh) và ghi sổ kiểu chặn không âm, cả hai làm số lần sửa tăng vọt (147–258 lần).
**Tải trang:** file văn bản được nén brotli/gzip (nén một lần, giữ trong bộ nhớ, `zcache` trong index.js), có `ETag`/304; dùng `three.module.min.js`. Tổng JS+CSS+HTML truyền qua mạng: ~1,6 MB → ~250 KB.
**Công cụ đo:** phím F3 (bảng chẩn đoán), `?lag=&jitter=` (giả lập mạng trễ mỗi chiều), tin nhắn `ping`/`pong`, `window.__diag()`, `/status` có `tickAvgMs/tickMaxMs/loopLagMs/loopLagMaxMs`, log `[nhịp]` mỗi phút.
**Khác:** tắt máy êm khi nhận SIGTERM (báo người chơi rồi đóng kết nối); `render.yaml` có `region: singapore` (chỉ có tác dụng khi TẠO dịch vụ mới); minimap vẽ 10 lần/giây; `animateCharacter` dùng lại một object tư thế. Kế hoạch còn lại: OPTIMIZE_PLAN.md mục 0.

## Đợt 10: tối ưu tiếp (S1, S2 một phần, N7, C1, C3, C4, C6)
- **S1:** vòng nhịp server tự hiệu chỉnh (`setTimeout` theo mốc `nextAt`, trễ thì nhịp sau bù, trễ >250 ms thì đặt lại mốc).
- **N7:** `sendSnapshots` bỏ qua người có `ws.bufferedAmount` > 64 KB (snapshot sau thay thế được).
- **S2 (một phần):** chỉ `goalFor` được cache, tính lại 4 lần/giây (`p.goalCache`, xoá khi vào lại); các trường khác của `me2` luôn mới nhất. Chưa làm `nearStation`/`updateDetection`.
- **C1:** mức đồ họa "Tự động" (mặc định): FPS < 40 trong 3 giây hạ một bậc (tắt bloom -> bóng 1024 -> pixelRatio 1 -> tắt bóng), FPS > 57 trong 10 giây nâng lại (chờ lâu hơn nếu vừa nâng đã tụt). Áp dụng ngay, không cần tải lại. Chọn mức cố định trong menu thì tắt tự động.
- **C3:** mũi tên chỉ đường chỉ tính lại BFS khi đổi mục tiêu / lệch >2 m / mỗi ~2 giây. **C4:** hình quạt quản giáo chỉ tính lại tia khi quản giáo di chuyển/xoay; HUD chỉ ghi DOM khi giá trị đổi (`setText`/`setWidth`). **C6:** `removeEntity` giải phóng texture chữ, vật liệu và geometry riêng.
- Test: patrol, lobby, bots (3 lần), netcode đều đạt; mở game thật không có lỗi console. **Chưa đo FPS/GC thật** vì cửa sổ tự động bị hãm; cần người chơi mở F3 kiểm.
- **Sau review code:** `autoQuality` bỏ qua 5 giây đầu sau khi vào game và nhận ra màn hình bị giới hạn ~30 Hz (không hạ chất lượng oan); bỏ biến thừa `fpsAcc/fpsN`.
- Còn lại: M4, N4, N6, S2 (phần còn lại), S3, C2, C5, L2 (cần ffmpeg), L4, R3, R4. Lộ trình: `ROADMAP.md`.

## Đợt 4: sửa lỗi + mở rộng
**Bản đồ mở rộng** (`WORLD` -40..64 x -30..48): khu đông có Phòng y tế (khám, giường bệnh hồi máu), Phòng giặt, Vườn rau; dãy nam có Phòng giải trí (bóng bàn, chơi bài, tivi), Phòng gym, Phòng tắm. Sân tập có khung thành, tường gạch, vòng bắn bi (trạm đá bóng, đập gạch, bắn bi, hít đất, kéo xà, tập thể dục). Giặt/vườn là kind `chore` (tính ca lao động); tivi/tắm/khám là kind `rest` (giữ E, hồi máu/sức); `play` là bóng bàn/chơi bài. Mỗi trạm/tuyến tuần tra/điểm mèo phải nằm trên chỗ trống (kiểm tra bằng `blocked`/`distField`).
**Mèo cathehe:** NPC `kind: 'cat'` (`CAT`, `CAT_SPOTS`), tự đi giữa các điểm bằng `walkGuard`, ngồi nghỉ khi `wait > 0` (cờ snapshot = 2), kêu meo (`NPC_LINES.cat`, sfx `meow`).
**Ban đêm:** đến giờ ngủ `lightsOut()` đưa mọi người về buồng. Ban đêm được ra ngoài làm việc (`NIGHT_FREE_KINDS`), không còn vi phạm vì ra ngoài. Quản giáo nhanh hơn (`GUARD.patrolNight/alertNight/backNight`, `chaseSpeed`). 6 đèn pha tháp canh (`LIGHTS`, `LIGHTHOUSE`) quét theo `clock` (client nhận `lc` trong snapshot): ngoài buồng/biệt giam mà bị chiếu thì quản giáo gần nhất rượt ngay (`updateLights`). Cúp điện tắt đèn pha.
**Biệt giam:** bỏ gõ tường, bắt buộc chờ hết án.
**NPC nói:** `say()` giới hạn mỗi NPC một câu mỗi lúc (thường 4s, quát 1,2s); bong bóng chữ to đậm.
**Đồ họa/độ mượt:** nhân vật có khớp (`animateCharacter`, tư thế đích làm mượt), mèo riêng; client nội suy vận tốc giữa các gói (`track`), giảm điều chỉnh vị trí khi đang chạy; HUD chỉ dựng lại DOM khi đổi; bóng 2048, cone quản giáo chỉ cập nhật gần, đèn điểm gán theo cột đèn gần nhất. `SNAP_NEAR_R` = 40 m.
**Test:** `npm run test:bots` có thêm test làm việc không bị đánh, về buồng lúc ngủ, đèn pha. Test cũ dùng `bombHeat` làm vi phạm và tắt `updateLights` của phòng 1 để không ngẫu nhiên.
