"use client";

import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { HelpedTitle } from "@/components/common/ContextHelp";
import {
  TrendingUp,
  TrendingDown,
  Target,
  BookOpen,
  Video,
  ListChecks,
  Users,
  Download,
  BarChart3,
  Brain,
  Clock,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { BackToDashboardButton } from "@/components/common/BackToDashboardButton";

// Mock data
const examResult = {
  title: "Thuật toán nâng cao — Giữa kỳ",
  course: "CS301",
  submittedAt: "2026-02-24T10:55:00",
  totalScore: 84,
  maxScore: 100,
  avgScore: 79,
  percentile: 78,
  timeUsed: "1h 45m",
  passed: true,
};

const sectionScores = [
  { name: "Lý thuyết & khái niệm", score: 28, max: 30, percentage: 93 },
  { name: "Giải quyết vấn đề", score: 32, max: 40, percentage: 80 },
  { name: "Ứng dụng & phân tích", score: 24, max: 30, percentage: 80 },
];

const answerPatterns = {
  strengths: [
    { topic: "Độ phức tạp thuật toán", accuracy: 95, questions: 8 },
    { topic: "Cấu trúc dữ liệu", accuracy: 88, questions: 6 },
    { topic: "Lý thuyết đồ thị", accuracy: 85, questions: 5 },
  ],
  weaknesses: [
    { topic: "Quy hoạch động", accuracy: 50, questions: 6 },
    { topic: "Phân tích tiệm cận", accuracy: 60, questions: 5 },
  ],
};

const recommendations = [
  {
    type: "reading",
    icon: BookOpen,
    title: "Chương 15: Kỹ thuật quy hoạch động nâng cao",
    description: "Ôn lại cách tiếp cận bottom-up và top-down",
    action: "Đọc ngay",
  },
  {
    type: "video",
    icon: Video,
    title: "Chuyên đề phân tích tiệm cận",
    description: "Video 45 phút về trường hợp xấu nhất/trung bình/tốt nhất",
    action: "Xem video",
  },
  {
    type: "practice",
    icon: ListChecks,
    title: "Bộ bài tập quy hoạch động",
    description: "20 bài tập chọn lọc từ dễ đến khó",
    action: "Bắt đầu luyện tập",
  },
  {
    type: "group",
    icon: Users,
    title: "Nhóm học tập: Thuật toán",
    description: "Tham gia cùng 15 bạn học khác",
    action: "Tham gia nhóm",
  },
];

const feedbackHistory = [
  { exam: "Kiểm tra thuật toán 1", date: "2026-01-15", score: 72, change: null },
  { exam: "Kiểm tra thuật toán 2", date: "2026-02-01", score: 78, change: +6 },
  { exam: "Giữa kỳ thuật toán", date: "2026-02-24", score: 84, change: +6 },
];

export default function FeedbackDetail() {
  const router = useRouter();

  return (
    <DashboardLayout>
      <div className="mx-auto w-full max-w-[1280px] space-y-6 px-4 sm:px-6 lg:px-8 py-2 sm:py-4">
        <BackToDashboardButton to="/student" className="mb-4 -ml-2" />

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-foreground mb-1">
              Phản hồi & phân tích học tập
            </h1>
            <p className="text-muted-foreground">
              {examResult.title} · {examResult.course}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-2">
              <Download className="h-4 w-4" />
              Tải PDF
            </Button>
          </div>
        </div>

        {/* Score Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-4 pb-4 text-center">
              <p className="text-3xl font-bold text-primary">
                {examResult.totalScore}
              </p>
              <p className="text-xs text-muted-foreground">
                / {examResult.maxScore} Tổng điểm
              </p>
              <div className="flex items-center justify-center gap-1 mt-1">
                <TrendingUp className="h-3 w-3 text-green-600" />
                <span className="text-xs text-green-600">
                  +{examResult.totalScore - examResult.avgScore} so với TB
                </span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4 text-center">
              <p className="text-3xl font-bold">{examResult.percentile}%</p>
              <p className="text-xs text-muted-foreground">Phân vị</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4 text-center">
              <p className="text-3xl font-bold">{examResult.timeUsed}</p>
              <p className="text-xs text-muted-foreground">Thời gian đã dùng</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4 text-center">
              <StatusBadge
                variant={examResult.passed ? "success" : "destructive"}
                className="text-base px-4 py-1"
              >
                {examResult.passed ? "ĐẠT" : "KHÔNG ĐẠT"}
              </StatusBadge>
              <p className="text-xs text-muted-foreground mt-2">Kết quả</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column — 2/3 */}
          <div className="lg:col-span-2 space-y-6">
            {/* Score Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-primary" />
                  <HelpedTitle help="Cho biết điểm số của bạn phân bố ra sao theo từng phần bài thi, giúp bạn nhận ra phần mạnh và yếu.">
                    Phân bổ điểm
                  </HelpedTitle>
                </CardTitle>
                <CardDescription>Hiệu suất theo từng phần bài thi</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {sectionScores.map((section) => (
                    <div key={section.name}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium">{section.name}</span>
                        <span className="text-muted-foreground">
                          {section.score}/{section.max} ({section.percentage}%)
                        </span>
                      </div>
                      <Progress value={section.percentage} className="h-2" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Answer Pattern Analysis */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Brain className="h-5 w-5 text-primary" />
                  <HelpedTitle help="Tổng hợp các mẫu trả lời lặp lại để giúp bạn hiểu điểm mạnh và lỗi sai sau bài thi.">
                    Phân tích mẫu trả lời
                  </HelpedTitle>
                </CardTitle>
                <CardDescription>
                  Điểm mạnh và điểm cần cải thiện
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-4">
                  <h4 className="text-sm font-semibold text-green-700 dark:text-green-400 mb-2 flex items-center gap-1">
                    <CheckCircle2 className="h-4 w-4" /> Điểm mạnh
                  </h4>
                  <div className="space-y-2">
                    {answerPatterns.strengths.map((s) => (
                      <div
                        key={s.topic}
                        className="flex items-center justify-between p-2 rounded bg-green-50/50 dark:bg-green-950/20 border border-green-100 dark:border-green-900"
                      >
                        <span className="text-sm font-medium">{s.topic}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground">
                            {s.questions} câu hỏi
                          </span>
                          <StatusBadge tone="success">
                            {s.accuracy}%
                          </StatusBadge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <Separator className="my-4" />

                <div>
                  <h4 className="text-sm font-semibold text-red-700 dark:text-red-400 mb-2 flex items-center gap-1">
                    <XCircle className="h-4 w-4" /> Điểm cần cải thiện
                  </h4>
                  <div className="space-y-2">
                    {answerPatterns.weaknesses.map((w) => (
                      <div
                        key={w.topic}
                        className="flex items-center justify-between p-2 rounded bg-red-50/50 dark:bg-red-950/20 border border-red-100 dark:border-red-900"
                      >
                        <span className="text-sm font-medium">{w.topic}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground">
                            {w.questions} câu hỏi
                          </span>
                          <StatusBadge tone="danger">
                            {w.accuracy}%
                          </StatusBadge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Recommendations */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Target className="h-5 w-5 text-primary" />
                  <HelpedTitle help="Gợi ý bước tiếp theo dựa trên kết quả và điểm yếu của bạn.">
                    Gợi ý cá nhân hóa
                  </HelpedTitle>
                </CardTitle>
                <CardDescription>
                  Dựa trên kết quả và điểm yếu của bạn
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {recommendations.map((rec, idx) => (
                    <div
                      key={idx}
                      className="p-4 rounded-lg border border-border hover:border-primary/50 transition-colors"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <rec.icon className="h-5 w-5 text-primary" />
                        <span className="text-sm font-medium">{rec.title}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mb-3">
                        {rec.description}
                      </p>
                      <Button size="sm" variant="outline" className="w-full">
                        {rec.action}
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right column — 1/3 */}
          <div className="space-y-6">
            {/* Feedback History / Progress */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  <HelpedTitle help="Theo dõi phản hồi gần đây theo thời gian để biết xu hướng học tập có đang cải thiện.">
                    Lịch sử tiến bộ
                  </HelpedTitle>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {feedbackHistory.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2 rounded border border-border"
                    >
                      <div>
                        <p className="text-sm font-medium">{item.exam}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.date}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold">{item.score}%</p>
                        {item.change !== null && (
                          <span
                            className={`text-xs flex items-center gap-0.5 ${item.change > 0 ? "text-green-600" : "text-red-600"}`}
                          >
                            {item.change > 0 ? (
                              <TrendingUp className="h-3 w-3" />
                            ) : (
                              <TrendingDown className="h-3 w-3" />
                            )}
                            {item.change > 0 ? "+" : ""}
                            {item.change}%
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Quick Links */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Trang liên quan</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button
                  variant="outline"
                  className="w-full justify-start gap-2"
                  size="sm"
                  onClick={() => router.push("/student/grading")}
                >
                  <BarChart3 className="h-4 w-4" /> Chi tiết chấm điểm
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start gap-2"
                  size="sm"
                  onClick={() => router.push("/student/timeline")}
                >
                  <Clock className="h-4 w-4" /> Dòng thời gian sự kiện
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start gap-2"
                  size="sm"
                  onClick={() => router.push("/student/learning-feedback")}
                >
                  <Brain className="h-4 w-4" /> Phân tích chi tiết
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
