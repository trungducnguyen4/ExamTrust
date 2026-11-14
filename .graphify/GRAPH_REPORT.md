# Graph Report - .  (2026-11-14)

## Corpus Check
- Large corpus: 733 files · ~1,153,778 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder, or use --no-semantic to run AST-only.

## Summary
- 3409 nodes · 16503 edges · 203 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output
- Edge kinds: ON_BRANCH: 7201 · MODIFIES: 2532 · imports: 1889 · contains: 1776 · imports_from: 1147 · method: 745 · calls: 733 · PARENT_OF: 370 · references: 87 · inherits: 11 · implements: 10 · rationale_for: 2


## Input Scope
- Requested: auto
- Resolved: committed (source: default-auto)
- Included files: 733 · Candidates: 799
- Excluded: 9 untracked · 112384 ignored · 1 sensitive · 0 missing committed
- Recommendation: Use --scope all or graphify.yaml inputs.corpus for a knowledge-base folder.

## Graph Freshness
- Built from Git commit: `6464c14`
- Compare this hash to `git rev-parse HEAD` before trusting freshness-sensitive graph output.
## God Nodes (most connected - your core abstractions)
1. `ApiClient` - 163 edges
2. `SubmissionsService` - 88 edges
3. `Button` - 78 edges
4. `cn()` - 68 edges
5. `Card` - 58 edges
6. `CardContent` - 58 edges
7. `QuestionsService` - 53 edges
8. `CardHeader` - 52 edges
9. `CardTitle` - 51 edges
10. `DashboardLayout()` - 49 edges

## Surprising Connections (you probably didn't know these)
- `02b1de4 Pagination` --PARENT_OF--> `4e55692 Merge pull request #23 from OAB710/main`  [EXTRACTED]
  git → git  _Bridges community 0 → community 22_
- `0391dc3 mang project tu repo cu qua` --ON_BRANCH--> `hotfix/EX-029-filter-panel-syntax`  [EXTRACTED]
  git → git  _Bridges community 2 → community 0_
- `0391dc3 mang project tu repo cu qua` --PARENT_OF--> `fddcaf1 add`  [EXTRACTED]
  git → git  _Bridges community 2 → community 37_
- `06d86ad Apply gitignore and remove generated files from tracking` --PARENT_OF--> `3987c12 add`  [EXTRACTED]
  git → git  _Bridges community 0 → community 73_
- `093b6ef Merge pull request #6 from OAB710/main` --ON_BRANCH--> `bugfix/EX-033-metadata-base-env`  [EXTRACTED]
  git → git  _Bridges community 55 → community 0_

## Communities

### Community 0 - "Community 0"
Cohesion: 0.14
Nodes (288): media_user_storage_usage, bugfix/EX-033-metadata-base-env, bugfix/EX-038-optimize-dashboard-queries, chore/EX-036-warm-window, duc, feature/EX-030-skill-discovery, feature/EX-031-context-hygiene, feature/EX-032-free-cloud-deploy (+280 more)

### Community 1 - "Community 1"
Cohesion: 0.03
Nodes (1): ApiClient

### Community 2 - "Community 2"
Cohesion: 0.03
Nodes (28): courses, topics, courses, exam_snapshots, AuditModule, AuthModule, CacheModule, 0391dc3 mang project tu repo cu qua (+20 more)

### Community 3 - "Community 3"
Cohesion: 0.06
Nodes (42): ExamSecurityModal(), LiveClock(), ExamSecurityState, useExamSecurity(), clearPendingProctoringStreams(), hasPendingScreenStream(), isLive(), setPendingScreenStream() (+34 more)

### Community 4 - "Community 4"
Cohesion: 0.06
Nodes (40): AuditReportData, AutonomousAuditDialogProps, QuestionImprovementItem, AiImprovementDetail, AiImprovementStatus, AiImprovementSummary, AnalyticsCourseInfo, AttemptBreakdownItem (+32 more)

### Community 5 - "Community 5"
Cohesion: 0.06
Nodes (36): canonicalize(), canonicalStringify(), hashObject(), isPlainObject(), chooseStrategy(), generateExam(), hashJson(), hashStringToNumber() (+28 more)

### Community 6 - "Community 6"
Cohesion: 0.05
Nodes (27): ApiKeyConfigDialog(), ApiKeyConfigDialogProps, ExamData, ExamQuestion, getCorrectAnswerText(), getOptionEntries(), ExamData, ExamQuestion (+19 more)

### Community 7 - "Community 7"
Cohesion: 0.09
Nodes (1): QuestionsService

### Community 8 - "Community 8"
Cohesion: 0.07
Nodes (41): DurationInput(), useQuestionTopics(), BankQuestionOption, BankTopic, buildReviewSettingsPayload(), CourseOption, createDefaultForm(), createDefaultReviewSettingsDraft() (+33 more)

### Community 9 - "Community 9"
Cohesion: 0.04
Nodes (4): 2d105be Convert FE from embedded repository to regular folder, mocks, courses, mocks

### Community 10 - "Community 10"
Cohesion: 0.07
Nodes (36): EVIDENCE_SIGNAL_LABELS, EvidenceCapture, getEvidenceEventLabel(), IntegrityCaseDetail(), IntegrityCaseDetailProps, IntegrityTimelineEvent, FlaggedSubmission, IntegrityReason (+28 more)

### Community 11 - "Community 11"
Cohesion: 0.05
Nodes (1): SubmissionsController

### Community 12 - "Community 12"
Cohesion: 0.08
Nodes (29): metadata, Providers(), AuthProvider(), Action, ActionType, actionTypes, addToRemoveQueue(), dispatch() (+21 more)

### Community 13 - "Community 13"
Cohesion: 0.07
Nodes (22): MetricCardProps, NavLink, NavLinkBaseProps, NavLinkCompatProps, cn(), ListToolbarProps, AccordionContent, AccordionItem (+14 more)

