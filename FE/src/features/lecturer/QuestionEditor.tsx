"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { api, ApiRequestError, unwrapPaginatedData } from "@/lib/api";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { HelpedTitle } from "@/components/common/ContextHelp";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RichTextEditor, type RichTextEditorRef } from "@/components/ui/rich-text-editor";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Save,
  Plus,
  Tag,
  Image,
  Music,
  Loader2,
  Sparkles,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { BackToDashboardButton } from "@/components/common/BackToDashboardButton";
import {
  QUESTION_DRAFT_STORAGE_KEY,
  loadQuestionEditorNavList,
  snapQuestionDifficulty,
} from "./question-editor-utils";
import type { EditableQuestion as Question, QuestionDraft } from "./question-editor-types";
import { useQuestionAnswerState } from "./hooks/useQuestionAnswerState";
import { useQuestionTopics } from "./hooks/useQuestionTopics";
import { useQuestionAiGeneration } from "./hooks/useQuestionAiGeneration";
import { useQuestionPersistence } from "./hooks/useQuestionPersistence";
import { FillBlankGuide, QuestionAnswerEditor } from "./components/QuestionAnswerEditor";
import { QuestionTopicDialog } from "./components/QuestionTopicDialog";
import { buildQuestionPayload, toEditorDifficulty, toEditorQuestionType } from "./question-editor-persistence";
import { QUESTION_LIMITS, WARNING_THRESHOLD } from "./question-validation.constants";
import { validateLineContent, lineContentCounterText } from "./question-validation";
import {
  MEDIA_ACCEPT,
  MEDIA_MAX_BYTES,
  releaseMediaUpload,
  uploadMediaFile,
  validateMediaFile,
  type MediaAttachment,
} from "./question-editor-media";

