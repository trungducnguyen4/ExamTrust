---
name: playwright-runner
description: >-
  Executes, debugs, and authors Playwright End-to-End (E2E) browser tests in ExamTrust (Next.js + NestJS).
  Automates full user flows (Student exam taking, Lecturer exam creation), powers the Pre-Launch Attack Squad
  (chaos monkey & double-submit race condition testing), and generates automated Visual Proofs (full layout shell
  screenshots and mp4 video recordings) for GitHub Pull Request descriptions.
whenToUse: >-
  Use whenever: verifying Tier 3 (Layout/Static UI) or Tier 4 (Complex User Flow) changes; generating automated
  screenshots or video proofs for PRs; running Pre-Launch Attack Squad chaos suites; diagnosing flaky browser interactions
  or unhandled client-side exceptions during exam flows.
---

# Playwright Runner Skill — E2E Testing & Visual Proof Automation

> **Mục tiêu**: Chuẩn hóa việc thực thi và phân tích kiểm thử trình duyệt đầu-cuối (E2E) trong ExamTrust, cung cấp bằng chứng trực quan tự động (Visual Proof) và vũ khí thực chiến cho Pre-Launch Attack Squad.

---

## 1. Nguyên tắc & Quy chuẩn cốt lõi

### 📐 Tiêu chuẩn Viewport (Layout Shell Invariant)
Mọi test E2E và ảnh/video chụp màn hình minh chứng bắt buộc phải tuân thủ kích thước:
- **Desktop Shell (Mặc định)**: Viewport `1440 x 900` — Đảm bảo Sidebar điều hướng `240px` và Header luôn hiển thị đầy đủ, không bị co rúm ô input (`squished search bar`) hay rớt dòng.
- **Mobile / Tablet**: Viewport `390 x 844` hoặc `768 x 1024` — Xác minh giao diện thu gọn và Sheet menu mượt mà, không bị tràn viền (horizontal overflow).

### 🎬 Minh chứng trực quan (Visual Proof of Change)
- **Ảnh tĩnh (`.png`)**: Lưu tại `docs/screenshots/<ticket>-<flow>.png`.
- **Video luồng thao tác (`.mp4`)**: Cấu hình `video: 'on'` hoặc `'retain-on-failure'`, lưu tại `docs/videos/<ticket>-<flow>.mp4`.
- **Nhúng trực tiếp vào PR**: Dùng định dạng Markdown Image hoặc video link trong mục `Bằng chứng kiểm thử (Verification Protocol)` của PR description.

---

## 2. Các lệnh thực thi chuẩn (Execution Guide)

Mọi lệnh chạy E2E đều thực hiện từ thư mục gốc hoặc thư mục `FE/`:

```bash
# 1. Chạy toàn bộ test suite E2E ở chế độ headless (Chromium)
npm run test:e2e
# hoặc từ thư mục FE:
cd FE && npx playwright test

# 2. Chạy một kịch bản kiểm thử cụ thể
cd FE && npx playwright test e2e/exam-taking.spec.ts
cd FE && npx playwright test e2e/double-submit-race.spec.ts

# 3. Chạy ở chế độ debug giao diện (Playwright UI Mode)
cd FE && npm run test:e2e:ui

# 4. Xem báo cáo chi tiết sau khi chạy test
cd FE && npm run test:e2e:report

# 5. Kích hoạt Attack Squad kèm E2E Browser Testing thực chiến
RUN_E2E=1 npm run attack
```

---

## 3. Danh mục Kịch bản E2E hiện có (`FE/e2e/`)

| File Test | Mục đích kiểm thử | Mũi nhọn Attack Squad / Trụ cột |
| :--- | :--- | :--- |
| `auth.setup.ts` | Tự động hóa đăng nhập Student / Lecturer và lưu Storage State | Hạ tầng Auth Session |
| `login-and-layout.spec.ts` | Kiểm tra giao diện Login, demo roles, và xác minh không tràn viền 1440px | Tier 3 (Layout Shell) |
| `exam-taking.spec.ts` | Duyệt qua câu hỏi, chọn đáp án, đặt cờ, và xem màn hình tổng kết nộp bài | Feature Navigator (User Flow) |
| `double-submit-race.spec.ts` | Giả lập double-click nộp bài trong 10ms, xác minh nút bị disable & không bắn request trùng | Chaos Monkey (Race Condition) |

---

## 4. Quy trình xử lý khi Test bị Fail (Diagnostics Integration)

Khi một kịch bản Playwright bị fail (Timeout, Element not visible, Assertion error):
1. **Kiểm tra Trace Viewer**:
   ```bash
   cd FE && npx playwright show-trace test-results/<failed-test-folder>/trace.zip
   ```
2. **Xem ảnh chụp failure**:
   Playwright tự động chụp màn hình tại thời điểm vỡ test vào `test-results/`.
3. **Ủy thác cho Diagnostics Subagent**:
   Nếu lỗi liên quan đến bất đồng bộ (Race Condition), mất dữ liệu backend, hoặc crash UI không rõ nguyên nhân:
   - Gọi `invoke_subagent` kích hoạt skill `diagnostics`.
   - Subagent phân tích trace log và API payload trong ngữ cảnh độc lập và trả về `DIAGNOSTIC REPORT`.
   - Main Agent tiến hành sửa mã nguồn tối thiểu theo báo cáo.
