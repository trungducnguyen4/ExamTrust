# Deploy ExamTrust lên cloud miễn phí (Oracle Cloud Always Free)

Mục tiêu: **FE giữ trên Vercel** (đã có), **BE + MySQL + Redis + AI worker + HTTPS** chạy trên
**một VM Always Free** — tổng chi phí **0đ/tháng**, không cần thẻ tín dụng sau bước xác minh.

```
Người dùng ──▶ Vercel (Next.js, FE)  ──HTTPS──▶  VM Oracle (Caddy)
                                                   │
                                        ┌──────────┼──────────┐
                                     backend    ai-worker   mysql + redis
                                     :3001      (queue)     (nội bộ)
```

Không phải sửa code ứng dụng: dùng đúng `BE/Dockerfile` và `prisma/schema.prisma` hiện có.

## 1. Chuẩn bị

| Thứ cần có | Ghi chú |
|---|---|
| Tài khoản Oracle Cloud | Đăng ký free tier, cần thẻ Visa/Mastercard để xác minh (giữ ~1 USD tạm giữ, hoàn lại) |
| Region | Chọn **Singapore** hoặc **Japan East** (gần VN); Always Free gắn với home region |
| SSH key | `ssh-keygen -t ed25519` nếu chưa có (`~/.ssh/id_ed25519.pub`) |
| Vercel | Project FE đã deploy; cần biết URL production |

> Oracle đã giảm quota Always Free ARM trong 2026 (hiện **2 OCPU / 12 GB** thay vì 4/24). Vẫn
> dư sức cho MySQL 8 + NestJS + worker. Nếu hết quota, chọn shape `VM.Standard.E2.1.Micro`
> (AMD, 1 OCPU/1 GB) và giữ swap 2 GB trong `cloud-init.yaml`.

## 2. Tạo VM

1. Console → **Compute → Instances → Create instance**.
2. **Image**: Canonical Ubuntu **24.04**.
3. **Shape**: `VM.Standard.A1.Flex`, **2 OCPU / 12 GB** (Always Free).
4. **Boot volume**: 50 GB (Always Free cho tới 200 GB tổng).
5. **Networking**: tick *Assign a public IPv4 address*.
6. **Add SSH keys**: dán nội dung `~/.ssh/id_ed25519.pub`.
7. **Advanced options → Management → cloud-init script**: dán toàn bộ
   [`cloud-init.yaml`](cloud-init.yaml).
8. Create. Đợi ~3–5 phút cho cloud-init build xong (lần đầu build NestJS khá lâu).

## 3. Mở cổng (bắt buộc, Oracle chặn mặc định)

Console → **Networking → Virtual Cloud Networks → VCN của bạn → Security Lists →
Default Security List → Add Ingress Rules**, thêm 2 rule:

| Stateless | Source | Protocol | Destination port |
|---|---|---|---|
| No | `0.0.0.0/0` | TCP | `80` |
| No | `0.0.0.0/0` | TCP | `443` |

`cloud-init.yaml` đã mở iptables trên máy (Oracle image mặc định drop 80/443).
**Không mở** 3001/3306/6379 ra internet — chỉ Caddy được phép vào.

## 4. Cấu hình env

