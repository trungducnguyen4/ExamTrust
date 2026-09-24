"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { DurationInput } from "@/components/common/DurationInput";
import { TimePickerVi } from "@/components/common/TimePickerVi";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import api, { unwrapPaginatedData } from "@/lib/api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Users,
  Shield,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Check,
  Plus,
  FileText,
  Eye,
  Sparkles,
  Wand2,
  FileCheck,
  Database,
  Loader2,
  Image,
  Music,
  Camera,
  Monitor,
} from "lucide-react";
import { toast } from "sonner";
import { BackToDashboardButton } from "@/components/common/BackToDashboardButton";
import { useQuestionAnswerState } from "./hooks/useQuestionAnswerState";
import { useQuestionTopics } from "./hooks/useQuestionTopics";
import { FillBlankGuide, QuestionAnswerEditor } from "./components/QuestionAnswerEditor";
import { QuestionTopicDialog } from "./components/QuestionTopicDialog";
import { buildQuestionPayload } from "./question-editor-persistence";
import { findMostSimilarQuestion } from "./question-editor-utils";
import {
  MEDIA_ACCEPT,
  MEDIA_MAX_BYTES,
  releaseMediaUpload,
  uploadMediaFile,
  validateMediaFile,
  type MediaAttachment,
} from "./question-editor-media";
import {
  getNumericInputError,
  parseNumericInput,
  sanitizeNumericInput,
} from "@/lib/number-input";
import {
  COURSE_TERM_OPTIONS,
  formatCourseTerm,
  getAcademicYearOptions,
  type CourseTerm,
} from "@/lib/course-term";
import { cn } from "@/lib/utils";
import {
  GRADING_STRATEGY_OPTIONS,
  QUESTION_TYPE_OPTIONS,
  STEPS,
  WHOLE_COURSE_LABEL,
  buildReviewSettingsPayload,
  createDefaultForm,
  createDefaultReviewSettingsDraft,
  difficultyLabelFromValue,
  difficultyLabelViFromValue,
  difficultyOptionToBankValue,
  getGradingStrategyLabel,
  difficultyOptionToValue,
  getDefaultExamWindow,
  mapQuestionTypeToAiApi,
  mapQuestionTypeToDb,
  normalizeDifficultyForQuestion,
  normalizeReviewSettingsDraft,
  pad2,
  toDateInputValue,
  toTimeInputValue,
  type BankQuestionOption,
  type BankTopic,
  type CourseOption,
  type ExamForm,
  type QuestionSourceMode,
  type ReviewSettingsDraft,
  type Step,
} from "./create-exam-model";

// Shared "icon + title (with hover help) + Switch" row used across the
// settings step — factored out so every toggle group gets the same
// border/padding/spacing instead of each call site re-typing it slightly
// differently.
function SettingToggleRow({
  icon,
  title,
  help,
  checked,
  onCheckedChange,
  disabled,
}: {
  icon: ReactNode;
  title: ReactNode;
  help: Parameters<typeof HelpedTitle>[0]["help"];
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
      <div className="flex items-center gap-3">
        {icon}
        <div className="text-sm font-medium">
          <HelpedTitle help={help}>{title}</HelpedTitle>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </div>
  );
}

// Label-on-top / value-below tile used in the "Xem trước" step — stacking
// avoids the ragged misalignment a same-row label+value layout gets once
// values vary wildly in length (a 1-word value next to a 2-line one).
function PreviewField({
  label,
  value,
  highlight,
}: {
  label: ReactNode;
  value: ReactNode;
  highlight?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={highlight ? "text-base font-semibold text-primary" : "text-sm font-medium"}>{value}</p>
    </div>
  );
}

