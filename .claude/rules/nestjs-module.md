---
paths:
  - src/modules/**
---

# Quy tắc khi viết module NestJS

- Ba lớp bắt buộc: `controller` → `service` → `dto`. Controller không
  được gọi database trực tiếp.
- Mọi dữ liệu đầu vào phải có DTO với `class-validator`. Không nhận
  `any` hay object trần.
- **Trong lớp NestJS** (controller, service, module, DTO, guard): đặt tên
  biến, hàm, class bằng tiếng Anh. Comment và thông báo lỗi trả về cho
  người dùng bằng tiếng Việt.
- **Trong file LOGIC THUẦN** (không import NestJS, không chạm database —
  `scoring/scoring-engine.ts`, `scoring/huong-b.ts`, `period-calendar.ts`,
  `scorecard-validation.ts`, `template-validation.ts`): đặt tên hàm và biến
  bằng **tiếng Việt**, theo đúng từ ngữ của quy tắc nghiệp vụ
  (`tinhDiem`, `chotDiem`, `xepLoaiTuTongDiem`, `tinhTinhTrangHanNop`).

  Lý do: mấy file này là bản dịch một-đối-một từ `docs/quy-tac-nghiep-vu.md`.
  Giữ nguyên từ nghiệp vụ thì đối chiếu code với tài liệu bằng mắt được,
  không phải dịch qua lại hai lần. Ranh giới rõ: hễ file có `@Injectable()`
  hay import `@nestjs/*` thì dùng tiếng Anh.
- Không dùng `any` trừ khi thật sự không tránh được, kèm comment giải thích.
- Ném lỗi bằng exception có sẵn của NestJS (`NotFoundException`,
  `ForbiddenException`...), không trả về mã lỗi thủ công.
- Module `org/` không được chứa bất kỳ logic nào liên quan KPI.