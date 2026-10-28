# ExamTrust

Nền tảng hỗ trợ tổ chức thi và đánh giá học thuật, tập trung vào việc sinh đề thi ngẫu nhiên theo từng sinh viên, quản lý ngân hàng câu hỏi có versioning, theo dõi tính toàn vẹn trong quá trình làm bài, và hỗ trợ sinh câu hỏi bằng AI có kiểm duyệt của giảng viên.

## Mục lục

- [Kiến trúc tổng quan](#kiến-trúc-tổng-quan)
- [Tính năng chính](#tính-năng-chính)
- [Công nghệ sử dụng](#công-nghệ-sử-dụng)
- [Cấu trúc thư mục](#cấu-trúc-thư-mục)
- [Yêu cầu môi trường](#yêu-cầu-môi-trường)
- [Cài đặt & chạy local](#cài-đặt--chạy-local)
- [Biến môi trường](#biến-môi-trường)
- [Build](#build)
- [Kiểm thử](#kiểm-thử)
- [Triển khai (Deploy)](#triển-khai-deploy)
- [Cơ sở dữ liệu](#cơ-sở-dữ-liệu)
- [Tài liệu API](#tài-liệu-api)
- [Giấy phép](#giấy-phép)

## Kiến trúc tổng quan

ExamTrust được thiết kế theo mô hình **Modular Monolith kết hợp Asynchronous Background Worker (BullMQ/Redis)** — một quyết định kỹ thuật có chủ đích nhằm đảm bảo tính toàn vẹn giao dịch (ACID transactions) tuyệt đối cho quá trình nộp bài/chấm điểm, đồng thời bảo vệ Node.js Event Loop khỏi các tác vụ AI nặng:

- **FE/** — Ứng dụng frontend xây dựng bằng Next.js (App Router), giao diện 3 phân hệ (Admin, Giảng viên, Sinh viên) với công cụ thi `exam-engine` chạy phía client.
- **BE/** — API backend xây dựng bằng NestJS theo kiến trúc Modular Monolith. Đảm nhiệm xác thực, phân quyền (RBAC), quản lý ngân hàng câu hỏi có versioning, thực thi hạn chót nộp bài, và đóng băng snapshot đề thi.
- **BE (AI Worker)** — Tiến trình nền độc lập ([BE/src/ai-worker.ts](BE/src/ai-worker.ts)) kết nối qua Redis / BullMQ queue. Chuyên trách các tác vụ tốn I/O và CPU: sinh đề thi, vector embedding search, và phân tích thị giác webcam mà không làm nghẽn API chính.
- **zalo-webhook-lambda/** — Hàm serverless nhỏ, độc lập với backend chính, tiếp nhận webhook từ Zalo phục vụ tính năng thông báo.

> 📖 **Xem chi tiết:** [5 Minh chứng Kỹ thuật Cốt lõi & Luận điểm Bảo vệ Phỏng vấn](docs/INTERVIEW_DEFENSE_AND_TECHNICAL_PROOF.md) giải thích cặn kẽ 5 bài toán hóc búa (Idempotency, Answer Stripping, Server-side Deadline, Queue Resiliency, và lý do không dùng Microservices).

## Tính năng chính

**Dành cho quản trị viên**
- Quản lý người dùng, phân quyền theo vai trò (admin / lecturer / student)
- Theo dõi hoạt động hệ thống qua nhật ký kiểm toán (audit log)

**Dành cho giảng viên**
- Tạo và quản lý khoá học, danh sách sinh viên tham gia
- Xây dựng ngân hàng câu hỏi, hỗ trợ versioning để tra soát lịch sử chỉnh sửa
- Hỗ trợ sinh câu hỏi gợi ý bằng AI (tích hợp Gemini, DeepSeek, OpenRouter, NVIDIA, Ollama) với bộ tự sửa lỗi JSON (`jsonrepair`), có bước duyệt/chỉnh sửa của giảng viên trước khi lưu chính thức
- Tạo liên kết thi (exam link), cấu hình thời gian, phòng thi và cách trộn đề ngẫu nhiên
- Xem thống kê, phân tích độ khó câu hỏi và kết quả bài thi
- **Thẩm định Tín hiệu Toàn vẹn (Human-in-the-Loop):** Xem xét các cờ cảnh báo bất thường trong ca thi và đối soát ảnh chụp định kỳ trước khi quyết định can thiệp điểm số

**Dành cho sinh viên**
- Làm bài thi với đề được sinh ngẫu nhiên riêng cho từng người (`randomizationSeed`)
- Bài thi được chốt (snapshot) ngay khi bắt đầu làm, loại bỏ hoàn toàn đáp án (`answerKey`) khỏi payload client
- Tự động lưu bài định kỳ (debounced autosave) chống mất dữ liệu khi gián đoạn mạng
- Cơ chế nộp bài đảm bảo tính Idempotent (chống double-submit) và thực thi deadline nghiêm ngặt phía server
- Theo dõi lịch sử làm bài, xem lại kết quả sau khi giảng viên công bố

**Giám sát tính toàn vẹn (Integrity Signals / Privacy-First)**
- Thu thập các tín hiệu toàn vẹn khách quan từ Browser APIs (`fullscreenchange`, `visibilitychange`, `screen.isExtended`, Clipboard tracking) và ảnh webcam chu kỳ
- **Nguyên tắc Human-in-the-Loop:** Hệ thống không tự động phán xét hay quy kết gian lận; AI chỉ gắn cờ tín hiệu để hỗ trợ Giảng viên đánh giá công bằng
- Gửi email thông báo (kích hoạt tài khoản, đặt lại mật khẩu, nhắc lịch thi...)
- Hỗ trợ thông báo qua Zalo cho một số sự kiện quan trọng

## Công nghệ sử dụng

**Frontend**
- Next.js, React, TypeScript
- Tailwind CSS, shadcn/ui, Radix UI
- TanStack Query, React Hook Form, Zod

**Backend**
- NestJS, Prisma ORM
- MySQL, Redis (cache + hàng đợi xử lý bất đồng bộ với Bull)
- JWT authentication, Swagger cho tài liệu API
- Tích hợp các provider AI (có thể cấu hình qua biến môi trường) để hỗ trợ sinh câu hỏi

**Hạ tầng**
- Docker / Docker Compose cho môi trường backend
- Cloudflare Workers (thông qua OpenNext) cho frontend
- AWS Lambda cho webhook phụ trợ

## Cấu trúc thư mục

```text
ExamTrust-Origin/
├── FE/                         # Next.js frontend
│   └── src/
│       ├── app/                # App Router: route theo vai trò (admin, lecturer, student, auth...)
│       ├── components/         # Component UI dùng chung
│       ├── contexts/           # React context (auth, theme...)
│       ├── features/           # Màn hình/logic theo từng nghiệp vụ
│       ├── hooks/               # Custom hooks dùng chung
│       ├── lib/                 # Helper, API client
│       ├── exam-engine/         # Logic hiển thị & chấm bài thi phía client
│       └── types/                # Kiểu dữ liệu dùng chung
│
├── BE/                          # NestJS backend
│   └── src/
│       ├── auth/                # Xác thực, phân quyền (JWT)
│       ├── users/               # Quản lý người dùng
│       ├── courses/             # Khoá học
│       ├── enrollments/         # Ghi danh sinh viên vào khoá học
│       ├── questions-v2/        # Ngân hàng câu hỏi có versioning
│       ├── exams/                # Nghiệp vụ bài thi
│       ├── exam-links/           # Liên kết/tổ chức phiên thi
│       ├── submissions/          # Bài làm của sinh viên
│       ├── ai/                    # Tích hợp provider AI hỗ trợ sinh câu hỏi
│       ├── queue/                 # Hàng đợi xử lý bất đồng bộ (Bull/Redis)
│       ├── audit/                 # Nhật ký kiểm toán
│       ├── events/                # Sự kiện nội bộ hệ thống
│       ├── redis/ • cache/        # Kết nối và cache Redis
│       ├── admin-dashboard/ • lecturer-dashboard/  # API tổng hợp thống kê theo vai trò
│       ├── prisma/                # Prisma service dùng trong ứng dụng
│       └── ai-worker.ts           # Entry point tiến trình worker xử lý AI theo hàng đợi
│
└── zalo-webhook-lambda/          # AWS Lambda tiếp nhận webhook Zalo
```

## Yêu cầu môi trường

- Node.js 18+
- npm
- MySQL
- Redis
- Docker (khuyến nghị cho backend)

## Chạy dự án ở môi trường local

### Backend

```bash
cd BE
npm install
cp .env.example .env
npm run prisma:generate
npm run prisma:migrate:dev
npm run start:dev
```

Backend mặc định chạy tại `http://localhost:3001`, tài liệu API xem tại đường dẫn Swagger được cấu hình trong `main.ts`.

### Frontend

```bash
cd FE
npm install
npm run dev
```

Frontend mặc định chạy tại `http://localhost:3000`.

### Worker xử lý AI (tuỳ chọn)

Backend có một worker riêng để xử lý các tác vụ AI theo hàng đợi (đọc job từ Redis, gọi provider AI, ghi kết quả trở lại):

```bash
cd BE
npm run ai:worker:dev
```

Ở môi trường production, worker này chạy như một tiến trình riêng biệt song song với API server (xem `docker-compose.prod.yml`).

## Biến môi trường

Backend đọc cấu hình qua file `.env`. Tham khảo `BE/.env.example` (dev) và `BE/.env.production.example` (production) để biết đầy đủ danh sách. Một số nhóm biến chính:

| Nhóm | Ví dụ biến | Mô tả |
| --- | --- | --- |
| Ứng dụng | `NODE_ENV`, `PORT`, `FRONTEND_URL`, `APP_BASE_URL`, `CORS_ORIGINS` | Cấu hình runtime và domain được phép gọi API |
| Cơ sở dữ liệu | `DATABASE_URL` | Chuỗi kết nối MySQL cho Prisma |
| Redis / hàng đợi | `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` | Cache và hàng đợi xử lý bất đồng bộ |
| Xác thực | `JWT_SECRET`, `JWT_EXPIRES_IN` | Ký và kiểm tra token đăng nhập |
| Email | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` | Gửi email thông báo |
| AI | `AI_PROVIDER` và các biến theo từng provider (Ollama / các dịch vụ AI khác) | Cấu hình nguồn sinh câu hỏi AI, có thể đổi provider mà không cần sửa code |
| Lưu trữ/pháp lý | `IP_RETENTION_DAYS`, `PSEUDONYMIZE`, `PSEUDONYMIZE_SALT` | Thời hạn lưu và ẩn danh hoá dữ liệu IP/giám sát |

Frontend không yêu cầu file `.env` bắt buộc khi chạy dev cơ bản; các cấu hình liên quan đến triển khai Cloudflare nằm trong `FE/wrangler.jsonc` và `FE/open-next.config.ts`.

**Lưu ý:** không commit giá trị thật của bất kỳ secret nào (JWT, SMTP, API key AI, mật khẩu database...) vào repository. Các file `.env.example` chỉ chứa giá trị mẫu.

## Build

```bash
# Frontend
cd FE && npm run build

# Backend
cd BE && npm run build
```

## Kiểm thử

```bash
# Backend (Jest)
cd BE && npm run test

# Frontend (Vitest)
cd FE && npm run test
```

## Triển khai (Deploy)

### Backend — Docker trên VPS/server riêng

Backend được đóng gói qua `BE/Dockerfile` (multi-stage build: cài dependency, generate Prisma client, build TypeScript, sau đó chạy ở image runtime gọn nhẹ). Triển khai production tham khảo `BE/docker-compose.prod.yml`, gồm các service:

- `mysql` — cơ sở dữ liệu chính
- `redis` — cache và hàng đợi
- `app` — API server (NestJS)
- `ai-worker` — tiến trình xử lý job AI theo hàng đợi

```bash
cd BE
cp .env.production.example .env.production   # điền giá trị thật
docker compose -f docker-compose.prod.yml up -d --build
```

### Frontend — Cloudflare Workers (qua OpenNext)

Frontend build bằng `@opennextjs/cloudflare` rồi triển khai bằng Wrangler:

```bash
cd FE
npm run build:cf      # build sang định dạng Cloudflare Workers
npm run deploy:cf      # build + wrangler deploy
```

Cấu hình Worker (tên, compatibility flags, static assets) nằm trong `FE/wrangler.jsonc`.

### Webhook Zalo — AWS Lambda

`zalo-webhook-lambda/` là một hàm Lambda độc lập, đóng gói/triển khai riêng theo quy trình chuẩn của AWS (không phụ thuộc vào quy trình build của FE/BE).

## Cơ sở dữ liệu

Schema, migration và seed data được quản lý bằng Prisma trong thư mục `BE/prisma`.

```bash
cd BE
npm run prisma:generate     # sinh Prisma client
npm run prisma:migrate:dev  # tạo/áp dụng migration ở môi trường dev
npm run prisma:migrate      # áp dụng migration ở môi trường production
npm run prisma:studio       # xem dữ liệu qua giao diện Prisma Studio
npm run seed                 # seed dữ liệu mẫu cơ bản
npm run seed:question-banks  # seed dữ liệu mẫu cho ngân hàng câu hỏi
```

> Ghi chú: ở một số môi trường triển khai thực tế, lịch sử migration có thể không đầy đủ do dữ liệu phát sinh từ giai đoạn phát triển sớm; trong trường hợp đó schema được khởi tạo bằng `prisma db push` thay vì `migrate deploy`. Ưu tiên dùng `migrate deploy`/`migrate dev` cho các môi trường mới.

## Tài liệu API

Backend expose tài liệu API qua Swagger khi chạy ở chế độ dev (đường dẫn cấu hình trong `BE/src/main.ts`). Ngoài ra, `BE/API_DOCUMENTATION.md` tổng hợp mô tả các nhóm endpoint chính để tham khảo nhanh mà không cần chạy server.

## Giấy phép

Xem file [LICENSE](./LICENSE).
