-- Cài đặt hệ thống (11/09/2026).
--
-- Viết TAY, không để `prisma migrate dev` sinh: môi trường không có TTY, và
-- quy tắc ở docs/no-ky-thuat.md bắt đọc SQL trước khi chạy.
--
-- Mỗi nhóm cài đặt một dòng, `value` là JSON. Không seed: thiếu dòng nghĩa
-- là dùng mặc định trong mã (src/modules/settings/cai-dat-mac-dinh.ts).
-- `updatedById` không có khoá ngoại: xoá tài khoản quản trị không được làm
-- mất cấu hình.
CREATE TABLE "SystemSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
);