export default function CreateExam() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("info");
  const [form, setForm] = useState<ExamForm>(() => createDefaultForm());
  const [editingExamId, setEditingExamId] = useState<string | null>(null);
  const [isLoadingDraftExam, setIsLoadingDraftExam] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [created, setCreated] = useState(false);
  const [isStandardizing, setIsStandardizing] = useState(false);
  const [docFile, setDocFile] = useState<File | null>(null);
  const docFileInputRef = useRef<HTMLInputElement | null>(null);
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [aiGeneratedQuestions, setAiGeneratedQuestions] = useState<any[]>([]);
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [bankTopics, setBankTopics] = useState<BankTopic[]>([]);
  const [isLoadingBankTopics, setIsLoadingBankTopics] = useState(false);
  const [numberErrors, setNumberErrors] = useState<Record<string, string>>({});
  const [reviewSettingsDraft, setReviewSettingsDraft] = useState<ReviewSettingsDraft>(() => createDefaultReviewSettingsDraft());
  const [questionSourceMode, setQuestionSourceMode] = useState<QuestionSourceMode>("manual");
  const [selectedBankTopicId, setSelectedBankTopicId] = useState("__all__");
  const [bankQuestions, setBankQuestions] = useState<BankQuestionOption[]>([]);
  const [selectedBankQuestionIds, setSelectedBankQuestionIds] = useState<string[]>([]);
  const [isLoadingBankQuestions, setIsLoadingBankQuestions] = useState(false);
  const [manualQuestionContent, setManualQuestionContent] = useState("");
  const [manualQuestionType, setManualQuestionType] = useState("multiple_choice");
  const {
    options: manualOptions,
    setOptions: setManualOptions,
    multipleAnswers: manualMultipleAnswers,
    setMultipleAnswers: setManualMultipleAnswers,
    pinnedOptions: manualPinnedOptions,
    setPinnedOptions: setManualPinnedOptions,
    tfAnswer: manualTrueFalseAnswer,
    setTfAnswer: setManualTrueFalseAnswer,
    essayRubric: manualEssayRubric,
    setEssayRubric: setManualEssayRubric,
    addOption: addManualOption,
    removeOption: removeManualOption,
    updateOption: updateManualOption,
    updateOptionMatch: updateManualOptionMatch,
    moveOption: moveManualOption,
    toggleCorrectOption: toggleManualCorrectOption,
    togglePinnedOption: toggleManualPinnedOption,
    resetAnswer: resetManualAnswer,
  } = useQuestionAnswerState();
  const [manualExplanation, setManualExplanation] = useState("");
  const [manualDifficulty, setManualDifficulty] = useState("medium");
  const [manualTopicId, setManualTopicId] = useState("");
  const [manualHasMedia, setManualHasMedia] = useState(false);
  const [manualMediaType, setManualMediaType] = useState<"image" | "audio">("image");
  const [manualMediaAttachment, setManualMediaAttachment] = useState<MediaAttachment | null>(null);
  const [manualMediaUploading, setManualMediaUploading] = useState(false);
  const manualMediaFileInputRef = useRef<HTMLInputElement | null>(null);
  const manualTopics = useQuestionTopics({
    courseId: form.course,
    selectedTopicId: manualTopicId,
    onSelectTopic: setManualTopicId,
  });
  const [manualAiPrompt, setManualAiPrompt] = useState("");
  const [isManualAiGenerating, setIsManualAiGenerating] = useState(false);
  const [manualAiSimilarityWarning, setManualAiSimilarityWarning] = useState("");
  const [courseComboboxOpen, setCourseComboboxOpen] = useState(false);
  const [courseSearch, setCourseSearch] = useState("");
  const skipNextCourseFocusRef = useRef(false);
  const [courseAcademicYearFilter, setCourseAcademicYearFilter] = useState("all");
  const [courseTermFilter, setCourseTermFilter] = useState<CourseTerm | "all">("all");
  const isSingleAttempt = form.maxAttempts === "1";
  const hasUnlimitedAttempts = form.maxAttempts === "unlimited";
  const proctoringForcedOff = hasUnlimitedAttempts || form.unlimitedTime;
  const effectiveProctoring = form.requiresProctoring && !proctoringForcedOff;

  useEffect(() => {
    if (proctoringForcedOff && form.requiresProctoring) {
      setForm((current) => ({ ...current, requiresProctoring: false }));
    }
  }, [form.requiresProctoring, proctoringForcedOff]);

  useEffect(() => {
    if (isSingleAttempt && form.allowLateSubmission) {
      setForm((current) =>
        current.allowLateSubmission
          ? { ...current, allowLateSubmission: false }
          : current,
      );
    }
  }, [form.allowLateSubmission, isSingleAttempt]);

  const set = (key: keyof ExamForm, val: string | boolean) =>
    setForm((f) => ({ ...f, [key]: val }));

  const selectedCourse = useMemo(
    () => courses.find((course) => course.id === form.course),
    [courses, form.course],
  );

  const selectedCourseLabel = selectedCourse
    ? `${selectedCourse.code} - ${selectedCourse.name}`
    : "";

  const filteredCourses = useMemo(() => {
    const query = courseSearch.trim().toLowerCase();

    return courses.filter((course) =>
      (!query ||
        `${course.code} ${course.name}`.toLowerCase().includes(query)) &&
      (courseAcademicYearFilter === "all" ||
        course.academicYear === courseAcademicYearFilter) &&
      (courseTermFilter === "all" || course.term === courseTermFilter),
    );
  }, [courseAcademicYearFilter, courseSearch, courseTermFilter, courses]);

  const courseAcademicYearOptions = useMemo(() => {
    const years = new Set(getAcademicYearOptions());
    courses.forEach((course) => {
      if (course.academicYear) years.add(course.academicYear);
    });

    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [courses]);

  const resetCourseFilters = () => {
    setCourseSearch("");
    setCourseAcademicYearFilter("all");
    setCourseTermFilter("all");
  };

  const bankSelectionWarning = useMemo(() => {
    const selectedTopics = bankTopics.filter((topic) => topic.selected);
    if (selectedTopics.length === 0) return "";

    const typeFilter =
      form.questionType === "mixed" || form.questionType === "custom"
        ? undefined
        : mapQuestionTypeToDb(form.questionType);

    for (const topic of selectedTopics) {
      const requested = Math.max(0, Number(topic.requestedCount || 0));
      const available = typeFilter
        ? Number(topic.availableByType?.[typeFilter] || 0)
        : Number(topic.count || 0);

      if (requested > available) {
        const label = typeFilter ? `loại ${typeFilter}` : "trong chủ đề này";
        return `Chủ đề "${topic.topic}" chỉ có ${available} câu hỏi ${label}, nhưng bạn yêu cầu ${requested} câu.`;
      }
    }

    return "";
  }, [bankTopics, form.questionType]);

  useEffect(() => {
    const loadCourses = async () => {
      try {
        // GET /courses already scopes STUDENT/LECTURER requests to their own
        // courses server-side; only the ADMIN branch falls back to the
        // system-wide, paginated list (default limit 20). Pass a generous
        // limit so an admin's course picker isn't silently truncated.
        const data = unwrapPaginatedData(await api.getCourses({ limit: 200 }));
        const mappedCourses = data.map((course: any) => ({
          id: course.id,
          code: course.code,
          name: course.name,
          academicYear: course.academicYear,
          term: course.term,
        }));
        setCourses(mappedCourses);

        const requestedCourseId = new URLSearchParams(
          window.location.search,
        ).get("courseId");
        if (
          requestedCourseId &&
          mappedCourses.some((course: CourseOption) => course.id === requestedCourseId)
        ) {
          setForm((current) =>
            current.course ? current : { ...current, course: requestedCourseId },
          );
        }
      } catch (error) {
        console.error("Failed to load courses for exam creation:", error);
      }
    };

    loadCourses();
  }, []);

  useEffect(() => {
    const paramId =
      new URLSearchParams(window.location.search).get("id") ||
      new URLSearchParams(window.location.search).get("examId");
    if (!paramId) return;

    setEditingExamId(paramId);
    const loadDraftExam = async () => {
      setIsLoadingDraftExam(true);
      try {
        const exam = await api.getExam(paramId);
        if (!exam) return;

        let startDate = "";
        let startTime = "";
        let endDate = "";
        let endTime = "";
        if (exam.startTime) {
          const d = new Date(exam.startTime);
          if (!Number.isNaN(d.getTime())) {
            startDate = toDateInputValue(d);
            startTime = toTimeInputValue(d);
          }
        }
        if (exam.endTime) {
          const d = new Date(exam.endTime);
          if (!Number.isNaN(d.getTime())) {
            endDate = toDateInputValue(d);
            endTime = toTimeInputValue(d);
          }
        }

        const settings = exam.settings || {};
        const webcamPolicy = settings.webcamEvidencePolicy || {};
        const qConfig = exam.questionSelectionConfig || {};

        setForm((prev) => ({
          ...prev,
          title: exam.title || "",
          course: exam.courseId || exam.course?.id || prev.course,
          description: exam.description || "",
          duration: String(exam.duration ?? settings.timeLimitMinutes ?? 60),
          unlimitedTime: exam.timeLimitMinutes === null && settings.timeLimitMinutes === null,
          maxAttempts: exam.maxAttempts ? String(exam.maxAttempts) : (settings.maxAttempts ? String(settings.maxAttempts) : "1"),
          gradingStrategy: exam.gradingStrategy || "HIGHEST",
          passingScore: exam.passingScore !== undefined && exam.passingScore !== null ? String(exam.passingScore) : "50",
          startDate: startDate || prev.startDate,
          startTime: startTime || prev.startTime,
          endDate: endDate || prev.endDate,
          endTime: endTime || prev.endTime,
          requiresProctoring: settings.requiresProctoring ?? settings.proctoringEnabled ?? true,
          webcamEvidenceEnabled: webcamPolicy.enabled ?? false,
          webcamEvidenceMouseIdleThresholdSeconds: String(Math.round((webcamPolicy.mouseIdleThresholdMs || 60000) / 1000)),
          webcamEvidenceCooldownSeconds: String(Math.round((webcamPolicy.eventCooldownMs || 60000) / 1000)),
          webcamEvidenceScheduledIntervalSeconds: webcamPolicy.scheduledCaptureIntervalSeconds ? String(webcamPolicy.scheduledCaptureIntervalSeconds) : "",
          screenCaptureEnabled: webcamPolicy.screenCaptureEnabled ?? false,
          allowLateSubmission: exam.allowLateSubmission ?? settings.allowLateSubmission ?? false,
          shuffleQuestions: settings.shuffleQuestions ?? true,
          showResultImmediately: settings.showResultImmediately ?? false,
          questionType: qConfig.questionType || settings.questionType || "mixed",
          bankDifficulty: qConfig.bankDifficulty || settings.bankDifficulty || "mixed",
          questionCount: String(qConfig.requestedQuestionCount || settings.requestedQuestionCount || 20),
          sourceMethod: qConfig.sourceMethod || settings.sourceMethod || "bank",
          aiGenerationMode: settings.aiGenerationMode ?? false,
          aiPrompt: settings.aiPrompt || "",
          aiDifficulty: settings.aiDifficulty ? (settings.aiDifficulty <= 0.4 ? "easy" : settings.aiDifficulty >= 0.6 ? "hard" : "medium") : "medium",
          aiReviewRequired: settings.aiReviewRequired ?? true,
        }));

        if (exam.reviewSettings) {
          setReviewSettingsDraft(normalizeReviewSettingsDraft(exam.reviewSettings));
        }

        if (Array.isArray(exam.examQuestions) && exam.examQuestions.length > 0) {
          const questionIds = exam.examQuestions
            .map((eq: any) => eq.questionId || eq.question?.id)
            .filter(Boolean);
          setSelectedBankQuestionIds(questionIds);
          setQuestionSourceMode("bank-select");
        }
      } catch (err) {
        console.error("Failed to load draft exam for editing:", err);
        toast.error("Không thể tải thông tin bài thi nháp");
      } finally {
        setIsLoadingDraftExam(false);
      }
    };
    void loadDraftExam();
  }, []);

  useEffect(() => {
    let active = true;

    const loadBankTopics = async () => {
      if (!form.course) {
        setBankTopics([]);
        return;
      }

      setBankTopics([]);
      setIsLoadingBankTopics(true);
      try {
        const normalizeType = (value: string) => String(value || "").trim().toUpperCase();
        const limit = 100;

        const loadQuestionsForTopic = async (topicId?: string) => {
          let page = 1;
          let totalPages = 1;
          const questions: any[] = [];

          while (page <= totalPages) {
            const response: any = await api.listQuestions({
              courseId: form.course,
              topicId,
              page,
              limit,
            });
            const items = Array.isArray(response?.data)
              ? response.data
              : Array.isArray(response)
                ? response
                : [];

            totalPages = Number(response?.pagination?.totalPages || response?.totalPages || 1);
            questions.push(...items);
            page += 1;
          }

          return questions;
        };

        const topicsResponse = await api.listQuestionTopics({
          courseId: form.course,
          limit: 100,
        });
        const topicsData = Array.isArray(topicsResponse?.data)
          ? topicsResponse.data
          : Array.isArray(topicsResponse)
            ? topicsResponse
            : [];

        if (topicsData.length === 0) {
          const questions = await loadQuestionsForTopic();
          const readyQuestions = questions.filter((question: any) => Boolean(question?.latestVersion?.id));
          const typeCounts = readyQuestions.reduce((acc: Record<string, number>, question: any) => {
            const type = normalizeType(question.type);
            acc[type] = (acc[type] || 0) + 1;
            return acc;
          }, {});

          if (!active) return;

          setBankTopics([
            {
              topicId: "",
              topic: WHOLE_COURSE_LABEL,
              count: readyQuestions.length,
              selected: false,
              requestedCount: "0",
              availableByType: typeCounts,
            },
          ]);
          return;
        }

        const nextTopics = await Promise.all(
          topicsData.map(async (topic: any) => {
            const questions = await loadQuestionsForTopic(topic.id);
            const readyQuestions = questions.filter((question: any) => Boolean(question?.latestVersion?.id));
            const typeCounts = readyQuestions.reduce((acc: Record<string, number>, question: any) => {
              const type = normalizeType(question.type);
              acc[type] = (acc[type] || 0) + 1;
              return acc;
            }, {});

            return {
              topicId: topic.id,
              topic: topic.name,
              count: readyQuestions.length,
              selected: false,
              requestedCount: "0",
              availableByType: typeCounts,
            };
          }),
        );

        if (!active) return;

        setBankTopics(
          nextTopics.sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic)),
        );
      } catch (error) {
        console.error("Failed to load question bank topics:", error);
        if (active) setBankTopics([]);
      } finally {
        if (active) setIsLoadingBankTopics(false);
      }
    };

    loadBankTopics();

    return () => {
      active = false;
    };
  }, [form.course]);

  useEffect(() => {
    let active = true;

    const loadSelectableQuestions = async () => {
      if (questionSourceMode !== "bank-select" || !form.course || !selectedBankTopicId) {
        setBankQuestions([]);
        return;
      }

      setIsLoadingBankQuestions(true);
      try {
        const response: any = await api.listQuestions({
          courseId: form.course,
          topicId: selectedBankTopicId === "__all__" ? undefined : selectedBankTopicId,
          page: 1,
          limit: 100,
        });
        const questions = Array.isArray(response?.data)
          ? response.data
          : Array.isArray(response)
            ? response
            : [];

        if (active) {
          setBankQuestions(
            questions.map((question: any) => ({
              id: String(question.id),
              type: String(question.type || "UNKNOWN"),
              content: String(question.content || question.stem || "Untitled question"),
              difficulty: Number(question.difficulty || 0) || undefined,
              isVersionReady: Boolean(question?.latestVersion?.id),
              mediaType: question.mediaType === "image" || question.mediaType === "audio" ? question.mediaType : undefined,
            })),
          );
        }
      } catch (error) {
        console.error("Failed to load selectable questions:", error);
        if (active) setBankQuestions([]);
      } finally {
        if (active) setIsLoadingBankQuestions(false);
      }
    };

    loadSelectableQuestions();
    return () => {
      active = false;
    };
  }, [form.course, questionSourceMode, selectedBankTopicId]);

  const filteredBankQuestions = useMemo(() => {
    return bankQuestions.filter((question) => {
      const matchesType =
        form.questionType === "mixed" ||
        form.questionType === "custom" ||
        question.type === mapQuestionTypeToDb(form.questionType);
      const matchesDifficulty =
        form.bankDifficulty === "mixed" ||
        difficultyLabelFromValue(question.difficulty).toLowerCase() === form.bankDifficulty;
      return matchesType && matchesDifficulty;
    });
  }, [bankQuestions, form.bankDifficulty, form.questionType]);

  const versionReadyBankQuestions = filteredBankQuestions.filter((question) => question.isVersionReady);
  const isAllFilteredBankQuestionsSelected =
    versionReadyBankQuestions.length > 0 &&
    versionReadyBankQuestions.every((question) => selectedBankQuestionIds.includes(question.id));

  const toggleSelectAllBankQuestions = () => {
    const filteredIds = versionReadyBankQuestions.map((question) => question.id);
    setSelectedBankQuestionIds((ids) =>
      isAllFilteredBankQuestionsSelected
        ? ids.filter((id) => !filteredIds.includes(id))
        : [...new Set([...ids, ...filteredIds])],
    );
  };

  const randomQuestionCount = useMemo(
    () =>
      bankTopics.reduce(
        (total, topic) =>
          total + (topic.selected ? Math.max(0, Number(topic.requestedCount || 0)) : 0),
        0,
      ),
    [bankTopics],
  );
  const composedQuestionCount =
    aiGeneratedQuestions.length + selectedBankQuestionIds.length + randomQuestionCount;

  // Manual entry's questions are never persisted until "addManualQuestion"
  // stages them (and the exam-create submit later saves them for real), so —
  // unlike the question bank editor — there is no "already saved" attachment
  // to protect: any attachment can always be released immediately on
  // replace/remove/toggle-off.
  const handleManualMediaFile = async (file: File | null | undefined) => {
    if (!file) return;
    const effectiveType = manualMediaAttachment?.mediaType ?? manualMediaType;
    const validationError = validateMediaFile(file, effectiveType);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    const previous = manualMediaAttachment;
    setManualMediaUploading(true);
    try {
      const uploaded = await uploadMediaFile(file, effectiveType);
      setManualMediaAttachment(uploaded);
      if (previous && previous.mediaKey !== uploaded.mediaKey) {
        releaseMediaUpload(previous);
      }
      toast.success("Đã tải lên tệp đính kèm.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không thể tải tệp lên. Vui lòng thử lại.");
    } finally {
      setManualMediaUploading(false);
    }
  };

  const handleManualMediaToggle = (checked: boolean) => {
    setManualHasMedia(checked);
    if (!checked && manualMediaAttachment) {
      releaseMediaUpload(manualMediaAttachment);
      setManualMediaAttachment(null);
    }
  };

  const handleManualMediaTypeChange = (type: "image" | "audio") => {
    if (manualMediaAttachment) return;
    setManualMediaType(type);
  };

  const handleManualRemoveMediaAttachment = () => {
    if (manualMediaAttachment) {
      releaseMediaUpload(manualMediaAttachment);
      setManualMediaAttachment(null);
    }
    if (manualMediaFileInputRef.current) manualMediaFileInputRef.current.value = "";
  };

  const addManualQuestion = () => {
    if (!manualQuestionContent.trim()) {
      toast.error("Vui lòng nhập nội dung câu hỏi.");
      return;
    }

    const filledOptions = manualOptions.filter((option) => option.text.trim());
    if (
      ["multiple_choice", "matching", "ordering", "find_error"].includes(manualQuestionType) &&
      filledOptions.length < 2
    ) {
      toast.error("Cần ít nhất hai lựa chọn hoặc mục.");
      return;
    }
    if (
      ["multiple_choice", "find_error"].includes(manualQuestionType) &&
      !filledOptions.some((option) => option.isCorrect)
    ) {
      toast.error(
        manualQuestionType === "find_error"
          ? "Vui lòng chọn dòng chứa lỗi."
          : "Vui lòng chọn ít nhất một đáp án đúng.",
      );
      return;
    }
    if (manualQuestionType === "essay" && !manualEssayRubric.trim()) {
      toast.error("Câu hỏi tự luận cần có tiêu chí chấm điểm.");
      return;
    }

    // Fill-in-the-blank has no equivalent branch in buildQuestionPayload (the
    // shared builder used by the question bank editor), so its answer is
    // still derived here from the [[...]] markers in the question content.
    // Every other type is built the exact same way the question bank editor
    // builds it, so a manually-added exam question is never out of sync with
    // one created via /lecturer/question-editor.
    const { type: backendType, options, correctAnswer } =
      manualQuestionType === "fill_blank"
        ? {
            type: "FILL_IN_BLANK",
            options: undefined as Record<string, string> | undefined,
            correctAnswer: {
              answers: Array.from(
                manualQuestionContent.matchAll(/\[\[(.*?)\]\]/g),
                (match) => match[1],
              ),
            },
          }
        : buildQuestionPayload({
            questionType: manualQuestionType,
            multipleAnswers: manualMultipleAnswers,
            content: manualQuestionContent,
            explanation: manualExplanation,
            difficulty: [difficultyOptionToValue(manualDifficulty)],
            scoreCoefficient: "1",
            tfAnswer: manualTrueFalseAnswer,
            essayRubric: manualEssayRubric,
            options: manualOptions,
          });

    setAiGeneratedQuestions((questions) => [
      ...questions,
      {
        type: backendType,
        content: manualQuestionContent.trim(),
        options,
        correctAnswer,
        explanation: manualExplanation.trim() || undefined,
        difficulty: difficultyOptionToValue(manualDifficulty),
        points: 1,
        topicId: manualTopicId || undefined,
        media: manualHasMedia ? manualMediaAttachment : null,
      },
    ]);
    setManualQuestionContent("");
    setManualExplanation("");
    resetManualAnswer();
    // The attachment now belongs to the staged question above — clear the
    // form's media state without releasing the R2 object out from under it.
    setManualHasMedia(false);
    setManualMediaAttachment(null);
    if (manualMediaFileInputRef.current) manualMediaFileInputRef.current.value = "";
  };

  const applyGeneratedQuestionToManualForm = (question: any) => {
    const type = String(question?.type || "").toUpperCase();
    const nextType =
      type === "TRUE_FALSE"
        ? "true_false"
        : type === "FILL_IN_BLANK"
          ? "fill_blank"
          : type === "MATCHING"
            ? "matching"
            : type === "ORDERING"
              ? "ordering"
              : type === "FIND_ERROR"
                ? "find_error"
                : type === "ESSAY" || type === "SHORT_ANSWER"
                  ? "essay"
                  : "multiple_choice";

    setManualQuestionType(nextType);
    setManualQuestionContent(String(question?.content || ""));
    setManualExplanation(String(question?.explanation || ""));
    setManualDifficulty(difficultyLabelFromValue(question?.difficulty).toLowerCase());

    if (nextType === "true_false") {
      setManualTrueFalseAnswer(question?.correctAnswer?.answer === false ? "false" : "true");
    } else if (nextType === "essay") {
      setManualEssayRubric(String(question?.correctAnswer?.answer || question?.explanation || ""));
    } else if (nextType === "matching" && Array.isArray(question?.pairs)) {
      setManualOptions(
        question.pairs.map((pair: any, index: number) => ({
          id: String.fromCharCode(65 + index),
          text: String(pair?.left || ""),
          match: String(pair?.right || ""),
          isCorrect: false,
        })),
      );
    } else if (nextType === "ordering" && Array.isArray(question?.items)) {
      setManualOptions(
        question.items.map((item: any, index: number) => ({
          id: String.fromCharCode(65 + index),
          text: String(item || ""),
          isCorrect: false,
        })),
      );
    } else if (question?.options && typeof question.options === "object") {
      const selectedAnswers = Array.isArray(question?.correctAnswer?.answers)
        ? question.correctAnswer.answers.map(String)
        : String(question?.correctAnswer?.answer || "").split(",");
      setManualOptions(
        Object.entries(question.options).map(([id, text]) => ({
          id,
          text: String(text || ""),
          isCorrect: selectedAnswers.includes(id),
        })),
      );
      setManualMultipleAnswers(selectedAnswers.length > 1);
    }
  };

  const handleManualAiGenerate = async () => {
    if (!manualAiPrompt.trim()) return;
    setIsManualAiGenerating(true);
    setManualAiSimilarityWarning("");
    try {
      // Uses the same single-question generator (and prompt, which has proper
      // MATCHING/ORDERING/FILL_IN_BLANK instructions) as /lecturer/question-editor,
      // instead of the batch exam-questions generator whose prompt only covers
      // MULTIPLE_CHOICE/TRUE_FALSE/SHORT_ANSWER/ESSAY.
      const backendType = mapQuestionTypeToAiApi(
        manualQuestionType === "multiple_choice"
          ? "multiple-choice"
          : manualQuestionType === "true_false"
            ? "true-false"
            : manualQuestionType === "fill_blank"
              ? "fill-blank"
              : manualQuestionType === "find_error"
                ? "find-error"
                : manualQuestionType === "essay"
                  ? "short-answer"
                  : manualQuestionType,
      );
      const generated = await api.aiGenerateQuestion({
        prompt: manualAiPrompt,
        questionType: backendType,
        difficulty: difficultyOptionToValue(manualDifficulty),
        language: "vi",
        courseName: courses.find((course) => course.id === form.course)?.name,
        useCase: "question_bank",
        context: {
          courseId: form.course,
          courseName: courses.find((course) => course.id === form.course)?.name,
          courseCode: courses.find((course) => course.id === form.course)?.code,
          examTitle: form.title,
          source: "create_exam_manual_ai",
        },
      });
      if (!generated?.content) throw new Error("AI không trả về câu hỏi.");

      // Mirrors the near-duplicate guard in /lecturer/question-editor
      // (useQuestionAiGeneration.generate) so a manually-created exam
      // question gets the same duplicate warning as the question bank.
      const duplicate = await findMostSimilarQuestion({
        courseId: form.course,
        backendType,
        generatedText: `${generated.content} ${generated.options ? Object.values(generated.options).join(" ") : ""}`,
      });
      if (duplicate && duplicate.similarity >= 0.8) {
        const message = `Câu hỏi AI tạo quá giống câu hỏi hiện có (${Math.round(duplicate.similarity * 100)}%). Hãy đổi yêu cầu hoặc tạo lại.`;
        setManualAiSimilarityWarning(message);
        toast.error(message);
        return;
      }

      applyGeneratedQuestionToManualForm(generated);
      toast.success("AI đã tạo bản nháp câu hỏi. Hãy xem lại trước khi thêm.");
    } catch (error: any) {
      console.error("Manual AI generation failed:", error);
      toast.error(error.message || "Tạo nội dung bằng AI thất bại.");
    } finally {
      setIsManualAiGenerating(false);
    }
  };

  const stepIdx = STEPS.findIndex((s) => s.key === step);
  const canNext = (): boolean => {
    if (step === "info") return form.title.trim() !== "" && form.course !== "";
    if (step === "settings")
      return (
        (form.unlimitedTime || form.duration !== "") && form.startDate !== "" && form.endDate !== ""
      );
    return true;
  };

  const handleCreate = async () => {
    const startTime = form.startDate
      ? new Date(`${form.startDate}T${form.startTime || "00:00"}`).toISOString()
      : undefined;
    const endTime = form.endDate
      ? new Date(`${form.endDate}T${form.endTime || "23:59"}`).toISOString()
      : undefined;

    try {
      const durationError = form.unlimitedTime ? "" : getNumericInputError(form.duration, { min: 5, integer: true });
      const maxAttemptsError = hasUnlimitedAttempts ? "" : getNumericInputError(form.maxAttempts, { min: 1, integer: true });
      const passingScoreError = getNumericInputError(form.passingScore, {
        min: 0,
        max: 100,
        integer: true,
      });
      const questionCountError = getNumericInputError(form.questionCount, {
        min: 1,
        integer: true,
      });
      const selectedQuestionsWithoutVersion = bankQuestions.filter(
        (question) => selectedBankQuestionIds.includes(question.id) && !question.isVersionReady,
      );

      if (selectedQuestionsWithoutVersion.length > 0) {
        toast.error("Có câu hỏi chưa được chuẩn hóa phiên bản. Vui lòng bỏ chọn chúng trước khi tạo đề.");
        return;
      }

        if (randomQuestionCount > 0 && bankSelectionWarning) {
          setNumberErrors((prev) => ({ ...prev, questionCount: bankSelectionWarning }));
          toast.error(bankSelectionWarning);
          return;
        }

      if (composedQuestionCount === 0) {
        toast.error("Vui lòng thêm ít nhất một câu hỏi từ bất kỳ nguồn nào.");
        return;
      }

      const nextErrors = {
        duration: durationError || "",
        maxAttempts: maxAttemptsError || "",
        passingScore: passingScoreError || "",
        questionCount: questionCountError || "",
      };
      setNumberErrors(nextErrors);

      const firstError = Object.values(nextErrors).find(Boolean);
      if (firstError) {
        toast.error(firstError);
        return;
      }

      const parsedReviewSettings = buildReviewSettingsPayload(reviewSettingsDraft);
      const effectiveQuestionCount = composedQuestionCount;

      setIsCreating(true);
      let questionIds: string[] | undefined;

      if (aiGeneratedQuestions.length > 0) {
        const createdQuestions = await Promise.all(
          aiGeneratedQuestions.map((q) =>
            api.saveQuestion({
              type: mapQuestionTypeToDb(q.type),
              content: q.content,
              options: q.options || undefined,
              correctAnswer: q.correctAnswer || undefined,
              explanation: q.explanation || undefined,
              difficulty: normalizeDifficultyForQuestion(q.difficulty),
              points: Math.max(1, Number(q.points) || 1),
              defaultPoints: Math.max(1, Number(q.points) || 1),
              courseId: form.course,
              topicId: q.topicId || undefined,
              media: q.media || undefined,
            }),
          ),
        );

        questionIds = [
          ...selectedBankQuestionIds,
          ...createdQuestions
          .map((item: any) => item.id)
          .filter(Boolean),
        ];
      } else if (selectedBankQuestionIds.length > 0) {
        questionIds = selectedBankQuestionIds;
      }

      const examPayload = {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        courseId: form.course,
        duration: parseNumericInput(form.duration, { min: 5, integer: true }) || 60,
        timeLimitMinutes: form.unlimitedTime ? null : parseNumericInput(form.duration, { min: 5, integer: true }),
        passingScore: parseNumericInput(form.passingScore, {
          min: 0,
          max: 100,
          integer: true,
        })!,
        startTime,
        endTime,
        maxAttempts:
          form.maxAttempts === "unlimited"
            ? null
            : parseNumericInput(form.maxAttempts, { min: 1, integer: true }),
        gradingStrategy: form.gradingStrategy,
        reviewSettings: parsedReviewSettings,
        questionSelectionConfig: {
          sourceMethod: "composite",
          selectionMode: "composite",
          sources: {
            manualCount: aiGeneratedQuestions.length,
            selectedBankCount: selectedBankQuestionIds.length,
            randomTopicCount: randomQuestionCount,
          },
          randomizePerStudent: randomQuestionCount > 0,
          shuffleQuestions: form.shuffleQuestions,
          questionType: form.questionType,
          requestedQuestionCount: randomQuestionCount,
          totalComposedQuestionCount: effectiveQuestionCount,
          bankDifficulty: difficultyOptionToBankValue(form.bankDifficulty),
          topicAllocations:
            randomQuestionCount > 0
              ? bankTopics
                  .filter((topic) => topic.selected && Number(topic.requestedCount || 0) > 0)
                  .filter((topic) => topic.topicId)
                  .map((topic) => ({
                    topicId: topic.topicId,
                    topic: topic.topic,
                    count: parseNumericInput(topic.requestedCount, { min: 1, integer: true }) || 0,
                  }))
              : undefined,
        },
        questionIds,
        settings: {
          maxAttempts: form.maxAttempts === "unlimited" ? null : parseNumericInput(form.maxAttempts, {
            min: 1,
            integer: true,
          }),
          timeLimitMinutes: form.unlimitedTime ? null : parseNumericInput(form.duration, { min: 5, integer: true }),
          requiresProctoring: effectiveProctoring,
          proctoringEnabled: effectiveProctoring,
          webcamEvidencePolicy: {
            enabled: effectiveProctoring && form.webcamEvidenceEnabled,
            examProfile: "THEORY",
            scheduledCaptureIntervalSeconds: form.webcamEvidenceScheduledIntervalSeconds
              ? parseNumericInput(form.webcamEvidenceScheduledIntervalSeconds, { min: 1, integer: true })
              : null,
            eventCooldownMs: (parseNumericInput(form.webcamEvidenceCooldownSeconds, { min: 1, integer: true }) || 60) * 1000,
            mouseIdleThresholdMs: (parseNumericInput(form.webcamEvidenceMouseIdleThresholdSeconds, { min: 10, integer: true }) || 60) * 1000,
            screenCaptureEnabled: form.screenCaptureEnabled,
            requireFullScreenCapture: form.screenCaptureEnabled,
            retentionDays: 30,
            consentVersion: "webcam-evidence-v1",
          },
          devicePolicy: effectiveProctoring ? "DESKTOP_ONLY" : "ANY",
          allowLateSubmission: form.allowLateSubmission,
          shuffleQuestions: form.shuffleQuestions,
          showResultImmediately: form.showResultImmediately,
          sourceMethod: randomQuestionCount > 0 ? "bank" : "composite",
          selectionMode: "composite",
          randomizePerStudent: randomQuestionCount > 0,
          questionType: form.questionType,
          bankDifficulty: difficultyOptionToBankValue(form.bankDifficulty),
          requestedQuestionCount: randomQuestionCount,
          totalComposedQuestionCount: effectiveQuestionCount,
          randomRequestedQuestionCount: randomQuestionCount,
          topicAllocations:
            randomQuestionCount > 0
              ? bankTopics
                  .filter((topic) => topic.selected && Number(topic.requestedCount || 0) > 0)
                  .filter((topic) => topic.topicId)
                  .map((topic) => ({
                    topicId: topic.topicId,
                    topic: topic.topic,
                    count: parseNumericInput(topic.requestedCount, { min: 1, integer: true }) || 0,
                  }))
              : undefined,
          aiGenerationMode: form.aiGenerationMode,
          aiPrompt: form.aiPrompt || undefined,
          aiDifficulty: difficultyOptionToValue(form.aiDifficulty),
          aiReviewRequired: form.aiReviewRequired,
        },
      };

      if (editingExamId) {
        await api.updateExam(editingExamId, examPayload);
        toast.success("Đã cập nhật bài thi nháp thành công!");
      } else {
        await api.createExam(examPayload);
        toast.success("Đã tạo bài thi thành công!");
      }

      setCreated(true);
    } catch (error: any) {
      console.error("Failed to save exam:", error);
      toast.error(error.message || (editingExamId ? "Không thể cập nhật bài thi" : "Không thể tạo bài thi"));
    } finally {
      setIsCreating(false);
    }
  };

  const handleAiGenerate = async () => {
    if (!form.aiPrompt.trim()) return;
    const questionCountError = getNumericInputError(form.questionCount, {
      min: 1,
      integer: true,
    });
    if (questionCountError) {
      setNumberErrors((prev) => ({ ...prev, questionCount: questionCountError }));
      toast.error(questionCountError);
      return;
    }

    setIsAiGenerating(true);
    try {
      const result = await api.aiGenerateExamQuestions({
        prompt: form.aiPrompt,
        questionCount:
          parseNumericInput(form.questionCount, {
            min: 1,
            integer: true,
          }) || 20,
        difficulty: difficultyOptionToValue(form.aiDifficulty),
        questionType: mapQuestionTypeToAiApi(form.questionType),
        language: "en",
        courseName: courses.find((course) => course.id === form.course)?.name,
        useCase: "exam",
        context: {
          courseId: form.course,
          courseName: courses.find((course) => course.id === form.course)?.name,
          courseCode: courses.find((course) => course.id === form.course)?.code,
          examTitle: form.title,
          source: "create_exam_bank_ai",
        },
      });
      setAiGeneratedQuestions(result.questions);
      toast.success(
        `Đã tạo thành công ${result.questions.length} câu hỏi! Hãy xem lại ở bước xem trước.`,
      );
    } catch (error: any) {
      console.error("AI generation failed:", error);
      toast.error(
        "Tạo nội dung bằng AI thất bại: " + (error.message || "Lỗi không xác định"),
      );
    } finally {
      setIsAiGenerating(false);
    }
  };

  const handleImportExtract = async () => {
    if (!docFile) {
      toast.error("Vui lòng chọn tài liệu trước.");
      return;
    }

    const fileName = docFile.name.toLowerCase();
    const isTextLike = /\.(txt|md|csv|json)$/i.test(fileName);
    const isDocx = /\.docx$/i.test(fileName);
    const isDoc = /\.doc$/i.test(fileName);

    try {
      setIsStandardizing(true);

      let rawText = "";

      if (isTextLike) {
        rawText = await docFile.text();
      } else if (isDocx) {
        const mammoth = await import("mammoth/mammoth.browser");
        const arrayBuffer = await docFile.arrayBuffer();
        const extracted = await mammoth.extractRawText({ arrayBuffer });
        rawText = extracted.value || "";
      } else if (isDoc) {
        throw new Error(
          "Chưa hỗ trợ định dạng .doc cũ. Vui lòng lưu lại dưới dạng .docx và thử lại.",
        );
      } else {
        throw new Error(
          "Định dạng tệp không được hỗ trợ. Vui lòng dùng .txt, .md, .csv, .json hoặc .docx.",
        );
      }

      const normalized = rawText.replace(/\s+/g, " ").trim();

      if (!normalized) {
        throw new Error("Tệp đã chọn đang trống.");
      }

      const prompt = [
        `Extract key concepts from the following course material and generate exam questions.`,
        `Document: ${docFile.name}`,
        `Material:`,
        normalized.slice(0, 8000),
      ].join("\n\n");

      const result = await api.aiGenerateExamQuestions({
        prompt,
        questionCount:
          parseNumericInput(form.questionCount, {
            min: 1,
            integer: true,
          }) || 20,
        difficulty: difficultyOptionToValue(form.aiDifficulty),
        questionType: mapQuestionTypeToAiApi(form.questionType),
        language: "en",
        courseName: courses.find((course) => course.id === form.course)?.name,
        useCase: "exam",
        context: {
          courseId: form.course,
          courseName: courses.find((course) => course.id === form.course)?.name,
          courseCode: courses.find((course) => course.id === form.course)?.code,
          examTitle: form.title,
          source: "create_exam_doc_ai",
        },
      });

      setAiGeneratedQuestions(result.questions || []);
      toast.success(
        `Đã trích xuất và tạo ${result.questions?.length || 0} câu hỏi từ tài liệu.`,
      );
    } catch (error: any) {
      console.error("Import extraction failed:", error);
      toast.error("Trích xuất AI thất bại: " + (error.message || "Lỗi không xác định"));
    } finally {
      setIsStandardizing(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // ── Success screen ──────────────────────────────────────────────
  if (created) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center">
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircle2 className="h-10 w-10 text-green-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold mb-1">
              {editingExamId ? "Đã cập nhật bài thi!" : "Đã tạo bài thi!"}
            </h2>
            <p className="text-muted-foreground">
              <strong>"{form.title}"</strong> đã được lưu thành công.
            </p>
          </div>
          <div className="flex gap-3">
            <BackToDashboardButton
              to="/lecturer"
              variant="outline"
              size="default"
            />
            <Button onClick={() => router.push("/lecturer/exams")}>
              Danh sách bài thi
            </Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-6xl space-y-6 px-3 sm:px-0">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">
            {editingExamId ? "Chỉnh sửa bài thi nháp" : "Tạo bài thi mới"}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {editingExamId
              ? "Cập nhật và hoàn thiện bài thi trong 4 bước"
              : "Thiết lập bài thi mới trong 4 bước"}
          </p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2">
          {STEPS.map((s, i) => {
            const done = i < stepIdx;
            const active = s.key === step;
            return (
              <div key={s.key} className="flex items-center gap-2">
                <div
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all border ${
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : done
                        ? "bg-green-100 text-green-700 border-green-200"
                        : "bg-secondary text-muted-foreground border-border"
                  }`}
                >
                  {done ? <CheckCircle2 className="h-4 w-4" /> : s.icon}
                  <span className="hidden sm:inline">{s.label}</span>
                </div>
                {i < STEPS.length - 1 && (
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
              </div>
            );
          })}
        </div>

        {/* Step content */}
        <Card>
          {step === "info" && (
            <>
              <CardHeader>
                <CardTitle>Thông tin cơ bản</CardTitle>
                <CardDescription>
                  Nhập tên bài thi, học phần và mô tả ngắn.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 lg:grid-cols-2 lg:items-start">
                <div>
                  <Label htmlFor="title">
                    Tên bài thi <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="title"
                    value={form.title}
                    onChange={(e) => set("title", e.target.value)}
                    placeholder="Ví dụ: Kiểm tra giữa kỳ – Hệ quản trị cơ sở dữ liệu"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="desc">Mô tả</Label>
                  <Textarea
                    id="desc"
                    value={form.description}
                    onChange={(e) => set("description", e.target.value)}
                    placeholder="Mô tả ngắn phạm vi và mục tiêu của bài thi…"
                    className="mt-1 h-11 min-h-0 resize-none py-2.5"
                  />
                </div>
                <div>
                  <Label className="block invisible">Lọc học phần</Label>
                  <div className="flex items-center gap-2 rounded-lg bg-muted/40 p-2">
                  <Select
                    value={courseAcademicYearFilter}
                    onValueChange={setCourseAcademicYearFilter}
                  >
                    <SelectTrigger
                      id="course-academic-year-filter"
                      className="h-8 flex-1 rounded-md border-none bg-transparent text-xs shadow-none"
                    >
                      <SelectValue placeholder="Năm học" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tất cả năm học</SelectItem>
                      {courseAcademicYearOptions.map((year) => (
                        <SelectItem key={year} value={year}>
                          {year}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={courseTermFilter}
                    onValueChange={(value) =>
                      setCourseTermFilter(value as CourseTerm | "all")
                    }
                  >
                    <SelectTrigger
                      id="course-term-filter"
                      className="h-8 flex-1 rounded-md border-none bg-transparent text-xs shadow-none"
                    >
                      <SelectValue placeholder="Học kỳ" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tất cả học kỳ</SelectItem>
                      {COURSE_TERM_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 shrink-0 px-2 text-xs"
                    onClick={resetCourseFilters}
                  >
                    Đặt lại
                  </Button>
                  </div>
                </div>
                <div>
                  <Label htmlFor="course" className="block">
                    Học phần <span className="text-red-500">*</span>
                  </Label>
                  <Popover
                    open={courseComboboxOpen}
                    onOpenChange={(open) => {
                      setCourseComboboxOpen(open);
                      if (open) setCourseSearch("");
                    }}
                  >
                    <PopoverTrigger asChild>
                      <Input
                        id="course"
                        role="combobox"
                        aria-expanded={courseComboboxOpen}
                        disabled={courses.length === 0}
                        value={
                          courseComboboxOpen ? courseSearch : selectedCourseLabel
                        }
                        onChange={(event) => {
                          setCourseSearch(event.target.value);
                          setCourseComboboxOpen(true);
                        }}
                          onFocus={() => {
                            if (skipNextCourseFocusRef.current) {
                              skipNextCourseFocusRef.current = false;
                              return;
                            }
                            setCourseComboboxOpen(true);
                          }}
                        placeholder="Tìm theo mã hoặc tên học phần..."
                        className="mt-1 h-12 rounded-xl text-base"
                      />
                    </PopoverTrigger>
                    <PopoverContent
                      align="start"
                      className="w-[--radix-popover-trigger-width] p-0"
                    >
                      <Command>
                        <CommandList className="max-h-80">
                          {filteredCourses.length === 0 ? (
                            <CommandEmpty>
                              Không tìm thấy học phần theo bộ lọc đã chọn.
                            </CommandEmpty>
                          ) : (
                            <CommandGroup>
                              {filteredCourses.map((course) => {
                                const label = `${course.code} - ${course.name}`;

                                return (
                                  <CommandItem
                                    key={course.id}
                                    value={label}
                                    onSelect={() => {
                                      set("course", course.id);
                                      setCourseSearch("");
                                      skipNextCourseFocusRef.current = true;
                                      setCourseComboboxOpen(false);
                                    }}
                                    className="items-start gap-3 py-3"
                                  >
                                    <Check
                                      className={cn(
                                        "mt-0.5 h-4 w-4 shrink-0",
                                        form.course === course.id
                                          ? "opacity-100"
                                          : "opacity-0",
                                      )}
                                    />
                                    <span className="min-w-0 flex-1">
                                      <span className="flex min-w-0 items-center gap-2">
                                        <span className="truncate font-medium">
                                          {course.code}
                                        </span>
                                        <Badge
                                          variant="secondary"
                                          className="shrink-0"
                                        >
                                          {formatCourseTerm(
                                            course.academicYear,
                                            course.term,
                                          )}
                                        </Badge>
                                      </span>
                                      <span className="block truncate text-xs text-muted-foreground">
                                        {course.name}
                                      </span>
                                    </span>
                                  </CommandItem>
                                );
                              })}
                            </CommandGroup>
                          )}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {courses.length === 0 ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Chưa có học phần nào.
                    </p>
                  ) : null}
                </div>
              </CardContent>
            </>
          )}

          {step === "settings" && (
            <>
              <CardHeader>
                <CardTitle>Cài đặt bài thi</CardTitle>
                <CardDescription>
                  Cấu hình thời gian, cách tính điểm và quyền truy cập.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <Label>Thời lượng (phút)</Label>
                    <Input
                      type="number"
                      value={form.duration}
                      disabled={form.unlimitedTime}
                      onChange={(e) =>
                        set(
                          "duration",
                          sanitizeNumericInput(e.target.value, { min: 5 }),
                        )
                      }
                      min={5}
                      onBlur={(e) =>
                        setNumberErrors((prev) => ({
                          ...prev,
                          duration:
                            getNumericInputError(e.target.value, {
                              min: 5,
                              integer: true,
                            }) || "",
                        }))
                      }
                      className="mt-1"
                    />
                    {numberErrors.duration ? (
                      <p className="mt-1 text-xs text-destructive">
                        {numberErrors.duration}
                      </p>
                    ) : null}
                    <div className="mt-2 flex items-center gap-2 text-xs">
                      <Switch checked={form.unlimitedTime} onCheckedChange={(v) => set("unlimitedTime", v)} />
                      <span>Không giới hạn thời gian</span>
                    </div>
                  </div>
                  <div>
                    <Label>Điểm đạt (%)</Label>
                    <Input
                      type="number"
                      value={form.passingScore}
                      onChange={(e) =>
                        set(
                          "passingScore",
                          sanitizeNumericInput(e.target.value, {
                            min: 0,
                            max: 100,
                          }),
                        )
                      }
                      min={0}
                      max={100}
                      onBlur={(e) =>
                        setNumberErrors((prev) => ({
                          ...prev,
                          passingScore:
                            getNumericInputError(e.target.value, {
                              min: 0,
                              max: 100,
                              integer: true,
                            }) || "",
                        }))
                      }
                      className="mt-1"
                    />
                    {numberErrors.passingScore ? (
                      <p className="mt-1 text-xs text-destructive">
                        {numberErrors.passingScore}
                      </p>
                    ) : null}
                  </div>
                  <div>
                    <Label>
                      <HelpedTitle help="Đặt 1 sẽ khóa nộp muộn.">
                        Số lần làm tối đa
                      </HelpedTitle>
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      disabled={hasUnlimitedAttempts}
                      value={hasUnlimitedAttempts ? "" : form.maxAttempts}
                      placeholder={hasUnlimitedAttempts ? "Không giới hạn" : undefined}
                      onChange={(e) =>
                        set("maxAttempts", sanitizeNumericInput(e.target.value, { min: 1, integer: true }))
                      }
                      onBlur={(e) =>
                        setNumberErrors((prev) => ({
                          ...prev,
                          maxAttempts: getNumericInputError(e.target.value, { min: 1, integer: true }) || "",
                        }))
                      }
                      className="mt-1"
                    />
                    {numberErrors.maxAttempts ? (
                      <p className="mt-1 text-xs text-destructive">
                        {numberErrors.maxAttempts}
                      </p>
                    ) : null}
                    <div className="mt-2 flex items-center gap-2 text-xs">
                      <Switch
                        checked={hasUnlimitedAttempts}
                        onCheckedChange={(v) => set("maxAttempts", v ? "unlimited" : "1")}
                      />
                      <span>Không giới hạn số lần làm</span>
                    </div>
                  </div>
                  <div>
                    <Label>Cách tính điểm</Label>
                    <Select
                      value={form.gradingStrategy}
                      onValueChange={(v) =>
                        set("gradingStrategy", v as ExamForm["gradingStrategy"])
                      }
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {GRADING_STRATEGY_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Separator />
                <p className="text-sm font-medium">Khung giờ thi</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <Label>
                      Ngày bắt đầu <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      type="date"
                      value={form.startDate}
                      onChange={(e) => set("startDate", e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Giờ bắt đầu</Label>
                    <TimePickerVi value={form.startTime} onChange={(v) => set("startTime", v)} className="mt-1" />
                  </div>
                  <div>
                    <Label>
                      Ngày kết thúc <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      type="date"
                      value={form.endDate}
                      onChange={(e) => set("endDate", e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Giờ kết thúc</Label>
                    <TimePickerVi value={form.endTime} onChange={(v) => set("endTime", v)} className="mt-1" />
                  </div>
                </div>

                <Separator />
                <p className="text-sm font-medium">Tùy chọn</p>
                <div className="grid gap-4 sm:grid-cols-3">
                  {(
                    [
                      {
                        key: "requiresProctoring",
                        label: "Bật giám sát AI",
                        desc: "Theo dõi hoạt động của sinh viên trong bài thi",
                        icon: <Shield className="h-4 w-4 text-primary" />,
                      },
                      {
                        key: "allowLateSubmission",
                        label: "Cho phép nộp bài muộn",
                        desc: "Sinh viên có thể nộp bài sau thời gian kết thúc",
                        icon: <FileCheck className="h-4 w-4 text-primary" />,
                      },
                      {
                        key: "shuffleQuestions",
                        label: "Xáo trộn câu hỏi",
                        desc: "Ngẫu nhiên thứ tự câu hỏi cho từng sinh viên",
                        icon: <Users className="h-4 w-4 text-primary" />,
                      },
                    ] as const
                  ).map(({ key, label, desc, icon }) => (
                    <SettingToggleRow
                      key={key}
                      icon={icon}
                      title={label}
                      help={desc}
                      checked={form[key] as boolean}
                      onCheckedChange={(v) => set(key, v)}
                      disabled={(key === "allowLateSubmission" && isSingleAttempt) || (key === "requiresProctoring" && proctoringForcedOff)}
                    />
                  ))}
                </div>
                {isSingleAttempt ? (
                  <p className="text-xs text-muted-foreground">
                    Không thể nộp muộn vì số lượt làm tối đa được đặt là 1.
                  </p>
                ) : null}
                {proctoringForcedOff ? <p className="text-xs text-muted-foreground">Giám sát AI được tự động tắt vì bài kiểm tra không giới hạn thời gian hoặc lượt làm.</p> : null}

                <Separator />
                <div className="grid gap-4 lg:grid-cols-3">
                  {effectiveProctoring ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-3 lg:col-span-2">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <Label className="text-sm font-medium">
                            <HelpedTitle
                              help={{
                                description: "Khi bật, sinh viên phải cấp webcam trước khi vào bài. Ảnh tự xóa sau 30 ngày.",
                                usedBy: "Hệ thống tự chụp 1 ảnh webcam (kèm ảnh màn hình nếu bật) mỗi khi phát hiện: chuyển tab, thoát toàn màn hình, dán nội dung từ ngoài vào bài thi, hoặc không thao tác chuột/bàn phím quá lâu.",
                                note: "Ngoài ra còn có các mốc chụp định kỳ theo thời gian làm bài (mặc định 0/25/50/75/100%), không phụ thuộc vào việc sinh viên có vi phạm hay không.",
                              }}
                            >
                              Ghi nhận bằng chứng giám sát trong khi thi
                            </HelpedTitle>
                          </Label>
                        </div>
                        <Switch checked={form.webcamEvidenceEnabled} onCheckedChange={(v) => set("webcamEvidenceEnabled", v)} aria-label="Bật bằng chứng webcam" />
                      </div>

                      <div className="space-y-3 border-t border-amber-200 pt-3">
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                            <div className="space-y-1">
                              <Label className="text-xs">
                                <HelpedTitle help="Không di chuột/gõ phím quá thời gian này sẽ được ghi nhận là một sự kiện nghi vấn.">
                                  Ngưỡng không thao tác
                                </HelpedTitle>
                              </Label>
                              <DurationInput
                                defaultUnit="s"
                                minSeconds={1}
                                valueSeconds={Number(form.webcamEvidenceMouseIdleThresholdSeconds) || 0}
                                onChangeSeconds={(seconds) => set("webcamEvidenceMouseIdleThresholdSeconds", String(seconds))}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">
                                <HelpedTitle
                                  help={{
                                    description: "Thông số kỹ thuật, không phải quy tắc \"cho phép vi phạm N lần\" — mọi vi phạm đều được ghi nhận đầy đủ.",
                                    note: "Đây chỉ là khoảng nghỉ tối thiểu giữa 2 lần chụp ảnh cùng loại sự kiện, để tránh chụp dồn dập hàng chục ảnh trong vài giây khi sự kiện lặp lại liên tục (vd. tab bị nháy nhiều lần do trình duyệt). Không cần chỉnh nếu không rõ tác dụng — giá trị mặc định là đủ dùng.",
                                  }}
                                >
                                  Cooldown giữa 2 lần chụp
                                </HelpedTitle>
                              </Label>
                              <DurationInput
                                defaultUnit="s"
                                minSeconds={1}
                                valueSeconds={Number(form.webcamEvidenceCooldownSeconds) || 0}
                                onChangeSeconds={(seconds) => set("webcamEvidenceCooldownSeconds", String(seconds))}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">
                                <HelpedTitle help="Để trống: hệ thống tự chụp 5 mốc theo % thời gian làm bài (0%, 25%, 50%, 75%, 100%). Nhập giá trị để chụp đều đặn theo chu kỳ cố định — ảnh cuối luôn được thêm đúng lúc kết thúc bài thi kể cả khi không tròn chu kỳ.">
                                  Chụp định kỳ mỗi
                                </HelpedTitle>
                              </Label>
                              <DurationInput
                                defaultUnit="m"
                                minSeconds={1}
                                placeholder="Mặc định"
                                valueSeconds={Number(form.webcamEvidenceScheduledIntervalSeconds) || 0}
                                onChangeSeconds={(seconds) => set("webcamEvidenceScheduledIntervalSeconds", String(seconds))}
                              />
                            </div>
                          </div>
                          <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-white/60 p-3">
                            <div className="flex items-center gap-2">
                              <Camera className="h-4 w-4 text-muted-foreground" />
                              <Monitor className="h-4 w-4 text-muted-foreground" />
                              <div>
                                <Label className="text-sm font-medium">Bật chụp màn hình song song</Label>
                                <p className="text-xs text-muted-foreground">Mỗi lần chụp bằng chứng sẽ lấy đồng thời 1 ảnh webcam và 1 ảnh toàn bộ màn hình.</p>
                              </div>
                            </div>
                            <Switch checked={form.screenCaptureEnabled} onCheckedChange={(v) => set("screenCaptureEnabled", v)} aria-label="Bật chụp màn hình song song" />
                          </div>
                      </div>
                    </div>
                  ) : null}

                  <div className={cn("space-y-4", effectiveProctoring ? "lg:col-span-1" : "lg:col-span-3")}>
                    <div>
                      <Label className="text-base font-semibold">
                        Xem lại & công bố kết quả
                      </Label>
                      <p className="text-xs text-muted-foreground mt-1">
                        Gồm 2 phần: khi nào kết quả được công bố, và có hiển thị phản hồi của giảng viên hay không.
                      </p>
                    </div>

                    <SettingToggleRow
                      icon={<Eye className="h-4 w-4 text-primary" />}
                      title="Công bố kết quả ngay sau khi nộp"
                      help="Chỉ áp dụng cho bài chấm hoàn toàn tự động. Nếu có câu tự luận/chấm tay, giảng viên vẫn phải công bố thủ công sau khi chấm xong."
                      checked={form.showResultImmediately}
                      onCheckedChange={(v) => set("showResultImmediately", v)}
                    />

                    <SettingToggleRow
                      icon={<Eye className="h-4 w-4 text-primary" />}
                      title="Cho phép sinh viên xem lại bài làm"
                      help="Độc lập với việc công bố điểm. Khi bật, sinh viên luôn xem được nội dung câu hỏi và câu trả lời của mình ở trang chi tiết chấm điểm (đáp án đúng/nhận xét vẫn theo đúng lịch công bố như bình thường). Khi tắt, trang đó chỉ hiện các thẻ tổng quan điểm — không hiện danh sách câu hỏi/câu trả lời, kể cả sau khi đã công bố kết quả."
                      checked={reviewSettingsDraft.allowSubmissionReview}
                      onCheckedChange={(checked) =>
                        setReviewSettingsDraft((draft) => ({ ...draft, allowSubmissionReview: checked }))
                      }
                    />

                    <div className="rounded-lg border p-3 space-y-3">
                      <div className="text-sm font-medium">
                        <HelpedTitle
                          help={{
                            description: "Trong khi làm bài: hiện giải thích đáp án (viết sẵn khi tạo câu hỏi, giống nhau cho mọi sinh viên) ngay sau khi trả lời từng câu — dùng cho luyện tập, không cần biết đúng/sai trước.",
                            note: "Sau khi có kết quả: hiện giải thích đáp án (câu tự động chấm) và nhận xét riêng của giảng viên (câu tự luận đã chấm tay). Điểm, đúng/sai và đáp án đúng luôn hiện đầy đủ sau khi công bố, và luôn ẩn trong lúc đang thi.",
                          }}
                        >
                          Hiển thị giải thích đáp án & nhận xét
                        </HelpedTitle>
                      </div>
                      <div className="flex flex-col gap-2">
                        <label className="flex items-center gap-2 text-sm">
                          <Switch
                            checked={reviewSettingsDraft.feedbackDuring}
                            onCheckedChange={(checked) =>
                              setReviewSettingsDraft((draft) => ({ ...draft, feedbackDuring: checked }))
                            }
                          />
                          Trong khi làm bài
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <Switch
                            checked={reviewSettingsDraft.feedbackAfter}
                            onCheckedChange={(checked) =>
                              setReviewSettingsDraft((draft) => ({ ...draft, feedbackAfter: checked }))
                            }
                          />
                          Sau khi có kết quả
                        </label>
                      </div>
                      {reviewSettingsDraft.feedbackDuring ? (
                        <p className="text-xs text-muted-foreground">
                          Chỉ áp dụng với câu tự động chấm. Vì giải thích thường nói rõ đáp án đúng, chỉ nên bật khi cả lớp thi cùng lúc hoặc bài không tính điểm — nếu đề mở theo khung giờ dài, sinh viên làm sau có thể được người làm trước kể lại.
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              </CardContent>
            </>
          )}

          {step === "questions" && (
            <>
              <CardHeader>
                <CardTitle>Nguồn câu hỏi</CardTitle>
                <CardDescription>
                  Kết hợp câu hỏi từ nhiều nguồn. Đổi tab không làm mất câu hỏi đã thêm.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!questionSourceMode ? (
                  <button
                    type="button"
                    onClick={() => setQuestionSourceMode("choose")}
                    className="group flex min-h-56 w-full flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-primary/35 bg-primary/[0.03] transition hover:border-primary hover:bg-primary/[0.07]"
                  >
                    <span className="flex h-20 w-20 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition group-hover:scale-105">
                      <Plus className="h-10 w-10" />
                    </span>
                    <span className="text-lg font-semibold">Thêm nguồn câu hỏi</span>
                    <span className="max-w-md text-sm text-muted-foreground">
                      Enter questions, select exact bank questions, or randomize from topic pools.
                    </span>
                  </button>
                ) : (
                  <div className="space-y-5">
                    <div className="grid gap-1 rounded-xl bg-muted p-1 md:grid-cols-3">
                      {([
                        ["manual", "Nhập trực tiếp", "Soạn câu hỏi cố định cho bài thi này.", FileText],
                        ["bank-select", "Chọn từ ngân hàng", "Chọn chủ đề, lọc rồi đánh dấu câu hỏi cần dùng.", Database],
                        ["bank-random", "Ngẫu nhiên theo chủ đề", "Đặt số lượng theo chủ đề cho từng lượt thi ngẫu nhiên.", Sparkles],
                      ] as const).map(([key, title, description, Icon]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => {
                            setQuestionSourceMode(key);
                            set("sourceMethod", key === "manual" ? "import" : "bank");
                          }}
                          className={`rounded-lg px-4 py-3 text-left transition ${
                            questionSourceMode === key
                              ? "bg-background text-foreground shadow-sm"
                              : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
                          }`}
                        >
                          <span className="flex items-center gap-2 text-sm font-semibold">
                            <Icon className="h-4 w-4" />
                            {title}
                            {key === "manual" && aiGeneratedQuestions.length > 0 && <Badge>{aiGeneratedQuestions.length}</Badge>}
                            {key === "bank-select" && selectedBankQuestionIds.length > 0 && <Badge>{selectedBankQuestionIds.length}</Badge>}
                            {key === "bank-random" && randomQuestionCount > 0 && <Badge>{randomQuestionCount}</Badge>}
                          </span>
                          <span className="mt-1 block text-xs">{description}</span>
                        </button>
                      ))}
                    </div>

                    <div className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-4">
                      <div>
                        <p className="text-xs text-muted-foreground">Tổng số câu hỏi</p>
                        <p className="text-2xl font-bold">{composedQuestionCount}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Nhập trực tiếp</p>
                        <p className="text-lg font-semibold">{aiGeneratedQuestions.length}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Chọn từ ngân hàng</p>
                        <p className="text-lg font-semibold">{selectedBankQuestionIds.length}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Ngẫu nhiên theo chủ đề</p>
                        <p className="text-lg font-semibold">{randomQuestionCount}</p>
                      </div>
                    </div>

                    {questionSourceMode === "manual" && (
                      <div className="space-y-4">
                        <Card>
                          <CardContent className="flex flex-wrap items-end gap-4 pt-5">
                            <div className="min-w-[220px] flex-1 space-y-1.5">
                              <Label className="text-xs text-muted-foreground">
                                <HelpedTitle
                                  help={{
                                    description: "Gắn câu hỏi vào chủ đề kiến thức trong khóa học.",
                                    usedBy: "Dùng khi tạo câu hỏi thủ công, lọc ngân hàng câu hỏi và phân tích điểm yếu theo chủ đề.",
                                    note: "Chủ đề càng rõ thì việc sinh đề và thống kê sau bài thi càng chính xác.",
                                  }}
                                >
                                  Chủ đề
                                </HelpedTitle>
                              </Label>
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => manualTopics.setShowTopicDialog(true)}
                                disabled={!form.course}
                                className="w-full justify-start text-left font-normal"
                              >
                                {manualTopicId
                                  ? manualTopics.availableTopics.find((t) => t.id === manualTopicId)?.name || "Chủ đề không xác định"
                                  : "Chọn hoặc tạo chủ đề..."}
                              </Button>
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs text-muted-foreground"><HelpedTitle help={{
                                description: "Mức độ khó dự kiến của câu hỏi thủ công.",
                                usedBy: "Dùng để cân bằng đề và hỗ trợ phân tích chất lượng câu hỏi sau khi có bài làm.",
                                note: "Độ khó là nhãn ban đầu, có thể khác với độ khó thực tế khi sinh viên làm bài.",
                              }}>Độ khó</HelpedTitle></Label>
                              <div className="flex gap-2">
                                {(
                                  [
                                    { key: "easy", label: "Dễ", active: "border-green-600 bg-green-600 text-white hover:bg-green-600", idle: "border-green-200 text-green-700 hover:bg-green-50" },
                                    { key: "medium", label: "Trung bình", active: "border-amber-500 bg-amber-500 text-white hover:bg-amber-500", idle: "border-amber-200 text-amber-700 hover:bg-amber-50" },
                                    { key: "hard", label: "Khó", active: "border-red-600 bg-red-600 text-white hover:bg-red-600", idle: "border-red-200 text-red-700 hover:bg-red-50" },
                                  ] as const
                                ).map(({ key, label, active, idle }) => (
                                  <Button
                                    key={key}
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setManualDifficulty(key)}
                                    className={manualDifficulty === key ? active : idle}
                                  >
                                    {label}
                                  </Button>
                                ))}
                              </div>
                            </div>
                            <Button type="button" onClick={addManualQuestion}>
                              <Plus className="mr-2 h-4 w-4" /> Thêm vào bài thi
                            </Button>
                          </CardContent>
                        </Card>

                        <div className="space-y-4">
                          <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
                          <Card className="border-primary/20 bg-primary/5">
                            <CardHeader className="pb-3">
                              <div className="flex items-center gap-2">
                                <Sparkles className="h-5 w-5 text-primary" />
                                <CardTitle className="text-base text-primary">
                                  <HelpedTitle help={{
                                    description: "Tạo bản nháp câu hỏi bằng AI dựa trên mô tả bạn nhập.",
                                    usedBy: "Sau khi tạo, bạn vẫn xem lại và chỉnh sửa nội dung trước khi thêm vào bài thi.",
                                    note: "Cần chọn học phần ở phần Thông tin cơ bản trước khi dùng.",
                                  }}>
                                    Trợ lý AI
                                  </HelpedTitle>
                                </CardTitle>
                              </div>
                            </CardHeader>
                            <CardContent className="space-y-3">
                              <div className="flex flex-col gap-2 sm:flex-row">
                                <Input
                                  value={manualAiPrompt}
                                  onChange={(event) => setManualAiPrompt(event.target.value)}
                                  placeholder="Ví dụ: Lập chỉ mục cơ sở dữ liệu, cô lập giao dịch..."
                                  className="bg-background"
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") handleManualAiGenerate();
                                  }}
                                />
                                <Button
                                  type="button"
                                  onClick={handleManualAiGenerate}
                                  disabled={isManualAiGenerating || !manualAiPrompt.trim() || !form.course}
                                  className="gap-2"
                                >
                                  {isManualAiGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                                  Tạo
                                </Button>
                              </div>
                              {!form.course && (
                                <p className="text-xs text-amber-600">Chọn học phần ở phần Thông tin cơ bản để bật tạo câu hỏi bằng AI.</p>
                              )}
                              {manualAiSimilarityWarning && (
                                <p className="text-xs text-red-600 font-medium">{manualAiSimilarityWarning}</p>
                              )}
                            </CardContent>
                          </Card>

                          <Card>
                            <CardHeader className="pb-3">
                              <CardTitle className="text-base">
                                <HelpedTitle help={{
                                  description: "Xác định dạng trả lời của câu hỏi được thêm thủ công vào đề.",
                                  usedBy: "Giảng viên chọn trước khi nhập nội dung để hệ thống hiển thị đúng vùng đáp án, ghép đôi, sắp xếp hoặc tự luận.",
                                  note: "Khi đổi dạng câu hỏi, hãy kiểm tra lại đáp án và giải thích trước khi thêm vào đề.",
                                }}>
                                  Loại câu hỏi
                                </HelpedTitle>
                              </CardTitle>
                            </CardHeader>
                            <CardContent>
                              <Select
                                value={manualQuestionType}
                                onValueChange={(value) => {
                                  setManualQuestionType(value);
                                  setManualPinnedOptions(new Set());
                                }}
                              >
                                <SelectTrigger className="w-full sm:w-[280px]"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="multiple_choice">Trắc nghiệm nhiều lựa chọn</SelectItem>
                                  <SelectItem value="true_false">Đúng / Sai</SelectItem>
                                  <SelectItem value="fill_blank">Điền vào chỗ trống</SelectItem>
                                  <SelectItem value="matching">Ghép đôi</SelectItem>
                                  <SelectItem value="ordering">Sắp xếp theo thứ tự</SelectItem>
                                  <SelectItem value="find_error">Tìm lỗi sai</SelectItem>
                                  <SelectItem value="essay">Trả lời ngắn / Tự luận</SelectItem>
                                </SelectContent>
                              </Select>
                            </CardContent>
                          </Card>
                          </div>

                          <Card>
                            <CardHeader className="pb-3">
                              <CardTitle className="text-base">Nội dung câu hỏi</CardTitle>
                              <CardDescription>Nhập nội dung hiển thị cho sinh viên.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                              {manualQuestionType === "fill_blank" && <FillBlankGuide />}
                              <RichTextEditor
                                value={manualQuestionContent}
                                onChange={(val) => setManualQuestionContent(val)}
                                placeholder="Nhập nội dung câu hỏi tại đây..."
                                rows={4}
                              />

                              <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2">
                                  <Switch
                                    checked={manualHasMedia}
                                    onCheckedChange={handleManualMediaToggle}
                                  />
                                  <Label>Đính kèm phương tiện</Label>
                                </div>
                                {manualHasMedia && (() => {
                                  const lockedType = manualMediaAttachment?.mediaType ?? manualMediaType;
                                  return (
                                    <div className="flex gap-2">
                                      <Button
                                        type="button"
                                        variant={lockedType === "image" ? "default" : "outline"}
                                        size="sm"
                                        disabled={!!manualMediaAttachment}
                                        onClick={() => handleManualMediaTypeChange("image")}
                                        className="gap-1"
                                      >
                                        <Image className="h-3.5 w-3.5" /> Ảnh
                                      </Button>
                                      <Button
                                        type="button"
                                        variant={lockedType === "audio" ? "default" : "outline"}
                                        size="sm"
                                        disabled={!!manualMediaAttachment}
                                        onClick={() => handleManualMediaTypeChange("audio")}
                                        className="gap-1"
                                      >
                                        <Music className="h-3.5 w-3.5" /> Âm thanh
                                      </Button>
                                      {manualMediaAttachment && (
                                        <p className="self-center text-[10px] text-muted-foreground">
                                          Xoá tệp để đổi loại đính kèm
                                        </p>
                                      )}
                                    </div>
                                  );
                                })()}
                              </div>

                              {manualHasMedia && (
                                <div
                                  className="rounded-lg border-2 border-dashed border-muted p-6 text-center"
                                  onDragOver={(event) => event.preventDefault()}
                                  onDrop={(event) => {
                                    event.preventDefault();
                                    void handleManualMediaFile(event.dataTransfer.files?.[0]);
                                  }}
                                >
                                  <input
                                    ref={manualMediaFileInputRef}
                                    type="file"
                                    accept={MEDIA_ACCEPT[manualMediaAttachment?.mediaType ?? manualMediaType]}
                                    className="hidden"
                                    onChange={(event) => {
                                      void handleManualMediaFile(event.target.files?.[0]);
                                      event.target.value = "";
                                    }}
                                  />
                                  {manualMediaAttachment ? (
                                    <div className="space-y-2">
                                      {manualMediaAttachment.mediaType === "image" ? (
                                        <img
                                          src={manualMediaAttachment.mediaUrl}
                                          alt="Xem trước tệp đính kèm"
                                          className="mx-auto max-h-32 rounded-md object-contain"
                                        />
                                      ) : (
                                        <audio src={manualMediaAttachment.mediaUrl} controls className="mx-auto" />
                                      )}
                                      <p className="text-xs text-muted-foreground">
                                        {(manualMediaAttachment.mediaSizeBytes / 1024).toFixed(0)} KB
                                      </p>
                                      <div className="flex justify-center gap-2">
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          disabled={manualMediaUploading}
                                          onClick={() => manualMediaFileInputRef.current?.click()}
                                        >
                                          Chọn tệp khác
                                        </Button>
                                        <Button type="button" variant="ghost" size="sm" onClick={handleManualRemoveMediaAttachment}>
                                          Xoá
                                        </Button>
                                      </div>
                                    </div>
                                  ) : (
                                    <>
                                      <p className="text-sm text-muted-foreground">
                                        Kéo thả {manualMediaType === "image" ? "một hình ảnh" : "một tệp âm thanh"} vào đây, hoặc nhấn để chọn tệp
                                      </p>
                                      <p className="mt-1 text-[11px] text-muted-foreground">
                                        {manualMediaType === "image"
                                          ? `Tối đa ${MEDIA_MAX_BYTES.image / (1024 * 1024)}MB, PNG/JPEG/WEBP`
                                          : `Tối đa ${MEDIA_MAX_BYTES.audio / (1024 * 1024)}MB, MP3/WAV`}
                                      </p>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="mt-2"
                                        disabled={manualMediaUploading}
                                        onClick={() => manualMediaFileInputRef.current?.click()}
                                      >
                                        {manualMediaUploading ? (
                                          <>
                                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Đang tải lên...
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
                            questionType={manualQuestionType}
                            options={manualOptions}
                            multipleAnswers={manualMultipleAnswers}
                            tfAnswer={manualTrueFalseAnswer}
                            essayRubric={manualEssayRubric}
                            pinnedOptions={manualPinnedOptions}
                            onMultipleAnswersChange={setManualMultipleAnswers}
                            onTfAnswerChange={setManualTrueFalseAnswer}
                            onEssayRubricChange={setManualEssayRubric}
                            onAddOption={addManualOption}
                            onRemoveOption={removeManualOption}
                            onUpdateOption={updateManualOption}
                            onReplaceOptions={setManualOptions}
                            onUpdateMatch={updateManualOptionMatch}
                            onMoveOption={moveManualOption}
                            onToggleCorrect={toggleManualCorrectOption}
                            onTogglePinned={toggleManualPinnedOption}
                          />

                          <Card>
                            <CardHeader className="pb-3">
                              <CardTitle className="text-base">Giải thích (không bắt buộc)</CardTitle>
                            </CardHeader>
                            <CardContent>
                              <Textarea
                                value={manualExplanation}
                                onChange={(event) => setManualExplanation(event.target.value)}
                                placeholder="Giải thích vì sao đáp án này đúng..."
                              />
                            </CardContent>
                          </Card>
                        </div>

                        {aiGeneratedQuestions.length > 0 && (
                          <Card>
                            <CardHeader className="pb-3">
                              <CardTitle className="text-base">Câu hỏi đã thêm ({aiGeneratedQuestions.length})</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                              {aiGeneratedQuestions.map((question, index) => (
                                <div key={`${question.content}-${index}`} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                                  <div>
                                    <p className="text-sm font-medium">Q{index + 1}. {question.content}</p>
                                    <p className="text-xs text-muted-foreground">{question.type}</p>
                                  </div>
                                  <Button type="button" variant="ghost" size="sm" onClick={() => setAiGeneratedQuestions((questions) => questions.filter((_, itemIndex) => itemIndex !== index))}>
                                    Xoá
                                  </Button>
                                </div>
                              ))}
                            </CardContent>
                          </Card>
                        )}
                      </div>
                    )}

                    {questionSourceMode === "bank-select" && (
                      <div className="space-y-4 rounded-xl border p-5">
                        <div>
                          <Label>
                            <HelpedTitle
                              help={{
                                description: "Chọn chủ đề để giới hạn danh sách câu hỏi theo nhóm kiến thức cần đưa vào đề.",
                                usedBy: "Dùng khi lấy câu hỏi từ ngân hàng thay vì tạo mới.",
                                note: "Chọn đúng chủ đề giúp đề thi bám sát phạm vi ôn tập và mục tiêu đánh giá.",
                              }}
                            >
                              Chọn chủ đề trước
                            </HelpedTitle>
                          </Label>
                          <Select value={selectedBankTopicId} onValueChange={setSelectedBankTopicId}>
                            <SelectTrigger className="mt-1"><SelectValue placeholder="Chọn chủ đề" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__all__">Tất cả câu hỏi trong học phần</SelectItem>
                              {bankTopics.filter((topic) => topic.topicId).map((topic) => (
                                <SelectItem key={topic.topicId} value={topic.topicId}>{topic.topic} ({topic.count})</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {selectedBankTopicId && (
                          <>
                            <div className="grid gap-4 md:grid-cols-2">
                              <div>
                                <Label>
                                  <HelpedTitle
                                    help={{
                                      description: "Lọc ngân hàng theo dạng câu hỏi như trắc nghiệm, đúng/sai hoặc tự luận.",
                                      usedBy: "Dùng khi muốn đề thi có đúng cấu trúc câu hỏi đã thiết kế.",
                                      note: "Nếu chọn quá hẹp, số câu khả dụng có thể không đủ cho đề.",
                                    }}
                                  >
                                    Loại câu hỏi
                                  </HelpedTitle>
                                </Label>
                                <Select value={form.questionType} onValueChange={(value) => set("questionType", value)}>
                                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {QUESTION_TYPE_OPTIONS.filter((type) => type.value !== "custom").map((type) => (
                                      <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div>
                                <Label>
                                  <HelpedTitle
                                    help={{
                                      description: "Lọc câu hỏi theo mức độ khó đã gắn trong ngân hàng.",
                                      usedBy: "Dùng để cân bằng đề hoặc tạo đề theo một mức độ cụ thể.",
                                      note: "Số lượng câu mỗi mức phụ thuộc vào dữ liệu ngân hàng hiện có.",
                                    }}
                                  >
                                    Độ khó
                                  </HelpedTitle>
                                </Label>
                                <Select value={form.bankDifficulty} onValueChange={(value) => set("bankDifficulty", value)}>
                                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="mixed">Trộn tất cả mức độ</SelectItem>
                                    <SelectItem value="easy">Dễ</SelectItem>
                                    <SelectItem value="medium">Trung bình</SelectItem>
                                    <SelectItem value="hard">Khó</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                            {!isLoadingBankQuestions && filteredBankQuestions.length > 0 && (
                              <div className="flex items-center justify-between">
                                <p className="text-xs text-muted-foreground">{versionReadyBankQuestions.length} câu hỏi sẵn sàng{filteredBankQuestions.length > versionReadyBankQuestions.length ? ` · ${filteredBankQuestions.length - versionReadyBankQuestions.length} câu cần chuẩn hóa phiên bản` : ""}</p>
                                <Button type="button" variant="outline" size="sm" onClick={toggleSelectAllBankQuestions}>
                                  {isAllFilteredBankQuestionsSelected ? "Bỏ chọn tất cả" : "Chọn tất cả"}
                                </Button>
                              </div>
                            )}
                            <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
                              {isLoadingBankQuestions ? (
                                <p className="py-8 text-center text-sm text-muted-foreground">Đang tải câu hỏi...</p>
                              ) : filteredBankQuestions.map((question) => {
                                const checked = selectedBankQuestionIds.includes(question.id);
                                return (
                                  <label key={question.id} className={`flex items-start gap-3 rounded-lg border p-3 ${question.isVersionReady ? "cursor-pointer" : "cursor-not-allowed opacity-60"} ${checked ? "border-primary bg-primary/5" : ""}`}>
                                    <Checkbox
                                      checked={checked}
                                      disabled={!question.isVersionReady}
                                      onCheckedChange={(value) => setSelectedBankQuestionIds((ids) => value && question.isVersionReady ? [...new Set([...ids, question.id])] : ids.filter((id) => id !== question.id))}
                                    />
                                    <div className="min-w-0 flex-1">
                                      <p className="flex items-center gap-1.5 text-sm font-medium">
                                        {question.mediaType === "image" ? (
                                          <Image className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Câu hỏi có hình ảnh đính kèm" />
                                        ) : question.mediaType === "audio" ? (
                                          <Music className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Câu hỏi có âm thanh đính kèm" />
                                        ) : null}
                                        <span className="min-w-0 truncate">{question.content}</span>
                                      </p>
                                      <div className="mt-2 flex gap-2">
                                        <Badge variant="outline">{question.type}</Badge>
                                        <Badge variant="outline">{difficultyLabelViFromValue(question.difficulty)}</Badge>
                                        {!question.isVersionReady ? <Badge variant="destructive">Cần chuẩn hóa phiên bản</Badge> : null}
                                      </div>
                                    </div>
                                  </label>
                                );
                              })}
                            </div>
                            <p className="text-sm font-medium">{selectedBankQuestionIds.length} câu hỏi đã chọn</p>
                          </>
                        )}
                      </div>
                    )}

                    {questionSourceMode === "bank-random" && (
                      <div className="space-y-4 rounded-xl border p-5">
                        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                          Số lượng câu hỏi theo mỗi chủ đề sẽ được lưu làm chính sách trộn ngẫu nhiên cho từng lượt thi của sinh viên.
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                          <div>
                            <Label>
                              <HelpedTitle help="Phân loại cách trả lời của câu hỏi, dùng khi tạo đề và phân tích kết quả.">
                                Loại câu hỏi
                              </HelpedTitle>
                            </Label>
                            <Select value={form.questionType} onValueChange={(value) => set("questionType", value)}>
                              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                              <SelectContent>{QUESTION_TYPE_OPTIONS.filter((type) => type.value !== "custom").map((type) => <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>
                              <HelpedTitle help="Mức độ khó của câu hỏi, dùng để phân loại và hỗ trợ phân tích.">
                                Độ khó
                              </HelpedTitle>
                            </Label>
                            <Select value={form.bankDifficulty} onValueChange={(value) => set("bankDifficulty", value)}>
                              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                              <SelectContent><SelectItem value="mixed">Trộn tất cả mức độ</SelectItem><SelectItem value="easy">Dễ</SelectItem><SelectItem value="medium">Trung bình</SelectItem><SelectItem value="hard">Khó</SelectItem></SelectContent>
                            </Select>
                          </div>
                        </div>
                        <p className="text-sm font-medium">
                          Số câu hỏi ngẫu nhiên: {randomQuestionCount} câu
                        </p>
                        <div className="space-y-2">
                          {bankTopics.map((topic) => (
                            <label key={topic.topicId || topic.topic} className={`flex items-center gap-3 rounded-lg border p-3 ${topic.selected ? "border-primary bg-primary/5" : ""}`}>
                              <Checkbox checked={topic.selected} onCheckedChange={(value) => setBankTopics((topics) => topics.map((item) => item.topicId === topic.topicId ? { ...item, selected: Boolean(value), requestedCount: value ? (item.requestedCount === "0" ? "1" : item.requestedCount) : "0" } : item))} />
                              <div className="flex-1"><p className="text-sm font-medium">{topic.topic}</p><p className="text-xs text-muted-foreground">{topic.count} câu khả dụng</p></div>
                              <Input className="w-24" type="number" min={0} value={topic.requestedCount} onChange={(event) => setBankTopics((topics) => topics.map((item) => item.topicId === topic.topicId ? { ...item, requestedCount: sanitizeNumericInput(event.target.value, { min: 0 }), selected: Number(event.target.value || 0) > 0 } : item))} />
                            </label>
                          ))}
                        </div>
                        {bankSelectionWarning && <p className="text-xs font-medium text-amber-600">{bankSelectionWarning}</p>}
                      </div>
                    )}
                  </div>
                )}

              </CardContent>
            </>
          )}

          {step === "preview" && (
            <>
              <CardHeader>
                <CardTitle>Xem trước bài thi</CardTitle>
                <CardDescription>
                  Kiểm tra toàn bộ cài đặt trước khi tạo bài thi.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-sm">
                    <div className="flex items-center gap-2 border-b pb-3">
                      <FileText className="h-4 w-4 text-primary" />
                      <p className="text-sm font-semibold">Nội dung & lịch thi</p>
                    </div>
                    <PreviewField label="Tiêu đề" value={form.title || "—"} />
                    <PreviewField
                      label="Khóa học"
                      value={
                        courses.find((course) => course.id === form.course)?.code
                          ? `${courses.find((course) => course.id === form.course)?.code} - ${courses.find((course) => course.id === form.course)?.name}`
                          : "—"
                      }
                    />
                    <PreviewField label="Mô tả" value={form.description || "—"} />
                    <PreviewField
                      label="Câu hỏi"
                      value={`${composedQuestionCount} câu (${aiGeneratedQuestions.length} trực tiếp + ${selectedBankQuestionIds.length} đã chọn + ${randomQuestionCount} ngẫu nhiên)`}
                    />
                    <PreviewField label="Thời lượng" value={`${form.duration} phút`} highlight />
                    <PreviewField
                      label="Khung giờ thi"
                      value={`${form.startDate} ${form.startTime} → ${form.endDate} ${form.endTime}`}
                    />
                    <PreviewField
                      label="Số lần làm tối đa"
                      value={hasUnlimitedAttempts ? "Không giới hạn" : (form.maxAttempts || "1")}
                      highlight
                    />
                  </div>

                  <div className="flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-sm">
                    <div className="flex items-center gap-2 border-b pb-3">
                      <Shield className="h-4 w-4 text-primary" />
                      <p className="text-sm font-semibold">Chấm điểm & giám sát</p>
                    </div>
                    <PreviewField label="Cách tính điểm" value={getGradingStrategyLabel(form.gradingStrategy)} />
                    <PreviewField label="Điểm đạt" value={`${form.passingScore}%`} highlight />
                    <PreviewField label="Giám sát AI" value={form.requiresProctoring ? "Đã bật" : "Đã tắt"} highlight />
                    <PreviewField
                      label="Nộp muộn"
                      value={
                        isSingleAttempt
                          ? "Bị khóa (số lần làm tối đa = 1)"
                          : form.allowLateSubmission
                            ? "Cho phép"
                            : "Không cho phép"
                      }
                    />
                    <PreviewField label="Xáo trộn câu hỏi" value={form.shuffleQuestions ? "Có" : "Không"} />
                    <PreviewField
                      label="Giải thích & nhận xét"
                      value={
                        [
                          reviewSettingsDraft.feedbackDuring ? "Trong khi làm bài" : null,
                          reviewSettingsDraft.feedbackAfter ? "Sau khi có kết quả" : null,
                        ]
                          .filter(Boolean)
                          .join(", ") || "Không hiển thị"
                      }
                    />
                    <PreviewField
                      label="Công bố kết quả"
                      value={
                        form.showResultImmediately
                          ? "Tự động ngay sau khi nộp (chỉ bài chấm tự động)"
                          : "Giảng viên công bố thủ công"
                      }
                    />
                    <PreviewField
                      label="Xem lại bài làm"
                      value={reviewSettingsDraft.allowSubmissionReview ? "Cho phép" : "Không cho phép"}
                    />
                  </div>
                </div>
              </CardContent>
            </>
          )}
        </Card>

        {/* Navigation buttons */}
        <div className="flex justify-between pb-8">
          <Button
            variant="outline"
            onClick={() => {
              if (stepIdx === 0) router.push("/lecturer/exams");
              else setStep(STEPS[stepIdx - 1].key);
            }}
            className="gap-2"
          >
            <ChevronLeft className="h-4 w-4" />
            {stepIdx === 0 ? "Hủy" : "Quay lại"}
          </Button>

          {step !== "preview" ? (
            <Button
              onClick={() => setStep(STEPS[stepIdx + 1].key)}
              disabled={!canNext()}
              className="gap-2"
            >
              Tiếp tục <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              onClick={handleCreate}
              disabled={isCreating}
              className="gap-2"
            >
              {isCreating ? (
                editingExamId ? "Đang lưu…" : "Đang tạo…"
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />{" "}
                  {editingExamId ? "Lưu bài thi" : "Tạo bài thi"}
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      <QuestionTopicDialog
        open={manualTopics.showTopicDialog}
        selectedTopicId={manualTopicId}
        newTopicName={manualTopics.newTopicName}
        topicDescription={manualTopics.topicDescription}
        topicSearch={manualTopics.topicSearch}
        topics={manualTopics.filteredTopics}
        suggestions={manualTopics.topicSuggestions}
        checkingSimilarity={manualTopics.checkingTopicSimilarity}
        creatingTopic={manualTopics.creatingTopic}
        checkMessage={manualTopics.topicCheckMessage}
        onNewTopicNameChange={manualTopics.setNewTopicName}
        onTopicDescriptionChange={manualTopics.setTopicDescription}
        onTopicSearchChange={manualTopics.setTopicSearch}
        onClose={manualTopics.closeTopicDialog}
        onSelect={manualTopics.selectTopic}
        onCreate={manualTopics.createTopic}
        onCheckSimilarity={manualTopics.checkSimilarTopics}
      />
    </DashboardLayout>
  );
}



