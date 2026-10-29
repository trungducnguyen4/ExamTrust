## 📌 Overview
<!-- Tóm tắt ngắn gọn mục tiêu của Pull Request và các thay đổi chính -->

---

## 🔍 Proof of Change & Confidence Report

### 1. 🧪 Tests (Focused logic and integration checks)
<!-- Báo cáo kết quả kiểm tra cú pháp, typescript và chạy test tự động -->
- [ ] Syntax & Type check (`npm run lint` / `tsc --noEmit`): Passed
- [ ] Automated tests (`npm test`): Passed
- [ ] Test metrics: <!-- ví dụ: 25/25 assertions passed, 0 failures -->

### 2. ⚡ Runtime (Use the actual feature end to end)
<!-- Báo cáo kết quả thực thi thực tế tính năng từ đầu đến cuối -->
- **Endpoint / Action**: <!-- ví dụ: POST /api/exams/submit -->
- **Status code / Response**: <!-- ví dụ: HTTP 200 OK, response payload -->
- **Database verification**: <!-- ví dụ: Prisma record created/updated in DB -->

### 3. 👁️ Visual (Inspect what the user will see)
<!-- 
BẮT BUỘC NHÚNG TRỰC TIẾP HÌNH ẢNH / HOẠT ẢNH VÀO ĐÂY:
- Nếu chỉnh UI / Component: BẮT BUỘC nhúng SCREENSHOT:
  ![Minh chứng UI](https://raw.githubusercontent.com/trungducnguyen4/ExamTrust/<branch-or-commit>/docs/screenshots/<file>.png)
- Nếu chỉnh Luồng người dùng (User Flow): BẮT BUỘC nhúng ANIMATED GIF / VIDEO quay lại thao tác thực tế (gõ, click chọn, modal/dialog, tiến trình xử lý, kết quả):
  ![Minh chứng User Flow](https://raw.githubusercontent.com/trungducnguyen4/ExamTrust/<branch-or-commit>/docs/screenshots/<file>.gif)
- NGHIÊM CẤM chỉ ghi text đường dẫn file cục bộ. Reviewer phải nhìn thấy hình ảnh/hoạt ảnh chuyển động ngay trên trang PR.
-->

### 4. 🎯 Confidence (State what was verified — and what was not)
- **Mức độ tự tin (Confidence level)**: High / Medium / Low
- **Những gì ĐÃ được chứng minh (Verified)**:
  - 
  - 
- **Những gì CHƯA kiểm thử / Ranh giới phụ thuộc (NOT verified)**:
  - 
  - 

---

## 🚀 Deployment Checklist
- [ ] Code passes CI pipeline on GitHub Actions
- [ ] No hardcoded environment paths / credentials
- [ ] Screenshots / Videos attached for visual proof
