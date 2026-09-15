# Tạo tài khoản ADMIN đầu tiên trên máy chủ thật (chạy MỘT lần sau khi up).
# Đọc BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD từ .env.production.
#   .\deploy\bootstrap-admin.ps1
$ErrorActionPreference = "Stop"
docker compose --env-file .env.production -f docker-compose.prod.yml exec api node prisma/bootstrap.ts
Write-Host "Xong. Đăng nhập bằng email trên, hệ thống bắt đổi mật khẩu lần đầu." -ForegroundColor Green
Write-Host "Sau đó XOÁ hai dòng BOOTSTRAP_* trong .env.production." -ForegroundColor Yellow
