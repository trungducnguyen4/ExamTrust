## graphify

This project has a graphify knowledge graph at .graphify/.

Rules:
- For codebase or architecture questions, when `.graphify/graph.json` exists, first run `graphify query "<question>"` (or `graphify path "<A>" "<B>"` / `graphify explain "<concept>"`); these return a scoped subgraph, usually much smaller than `GRAPH_REPORT.md` or raw grep output
- If .graphify/wiki/index.md exists, navigate it instead of reading raw files
- Skill `graphify` nằm ở `.agents/skills/graphify/SKILL.md`. Trong DeepSeek Harness, gọi qua tool `skill` với name `graphify` (hoặc gõ `/graphify`), còn `graphify ...` trong terminal là lệnh CLI thật
- Trong Codex, trigger tường minh là `$graphify ...` (chỉ Codex mới có cú pháp này, không dùng trong DeepSeek Harness)
- A successful TypeScript-backed graphify build should leave `.graphify/.graphify_runtime.json` with `runtime: typescript`
- If .graphify/graph.json is missing but graphify-out/graph.json exists, run `graphify migrate-state --dry-run` first; if tracked legacy artifacts are reported, ask before using the recommended `git mv -f graphify-out .graphify` and commit message
- If .graphify/needs_update exists or .graphify/branch.json has stale=true, warn before relying on semantic results and run the graphify skill with --update when appropriate
- If the user asks to build, update, query, path, or explain the graph, use the installed `graphify` skill instead of ad-hoc file traversal
- Before proposing or committing .graphify artifacts, run `graphify portable-check .graphify`; commit-safe graph artifacts must use repo-relative paths, and never commit .graphify/branch.json, .graphify/worktree.json, .graphify/needs_update, or .graphify/cache/. If a repo already tracks any of them, first add them to .gitignore, then propose `git rm --cached .graphify/branch.json .graphify/worktree.json .graphify/needs_update` and `git rm -r --cached .graphify/cache`
- **Quyền hạn Git Automation:** AI Agent ĐƯỢC PHÉP chủ động tạo nhánh (branch), commit và push lên GitHub remote theo đúng quy chuẩn phân nhánh (Branching Model) mà KHÔNG CẦN hỏi lại người dùng để tối ưu tốc độ và tự động hóa quy trình.
- Before deep graph traversal, prefer `graphify summary --graph .graphify/graph.json` for compact first-hop orientation
- For review impact on changed files, use `graphify review-delta --graph .graphify/graph.json` instead of generic traversal
- Read `.graphify/GRAPH_REPORT.md` only for broad architecture review or when `query` / `path` / `explain` do not surface enough context
- After modifying code files in this session, run `npx graphify hook-rebuild` to keep the graph current

## Verification Protocol — Proof of Change & Confidence Report
Sau mỗi thay đổi, agent phải xuất báo cáo theo 4 trụ cột:
1. **Tests**: Kiểm tra cú pháp, lint, test case thực tế.
2. **Runtime**: Chạy API / hàm thực tế, xác minh DB data.
3. **Visual**: BẮT BUỘC chụp ảnh (Screenshot) nếu sửa UI, quay video màn hình (Video/GIF) nếu sửa luồng người dùng (User Flow).
4. **Confidence**: Đánh giá độ tin cậy kèm những gì đã kiểm và chưa kiểm.

---

## Git Flow, Bugfix & Pull Request (PR) Protocol

Mọi quy trình phát triển tính năng, sửa lỗi (bugfix/hotfix) và mở Pull Request (PR) của AI Agent bắt buộc phải tuân thủ nghiêm ngặt mô hình phân nhánh và vòng đời phát hành dưới đây:

### 1. Mô hình Phân nhánh (Branching Model)

```
[Feature/Bugfix Branches]       [develop]               [Release Branches]         [UAT/release]      [Production/master]
       (EX-xxx)                 (DEV Env)                    (SemVer)                (UAT Env)            (PROD Env)
          │                         │                           │                        │                     │
      (A) ├────────────────────────>│ (A)                       │                        │                     │
          │                         │                           │                        │                     │
      (B) ├────────────────────────>│ (AB)                      │                        │                     │
          │                         │                           │                        │                     │
      (C) ├────────────────────────>│ (ABC) ───────────────────>│ (v1.0.0) ─────────────>│ (ABC) ─────────────>│ (master: v1.0.0)
          │                         │                           │                        │                     │
      (D) ├────────────────────────>│ (ABCD)                    │                        │                     │
          │                         │                           │                        │                     │
      (E) ├────────────────────────>│ (ABCDE)                   │                        │                     │
          │                         │                           │                        │                     │
 [Critical Bugfix / Hotfix (F)]     │                           │                        │                     │
      (F) ├────────────────────────────────────────────────────>│ (v1.0.1 - ABCF) ───────>│ (ABCF) ────────────>│ (master: v1.0.1)
          │                         │                           │                        │                     │
          └────────────────────────>│ (ABCDEF) ────────────────>│ (v1.1.0 - ABCDEF) ────>│ (ABCDEF) ──────────>│ (master: v1.1.0)
          (Back-merge to develop)   │                           │                        │                     │
```

* **Feature / Bugfix Branches (`EX-xxx` hoặc `feature/EX-xxx`, `bugfix/EX-xxx`):**
  - Tên nhánh BẮT BUỘC đặt theo mã Issue/Ticket trên Jira: ví dụ `EX-001`, `EX-002`,...
  - Tách từ nhánh `develop` khi làm tính năng mới hoặc sửa lỗi thông thường.
  - Phải vượt qua kiểm thử tự động, code review và QA trước khi được merge vào `develop`.

