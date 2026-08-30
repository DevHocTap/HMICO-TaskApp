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

VPS chạy Ubuntu. Dev trên Windows rồi triển khai lên Linux sẽ gặp lỗi
vặt về đường dẫn, phân biệt hoa thường trong tên file, quyền file, ký tự
xuống dòng — luôn xuất hiện đúng lúc triển khai.

## App và database cùng trên VPS (phương án A)

Đã cân nhắc để database ở server công ty nhưng loại bỏ: mỗi truy vấn
phải đi qua internet (10–30ms thay vì dưới 1ms), phụ thuộc mạng và điện
văn phòng, và phải mở cổng database ra ngoài.

Bù lại: mỗi đêm VPS chạy `pg_dump`, mã hoá, đẩy bản sao về server công
ty. Công ty vẫn giữ dữ liệu mà hệ thống không phụ thuộc mạng công ty.

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