### Community 14 - "Community 14"
Cohesion: 0.15
Nodes (2): AiService, OnModuleInit

### Community 15 - "Community 15"
Cohesion: 0.09
Nodes (27): EMPTY_FILTERS, Exam, BackendRole, BackendStatus, EMPTY_CREATE_FORM, EMPTY_EDIT_FORM, EMPTY_FILTERS, USER_FILTERS (+19 more)

### Community 16 - "Community 16"
Cohesion: 0.10
Nodes (32): 7ff6d1c Merge pull request #28 from OAB710/main, EXAM_PLANS, ExamPlan, main(), prisma, toExamStatus(), touchDemoExamToTop(), addMinutes() (+24 more)

### Community 17 - "Community 17"
Cohesion: 0.09
Nodes (18): 9765fa3 Sua lenh bot Zalo, them nut lam moi + fix cuon trang khi doi trang, DataPagination(), DataPaginationProps, Course, EMPTY_FILTERS, gradientClasses, GroupedCourses, ListPageHeader() (+10 more)

### Community 18 - "Community 18"
Cohesion: 0.09
Nodes (32): formatAttemptLimitVi(), formatDateTimeVi(), formatDateVi(), formatDurationVi(), formatNumberVi(), formatPercentVi(), formatScoreVi(), getAttemptStatusLabel() (+24 more)

### Community 19 - "Community 19"
Cohesion: 0.10
Nodes (15): 0e4348a add, 23cc713 Merge remote-tracking branch 'upstream/main', b9a4c06 add, f2db362 Refactor VI + RCM Topic + AI Summarize, AuthUser, CreateCourseDto, CreateUserDto, LoginDto (+7 more)

### Community 20 - "Community 20"
Cohesion: 0.08
Nodes (27): b8349a8 refactor code căng, DonutSegment, QuestionBankDonutStats(), QuestionBankDonutStatsProps, QuestionBankCourse, useQuestionBankData(), Params, useQuestionBankRouteState() (+19 more)

### Community 21 - "Community 21"
Cohesion: 0.10
Nodes (22): 89c42ab feat(layout): system-wide wide responsive layout refactor across 16 core pages, e4c1b1c Merge pull request #64 from trungducnguyen4/feature/EX-061-wide-responsive-layout-systemwide, BackToDashboardButton(), BackToDashboardButtonProps, ButtonSize, ButtonVariant, getSessionDevice(), groupSessionsByDevice() (+14 more)

### Community 22 - "Community 22"
Cohesion: 0.08
Nodes (21): EMPTY_FILTERS, EMPTY_PATTERNS, EMPTY_STATS, IntegrityCasesResponse, IntegrityPatterns, IntegrityStats, 4e55692 Merge pull request #23 from OAB710/main, BulkStudentImport() (+13 more)

### Community 23 - "Community 23"
Cohesion: 0.17
Nodes (30): buildBeInfoText(), buildFeInfoText(), buildPublicInfoText(), buildR2InfoText(), buildSystemOverviewConclusions(), buildSystemOverviewText(), cfGraphQL(), formatBuildStatus() (+22 more)

### Community 24 - "Community 24"
Cohesion: 0.13
Nodes (19): AiModule, GuardrailAlertBanner(), GuardrailAlertBannerProps, GuardrailResult, GuardrailValidationResult, IncompatibleDomainRule, 17c65ba feat(ai): [EX-054] implement pedagogical typography standard and topic guardrails, 5d668ba docs(rules): upgrade attack squad to diff-aware 2.0 with tailored threat vectors (+11 more)

### Community 25 - "Community 25"
Cohesion: 0.17
Nodes (13): AuthPageShell(), ThemeToggle(), useAuth(), demoAccounts, JoinStep, Alert, AlertDescription, AlertTitle (+5 more)

### Community 26 - "Community 26"
Cohesion: 0.07
Nodes (27): useIsMobile(), SheetContent, Sidebar, SidebarContent, SidebarContext, SidebarFooter, SidebarGroup, SidebarGroupAction (+19 more)

### Community 27 - "Community 27"
Cohesion: 0.11
Nodes (16): iso(), rangeFor(), Exam, Submission, User, AdminPageShell(), AdminPageShellProps, copy (+8 more)

### Community 28 - "Community 28"
Cohesion: 0.07
Nodes (3): OnModuleDestroy, OnModuleInit, SubmissionsService

### Community 29 - "Community 29"
Cohesion: 0.08
Nodes (9): buildEvidenceStorageKey(), DEFAULT_EVENT_CAPTURE_LIMITS, DEFAULT_POLICY, EventCaptureLimits, KNOWN_SIGNAL_SLUGS, OnModuleInit, ProctoringEvidenceService, SCHEDULED_CAPTURE_PERCENTAGES (+1 more)

### Community 30 - "Community 30"
Cohesion: 0.11
Nodes (1): ExamsService

### Community 31 - "Community 31"
Cohesion: 0.10
Nodes (21): AdminStatCard(), AdminStatCardProps, { academicYear: defaultAcademicYear, term: defaultTerm }, academicYearOptions, buildToken(), CourseForm, CourseItem, defaultForm (+13 more)

### Community 32 - "Community 32"
Cohesion: 0.09
Nodes (20): main(), prisma, Q, SEMANTIC, SINGLETON, TEXT_TEXT, main(), prisma (+12 more)

### Community 33 - "Community 33"
Cohesion: 0.15
Nodes (9): AdminDashboardModule, a4ea817 Merge pull request #4 from trungducnguyen4/duc, f4e10e9 add, f593a1b Merge remote-tracking branch 'upstream/main', ReviewAnomalyFlagDto, ReviewIntegrityCaseDto, RiskFlagDecision, nextConfig (+1 more)

