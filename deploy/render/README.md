# Deploy backend lên Render (free, không cần thẻ)

Áp dụng khi **Hugging Face Docker Space đã hết free** (từ 2026, `free cpu-basic` yêu cầu PRO —
API trả `402`), nên Render là lựa chọn miễn phí còn lại cho NestJS.

```
Vercel (FE) ──HTTPS──▶ Render Free Web Service (API + AI worker, 1 container)
                              │
                    ┌─────────┴─────────┐
              Aiven MySQL (free)   Render Key Value / Aiven Valkey (free)
```

## 1. Vì sao cấu hình này chạy được

- `deploy/render/Dockerfile` build đúng `BE/` (giống `deploy/free/docker-compose.yml`).
- `deploy/render/start.sh` chạy **API ở foreground + AI worker ở background** trong cùng 1
  container — Render free không có background worker, nên đây là cách giữ được chấm bài/AI queue.
- `prisma db push` chạy 1 lần lúc boot (`RUN_DB_PUSH=true`), nhờ vậy DB Aiven trống vẫn tự có 40 bảng.
- `REDIS_URL` (đã hỗ trợ từ EX-034) dùng được cả `redis://` nội bộ Render lẫn `rediss://` Aiven.

## 2. Tạo service trên Render (~4 phút)

1. Đăng ký https://dashboard.render.com/register bằng GitHub (không cần thẻ).
2. **New → Blueprint** → chọn repo `trungducnguyen4/ExamTrust` → branch `main`.
   Render đọc `render.yaml` ở gốc repo và tạo service `examtrust-api` với plan **Free**.
3. Render hỏi các biến `sync: false` — điền:
   - `DATABASE_URL`: Service URI MySQL của Aiven, thêm `?sslaccept=accept_invalid_certs`
     (Aiven dùng CA riêng). Ví dụ:
     `mysql://avnadmin:PASS@mysql-examtrust-xxx.c.aivencloud.com:25569/defaultdb?sslaccept=accept_invalid_certs`
   - **Chỉ còn `DATABASE_URL` phải điền tay.** `REDIS_URL` (Render Key Value), `JWT_SECRET`
     (Render tự sinh), `FRONTEND_URL` / `APP_BASE_URL` / `CORS_ORIGINS` đều đã khai báo sẵn
     trong `render.yaml`.
   - `DEEPSEEK_API_KEY` và các biến `R2_*` (ảnh/webcam) thêm sau ở **Environment** khi cần;
     app vẫn chạy nếu chưa có, chỉ các tính năng AI/upload bị tắt.
4. **Apply** → Render build Docker (~5–8 phút) → deploy.

> Không có Blueprint? Làm tay: **New → Web Service** → repo → Runtime **Docker** →
> Dockerfile Path `deploy/render/Dockerfile` → Docker Build Context `.` → Plan **Free** →
> Region **Singapore** → Health Check Path `/api/health`.

## 3. Trỏ FE sang API mới

```bash
# Vercel: Settings -> Environment Variables
NEXT_PUBLIC_API_BASE_URL = https://examtrust-api.onrender.com/api
NEXT_PUBLIC_APP_URL      = https://exam-trust.vercel.app
```

**Phải Redeploy** (biến `NEXT_PUBLIC_*` nhúng vào bundle lúc build), không chỉ restart.

## 4. Nghiệm thu

```bash
curl -s https://examtrust-api.onrender.com/api/health     # {"ok":true}
curl -s -o /dev/null -w "%{http_code}\n" https://examtrust-api.onrender.com/docs
```

Lần gọi đầu sau 15 phút nghỉ mất ~1 phút (Render spin-up); các lần sau nhanh.

## 5. Giới hạn của Render Free (chấp nhận được cho demo)

| Giới hạn | Ảnh hưởng |
|---|---|
| 0.1 CPU / **512 MB RAM** | Đủ cho 1 người dùng demo; tránh AI chạy nặng song song |
| Ngủ sau 15 phút không traffic | Lần vào đầu tiên chậm ~1 phút |
| 750 instance-giờ/tháng | Một service chạy 24/7 ≈ 720h → vừa đủ, đừng tạo service thứ 2 |
| Filesystem tạm | Ảnh webcam/upload mất khi restart → **bắt buộc dùng R2** |
| Không có shell/one-off job | `db push` và seed phải chạy qua `start.sh` (đã làm) |
| Không nhận traffic private | Gọi ra ngoài thì được (Aiven, R2, Vercel) |

## 6. Cập nhật sau này

Mỗi lần merge vào `main`, Render tự build lại (`autoDeploy: true`). Muốn deploy ngay không cần
merge: dùng **Manual Deploy → Deploy latest commit** hoặc Render API:

```bash
curl -X POST "https://api.render.com/v1/services/$SERVICE_ID/deploys" \
  -H "Authorization: Bearer $RENDER_API_KEY" -H "Content-Type: application/json" -d '{}'
```
