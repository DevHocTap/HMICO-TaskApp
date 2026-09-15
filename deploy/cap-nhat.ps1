# Cập nhật bản mới trên máy chủ Windows (PowerShell, chạy trong thư mục dự án).
#   .\deploy\cap-nhat.ps1
# Làm: sao lưu database → git pull → build lại image → khởi động lại → migrate (tự trong entrypoint).
$ErrorActionPreference = "Stop"
$compose = "docker compose --env-file .env.production -f docker-compose.prod.yml"

Write-Host "1/4 Sao lưu database trước khi cập nhật..." -ForegroundColor Cyan
$ten = "truoc-cap-nhat_" + (Get-Date -Format "yyyy-MM-dd_HHmmss") + ".dump"
Invoke-Expression "$compose exec -T postgres sh -c 'pg_dump -Fc -U `$POSTGRES_USER -d `$POSTGRES_DB -f /tmp/$ten'"
$backupDir = (Get-Content .env.production | Where-Object { $_ -match '^BACKUP_HOST_DIR=' }) -replace '^BACKUP_HOST_DIR=', ''
Invoke-Expression "docker cp kpi-postgres:/tmp/$ten `"$backupDir/$ten`""
Write-Host "    -> $backupDir\$ten" -ForegroundColor Green

Write-Host "2/4 Lấy mã mới..." -ForegroundColor Cyan
git pull --ff-only

Write-Host "3/4 Build lại image (vài phút)..." -ForegroundColor Cyan
Invoke-Expression "$compose build"

Write-Host "4/4 Khởi động lại..." -ForegroundColor Cyan
Invoke-Expression "$compose up -d"
Start-Sleep -Seconds 8
Invoke-Expression "$compose ps"
Write-Host "Xem log API:  $compose logs -f api" -ForegroundColor Yellow