### Community 34 - "Community 34"
Cohesion: 0.18
Nodes (13): PRIORITY_STYLES, HelpedTitle(), Props, QuestionTopicDialog(), CheckStatus, defaultExamInfo, ExamStep, SystemCheck (+5 more)

### Community 35 - "Community 35"
Cohesion: 0.09
Nodes (22): bloomOptions, ClarificationConfig, distractorOptions, Props, QuestionClarificationDialog(), styleOptions, timeOptions, GeneratedQuestion (+14 more)

### Community 36 - "Community 36"
Cohesion: 0.08
Nodes (1): QuestionDraftsController

### Community 37 - "Community 37"
Cohesion: 0.13
Nodes (20): detectAiProvider(), DetectedProvider, PROVIDER_INFO, ProviderDetectionResult, verifyApiKeyWithProvider(), buildContextLines(), buildExamTrustPromptHeader(), ExamTrustAiAnalyticsSummary (+12 more)

### Community 38 - "Community 38"
Cohesion: 0.15
Nodes (16): themes, THEME_OPTIONS, THEME_PROVIDER_OPTIONS, SortButtonProps, SortOption, Avatar, AvatarFallback, AvatarImage (+8 more)

### Community 39 - "Community 39"
Cohesion: 0.12
Nodes (20): completedStatuses, useStudentDashboardData(), COMPLETED_STATUSES, CourseExamAction, CourseExamForAction, CourseExamSubmission, ExamDisplayState, getCourseExamAction() (+12 more)

### Community 40 - "Community 40"
Cohesion: 0.12
Nodes (21): QUESTION_TYPES, QuestionType, backendEnvPath, buildSampleMediaFields(), buildTypePlan(), COURSE_QUESTION_PLAN, COURSE_TOPIC_LABELS, DupQuestion (+13 more)

### Community 41 - "Community 41"
Cohesion: 0.13
Nodes (15): AuditLog, Unit, UNIT_LABELS, UNIT_SECONDS, ExamItem, ExamLinkItem, LINK_STATE_LABELS, LinkUsage (+7 more)

### Community 42 - "Community 42"
Cohesion: 0.14
Nodes (17): AttentionItemData, AttentionPriority, LecturerAttentionResponse, LecturerAttentionSummary, LECTURER_ATTENTION_QUERY_KEY, PRIORITY_ORDER, useAttentionItems(), AuthContext (+9 more)

### Community 43 - "Community 43"
Cohesion: 0.15
Nodes (14): SessionMeta, TokenUser, NestInterceptor, PerfInterceptor, OnModuleDestroy, OnModuleInit, { PrismaClient }, PrismaService (+6 more)

### Community 44 - "Community 44"
Cohesion: 0.12
Nodes (14): d0edeff Merge pull request #46 from trungducnguyen4/feature/EX-044-langgraph-autonomous-exam-qa-squad, da20a4e add, CourseOption, Exam, GRADING_STRATEGY_LABELS, getActiveFilterCount(), SearchBar(), SearchBarProps (+6 more)

### Community 45 - "Community 45"
Cohesion: 0.09
Nodes (15): AGGREGATE_ALERT_TYPES, EMPTY_STUDENT_FILTERS, EVIDENCE_SIGNAL_LABELS, EvidenceCapture, ExamMonitor(), ExamOverview, FastCompletion, getEvidenceEventLabel() (+7 more)

### Community 46 - "Community 46"
Cohesion: 0.17
Nodes (12): GeneratedQuestion, Step, getMinError(), getNumericInputError(), hasValidNumberFormat(), NumericInputOptions, parseNumericInput(), parseNumericInputOr() (+4 more)

### Community 47 - "Community 47"
Cohesion: 0.10
Nodes (1): ExamsController

### Community 48 - "Community 48"
Cohesion: 0.13
Nodes (12): DateRangeValue, FilterChip, FilterDefinition, FilterValue, FilterValues, ListFilterOption, NumberRangeValue, TextFilterOperator (+4 more)

### Community 49 - "Community 49"
Cohesion: 0.10
Nodes (20): getIntegrityEventCategory(), getIntegrityEventLabel(), getIntegrityEventSeverity(), INTEGRITY_EVENT_LABELS, IntegrityEventCategory, ALWAYS_RECORDED_EVENT_TYPES, AUTO_GRADED_TYPES, AutosaveAnswerMeta (+12 more)

### Community 50 - "Community 50"
Cohesion: 0.11
Nodes (10): hash64(), LogSpec, main(), now, prisma, Profile, PROFILES, randomHash64() (+2 more)

### Community 51 - "Community 51"
Cohesion: 0.24
Nodes (14): 2a844fd feat(exam-lifecycle): Thiet lap Invariant Lock cau hoi khi de thi dang dien ra/ket thuc va Luu cau hoi AI tinh chinh vao Ngan hang cau hoi, 318de46 feat(security): [EX-055] Khóa cứng tầng Tool & Service Logic Guardrails chống IDOR và spam queue, 6464c14 Merge pull request #65 from trungducnguyen4/feature/EX-062-lifecycle-question-edit-lock-and-bank-save, 73a58bd Merge pull request #58 from trungducnguyen4/feature/EX-055-backend-tool-guardrails-lock, b7d1821 chore(merge): resolve merge conflicts with main and rebuild unified knowledge graph, assertExplanationLength(), assertLineContent(), assertOptionsLength() (+6 more)

### Community 52 - "Community 52"
Cohesion: 0.14
Nodes (14): typeLabels, Direction, evaluateMatrixCase(), MATRIX_27_CASES, MatrixCase, EMPTY_HISTORY_FILTERS, historyFilterDefinitions, QuestionHistoryRow (+6 more)

### Community 53 - "Community 53"
Cohesion: 0.11
Nodes (9): AttentionSection(), 0aae96f add, CourseSummary, difficultyClassName(), Exam, formatDifficulty(), QuestionBankSummary, QuestionItem (+1 more)

