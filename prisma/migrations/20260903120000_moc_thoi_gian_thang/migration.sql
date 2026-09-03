-- Bốn mốc trong tháng — HCNS chốt 03/09/2026 (câu A2).
--
-- Chỉ THÊM cột, không đổi tên và không xoá cột nào, nên không có nguy cơ
-- mất dữ liệu. Riêng "submitDeadline" ĐỔI NGHĨA: trước là ngày 02 tháng kế
-- tiếp, nay là ngày 30 (hoặc ngày cuối tháng) của chính kỳ đó — nên phải
-- tính lại cho mọi kỳ tháng đang có.

ALTER TABLE "Period" ADD COLUMN "assignDeadline"       DATE;
ALTER TABLE "Period" ADD COLUMN "selfScoreDeadline"    DATE;
ALTER TABLE "Period" ADD COLUMN "managerScoreDeadline" DATE;

-- LEAST(...) là cách kẹp về ngày cuối tháng: tháng 2 thì ngày 29 và ngày 30
-- đều thành 28 (hoặc 29 nếu năm nhuận).
UPDATE "Period" SET
  "assignDeadline" = LEAST(
      ("startDate" - INTERVAL '1 month' + INTERVAL '24 days')::date,
      (date_trunc('month', "startDate" - INTERVAL '1 month')
        + INTERVAL '1 month - 1 day')::date),
  "selfScoreDeadline" = LEAST(
      ("startDate" + INTERVAL '24 days')::date, "endDate"),
  "managerScoreDeadline" = LEAST(
      ("startDate" + INTERVAL '28 days')::date, "endDate"),
  "submitDeadline" = LEAST(
      ("startDate" + INTERVAL '29 days')::date, "endDate")
WHERE "type" = 'MONTH';

-- Kỳ quý và kỳ năm không có hạn nào — dọn lại cho chắc.
UPDATE "Period" SET
  "assignDeadline" = NULL, "selfScoreDeadline" = NULL,
  "managerScoreDeadline" = NULL, "submitDeadline" = NULL
WHERE "type" <> 'MONTH';
