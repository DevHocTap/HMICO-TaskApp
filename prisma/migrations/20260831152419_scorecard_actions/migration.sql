-- Bổ sung hành động cho nhật ký luồng phiếu KPI.
--
-- Chỉ THÊM giá trị enum, không đổi tên và không xoá giá trị nào, nên không
-- có dữ liệu nào bị ảnh hưởng.
ALTER TYPE "ScorecardAction" ADD VALUE IF NOT EXISTS 'CREATE' BEFORE 'PROPOSE';
ALTER TYPE "ScorecardAction" ADD VALUE IF NOT EXISTS 'UPDATE_ITEMS' BEFORE 'PROPOSE';
ALTER TYPE "ScorecardAction" ADD VALUE IF NOT EXISTS 'RE_PROPOSED_UNCHANGED' AFTER 'PROPOSE';