### Community 54 - "Community 54"
Cohesion: 0.19
Nodes (1): AuthService

### Community 55 - "Community 55"
Cohesion: 0.17
Nodes (13): 093b6ef Merge pull request #6 from OAB710/main, 36549ac AI GEN QUES, 9d34aad Merge branch 'main' into duc, f5fcba9 Merge pull request #5 from OAB710/main, f609787 feat(student): add exam schedule endpoint and student schedule page, CopyQuestionBankDto, CreateQuestionCrudDto, PreviewCopyQuestionBankDto (+5 more)

### Community 56 - "Community 56"
Cohesion: 0.15
Nodes (14): formatSignedScoreAdjustment(), getScoreAdjustmentCategoryLabel(), formatAnswerCell(), formatChoiceAnswer(), formatPoints(), formatStructuredAnswer(), GradingBreakdown(), OptionDisplay (+6 more)

### Community 57 - "Community 57"
Cohesion: 0.15
Nodes (13): EditorQuestionType, useQuestionAnswerState(), useQuestionPersistence(), CorrectAnswerPayload, EditableQuestion, QuestionDraft, QuestionOption, TopicOption (+5 more)

### Community 58 - "Community 58"
Cohesion: 0.17
Nodes (1): AuthController

### Community 59 - "Community 59"
Cohesion: 0.12
Nodes (16): AddLogsDto, AutosaveAnswerDto, AutosaveExamDto, CreateScoreAdjustmentDto, ExtendSubmissionDeadlineDto, FinalizeEvidenceCaptureDto, GradeAnswerDto, ReopenSubmissionDto (+8 more)

### Community 60 - "Community 60"
Cohesion: 0.13
Nodes (10): AnswerMatrix, EvidenceCapture, ExamOverview, ExamResultsList(), groupAnomaliesByStudent(), MonitoringGroup, RiskFlag, SubmissionTimeline (+2 more)

### Community 61 - "Community 61"
Cohesion: 0.18
Nodes (12): ContextHelp(), ContextHelpProps, HelpBody(), HelpButton, HelpContent, isHelpContent(), useTouchHelpMode(), PopoverContent (+4 more)

### Community 62 - "Community 62"
Cohesion: 0.23
Nodes (1): CoursesService

### Community 63 - "Community 63"
Cohesion: 0.19
Nodes (8): answerTitles, FillBlankGuide(), OptionRowProps, Props, QuestionAnswerEditor(), lineContentCounterText(), LineValidationResult, validateLineContent()

### Community 64 - "Community 64"
Cohesion: 0.19
Nodes (8): AiEvaluationJudge, EvalMetricResult, GOLDEN_ESSAY_GRADING_CASES, GOLDEN_QUESTION_CASES, GOLDEN_RISK_CASES, GoldenEssayGradingCase, GoldenQuestionCase, GoldenRiskAssessmentCase

### Community 65 - "Community 65"
Cohesion: 0.15
Nodes (13): { academicYear: defaultAcademicYear, term: defaultTerm }, academicYearOptions, APICourse, buildToken(), Course, CourseExamPreview, courseGradientClasses, CreateCourse() (+5 more)

### Community 66 - "Community 66"
Cohesion: 0.29
Nodes (14): ai_generation_records, course_topics, courses, exam_questions, question_course_scopes, question_drafts, question_tags, question_topics (+6 more)

### Community 68 - "Community 68"
Cohesion: 0.15
Nodes (1): EnrollmentsController

### Community 69 - "Community 69"
Cohesion: 0.27
Nodes (1): EnrollmentsService

### Community 70 - "Community 70"
Cohesion: 0.24
Nodes (1): ExamLinksService

### Community 71 - "Community 71"
Cohesion: 0.14
Nodes (6): ButtonProps, buttonVariants, CalendarProps, PaginationContent, PaginationItem, PaginationLinkProps

### Community 72 - "Community 72"
Cohesion: 0.14
Nodes (12): Carousel, CarouselApi, CarouselContent, CarouselContext, CarouselContextProps, CarouselItem, CarouselNext, CarouselOptions (+4 more)

### Community 73 - "Community 73"
Cohesion: 0.17
Nodes (4): 3987c12 add, 72d5704 add, AiSuggestion, DraftGrade

### Community 74 - "Community 74"
Cohesion: 0.22
Nodes (9): EmptyState(), PageHeader(), PageHeaderProps, EmptyStateProps, PageAction, ResponsiveColumn, StatusTone, ThemeMode (+1 more)

### Community 75 - "Community 75"
Cohesion: 0.15
Nodes (12): AIGenerateSectionDto, AIGenerationConstraintsDto, AISection, ApplyAICandidateDto, CreateQuestionDraftDto, DraftPublishMode, DraftValidationLevel, PublishQuestionDraftDto (+4 more)

### Community 76 - "Community 76"
Cohesion: 0.23
Nodes (10): FilterPanel(), FilterPanelProps, Drawer(), DrawerContent, DrawerDescription, DrawerFooter(), DrawerHeader(), DrawerOverlay (+2 more)

### Community 77 - "Community 77"
Cohesion: 0.24
Nodes (3): AuthUser, extractUploaderIdFromKey(), MediaService

### Community 78 - "Community 78"
Cohesion: 0.18
Nodes (7): BATCH_SIZE, fetchBatch(), LegacyQuestion, main(), prisma, { PrismaClient }, processQuestion()

### Community 80 - "Community 80"
Cohesion: 0.24
Nodes (7): auth_sessions, users, exam_submissions, score_adjustments, users, 13dcbd7 add, b27133b add

### Community 81 - "Community 81"
Cohesion: 0.17
Nodes (4): roleToPath, capabilityGroups, operatingPrinciples, Header()

### Community 82 - "Community 82"
Cohesion: 0.17
Nodes (1): CoursesController

