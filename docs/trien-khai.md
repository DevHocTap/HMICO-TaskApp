# Triển khai lên máy chủ Windows + tên miền `hmicodev.io.vn`

> Chốt 15/09/2026. Máy chạy thật là **một máy Windows đặt tại công ty**, có
> Internet; mọi thứ chạy trong **Docker Desktop**: `postgres` · `api` ·
> `web` (Caddy — phục vụ giao diện, tự lấy HTTPS Let's Encrypt, chuyển
> `/api` sang API). Không cài nginx, certbot, Node hay PostgreSQL trực tiếp
> lên Windows.

## 0. Trước khi bắt đầu — ba việc ngoài máy

| Việc | Ai | Kiểm tra |
|---|---|---|
| **A record** `hmicodev.io.vn` → IP tĩnh công ty (nơi mua tên miền) | bạn | trên máy bất kỳ: `nslookup hmicodev.io.vn` ra đúng IP công ty |
| **Router mở cổng 80 và 443** → IP LAN của máy Windows (port forwarding). Máy Windows đặt **IP LAN tĩnh** (hoặc DHCP reservation) | IT | từ điện thoại tắt Wi-Fi (dùng 4G) mở `http://hmicodev.io.vn` sau khi chạy xong |
| Máy Windows: **tắt Sleep**, tắt "tự tắt màn hình → ngủ", Docker Desktop **Start when you sign in**, tài khoản Windows **tự đăng nhập** khi khởi động (Windows cập nhật xong sẽ tự bật lại app) | bạn | rút điện cắm lại, 3 phút sau web vẫn vào được |

Cổng 80 **bắt buộc** mở dù chỉ dùng HTTPS: Let's Encrypt xác thực qua 80.

## 1. Cài phần mềm trên máy Windows (một lần)

1. **Docker Desktop** — https://www.docker.com/products/docker-desktop/ , chọn WSL 2 backend (mặc định). Cài xong mở lên, đợi "Engine running".
2. **Git** — https://git-scm.com/download/win , mặc định.
3. Mở **PowerShell** (không cần admin) kiểm:
   ```powershell
   docker --version
   docker compose version
   git --version
   ```

## 2. Lấy mã và cấu hình

```powershell
cd D:\
git clone https://github.com/DevHocTap/HMICO-TaskApp.git kpi
cd D:\kpi
mkdir D:\kpi-backups
Copy-Item .env.production.example .env.production
notepad .env.production
```

Điền `.env.production` — bốn dòng **phải đổi**:

| Dòng | Điền |
|---|---|
| `DB_PASSWORD` | mật khẩu mạnh, sinh: `node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"` (không có Node thì gõ tay ≥ 24 ký tự ngẫu nhiên) |
| `JWT_SECRET` | ≥ 32 ký tự ngẫu nhiên, **khác máy dev** |
| `BACKUP_HOST_DIR` | `D:/kpi-backups` (dấu `/`) |
| `BOOTSTRAP_ADMIN_PASSWORD` | mật khẩu tạm cho tài khoản admin đầu tiên |

`DOMAIN=hmicodev.io.vn` đã điền sẵn.

## 3. Chạy lần đầu

```powershell
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

Lần đầu build 5–10 phút (tải image, cài gói, build web + API). Xong:

```powershell
docker compose --env-file .env.production -f docker-compose.prod.yml ps        # ba container Up, api (healthy)
docker compose --env-file .env.production -f docker-compose.prod.yml logs api  # phải thấy "[api] chạy"
docker compose --env-file .env.production -f docker-compose.prod.yml logs web  # Caddy: "certificate obtained successfully"
```

Caddy lấy chứng chỉ trong ~30 giây **nếu** cổng 80/443 đã tới được máy từ
Internet. Nếu log web báo lỗi ACME liên tục → mục 0 chưa xong (DNS hoặc
router). **Muốn chạy thử trong mạng LAN trước khi có tên miền:** đặt
`DOMAIN=http://<IP LAN của máy>` (có `http://` phía trước) — Caddy bỏ HTTPS,
vào bằng `http://<IP LAN>`; xong thì đổi lại `DOMAIN=hmicodev.io.vn` và
`up -d`.