export default function QuestionEditor() {
  const router = useRouter();
  const pathname = usePathname();
  const basePath = pathname.startsWith("/admin")
    ? "/admin"
    : "/lecturer";
  const searchParams = useSearchParams();
  const questionId = searchParams.get("id");
  const courseCodeParam = searchParams.get("courseCode");
  const questionBankPath = courseCodeParam
    ? `${basePath}/question-bank?courseCode=${encodeURIComponent(courseCodeParam)}`
    : `${basePath}/question-bank`;
  const restoreDraftParam = searchParams.get("restoreDraft") === "1";

  // Ids of the questions the lecturer was browsing in the bank list right
  // before opening this one for editing (see saveQuestionEditorNavList) —
  // powers "Câu trước / Câu tiếp" so editing a batch doesn't require
  // bouncing back to the list between every question.
  const [navIds, setNavIds] = useState<string[]>([]);
  useEffect(() => {
    setNavIds(loadQuestionEditorNavList());
  }, []);
  const navIndex = questionId ? navIds.indexOf(questionId) : -1;
  const previousQuestionId = navIndex > 0 ? navIds[navIndex - 1] : null;
  const nextQuestionId = navIndex >= 0 && navIndex < navIds.length - 1 ? navIds[navIndex + 1] : null;
  const goToQuestion = (id: string) => {
    router.push(
      `${basePath}/question-editor?id=${id}${courseCodeParam ? `&courseCode=${encodeURIComponent(courseCodeParam)}` : ""}`,
    );
  };

  const [question, setQuestion] = useState<Question | null>(null);
  const [courses, setCourses] = useState<
    { id: string; code: string; name: string }[]
  >([]);

  // Question form state
  const [questionType, setQuestionType] = useState("multiple_choice");
  const [content, setContent] = useState("");
  const [explanation, setExplanation] = useState("");
  const [course, setCourse] = useState("");
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState([0.5]);
  const [scoreCoefficient, setScoreCoefficient] = useState("1");
  const [hasMedia, setHasMedia] = useState(false);
  const [mediaType, setMediaType] = useState<"image" | "audio">("image");
  const [mediaAttachment, setMediaAttachment] = useState<MediaAttachment | null>(null);
  const [mediaUploading, setMediaUploading] = useState(false);
  const mediaFileInputRef = useRef<HTMLInputElement | null>(null);
  // Tracks the mediaKey actually persisted on the question right now (null
  // for a brand-new question, or once the current attachment has never been
  // saved). Only a key that is NOT this one is safe to delete from R2
  // immediately — deleting the currently-saved key must wait for a
  // successful "Lưu" so the DB reference never dangles ahead of the save.
  const persistedMediaKeyRef = useRef<string | null>(null);
  const [learningObjective, setLearningObjective] = useState("");

  const answerState = useQuestionAnswerState();
  const {
    options, setOptions, multipleAnswers, setMultipleAnswers, pinnedOptions, setPinnedOptions,
    tfAnswer, setTfAnswer, essayRubric, setEssayRubric, restoreDraftAnswer, populateAnswer, validateAnswer,
    addOption, removeOption, updateOption, updateOptionMatch, moveOption, toggleCorrectOption,
    togglePinnedOption, resetAnswer,
  } = answerState;
  const topics = useQuestionTopics({
    courseId: course,
    selectedTopicId: topic,
    onSelectTopic: setTopic,
  });
  const ai = useQuestionAiGeneration({
    questionType, courseId: course, courses, difficulty,
    onContent: setContent, onExplanation: setExplanation, onDifficulty: setDifficulty,
    onTopic: setTopic, onLearningObjective: setLearningObjective, onOptions: setOptions,
    onEssayRubric: setEssayRubric,
  });
  const persistence = useQuestionPersistence();

  // Validation errors
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Autosave draft
  const contentRef = useRef<RichTextEditorRef | null>(null);

  const insertBlankAtCursor = () => {
    const editor = contentRef.current;
    if (!editor) return;
    const textarea = editor.getTextarea();
    if (!textarea) return;
    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? textarea.value.length;
    const before = content.slice(0, start);
    const after = content.slice(end);
    const insert = "[[]]";
    const newContent = before + insert + after;
    setContent(newContent);
    // focus and place cursor between the inner brackets
    const cursorPos = start + 2;
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(cursorPos, cursorPos);
    }, 0);
  };

  const handleMediaFile = async (file: File | null | undefined) => {
    if (!file) return;
    // While an attachment already exists, its type is locked — a replacement
    // must be the same type (Ảnh/Âm thanh toggle is disabled in that state).
    const effectiveType = mediaAttachment?.mediaType ?? mediaType;
    const validationError = validateMediaFile(file, effectiveType);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    const previous = mediaAttachment;
    setMediaUploading(true);
    try {
      const uploaded = await uploadMediaFile(file, effectiveType);
      setMediaAttachment(uploaded);
      // Only clean up the old object immediately if it was never saved to
      // this question — releasing the currently-saved one before "Lưu" is
      // confirmed would dangle the DB reference if the save never happens.
      if (previous && previous.mediaKey !== uploaded.mediaKey && previous.mediaKey !== persistedMediaKeyRef.current) {
        releaseMediaUpload(previous);
      }
      toast.success("Đã tải lên tệp đính kèm.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không thể tải tệp lên. Vui lòng thử lại.");
    } finally {
      setMediaUploading(false);
    }
  };

  const handleMediaToggle = (checked: boolean) => {
    setHasMedia(checked);
    if (!checked && mediaAttachment) {
      if (mediaAttachment.mediaKey !== persistedMediaKeyRef.current) {
        releaseMediaUpload(mediaAttachment);
      }
      setMediaAttachment(null);
    }
  };

  // Just switches which type the NEXT upload will be — never touches an
  // attachment that's already there. While an attachment exists, its type
  // is locked (buttons are disabled below); remove it first to switch type.
  const handleMediaTypeChange = (type: "image" | "audio") => {
    if (mediaAttachment) return;
    setMediaType(type);
  };

  const handleRemoveMediaAttachment = () => {
    if (mediaAttachment) {
      // Same rule as above: only delete right away if this file was never
      // saved on the question. Otherwise leave it in R2 — "Lưu" (via
      // publishDraft on the backend, which diffs against the DB's current
      // mediaKey) is what actually commits the removal and cleans it up.
      if (mediaAttachment.mediaKey !== persistedMediaKeyRef.current) {
        releaseMediaUpload(mediaAttachment);
      }
      setMediaAttachment(null);
    }
  };

  const saveDraft = (state: QuestionDraft) => {
    try {
      localStorage.setItem(QUESTION_DRAFT_STORAGE_KEY, JSON.stringify({
        ...state,
        savedAt: new Date().toISOString(),
      }));
    } catch (err) {
      console.error("Failed to save draft:", err);
    }
  };

  const loadDraft = () => {
    try {
      const draft = localStorage.getItem(QUESTION_DRAFT_STORAGE_KEY);
      if (draft) {
        const parsed = JSON.parse(draft);
        // Only restore if no existing question being edited
        if (!questionId && !question) {
          return parsed;
        }
      }
    } catch (err) {
      console.error("Failed to load draft:", err);
    }
    return null;
  };

  const restoreDraft = (draft: QuestionDraft) => {
    if (draft.content) setContent(draft.content);
    if (draft.explanation) setExplanation(draft.explanation);
    if (draft.course) setCourse(draft.course);
    if (draft.topic) setTopic(draft.topic);
    if (draft.difficulty) setDifficulty(draft.difficulty);
    if (draft.scoreCoefficient) setScoreCoefficient(draft.scoreCoefficient);
    if (draft.questionType) setQuestionType(draft.questionType);
    restoreDraftAnswer(draft);
    if (draft.learningObjective) setLearningObjective(draft.learningObjective);
    if (draft.hasMedia !== undefined) setHasMedia(draft.hasMedia);
    if (draft.mediaType) setMediaType(draft.mediaType);
  };

  // Load courses from API
  // Validation by question type
  const validateQuestion = (): boolean => {
    const errors: string[] = [];

    // Required fields
    if (!content.trim()) {
      errors.push("Cần nhập nội dung câu hỏi");
    } else if (content.length > QUESTION_LIMITS.content) {
      errors.push(`Nội dung câu hỏi không được vượt quá ${QUESTION_LIMITS.content.toLocaleString()} ký tự.`);
    }

    if (!course) {
      errors.push("Cần chọn học phần");
    }

    if (!/^[1-5]$/.test(scoreCoefficient)) {
      errors.push("Trọng số chỉ nhận số nguyên từ 1 - 5");
    }

    // Option length validation
    const filledOptions = options.filter((o) => o.text.trim());
    for (const opt of filledOptions) {
      if (opt.text.length > QUESTION_LIMITS.option) {
        errors.push(`Đáp án "${opt.id}" vượt quá ${QUESTION_LIMITS.option.toLocaleString()} ký tự. Mỗi đáp án không được vượt quá ${QUESTION_LIMITS.option.toLocaleString()} ký tự.`);
        break;
      }
    }

    // Explanation length
    if (explanation.length > QUESTION_LIMITS.explanation) {
      errors.push(`Giải thích không được vượt quá ${QUESTION_LIMITS.explanation.toLocaleString()} ký tự.`);
    }

    // Line content validation (find_error / ordering)
    if (questionType === "find_error" || questionType === "ordering") {
      const rawLines = options.map((o) => o.text).join("\n");
      const lineResult = validateLineContent(rawLines);
      errors.push(...lineResult.errors);
    }

    errors.push(...validateAnswer(questionType));

    if (hasMedia) {
      if (mediaUploading) {
        errors.push("Tệp đính kèm đang tải lên, vui lòng chờ hoàn tất.");
      } else if (!mediaAttachment) {
        errors.push("Cần chọn tệp đính kèm, hoặc tắt mục \"Đính kèm phương tiện\".");
      }
    }

    setValidationErrors(errors);
    return errors.length === 0;
  };

  useEffect(() => {
    const fetchCourses = async () => {
      try {
        const data = unwrapPaginatedData(await api.getCourses());
        const mapped = data.map((c: any) => ({
          id: c.id,
          code: c.code,
          name: c.name,
        }));
        setCourses(mapped);
        // Pre-select course from URL param
        if (courseCodeParam && !course) {
          const found = mapped.find((c: any) => c.code === courseCodeParam);
          if (found) setCourse(found.id);
        }
      } catch (err) {
        console.error("Failed to fetch courses:", err);
      }
    };
    fetchCourses();
  }, []);

  // Load question data if editing existing question
  useEffect(() => {
    if (questionId) {
      loadQuestion();
    } else if (restoreDraftParam) {
      const draft = loadDraft();
      if (draft) {
        restoreDraft(draft);
        toast.success("Đã khôi phục bản nháp câu hỏi.");
      } else {
        toast.info("Không tìm thấy bản nháp câu hỏi.");
      }
    }
  }, [questionId, restoreDraftParam]);

  // Autosave draft on every form change
  useEffect(() => {
    if (!questionId) {
      const hasDraftContent =
        content.trim() ||
        explanation.trim() ||
        options.some((option) => option.text.trim()) ||
        essayRubric.trim() ||
        learningObjective.trim();

      if (!hasDraftContent) return;

      const timer = setTimeout(() => {
        saveDraft({
          content,
          explanation,
          course,
          topic,
          difficulty,
          questionType,
          options,
          multipleAnswers,
          tfAnswer,
          essayRubric,
          scoreCoefficient,
          learningObjective,
          hasMedia,
          mediaType,
        });
      }, 1000); // Save 1 second after last change
      return () => clearTimeout(timer);
    }
  }, [
    content,
    explanation,
    course,
    topic,
    difficulty,
    questionType,
    options,
    multipleAnswers,
    tfAnswer,
    essayRubric,
    scoreCoefficient,
    learningObjective,
    hasMedia,
    mediaType,
    questionId,
  ]);

  // Load question data if editing existing question
  useEffect(() => {
    if (questionId) {
      loadQuestion();
    }
  }, [questionId]);

  const loadQuestion = async () => {
    if (!questionId) return;

    // Clears leftovers from whatever question was open before — navigating
    // via Câu trước/Câu tiếp keeps this same component mounted (same route,
    // only the `id` query param changes) instead of a fresh page load, so
    // stale validation errors or an old AI prompt would otherwise carry over.
    setValidationErrors([]);
    ai.setAiPrompt("");

    try {
      const questionData = await persistence.load(questionId);
      setQuestion(questionData);
      populateForm(questionData);
    } catch (error) {
      console.error("Failed to load question:", error);
    }
  };

  const populateForm = (questionData: Question) => {
    setQuestionType(toEditorQuestionType(questionData.type));

    setContent(questionData.content);
    setExplanation(questionData.explanation || "");
    setCourse(questionData.course?.id || "");
    setTopic(questionData.topic?.id || "");
    setDifficulty([snapQuestionDifficulty(toEditorDifficulty(questionData.difficulty))]);
    setScoreCoefficient(String(questionData.defaultPoints ?? questionData.points ?? 1));

    populateAnswer(questionData);

    setLearningObjective(questionData.learningObjectives || "");

    if (questionData.mediaUrl && questionData.mediaKey && questionData.mediaType) {
      setHasMedia(true);
      setMediaType(questionData.mediaType);
      setMediaAttachment({
        mediaUrl: questionData.mediaUrl,
        mediaKey: questionData.mediaKey,
        mediaSizeBytes: questionData.mediaSizeBytes ?? 0,
        mediaType: questionData.mediaType,
      });
      persistedMediaKeyRef.current = questionData.mediaKey;
    } else {
      setHasMedia(false);
      setMediaAttachment(null);
      persistedMediaKeyRef.current = null;
    }
  };

  const resetFormForNextQuestion = () => {
    setContent("");
    setExplanation("");
    setDifficulty([0.5]);
    setScoreCoefficient("1");
    setHasMedia(false);
    setMediaType("image");
    setMediaAttachment(null);
    persistedMediaKeyRef.current = null;
    setLearningObjective("");
    setValidationErrors([]);
    resetAnswer();
    ai.setAiPrompt("");
    localStorage.removeItem(QUESTION_DRAFT_STORAGE_KEY);
  };

  const handleSave = async (addAnother = false) => {
    let payload;
    try {
      if (!validateQuestion()) {
        toast.error("Vui lòng kiểm tra lại các trường bị lỗi bên dưới.");
        return;
      }
      payload = buildQuestionPayload({
        questionType, multipleAnswers, content, explanation, difficulty, scoreCoefficient,
        tfAnswer, essayRubric, options,
        media: hasMedia ? mediaAttachment : null,
      });
      await persistence.save({ questionId, courseId: course, topicId: topic, payload });
      // The save just committed this as the question's saved attachment (or
      // cleared it) — from now on this key is the one BE-side removal logic
      // owns; further FE-side removes/replaces are eager-cleanup-eligible
      // again once a NEW upload/removal happens on top of it.
      persistedMediaKeyRef.current = hasMedia ? (mediaAttachment?.mediaKey ?? null) : null;
      localStorage.removeItem(QUESTION_DRAFT_STORAGE_KEY);
      if (addAnother && !questionId) {
        toast.success("Đã thêm câu hỏi.");
        resetFormForNextQuestion();
        return;
      }
      if (questionId) {
        toast.success("Đã lưu câu hỏi.");
        return;
      }
      router.push(questionBankPath);
    } catch (error) {
      console.warn("Failed to save question:", error);
      toast.error(error instanceof ApiRequestError ? error.message : "Không thể lưu câu hỏi. Vui lòng thử lại.");
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto px-3 sm:px-0">
        {/* <BackToDashboardButton to={basePath} className="mb-2 -ml-2" /> */}

        <div className="mb-3 sm:mb-4 flex flex-wrap items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="gap-2 text-muted-foreground -ml-2"
            onClick={() => router.push(questionBankPath)}
          >
            <ArrowLeft className="h-4 w-4" />{" "}
            <span className="hidden sm:inline">Quay lại ngân hàng câu hỏi</span>
            <span className="sm:hidden">Quay lại</span>
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-0 mb-4 sm:mb-6">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-semibold text-foreground mb-1">
              {persistence.loading
                ? "Đang tải..."
                : questionId
                  ? "Sửa câu hỏi"
                  : "Câu hỏi mới"}
            </h1>
            <p className="text-sm text-muted-foreground break-words">
              {(() => {
                const currentCourse = courses.find((c) => c.id === course);
                if (currentCourse)
                  return (
                    <span>
                      Học phần:{" "}
                      <span className="font-semibold text-foreground">
                        {currentCourse.code} — {currentCourse.name}
                      </span>
                    </span>
                  );
                if (courseCodeParam)
                  return (
                    <span>
                      Học phần:{" "}
                      <span className="font-semibold text-foreground">
                        {courseCodeParam}
                      </span>
                    </span>
                  );
                return questionId
                  ? "Sửa câu hỏi đã có"
                  : "Tạo câu hỏi mới";
              })()}
            </p>
          </div>
          <div className="flex gap-2 sm:flex-shrink-0">
            {!persistence.loading && (
              <>
                <Button
                  onClick={() => handleSave(false)}
                  disabled={persistence.saving}
                  size="sm"
                  variant="outline"
                  className="gap-1.5 flex-1 sm:flex-initial"
                >
                  {persistence.saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  <span className="hidden xs:inline">Lưu</span>
                  <span className="xs:hidden">Lưu</span>
                </Button>
                {!questionId && (
                  <Button
                    onClick={() => handleSave(true)}
                    disabled={persistence.saving}
                    size="sm"
                    variant="default"
                    className="gap-1.5 flex-1 sm:flex-initial"
                  >
                    {persistence.saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    <span className="hidden xs:inline">Lưu và thêm câu khác</span>
                    <span className="xs:hidden">Lưu và thêm</span>
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Validation Errors */}
        {validationErrors.length > 0 && (
          <div className="mb-4 p-3 sm:p-4 bg-destructive/10 border border-destructive/30 rounded-lg">
            <p className="text-sm font-semibold text-destructive mb-2">
              ⚠️ Vui lòng sửa các lỗi sau trước khi lưu:
            </p>
            <ul className="space-y-1">
              {validationErrors.map((error, idx) => (
                <li key={idx} className="text-sm text-destructive flex items-start gap-2">
                  <span className="mt-0.5">•</span>
                  <span>{error}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {persistence.loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2 text-muted-foreground">
              Đang tải dữ liệu câu hỏi...
            </span>
          </div>
        ) : (
          <div>
            {/* === EDIT MODE === */}
            <div>
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-6 items-start">
                {/* ── LEFT: Question Editor ── */}
                <div className="min-w-0 space-y-4 sm:space-y-6">
                  {/* AI Generator Section */}
                  <Card className="border-primary/20 bg-primary/5">
                    <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6 pt-3 sm:pt-6">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                        <CardTitle className="text-sm sm:text-base font-semibold text-primary">
                          Trợ lý AI
                        </CardTitle>
                      </div>
                      <CardDescription className="text-xs sm:text-sm">
                        Tạo nội dung bằng AI
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 sm:space-y-4 px-3 sm:px-6 pb-3 sm:pb-6">
                      <div className="flex flex-col sm:flex-row gap-2">
                        <Input
                          placeholder="Ví dụ: Hệ thống phân tán, Raft và Paxos..."
                          value={ai.aiPrompt}
                          onChange={(e) => ai.setAiPrompt(e.target.value)}
                          className="flex-1 bg-background text-sm"
                          onKeyDown={(e) =>
                            e.key === "Enter" && ai.generate()
                          }
                        />
                        <Button
                          onClick={ai.generate}
                          disabled={ai.isGenerating || !ai.aiPrompt.trim() || !course}
                          className="h-11 w-full gap-2 sm:w-auto"
                          title={!course ? "Chọn học phần để dùng tính năng tạo bằng AI" : ""}
                        >
                          {ai.isGenerating ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Wand2 className="h-4 w-4" />
                          )}
                          Tạo
                        </Button>
                      </div>
                      {!course && (
                        <p className="text-[10px] text-amber-600 font-medium px-1">
                          ⚠️ Chọn học phần ở cột bên phải để bật tạo câu hỏi bằng AI.
                        </p>
                      )}
                      <p className="text-[10px] text-muted-foreground italic px-1">
                        * Nội dung do AI tạo sẽ được chèn vào ô soạn để bạn xem lại trước khi lưu.
                      </p>
                      {ai.aiSimilarityWarning && (
                        <p className="text-[10px] text-red-600 font-medium px-1">
                          {ai.aiSimilarityWarning}
                        </p>
                      )}
                      {ai.aiError && (
                        <p className="text-[10px] text-red-600 font-medium px-1">
                          ❌ {ai.aiError}
                        </p>
                      )}
                    </CardContent>
                  </Card>

                  {/* Question Type */}
                  <Card>
                    <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6 pt-3 sm:pt-6">
                      <CardTitle className="text-sm sm:text-base">
                        <HelpedTitle help={{
                          description: "Xác định cách sinh viên sẽ trả lời câu hỏi, ví dụ trắc nghiệm, đúng/sai, điền khuyết hoặc tự luận.",
                          usedBy: "Giảng viên chọn khi tạo hoặc chỉnh sửa câu hỏi để hệ thống hiển thị đúng form nhập liệu và cách chấm.",
                          note: "Đổi loại câu hỏi có thể làm thay đổi cấu trúc phương án trả lời, nên kiểm tra lại đáp án đúng trước khi lưu.",
                        }}>
                          Loại câu hỏi
                        </HelpedTitle>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
                      <Select
                        value={questionType}
                        onValueChange={(val) => {
                          setQuestionType(val);
                          setPinnedOptions(new Set());
                        }}
                      >
                        <SelectTrigger className="w-full sm:w-[240px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="multiple_choice">
                            Trắc nghiệm nhiều lựa chọn
                          </SelectItem>
                          <SelectItem value="true_false">
                            Đúng / Sai
                          </SelectItem>
                          <SelectItem value="fill_blank">
                            Điền vào chỗ trống
                          </SelectItem>
                          <SelectItem value="matching">Ghép đôi</SelectItem>
                          <SelectItem value="find_error">
                            Tìm lỗi sai
                          </SelectItem>
                          <SelectItem value="ordering">
                            Sắp xếp theo thứ tự
                          </SelectItem>
                          <SelectItem value="essay">
                            Trả lời ngắn / Tự luận
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6 pt-3 sm:pt-6">
                      <CardTitle className="text-sm sm:text-base">Trọng số</CardTitle>
                      <CardDescription className="text-xs sm:text-sm">
                        Giá trị gợi ý khi thêm câu vào đề; trọng số trong đề có thể chỉnh riêng và kết quả luôn quy về thang 10.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
                      <div className="space-y-2">
                        <Label htmlFor="score-coefficient" className="text-sm">Trọng số mặc định</Label>
                        <Input
                          id="score-coefficient"
                          type="number"
                          min={1}
                          max={5}
                          step={1}
                          inputMode="numeric"
                          value={scoreCoefficient}
                          onChange={(event) => setScoreCoefficient(event.target.value.replace(/[^0-9]/g, ""))}
                          className="w-28"
                        />
                        <p className="text-xs text-muted-foreground">Chỉ nhận số nguyên từ 1 - 5.</p>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Question Content */}
                  <Card>
                    <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6 pt-3 sm:pt-6">
                      <CardTitle className="text-sm sm:text-base">
                        Nội dung câu hỏi
                      </CardTitle>
                      <CardDescription className="text-xs sm:text-sm">
                        Nhập nội dung câu hỏi
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 sm:space-y-4 px-3 sm:px-6 pb-3 sm:pb-6">
                      {questionType === "multiple_choice" && (
                        <div className="mb-3 sm:mb-4 p-2 sm:p-3 bg-blue-50 border border-blue-200 rounded-lg">
                          <p className="text-xs sm:text-sm text-blue-800 font-medium mb-0.5 sm:mb-1">
                            💡 Cách chọn đáp án đúng:
                          </p>
                          <p className="text-[11px] sm:text-xs text-blue-700">
                            {multipleAnswers
                              ? "Nhấn vào các nút tròn (A, B, C, D) để đánh dấu nhiều đáp án đúng"
                              : "Nhấn vào các nút tròn (A, B, C, D) để chọn một đáp án đúng"}
                          </p>
                        </div>
                      )}
                      {questionType === "true_false" && (
                        <div className="mb-3 sm:mb-4 p-2 sm:p-3 bg-green-50 border border-green-200 rounded-lg">
                          <p className="text-xs sm:text-sm text-green-800 font-medium mb-0.5 sm:mb-1">
                            💡 Cách chọn đáp án đúng:
                          </p>
                          <p className="text-[11px] sm:text-xs text-green-700">
                            Nhấn vào nút "Đúng" hoặc "Sai" bên dưới để đặt đáp
                            án đúng
                          </p>
                        </div>
                      )}
                      <div className="space-y-1.5 sm:space-y-2">
                        <Label htmlFor="content" className="text-sm">
                          Nội dung câu hỏi
                        </Label>

                        {/* Insert fill-in-the-blank helper into Question Content for better discoverability */}
                        {questionType === "fill_blank" ? <FillBlankGuide /> : null}
                        <RichTextEditor
                          ref={contentRef}
                          id="content"
                          placeholder="Nhập nội dung câu hỏi tại đây..."
                          value={content}
                          onChange={(val) => setContent(val)}
                          rows={4}
                          extraActions={
                            questionType === "fill_blank" ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={insertBlankAtCursor}
                                className="h-7 gap-1 px-2.5 text-xs font-medium text-primary hover:bg-primary/10 border-primary/30"
                              >
                                <Plus className="h-3.5 w-3.5" /> Thêm chỗ trống
                              </Button>
                            ) : null
                          }
                        />
                        <p className={`mt-1 text-xs ${content.length >= QUESTION_LIMITS.content * WARNING_THRESHOLD ? (content.length > QUESTION_LIMITS.content ? "text-destructive" : "text-amber-600") : "text-muted-foreground"}`}>
                          {content.length.toLocaleString()} / {QUESTION_LIMITS.content.toLocaleString()} ký tự
                        </p>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={hasMedia}
                            onCheckedChange={handleMediaToggle}
                          />
                          <Label>Đính kèm phương tiện</Label>
                        </div>
                        {hasMedia && (() => {
                          const lockedType = mediaAttachment?.mediaType ?? mediaType;
                          return (
                            <div className="flex gap-2">
                              <Button
                                variant={lockedType === "image" ? "default" : "outline"}
                                size="sm"
                                disabled={!!mediaAttachment}
                                onClick={() => handleMediaTypeChange("image")}
                                className="gap-1"
                              >
                                <Image className="h-3.5 w-3.5" /> Ảnh
                              </Button>
                              <Button
                                variant={lockedType === "audio" ? "default" : "outline"}
                                size="sm"
                                disabled={!!mediaAttachment}
                                onClick={() => handleMediaTypeChange("audio")}
                                className="gap-1"
                              >
                                <Music className="h-3.5 w-3.5" /> Âm thanh
                              </Button>
                              {mediaAttachment && (
                                <p className="text-[10px] text-muted-foreground self-center">
                                  Xoá tệp để đổi loại đính kèm
                                </p>
                              )}
                            </div>
                          );
                        })()}
                      </div>

                      {hasMedia && (
                        <div
                          className="border-2 border-dashed border-muted rounded-lg p-6 text-center"
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault();
                            void handleMediaFile(e.dataTransfer.files?.[0]);
                          }}
                        >
                          <input
                            ref={mediaFileInputRef}
                            type="file"
                            accept={MEDIA_ACCEPT[mediaAttachment?.mediaType ?? mediaType]}
                            className="hidden"
                            onChange={(e) => {
                              void handleMediaFile(e.target.files?.[0]);
                              e.target.value = "";
                            }}
                          />
                          {mediaAttachment ? (
                            <div className="space-y-2">
                              {mediaAttachment.mediaType === "image" ? (
                                <img
                                  src={mediaAttachment.mediaUrl}
                                  alt="Xem trước tệp đính kèm"
                                  className="mx-auto max-h-32 rounded-md object-contain"
                                />
                              ) : (
                                <audio src={mediaAttachment.mediaUrl} controls className="mx-auto" />
                              )}
                              <p className="text-xs text-muted-foreground">
                                {(mediaAttachment.mediaSizeBytes / 1024).toFixed(0)} KB
                              </p>
                              <div className="flex justify-center gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={mediaUploading}
                                  onClick={() => mediaFileInputRef.current?.click()}
                                >
                                  Chọn tệp khác
                                </Button>
                                <Button variant="ghost" size="sm" onClick={handleRemoveMediaAttachment}>
                                  Xoá
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <p className="text-sm text-muted-foreground">
                                Kéo thả{" "}
                                {mediaType === "image"
                                  ? "một hình ảnh"
                                  : "một tệp âm thanh"}{" "}
                                vào đây, hoặc nhấn để chọn tệp
                              </p>
                              <p className="text-[11px] text-muted-foreground mt-1">
                                {mediaType === "image"
                                  ? `Tối đa ${MEDIA_MAX_BYTES.image / (1024 * 1024)}MB, PNG/JPEG/WEBP`
                                  : `Tối đa ${MEDIA_MAX_BYTES.audio / (1024 * 1024)}MB, MP3/WAV`}
                              </p>
                              <Button
                                variant="outline"
                                size="sm"
                                className="mt-2"
                                disabled={mediaUploading}
                                onClick={() => mediaFileInputRef.current?.click()}
                              >
                                {mediaUploading ? (
                                  <>
                                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> Đang tải lên...
                                  </>
                                ) : (
                                  "Chọn tệp"
                                )}
                              </Button>
                            </>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <QuestionAnswerEditor
                    questionType={questionType}
                    options={options}
                    multipleAnswers={multipleAnswers}
                    tfAnswer={tfAnswer}
                    essayRubric={essayRubric}
                    pinnedOptions={pinnedOptions}
                    onMultipleAnswersChange={setMultipleAnswers}
                    onTfAnswerChange={setTfAnswer}
                    onEssayRubricChange={setEssayRubric}
                    onAddOption={addOption}
                    onRemoveOption={removeOption}
                    onUpdateOption={updateOption}
                    onReplaceOptions={setOptions}
                    onUpdateMatch={updateOptionMatch}
                    onMoveOption={moveOption}
                    onToggleCorrect={toggleCorrectOption}
                    onTogglePinned={togglePinnedOption}
                  />

                  {/* Explanation */}
                  <Card>
                    <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6 pt-3 sm:pt-6">
                      <CardTitle className="text-sm sm:text-base">
                        Giải thích (không bắt buộc)
                      </CardTitle>
                      <CardDescription className="text-xs sm:text-sm">
                        Hiển thị cho sinh viên sau khi trả lời
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
                      <Textarea
                        placeholder="Giải thích tại sao đáp án đúng lại đúng..."
                        value={explanation}
                        onChange={(e) => setExplanation(e.target.value)}
                        rows={3}
                        className="text-sm resize-none"
                      />
                      <p className={`mt-1 text-xs ${explanation.length >= QUESTION_LIMITS.explanation * WARNING_THRESHOLD ? (explanation.length > QUESTION_LIMITS.explanation ? "text-destructive" : "text-amber-600") : "text-muted-foreground"}`}>
                        {explanation.length.toLocaleString()} / {QUESTION_LIMITS.explanation.toLocaleString()} ký tự
                      </p>
                    </CardContent>
                  </Card>
                </div>
                {/* end left column */}

                {/* ── RIGHT: Metadata Sidebar ── */}
                <div className="space-y-4 sm:space-y-6 lg:sticky lg:top-[4.5rem]">
                  {/* Course - Required */}
                  <Card>
                    <CardHeader className="pb-2 px-4 pt-4">
                      <CardTitle className="text-sm">
                        Học phần <span className="text-red-500">*</span>
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Cần chọn để phân loại câu hỏi và bật tạo bằng AI.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 px-4 pb-4">
                      <Select value={course} onValueChange={setCourse}>
                        <SelectTrigger className={`text-sm ${!course ? "border-red-300 bg-red-50" : ""}`}>
                          <SelectValue placeholder="Chọn học phần..." />
                        </SelectTrigger>
                        <SelectContent>
                          {courses.map((c) => (
                            <SelectItem
                              key={c.id}
                              value={c.id}
                              className="text-sm"
                            >
                              {c.code} - {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {!course && (
                        <p className="text-[10px] text-red-600 font-medium">
                          ⚠️ Cần chọn học phần để lưu câu hỏi.
                        </p>
                      )}
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">
                          <HelpedTitle help={{
                            description: "Gắn câu hỏi vào một nhóm kiến thức cụ thể trong khóa học.",
                            usedBy: "Dùng khi lọc ngân hàng câu hỏi, sinh đề theo chủ đề và xem phân tích chủ đề yếu sau bài thi.",
                            note: "Nên chọn chủ đề đủ cụ thể để báo cáo phân tích có ý nghĩa hơn.",
                          }}>
                            Chủ đề
                          </HelpedTitle>
                        </Label>
                        <Button
                          variant="outline"
                          onClick={() => topics.setShowTopicDialog(true)}
                          disabled={!course}
                          className="w-full justify-start text-left font-normal"
                        >
                          {topic
                            ? topics.availableTopics.find((t: any) => t.id === topic)?.name || "Chủ đề không xác định"
                            : "Chọn hoặc tạo chủ đề..."}
                        </Button>
                        {!course && (
                          <p className="text-[10px] text-amber-600">
                            Chọn học phần trước để chọn chủ đề.
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Difficulty - Button Group */}
                  <Card>
                    <CardHeader className="pb-2 px-4 pt-4">
                      <CardTitle className="text-sm">
                        <HelpedTitle help={{
                          description: "Mức độ khó dự kiến của câu hỏi, thường dùng để cân bằng đề giữa dễ, trung bình và khó.",
                          usedBy: "Giảng viên dùng khi tạo đề; hệ thống dùng để lọc, thống kê và phân tích chất lượng câu hỏi.",
                          note: "Độ khó thực tế có thể được điều chỉnh lại sau khi có dữ liệu bài làm của sinh viên.",
                        }}>
                          Độ khó
                        </HelpedTitle>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          className={`flex-1 text-sm ${
                            difficulty[0] <= 0.4
                              ? "border-success bg-success text-success-foreground hover:bg-success/90"
                              : "border-success/30 text-success hover:bg-success/10"
                          }`}
                          onClick={() => setDifficulty([0.3])}
                        >
                          Dễ
                        </Button>
                        <Button
                          variant="outline"
                          className={`flex-1 text-sm ${
                            difficulty[0] > 0.4 && difficulty[0] < 0.6
                              ? "border-warning bg-warning text-warning-foreground hover:bg-warning/90"
                              : "border-warning/35 text-warning hover:bg-warning/10"
                          }`}
                          onClick={() => setDifficulty([0.5])}
                        >
                          Trung bình
                        </Button>
                        <Button
                          variant="outline"
                          className={`flex-1 text-sm ${
                            difficulty[0] >= 0.6
                              ? "border-destructive bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              : "border-destructive/35 text-destructive hover:bg-destructive/10"
                          }`}
                          onClick={() => setDifficulty([0.7])}
                        >
                          Khó
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Difficulty card remains above. The Allow multiple answers toggle
                      should always appear inside the Answer Options card below; removed
                      the separate card here. */}

                  {questionId && navIndex >= 0 && (
                    <Card>
                      <CardHeader className="pb-2 px-4 pt-4">
                        <CardTitle className="text-sm">Chuyển câu hỏi</CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 pb-4">
                        <div className="flex items-center justify-between gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1"
                            disabled={!previousQuestionId}
                            onClick={() => previousQuestionId && goToQuestion(previousQuestionId)}
                          >
                            <ChevronLeft className="h-4 w-4" /> Câu trước
                          </Button>
                          <span className="rounded-full border bg-muted px-2.5 py-1 text-xs font-medium text-foreground whitespace-nowrap">
                            Câu {navIndex + 1}/{navIds.length}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1"
                            disabled={!nextQuestionId}
                            onClick={() => nextQuestionId && goToQuestion(nextQuestionId)}
                          >
                            Câu tiếp <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
                {/* end metadata sidebar */}
              </div>
              {/* end grid */}
            
            </div>
          </div>
        )}

        <QuestionTopicDialog
          open={topics.showTopicDialog}
          selectedTopicId={topic}
          newTopicName={topics.newTopicName}
          topicDescription={topics.topicDescription}
          topicSearch={topics.topicSearch}
          topics={topics.filteredTopics}
          suggestions={topics.topicSuggestions}
          checkingSimilarity={topics.checkingTopicSimilarity}
          creatingTopic={topics.creatingTopic}
          checkMessage={topics.topicCheckMessage}
          onNewTopicNameChange={topics.setNewTopicName}
          onTopicDescriptionChange={topics.setTopicDescription}
          onTopicSearchChange={topics.setTopicSearch}
          onClose={topics.closeTopicDialog}
          onSelect={topics.selectTopic}
          onCreate={topics.createTopic}
          onCheckSimilarity={topics.checkSimilarTopics}
        />
      </div>
    </DashboardLayout>
  );
}




