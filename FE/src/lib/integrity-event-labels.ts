// Single FE source of truth for labeling a raw proctoring/integrity
// `eventType` — used by the exam monitor's live alert feed, the admin
// integrity case detail timeline, and the results page's case cards.
// These three screens used to each maintain their own label table (with
// wording drifting between them for the same eventType), mirroring the same
// problem BE/src/submissions/integrity-event-catalog.ts fixed on that side.
// Kept manually in sync with that BE catalog since FE and BE are separate
// builds/projects that don't share code.
export const INTEGRITY_EVENT_LABELS: Record<string, string> = {
  exam_start: "Bắt đầu phiên làm bài",
  submit: "Đã nộp bài thi",
  answer: "Ghi nhận tương tác trả lời",
  tab_switch: "Chuyển tab",
  fullscreen_exit: "Thoát chế độ toàn màn hình",
  fullscreen_exit_warning: "Cảnh báo thoát toàn màn hình (lần đầu, chưa tính)",
  window_blur: "Mất tiêu điểm cửa sổ",
  blur: "Mất tiêu điểm cửa sổ",
  focus: "Đã quay lại cửa sổ làm bài",
  // The client only ever emits `mouse_idle`. `mouse_anomaly` is kept here
  // (mapped to the same label) only for backward compatibility with any
  // pre-existing/demo-seeded rows still tagged that way — it is never
  // newly produced going forward (see submissions.service.ts's
  // getExamOverview synthetic alert builder).
  mouse_idle: "Gián đoạn tương tác (chuột/bàn phím)",
  mouse_anomaly: "Gián đoạn tương tác (chuột/bàn phím)",
  copy: "Sao chép nội dung",
  paste: "Dán nội dung",
  paste_external: "Dán nội dung từ ngoài bài thi",
  violation_escalation: "Leo thang vi phạm toàn vẹn học thuật",
  face_not_detected: "Không phát hiện khuôn mặt",
  camera_stream_ended: "Webcam giám sát không còn khả dụng",
  camera_recovery_timeout: "Webcam không được khôi phục kịp thời",
  camera_restored: "Webcam giám sát đã được khôi phục",
  screen_share_ended: "Chia sẻ màn hình không còn khả dụng",
  screen_share_recovery_timeout: "Chia sẻ màn hình không được khôi phục kịp thời",
  screen_share_restored: "Chia sẻ màn hình đã được khôi phục",
  multi_monitor_detected: "Cắm thêm màn hình trong lúc làm bài",
  multi_monitor_at_start: "Dùng nhiều màn hình ngay khi bắt đầu làm bài",
  navigation_attempt: "Cố gắng rời khỏi trang làm bài",
  page_reload: "Tải lại hoặc rời trang khi đang làm bài",
  network_disconnected: "Mất kết nối mạng",
  network_restored: "Đã khôi phục kết nối mạng, tiếp tục làm bài",
};

export function getIntegrityEventLabel(eventType?: string | null): string {
  const key = String(eventType || "").toLowerCase();
  return INTEGRITY_EVENT_LABELS[key] || "Sự kiện giám sát";
}

/**
 * Rút gọn chuỗi mô tả tín hiệu/hành vi giám sát:
 * - Bỏ các tiền tố dài dòng như "Phát hiện hành vi", "Phát hiện"
 * - Giữ lại tên hành vi ngắn gọn, súc tích (vd: "Chuyển tab", "Chuyển động chuột bất thường")
 */
export function formatSignalDescription(desc?: string | null): string {
  if (!desc) return "—";
  const cleaned = desc
    .replace(/^phát hiện\s+(hành vi\s+)?/i, "")
    .trim();
  if (!cleaned) return desc;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}