* **Nhánh `develop` (DEV Environment):**
  - Tích hợp liên tục cho môi trường phát triển nội bộ.
  - Mỗi commit hoặc PR merge vào `develop` sẽ tự động trigger pipeline deploy lên **môi trường DEV**.

* **Nhánh `Release Branches` (`release/vX.Y.Z` hoặc `v1.0.0`, `v1.0.1`, `v1.1.0`):**
  - Được đặt tên theo chuẩn **Semantic Versioning (SemVer - semver.org)**: `vMAJOR.MINOR.PATCH`.
  - Tách từ `develop` khi bộ tính năng đã sẵn sàng để phát hành.

* **Quy trình Sửa lỗi Khẩn cấp (Critical Bug Fixes / Hotfix - Nhánh F trong sơ đồ):**
  - Đối với lỗi nghiêm trọng ở production hoặc bản release (ví dụ: syntax error làm sập ứng dụng, crash server):
    1. Tạo nhánh hotfix (ví dụ: `hotfix/EX-xxx` hoặc `fix/EX-xxx`).
    2. Sửa lỗi trực tiếp và đưa vào bản release patch (ví dụ: `v1.0.1`) **mà không cần kéo theo toàn bộ các thay đổi chưa hoàn thiện trên `develop`**.
    3. Đẩy qua `release` (UAT) $\rightarrow$ `master` (Production).
    4. **BẮT BUỘC Back-merge về `develop`**: Ngay sau khi release, nhánh fix phải được merge ngược trở lại `develop` (`ABCDEF`) để tránh tình trạng mất bản vá (regression) trong các release kế tiếp.

* **Nhánh `release` (UAT Environment):**
  - Môi trường kiểm thử chấp nhận người dùng (UAT).
  - Mọi merge vào nhánh `release` sẽ tự động trigger pipeline deploy lên **môi trường UAT**.

* **Nhánh `master` / `main` (Production Environment):**
  - Mã nguồn ổn định nhất đang chạy cho người dùng cuối.
  - Mọi merge vào `master` sẽ tự động deploy lên **môi trường Production**.
  - **Bắt buộc gắn Tag:** Mỗi lần merge vào `master` phải tạo Git Tag tương ứng định dạng `release/v1.x.x` (hoặc `v1.x.x`).

---

### 2. Quy chuẩn dành cho AI Agent khi Sửa lỗi (Bug Fixing Protocol)

Khi tiếp nhận bất kỳ lỗi nào (như lỗi cú pháp, runtime crash, logic bug):
1. **Phân tích Nguyên nhân Gốc (Root Cause Analysis):** Xác định chính xác file, dòng code và nguyên nhân gây lỗi trước khi chỉnh sửa.
2. **Khoanh vùng Thay đổi (Minimal Touch):** Chỉ chỉnh sửa đúng phạm vi cần thiết để giải quyết lỗi, tuyệt đối không format hoặc sửa đổi mã nguồn không liên quan.
3. **Thực thi Báo cáo 4 Trụ Cột:** Luôn kiểm tra lại cú pháp (`tsc`, `lint`), gọi thử API/màn hình thực tế, chụp ảnh/quay video xác minh, và đánh giá độ tin cậy.
4. **Cập nhật Knowledge Graph:** Chạy `npx graphify hook-rebuild` sau khi sửa code để đồng bộ knowledge graph.

---

### 3. Quy chuẩn Soạn thảo Pull Request (PR Template)

Mỗi khi tạo PR, AI Agent phải cung cấp đầy đủ thông tin theo mẫu chuẩn sau:

```markdown
### 📌 PR: [EX-xxx] <type>(<scope>): <Mô tả ngắn gọn mục đích>

#### 1. Loại thay đổi (PR Type)
- [ ] Feature (Tính năng mới vào `develop`)
- [ ] Bugfix (Sửa lỗi vào `develop`)
- [ ] Critical Hotfix (Sửa lỗi khẩn cấp vào `release/vX.Y.Z` & Back-merge `develop`)

#### 2. Vấn đề & Nguyên nhân (Problem & Root Cause)
- **Mã Ticket / Issue:** EX-xxx
- **Mô tả hiện tượng:** [Mô tả chi tiết lỗi hoặc yêu cầu tính năng]
- **Nguyên nhân gốc rễ (Root Cause):** [Giải thích kỹ thuật vì sao phát sinh lỗi]

#### 3. Giải pháp & Chi tiết thay đổi (Solution & Key Changes)
- **Files thay đổi:**
  - `path/to/file`: [Mô tả thay đổi]
- **Tóm tắt giải pháp:** [Cách thức đã sửa hoặc triển khai]

#### 4. Bằng chứng kiểm thử (Verification Protocol — 4 Trụ Cột)
- [x] **Tests:** Cú pháp sạch, TypeScript / Jest pass 100%.
- [x] **Runtime:** Đã gọi API / reload trang thành công với HTTP Status 200.
- [x] **Visual:** [Đính kèm Screenshot / Video màn hình chứng minh giao diện hoạt động]
- [x] **Confidence:** High (Đã kiểm tra luồng trực tiếp).

#### 5. Nhánh đích & Kế hoạch Merge (Target & Back-merge Plan)
- **Source Branch:** `EX-xxx` (hoặc `hotfix/EX-xxx`)
- **Target Branch:** `develop` (hoặc `release/vX.Y.Z`)
- **Back-merge required:** [Có / Không - Nếu là hotfix thì bắt buộc merge ngược về `develop`]
```

