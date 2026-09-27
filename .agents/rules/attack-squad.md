# Rule: Multi-Agent Pre-Launch Attack Squad

## Core Philosophy
Trước bất kỳ đợt launch, release hoặc kỳ thi thực tế nào trong **ExamTrust**, toàn bộ hệ thống (FE Next.js + BE Express + Prisma DB + Zalo Webhook) phải trải qua một đợt tổng tấn công mô phỏng bởi **Biệt đội 4 Tác nhân (Attack Squad)**.

---

## 4 Attack Angles

```
┌────────────────────────────────────────────────────────┐
│             PRE-LAUNCH ATTACK SQUAD                    │
├──────────────────────────┬─────────────────────────────┤
│ 1. Features              │ 2. Bugs (Chaos & Edge)      │
│    Run every user flow   │    Explore weird states     │
├──────────────────────────┼─────────────────────────────┤
│ 3. Performance           │ 4. Security                 │
│    Profile slow paths    │    Probe inputs, permissions│
└──────────────────────────┴─────────────────────────────┘
```

### 1. 🧭 Feature Navigator
- Chạy qua toàn bộ luồng người dùng của sinh viên và giảng viên:
  - Sinh viên: Đăng nhập ➔ Vào phòng thi ➔ Làm bài & Nộp bài thi ➔ Xem điểm.
  - Giảng viên/Admin: Tạo đề thi ➔ Giám sát gian lận ➔ Chấm bài ➔ Xuất bảng điểm.

### 2. 🐒 Chaos Monkey & Edge Hunter
- Thử nghiệm các trạng thái bất thường trong kỳ thi:
  - Nộp bài thi 2 lần liên tiếp (double submission race condition).
  - Tải lên file bài thi dung lượng 0KB, file sai định dạng hoặc payload siêu dài.
  - Chụp Screenshot ngay khi phát hiện màn hình vỡ giao diện hoặc lỗi ngoại lệ.

### 3. ⚡ Performance Profiler
- Đo độ trễ phản hồi API nộp bài và đồng bộ câu hỏi (Target: < 500ms).
- Kiểm tra kích thước bundle Next.js tĩnh.

### 4. 🛡️ Security Auditor
- **IDOR / Thi hộ**: Sinh viên A không được sửa bài thi hoặc xem kết quả bài thi của Sinh viên B qua việc thay đổi ID trên URL/API.
- **SQL Injection / Prisma leak**: Kiểm tra an toàn truy vấn cơ sở dữ liệu.
- **Secret Leaks**: Quét mã nguồn ngăn chặn rò rỉ token AWS, Zalo Webhook key, JWT Secret.

---

## 🚦 Gate Policy (Quy tắc Chặn Release)
- 🔴 **BLOCK**: Lỗ hổng gian lận thi cử, lộ secret, crash luồng nộp bài.
- 🟡 **WARNING**: Cảnh báo hiệu năng hoặc lỗi giao diện nhẹ.
- 🟢 **PASS**: Hoàn thành toàn diện 4 góc tấn công an toàn.
