import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { findMostSimilarQuestion, snapQuestionDifficulty } from "../question-editor-utils";
import type { CourseOption, QuestionOption } from "../question-editor-types";
import type { ClarificationConfig } from "../components/QuestionClarificationDialog";
import type { BatchGeneratedQuestion } from "../components/QuestionBatchReviewDialog";
import { getUserAiConfig, UserAiConfig } from "@/lib/ai-key-storage";

export type GeneratedQuestion = {
  content: string;
  explanation?: string;
  difficulty?: number;
  topic?: string;
  learningObjective?: string;
  options?: Record<string, string> | null;
  correctAnswer?: { answer?: string; answers?: string[] } | null;
  points?: number;
  pairs?: Array<{ left?: string; right?: string }>;
  items?: string[];
};

type Params = {
  questionType: string;
  courseId: string;
  courses: CourseOption[];
  difficulty: number[];
  onContent: (value: string) => void;
  onExplanation: (value: string) => void;
  onDifficulty: (value: number[]) => void;
  onTopic: (value: string) => void;
  onLearningObjective: (value: string) => void;
  onOptions: (value: QuestionOption[]) => void;
  onEssayRubric: (value: string) => void;
};

const typeMap: Record<string, string> = {
  multiple_choice: "MULTIPLE_CHOICE",
  true_false: "TRUE_FALSE",
  essay: "ESSAY",
  fill_blank: "FILL_IN_BLANK",
  matching: "MATCHING",
  ordering: "ORDERING",
  find_error: "FIND_ERROR",
};

interface StoredActiveAiJob {
  jobId: string;
  prompt: string;
  questionCount: number;
  questionType: string;
  courseId: string;
  startedAt: number;
}

const STORAGE_KEY_ACTIVE_JOB = "examtrust:active-ai-gen-job";
const STORAGE_KEY_GRILLME = "examtrust:ai-grillme-enabled";

