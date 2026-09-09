-- Lát cắt 5 — chấm điểm.
--
-- Viết TAY, không để `prisma migrate dev` sinh: môi trường không có TTY, và
-- quy tắc ở docs/no-ky-thuat.md bắt đọc SQL trước khi chạy.

-- Dấu vết lần TRẢ LẠI gần nhất của luồng CHẤM ĐIỂM.
-- Cố ý KHÔNG dùng lại `disputedAt` / `disputeReason`: hai cột đó thuộc luồng
-- GIAO KPI (nhân viên nêu ý kiến về nội dung KPI đầu kỳ). Trả lại phiếu đã
-- tự chấm là việc khác hẳn, do người chấm làm, ở cuối kỳ. Gộp chung thì lần
-- nêu ý kiến đầu kỳ sẽ bị lý do trả lại cuối kỳ ghi đè.
-- Cả hai chỉ là BẢN SAO CHO NHANH; nguồn sự thật vẫn là ScorecardEvent.
ALTER TABLE "Scorecard" ADD COLUMN "rejectedAt" TIMESTAMP(3);
ALTER TABLE "Scorecard" ADD COLUMN "rejectReason" TEXT;

-- Bỏ `overScaleNote`: ghi chú khi chấm vượt thang nằm ở `selfComment` /
-- `managerComment`, mỗi cột điểm một ghi chú riêng. Một cột dùng chung cho
-- cả hai người chấm thì không biết ai viết.
--
-- ĐÂY LÀ DROP COLUMN THẬT, KHÔNG PHẢI ĐỔI TÊN. Đã kiểm trước khi viết:
--   SELECT count(*) FROM "ScorecardItem" WHERE "overScaleNote" IS NOT NULL; -> 0
-- Cột chưa có dòng code nào ghi vào (grep toàn repo: chỉ schema + migration cũ).
ALTER TABLE "ScorecardItem" DROP COLUMN "overScaleNote";