### Community 83 - "Community 83"
Cohesion: 0.42
Nodes (10): asObject(), findErrorText(), formatManualAnswer(), matchingSides(), parseValue(), SCORE_ADJUSTMENT_CATEGORY_LABELS, stringList(), StructuredValue (+2 more)

### Community 84 - "Community 84"
Cohesion: 0.17
Nodes (9): FormControl, FormDescription, FormFieldContext, FormFieldContextValue, FormItem, FormItemContext, FormItemContextValue, FormLabel (+1 more)

### Community 85 - "Community 85"
Cohesion: 0.17
Nodes (10): Menubar, MenubarCheckboxItem, MenubarContent, MenubarItem, MenubarLabel, MenubarRadioItem, MenubarSeparator, MenubarSubContent (+2 more)

### Community 86 - "Community 86"
Cohesion: 0.45
Nodes (10): courses, enrollments, exam_questions, exam_submissions, exams, integrity_logs, proctoring_sessions, questions (+2 more)

### Community 87 - "Community 87"
Cohesion: 0.24
Nodes (1): AiController

### Community 88 - "Community 88"
Cohesion: 0.20
Nodes (1): CacheService

### Community 89 - "Community 89"
Cohesion: 0.24
Nodes (8): ExamSecurityModalProps, violationLabels, emptyCounts, FirstViolationNotice, UseExamSecurityOptions, UseExamSecurityResult, ViolationLog, ViolationType

### Community 90 - "Community 90"
Cohesion: 0.22
Nodes (9): COURSE_PLANS, CoursePlan, main(), prisma, daysAgo(), LECTURER_DEPARTMENTS, LECTURER_FULL_NAMES, main() (+1 more)

### Community 91 - "Community 91"
Cohesion: 0.24
Nodes (1): QueueService

### Community 92 - "Community 92"
Cohesion: 0.18
Nodes (7): ChartConfig, ChartContainer, ChartContext, ChartContextProps, ChartLegendContent, ChartTooltipContent, THEMES

### Community 93 - "Community 93"
Cohesion: 0.36
Nodes (9): anomaly_flags, exam_instances, exam_questions, exam_submissions, exams, focus_events, interaction_logs, question_versions (+1 more)

### Community 94 - "Community 94"
Cohesion: 0.24
Nodes (3): AdminDashboardService, COMPLETED, ZALO_BOT_COMMANDS

### Community 95 - "Community 95"
Cohesion: 0.24
Nodes (5): AI_SECTIONS, AiJobsService, AISectionValue, AiTaskType, CreateAiJobParams

### Community 96 - "Community 96"
Cohesion: 0.27
Nodes (3): AITelemetry, AiTelemetryService, ProviderPricing

### Community 97 - "Community 97"
Cohesion: 0.29
Nodes (4): auditChaos(), auditFeatures(), auditPerformance(), auditSecurity()

### Community 98 - "Community 98"
Cohesion: 0.29
Nodes (8): AutosaveAnswer, AutosaveSyncStatus, getQueueStorageKey(), loadQueue(), persistQueue(), safeParseQueue(), useExamAutosave(), UseExamAutosaveOptions

### Community 99 - "Community 99"
Cohesion: 0.36
Nodes (9): course_topics, courses, exist, question_tags, question_topics, questions, tags, topics (+1 more)

### Community 100 - "Community 100"
Cohesion: 0.24
Nodes (8): COLLUDE_INDICES, COLLUSION_QUESTION_INDICES, isColluder(), main(), prisma, QUESTION_SPECS, QuestionSpec, STUDENT_ID_PATTERN()

### Community 101 - "Community 101"
Cohesion: 0.33
Nodes (1): ExamRiskAssessmentService

### Community 103 - "Community 103"
Cohesion: 0.20
Nodes (8): ContextMenuCheckboxItem, ContextMenuContent, ContextMenuItem, ContextMenuLabel, ContextMenuRadioItem, ContextMenuSeparator, ContextMenuSubContent, ContextMenuSubTrigger

### Community 104 - "Community 104"
Cohesion: 0.20
Nodes (1): UsersController

### Community 105 - "Community 105"
Cohesion: 0.22
Nodes (1): UsersService

### Community 106 - "Community 106"
Cohesion: 0.39
Nodes (8): ai_generation_records, exam_submission_regrade_logs, exam_submissions, question_statistics, question_versions, questions, submission_answers, users

### Community 107 - "Community 107"
Cohesion: 0.33
Nodes (2): EmbeddingService, SemanticMatchResult

### Community 108 - "Community 108"
Cohesion: 0.22
Nodes (7): BulkStudentImportProps, COLUMN_ALIASES, ImportResult, ImportState, ParsedRow, ValidatedData, ValidationError

### Community 109 - "Community 109"
Cohesion: 0.22
Nodes (1): ExamLinksController

### Community 110 - "Community 110"
Cohesion: 0.22
Nodes (8): MEDIA_ACCEPT, MEDIA_ALLOWED_MIME_TYPES, MEDIA_MAX_BYTES, MediaAttachment, MediaAttachmentType, releaseMediaUpload(), uploadMediaFile(), validateMediaFile()

### Community 111 - "Community 111"
Cohesion: 0.47
Nodes (8): loginRequest(), main(), percentile(), runConcurrent(), runSequential(), safeJson(), summarize(), timedRequest()

### Community 112 - "Community 112"
Cohesion: 0.32
Nodes (6): HOURS_12, MINUTES, parse24(), Period, TimePickerVi(), to12()

### Community 113 - "Community 113"
Cohesion: 0.29
Nodes (5): CLIENT_RENDERING_RULES, OrderingLayer, ReferenceBinding, RenderingContract, StructuralLayer

### Community 114 - "Community 114"
Cohesion: 0.32
Nodes (1): DistributedEventsService

