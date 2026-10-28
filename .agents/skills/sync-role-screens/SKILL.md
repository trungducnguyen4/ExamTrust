---
name: sync-role-screens
description: >-
  Đồng bộ thay đổi UI/logic giữa các role (admin, lecturer, student) trong ExamTrust. PHẢI dùng ngay sau khi vừa sửa/thêm code ở FE/src/app/{role}, FE/src/features/{role}, FE/src/components, FE/src/hooks, hoặc BE/src/**/*.service.ts|*.controller.ts — vì cùng một chức năng (exam, course, question-bank, question-editor, analytics, exam-monitor, exam-taking) thường lặp lại ở nhiều role và phải trace xem role khác có màn cần sửa giống vậy không.
whenToUse: >-
  Kích hoạt khi: sửa giao diện; sửa component/hook dùng chung; sửa 1 API/service ảnh hưởng nhiều role; sửa validation; sửa exam-taking/exam-monitor/exam-preview/question-editor; hoặc bất kỳ lúc nào vừa Edit/Write xong file trong FE hoặc BE.
---

# Sync Role Screens (đồng bộ chức năng giữa các role)

Repo ExamTrust có 3 role chính: `admin`, `lecturer`, `student`. Nhiều chức năng bị lặp lại giữa các role dưới các tên file khác nhau (không phải lúc nào cũng trùng tên), ví dụ:

- `FE/src/features/admin/ExamManagement.tsx` ↔ `FE/src/features/lecturer/ExamManagement.tsx`
- `FE/src/features/admin/CourseManagement.tsx` ↔ `FE/src/features/lecturer/CourseManagement.tsx`
- `FE/src/app/admin/exam(s)` ↔ `FE/src/app/lecturer/exam(s)` ↔ `FE/src/app/student/exams`
- Component dùng chung nằm ở `FE/src/components/{common,ui,layout}` — sửa 1 chỗ ảnh hưởng mọi role.
- Hook dùng chung ở `FE/src/hooks/*` (ví dụ `use-exam-security.ts`) hoặc `FE/src/features/{role}/hooks/*`.
- BE: 1 service/controller (ví dụ `exams.service.ts`) thường expose endpoint cho nhiều role qua `@Roles(...)` khác nhau — sửa logic chung ảnh hưởng cả admin/lecturer/student dù chỉ có 1 file.

## Quy trình (luôn làm đủ các bước, không bỏ qua bước tra cứu graph)

### 1. Xác định phạm vi vừa sửa
Tóm tắt: file nào, hàm/component nào, hành vi gì thay đổi (bug fix, thêm field, đổi validate, đổi UI...).

### 2. Trace tay bằng Grep/Glob theo cấu trúc role
- Nếu sửa trong `FE/src/features/<role>/Xxx.tsx` hoặc `FE/src/app/<role>/...`: Glob/Grep tên file, tên component, tên hàm export tương tự ở 2 role còn lại (`FE/src/features/{other-roles}`, `FE/src/app/{other-roles}`). Tên không cần trùng 100% — so theo chức năng (ví dụ "quản lý đề thi", "theo dõi phòng thi", "tạo câu hỏi").
- Nếu sửa 1 file trong `FE/src/components/common|ui|layout` hoặc `FE/src/hooks`: đây gần như chắc chắn dùng chung nhiều role → Grep tên import của file đó trong toàn bộ `FE/src/app` và `FE/src/features` để liệt kê hết nơi dùng.
- Nếu sửa `BE/src/**/*.service.ts|controller.ts`: đọc decorator `@Roles(...)`/guard để biết role nào gọi được endpoint đó; đọc luôn phần FE gọi endpoint này (`services/api` hoặc tương đương) ở từng role.

### 3. Double-check bằng knowledge graph (khuyến nghị, làm SAU bước Grep tay)
Grep theo tên/text có thể bỏ sót các trường hợp gọi qua alias, re-export, import động, hoặc hàm cùng tên khác chỗ. Repo có sẵn knowledge graph Graphify ở `.graphify/` — dùng nó để bắt các trường hợp đó (KHÔNG cần MCP server, gọi CLI trực tiếp):

- `graphify query "<câu hỏi về callers/usage của hàm vừa sửa>"` → subgraph liên quan.
- `graphify path "<A>" "<B>"` khi cần xem đường liên hệ giữa component/hook và nơi dùng.
- `graphify explain "<khái niệm>"` khi chưa chắc tên symbol tương đương ở role khác.
- So sánh danh sách callers/usages từ graphify với danh sách đã trace tay ở bước 2. Bổ sung bất kỳ file/role nào graphify phát hiện ra mà Grep chưa thấy.
- Nếu `.graphify/needs_update` tồn tại hoặc `.graphify/branch.json` có `stale=true`: cảnh báo kết quả có thể cũ, và chạy graphify với `--update` khi phù hợp. Nếu `.graphify/graph.json` không tồn tại thì bỏ qua bước này và nói rõ là đã bỏ qua.

### 4. Quyết định sync hay hỏi lại
- Nếu logic ở role khác giống hệt (copy-paste cùng bug/cùng thiếu sót) → áp dụng sửa tương tự luôn, không cần hỏi.
- Nếu có khác biệt nghiệp vụ giữa role (quyền khác nhau, luồng khác nhau, UI khác nhau có chủ đích) → KHÔNG tự sync mù quáng, hỏi lại user trước khi sửa file của role khác.
- Việc sửa nhiều file thuộc nhiều role vẫn là "local, reversible" (code trong repo), không cần hỏi xác nhận kiểu như hành động phá hoại — nhưng nếu không chắc có nên áp dụng giống hệt hay không, hỏi.

### 5. Luôn tổng kết cuối
Kết thúc bằng 1 trong 2 dạng:
- "Đã đồng bộ tại: <role>/<file> — <thay đổi gì>" (liệt kê từng nơi), hoặc
- "Không có màn/role khác dùng chức năng này (đã check bằng Grep + graphify)."

Nếu phát hiện màn tương tự nhưng chưa chắc nên sync, ghi rõ: "Phát hiện tương tự ở <role>/<file> nhưng có khác biệt <...> — cần bạn xác nhận trước khi sửa."