Đã chạy thử trọn bộ compose này trên máy dev (15/09): ba container lên, API
tự migrate + tạo kỳ, bootstrap admin, đăng nhập qua `/api`, sao lưu chế độ
`local` bằng pg_dump 16 trong image ra thư mục máy chủ, khôi phục qua API —
đều đúng.

## 4. Tạo tài khoản quản trị đầu tiên

```powershell
.\deploy\bootstrap-admin.ps1
```

Mở `https://hmicodev.io.vn`, đăng nhập bằng `BOOTSTRAP_ADMIN_EMAIL`, hệ
thống bắt đổi mật khẩu ngay. Xong thì **xoá hai dòng `BOOTSTRAP_*`** trong
`.env.production`. Script từ chối chạy lần hai khi đã có ADMIN.

**KHÔNG chạy `prisma db seed` trên máy thật** — seed là dữ liệu giả của máy dev.

Sau đó ADMIN tự tạo phòng ban, chức danh, nhân viên trên giao diện (HCNS
chốt 03/09: nhập tay, không import Excel).

## 5. Kiểm tra sau khi lên

- [ ] `https://hmicodev.io.vn` mở được từ **ngoài công ty** (4G), ổ khoá xanh
- [ ] Đăng nhập, đổi mật khẩu, vào Cài đặt hệ thống → **Sao lưu**: bấm "Sao lưu ngay" → có file trong `D:\kpi-backups`
- [ ] Nhật ký thao tác ghi đúng **IP thật** của người dùng (không phải 172.x của Docker) — `TRUST_PROXY=1` đã đặt sẵn trong compose
- [ ] Tắt Docker Desktop rồi bật lại → ba container tự lên (`restart: unless-stopped`)

## 6. Cập nhật bản mới

Trên máy dev: commit, `git push`. Trên máy chủ:

```powershell
cd D:\kpi
.\deploy\cap-nhat.ps1
```

Script tự: dump database ra `D:\kpi-backups\truoc-cap-nhat_<giờ>.dump` →
`git pull` → build image → khởi động lại; API tự chạy `prisma migrate
deploy` lúc khởi động. Người dùng mất kết nối ~30 giây.

**Quay lui** nếu bản mới hỏng:
```powershell
git checkout <commit cũ>
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```
Nếu bản mới đã đổi schema thì thêm bước khôi phục database từ file
`truoc-cap-nhat_*` (trang Sao lưu → Khôi phục, hoặc `scripts/khoi-phuc.sh`
— xem `docs/van-hanh-sao-luu.md`).

## 7. Vận hành hằng ngày

| Việc | Lệnh / chỗ |
|---|---|
| Xem trạng thái | `docker compose --env-file .env.production -f docker-compose.prod.yml ps` |
| Xem log lỗi API | `... logs --tail 200 api` |
| Sao lưu | tự động 02:00 hằng đêm vào `D:\kpi-backups`; trang Sao lưu để bấm tay / tải về / khôi phục |
| Bản sao thứ hai | gắn ổ ngoài (vd `E:`), đặt `BACKUP_MIRROR_HOST_DIR=E:/kpi-backups` và `BACKUP_MIRROR_DIR=/backups-mirror` trong `.env.production`, rồi `up -d` lại |
| Khởi động lại một container | `... restart api` |
| Dừng hẳn | `... down` (dữ liệu vẫn nằm trong volume `pgdata`, không mất) |

## 8. Điều phải biết khi chạy trên Windows thay vì Ubuntu

- Docker Desktop chỉ chạy **khi có người đăng nhập Windows** — vì vậy phải
  đặt tự đăng nhập và tắt Sleep (mục 0). Máy tắt là cả công ty không vào được.
- Windows Update tự khởi động lại máy; sau khi tự đăng nhập, Docker Desktop
  bật lại và ba container tự lên. Nên đặt **Active hours** trong Windows
  Update để không khởi động lại trong giờ làm.
- Bản sao lưu nằm trên ổ `D:` của chính máy đó → phải có bản thứ hai (ổ
  ngoài / NAS) như đã ghi ở `no-ky-thuat.md`.
- Không mở cổng 5432 (Postgres) ra ngoài — compose không publish cổng này.
