---
name: verification-visual-proof
description: >-
  Quy chuẩn kiểm thử và tạo minh chứng trực quan (Visual Proof of Change) theo 4 Trụ Cột. BẮT BUỘC chụp ảnh/quay video từ ứng dụng thật đang chạy (Dev Server / Production) có đầy đủ Layout Shell (Sidebar, Header), TUYỆT ĐỐI CẤM tạo file mock HTML preview tĩnh đối phó; BẮT BUỘC tạo Animated GIF/Video cho User Flow và nhúng trực tiếp vào Pull Request (PR) description trên GitHub.
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

2. **"Moving Proof for User Flow & Performance" (Minh chứng chuyển động cho luồng người dùng và hiệu năng):**
   - **UI Tĩnh (Static UI):** Đổi màu nút, sửa căn lề, đổi layout danh sách $\rightarrow$ Chụp ảnh màn hình (Screenshot) trước & sau.
   - **Luồng người dùng (User Flow):** Gồm chuỗi thao tác nhập liệu (typing), bấm nút chọn số lượng, bật/tắt toggle, mở modal/dialog, trạng thái loading/tiến trình, và kết quả hiển thị cuối cùng $\rightarrow$ **BẮT BUỘC tạo Animated GIF hoặc Video màn hình** ghi lại từ đầu đến cuối luồng thao tác thực tế.
   - **Tối ưu hóa hiệu năng (Performance Optimization):** Các bài toán N+1 query, tối ưu thời gian tải trang, rendering/caching $\rightarrow$ **BẮT BUỘC xuất Video màn hình (`.mp4` tại `docs/videos/`) hoặc Animated GIF thời gian thực** thể hiện rõ:
     1. Hành vi reload/F5 liên tục để chứng minh độ phản hồi tức thì (<100ms).
     2. So sánh trực quan Trước (Before: treo spinner, chờ lâu) vs Sau (After: Skeleton UI, dữ liệu lên ngay).
     3. Bảng đối chiếu chỉ số đo lường (Database queries, latency ms, HTTP status).

3. **"Directly Embedded in PR" (Bắt buộc nhúng trực tiếp vào PR):**
   - Trong phần `#### 4. Bằng chứng kiểm thử (Verification Protocol — 4 Trụ Cột)` của Pull Request, BẮT BUỘC dùng cú pháp Markdown Image kèm link video:
     ```markdown
     - [x] **Visual:**
       ![Demo User Flow](https://raw.githubusercontent.com/trungducnguyen4/ExamTrust/<branch-name>/docs/screenshots/<filename>.gif)
       🎥 **Video Full-HD minh chứng:** [Xem Video MP4](https://raw.githubusercontent.com/trungducnguyen4/ExamTrust/<branch-name>/docs/videos/<filename>.mp4)
     ```
   - Nhờ đó, bất kỳ ai mở PR trên GitHub đều nhìn thấy ngay hình ảnh/hoạt ảnh chuyển động đang phát mà không phải clone repo hay tải file về.

---

## 2. Strict Anti-Patterns (Những hành vi bị CẤM TUYỆT ĐỐI)

Để đảm bảo ảnh/video trong PR phản ánh đúng 100% giao diện thực tế của người dùng cuối:

1. 🚫 **TUYỆT ĐỐI CẤM TẠO FILE HTML MOCK / PREVIEW TĨNH**:
   - Nghiêm cấm tạo các file tạm như `preview-*.html`, `test-ui.html` dùng Tailwind CDN hoặc hardcode mã HTML/CSS riêng lẻ bên ngoài ứng dụng để chụp ảnh/quay video đối phó cho PR.
   - Mọi bằng chứng trực quan không được chụp từ Dev Server thật (`http://localhost:...`) hoặc môi trường staging/production của ExamTrust đều bị coi là **GIẢ MẠO và KHÔNG HỢP LỆ (Invalid Proof)**.

2. 🚫 **CẤM BỊA SỐ LIỆU TĨNH ĐỂ "LÀM ĐẸP" ẢNH**:
   - Không được gán cứng các con số đẹp (ví dụ 120 câu, 45 câu...) trong ảnh PR nếu cơ sở dữ liệu thật hoặc state thật của ứng dụng hiển thị số liệu khác. Giao diện phải phản ánh đúng dữ liệu render từ Store/Hook/API thật.

3. 🚫 **CẤM CHỤP COMPONENT CÔ LẬP KHÔNG CÓ LAYOUT SHELL**:
   - Tuyệt đối không chụp component trần trụi ngoài khung nhìn hoàn chỉnh. Bắt buộc phải chụp trong bối cảnh **đầy đủ Layout của ExamTrust** (bao gồm Sidebar điều hướng `240px`, Header trên cùng, Breadcrumbs/Page title).
   - *Lý do*: Hầu hết lỗi vỡ layout Flexbox, co rúm ô input (`squished search bar`), hay rớt dòng bể giao diện xảy ra do Sidebar chiếm mất 240px chiều ngang. File chụp cô lập sẽ hoàn toàn che giấu những lỗi nghiêm trọng này.