### Community 115 - "Community 115"
Cohesion: 0.25
Nodes (7): AuditQuestion, AuditTimelineEntry, ExamAuditReport, ExamAuditState, FlawedQuestion, QuestionImprovement, RubricScore

### Community 116 - "Community 116"
Cohesion: 0.29
Nodes (7): backendTypeByEditorType, BuildPayloadParams, buildQuestionPayload(), editorTypeByBackendType, shuffle(), toEditorDifficulty(), toEditorQuestionType()

### Community 117 - "Community 117"
Cohesion: 0.46
Nodes (1): AIGenerationProcessor

### Community 118 - "Community 118"
Cohesion: 0.25
Nodes (6): exceptions, ignoredDirectories, include, limit, oversized, root

### Community 120 - "Community 120"
Cohesion: 0.25
Nodes (5): Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage

### Community 121 - "Community 121"
Cohesion: 0.25
Nodes (7): NavigationMenu, NavigationMenuContent, NavigationMenuIndicator, NavigationMenuList, NavigationMenuTrigger, navigationMenuTriggerStyle, NavigationMenuViewport

### Community 122 - "Community 122"
Cohesion: 0.25
Nodes (5): SheetContentProps, SheetDescription, SheetOverlay, SheetTitle, sheetVariants

### Community 123 - "Community 123"
Cohesion: 0.67
Nodes (6): course_topics, courses, question_course_scopes, question_topics, questions, topics

### Community 124 - "Community 124"
Cohesion: 0.48
Nodes (6): exam_question_snapshots, exam_snapshots, exams, question_snapshots, question_versions, questions

### Community 125 - "Community 125"
Cohesion: 0.33
Nodes (2): AiStatusController, safeEqual()

### Community 126 - "Community 126"
Cohesion: 0.33
Nodes (4): _extract_json(), generate(), local_ai_server.py — Minimal local model server for ExamTrust AI feature Uses l, Try to pull the first valid JSON object out of model output.

### Community 127 - "Community 127"
Cohesion: 0.29
Nodes (6): BulkEnrollByEmailsDto, BulkEnrollmentDto, BulkImportStudentRow, BulkImportStudentsDto, CreateEnrollmentDto, UpdateEnrollmentStatusDto

### Community 128 - "Community 128"
Cohesion: 0.29
Nodes (6): AddQuestionsToExamDto, CreateExamDto, RescheduleExamDto, ShareExamDto, UpdateExamDto, UpdateExamQuestionDto

### Community 129 - "Community 129"
Cohesion: 0.29
Nodes (5): Params, relationLabel, TopicRelation, topicRelationLabel, TopicSuggestion

### Community 130 - "Community 130"
Cohesion: 0.43
Nodes (3): QueueModule, SharedRedisModule, buildRedisOptions()

### Community 131 - "Community 131"
Cohesion: 0.38
Nodes (5): deleteAllUnderPrefix(), main(), parseArgs(), PREFIXES_BY_TARGET, PROTECTED_PREFIXES

### Community 132 - "Community 132"
Cohesion: 0.38
Nodes (1): AccessPolicyService

### Community 133 - "Community 133"
Cohesion: 0.29
Nodes (4): AuthState, DisplayRole, User, UserRole

### Community 134 - "Community 134"
Cohesion: 0.29
Nodes (4): CommandDialogProps, CommandInput, CommandSeparator, DialogProps

### Community 135 - "Community 135"
Cohesion: 0.33
Nodes (5): anomaly_flags, exam_instances, focus_events, interaction_logs, tab_switch_events

### Community 136 - "Community 136"
Cohesion: 0.60
Nodes (1): TopicGuardrailsService

### Community 137 - "Community 137"
Cohesion: 0.33
Nodes (1): ExamQualityReviewService

### Community 140 - "Community 140"
Cohesion: 0.40
Nodes (1): ApiRequestError

### Community 141 - "Community 141"
Cohesion: 0.33
Nodes (1): MediaController

### Community 142 - "Community 142"
Cohesion: 0.33
Nodes (1): QuestionMetadataController

### Community 143 - "Community 143"
Cohesion: 0.73
Nodes (5): pickId(), pollAiJob(), request(), requireOk(), run()

### Community 145 - "Community 145"
Cohesion: 0.33
Nodes (5): Exam, ExamHistoryItem, ExamResult, ExamStatus, UpcomingExam

### Community 146 - "Community 146"
Cohesion: 0.60
Nodes (5): ipToLong(), isIpInAnyCidr(), isIpInCidr(), isValidIpOrCidr(), normalizeIp()

### Community 147 - "Community 147"
Cohesion: 0.70
Nodes (4): ai_generation_records, question_drafts, question_versions, questions

### Community 148 - "Community 148"
Cohesion: 0.70
Nodes (4): ai_generation_records, exam_quality_review_items, questions, users

### Community 149 - "Community 149"
Cohesion: 0.70
Nodes (4): exam_instances, exam_submissions, proctoring_evidence_captures, users

### Community 150 - "Community 150"
Cohesion: 0.40
Nodes (1): AuditService

### Community 151 - "Community 151"
Cohesion: 0.40
Nodes (1): RateLimiterService

### Community 152 - "Community 152"
Cohesion: 0.40
Nodes (4): ApproveQuestionAiImprovementDto, CreateQuestionAiImprovementDto, RejectQuestionAiImprovementDto, UpdateQuestionAiImprovementDraftDto

### Community 153 - "Community 153"
Cohesion: 0.50
Nodes (2): CanActivate, RateLimitGuard

### Community 154 - "Community 154"
Cohesion: 0.40
Nodes (2): CanActivate, RolesGuard

### Community 155 - "Community 155"
Cohesion: 0.40
Nodes (4): MEDIA_ALLOWED_MIME_TYPES, MEDIA_EXTENSION_BY_MIME, MEDIA_MAX_BYTES, MediaAttachmentType

