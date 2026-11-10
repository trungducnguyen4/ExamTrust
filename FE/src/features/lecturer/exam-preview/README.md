# 🎓 Exam Preview Module (Xem trước đề thi)

## 📌 Tổng quan
Thư mục này quản lý toàn bộ giao diện và logic xem trước đề thi cho cả hai vai trò:
- **Giảng viên**: `/lecturer/exam/[id]/preview`
- **Quản trị viên**: `/admin/exam/[id]/preview`

## ⚡ Các Tối ưu Hiệu năng Đã Triển khai (EX-052)
1. **Khử Double-fetching (4.5s -> 0.8s):**
   - Sử dụng `lastFetchedIdRef` chặn request thứ 2 từ React 18 StrictMode mount.
   - Cơ chế gom request GET `inFlightGetRequests` trong `ApiClient` (`FE/src/lib/api.ts`).
2. **Autonomous AI QA Squad (51s -> 1.5s):**
   - Backend đã bổ sung route `GET /api/ai/jobs/:id` tại `BE/src/ai/ai.controller.ts`.
   - Frontend dừng ngay vòng lặp nếu gặp lỗi HTTP 404/500 thay vì poll 30 lần.
3. **Question Navigator:**
   - Hộp chọn nhanh câu hỏi 5 cột mô phỏng trực quan giao diện thi thực tế của học sinh.

## 📁 Cấu trúc Thư mục
- `index.tsx`: Component chính `ExamPreview`.
- `components/AutonomousAuditDialog.tsx`: Modal LangGraph Multi-Agent thẩm định đề thi.
- `README.md`: Tài liệu kiến trúc và hướng dẫn.