---

## 3. Quy trình thực hiện tự động trên Môi trường thật (Live Dev Server)

Khi kiểm thử một tính năng hoặc luồng người dùng (ví dụ: tạo câu hỏi bằng AI, làm bài thi, giám sát thi, bộ lọc ngân hàng câu hỏi):

### Bước 1: Khởi động môi trường kiểm thử thật
- Bật frontend dev server: `npm run dev --prefix FE` (hoặc truy cập môi trường staging/production).
- Đảm bảo backend / mock server sẵn sàng phản hồi dữ liệu.

### Bước 2: Thiết lập Viewport & Kiểm tra Breakpoint
Trước khi chụp, dùng Chrome DevTools MCP `resize_page` để kiểm tra tối thiểu 2 kích thước thực tế:
1. **Desktop tiêu chuẩn có Sidebar mở**: Viewport `1440x900` hoặc `1366x768` (chiều rộng khả dụng cho content là ~1000px - 1100px).
2. **Mobile / Tablet**: Viewport `768x1024` hoặc `390x844` để xác minh layout co giãn (wrap/stack) mượt mà, không bị tràn viền (overflow).

### Bước 3: Thực hiện kịch bản tương tác (End-to-End Walkthrough)
Dùng công cụ Chrome DevTools MCP để thực thi lần lượt:
1. `navigate_page`: Điều hướng đến URL thật của route cần kiểm tra (ví dụ `http://localhost:5173/lecturer/question-bank`).
2. `type_text` / `fill`: Gõ nội dung (ví dụ: gõ prompt, gõ từ khóa tìm kiếm khóa học).
3. `click`: Bấm nút chọn options, toggle switch (ví dụ: mở dropdown bộ lọc, chọn độ khó).
4. `wait_for` / đợi dialog hiện lên: Chụp frame dialog mở ra.
5. `click`: Tương tác với modal/dialog.
6. `click`: Bấm gửi / submit / áp dụng bộ lọc.
7. Đợi kết quả và chụp frame kết quả cuối cùng (danh sách hiển thị, biểu đồ cập nhật).

### Bước 4: Đóng gói thành Animated GIF mượt mà
Sử dụng script Python Pillow để ghép chuỗi frame thành ảnh GIF chất lượng cao:
- Resize về kích thước tiêu chuẩn hiển thị tốt trên GitHub PR (ví dụ width 960px - 1280px).
- Thiết lập thời gian hiển thị (duration) hợp lý cho từng frame:
  - Thao tác gõ / click: 600ms - 1000ms.
  - Dialog / Modal hiển thị: 1200ms - 1500ms (đủ để reviewer đọc nội dung).
  - Kết quả cuối cùng: 2500ms - 3000ms.
- Lưu file vào thư mục: `docs/screenshots/<ticket>-<flow-name>.gif`.

### Bước 5: Commit, Push & Nhúng vào PR
1. `git add docs/screenshots/<file>.gif docs/runs/...`
2. `git commit -m "docs: add live visual proof for <ticket>"`
3. `git push origin <branch>`
4. Cập nhật Pull Request Description qua GitHub API hoặc MCP GitHub tool:
   - Thay thế dòng ghi chú tĩnh bằng Markdown Image nhúng trực tiếp link `https://raw.githubusercontent.com/trungducnguyen4/ExamTrust/<branch-or-commit>/docs/screenshots/<file>.gif`.

---

## 4. Checklist nghiệm thu Visual Proof

Trước khi đánh dấu hoàn thành task hoặc gửi PR cho người dùng review:
- [ ] Ảnh/GIF được chụp trực tiếp từ Dev Server thật (`http://localhost:...`) có đầy đủ Sidebar và Header, KHÔNG PHẢI file preview HTML tĩnh?
- [ ] Các ô Input/SearchBar hiển thị đủ chiều rộng, placeholder đọc rõ ràng, KHÔNG bị co rúm thành nút nhỏ (`squished`)?
- [ ] Các nhãn Text và Icon (như "Bộ lọc", "Tổng số câu hỏi") hiển thị trọn vẹn, KHÔNG bị clip chữ hay đè lên nhau?
- [ ] Đã có file ảnh GIF hoặc Video hoạt họa mô phỏng đầy đủ chuỗi hành động (nếu là User Flow)?
- [ ] File ảnh/GIF đã được commit và push lên nhánh GitHub?
- [ ] PR description đã nhúng ảnh/GIF trực tiếp bằng cú pháp `![...](https://raw.githubusercontent.com/...)` chưa?
- [ ] Mở PR trên GitHub kiểm tra thấy hình ảnh/GIF hiển thị ngay lập tức không bị lỗi vỡ ảnh (broken image)?