### Community 156 - "Community 156"
Cohesion: 0.40
Nodes (3): IdempotencyMiddleware, IdempotencyStore, NestMiddleware

### Community 157 - "Community 157"
Cohesion: 0.60
Nodes (4): hasColumn(), hasIndex(), main(), prisma

### Community 158 - "Community 158"
Cohesion: 0.83
Nodes (3): exam_link_usages, exam_links, exams

### Community 159 - "Community 159"
Cohesion: 1.00
Nodes (3): integrity_review_audits, integrity_reviews, users

### Community 160 - "Community 160"
Cohesion: 0.50
Nodes (1): AdminDashboardController

### Community 161 - "Community 161"
Cohesion: 0.50
Nodes (1): SystemOverviewController

### Community 162 - "Community 162"
Cohesion: 0.50
Nodes (1): AuditController

### Community 163 - "Community 163"
Cohesion: 0.50
Nodes (3): GenerateExamLinkDto, JoinExamLinkDto, UpdateExamLinkDto

### Community 164 - "Community 164"
Cohesion: 0.50
Nodes (3): GenerateExamQuestionsDto, GenerateQuestionDto, SuggestSimilarTopicsDto

### Community 165 - "Community 165"
Cohesion: 0.50
Nodes (3): ConfirmMediaUploadDto, CreatePresignedUploadDto, ReleaseMediaUploadDto

### Community 166 - "Community 166"
Cohesion: 0.50
Nodes (2): PaginatedResult, PaginationDto

### Community 167 - "Community 167"
Cohesion: 0.50
Nodes (3): CreateDuplicateAnalysisJobDto, DuplicateQuestionCheckDto, UpdateDuplicatePreferenceDto

### Community 168 - "Community 168"
Cohesion: 0.50
Nodes (3): CreateTopicDto, ListTopicsQueryDto, SetCourseTopicsDto

### Community 169 - "Community 169"
Cohesion: 0.50
Nodes (3): ChangePasswordDto, DeleteProfileDto, UpdateProfileDto

### Community 170 - "Community 170"
Cohesion: 0.50
Nodes (1): ExamAuditService

### Community 171 - "Community 171"
Cohesion: 0.50
Nodes (1): LecturerDashboardController

### Community 172 - "Community 172"
Cohesion: 0.50
Nodes (1): LecturerDashboardService

### Community 175 - "Community 175"
Cohesion: 0.50
Nodes (2): prisma, TABLES

### Community 176 - "Community 176"
Cohesion: 0.50
Nodes (2): prisma, REQUIRED_COLUMNS

### Community 177 - "Community 177"
Cohesion: 0.50
Nodes (2): backendEnvPath, prisma

### Community 178 - "Community 178"
Cohesion: 0.50
Nodes (2): backendEnvPath, prisma

### Community 179 - "Community 179"
Cohesion: 0.50
Nodes (1): EventsProcessor

### Community 180 - "Community 180"
Cohesion: 0.50
Nodes (1): IntegrityLogsProcessor

### Community 181 - "Community 181"
Cohesion: 0.50
Nodes (1): AIGenerationJobsController

### Community 183 - "Community 183"
Cohesion: 0.50
Nodes (1): SubmissionsEventsService

### Community 185 - "Community 185"
Cohesion: 1.00
Nodes (2): notifications, users

### Community 186 - "Community 186"
Cohesion: 1.00
Nodes (2): exam_submissions, integrity_reviews

### Community 187 - "Community 187"
Cohesion: 1.00
Nodes (2): question_bank_preferences, users

### Community 188 - "Community 188"
Cohesion: 1.00
Nodes (2): ai_generation_records, anomaly_flags

### Community 189 - "Community 189"
Cohesion: 0.67
Nodes (1): c7c474f Merge remote-tracking branch 'upstream/main'

### Community 190 - "Community 190"
Cohesion: 0.67
Nodes (2): VerifyApiKeyDto, VerifyApiKeyResult

### Community 191 - "Community 191"
Cohesion: 0.67
Nodes (2): prisma, { PrismaClient }

### Community 192 - "Community 192"
Cohesion: 0.67
Nodes (2): LimitConfig, POLICIES

### Community 193 - "Community 193"
Cohesion: 0.67
Nodes (1): ExamAuditGraphRunnable

### Community 194 - "Community 194"
Cohesion: 0.67
Nodes (1): mocks

### Community 196 - "Community 196"
Cohesion: 0.67
Nodes (1): prisma

### Community 197 - "Community 197"
Cohesion: 0.67
Nodes (1): prisma

### Community 198 - "Community 198"
Cohesion: 0.67
Nodes (1): prisma

### Community 199 - "Community 199"
Cohesion: 0.67
Nodes (1): prisma

### Community 200 - "Community 200"
Cohesion: 0.67
Nodes (1): prisma

### Community 201 - "Community 201"
Cohesion: 0.67
Nodes (1): prisma

### Community 202 - "Community 202"
Cohesion: 0.67
Nodes (1): prisma

### Community 203 - "Community 203"
Cohesion: 0.67
Nodes (1): prisma

### Community 204 - "Community 204"
Cohesion: 0.67
Nodes (1): prisma

### Community 205 - "Community 205"
Cohesion: 0.67
Nodes (1): prisma

### Community 206 - "Community 206"
Cohesion: 0.67
Nodes (1): prisma

### Community 207 - "Community 207"
Cohesion: 0.67
Nodes (1): HealthController

### Community 208 - "Community 208"
Cohesion: 1.00
Nodes (2): bootstrap(), parseCsvList()

### Community 209 - "Community 209"
Cohesion: 0.67
Nodes (1): JwtStrategy

### Community 211 - "Community 211"
Cohesion: 1.00
Nodes (1): media_storage_usage

### Community 212 - "Community 212"
Cohesion: 1.00
Nodes (1): mocks

