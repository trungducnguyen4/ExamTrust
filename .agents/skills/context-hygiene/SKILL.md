---
name: context-hygiene
description: >-
  Quản lý context và quyết định khi nào nên chạy /compact trong DeepSeek Harness, kèm phương án
  thay thế cho IDE không có /compact. Dùng khi context phình to, vừa xong một task/PR, chuẩn bị
  sang task lớn mới, khi agent bắt đầu quên ràng buộc cũ, hoặc khi user hỏi có nên compact hay
  mở phiên mới. Gồm ngưỡng auto-compact thực tế của DSH, checklist handoff trước khi nén, và
  quy trình handoff + phiên mới cho mọi IDE.
whenToUse: >-
  Khi context dài hoặc phình nhanh, sau khi tạo/merge PR, trước một task lớn, khi agent lặp lại
  câu hỏi hoặc quên quyết định cũ, khi user hỏi về compact/session mới, hoặc khi cần bàn giao
  phiên sang IDE khác.
---

# Context Hygiene — khi nào `/compact`, và khi IDE không có lệnh này

## 1. TL;DR

- **DSH auto-compact ở ngưỡng rất cao** (≈ 720k–838k token với `deepseek-flash`). Nó là lưới an toàn, **không phải kế hoạch**. Đừng chờ nó.
- `/compact` là quyết định về **chất lượng và tốc độ**, không phải để "cứu" phiên. Chạy khi agent đang rảnh.
- **Agent KHÔNG tự gọi được `/compact`** (lệnh UI do người dùng bấm). Agent chỉ được: chuẩn bị handoff → báo user bấm → kiểm tra kết quả.
- Trước khi nén: **lưu handoff ra file**. Sau khi nén: **kiểm tra checkpoint đủ 6 mục**.
- Không có `/compact` → "nén bằng file": handoff + commit/push + mở phiên mới.

## 2. DSH nén context như thế nào (số liệu thật)

Đọc từ các package đi kèm (`dsh-compaction-basic`, `dsh-command-compact`, `dsh-compaction-tool-result-pruner`):

- **Ngưỡng auto-compact:** `floor(min(W × 0.8, W − O − 65.536))` — `W` = context window, `O` = output cap của request.
- **Deployment này:** `deepseek-flash`/`deepseek-v4-pro` có `W = 1.048.576`, output cap mặc định `256k` → ngưỡng ≈ **721k token** (tối đa 838k nếu output cap nhỏ hơn). Phần gần nhất được giữ nguyên văn: **16% × (W − O)** ≈ **126k–167k token**.
- **Tràn thật vẫn có đường lùi:** một lần nén tối đa + retry khi provider báo `CONTEXT_WINDOW_EXCEEDED`. Vì thế auto-compact là an toàn kỹ thuật, không phải chiến lược làm việc.
- **Tool result lớn không bị cắt giữa phiên.** Pruner chỉ chạy *sau khi* đã chạm ngưỡng → đọc file/log quá nhiều sẽ nằm nguyên trong context.
- **Nén chỉ thay mặt hiển thị cho model** (1 summary + đuôi gần nhất). Session log giữ nguyên toàn bộ, GUI hiện header compaction → không mất dấu kiểm toán, nhưng **có thể mất chi tiết suy luận và trích dẫn nguyên văn**.
- **`/compact`:** chỉ chạy khi agent rảnh (đang chạy turn → "Compaction is unavailable"), **không nhận tham số**, không tốn một model turn nhưng **tốn 1 request phụ** để viết summary; prompt gửi trong lúc nén sẽ xếp hàng chờ.
- **Đọc con số thật ở đâu:** composer dock (token total + cache hit) trong Web GUI; Settings → General → Performance & usage = `compact`.

## 3. Khi nào NÊN `/compact`

1. **Vừa đóng một đơn vị công việc** (PR tạo/merge, test xanh) và việc tiếp theo không liên quan → compact, hoặc tốt hơn: mở phiên mới nếu không cần lịch sử.
2. **Chuẩn bị sang task lớn/khám phá rộng** (audit repo, thiết kế feature) → nén trước để nhường chỗ cho output tool của task mới.
3. **Sau pha ngốn context bằng output tool** (grep lớn, đọc file 1.000 dòng, log test đầy đủ) — phần lớn context lúc này là nhiễu.
4. **Trước một chặng dài** (plan mode nhiều bước, chờ CI/review lâu) để auto-compact không chen ngang giữa việc.
5. **Tín hiệu chất lượng:** agent bắt đầu hỏi lại điều đã nói, quên ràng buộc, đọc lại file đã đọc → context đã loãng.

## 4. Khi nào KHÔNG nên

