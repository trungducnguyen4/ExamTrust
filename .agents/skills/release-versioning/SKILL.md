---
name: release-versioning
description: >-
  Quy trình đặt tên commit, ghi CHANGELOG.md, và gắn git tag cho mỗi lần bump version trong ExamTrust. PHẢI dùng khi user yêu cầu "tạo version mới", "bump version", "release", "gắn tag version", hoặc bất kỳ lúc nào chuẩn bị đóng gói một đợt thay đổi (feature/fix) thành 1 version chính thức. Không dùng cho commit thường ngày không liên quan tới version.
---

# Release & Versioning (đặt tên commit + CHANGELOG + tag)

Repo dùng versioning kiểu `MAJOR.MINOR.PATCH`, không dùng `prisma migrate deploy` (lịch sử migration thiếu baseline — xem `EC2_DB_DEPLOY_NOTES.md`) nên schema production được đồng bộ thủ công qua `prisma db push`. Vì vậy version + CHANGELOG.md đóng vai trò thay thế cho "lịch sử migration" để biết mỗi bản build cần chạy gì.

> **Quan trọng:** KHÔNG tự động chạy quy trình này (ghi CHANGELOG.md, đổi `ZALO_APP_VERSION`, commit `Release vX.Y.Z`, tạo tag) sau mỗi lần sửa code nhỏ. Chỉ thực hiện khi user CHỦ ĐỘNG yêu cầu — gọi skill này rõ ràng, hoặc nói thẳng "bump version"/"release"/"tạo version mới". Sửa code/tính năng bình thường thì commit như thường lệ, không kèm bump version.

## 0. Quy tắc commit chung (áp dụng mọi commit trong quy trình này)

- **Không bao giờ thêm `Co-Authored-By` hay bất kỳ dòng ghi công AI/trợ lý nào vào commit message.** Mọi commit trong repo này đứng tên user một mình, không co-work với AI hay bất kỳ ai khác.
- **Mặc định commit xong thì push lên remote luôn** (cả commit code bình thường lẫn commit `Release vX.Y.Z`) — không tự ý giữ lại local trừ khi user nói rõ "khoan push" cho lần cụ thể đó.
- Thứ tự chuẩn cho 1 đợt release: (1) commit code/tính năng đã sửa xong (theo đúng 2 quy tắc trên) và push, (2) chạy đủ bước kiểm tra thật ở mục 2 dưới đây cho tới khi PASS thật sự, (3) chỉ sau khi (2) pass hết mới viết CHANGELOG.md + tạo **commit `Release vX.Y.Z` riêng** (mục 4) + tag (mục 5) + push.

## 1. Tăng version thế nào

- Tăng **MINOR** (`1.2.0` → `1.3.0`): có tính năng mới, hoặc đổi schema (thêm/sửa/xóa bảng-cột).
- Tăng **PATCH** (`1.2.0` → `1.2.1`): chỉ sửa lỗi/UI, không đổi schema.
- Không tự ý tăng MAJOR — hỏi user nếu nghi ngờ đây là breaking change lớn.

## 2. BẮT BUỘC kiểm tra/build thử THẬT trên production TRƯỚC khi commit + release

Không commit "Release vX.Y.Z" dựa trên code chưa được verify chạy thật — kể cả khi trông có vẻ đúng. Lý do: local dev (Windows, MariaDB) đã từng che giấu bug chỉ lộ ra trên MySQL 8.0 production thật (JSON path filter, strict mode column-length) — build/test local "pass" KHÔNG đủ để tin sẽ chạy đúng trên production.

**3 lệnh bắt buộc phải verify thành công thật cho MỌI release** (không chỉ tuỳ loại thay đổi), theo đúng nghĩa "chạy thật, thấy kết quả thật" — không suy đoán hay giả định:

1. **Build FE** — `npm run build:cf` trong `FE/`, đọc hết log tới cuối, phải thấy "Compiled successfully" và không còn `Type error`/`Failed to compile` ở đâu cả (lỗi TS hay lẫn giữa hàng loạt warning, đừng chỉ nhìn dòng cuối).
2. **Build BE** — build thử ngay trên EC2 production (không chỉ máy local): copy code vào 1 thư mục tạm riêng trên EC2 (không đè lên `~/examtrust-be` đang chạy), `docker build` bằng đúng `Dockerfile`/image production, đọc hết log tới bước cuối thành công. Dọn thư mục/image tạm sau khi xong.
3. **Reset DB** — chạy thử seed script liên quan (ví dụ qua `docker exec examtrust-be-app-1 npx ts-node --transpile-only ...` — an toàn, các seed script đều idempotent) trên đúng MySQL production, KHÔNG chỉ test trên MariaDB local vì 2 engine xử lý JSON path và strict SQL mode khác nhau, che giấu lỗi thật. Nếu thay đổi có đụng schema/seed, đây là bước bắt buộc, không được bỏ qua hay chỉ giả định "chắc ổn".

**Ngoài 3 lệnh trên, kiểm tra thêm mọi lệnh Zalo bot nào liên quan tới thay đổi lần này** — ví dụ nếu đổi code AI provider thì thử đổi provider thật qua bot (hoặc gọi thẳng endpoint bot gọi tới) và xác nhận phản hồi đúng như mong đợi; tương tự cho các lệnh khác (Build FE/BE, Clear Storage...) nếu thay đổi có ảnh hưởng tới chúng.