### Community 213 - "Community 213"
Cohesion: 1.00
Nodes (1): QUESTION_LIMITS

### Community 216 - "Community 216"
Cohesion: 1.00
Nodes (1): MediaModule

### Community 218 - "Community 218"
Cohesion: 1.00
Nodes (1): Skeleton()

## Knowledge Gaps
- **734 isolated node(s):** `local_ai_server.py — Minimal local model server for ExamTrust AI feature Uses l`, `Try to pull the first valid JSON object out of model output.`, `prisma`, `prisma`, `prisma` (+729 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 1`** (1 nodes): `ApiClient`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 7`** (1 nodes): `QuestionsService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 11`** (1 nodes): `SubmissionsController`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 14`** (2 nodes): `AiService`, `OnModuleInit`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 30`** (1 nodes): `ExamsService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 36`** (1 nodes): `QuestionDraftsController`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 47`** (1 nodes): `ExamsController`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 54`** (1 nodes): `AuthService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 58`** (1 nodes): `AuthController`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 62`** (1 nodes): `CoursesService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 68`** (1 nodes): `EnrollmentsController`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 69`** (1 nodes): `EnrollmentsService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 70`** (1 nodes): `ExamLinksService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 82`** (1 nodes): `CoursesController`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 87`** (1 nodes): `AiController`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 88`** (1 nodes): `CacheService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 91`** (1 nodes): `QueueService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 101`** (1 nodes): `ExamRiskAssessmentService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 104`** (1 nodes): `UsersController`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 105`** (1 nodes): `UsersService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 107`** (2 nodes): `EmbeddingService`, `SemanticMatchResult`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 109`** (1 nodes): `ExamLinksController`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 114`** (1 nodes): `DistributedEventsService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 117`** (1 nodes): `AIGenerationProcessor`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 125`** (2 nodes): `AiStatusController`, `safeEqual()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 132`** (1 nodes): `AccessPolicyService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 136`** (1 nodes): `TopicGuardrailsService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 137`** (1 nodes): `ExamQualityReviewService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 140`** (1 nodes): `ApiRequestError`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 141`** (1 nodes): `MediaController`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 142`** (1 nodes): `QuestionMetadataController`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 150`** (1 nodes): `AuditService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 151`** (1 nodes): `RateLimiterService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 153`** (2 nodes): `CanActivate`, `RateLimitGuard`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 154`** (2 nodes): `CanActivate`, `RolesGuard`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 160`** (1 nodes): `AdminDashboardController`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 161`** (1 nodes): `SystemOverviewController`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 162`** (1 nodes): `AuditController`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 166`** (2 nodes): `PaginatedResult`, `PaginationDto`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 170`** (1 nodes): `ExamAuditService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 171`** (1 nodes): `LecturerDashboardController`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 172`** (1 nodes): `LecturerDashboardService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 175`** (2 nodes): `prisma`, `TABLES`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 176`** (2 nodes): `prisma`, `REQUIRED_COLUMNS`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 177`** (2 nodes): `backendEnvPath`, `prisma`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 178`** (2 nodes): `backendEnvPath`, `prisma`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 179`** (1 nodes): `EventsProcessor`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 180`** (1 nodes): `IntegrityLogsProcessor`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 181`** (1 nodes): `AIGenerationJobsController`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 183`** (1 nodes): `SubmissionsEventsService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 185`** (2 nodes): `notifications`, `users`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 186`** (2 nodes): `exam_submissions`, `integrity_reviews`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 187`** (2 nodes): `question_bank_preferences`, `users`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 188`** (2 nodes): `ai_generation_records`, `anomaly_flags`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 189`** (1 nodes): `c7c474f Merge remote-tracking branch 'upstream/main'`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 190`** (2 nodes): `VerifyApiKeyDto`, `VerifyApiKeyResult`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 191`** (2 nodes): `prisma`, `{ PrismaClient }`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 192`** (2 nodes): `LimitConfig`, `POLICIES`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 193`** (1 nodes): `ExamAuditGraphRunnable`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 194`** (1 nodes): `mocks`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 196`** (1 nodes): `prisma`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 197`** (1 nodes): `prisma`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 198`** (1 nodes): `prisma`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 199`** (1 nodes): `prisma`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 200`** (1 nodes): `prisma`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 201`** (1 nodes): `prisma`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 202`** (1 nodes): `prisma`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 203`** (1 nodes): `prisma`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 204`** (1 nodes): `prisma`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 205`** (1 nodes): `prisma`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 206`** (1 nodes): `prisma`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 207`** (1 nodes): `HealthController`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 208`** (2 nodes): `bootstrap()`, `parseCsvList()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 209`** (1 nodes): `JwtStrategy`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 211`** (1 nodes): `media_storage_usage`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 212`** (1 nodes): `mocks`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 213`** (1 nodes): `QUESTION_LIMITS`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 216`** (1 nodes): `MediaModule`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 218`** (1 nodes): `Skeleton()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ApiClient` connect `Community 1` to `Community 42`, `Community 138`, `Community 139`, `Community 140`, `Community 173`, `Community 174`, `Community 214`, `Community 215`?**
  _High betweenness centrality (0.089) - this node is a cross-community bridge._
- **Why does `SubmissionsService` connect `Community 28` to `Community 49`, `Community 210`, `Community 67`, `Community 119`, `Community 79`, `Community 184`, `Community 102`, `Community 144`?**
  _High betweenness centrality (0.050) - this node is a cross-community bridge._
- **Why does `QuestionsService` connect `Community 7` to `Community 51`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **What connects `local_ai_server.py — Minimal local model server for ExamTrust AI feature Uses l`, `Try to pull the first valid JSON object out of model output.`, `prisma` to the rest of the system?**
  _734 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.1401044806108097 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.028855721393034824 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.026307026307026308 - nodes in this community are weakly interconnected._