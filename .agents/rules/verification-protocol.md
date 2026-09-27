# Rule: Verification Protocol — "Prove the Change and Report Confidence"

## Core Philosophy
Mọi thay đổi mã nguồn, tính năng mới hoặc sửa lỗi (bugfix) đều phải được chứng minh bằng bằng chứng thực tế trước khi coi là hoàn thành.
Tuyệt đối không phán đoán "chắc là chạy được rồi" mà không có kết quả xác minh cụ thể.

Sau khi hoàn thành bất kỳ thay đổi nào, AI agent phải xuất báo cáo xác minh tuân thủ đúng **4 Trụ Cột (4 Pillars)**:

---

## 4 Trụ Cột Xác Minh (The 4 Pillars)

### 1. 🧪 Tests (Kiểm tra Logic & Tích hợp)
- **Syntax & Type Check**: Chạy kiểm tra cú pháp / TypeScript / linter (ví dụ: `npm run lint` hoặc `tsc --noEmit` ở FE/BE).
- **Unit & Integration Tests**: Kết quả chạy test tự động (`npm test`).
- Nêu rõ: Số lượng test case pass, thời gian chạy, đảm bảo không có lỗi hồi quy (zero regression).

### 2. ⚡ Runtime (Chạy thực tế tính năng End-to-End)
- Gọi API backend thực tế hoặc chạy luồng function cục bộ.
- Kiểm tra status code (HTTP 200/201), response time và payload trả về.
- Xác minh dữ liệu trong Database (Prisma/PostgreSQL/SQLite) xem bản ghi đã thực sự được ghi/sửa đúng chưa.

### 3. 👁️ Visual (Kiểm tra những gì người dùng sẽ thấy)
- **Chỉnh sửa Giao diện / Component (UI Changes)**:
  - **BẮT BUỘC chụp ảnh màn hình (Screenshot)** đính kèm vào báo cáo.
  - Phải thể hiện các trạng thái: Normal, Empty state, Loading, Active, Mobile responsive.
- **Luồng người dùng / Quy trình nghiệp vụ (User Flows / Multi-step Journey)**:
  - **BẮT BUỘC quay video màn hình (Screen Recording Video / GIF)** thể hiện trọn vẹn hành trình (click mở modal, nhập form, bấm submit, chuyển trang, toast thông báo thành công).
- **Chỉnh sửa Backend thuần (Backend only)**:
  - Minh họa Toast thông báo, Modal cảnh báo hoặc cột dữ liệu hiển thị trên giao diện người dùng.

### 4. 🎯 Confidence (Tuyên bố những gì ĐÃ kiểm và CHƯA kiểm)
- **Mức độ tự tin (Confidence level)**: High / Medium / Low kèm lý do rõ ràng.
- **Những gì ĐÃ được chứng minh (Verified)**: Danh sách các hành vi/chức năng đã có bằng chứng xác nhận.
- **Những gì CHƯA kiểm thử (NOT Verified)**: Các trường hợp biên chưa thử, môi trường phụ thuộc bên ngoài (máy in thực tế, camera vật lý, webcam thi cử, Zalo Webhook live, AWS credentials thực tế...).

---

## Delivery Channels & Workflow
Quy trình này phải được thực thi khép kín:
1. Xuất báo cáo 4 Trụ Cột trong tin nhắn phản hồi cuối cùng cho người dùng.
2. Cập nhật artifact `walkthrough.md` (đính kèm Screenshots/Video).
3. **TỰ ĐỘNG COMMIT & PUSH**: Sau khi toàn bộ các bước kiểm tra (Tests, Runtime, Visual, Confidence) đạt tiêu chuẩn, AI BẮT BUỘC phải thực hiện commit với conventional message và push trực tiếp lên repository (`origin main`), không được để dở dang trên local tree trừ khi người dùng yêu cầu giữ lại.
4. Điền nội dung báo cáo vào GitHub Pull Request description nếu tạo PR (theo mẫu `.github/PULL_REQUEST_TEMPLATE.md`).
