---
name: verification-visual-proof
description: >-
  Quy chuẩn kiểm thử và tạo minh chứng trực quan (Visual Proof of Change) theo 4 Trụ Cột. BẮT BUỘC tạo Animated GIF hoặc Video màn hình cho các tính năng/sửa lỗi có luồng tương tác (User Flow), chụp screenshot cho UI, và BẮT BUỘC nhúng trực tiếp hình ảnh/GIF vào Pull Request (PR) description trên GitHub thay vì chỉ viết text đường dẫn file cục bộ.
whenToUse: >-
  Kích hoạt khi: chuẩn bị xuất báo cáo 4 Trụ Cột (Verification Protocol); chuẩn bị mở hoặc cập nhật Pull Request (PR); kiểm thử tính năng UI/User Flow mới; sửa lỗi liên quan đến giao diện người dùng, modal, form nhập liệu, hoặc luồng tương tác.
---

# Verification Protocol — Visual Proof of Change (Minh chứng trực quan)

Khi phát triển tính năng hoặc sửa lỗi liên quan đến giao diện người dùng (UI) và trải nghiệm người dùng (UX) trong ExamTrust, **bằng chứng trực quan (Visual Proof)** là điều kiện tiên quyết để nghiệm thu và merge Pull Request.

---

## 1. Nguyên tắc cốt lõi (Core Rules)

1. **"No Invisible Changes" (Không có thay đổi vô hình):**
   - Mọi thay đổi về UI/UX bắt buộc phải có bằng chứng trực quan nhìn thấy được ngay trên GitHub PR.
   - Nghiêm cấm tuyệt đối việc chỉ ghi text đường dẫn local như: `Visual: Đã chụp ảnh màn hình lưu tại docs/screenshots/abc.png`. Reviewer và người dùng không thể mở file local đó trên trình duyệt GitHub!

2. **"Moving Proof for User Flow" (Luồng chuyển động cho tương tác người dùng):**
   - **UI Tĩnh (Static UI):** Đổi màu nút, sửa căn lề, đổi layout danh sách $\rightarrow$ Chụp ảnh màn hình (Screenshot) trước & sau.
   - **Luồng người dùng (User Flow):** Gồm chuỗi thao tác nhập liệu (typing), bấm nút chọn số lượng, bật/tắt toggle, mở modal/dialog, trạng thái loading/tiến trình, và kết quả hiển thị cuối cùng $\rightarrow$ **BẮT BUỘC tạo Animated GIF hoặc Video màn hình** ghi lại từ đầu đến cuối luồng thao tác thực tế.

3. **"Directly Embedded in PR" (Bắt buộc nhúng trực tiếp vào PR):**
   - Trong phần `#### 4. Bằng chứng kiểm thử (Verification Protocol — 4 Trụ Cột)` của Pull Request, BẮT BUỘC dùng cú pháp Markdown Image:
     ```markdown
     - [x] **Visual:**
       ![Demo User Flow](https://raw.githubusercontent.com/trungducnguyen4/ExamTrust/<branch-name>/docs/screenshots/<filename>.gif)
     ```
   - Nhờ đó, bất kỳ ai mở PR trên GitHub đều nhìn thấy ngay hình ảnh/hoạt ảnh chuyển động đang phát mà không phải clone repo hay tải file về.

---

## 2. Quy trình thực hiện tự động bằng Chrome DevTools MCP & Python

Khi kiểm thử một tính năng hoặc luồng người dùng (ví dụ: tạo câu hỏi bằng AI, làm bài thi, giám sát thi):

### Bước 1: Khởi động môi trường kiểm thử
- Bật frontend dev server (`npm run dev -- -p 3000` trong `FE`) hoặc truy cập môi trường staging/production.
- Đảm bảo môi trường sẵn sàng nhận thao tác.

### Bước 2: Thực hiện kịch bản tương tác (End-to-End Walkthrough)
Dùng công cụ Chrome DevTools MCP để thực thi lần lượt:
1. `navigate_page`: Điều hướng đến URL cần kiểm tra.
2. `type_text` / `fill`: Gõ nội dung (ví dụ: gõ prompt, gõ tiêu đề câu hỏi).
3. `click`: Bấm nút chọn options, toggle switch (ví dụ: chọn số lượng câu hỏi, bật Grill-me mode).
4. `wait_for` / đợi dialog hiện lên: Chụp frame dialog mở ra.
5. `click`: Tương tác với modal/dialog (chọn thang Bloom, chọn bẫy nhiễu...).
6. `click`: Bấm gửi / submit.
7. Đợi kết quả và chụp frame kết quả cuối cùng (danh sách câu hỏi hiển thị, form được điền).

### Bước 3: Đóng gói thành Animated GIF mượt mà
Sử dụng script Python Pillow để ghép chuỗi frame thành ảnh GIF chất lượng cao:
- Resize về kích thước tiêu chuẩn hiển thị tốt trên GitHub PR (ví dụ width 960px - 1280px).
- Thiết lập thời gian hiển thị (duration) hợp lý cho từng frame:
  - Thao tác gõ / click: 600ms - 1000ms.
  - Dialog / Modal hiển thị: 1200ms - 1500ms (đủ để reviewer đọc nội dung).
  - Kết quả cuối cùng: 2500ms - 3000ms.
- Lưu file vào thư mục: `docs/screenshots/<ticket>-<flow-name>.gif`.

### Bước 4: Commit, Push & Nhúng vào PR
1. `git add docs/screenshots/<file>.gif docs/runs/...`
2. `git commit -m "docs: add visual proof demo gif for <ticket>"`
3. `git push origin <branch>`
4. Cập nhật Pull Request Description qua GitHub API hoặc MCP GitHub tool:
   - Thay thế dòng ghi chú tĩnh bằng Markdown Image nhúng trực tiếp link `https://raw.githubusercontent.com/trungducnguyen4/ExamTrust/<branch-or-commit>/docs/screenshots/<file>.gif`.

---

## 3. Checklist nghiệm thu Visual Proof

Trước khi đánh dấu hoàn thành task hoặc gửi PR cho người dùng review:
- [ ] Đã có file ảnh GIF hoặc Video hoạt họa mô phỏng đầy đủ chuỗi hành động?
- [ ] Nội dung thao tác có rõ ràng (gõ chữ gì, chọn nút nào, kết quả ra sao)?
- [ ] File GIF đã được commit và push lên nhánh GitHub?
- [ ] PR description đã nhúng ảnh/GIF trực tiếp bằng cú pháp `![...](https://raw.githubusercontent.com/...)` chưa?
- [ ] Mở PR trên GitHub kiểm tra thấy hình ảnh/GIF hiển thị ngay lập tức không bị lỗi vỡ ảnh (broken image)?
