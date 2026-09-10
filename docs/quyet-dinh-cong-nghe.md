# Quyết định công nghệ

Ghi lại lý do để người sau (hoặc chính mình sáu tháng nữa) không phải
tranh luận lại.

## NestJS thay vì Express

Dự án sống nhiều năm và sẽ mọc thêm module chấm công. NestJS ép sẵn cấu
trúc module, có Guard cho phân quyền, Pipe cho validation, và tự sinh
tài liệu API.

Vì chỉ có một người làm và không ai review code, khuôn khổ có sẵn thay
được vai trò đó.

## PostgreSQL thay vì MySQL

Không phải vì MySQL yếu — bài toán này cả hai đều thừa sức. Chọn
PostgreSQL vì: materialized view cho dashboard nặng, JSONB có index tốt
cho cột `formula`, truy vấn đệ quy tối ưu hơn cho cây phòng ban, và
ràng buộc kiểu dữ liệu chặt hơn.

## Prisma 6, không dùng bản mới hơn

Prisma 7 và 8 đã thiết kế lại CLI, cú pháp khác hoàn toàn. Mọi tài liệu
và hướng dẫn hiện có đều viết theo bản 6.

Vì chỉ có một người làm, không có ai để hỏi khi kẹt — khả năng tra được
lời giải trên mạng quan trọng hơn tính năng mới.

## ESM (không phải CommonJS)

NestJS 12 chuyển toàn bộ package chính thức sang ESM. Ứng dụng CJS vẫn
chạy nhờ require(esm) của Node 22+, nhưng Jest không dịch ngược được
mã dùng import.meta.url — test không chạy được ở trạng thái lai.

Quyết định ban đầu chọn CommonJS (vì tài liệu nhiều hơn) đúng với
NestJS 11, sai với 12. Chuyển sang ESM + Vitest ngày 30/08/2026, khi
dự án mới có module org — chi phí một buổi thay vì cả tuần nếu để sau.

Bộ chạy test: Vitest (mặc định của NestJS 12 cho dự án ESM).

## Ubuntu 24.04 LTS thay vì bản mới nhất

Server không phải chỗ dùng bản mới nhất. Bản 24.04 đã ổn định, mọi
hướng dẫn và gói cài đặt đều chạy được.

## Dev trong WSL2, không phải Windows trực tiếp

Máy chủ chạy Ubuntu. Dev trên Windows rồi triển khai lên Linux sẽ gặp lỗi
vặt về đường dẫn, phân biệt hoa thường trong tên file, quyền file, ký tự
xuống dòng — luôn xuất hiện đúng lúc triển khai.

## Máy chủ ĐẶT TẠI CÔNG TY, mở ra ngoài qua tên miền (chốt 10/09/2026)

**Quyết định này ĐẢO NGƯỢC phương án A cũ** (thuê VPS Viettel Cloud, app và
database cùng trên đó). Ghi lại cả hai để sau này không ai đọc tài liệu cũ
rồi làm ngược.

**Chốt hiện tại:** app và database cùng chạy trên MỘT máy chủ đặt tại công
ty, mở ra internet qua tên miền đã có. IP công ty là IP tĩnh nên không cần
DDNS.

**Đánh đổi phải chấp nhận — chính là mặt trái của lý do từng chọn VPS:**

| Điểm | Hệ quả khi đặt máy tại công ty |
|---|---|
| Truy vấn database | dưới 1ms, không qua internet — **tốt hơn VPS** |
| Mạng và điện văn phòng | mất điện hay đứt mạng là cả hệ thống ngừng, kể cả với người làm ở nhà |
| Cổng ra internet | phải mở 80/443 từ ngoài vào máy chủ — **việc của IT, không phải của code** |
| Sao lưu | bản sao nằm CÙNG máy với database, xem `no-ky-thuat.md` |

Vì máy chủ nằm sau đường truyền văn phòng, **TLS là bắt buộc, không phải
tuỳ chọn**: dữ liệu đi qua internet công cộng.

### Một tiến trình Node, KHÔNG PM2 cluster

`RateLimitGuard` và `LoginAttemptService` đếm trong bộ nhớ tiến trình. Chạy
cluster nghĩa là mỗi tiến trình một bộ đếm riêng, hạn mức thực tế bị nhân
lên theo số tiến trình và khoá tạm gần như vô hiệu.

Một tiến trình Node thừa sức cho 200 người. Muốn cluster thì phải chuyển bộ
đếm sang Redis TRƯỚC, không phải sau.

## Đã cân nhắc và loại: Google Apps Script + Sheet

Nhanh hơn khoảng ba lần, không tốn hạ tầng. Loại vì: chấm công sẽ sinh
khoảng 100.000 dòng/năm (Sheet ì ạch từ ~50k dòng), hạn mức thực thi
nghẽn khi 200 người cùng nhập cuối kỳ, và máy chấm công không nối
trực tiếp vào Sheet được.

## Không dùng Passport cho xác thực

NestJS thường hướng dẫn `@nestjs/passport` + `passport-jwt`. Bỏ vì nó thêm
bốn gói và một lớp Strategy trung gian, trong khi phần việc thật của dự án
— xoay vòng refresh token, `mustChangePassword`, `getAccessibleDepartmentIds`
— Passport không đỡ được gì.

Không có Passport thì `JwtAuthGuard` chỉ còn khoảng 40 dòng đọc thẳng từ
trên xuống: lấy header, verify, gán `request.user`. Làm một mình, ít lớp
trung gian dễ dò lỗi hơn.

## Bỏ hẳn bảng `KpiDefinition`

Thiết kế ban đầu tách "định nghĩa KPI" (thư viện dùng lại) khỏi "lần giao
KPI". Đúng ở tầng công ty và phòng ban, sai ở tầng cá nhân.

Ở tầng cá nhân, tiêu chí gắn chặt với **chức danh**: "Tiến độ hoàn thành
Shop Drawing" chỉ có nghĩa với nhân viên Shop Drawing. Gần như không có
tiêu chí nào dùng chéo giữa các chức danh, nên vai trò "thư viện dùng lại"
đã chuyển hẳn sang `KpiTemplate` — mẫu mới là thứ được dùng lại nhiều kỳ.

Giữ cả hai bảng có một cái giá rất cụ thể: người tạo mẫu phải qua **hai
bước** — tạo định nghĩa KPI trước, rồi mới tạo dòng trong mẫu trỏ vào nó.
Tài liệu ghi rõ các phòng ngoài phòng Kỹ thuật chưa có biểu mẫu và sẽ xây
lần đầu ngay trên phần mềm này, người dùng là trưởng phòng không rành máy
tính. Hai bước là đúng chỗ họ bỏ cuộc.

Vậy `KpiTemplateItem` tự chứa toàn bộ nội dung. Bớt một bảng, bớt một màn
hình, bớt một lớp join.

Khi nào mở rộng lên tầng phòng ban để thay BSCkpi thì thêm lại thư viện —
lúc đó tiêu chí cấp công ty mới thật sự được dùng lại nhiều nơi.