**Không kết luận mơ hồ.** Với mỗi lệnh/kịch bản đã kiểm tra, phải nêu rõ: đã chạy lệnh gì, kết quả thật là gì (log/response cụ thể), và có thật sự PASS hay không — không dùng các câu như "chắc ổn", "có lẽ sẽ chạy được", "đã sửa xong nên chắc không lỗi". Nếu chưa thể kiểm tra được ở đúng môi trường production vì bất kỳ lý do gì, phải nói thẳng với user là CHƯA verify được, không ngầm coi như đã ổn.

Nếu bước kiểm tra phát hiện lỗi: sửa, chạy lại kiểm tra cho tới khi PASS thật sự, rồi mới viết CHANGELOG/commit — không release "coi như sẽ ổn" rồi sửa tiếp ở version sau.

## 3. Luôn ghi vào `CHANGELOG.md` (ở gốc repo) trước

Thêm 1 entry mới lên đầu (ngay dưới phần "Quy ước"), theo đúng khuôn:

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Thay đổi
- Mô tả ngắn gọn từng thay đổi, kèm tên file chính đã sửa.

### Cập nhật dữ liệu
Một trong 3:
- **Không cần.** — không đổi schema.
- **`scripts/db-migrate.sh`** (an toàn, giữ nguyên dữ liệu cũ) — chỉ thêm bảng/cột mới.
- **⚠️ `scripts/db-rebuild.sh`** (xóa sạch rồi seed lại) — chỉ khi bắt buộc, nêu rõ lý do.

### Cần deploy
- Liệt kê đúng bước cần chạy (Build FE / Build BE / cập nhật zip Lambda thủ công / v.v.)
```

## 4. Commit — bắt buộc theo mẫu tên sau

```
Release vX.Y.Z: <mô tả ngắn>

<mô tả dài hơn nếu cần, giải thích lý do>
```

Ví dụ thật đã dùng: `Release v1.2.1: CHANGELOG.md + quy trinh versioning`.

**Quy tắc quan trọng nhất: commit này PHẢI chứa bản cập nhật `CHANGELOG.md` cho version đó.** Có thể gộp thêm các file liên quan khác (script, config...) vào cùng commit — không bắt buộc tách riêng chỉ 1 file `.md` — nhưng CHANGELOG.md luôn phải có mặt trong đúng commit sẽ được tag.

Nhắc lại quy tắc mục 0: commit này KHÔNG kèm `Co-Authored-By`/ghi công AI nào, và sau khi tạo xong thì push lên remote luôn (mặc định).

Nếu code thay đổi (feature/fix) đã được commit ở 1 commit khác trước đó rồi mới nhớ ra cần bump version, tạo thêm 1 commit riêng chỉ chứa update CHANGELOG.md (+ file liên quan nếu có) theo mẫu tên trên, và tag vào chính commit đó — KHÔNG tag vào commit code cũ không có CHANGELOG.md.

## 5. Gắn tag — làm ngay sau khi commit, cùng một lượt

```bash
git tag -a vX.Y.Z <commit-hash-vừa-tạo> -m "<mô tả ngắn, không dấu>"
```

- Tag annotated (`-a`), không dùng lightweight tag.
- **Chỉ tag vào commit có chứa CHANGELOG.md của đúng version đó** — không tag vào commit code thường không có file version.
- Nếu lỡ tag sai chỗ và commit đó CHƯA push (`git log origin/main..HEAD` phải thấy commit này): `git tag -d vX.Y.Z` rồi tag lại đúng chỗ. Nếu tag ĐÃ push lên remote, phải hỏi user trước khi xóa/di chuyển tag (thao tác ảnh hưởng shared state).
- Nếu commit message cần sửa lại (amend) sau khi đã tag: amend trước, xóa tag cũ, tạo lại tag trỏ vào hash mới (amend đổi hash).
- **Mặc định push cả commit lẫn tag lên remote luôn sau khi tạo** (`git push && git push origin vX.Y.Z`) — không cần hỏi lại cho bước này. Chỉ giữ lại local nếu user nói rõ "khoan push" cho lần cụ thể đó.

## 6. Sau khi tag xong

Nhắc user (không tự làm nếu không được yêu cầu):
- Có cần chạy `scripts/db-migrate.sh` hoặc `scripts/db-rebuild.sh` trên EC2 theo đúng mục "Cập nhật dữ liệu" đã ghi không.
- Có cần "Build FE"/"Build BE" hoặc build lại Lambda `zalo-webhook-lambda/index.mjs` không.
- Nếu Lambda có in version ra bot (`ZALO_APP_VERSION` trong `zalo-webhook-lambda/index.mjs`), nhắc cập nhật hằng số này khớp version mới rồi mới build lại zip.

## 7. Giới hạn hiện tại (chưa làm)

**Chức năng rollback (quay code + DB về đúng version cũ) CHƯA được xây dựng** — hiện chỉ có tag để xác định đúng commit của từng version. Việc quay DB về đúng schema/dữ liệu tại thời điểm đó (backup/restore, hay script rollback tự động) để làm sau, không tự ý implement khi chưa được yêu cầu rõ.