Cloud-init đã tạo `/opt/examtrust/deploy/free/.env` và sinh ngẫu nhiên
`MYSQL_PASSWORD`, `MYSQL_ROOT_PASSWORD`, `JWT_SECRET`; `API_DOMAIN` được suy ra từ public IP
(`<ip>.sslip.io` — DNS wildcard miễn phí, Caddy tự lấy chứng chỉ Let's Encrypt).

Cần điền tay:

```bash
ssh ubuntu@<public-ip>
sudo nano /opt/examtrust/deploy/free/.env
```

- `FRONTEND_URL`, `APP_BASE_URL`, `CORS_ORIGINS` → URL Vercel thật (vd `https://exam-trust.vercel.app`).
- `DEEPSEEK_API_KEY` (hoặc `AI_PROVIDER=google` + `GOOGLE_AI_API_KEY`).
- 6 biến `R2_*` nếu dùng upload media/webcam (lấy lại từ Cloudflare dashboard hoặc `BE/.env` local,
  xem `EC2_DB_DEPLOY_NOTES.md` mục 4.1 — bài học: thiếu R2 thì upload hỏng âm thầm).
- `SMTP_*` nếu cần gửi mail.

Sau khi sửa env:

```bash
cd /opt/examtrust
sudo docker compose --env-file deploy/free/.env -f deploy/free/docker-compose.yml up -d
```

## 5. DB schema + dữ liệu mẫu

`bootstrap.sh` đã chạy `prisma db push` (giống runbook EC2 cũ — `migrate deploy` không dùng được
vì thiếu baseline 16 bảng). Nếu cần tạo DB mới hoàn toàn:

```bash
cd /opt/examtrust
bash deploy/free/bootstrap.sh --seed     # db push + seed-master.ts (idempotent, chậm lần đầu)
```

Seed dùng `ts-node` (devDependency đã bị prune trong image production) nên lần chạy sẽ tải
`ts-node` qua `npx` — cần internet, mất 1–2 phút.

## 6. Trỏ FE (Vercel) sang API mới

`NEXT_PUBLIC_API_BASE_URL` được **nhúng vào bundle lúc build**, nên phải set env rồi **redeploy**:

1. Vercel → project `exam-trust` → **Settings → Environment Variables**:
   `NEXT_PUBLIC_API_BASE_URL = https://<API_DOMAIN>/api` (Production + Preview).
2. **Deployments → Redeploy** (build lại, không chỉ restart).
3. Mở site, đăng nhập thử.

Hoặc bằng CLI (nếu đã đăng nhập): `cd FE && vercel env add NEXT_PUBLIC_API_BASE_URL` rồi
`vercel --prod`.

## 7. Nghiệm thu

```bash
curl -s https://<API_DOMAIN>/api/health          # {"ok":true}
curl -s -o /dev/null -w "%{http_code}\n" https://<API_DOMAIN>/docs   # 200
```

- Trình duyệt: `https://<API_DOMAIN>/docs` mở Swagger.
- FE: login admin, mở 1 trang có dữ liệu.
- `docker compose ... ps` phải thấy `backend` và `mysql` ở trạng thái **healthy**.

## 8. Deploy các lần sau

Thủ công:

```bash
ssh ubuntu@<ip>
cd /opt/examtrust && git pull --ff-only
sudo bash deploy/free/bootstrap.sh
```

Hoặc qua GitHub Actions: workflow **Deploy free VM** (`.github/workflows/deploy-free-vm.yml`),
chọn mode `deploy` / `dbpush` / `seed`. Cần đặt:

| Loại | Tên | Giá trị |
|---|---|---|
| Secret | `VM_HOST` | public IP hoặc domain |
| Secret | `VM_USER` | `ubuntu` |
| Secret | `VM_SSH_KEY` | private key (dán cả `-----BEGIN...`) |
| Secret | `VM_ENV_FILE` | (tuỳ chọn) nội dung `.env` để đồng bộ |
| Variable | `API_DOMAIN` | domain API để smoke-check |

## 9. Sự cố thường gặp

| Hiện tượng | Nguyên nhân / cách sửa |
|---|---|
| `502` từ Caddy | `backend` chưa healthy: `docker compose logs backend`; thường do `DATABASE_URL`/`JWT_SECRET` sai |
| Caddy không lấy được cert | Chưa mở 80/443 (Security List **và** iptables); domain chưa trỏ đúng IP |
| `Access denied for user` | Sai `MYSQL_PASSWORD` trong `.env` sau khi volume đã tạo → phải xoá volume `examtrust_mysql-data` nếu đổi mật khẩu |
| Build OOM trên 1 GB | Dùng shape ARM 12 GB, hoặc thêm swap; build trên máy khác rồi push image |
| API tự dừng | `restart: unless-stopped` đã bật; kiểm tra `dmesg | grep -i oom` |
| Upload ảnh hỏng âm thầm | Thiếu biến `R2_*` (xem mục 4) |
| FE vẫn gọi `localhost:3001` | Chưa set `NEXT_PUBLIC_API_BASE_URL` hoặc chưa **redeploy** |

## 10. Bảo mật & giới hạn

- Chỉ mở 22/80/443; MySQL/Redis/3001 chỉ trong network nội bộ compose.
- SSH: nên tắt password auth (image Oracle mặc định chỉ key).
- Oracle Always Free không SLA, có thể thu hồi tài nguyên nhàn rỗi kéo dài; giữ một cron ping
  `/api/health` mỗi 5 phút nếu muốn chắc chắn instance được dùng.
- Phương án thay thế cùng compose này: GCP `e2-micro` (1 vCPU/1 GB, free vĩnh viễn ở
  us-central1/west1/east1) — nhớ bật swap và cân nhắc bỏ `ai-worker`.
