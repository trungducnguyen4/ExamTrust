"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ContextHelp, HelpedTitle } from "@/components/common/ContextHelp";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import { getNumericInputError, sanitizeNumericInput } from "@/lib/number-input";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileSearch,
  FileText,
  Loader2,
  Save,
  Sparkles,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";

type GeneratedQuestion = {
  id: string;
  content: string;
  type: string;
  options?: Record<string, string> | null;
  correctAnswer?: Record<string, string> | null;
  explanation?: string;
  difficulty?: number;
  points?: number;
  approved: boolean | null;
};

type Step = "upload" | "configure" | "generating" | "review";

export default function UploadDocAIGen() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [extractedText, setExtractedText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [courses, setCourses] = useState<any[]>([]);
  const [topics, setTopics] = useState<any[]>([]);
  const [courseId, setCourseId] = useState("");
  const [topicId, setTopicId] = useState("");
  const [numQuestions, setNumQuestions] = useState("10");
  const [numQuestionsError, setNumQuestionsError] = useState("");
  const [targetDifficulty, setTargetDifficulty] = useState("mixed");
  const [questionType, setQuestionType] = useState("MIXED");
  const [focusTopics, setFocusTopics] = useState("");
  const [generated, setGenerated] = useState<GeneratedQuestion[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    api.getCourses({ limit: 100 })
      .then((response) => {
        if (!active) return;
        const rows = Array.isArray(response) ? response : response?.data || [];
        setCourses(rows);
        if (rows[0]?.id) setCourseId(rows[0].id);
      })
      .catch(() => setCourses([]));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!courseId) {
      setTopics([]);
      setTopicId("");
      return;
    }
    let active = true;
    api.listQuestionTopics({ courseId, limit: 100 })
      .then((response) => {
        if (!active) return;
        const rows = Array.isArray(response) ? response : response?.data || [];
        setTopics(rows);
        setTopicId(rows[0]?.id || "");
      })
      .catch(() => {
        if (active) {
          setTopics([]);
          setTopicId("");
        }
      });
    return () => {
      active = false;
    };
  }, [courseId]);

  const difficultyToValue = (value: string) => {
    if (value === "easy") return 0.3;
    if (value === "medium") return 0.55;
    if (value === "hard") return 0.8;
    return 0.55;
  };

  const extractFileText = async (selected: File) => {
    const name = selected.name.toLowerCase();
    const isTextLike = /\.(txt|md|csv|json)$/i.test(name);
    const isDocx = /\.docx$/i.test(name);
    const isPdf = /\.pdf$/i.test(name);

    setExtracting(true);
    try {
      let text = "";
      if (isTextLike) {
        text = await selected.text();
      } else if (isDocx) {
        const mammoth = await import("mammoth/mammoth.browser");
        const extracted = await mammoth.extractRawText({ arrayBuffer: await selected.arrayBuffer() });
        text = extracted.value || "";
      } else if (isPdf) {
        throw new Error("Trích xuất văn bản PDF chưa được hỗ trợ ở phiên bản này. Vui lòng tải lên .docx, .txt, .md, .csv hoặc .json.");
      } else {
        throw new Error("Loại tệp không được hỗ trợ. Vui lòng tải lên .docx, .txt, .md, .csv hoặc .json.");
      }

      const normalized = text.replace(/\s+/g, " ").trim();
      if (!normalized) throw new Error("Tài liệu đã chọn không có văn bản để trích xuất.");
      setExtractedText(normalized);
      setStep("configure");
      toast.success("Đã trích xuất văn bản tài liệu. Tiếp tục cấu hình tạo câu hỏi bằng AI.");
    } catch (err: any) {
      setExtractedText("");
      toast.error(err.message || "Không thể trích xuất văn bản từ tệp này.");
    } finally {
      setExtracting(false);
    }
  };

  const startGeneration = async () => {
    const message = getNumericInputError(numQuestions, { min: 1, max: 50, integer: true });
    if (message) {
      setNumQuestionsError(message);
      return;
    }
    if (!courseId || !topicId) {
      toast.error("Vui lòng chọn học phần và chủ đề trước khi tạo câu hỏi.");
      return;
    }
    if (!extractedText) {
      toast.error("Vui lòng tải lên và trích xuất tài liệu trước.");
      return;
    }

    setStep("generating");
    try {
      const selectedCourse = courses.find((course) => course.id === courseId);
      const selectedTopic = topics.find((topic) => topic.id === topicId);
      const prompt = [
        "Generate exam-ready questions grounded only in the following uploaded course material.",
        `Document: ${file?.name || "uploaded document"}`,
        selectedTopic?.name ? `Target topic: ${selectedTopic.name}` : "",
        focusTopics.trim() ? `Lecturer focus: ${focusTopics.trim()}` : "",
        "Material:",
        extractedText.slice(0, 10000),
      ].filter(Boolean).join("\n\n");

      const response = await api.aiGenerateExamQuestions({
        prompt,
        questionCount: Number(numQuestions),
        difficulty: difficultyToValue(targetDifficulty),
        questionType,
        language: "vi",
        courseName: selectedCourse?.name,
        useCase: "question_bank",
        courseId,
        context: {
          courseId,
          topicId,
          source: "upload_doc_ai_gen",
          documentName: file?.name,
          extractedCharacters: extractedText.length,
        },
      });

      const questions = (response?.questions || []).map((question: any, index: number) => ({
        id: `gen-${index + 1}`,
        content: question.content || "",
        type: question.type || "MULTIPLE_CHOICE",
        options: question.options || null,
        correctAnswer: question.correctAnswer || null,
        explanation: question.explanation || "",
        difficulty: question.difficulty,
        points: question.points || 1,
        approved: null,
      }));
      setGenerated(questions);
      setStep("review");
      toast.success(`Đã tạo ${questions.length} câu hỏi từ nội dung tài liệu.`);
    } catch (err: any) {
      setStep("configure");
      toast.error(err.message || "Tạo câu hỏi bằng AI thất bại.");
    }
  };

  const saveApproved = async () => {
    const approved = generated.filter((question) => question.approved === true);
    if (!approved.length) return;
    setSaving(true);
    try {
      for (const question of approved) {
        await api.saveQuestion({
          type: question.type,
          content: question.content,
          options: question.options || undefined,
          correctAnswer: question.correctAnswer || undefined,
          explanation: question.explanation,
          difficulty: question.difficulty,
          points: question.points || 1,
          courseId,
          topicId,
          learningObjective: `Generated from ${file?.name || "uploaded document"}`,
        });
      }
      toast.success(`Đã lưu ${approved.length} câu hỏi đã duyệt vào ngân hàng câu hỏi.`);
      router.push("/lecturer/question-bank");
    } catch (err: any) {
      toast.error(err.message || "Lưu câu hỏi đã duyệt thất bại.");
    } finally {
      setSaving(false);
    }
  };

  const approvedCount = generated.filter((question) => question.approved === true).length;
  const rejectedCount = generated.filter((question) => question.approved === false).length;
  const pendingCount = generated.filter((question) => question.approved === null).length;

  return (
    <DashboardLayout>
      <div className="mx-auto w-full max-w-[1280px] space-y-6 px-4 sm:px-6 lg:px-8 py-2 sm:py-4">
        <Button variant="ghost" size="sm" className="mb-4 gap-2 text-muted-foreground" onClick={() => router.push("/lecturer/question-bank")}>
          <ArrowLeft className="h-4 w-4" /> Quay lại ngân hàng câu hỏi
        </Button>

        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground mb-1">
            Tải tài liệu & tạo câu hỏi bằng AI
          </h1>
          <p className="text-muted-foreground">
            Tạo câu hỏi dựa trên nội dung tệp văn bản/docx, giảng viên xem lại trước khi xuất bản vào ngân hàng câu hỏi.
          </p>
        </div>

        {step === "upload" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Upload className="h-5 w-5" /> Tải tài liệu lên</CardTitle>
              <CardDescription>Phiên bản này hỗ trợ .docx, .txt, .md, .csv và .json. Chưa hỗ trợ OCR/RAG cho PDF.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <input
                ref={inputRef}
                type="file"
                className="hidden"
                accept=".docx,.txt,.md,.csv,.json,.pdf"
                onChange={(event) => {
                  const selected = event.target.files?.[0];
                  if (!selected) return;
                  setFile(selected);
                  extractFileText(selected);
                }}
              />
              <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors" onClick={() => inputRef.current?.click()}>
                {extracting ? <Loader2 className="h-10 w-10 text-primary mx-auto mb-3 animate-spin" /> : <FileSearch className="h-10 w-10 text-muted-foreground mx-auto mb-3" />}
                <p className="text-sm font-medium">{extracting ? "Đang trích xuất văn bản..." : "Nhấn để tải tài liệu lên"}</p>
                <p className="text-xs text-muted-foreground mt-1">Văn bản trích xuất được gửi trực tiếp đến API tạo câu hỏi bằng AI.</p>
              </div>
              {file && (
                <div className="flex items-center gap-3 p-3 rounded-lg border">
                  <FileText className="h-8 w-8 text-primary" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                  {extractedText && <CheckCircle2 className="h-5 w-5 text-green-600" />}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {step === "configure" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                <HelpedTitle help={{
                  description: "Thiết lập cách AI tạo câu hỏi từ tài liệu đã tải lên.",
                  usedBy: "Giảng viên dùng để chọn khóa học, chủ đề, độ khó và loại câu hỏi trước khi sinh bản nháp.",
                  note: "AI output chỉ được lưu vào ngân hàng sau khi giảng viên xem và duyệt.",
                }}>
                  Thiết lập tạo câu hỏi bằng AI
                </HelpedTitle>
              </CardTitle>
              <CardDescription>Đã trích xuất {extractedText.length.toLocaleString()} ký tự từ {file?.name}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Học phần</Label>
                  <Select value={courseId} onValueChange={setCourseId}>
                    <SelectTrigger><SelectValue placeholder="Chọn học phần" /></SelectTrigger>
                    <SelectContent>
                      {courses.map((course) => <SelectItem key={course.id} value={course.id}>{course.code || course.name} - {course.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-1.5">
                    <Label>Chủ đề</Label>
                    <ContextHelp content={{
                      description: "Chủ đề mà các câu hỏi AI sinh ra sẽ được gắn vào.",
                      usedBy: "Dùng để tổ chức ngân hàng câu hỏi và phân tích kết quả theo nhóm kiến thức.",
                      note: "Nên tạo/chọn chủ đề trước khi duyệt câu hỏi để tránh câu hỏi bị thiếu nhãn.",
                    }} />
                  </div>
                  <Select value={topicId} onValueChange={setTopicId}>
                    <SelectTrigger><SelectValue placeholder="Chọn chủ đề" /></SelectTrigger>
                    <SelectContent>
                      {topics.map((topic) => <SelectItem key={topic.id} value={topic.id}>{topic.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {courseId && topics.length === 0 && <p className="text-xs text-yellow-600">Tạo một chủ đề trong Ngân hàng câu hỏi trước khi xuất bản câu hỏi được tạo.</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Số lượng câu hỏi</Label>
                  <Input value={numQuestions} onChange={(event) => setNumQuestions(sanitizeNumericInput(event.target.value))} />
                  {numQuestionsError && <p className="text-xs text-destructive">{numQuestionsError}</p>}
                </div>
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-1.5">
                    <Label>Độ khó</Label>
                    <ContextHelp content={{
                      description: "Mức độ khó mục tiêu cho câu hỏi AI sẽ tạo.",
                      usedBy: "Dùng khi muốn AI tạo câu hỏi dễ, trung bình, khó hoặc pha trộn.",
                      note: "Vẫn cần giảng viên đọc lại vì AI có thể ước lượng độ khó chưa sát.",
                    }} />
                  </div>
                  <Select value={targetDifficulty} onValueChange={setTargetDifficulty}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="easy">Dễ</SelectItem>
                      <SelectItem value="medium">Trung bình</SelectItem>
                      <SelectItem value="hard">Khó</SelectItem>
                      <SelectItem value="mixed">Kết hợp</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-1.5">
                    <Label>Loại câu hỏi</Label>
                    <ContextHelp content={{
                      description: "Dạng câu hỏi AI sẽ ưu tiên tạo từ tài liệu.",
                      usedBy: "Dùng khi cần sinh câu hỏi theo cấu trúc đề thi mong muốn.",
                      note: "Nếu chọn Mixed, giảng viên nên kiểm tra từng câu để đảm bảo đáp án và rubrics hợp lệ.",
                    }} />
                  </div>
                  <Select value={questionType} onValueChange={setQuestionType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MIXED">Kết hợp</SelectItem>
                      <SelectItem value="MULTIPLE_CHOICE">Trắc nghiệm nhiều lựa chọn</SelectItem>
                      <SelectItem value="TRUE_FALSE">Đúng / Sai</SelectItem>
                      <SelectItem value="SHORT_ANSWER">Trả lời ngắn</SelectItem>
                      <SelectItem value="ESSAY">Tự luận</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Định hướng của giảng viên (không bắt buộc)</Label>
                <Textarea value={focusTopics} onChange={(event) => setFocusTopics(event.target.value)} rows={2} placeholder="Ví dụ: tập trung vào câu hỏi ứng dụng, tránh câu hỏi chỉ ghi nhớ định nghĩa..." />
              </div>

              <div className="rounded-lg border border-yellow-200 bg-yellow-50/50 p-3 text-sm text-yellow-800 flex gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5" />
                Nội dung do AI tạo chỉ được lưu sau khi bạn duyệt. Đây là bước hỗ trợ giảng viên xem xét, không tự động xuất bản.
              </div>

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep("upload")}>Quay lại</Button>
                <Button onClick={startGeneration} className="gap-2"><Sparkles className="h-4 w-4" /> Tạo câu hỏi</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "generating" && (
          <Card>
            <CardContent className="py-12 text-center">
              <Loader2 className="h-12 w-12 text-primary animate-spin mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">AI đang tạo câu hỏi dựa trên tài liệu...</h3>
              <p className="text-sm text-muted-foreground mb-6">Đang chờ kết quả từ hàng đợi xử lý AI</p>
              <Progress value={65} className="max-w-md mx-auto" />
            </CardContent>
          </Card>
        )}

        {step === "review" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card><CardContent className="pt-4 pb-4 text-center"><p className="text-2xl font-semibold text-green-600">{approvedCount}</p><p className="text-xs text-muted-foreground">Đã duyệt</p></CardContent></Card>
              <Card><CardContent className="pt-4 pb-4 text-center"><p className="text-2xl font-semibold text-yellow-600">{pendingCount}</p><p className="text-xs text-muted-foreground">Chờ xem xét</p></CardContent></Card>
              <Card><CardContent className="pt-4 pb-4 text-center"><p className="text-2xl font-semibold text-red-600">{rejectedCount}</p><p className="text-xs text-muted-foreground">Đã từ chối</p></CardContent></Card>
            </div>

            <div className="flex justify-between items-center">
              <Button variant="outline" onClick={() => { setStep("configure"); setGenerated([]); }}>Tạo lại</Button>
              <Button onClick={saveApproved} disabled={approvedCount === 0 || saving} className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Lưu {approvedCount} vào ngân hàng câu hỏi
              </Button>
            </div>

            {generated.map((question, index) => (
              <Card key={question.id} className={question.approved === false ? "opacity-60" : ""}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono text-muted-foreground">#{index + 1}</span>
                      <StatusBadge tone="info">{question.type}</StatusBadge>
                      <StatusBadge variant={(question.difficulty || 0) < 0.4 ? "success" : (question.difficulty || 0) < 0.7 ? "warning" : "destructive"}>
                        {(question.difficulty || 0) < 0.4 ? "Dễ" : (question.difficulty || 0) < 0.7 ? "Trung bình" : "Khó"}
                      </StatusBadge>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="sm" onClick={() => setGenerated((items) => items.map((item) => item.id === question.id ? { ...item, approved: true } : item))} className="gap-1 text-green-600"><CheckCircle2 className="h-4 w-4" /> Duyệt</Button>
                      <Button variant="outline" size="sm" onClick={() => setGenerated((items) => items.map((item) => item.id === question.id ? { ...item, approved: false } : item))} className="gap-1 text-red-600"><XCircle className="h-4 w-4" /> Từ chối</Button>
                      <Button variant="ghost" size="sm" onClick={() => setGenerated((items) => items.filter((item) => item.id !== question.id))}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm font-medium break-words">{question.content}</p>
                  {question.options && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {Object.entries(question.options).map(([key, value]) => {
                        const correct = Object.values(question.correctAnswer || {}).includes(key) || Object.values(question.correctAnswer || {}).includes(value);
                        return (
                          <div key={key} className={`flex items-start gap-2 p-2 rounded border text-sm ${correct ? "border-green-500 bg-green-50" : "border-muted"}`}>
                            <Checkbox checked={correct} disabled />
                            <span className="font-medium text-muted-foreground shrink-0">{key}.</span>
                            <span className="min-w-0 break-words">{value}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {question.explanation && <p className="text-xs text-muted-foreground bg-secondary/50 rounded p-2 break-words">{question.explanation}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
