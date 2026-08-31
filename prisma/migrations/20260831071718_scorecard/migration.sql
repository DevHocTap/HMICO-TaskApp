-- Phiếu KPI: kỳ đánh giá có mã và dấu vết khoá, phiếu có đủ snapshot bối cảnh.
--
-- CHÍN CỘT ĐƯỢC ĐỔI TÊN, không xoá rồi thêm lại. Prisma mặc định sinh
-- DROP + ADD cho việc đổi tên — trên máy chủ thật là mất sạch dữ liệu cột
-- đó mà không hỏi gì. Xem docs/no-ky-thuat.md mục "Quy tắc rút ra".
--
--   Period.dueDate                    -> submitDeadline
--   Scorecard.userId                  -> ownerUserId
--   Scorecard.level                   -> employeeLevel
--   Scorecard.totalSelfScore          -> selfTotalScore
--   Scorecard.totalManagerScore       -> managerTotalScore
--   ScorecardItem.orderIndex          -> displayOrder
--   ScorecardItem.measurementUnit     -> measurementText
--   ScorecardItem.sourceTemplateItemId-> templateItemId
--   Grade.NOT_MET                     -> NOT_ACHIEVED

-- ===== Đổi tên giá trị enum (giữ nguyên dữ liệu đang tham chiếu) =====
ALTER TYPE "Grade" RENAME VALUE 'NOT_MET' TO 'NOT_ACHIEVED';

-- ===== Period =====
ALTER TABLE "Period" RENAME COLUMN "dueDate" TO "submitDeadline";

-- code là khoá idempotent cho việc tự sinh kỳ. Bảng đang có 4 kỳ nên phải
-- điền giá trị trước khi đặt NOT NULL: suy từ ngày bắt đầu và loại kỳ.
ALTER TABLE "Period" ADD COLUMN "code" TEXT;
UPDATE "Period" SET "code" = CASE
  WHEN "type" = 'MONTH'   THEN to_char("startDate", 'YYYY-MM')
  WHEN "type" = 'QUARTER' THEN to_char("startDate", 'YYYY') || '-Q' || to_char("startDate", 'Q')
  ELSE to_char("startDate", 'YYYY')
END;
ALTER TABLE "Period" ALTER COLUMN "code" SET NOT NULL;
CREATE UNIQUE INDEX "Period_code_key" ON "Period"("code");

ALTER TABLE "Period" ADD COLUMN "lockedAt" TIMESTAMP(3);
ALTER TABLE "Period" ADD COLUMN "lockedById" TEXT;
ALTER TABLE "Period" ADD COLUMN "createdById" TEXT;
ALTER TABLE "Period" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Period" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Period" ADD CONSTRAINT "Period_lockedById_fkey"
  FOREIGN KEY ("lockedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Period" ADD CONSTRAINT "Period_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ===== Scorecard =====
ALTER TABLE "Scorecard" RENAME COLUMN "userId" TO "ownerUserId";
ALTER TABLE "Scorecard" RENAME COLUMN "level" TO "employeeLevel";
ALTER TABLE "Scorecard" RENAME COLUMN "totalSelfScore" TO "selfTotalScore";
ALTER TABLE "Scorecard" RENAME COLUMN "totalManagerScore" TO "managerTotalScore";

-- Nullable để dành cho ownerType = DEPARTMENT sau này
ALTER TABLE "Scorecard" ALTER COLUMN "ownerUserId" DROP NOT NULL;

ALTER TABLE "Scorecard" ADD COLUMN "jobTitleId" TEXT;
ALTER TABLE "Scorecard" ADD COLUMN "systemTemplateId" TEXT;
ALTER TABLE "Scorecard" ADD COLUMN "proposedById" TEXT;
ALTER TABLE "Scorecard" ADD COLUMN "disputedAt" TIMESTAMP(3);
ALTER TABLE "Scorecard" ADD COLUMN "disputeReason" TEXT;

ALTER TABLE "Scorecard" ADD CONSTRAINT "Scorecard_jobTitleId_fkey"
  FOREIGN KEY ("jobTitleId") REFERENCES "JobTitle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Scorecard" ADD CONSTRAINT "Scorecard_systemTemplateId_fkey"
  FOREIGN KEY ("systemTemplateId") REFERENCES "KpiTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Scorecard" ADD CONSTRAINT "Scorecard_proposedById_fkey"
  FOREIGN KEY ("proposedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Ràng buộc một người một kỳ một phiếu. PostgreSQL coi các NULL là khác
-- nhau nên ràng buộc này chỉ áp cho phiếu có chủ sở hữu — phiếu cấp phòng
-- ban sau này không bị vướng. Không cần partial index riêng.
ALTER INDEX "Scorecard_userId_periodId_key" RENAME TO "Scorecard_ownerUserId_periodId_key";

-- ===== ScorecardItem =====
ALTER TABLE "ScorecardItem" RENAME COLUMN "orderIndex" TO "displayOrder";
ALTER TABLE "ScorecardItem" RENAME COLUMN "measurementUnit" TO "measurementText";
ALTER TABLE "ScorecardItem" RENAME COLUMN "sourceTemplateItemId" TO "templateItemId";

ALTER TABLE "ScorecardItem" ADD COLUMN "measureMethod" TEXT;
ALTER TABLE "ScorecardItem" ADD COLUMN "overScaleNote" TEXT;

-- direction thành nullable: chỉ có nghĩa khi scoringMode = CALCULATED
ALTER TABLE "ScorecardItem" ALTER COLUMN "direction" DROP NOT NULL;
ALTER TABLE "ScorecardItem" ALTER COLUMN "direction" DROP DEFAULT;

ALTER INDEX "ScorecardItem_scorecardId_section_orderIndex_idx"
  RENAME TO "ScorecardItem_scorecardId_section_displayOrder_idx";