- Đang giữa turn hoặc đang chờ lệnh dài (lệnh sẽ trả về "unavailable" vô ích).
- **Cần nguyên văn** nội dung cũ (path, diff, error string) mà chưa lưu ra file → lưu trước đã.
- **Ngay sau một lần compact** — tránh vòng lặp nén: mỗi lần tốn 1 request và mất thêm chi tiết.
- Phiên còn nhỏ (ước chừng dưới ~150–200k token) — chỉ tốn kém, không lợi gì.
- Đang chờ CI/review mà còn cần log của chính phiên đó.

## 5. Nghi thức trước khi compact (bắt buộc)

Agent phải làm đủ 3 bước **trước khi** đề nghị user bấm `/compact`:

1. **Chốt trạng thái git:** `git status` — việc đang dở phải được commit/push lên nhánh, hoặc ghi rõ là chưa commit. Ghi lại **tên nhánh + link PR**.
2. **Ghi handoff file** `docs/runs/<YYYY-MM-DD>-<ticket>.md` (tạo nếu chưa có; không commit nếu chỉ là nháp) với đúng 6 mục:

```markdown
# Handoff <ticket> — <mục tiêu 1 dòng>
1. Mục tiêu: ...
2. Đã làm / đã xác minh: ... (kèm bằng chứng: lệnh đã chạy, kết quả)
3. Quyết định + lý do: ...
4. File/đường dẫn chính xác: ...
5. Lệnh tái hiện + lỗi hiện tại: ...
6. Bước tiếp theo duy nhất: ...
```

3. **Liệt kê ràng buộc "không được làm"** (vd: không `git reset --hard`, không commit file X, không sửa nhánh đang dirty) — nếu không ghi ra, summary sẽ làm mất chúng.

## 6. Sau khi compact — kiểm tra checkpoint

- Đối chiếu summary vừa hiện với 6 mục handoff. Thiếu gì thì nhắn **2–3 câu ngắn** bổ sung ngay (rẻ hơn nhiều so với làm lại việc).
- Không nén lại ngay lần hai.
- Nếu việc tiếp theo khác hẳn task cũ: mở **phiên mới** thay vì tiếp tục phiên đã nén.

## 7. Khi IDE không có `/compact`

Nguyên tắc: **không có lệnh nén thì "nén bằng file"** — biến context thành artifact bền rồi mở phiên mới.

| Môi trường | Cách xử lý |
|---|---|
| DSH Web GUI | `/compact` khi rảnh, hoặc phiên mới + handoff |
| DSH automation/headless (không có command adapter) | Chỉ có auto-compact; muốn sớm hơn thì hạ `thresholdRatio` trong profile, hoặc handoff + phiên mới |
| Cursor | `/summarize` (on-demand, changelog 1.6) + auto-summarize khi đầy |
| Claude Code | `/compact` + auto-compact có sẵn |
| Codex CLI / Copilot Chat / IDE khác | Kiểm tra phiên bản có `/compact` không; nếu không → quy trình dưới đây |

**Quy trình handoff (dùng được ở mọi IDE):**

1. Ghi handoff 6 mục như mục 5.
2. Commit/push phần đang dở lên nhánh; ghi lại nhánh + link PR.
3. Mở phiên mới, prompt mở đầu: `Đọc <file handoff>, nhánh <X>, PR <Y>, tiếp tục bước tiếp theo`.
4. Giữ phiên cũ mở đến khi phiên mới chạy được (để đối chiếu nguyên văn khi cần).

## 8. Giảm áp lực context từ đầu (để ít khi phải nén)

- Câu hỏi kiến trúc → `graphify query/path/explain` thay vì grep/đọc nhiều file.
- `read` với `offset`/`limit`; dùng `grep` thay vì dump cả file.
- Output dài (log test, build) → ghi ra file rồi đọc đúng đoạn cần, đừng dump vào chat.
- Todo/quyết định → ghi ra file, không chỉ giữ trong hội thoại.
- Convention lặp lại → đưa vào `AGENTS.md` hoặc skill, đừng nhắc lại mỗi phiên.
- Không đọc lại file vừa sửa; không chạy lại lệnh vừa chạy nếu kết quả còn hiệu lực.

## 9. Agent KHÔNG được làm

- Không bịa số token hay % context khi không đọc được số thật.
- Không nói "tôi đã compact" / "tôi sẽ compact" — chỉ được **đề nghị** user bấm.
- Không tự sửa config auto-compaction (`thresholdRatio`, `retainRatio`) khi chưa được yêu cầu.
- Không nén khi đang giữa turn, đang chờ CI cần log, hoặc ngay sau lần nén trước.

## 10. Checklist nhanh (copy-paste)

- [ ] `git status` sạch, hoặc WIP đã commit/push lên nhánh
- [ ] Handoff đã ghi đủ 6 mục, có path/lệnh chính xác
- [ ] Đã ghi nhánh + link PR + ràng buộc "không được làm"
- [ ] Báo user: "Context đã dài — bấm `/compact` khi rảnh, tôi đã lưu handoff ở `<file>`"
- [ ] Sau khi nén: đối chiếu 6 mục; thiếu thì bổ sung ngay, không nén lại