export function useQuestionAiGeneration(params: Params) {
  const [aiPrompt, setAiPrompt] = useState("");
  const [questionCount, setQuestionCount] = useState<number>(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiSimilarityWarning, setAiSimilarityWarning] = useState("");

  // Grill-me modal & state
  const [isGrillMeEnabled, setIsGrillMeEnabled] = useState(false);
  const [isGrillMeOpen, setIsGrillMeOpen] = useState(false);

  // Batch review modal & state
  const [isBatchReviewOpen, setIsBatchReviewOpen] = useState(false);
  const [batchQuestions, setBatchQuestions] = useState<BatchGeneratedQuestion[]>([]);

  // User AI Key state
  const [isApiKeyDialogOpen, setIsApiKeyDialogOpen] = useState(false);
  const [userAiConfig, setUserAiConfig] = useState<UserAiConfig | null>(null);

  useEffect(() => {
    setUserAiConfig(getUserAiConfig());
  }, []);

  const isRestoringRef = useRef(false);

  // Load Grill-me preference on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_GRILLME);
      if (saved !== null) {
        setIsGrillMeEnabled(saved === "true");
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  const toggleGrillMe = (enabled: boolean) => {
    setIsGrillMeEnabled(enabled);
    try {
      localStorage.setItem(STORAGE_KEY_GRILLME, String(enabled));
    } catch {
      // Ignore localStorage errors
    }
  };

  const applyGeneratedQuestion = (result: GeneratedQuestion) => {
    params.onContent(result.content || "");
    params.onExplanation(result.explanation || "");
    if (result.difficulty !== undefined && result.difficulty !== null) {
      params.onDifficulty([snapQuestionDifficulty(Math.max(0, Math.min(1, result.difficulty)))]);
    }
    if (result.topic) params.onTopic(result.topic);
    if (result.learningObjective) params.onLearningObjective(result.learningObjective);

    if (["multiple_choice", "true_false", "find_error"].includes(params.questionType)) {
      if (result.options && typeof result.options === "object") {
        const correctIds = Array.isArray((result.correctAnswer as any)?.answers)
          ? (result.correctAnswer as any).answers.map(String)
          : String(result.correctAnswer?.answer || "").split(",");
        params.onOptions(
          Object.entries(result.options).map(([id, text]) => ({
            id,
            text,
            isCorrect: correctIds.includes(id),
          })),
        );
      } else {
        params.onOptions([]);
      }
    } else if (params.questionType === "essay") {
      params.onEssayRubric(result.correctAnswer?.answer || "");
    } else if (params.questionType === "matching") {
      if (Array.isArray(result.pairs)) {
        params.onOptions(
          result.pairs.map((pair, index) => ({
            id: String.fromCharCode(65 + index),
            text: pair.left || "",
            match: pair.right || "",
            isCorrect: false,
          })),
        );
      } else {
        params.onOptions([]);
      }
    } else if (params.questionType === "ordering") {
      if (Array.isArray(result.items)) {
        params.onOptions(
          result.items.map((item, index) => ({
            id: String.fromCharCode(65 + index),
            text: item || "",
            isCorrect: false,
          })),
        );
      } else {
        params.onOptions([]);
      }
    } else {
      params.onOptions([]);
    }
  };

  const saveActiveJobToStorage = (job: StoredActiveAiJob) => {
    try {
      localStorage.setItem(STORAGE_KEY_ACTIVE_JOB, JSON.stringify(job));
    } catch {
      // Ignore
    }
  };

  const clearActiveJobFromStorage = () => {
    try {
      localStorage.removeItem(STORAGE_KEY_ACTIVE_JOB);
    } catch {
      // Ignore
    }
  };

  const cancelActiveJob = () => {
    clearActiveJobFromStorage();
    setIsGenerating(false);
    setActiveJobId(null);
    toast.info("Đã hủy theo dõi tiến trình tạo câu hỏi.");
  };

  // Check and restore unfinished AI job on mount
  useEffect(() => {
    if (isRestoringRef.current) return;
    isRestoringRef.current = true;

    const restoreSession = async () => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY_ACTIVE_JOB);
        if (!raw) return;

        const savedJob: StoredActiveAiJob = JSON.parse(raw);
        // If older than 10 minutes, expire it
        if (!savedJob?.jobId || Date.now() - savedJob.startedAt > 10 * 60 * 1000) {
          clearActiveJobFromStorage();
          return;
        }

        setIsGenerating(true);
        setActiveJobId(savedJob.jobId);
        if (savedJob.prompt) setAiPrompt(savedJob.prompt);
        if (savedJob.questionCount) setQuestionCount(savedJob.questionCount);

        toast.info("Đang kiểm tra và khôi phục tiến trình tạo câu hỏi trước đó...");

        const currentJob = await api.getQuestionAIGenerationJob(savedJob.jobId);
        const status = String(currentJob?.status || "").toUpperCase();

        if (status === "SUCCEEDED") {
          const output = currentJob?.output || {};
          handleJobSuccess(output, savedJob.questionCount, savedJob.courseId);
          clearActiveJobFromStorage();
          toast.success("Đã khôi phục thành công câu hỏi vừa tạo!");
        } else if (status === "FAILED" || status === "REJECTED") {
          clearActiveJobFromStorage();
          setIsGenerating(false);
          setActiveJobId(null);
          toast.error(`Tiến trình trước đó thất bại: ${currentJob?.errorMessage || "Không rõ lỗi"}`);
        } else {
          // Still QUEUED or RUNNING -> poll until finish
          try {
            const output = await api.pollAiJob<any>(savedJob.jobId);
            handleJobSuccess(output, savedJob.questionCount, savedJob.courseId);
            clearActiveJobFromStorage();
            toast.success("Tiến trình tạo câu hỏi đã hoàn tất thành công!");
          } catch (pollErr: any) {
            clearActiveJobFromStorage();
            setIsGenerating(false);
            setActiveJobId(null);
            toast.error(`Tạo bằng AI thất bại: ${pollErr?.message || "Hết thời gian chờ"}`);
          }
        }
      } catch (err) {
        console.error("Failed to restore AI generation session:", err);
        clearActiveJobFromStorage();
        setIsGenerating(false);
        setActiveJobId(null);
      }
    };

    void restoreSession();
  }, []);

  const handleJobSuccess = async (output: any, count: number, courseId: string) => {
    setIsGenerating(false);
    setActiveJobId(null);

    if (count > 1 || (Array.isArray(output?.questions) && output.questions.length > 0)) {
      // Batch mode
      const list: BatchGeneratedQuestion[] = (output?.questions || []).map((q: any) => ({
        content: q.content || "",
        type: q.type || params.questionType.toUpperCase(),
        difficulty: q.difficulty,
        explanation: q.explanation || "",
        points: q.points || 1,
        options: q.options || null,
        correctAnswer: q.correctAnswer || null,
      }));
      setBatchQuestions(list);
      setIsBatchReviewOpen(true);
      toast.success(`AI đã tạo xong ${list.length} câu hỏi. Đang mở danh sách xem trước.`);
    } else {
      // Single question mode
      const result: GeneratedQuestion = output as GeneratedQuestion;
      const backendType = typeMap[params.questionType] || "MULTIPLE_CHOICE";
      const duplicate = await findMostSimilarQuestion({
        courseId,
        backendType,
        generatedText: `${result.content} ${result.options ? Object.values(result.options).join(" ") : ""}`,
      });
      if (duplicate && duplicate.similarity >= 0.8) {
        const message = `Câu hỏi AI tạo quá giống câu hỏi hiện có (${Math.round(duplicate.similarity * 100)}%). Hãy đổi yêu cầu hoặc tạo lại.`;
        setAiSimilarityWarning(message);
        toast.error(message);
        return;
      }
      applyGeneratedQuestion(result);
      setAiPrompt("");
    }
  };

  const executeGeneration = async (customPrompt?: string) => {
    const finalPrompt = (customPrompt || aiPrompt).trim();
    if (!finalPrompt || isGenerating) return;
    if (!params.courseId) {
      setAiError("Hãy chọn học phần trước khi tạo câu hỏi bằng AI.");
      toast.error("Hãy chọn học phần trước khi tạo câu hỏi bằng AI.");
      return;
    }

    setIsGenerating(true);
    setAiError(null);
    setAiSimilarityWarning("");

    const backendType = typeMap[params.questionType] || "MULTIPLE_CHOICE";
    const selectedCourse = params.courses.find((course) => course.id === params.courseId);
    const activeConfig = getUserAiConfig();
    const userKeyContext = activeConfig?.apiKey
      ? {
          userApiKey: activeConfig.apiKey,
          userProvider: activeConfig.provider,
          userModel: activeConfig.model,
        }
      : {};

    try {
      if (questionCount > 1) {
        // Multi-question batch generation
        const job = await api.createAiExamQuestionsJob({
          prompt: finalPrompt,
          questionCount,
          difficulty: undefined,
          questionType: backendType,
          language: "vi",
          courseName: selectedCourse?.name,
          courseId: params.courseId,
          useCase: "question_bank",
          context: {
            courseId: params.courseId,
            courseName: selectedCourse?.name,
            courseCode: selectedCourse?.code,
            questionType: backendType,
            source: "question_editor_batch",
            ...userKeyContext,
          },
        });

        if (job?.jobId) {
          setActiveJobId(job.jobId);
          saveActiveJobToStorage({
            jobId: job.jobId,
            prompt: finalPrompt,
            questionCount,
            questionType: backendType,
            courseId: params.courseId,
            startedAt: Date.now(),
          });

          const output = await api.pollAiJob<any>(job.jobId);
          handleJobSuccess(output, questionCount, params.courseId);
          clearActiveJobFromStorage();
        }
      } else {
        // Single question generation
        const job = await api.createAiQuestionJob({
          prompt: finalPrompt,
          questionType: backendType,
          language: "vi",
          useCase: "question_bank",
          courseName: selectedCourse?.name,
          context: {
            courseId: params.courseId,
            courseName: selectedCourse?.name,
            courseCode: selectedCourse?.code,
            questionType: backendType,
            source: "question_editor_single",
            ...userKeyContext,
          },
        });

        if (job?.jobId) {
          setActiveJobId(job.jobId);
          saveActiveJobToStorage({
            jobId: job.jobId,
            prompt: finalPrompt,
            questionCount: 1,
            questionType: backendType,
            courseId: params.courseId,
            startedAt: Date.now(),
          });

          const output = await api.pollAiJob<any>(job.jobId);
          handleJobSuccess(output, 1, params.courseId);
          clearActiveJobFromStorage();
        }
      }
    } catch (error: any) {
      clearActiveJobFromStorage();
      const message = error?.message || "Không rõ lỗi";
      console.error("AI question generation failed:", error);
      setAiError(message);
      toast.error(`Tạo bằng AI thất bại: ${message}`);
    } finally {
      setIsGenerating(false);
      setActiveJobId(null);
    }
  };

  const handleTriggerGenerate = () => {
    if (!aiPrompt.trim() || isGenerating) return;
    if (!params.courseId) {
      setAiError("Hãy chọn học phần trước khi tạo câu hỏi bằng AI.");
      toast.error("Hãy chọn học phần trước khi tạo câu hỏi bằng AI.");
      return;
    }

    if (isGrillMeEnabled) {
      setIsGrillMeOpen(true);
    } else {
      void executeGeneration();
    }
  };

  const handleGrillMeConfirm = (config: ClarificationConfig) => {
    setIsGrillMeOpen(false);

    const bloomLabel =
      config.bloomLevel === "UNDERSTAND"
        ? "Nhận biết & Thông hiểu (khái niệm, định nghĩa)"
        : config.bloomLevel === "APPLY"
          ? "Vận dụng & Phân tích (tình huống, bài toán thực tế)"
          : "Đánh giá & So sánh (tối ưu hóa, so sánh đa giải pháp)";

    const styleLabel =
      config.style === "CONCEPTUAL"
        ? "Lý thuyết trực diện"
        : config.style === "SCENARIO"
          ? "Tình huống thực tế (Case study)"
          : "Đoạn code & Debugging";

    const distractorLabel =
      config.distractorDepth === "DIRECT"
        ? "Phương án nhiễu cơ bản, phân biệt rõ ràng"
        : config.distractorDepth === "COMMON_PITFALLS"
          ? "Cài cắm các bẫy logic và ngộ nhận phổ biến"
          : "Phương án gần đúng tinh vi, đòi hỏi hiểu bản chất sâu sắc";

    const enriched = [
      aiPrompt.trim(),
      `\n[Định hướng sư phạm Grill-me]:`,
      `- Thang nhận thức (Bloom): ${bloomLabel}`,
      `- Định dạng & Bối cảnh: ${styleLabel}`,
      `- Thiết kế phương án nhiễu: ${distractorLabel}`,
      `- Thời lượng dự kiến: ${config.timeEstimate}`,
      config.customNotes.trim() ? `- Ghi chú thêm từ giảng viên: ${config.customNotes.trim()}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    void executeGeneration(enriched);
  };

  const handleGrillMeSkip = () => {
    setIsGrillMeOpen(false);
    void executeGeneration();
  };

  const applyBatchQuestionSingle = (question: BatchGeneratedQuestion) => {
    applyGeneratedQuestion(question as GeneratedQuestion);
  };

  const saveBatchQuestionToBank = async (question: BatchGeneratedQuestion) => {
    if (!params.courseId) {
      throw new Error("Chưa chọn học phần.");
    }
    await api.saveQuestion({
      type: question.type,
      content: question.content,
      options: question.options || undefined,
      correctAnswer: question.correctAnswer || undefined,
      explanation: question.explanation,
      difficulty: question.difficulty,
      points: question.points || 1,
      courseId: params.courseId,
    });
  };

  const saveAllBatchQuestionsToBank = async (questions: BatchGeneratedQuestion[]) => {
    if (!params.courseId) {
      throw new Error("Chưa chọn học phần.");
    }
    for (const q of questions) {
      await saveBatchQuestionToBank(q);
    }
  };

  return {
    aiPrompt,
    setAiPrompt,
    questionCount,
    setQuestionCount,
    isGenerating,
    activeJobId,
    aiError,
    aiSimilarityWarning,
    isGrillMeEnabled,
    toggleGrillMe,
    isGrillMeOpen,
    setIsGrillMeOpen,
    isBatchReviewOpen,
    setIsBatchReviewOpen,
    batchQuestions,
    generate: handleTriggerGenerate,
    cancelActiveJob,
    handleGrillMeConfirm,
    handleGrillMeSkip,
    applyBatchQuestionSingle,
    saveBatchQuestionToBank,
    saveAllBatchQuestionsToBank,
    isApiKeyDialogOpen,
    setIsApiKeyDialogOpen,
    userAiConfig,
    setUserAiConfig,
  };
}
