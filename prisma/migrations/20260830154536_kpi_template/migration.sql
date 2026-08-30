-- Mẫu KPI: thêm trạng thái xuất bản, người tạo, và các cột theo biểu mẫu thật.
--
-- Hai cột được ĐỔI TÊN chứ không xoá rồi thêm lại, để giữ nguyên dữ liệu:
--   orderIndex      -> displayOrder
--   measurementUnit -> measurementText
-- Prisma mặc định sinh ra DROP + ADD cho việc đổi tên, làm mất dữ liệu.

-- CreateEnum
CREATE TYPE "TemplateStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- AlterTable: KpiTemplate
ALTER TABLE "KpiTemplate" ADD COLUMN "description" TEXT;
ALTER TABLE "KpiTemplate" ADD COLUMN "status" "TemplateStatus" NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "KpiTemplate" ADD COLUMN "createdById" TEXT;

-- AlterTable: KpiTemplateItem — đổi tên, giữ dữ liệu
ALTER TABLE "KpiTemplateItem" RENAME COLUMN "orderIndex" TO "displayOrder";
ALTER TABLE "KpiTemplateItem" RENAME COLUMN "measurementUnit" TO "measurementText";
ALTER TABLE "KpiTemplateItem" ADD COLUMN "measureMethod" TEXT;

-- Index
DROP INDEX "KpiTemplateItem_templateId_section_orderIndex_idx";
CREATE INDEX "KpiTemplateItem_templateId_section_displayOrder_idx"
  ON "KpiTemplateItem"("templateId", "section", "displayOrder");
CREATE INDEX "KpiTemplate_status_idx" ON "KpiTemplate"("status");

-- ForeignKey
ALTER TABLE "KpiTemplate" ADD CONSTRAINT "KpiTemplate_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
