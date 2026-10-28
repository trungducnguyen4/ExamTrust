// Single source of truth for how a raw proctoring/integrity `eventType`
// (tab_switch, fullscreen_exit, paste, camera_stream_ended, ...) is labeled
// and bucketed everywhere it's surfaced to a lecturer/admin — the exam
// monitor's live alert feed, the integrity case list, and the case detail
// timeline. These three screens used to each maintain their own label
// table (two of which were English-keyed lookups against values the
// backend no longer emits, making them permanent no-ops), so the same
// event showed different wording depending on which screen you opened.

export const INTEGRITY_EVENT_LABELS: Record<string, string> = {
  exam_start: 'Bắt đầu phiên làm bài',
  submit: 'Đã nộp bài thi',
  answer: 'Ghi nhận tương tác trả lời',
  tab_switch: 'Chuyển tab',
  fullscreen_exit: 'Thoát chế độ toàn màn hình',
  fullscreen_exit_warning: 'Cảnh báo thoát toàn màn hình (lần đầu, chưa tính)',
  window_blur: 'Mất tiêu điểm cửa sổ',
  blur: 'Mất tiêu điểm cửa sổ',
  focus: 'Đã quay lại cửa sổ làm bài',
  // The client only ever emits `mouse_idle`. `mouse_anomaly` is kept here
  // (mapped to the same label) only for backward compatibility with any
  // pre-existing/demo-seeded rows still tagged that way — it is never
  // newly produced going forward (see submissions.service.ts's
  // getExamOverview synthetic alert builder).
  mouse_idle: 'Gián đoạn tương tác (chuột/bàn phím)',
  mouse_anomaly: 'Gián đoạn tương tác (chuột/bàn phím)',
  copy: 'Sao chép nội dung',
  paste: 'Dán nội dung',
  paste_external: 'Dán nội dung từ ngoài bài thi',
  violation_escalation: 'Leo thang vi phạm toàn vẹn học thuật',
  face_not_detected: 'Không phát hiện khuôn mặt',
  camera_stream_ended: 'Webcam giám sát không còn khả dụng',
  camera_recovery_timeout: 'Webcam không được khôi phục kịp thời',
  camera_restored: 'Webcam giám sát đã được khôi phục',
  screen_share_ended: 'Chia sẻ màn hình không còn khả dụng',
  screen_share_recovery_timeout: 'Chia sẻ màn hình không được khôi phục kịp thời',
  screen_share_restored: 'Chia sẻ màn hình đã được khôi phục',
  multi_monitor_detected: 'Cắm thêm màn hình trong lúc làm bài',
  multi_monitor_at_start: 'Dùng nhiều màn hình ngay khi bắt đầu làm bài',
  navigation_attempt: 'Cố gắng rời khỏi trang làm bài',
  page_reload: 'Tải lại hoặc rời trang khi đang làm bài',
  network_disconnected: 'Mất kết nối mạng',
  network_restored: 'Đã khôi phục kết nối mạng, tiếp tục làm bài',
};

export function getIntegrityEventLabel(eventType: string): string {
  const key = String(eventType || '').toLowerCase();
  return INTEGRITY_EVENT_LABELS[key] || `Sự kiện toàn vẹn học thuật: ${key.replace(/_/g, ' ')}`;
}

// Coarse category used for icon selection and the "Tín hiệu" pattern
// breakdown (previously computed by substring-matching the *translated*
// Vietnamese label against English keywords like "mouse"/"tab", which
// silently miscounted every mouse-related event once the label stopped
// containing that English word).
export type IntegrityEventCategory = 'tab_switch' | 'fullscreen' | 'camera' | 'copy_paste' | 'mouse' | 'other';

export function getIntegrityEventCategory(eventType: string): IntegrityEventCategory {
  const key = String(eventType || '').toLowerCase();
  if (key === 'tab_switch') return 'tab_switch';
  if (key.startsWith('fullscreen') || key === 'blur' || key === 'window_blur' || key === 'focus') return 'fullscreen';
  if (key.startsWith('camera') || key.startsWith('screen_share') || key === 'face_not_detected' || key === 'multi_monitor_detected' || key === 'multi_monitor_at_start') return 'camera';
  if (key === 'copy' || key === 'paste' || key === 'paste_external') return 'copy_paste';
  if (key.startsWith('mouse')) return 'mouse';
  return 'other';
}

// Canonical 3-level severity for a raw eventType — matches the scale
// already used by ExamMonitor.tsx's alert feed ('low' | 'warning' |
// 'critical'). Events not in this list (exam_start, submit, answer, focus,
// camera_restored, screen_share_restored, page_reload) are informational
// only, hence 'low'.
export function getIntegrityEventSeverity(eventType: string): 'low' | 'warning' | 'critical' {
  const key = String(eventType || '').toLowerCase();
  if (key.includes('fullscreen') || key === 'face_not_detected' || key === 'violation_escalation' || key === 'camera_recovery_timeout' || key === 'screen_share_recovery_timeout' || key === 'multi_monitor_detected') {
    return 'critical';
  }
  if (['tab_switch', 'window_blur', 'blur', 'copy', 'paste', 'paste_external', 'mouse_idle', 'mouse_anomaly', 'camera_stream_ended', 'screen_share_ended', 'navigation_attempt', 'network_disconnected', 'multi_monitor_at_start'].includes(key)) {
    return 'warning';
  }
  return 'low';
}
