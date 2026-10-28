# 📘 TÀI LIỆU ÔN TẬP PHỎNG VẤN CHUYÊN SÂU: DỰ ÁN EXAMTRUST
*(Bản Chuẩn Hóa Kỹ Thuật 100% Theo Mã Nguồn Thực Tế)*

---

* **Dự án:** ExamTrust — Nền tảng Đánh giá Học thuật & Khảo thí Trực tuyến Thông minh (Smart Academic Assessment & Integrity Proctoring Platform)
* **Tính chất:** Đồ án Khóa luận Tốt nghiệp Kỹ thuật Phần mềm — ĐH Tôn Đức Thắng (Tốt nghiệp loại Giỏi, GPA 8.34/10)
* **Vai trò:** Lead Full-stack Architecture & AI Integration
* **Mục tiêu phỏng vấn:** Vị trí Fresher / Junior Backend Developer (NestJS/Node.js), Full-stack Engineer, hoặc AI Application / LLM Engineer.

---

## MỤC LỤC
1. [Elevator Pitch — Giới thiệu dự án trong 60 - 90 giây](#1-elevator-pitch--giới-thiệu-dự-án-trong-60---90-giây)
2. [Kiến trúc Tổng thể & Dòng dữ liệu (System Architecture)](#2-kiến-trúc-tổng-thể--dòng-dữ-liệu-system-architecture)
3. [6 Điểm Sáng Kỹ thuật Cốt lõi (Technical Highlights)](#3-6-điểm-sáng-kỹ-thuật-cốt-lõi-technical-highlights)
4. [Bộ Câu Hỏi & Câu Trả Lời Phỏng Vấn Thực Chiến (STAR Model)](#4-bộ-câu-hỏi--câu-trả-lời-phỏng-vấn-thực-chiến-star-model)
5. [Các Câu Hỏi Bẫy của Interviewer & Cách Phản Ứng Khôn Ngoan](#5-các-câu-hỏi-bẫy-của-interviewer--cách-phản-ứng-khôn-ngoan)
6. [Bảng Tra Cứu Thông Số & Số Liệu Định Lượng (Cheat Sheet Chuẩn)](#6-bảng-tra-cứu-thông-số--số-liệu-định-lượng-cheat-sheet-chuẩn)

---

## 1. ELEVATOR PITCH (GIỚI THIỆU DỰ ÁN TRONG 60 - 90 GIÂY)

### 🎙️ Kịch bản trả lời mẫu:

> *"Em xin phép chia sẻ về **ExamTrust**, đây là đề tài Khóa luận Tốt nghiệp chuyên ngành Kỹ thuật Phần mềm của em tại Đại học Tôn Đức Thắng, nơi em đảm nhiệm vai trò **Lead Full-stack Architecture & Tích hợp AI** (Đề tài được hội đồng đánh giá xuất sắc, góp phần vào kết quả tốt nghiệp loại Giỏi GPA 8.34 của em).*
> 
> *Vấn đề lớn nhất của khảo thí trực tuyến hiện nay là **nguy cơ lộ đề, gian lận tinh vi**, và hệ thống **bị nghẽn Event Loop/cạn kiệt connection pool** khi tích hợp các mô hình AI xử lý tác vụ nặng. Để giải quyết triệt để bài toán này, em đã thiết kế kiến trúc chuẩn phân tán phân tách thành 2 tiến trình độc lập:*
> 
> 1. ***API Web Server (NestJS 10):*** *Phục vụ trả lời HTTP nhanh dưới 50ms cho thí sinh làm bài, nộp bài và tương tác thời gian thực.*
> 2. ***AI Worker độc lập (`ai-worker.ts` qua Bull Queue + Redis):*** *Chuyên xử lý hàng đợi các tác vụ AI nặng như sinh câu hỏi, vector matching, và phân tích ảnh webcam giám sát mà không làm nghẽn luồng xử lý chính.*
> 
> *Hệ thống nổi bật với 3 trụ cột kỹ thuật:*
> * ***Snapshot Đề thi Bất biến (Immutable Exam State):*** *Khi thí sinh bắt đầu thi, hệ thống đóng băng toàn bộ câu hỏi và đáp án đã xáo trộn vào bản ghi `ExamInstance.snapshotPayload`, cấp `randomizationSeed` riêng biệt. Đảm bảo dù giảng viên có sửa ngân hàng câu hỏi hay thí sinh reload trang thì đề thi vẫn bất biến 100%.*
> * ***Giám sát liêm chính Privacy-First & Không xâm phạm:*** *Khai thác Browser Standard APIs (`fullscreenchange`, `visibilitychange`, phát hiện cắm màn hình phụ qua `screen.isExtended`, phát hiện dán nội dung từ ngoài qua Clipboard Tracking) kết hợp Computer Vision phân tích ảnh webcam chu kỳ qua Cloudflare R2, tự động gán nhãn 9 nguy cơ gian lận.*
> * ***Multi-Provider LLM Gateway với JSON Repair tự phục hồi:*** *Tích hợp 5 nhà cung cấp (Gemini, DeepSeek, OpenRouter, NVIDIA, Ollama), cơ chế circuit breaker tự động fallback và vòng lặp `jsonrepair` đảm bảo tỷ lệ parse JSON thành công 100%.*
> 
> *Dự án được em quản lý nghiêm ngặt qua **28 Pull Requests chuẩn hóa trên GitHub**, mỗi PR đều đính kèm báo cáo kiểm tra tĩnh (`tsc -b pass 0 lỗi`) cùng ảnh chụp UI và video thực tế trước khi merge."*

---

## 2. KIẾN TRÚC TỔNG THỂ & DÒNG DỮ LIỆU (SYSTEM ARCHITECTURE)

```
[ Client: Next.js 15 App Router + React 18 + TailwindCSS ]
    │ (HTTPS / SSE Realtime / Telemetry Integrity Events)
    ▼
[ API Gateway & Web Server: NestJS 10 (Port 3001) ]
    ├── Auth Guard (JWT HTTP-Only Cookies + 3-Tier RBAC: Admin/Lecturer/Student)
    ├── Input Guardrails (< 100k ký tự) & ThrottlerGuard (Rate Limiting)
    ├── Exam Lifecycle & Snapshot Service
    └── Telemetry Listener Service (Xử lý chuỗi sự kiện giám sát)
    │
    ├── [ MySQL Database via Prisma ORM 6 ]
    │     ├── exams, questions, question_versions (Versioning 1-N)
    │     ├── exam_snapshots, exam_question_snapshots (Publish Snapshot)
    │     ├── exam_instances (snapshotPayload, randomizationSeed, questionOrder)
    │     └── exam_submissions, submission_answers (Debounced Auto-save)
    │
    └── [ Redis 7.0 Message Broker (Bull Queue) ]
          └── Queue 'ai-generation': single-question, exam-questions, 
                                     proctoring-evidence, question-duplicate-analysis
    ▼
[ Independent AI Background Worker (ai-worker.ts) ]
    ├── Concurrency: 5 jobs song song (Exponential backoff: 2s, 4s, 8s)
    ├── Multi-Provider Gateway (Gemini 2.0, DeepSeek, OpenRouter, NVIDIA, Ollama)
    ├── Dynamic Fallback Chain & Circuit Breaker (Opossum)
    ├── Safe JSON Parser Loop (Regex Stripping + jsonrepair + Zod Schema)
    ├── Vector Embedding & Cosine Similarity (128-dim Normalized Vector Projection)
    ├── Computer Vision Proctoring (Gemini 2.0 Flash / Ollama Moondream: 9 Tags)
    └── Cloudflare R2 Object Storage (Webcam snapshots, auto-purge 30 ngày)
```

---

## 3. 6 ĐIỂM SÁNG KỸ THUẬT CỐT LÕI (TECHNICAL HIGHLIGHTS)

### 1. Phân tách API Web Server & AI Background Worker (Distributed Bull Queue)
* **Vấn đề:** Các tác vụ AI như Giảng viên yêu cầu AI sinh câu hỏi, trích xuất tài liệu hoặc mô hình thị giác phân tích ảnh webcam phòng thi tốn từ 3 đến 15 giây. Nếu gọi trực tiếp trong HTTP Controller của NestJS, Event Loop của Node.js sẽ bị giữ kết nối (holding connection), gây cạn kiệt connection pool và nghẽn toàn bộ HTTP API khi hàng trăm thí sinh đang thi và nộp bài.
* *(Lưu ý mấu chốt: Nghiệp vụ bốc đề thi cho thí sinh hoàn toàn chạy bằng thuật toán truy vấn ma trận câu hỏi từ DB chỉ mất vài mili-giây, tuyệt đối KHÔNG gọi AI đồng bộ lúc thí sinh bắt đầu thi).*
* **Giải pháp:**
  * Khi có yêu cầu AI, API Server chỉ validate DTO, lưu `AIGenerationRecord` ở trạng thái `QUEUED`, đẩy job vào Redis Bull Queue (`queue: 'ai-generation'`) và trả ngay `HTTP 202 Accepted` kèm `jobId` trong **< 10ms**.
  * Tiến trình `ai-worker.ts` chạy độc lập, lắng nghe job theo định mức concurrency (5 jobs song song), gọi AI Gateway qua AbortSignal timeout 60s, chạy JSON Repair Loop và cập nhật kết quả vào database.
  * Phía Client sử dụng Polling định kỳ hoặc SSE để cập nhật trạng thái khi hoàn tất.
* **Kết quả:** Web Server luôn phản hồi tức thì (< 50ms), luồng làm bài và nộp bài của sinh viên hoàn toàn cách ly, không bị ảnh hưởng bởi tải xử lý của AI.

---

### 2. Nguyên tắc Human-in-the-Loop & Snapshot Đề thi Bất biến (Immutable Exam State)
* **Triết lý Thiết kế — Tuyệt đối không để AI tự ý phát đề thi trực tiếp:**
  * Trong khảo thí học thuật, việc cho LLM tự động sinh hoàn chỉnh cả một đề thi rồi phát trực tiếp cho thí sinh là điều tối kỵ vì rủi ro ảo giác (hallucination) và sai lệch chuẩn đầu ra đào tạo.
  * Trong ExamTrust: **AI CHỈ đóng vai trò trợ lý sinh bản thảo câu hỏi (Question Drafts)**. Giảng viên bắt buộc phải kiểm duyệt (review), tinh chỉnh nội dung, đáp án, độ khó trước khi lưu thành câu hỏi chính thức trong Ngân hàng câu hỏi.
* **Cơ chế Snapshot Đề thi Bất biến:**
  * **Cấp 1 (Lúc Công bố Đề):** Hệ thống đóng băng đề thi thành `ExamSnapshot` và `ExamQuestionSnapshot`.
  * **Cấp 2 (Lúc Thí sinh Bắt đầu làm bài):** Hệ thống sinh một `randomizationSeed` ngẫu nhiên (UUID), xáo trộn thứ tự câu hỏi và thứ tự đáp án theo seed, rồi đóng băng toàn bộ đề thi vào bản ghi **`ExamInstance`** (qua trường **`snapshotPayload: Json`** và **`questionOrder: Json`**).
  * **Tính Bất biến:** Trong suốt thời gian thi, thí sinh chỉ đọc và tương tác với bản Snapshot này. Dù giảng viên có sửa/xóa câu hỏi trong ngân hàng câu hỏi hay thí sinh F5 reload trang 100 lần, nội dung và vị trí đáp án vẫn giữ nguyên vẹn 100%.

---

### 3. Ngân hàng Câu hỏi Git-Like Versioning (`QuestionVersion`)
* **Vấn đề:** Đề thi cần kiểm toán (Audit Trail) phục vụ công tác thanh tra đào tạo. Nếu chỉ cập nhật trực tiếp dòng dữ liệu trong DB, hệ thống sẽ mất dấu ai đã sửa nội dung gì và không thể khôi phục phiên bản trước.
* **Giải pháp:** Thiết kế bảng `Question` quan hệ 1-N với `QuestionVersion`. Mỗi lần giảng viên chỉnh sửa, hệ thống tạo bản ghi version mới lưu diff (thay đổi nội dung stem, options, answerKey), trạng thái duyệt, thời gian và ID người sửa. Khi tạo đề, hệ thống liên kết chính xác tới `questionVersionId`, hỗ trợ đối soát lịch sử và rollback phiên bản dễ dàng.

---

### 4. Giám sát Liêm chính Privacy-First Qua Browser Standard APIs
* **Vấn đề:** Nhiều phần mềm thi cử bắt buộc sinh viên cài phần mềm can thiệp sâu vào kernel OS hoặc chiếm quyền webcam liên tục, gây lo ngại rò rỉ quyền riêng tư và dễ bị hệ điều hành/antivirus chặn.
* **Giải pháp:** Thu thập các tín hiệu phòng thi hoàn toàn qua các Web Standard APIs chuẩn:
  1. **`fullscreenchange`:** Bắt sự kiện thoát chế độ toàn màn hình (`fullscreen_exit`), cấp thời gian ân hạn 15s để sinh viên quay lại.
  2. **`visibilitychange` & `window.blur`:** Bắt sự kiện chuyển tab hoặc minimize trình duyệt (`tab_switch`).
  3. **`window.screen.isExtended` & `window.getScreenDetails()`:** Phát hiện thí sinh cắm thêm màn hình thứ 2 hoặc mở rộng màn hình trong lúc làm bài (`multi_monitor_detected`).
  4. **External Clipboard Tracking:** Lưu vết các đoạn văn bản sinh viên đã copy trong bài thi; nếu sinh viên paste một đoạn văn bản lạ từ ngoài vào, hệ thống kích hoạt sự kiện `paste_external`.
  5. **Mouse/Keyboard Inactivity Tracking:** Lắng nghe `pointermove` và `keydown` để phát hiện thí sinh treo máy không thao tác (`mouse_idle`).
  6. **MediaStream Recovery Tracking:** Lắng nghe sự cố mất luồng webcam hoặc ngắt chia sẻ màn hình quá 15s (`camera_recovery_timeout`, `screen_share_recovery_timeout`).
* **Xử lý:** Điểm rủi ro tổng hợp (Risk Score 0 - 100) được tính toán theo trọng số thời gian thực và lưu vào audit log làm bằng chứng minh bạch cho giảng viên.

---

### 5. Multi-Provider LLM Gateway & JSON Repair Loop
* **Vấn đề:** Các API LLM đám mây (Gemini, DeepSeek, OpenRouter) thường gặp lỗi: Rate limit (HTTP 429), server timeout (504), hoặc trả về chuỗi JSON bị lỗi cú pháp (thiếu ngoặc nhọn, trailing comma, lẫn markdown fence ```` ```json ````).
* **Giải pháp:**
  * **Trừu tượng hóa Đa Nhà cung cấp:** Hỗ trợ runtime switching giữa Google Gemini, DeepSeek, OpenRouter, NVIDIA, và Local Ollama. Có Circuit Breaker (Opossum) tự động ngắt mạch và fallback sang provider dự phòng khi tỷ lệ lỗi vượt ngưỡng.
  * **Vòng lặp JSON Repair tự phục hồi (`safeJsonParse`):**
    1. Bóc tách regex loại bỏ các khối markdown fence và ký tự rác.
    2. Đưa qua thư viện `jsonrepair` để tự động vá các lỗi cú pháp phổ biến của LLM (thiếu dấu phẩy, dùng nháy đơn, thiếu đóng ngoặc do chạm max tokens).
    3. Validate dữ liệu đầu ra qua Zod Schema.
* **Kết quả:** Đạt tỷ lệ phân tích cú pháp JSON thành công **100%**, loại bỏ hoàn toàn nguy cơ sập tiến trình worker do malformed JSON.

---

### 6. Khung Benchmark Tự động LLM-as-a-Judge (`golden-dataset.ts` & `eval-judge.ts`)
* **Vấn đề:** Làm sao biết prompt mới tốt hơn prompt cũ? Làm sao kiểm soát ảo giác (hallucination) và đảm bảo LLM sinh câu hỏi gợi ý đúng chủ đề, đúng thang nhận thức Bloom và an toàn trước prompt injection?
* **Giải pháp:**
  * Xây dựng bộ `golden-dataset.ts` chuẩn hóa bao phủ 3 nhóm bài toán cốt lõi:
    * **Bloom Taxonomy (5 ca):** Kiểm thử sinh câu hỏi từ cấp độ Remember, Understand, Apply đến Analyze.
    * **Chấm Tự luận & Phòng thủ Đối kháng (4 ca):** Đánh giá độ chính xác chấm điểm và năng lực kháng cự Prompt Injection Jailbreak (bọc thẻ `<student_untrusted_response>`).
    * **Giám sát Gian lận Đa biến (3 ca):** Mô phỏng các mức độ vi phạm phòng thi (Low, Medium, High).
  * Module `AiEvaluationJudge` sử dụng mô hình thẩm định (Gemini / DeepSeek) chấm điểm chất lượng câu hỏi theo thang Rubric: Độ chính xác học thuật, độ phân hóa câu hỏi, tính rõ ràng và tuân thủ schema.

---

## 4. BỘ CÂU HỎI & CÂU TRẢ LỜI PHỎNG VẤN THỰC CHIẾN

### ❓ Câu 1: Em hãy giải thích lý do tại sao chọn tách biệt API Web Server và Worker Process qua Redis Bull Queue mà không dùng trực tiếp Promise/Async trong NestJS?

**💡 Gợi ý trả lời (STAR Model):**
> *"Node.js hoạt động trên cơ chế Single-Threaded Event Loop. Khi một async operation như gọi API LLM sinh câu hỏi từ tài liệu hoặc phân tích ảnh webcam diễn ra, nó giữ kết nối HTTP TCP kết nối tới server trong hàng chục giây.*
> 
> *Nếu chỉ dùng `async/await` nội bộ trong Controller:
> 1. **Mất mát dữ liệu (In-memory Loss):** Nếu server bị restart, deploy bản mới hoặc crash giữa chừng, toàn bộ các tác vụ AI đang chạy dở dang sẽ bị mất vĩnh viễn trong RAM.
> 2. **Cạn kiệt Connection Pool & Nghẽn I/O:** Khi nhiều giảng viên cùng yêu cầu AI sinh đề hoặc nhiều webcam đẩy ảnh lên, số lượng concurrent request giữ kết nối quá lâu sẽ làm nghẽn Event Loop và cạn kiệt socket/database pool, kéo sập các request làm bài và nộp bài của hàng trăm thí sinh.*
> 
> *(Lưu ý mấu chốt: Nghiệp vụ tạo đề thi và nộp bài trong hệ thống hoàn toàn chạy bằng thuật toán database chỉ mất vài chục mili-giây, không hề đợi AI).*
> 
> *Vì vậy, em dùng **Redis Bull Queue** để tách thành Background Job: API Server chỉ nhận yêu cầu và đẩy vào Redis (mất < 10ms), trả về `jobId` cho client. Tiến trình `ai-worker.ts` chạy độc lập xử lý hàng đợi theo cơ chế concurrency kiểm soát được (5 jobs song song để tránh vượt rate-limit của LLM provider), có cơ chế tự retry với exponential backoff (2s, 4s, 8s) khi mạng chập chờn và lưu trạng thái bền vững vào Redis/MySQL."*

---

### ❓ Câu 2: Giả sử trong phòng thi có 500 sinh viên cùng nộp bài cùng một thời điểm (kết thúc giờ làm bài), hệ thống của em xử lý áp lực ghi vào Database như thế nào để không bị Deadlock hoặc sập DB?

**💡 Gợi ý trả lời:**
> *"Đây là bài toán cao điểm kinh điển của hệ thống thi cử (**Thundering Herd Problem**). Em đã giải quyết bài toán này qua 3 tầng giảm tải:*
> 
> 1. ***Debounced Auto-save (Lưu bài làm định kỳ 1 giây):*** *Trong suốt quá trình làm bài, mỗi khi sinh viên tick chọn đáp án, client tự động gửi cập nhật đáp án với cơ chế Debounce 1000ms (`use-exam-autosave.ts`). Nhờ đó, 95% dữ liệu bài làm đã được lưu rải rác vào bảng `submission_answers` từ trước.*
> 2. ***Thời điểm 'Nộp bài' chỉ là chốt trạng thái:*** *Khi bấm Nộp bài hoặc khi server tự động chốt giờ (`finalizeExpiredSubmissions`), request nộp bài chỉ cần kiểm tra nhanh các câu còn lại và cập nhật trường `status = 'SUBMITTED'` trong bảng `exam_submissions` kèm mốc thời gian `submittedAt`.*
> 3. ***Transaction Ngắn & Chấm điểm Tự luận Bất đồng bộ:*** *Prisma transaction được thiết kế cực ngắn để giải phóng connection ngay lập tức. Đối với các câu trắc nghiệm khách quan, điểm số được tính toán nhanh bằng thuật toán in-memory; đối với các câu hỏi tự luận cần AI chấm, hệ thống đẩy tiếp job vào Bull Queue để chấm bất đồng bộ phía sau, tuyệt đối không giữ kết nối DB của thí sinh."*

---

### ❓ Câu 3: Làm thế nào em đảm bảo LLM trả về đúng định dạng JSON mà hệ thống Backend có thể parse được 100% không bị crash?

**💡 Gợi ý trả lời:**
> *"Mô hình ngôn ngữ lớn bản chất là sinh xác suất từ tiếp theo, nên không có gì bảo đảm nó luôn trả về JSON hợp lệ nếu chỉ dùng prompt thông thường. Em áp dụng chiến lược phòng thủ 4 lớp:*
> 
> 1. ***System Prompt & Schema Enforcing:*** *Ép mô hình ở tầng system prompt chỉ trả về raw JSON, cấm hoàn toàn lời chào, giải thích hoặc markdown.*
> 2. ***Trích xuất chuỗi Regex:*** *Bóc tách chuỗi nằm giữa khối `{...}` hoặc `[...]` để loại bỏ các đoạn văn bản thừa hoặc markdown fence ```` ```json ````.*
> 3. ***Vòng lặp `jsonrepair`:*** *Sử dụng thư viện `jsonrepair` trong hàm `safeJsonParse()` để tự động vá các lỗi cú pháp LLM hay mắc phải như: thiếu dấu phẩy giữa các object, dùng nháy đơn thay cho nháy kép, trailing comma, hoặc chuỗi chưa đóng ngoặc nhọn do chạm giới hạn max tokens.*
> 4. ***Zod Validation & Fallback:*** *Đưa JSON đã parse qua Zod Schema. Nếu Zod báo thiếu trường bắt buộc, worker tự động trigger retry với nhiệt độ (temperature) thấp hơn (0.1) hoặc chuyển sang model dự phòng.*
> 
> *Nhờ pipeline này, hệ thống đạt tỷ lệ parse thành công **100%** trên toàn bộ tập dữ liệu kiểm thử mà không bao giờ bị crash tiến trình."*

---

### ❓ Câu 4: Em xử lý vấn đề Cheating Detection (chống gian lận) như thế nào mà không cần bắt sinh viên cài ứng dụng can thiệp sâu vào máy tính?

**💡 Gợi ý trả lời:**
> *"Em lựa chọn triết lý **Privacy-first Proctoring**. Thay vì cài phần mềm can thiệp sâu vào kernel OS gây lo ngại bảo mật riêng tư và dễ bị antivirus chặn, em khai thác triệt để các Browser Standard APIs kết hợp AI phân tích ảnh webcam chu kỳ:*
> 
> * ***Tầng 1 — Tín hiệu Trình duyệt Tiêu chuẩn:*** *Bắt sự kiện `visibilitychange` và `window.blur` để biết khi thí sinh đổi tab hoặc mở ứng dụng khác (`tab_switch`); bắt `fullscreenchange` để phát hiện thoát toàn màn hình; khai thác `window.screen.isExtended` và `getScreenDetails()` để phát hiện hành vi cắm thêm màn hình ngoài (`multi_monitor_detected`); và theo dõi Clipboard để phát hiện dán nội dung từ tài liệu ngoài (`paste_external`).*
> * ***Tầng 2 — Thị giác Máy tính Đa phương thức:*** *Định kỳ chụp ảnh webcam độ phân giải tối ưu gửi về Cloudflare R2 qua Pre-signed URL an toàn. Tiến trình worker gọi mô hình vision (Gemini 2.0 Flash hoặc Ollama Moondream) để gán nhãn **9 nguy cơ verifiably visible**: vắng mặt trước camera, nhiều người trước màn hình, sử dụng điện thoại, che camera...*
> * ***Tầng 3 — Risk Scoring & Human-in-the-Loop:*** *Hệ thống tổng hợp điểm rủi ro từ 0 đến 100. AI hoàn toàn **không tự ý đánh trượt** sinh viên mà chỉ đóng vai trò cung cấp bằng chứng timestamp cho giảng viên xem xét lại (Human-in-the-Loop). Toàn bộ ảnh webcam trên R2 được cấu hình tự động xóa sau 30 ngày để tuân thủ quyền riêng tư dữ liệu."*

---

### ❓ Câu 5: Trong dự án ExamTrust, em đã áp dụng quy trình Git Flow và Pull Request như thế nào?

**💡 Gợi ý trả lời:**
> *"Ngay từ đầu dự án, em đặt mục tiêu phát triển sản phẩm với kỷ luật như một dự án Enterprise thực thụ, không làm theo kiểu 'code một lèo commit thẳng vào main'.*
> 
> *Quy trình em tuân thủ gồm:
> 1. **Phân nhánh độc lập:** Mọi tính năng đều được phát triển trên nhánh làm việc riêng biệt (`duc`), cách ly hoàn toàn khỏi nhánh sản phẩm chính.
> 2. **Quy chuẩn PR Proof of Work:** Trong mỗi Pull Request trên GitHub, em bắt buộc phải có:
>    * Mô tả rõ ràng phạm vi thay đổi (Scope of Changes).
>    * Báo cáo kết quả kiểm tra tĩnh (`tsc -b pass 0 lỗi`).
>    * Đính kèm ảnh chụp màn hình UI hoặc video quay màn hình chạy thực tế làm minh chứng xác thực.
> 
> *Tổng cộng qua toàn bộ quá trình phát triển, em đã hoàn thành **28 Closed Pull Requests chuẩn hóa** được review và merge sạch sẽ vào nhánh `main`. Điều này giúp lịch sử commit của dự án vô cùng rõ ràng, dễ dàng truy vết và loại bỏ hoàn toàn rủi ro xung đột mã nguồn lớn."*

---

## 5. CÁC CÂU HỎI BẪY CỦA INTERVIEWER & CÁCH PHẢN ỨNG KHÔN NGOAN

### ⚠️ Bẫy 1: "Em dùng AI nhiều như vậy (Gemini, DeepSeek, Cursor...), có phải toàn bộ code của em là do AI viết giùm không?"

**🎯 Cách phản ứng bản lĩnh:**
> *"Dạ thưa anh/chị, AI là đòn bẩy gia tăng năng suất gõ mã nguồn của em lên gấp 3 đến 5 lần, nhưng **toàn bộ tư duy kiến trúc, thiết kế cơ sở dữ liệu và ràng buộc nghiệp vụ là do em trực tiếp làm chủ**.*
> 
> *Nếu chỉ giao phó cho AI mà không có nền tảng học thuật vững (em tốt nghiệp loại Giỏi chuyên ngành Kỹ thuật Phần mềm TDTU, GPA 8.34), AI sẽ sinh ra code rời rạc, xung đột schema, không xử lý được race condition trong database và không thể tự thiết kế được một pipeline phân tán ổn định giữa NestJS và Redis Bull Queue.*
> 
> *Em đóng vai trò là **Architect-in-the-Loop**: Em thiết kế data model, định nghĩa interface contracts, thiết lập các ràng buộc bảo mật RBAC; AI chỉ là trợ lý thực thi thần tốc. Mọi dòng code merge vào 28 PRs đều qua khâu kiểm chứng kiểu tĩnh và chạy thử thực tế của em."*

---

### ⚠️ Bẫy 2: "Tại sao em dùng MySQL kết hợp Prisma ORM mà không dùng MongoDB cho linh hoạt khi lưu trữ câu hỏi và đề thi?"

**🎯 Cách phản ứng chuẩn kỹ thuật:**
> *"Đối với hệ thống khảo thí và chấm điểm học thuật, **tính chất ACID (Atomicity, Consistency, Isolation, Durability)** và **tính toàn vẹn dữ liệu quan hệ** là ưu tiên sống còn. Ví dụ: một bài thi bắt buộc phải gắn liền với sinh viên hợp lệ, câu hỏi thuộc về đề thi, và số điểm không được phép sai lệch do race condition.*
> 
> *Nếu dùng NoSQL như MongoDB, ta sẽ dễ rơi vào tình trạng dữ liệu không đồng nhất (data inconsistency) khi cập nhật đồng thời nhiều quan hệ hoặc xử lý audit trail. Với MySQL kết hợp Prisma ORM, em vừa có được **Foreign Key Constraints chặt chẽ**, vừa có **Strict TypeScript Types đồng bộ tự động từ schema sang code backend**, giúp loại bỏ hoàn toàn lỗi mismatch kiểu dữ liệu ở compile-time.*
> 
> *Đồng thời, đối với các trường dữ liệu có cấu trúc linh hoạt như cấu hình đề thi hoặc mảng đáp án, MySQL hỗ trợ rất tốt kiểu dữ liệu `Json` native, mang lại sự kết hợp hoàn hảo giữa tính toàn vẹn quan hệ và tính linh hoạt."*

---

### ⚠️ Bẫy 3: "Nếu sinh viên mở DevTools (F12) xem Network Tab, họ có thể lấy được đáp án đúng trong Snapshot trả về không?"

**🎯 Cách phản ứng chuẩn an ninh:**
> *"Dạ hoàn toàn không thể ạ. Hệ thống của em áp dụng nguyên tắc **Information Hiding & Sanitize Layer** rất chặt chẽ giữa Backend và Frontend:*
> 
> * *Bản ghi `ExamInstance.snapshotPayload` lưu trong Database có chứa `answerKey` để phục vụ việc tự động chấm điểm độc lập khi thí sinh nộp bài mà không cần truy vấn lại ngân hàng câu hỏi.*
> * *Tuy nhiên, khi API trả dữ liệu đề thi về cho trình duyệt thí sinh, hàm `sanitizeExamInstanceForStudent` ở backend **bắt buộc bóc tách và loại bỏ 100% các trường nhạy cảm** (`answerKey`, `correctAnswer`, `explanation`). Thí sinh dù có mở F12, bắt gói tin qua Burp Suite hay xem state Redux thì cũng chỉ thấy được nội dung câu hỏi và các phương án đã xáo trộn."*

---

### ⚠️ Bẫy 4: "Làm thế nào JavaScript trên trình duyệt phát hiện được thí sinh đang dùng 2 màn hình?"

**🎯 Cách phản ứng sâu sắc về Web APIs:**
> *"Dạ thưa anh/chị, em kết hợp 2 tầng API của trình duyệt:*
> 1. ***Chromium Screen Details API (`window.getScreenDetails()`):*** *Trên các trình duyệt nhân Chromium, API này trả về danh sách các màn hình vật lý (`screens.length`) và bắn sự kiện `change` ngay khi có màn hình mới được cắm vào máy.*
> 2. ***Fallback với `window.screen.isExtended`:*** *Đối với các trình duyệt chưa hỗ trợ đầy đủ hoặc khi chưa được cấp quyền chi tiết, thuộc tính `isExtended` là một boolean chuẩn cho biết desktop có đang mở rộng qua nhiều màn hình hay không. Bằng cách kết hợp lắng nghe sự kiện và kiểm tra định kỳ thuộc tính này, hệ thống phát hiện chính xác khi số lượng màn hình tăng lên trong lúc làm bài và ghi nhận sự kiện `multi_monitor_detected`."*

---

## 6. BẢNG TRA CỨU THÔNG SỐ & SỐ LIỆU ĐỊNH LƯỢNG (CHEAT SHEET CHUẨN)

| Hạng mục kỹ thuật | Thông số thực tế trong ExamTrust | Ý nghĩa thuyết phục nhà tuyển dụng |
| :--- | :--- | :--- |
| **Pull Requests** | **28 Closed PRs trên GitHub** | Kỷ luật làm việc nhóm chuẩn mực, quản lý mã nguồn chặt chẽ |
| **Thời gian phản hồi API** | **< 50ms cho HTTP endpoints** | Nhờ bốc đề từ Snapshot và đẩy toàn bộ tải nặng sang Bull Queue |
| **Dung sai JSON LLM** | **100% Parse Success** | Áp dụng Regex fence stripping + thư viện `jsonrepair` + Zod Schema |
| **Auto-save Debounce** | **1000ms (1 giây)** | Giảm tải I/O ghi đĩa, 95% bài làm được lưu trước giờ nộp |
| **Mô hình Snapshot** | **`ExamInstance.snapshotPayload`** | Đóng băng đề thi và đáp án theo `randomizationSeed` bất biến |
| **Browser Telemetry** | **6+ nhóm sự kiện chuẩn Web** | `fullscreenchange`, `visibilitychange`, `isExtended`, `paste_external`, `mouse_idle` |
| **Multi-Provider AI** | **5 Nhà cung cấp tích hợp** | Google Gemini, DeepSeek, OpenRouter, NVIDIA, Local Ollama |
| **AI Worker Concurrency** | **5 Jobs song song** | Kiểm soát tải, tránh vượt rate limit của LLM API |
| **Bộ Golden Dataset** | **12 ca kiểm thử chuẩn hóa** | 5 ca Bloom, 4 ca Chấm tự luận (kèm Jailbreak), 3 ca Giám sát |
| **Lưu trữ Bằng chứng** | **Cloudflare R2 (Auto-purge 30 ngày)** | Tối ưu chi phí $0 hạ tầng và đảm bảo quyền riêng tư học thuật |
| **Học vấn** | **Tốt nghiệp Loại Giỏi (GPA 8.34/10)** | Nền tảng thuật toán, công nghệ phần mềm bài bản từ ĐH Tôn Đức Thắng |
