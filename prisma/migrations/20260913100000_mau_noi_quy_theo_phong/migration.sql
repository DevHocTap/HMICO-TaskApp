-- Mẫu nội quy theo phòng (13/09/2026): mẫu hệ thống gắn được vào một phòng.
ALTER TABLE "KpiTemplate" ADD COLUMN "departmentId" TEXT;

CREATE INDEX "KpiTemplate_departmentId_idx" ON "KpiTemplate"("departmentId");

ALTER TABLE "KpiTemplate" ADD CONSTRAINT "KpiTemplate_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
