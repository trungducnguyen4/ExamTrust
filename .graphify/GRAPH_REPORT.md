# Graph Report - .  (2026-11-10)

## Corpus Check
- Large corpus: 722 files · ~1,142,800 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder, or use --no-semantic to run AST-only.

## Summary
- 3381 nodes · 14765 edges · 211 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output
- Edge kinds: ON_BRANCH: 5578 · MODIFIES: 2450 · imports: 1885 · contains: 1776 · imports_from: 1145 · method: 745 · calls: 733 · PARENT_OF: 343 · references: 87 · inherits: 11 · implements: 10 · rationale_for: 2


## Input Scope
- Requested: auto
- Resolved: committed (source: default-auto)
- Included files: 722 · Candidates: 789
- Excluded: 3 untracked · 111378 ignored · 1 sensitive · 0 missing committed
- Recommendation: Use --scope all or graphify.yaml inputs.corpus for a knowledge-base folder.

## Graph Freshness
- Built from Git commit: `a91c8a7`
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
  git → git  _Bridges community 0 → community 32_
- `0391dc3 mang project tu repo cu qua` --ON_BRANCH--> `hotfix/EX-029-filter-panel-syntax`  [EXTRACTED]
  git → git  _Bridges community 3 → community 0_
- `0957e0d docs: add run handoff for EX-053` --PARENT_OF--> `17c65ba feat(ai): [EX-054] implement pedagogical typography standard and topic guardrails`  [EXTRACTED]
  git → git  _Bridges community 0 → community 19_
- `0aae96f add` --ON_BRANCH--> `bugfix/EX-033-metadata-base-env`  [EXTRACTED]
  git → git  _Bridges community 142 → community 0_
- `0f5b8a8 feat(question-bank): [EX-050] enable question content click to preview and show direct edit and delete action buttons` --PARENT_OF--> `f8cc6f2 fix(exam-audit): [EX-051] bind real exam questions to autonomous audit dialog and prevent cross-exam leakage`  [EXTRACTED]
  git → git  _Bridges community 0 → community 63_

## Communities

### Community 0 - "Community 0"
Cohesion: 0.10
Nodes (296): media_user_storage_usage, SWITCHABLE_PROVIDERS, bugfix/EX-033-metadata-base-env, bugfix/EX-038-optimize-dashboard-queries, chore/EX-036-warm-window, duc, feature/EX-030-skill-discovery, feature/EX-031-context-hygiene (+288 more)

### Community 1 - "Community 1"
Cohesion: 0.03
Nodes (1): ApiClient

### Community 2 - "Community 2"
Cohesion: 0.05
Nodes (59): AuditLog, Unit, UNIT_LABELS, UNIT_SECONDS, aliases, EditableStudentImport(), Field, fields (+51 more)

### Community 3 - "Community 3"
Cohesion: 0.03
Nodes (28): courses, topics, courses, exam_snapshots, AuditModule, AuthModule, CacheModule, 0391dc3 mang project tu repo cu qua (+20 more)

### Community 4 - "Community 4"
Cohesion: 0.05
Nodes (51): EVIDENCE_SIGNAL_LABELS, EvidenceCapture, getEvidenceEventLabel(), IntegrityCaseDetail(), IntegrityCaseDetailProps, IntegrityTimelineEvent, FlaggedSubmission, IntegrityReason (+43 more)

### Community 5 - "Community 5"
Cohesion: 0.06
Nodes (36): canonicalize(), canonicalStringify(), hashObject(), isPlainObject(), chooseStrategy(), generateExam(), hashJson(), hashStringToNumber() (+28 more)

### Community 6 - "Community 6"
Cohesion: 0.09
Nodes (1): QuestionsService

### Community 7 - "Community 7"
Cohesion: 0.07
Nodes (37): AiImprovementDetail, AiImprovementStatus, AiImprovementSummary, AnalyticsCourseInfo, AttemptBreakdownItem, AttemptScope, AttemptStats, buildComparisonSnapshot() (+29 more)

### Community 8 - "Community 8"
Cohesion: 0.05
Nodes (2): 2d105be Convert FE from embedded repository to regular folder, mocks

### Community 9 - "Community 9"
Cohesion: 0.08
Nodes (36): DurationInput(), BankQuestionOption, BankTopic, buildReviewSettingsPayload(), CourseOption, createDefaultForm(), createDefaultReviewSettingsDraft(), DIFFICULTY_LABEL_VI (+28 more)

### Community 10 - "Community 10"
Cohesion: 0.11
Nodes (18): iso(), rangeFor(), copy, DevopsStatus, AttentionSection(), PRIORITY_STYLES, HelpedTitle(), Props (+10 more)

### Community 11 - "Community 11"
Cohesion: 0.05
Nodes (1): SubmissionsController

### Community 12 - "Community 12"
Cohesion: 0.08
Nodes (15): exam_submissions, integrity_reviews, AdminDashboardController, AdminDashboardModule, AdminDashboardService, COMPLETED, ZALO_BOT_COMMANDS, a4ea817 Merge pull request #4 from trungducnguyen4/duc (+7 more)

### Community 13 - "Community 13"
Cohesion: 0.09
Nodes (25): answerTitles, FillBlankGuide(), OptionRowProps, Props, QuestionAnswerEditor(), EditorQuestionType, useQuestionAnswerState(), useQuestionPersistence() (+17 more)

### Community 14 - "Community 14"
Cohesion: 0.08
Nodes (21): Course, EMPTY_FILTERS, gradientClasses, GroupedCourses, ActiveFilterChips(), ActiveFilterChipsProps, ListPageHeader(), ListPageHeaderProps (+13 more)

### Community 15 - "Community 15"
Cohesion: 0.05
Nodes (33): useIsMobile(), SheetContent, SheetContentProps, SheetDescription, SheetOverlay, SheetTitle, sheetVariants, Sidebar (+25 more)

### Community 16 - "Community 16"
Cohesion: 0.08
Nodes (29): metadata, Providers(), AuthProvider(), Action, ActionType, actionTypes, addToRemoveQueue(), dispatch() (+21 more)

### Community 17 - "Community 17"
Cohesion: 0.15
Nodes (2): AiService, OnModuleInit

### Community 18 - "Community 18"
Cohesion: 0.07
Nodes (21): MetricCardProps, NavLink, NavLinkBaseProps, NavLinkCompatProps, cn(), ListToolbarProps, AccordionContent, AccordionItem (+13 more)

### Community 19 - "Community 19"
Cohesion: 0.12
Nodes (22): AiModule, GuardrailAlertBanner(), GuardrailAlertBannerProps, GuardrailResult, GuardrailValidationResult, IncompatibleDomainRule, 0c0ccf5 feat(analytics,question-bank): remove meaningless course logos and optimize tab load performance [EX-053], 17c65ba feat(ai): [EX-054] implement pedagogical typography standard and topic guardrails (+14 more)

### Community 20 - "Community 20"
Cohesion: 0.14
Nodes (16): AuthPageShell(), themes, ThemeToggle(), useAuth(), demoAccounts, JoinStep, Alert, AlertDescription (+8 more)

### Community 21 - "Community 21"
Cohesion: 0.08
Nodes (21): f5fcba9 Merge pull request #5 from OAB710/main, f609787 feat(student): add exam schedule endpoint and student schedule page, BulkStudentImport(), completedSubmissionStatuses, Course, CourseExam, CourseExamSummary, Enrollment (+13 more)

### Community 22 - "Community 22"
Cohesion: 0.09
Nodes (26): DonutSegment, QuestionBankDonutStats(), QuestionBankDonutStatsProps, QuestionBankCourse, Params, useQuestionBankRouteState(), buildQuestionFilterDefinitions(), courseFilterDefinitions (+18 more)

### Community 23 - "Community 23"
Cohesion: 0.12
Nodes (20): AdminPageShell(), AdminPageShellProps, EMPTY_FILTERS, Exam, 9765fa3 Sua lenh bot Zalo, them nut lam moi + fix cuon trang khi doi trang, d0edeff Merge pull request #46 from trungducnguyen4/feature/EX-044-langgraph-autonomous-exam-qa-squad, da20a4e add, DataPagination() (+12 more)

### Community 24 - "Community 24"
Cohesion: 0.17
Nodes (30): buildBeInfoText(), buildFeInfoText(), buildPublicInfoText(), buildR2InfoText(), buildSystemOverviewConclusions(), buildSystemOverviewText(), cfGraphQL(), formatBuildStatus() (+22 more)

### Community 25 - "Community 25"
Cohesion: 0.11
Nodes (19): adminNavItems, DashboardLayoutProps, lecturerNavItems, NavItem, studentNavItems, Header(), SortButtonProps, SortOption (+11 more)

### Community 26 - "Community 26"
Cohesion: 0.07
Nodes (3): OnModuleDestroy, OnModuleInit, SubmissionsService

### Community 27 - "Community 27"
Cohesion: 0.08
Nodes (9): buildEvidenceStorageKey(), DEFAULT_EVENT_CAPTURE_LIMITS, DEFAULT_POLICY, EventCaptureLimits, KNOWN_SIGNAL_SLUGS, OnModuleInit, ProctoringEvidenceService, SCHEDULED_CAPTURE_PERCENTAGES (+1 more)

### Community 28 - "Community 28"
Cohesion: 0.11
Nodes (1): ExamsService

### Community 29 - "Community 29"
Cohesion: 0.10
Nodes (21): AdminStatCard(), AdminStatCardProps, { academicYear: defaultAcademicYear, term: defaultTerm }, academicYearOptions, buildToken(), CourseForm, CourseItem, defaultForm (+13 more)

### Community 30 - "Community 30"
Cohesion: 0.13
Nodes (11): 23cc713 Merge remote-tracking branch 'upstream/main', b9a4c06 add, f2db362 Refactor VI + RCM Topic + AI Summarize, CreateCourseDto, CreateUserDto, LoginDto, RegisterDto, UpdateCourseDto (+3 more)

### Community 31 - "Community 31"
Cohesion: 0.08
Nodes (1): QuestionDraftsController

### Community 32 - "Community 32"
Cohesion: 0.13
Nodes (9): 4e55692 Merge pull request #23 from OAB710/main, fd78aa1 Doi thang diem 10, sua ma tran dap an, dong bo naming giam sat, doi AI provider truc tiep, mocks, formatSignedScoreAdjustment(), getScoreAdjustmentCategoryLabel(), SCORE_ADJUSTMENT_CATEGORY_LABELS, StructuredValue, AiSuggestion (+1 more)

### Community 33 - "Community 33"
Cohesion: 0.10
Nodes (17): 7aa5196 Fix Luồng Quan Trọng, 7ff6d1c Merge pull request #28 from OAB710/main, AGGREGATE_ALERT_TYPES, EMPTY_STUDENT_FILTERS, EVIDENCE_SIGNAL_LABELS, EvidenceCapture, ExamMonitor(), ExamOverview (+9 more)

### Community 34 - "Community 34"
Cohesion: 0.12
Nodes (20): completedStatuses, useStudentDashboardData(), COMPLETED_STATUSES, CourseExamAction, CourseExamForAction, CourseExamSubmission, ExamDisplayState, getCourseExamAction() (+12 more)

### Community 35 - "Community 35"
Cohesion: 0.15
Nodes (14): SessionMeta, TokenUser, NestInterceptor, PerfInterceptor, OnModuleDestroy, OnModuleInit, { PrismaClient }, PrismaService (+6 more)

### Community 36 - "Community 36"
Cohesion: 0.13
Nodes (16): EMPTY_FILTERS, EMPTY_PATTERNS, EMPTY_STATS, IntegrityCasesResponse, IntegrityPatterns, IntegrityStats, 1f86444 feat(fe): unify search bar and filter controls into single toolbar globally across all tabs (EX-043), EMPTY_HISTORY_FILTERS (+8 more)

### Community 37 - "Community 37"
Cohesion: 0.10
Nodes (1): ExamsController

### Community 38 - "Community 38"
Cohesion: 0.15
Nodes (18): EXAM_PLANS, ExamPlan, main(), prisma, toExamStatus(), touchDemoExamToTop(), addMinutes(), makeRng() (+10 more)

### Community 39 - "Community 39"
Cohesion: 0.11
Nodes (10): hash64(), LogSpec, main(), now, prisma, Profile, PROFILES, randomHash64() (+2 more)

### Community 40 - "Community 40"
Cohesion: 0.16
Nodes (17): formatAttemptLimitVi(), formatDateVi(), formatNumberVi(), formatPercentVi(), formatScoreVi(), getAttemptStatusLabel(), getExamStatusLabel(), getExamWindowLabel() (+9 more)

### Community 41 - "Community 41"
Cohesion: 0.15
Nodes (13): FilterPanelProps, Drawer(), DrawerContent, DrawerDescription, DrawerFooter(), DrawerHeader(), DrawerOverlay, DrawerTitle (+5 more)

### Community 42 - "Community 42"
Cohesion: 0.18
Nodes (14): ApiKeyConfigDialog(), ApiKeyConfigDialogProps, bloomOptions, distractorOptions, Props, QuestionClarificationDialog(), styleOptions, timeOptions (+6 more)

### Community 43 - "Community 43"
Cohesion: 0.19
Nodes (1): AuthService

### Community 44 - "Community 44"
Cohesion: 0.13
Nodes (14): main(), prisma, Q, SEMANTIC, SINGLETON, TEXT_TEXT, main(), prisma (+6 more)

### Community 45 - "Community 45"
Cohesion: 0.19
Nodes (2): AuthUser, CoursesService

### Community 46 - "Community 46"
Cohesion: 0.12
Nodes (8): CourseSummary, difficultyClassName(), Exam, formatDifficulty(), QuestionBankSummary, QuestionItem, questionTypeLabels, mocks

### Community 47 - "Community 47"
Cohesion: 0.16
Nodes (9): BaseQ, FillBlankQ, FindErrorQ, MatchingQ, MultiChoiceQ, OrderingQ, ShortAnswerQ, SingleChoiceQ (+1 more)

### Community 48 - "Community 48"
Cohesion: 0.17
Nodes (1): AuthController

### Community 49 - "Community 49"
Cohesion: 0.13
Nodes (15): ClarificationConfig, GeneratedQuestion, Params, StoredActiveAiJob, typeMap, useQuestionAiGeneration(), findMostSimilarQuestion(), AI_PROVIDERS (+7 more)

### Community 50 - "Community 50"
Cohesion: 0.12
Nodes (16): AddLogsDto, AutosaveAnswerDto, AutosaveExamDto, CreateScoreAdjustmentDto, ExtendSubmissionDeadlineDto, FinalizeEvidenceCaptureDto, GradeAnswerDto, ReopenSubmissionDto (+8 more)

### Community 51 - "Community 51"
Cohesion: 0.17
Nodes (12): formatAnswerCell(), formatChoiceAnswer(), formatPoints(), formatStructuredAnswer(), GradingBreakdown(), OptionDisplay, optionDisplays(), parseOptionTexts() (+4 more)

### Community 52 - "Community 52"
Cohesion: 0.13
Nodes (10): AnswerMatrix, EvidenceCapture, ExamOverview, ExamResultsList(), groupAnomaliesByStudent(), MonitoringGroup, RiskFlag, SubmissionTimeline (+2 more)

### Community 53 - "Community 53"
Cohesion: 0.16
Nodes (12): ExamSecurityModal(), ExamSecurityModalProps, violationLabels, LiveClock(), emptyCounts, ExamSecurityState, FirstViolationNotice, useExamSecurity() (+4 more)

### Community 54 - "Community 54"
Cohesion: 0.14
Nodes (5): ExamData, ExamQuestion, getCorrectAnswerText(), getOptionEntries(), Separator

### Community 55 - "Community 55"
Cohesion: 0.17
Nodes (9): CalendarView, ExamDetailsDialog(), FlexibleExamCard(), getEventTone(), getStatusLabel(), HOURS, LaidOutEvent, ScheduleExamItem (+1 more)

### Community 56 - "Community 56"
Cohesion: 0.13
Nodes (2): 28db160 feat(ai): integrate LangGraph multi-agent squad for autonomous exam audit and optimization (EX-044), ExamAuditGraphRunnable

### Community 57 - "Community 57"
Cohesion: 0.15
Nodes (9): BackToDashboardButton(), BackToDashboardButtonProps, ButtonSize, ButtonVariant, answerPatterns, examResult, feedbackHistory, recommendations (+1 more)

### Community 58 - "Community 58"
Cohesion: 0.19
Nodes (8): AiEvaluationJudge, EvalMetricResult, GOLDEN_ESSAY_GRADING_CASES, GOLDEN_QUESTION_CASES, GOLDEN_RISK_CASES, GoldenEssayGradingCase, GoldenQuestionCase, GoldenRiskAssessmentCase

### Community 59 - "Community 59"
Cohesion: 0.15
Nodes (5): ExamData, ExamQuestion, getCorrectAnswerText(), getOptionEntries(), Checkbox

### Community 60 - "Community 60"
Cohesion: 0.29
Nodes (14): ai_generation_records, course_topics, courses, exam_questions, question_course_scopes, question_drafts, question_tags, question_topics (+6 more)

### Community 61 - "Community 61"
Cohesion: 0.19
Nodes (13): AnswerMap, denormalizeSubmissionAnswer(), isAnswered(), mapBackendToUiQuestion(), normalizeSubmissionAnswer(), parseOptions(), QType, Question (+5 more)

### Community 63 - "Community 63"
Cohesion: 0.22
Nodes (7): 14777e7 perf(audit,exam-preview,question-bank): optimize load times and implement GET ai/jobs/:id [EX-052], 41ecb81 Merge pull request #54 from trungducnguyen4/feature/EX-051-autonomous-audit-real-exam-questions, c9c4dc3 Merge pull request #55 from trungducnguyen4/feature/EX-052-perf-optimization-and-audit-endpoint, f8cc6f2 fix(exam-audit): [EX-051] bind real exam questions to autonomous audit dialog and prevent cross-exam leakage, AuditReportData, AutonomousAuditDialogProps, QuestionImprovementItem

### Community 64 - "Community 64"
Cohesion: 0.15
Nodes (1): EnrollmentsController

### Community 65 - "Community 65"
Cohesion: 0.27
Nodes (1): EnrollmentsService

### Community 66 - "Community 66"
Cohesion: 0.24
Nodes (1): ExamLinksService

### Community 67 - "Community 67"
Cohesion: 0.21
Nodes (13): AUTO_GRADED_TYPES, buildQuestionTemplate(), buildSnapshotPayload(), buildSubmittedAnswer(), buildToken(), createExamSnapshot(), generateCourseCode(), isAutoGradable() (+5 more)

### Community 68 - "Community 68"
Cohesion: 0.14
Nodes (12): Carousel, CarouselApi, CarouselContent, CarouselContext, CarouselContextProps, CarouselItem, CarouselNext, CarouselOptions (+4 more)

### Community 69 - "Community 69"
Cohesion: 0.28
Nodes (10): AuthContext, AuthContextType, AuthState, RefreshedSession, RequestOptions, elapsedMs(), enabledValues, isPerfLogEnabled() (+2 more)

### Community 70 - "Community 70"
Cohesion: 0.15
Nodes (12): AIGenerateSectionDto, AIGenerationConstraintsDto, AISection, ApplyAICandidateDto, CreateQuestionDraftDto, DraftPublishMode, DraftValidationLevel, PublishQuestionDraftDto (+4 more)

### Community 71 - "Community 71"
Cohesion: 0.24
Nodes (3): AuthUser, extractUploaderIdFromKey(), MediaService

### Community 72 - "Community 72"
Cohesion: 0.22
Nodes (12): QUESTION_TYPES, QuestionType, backendEnvPath, buildSampleMediaFields(), buildTypePlan(), COURSE_QUESTION_PLAN, main(), pickDifficulty() (+4 more)

### Community 73 - "Community 73"
Cohesion: 0.18
Nodes (7): BATCH_SIZE, fetchBatch(), LegacyQuestion, main(), prisma, { PrismaClient }, processQuestion()

### Community 75 - "Community 75"
Cohesion: 0.15
Nodes (5): buttonVariants, CalendarProps, PaginationContent, PaginationItem, PaginationLinkProps

### Community 76 - "Community 76"
Cohesion: 0.19
Nodes (12): formatBadgeText(), getStatusBadgeTone(), LegacyStatusBadgeVariant, normalizeStatusKey(), renderBadgeContent(), STATUS_BADGE_MAP, StatusBadgeDomain, StatusBadgeMapEntry (+4 more)

### Community 77 - "Community 77"
Cohesion: 0.17
Nodes (1): CoursesController

### Community 78 - "Community 78"
Cohesion: 0.21
Nodes (7): QuestionRenderer(), clearPersistedIntegrityQueue(), DuringReviewFeedback, getIntegrityQueueStorageKey(), loadPersistedIntegrityQueue(), PendingIntegrityEvent, savePersistedIntegrityQueue()

### Community 79 - "Community 79"
Cohesion: 0.17
Nodes (9): FormControl, FormDescription, FormFieldContext, FormFieldContextValue, FormItem, FormItemContext, FormItemContextValue, FormLabel (+1 more)

### Community 80 - "Community 80"
Cohesion: 0.17
Nodes (10): Menubar, MenubarCheckboxItem, MenubarContent, MenubarItem, MenubarLabel, MenubarRadioItem, MenubarSeparator, MenubarSubContent (+2 more)

### Community 81 - "Community 81"
Cohesion: 0.45
Nodes (10): courses, enrollments, exam_questions, exam_submissions, exams, integrity_logs, proctoring_sessions, questions (+2 more)

### Community 82 - "Community 82"
Cohesion: 0.24
Nodes (1): AiController

### Community 83 - "Community 83"
Cohesion: 0.24
Nodes (10): buildContextLines(), buildExamTrustPromptHeader(), ExamTrustAiAnalyticsSummary, ExamTrustAiContext, ExamTrustAiPromptParams, ExamTrustAiUseCase, formatNumber(), getOllamaGenerationOptions() (+2 more)

### Community 84 - "Community 84"
Cohesion: 0.20
Nodes (1): CacheService

### Community 85 - "Community 85"
Cohesion: 0.20
Nodes (7): FilterPanel(), completedAttemptStatuses, rowAccentByStatus, statusLabel(), statusText(), StudentExamItem, summaryCardClassByKey

### Community 86 - "Community 86"
Cohesion: 0.22
Nodes (9): COURSE_PLANS, CoursePlan, main(), prisma, daysAgo(), LECTURER_DEPARTMENTS, LECTURER_FULL_NAMES, main() (+1 more)

### Community 87 - "Community 87"
Cohesion: 0.22
Nodes (9): COURSE_TOPIC_LABELS, DupQuestion, EXACT_PAIRS, main(), prisma, SEMANTIC_PAIRS, main(), prisma (+1 more)

### Community 88 - "Community 88"
Cohesion: 0.24
Nodes (1): QueueService

### Community 89 - "Community 89"
Cohesion: 0.18
Nodes (7): ChartConfig, ChartContainer, ChartContext, ChartContextProps, ChartLegendContent, ChartTooltipContent, THEMES

### Community 90 - "Community 90"
Cohesion: 0.18
Nodes (8): Command, CommandDialogProps, CommandEmpty, CommandGroup, CommandInput, CommandList, CommandSeparator, DialogProps

### Community 91 - "Community 91"
Cohesion: 0.36
Nodes (9): anomaly_flags, exam_instances, exam_questions, exam_submissions, exams, focus_events, interaction_logs, question_versions (+1 more)

### Community 92 - "Community 92"
Cohesion: 0.24
Nodes (5): AI_SECTIONS, AiJobsService, AISectionValue, AiTaskType, CreateAiJobParams

### Community 93 - "Community 93"
Cohesion: 0.27
Nodes (3): AITelemetry, AiTelemetryService, ProviderPricing

### Community 94 - "Community 94"
Cohesion: 0.29
Nodes (4): auditChaos(), auditFeatures(), auditPerformance(), auditSecurity()

### Community 95 - "Community 95"
Cohesion: 0.24
Nodes (7): AttentionItemData, AttentionPriority, LecturerAttentionResponse, LecturerAttentionSummary, LECTURER_ATTENTION_QUERY_KEY, PRIORITY_ORDER, useAttentionItems()

### Community 96 - "Community 96"
Cohesion: 0.29
Nodes (8): AutosaveAnswer, AutosaveSyncStatus, getQueueStorageKey(), loadQueue(), persistQueue(), safeParseQueue(), useExamAutosave(), UseExamAutosaveOptions

### Community 97 - "Community 97"
Cohesion: 0.36
Nodes (9): course_topics, courses, exist, question_tags, question_topics, questions, tags, topics (+1 more)

### Community 98 - "Community 98"
Cohesion: 0.24
Nodes (8): COLLUDE_INDICES, COLLUSION_QUESTION_INDICES, isColluder(), main(), prisma, QUESTION_SPECS, QuestionSpec, STUDENT_ID_PATTERN()

### Community 99 - "Community 99"
Cohesion: 0.33
Nodes (1): ExamRiskAssessmentService

### Community 101 - "Community 101"
Cohesion: 0.20
Nodes (8): ContextMenuCheckboxItem, ContextMenuContent, ContextMenuItem, ContextMenuLabel, ContextMenuRadioItem, ContextMenuSeparator, ContextMenuSubContent, ContextMenuSubTrigger

### Community 102 - "Community 102"
Cohesion: 0.20
Nodes (1): UsersController

### Community 103 - "Community 103"
Cohesion: 0.22
Nodes (1): UsersService

### Community 104 - "Community 104"
Cohesion: 0.39
Nodes (8): ai_generation_records, exam_submission_regrade_logs, exam_submissions, question_statistics, question_versions, questions, submission_answers, users

### Community 105 - "Community 105"
Cohesion: 0.33
Nodes (2): EmbeddingService, SemanticMatchResult

### Community 106 - "Community 106"
Cohesion: 0.25
Nodes (6): 72d5704 add, CheckStatus, defaultExamInfo, ExamStep, SystemCheck, Progress

### Community 107 - "Community 107"
Cohesion: 0.22
Nodes (7): BulkStudentImportProps, COLUMN_ALIASES, ImportResult, ImportState, ParsedRow, ValidatedData, ValidationError

### Community 108 - "Community 108"
Cohesion: 0.22
Nodes (1): ExamLinksController

### Community 109 - "Community 109"
Cohesion: 0.22
Nodes (7): Params, relationLabel, TopicRelation, topicRelationLabel, TopicSuggestion, useQuestionTopics(), CourseOption

### Community 110 - "Community 110"
Cohesion: 0.22
Nodes (8): MEDIA_ACCEPT, MEDIA_ALLOWED_MIME_TYPES, MEDIA_MAX_BYTES, MediaAttachment, MediaAttachmentType, releaseMediaUpload(), uploadMediaFile(), validateMediaFile()

### Community 111 - "Community 111"
Cohesion: 0.47
Nodes (8): loginRequest(), main(), percentile(), runConcurrent(), runSequential(), safeJson(), summarize(), timedRequest()

### Community 112 - "Community 112"
Cohesion: 0.25
Nodes (3): roleToPath, capabilityGroups, operatingPrinciples

### Community 113 - "Community 113"
Cohesion: 0.32
Nodes (6): HOURS_12, MINUTES, parse24(), Period, TimePickerVi(), to12()

### Community 114 - "Community 114"
Cohesion: 0.29
Nodes (5): CLIENT_RENDERING_RULES, OrderingLayer, ReferenceBinding, RenderingContract, StructuralLayer

### Community 115 - "Community 115"
Cohesion: 0.32
Nodes (1): DistributedEventsService

### Community 116 - "Community 116"
Cohesion: 0.25
Nodes (7): AuditQuestion, AuditTimelineEntry, ExamAuditReport, ExamAuditState, FlawedQuestion, QuestionImprovement, RubricScore

### Community 117 - "Community 117"
Cohesion: 0.57
Nodes (8): asObject(), findErrorText(), formatManualAnswer(), matchingSides(), parseValue(), stringList(), text(), trueFalseText()

### Community 118 - "Community 118"
Cohesion: 0.29
Nodes (7): backendTypeByEditorType, BuildPayloadParams, buildQuestionPayload(), editorTypeByBackendType, shuffle(), toEditorDifficulty(), toEditorQuestionType()

### Community 119 - "Community 119"
Cohesion: 0.43
Nodes (7): clearPendingProctoringStreams(), hasPendingScreenStream(), isLive(), setPendingScreenStream(), setPendingWebcamStream(), takePendingScreenStream(), takePendingWebcamStream()

### Community 120 - "Community 120"
Cohesion: 0.25
Nodes (6): EXAMS, main(), prisma, QUESTIONS, QuestionSpec, VersionSpec

### Community 121 - "Community 121"
Cohesion: 0.46
Nodes (1): AIGenerationProcessor

### Community 122 - "Community 122"
Cohesion: 0.25
Nodes (6): exceptions, ignoredDirectories, include, limit, oversized, root

### Community 124 - "Community 124"
Cohesion: 0.25
Nodes (5): Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage

### Community 125 - "Community 125"
Cohesion: 0.25
Nodes (7): NavigationMenu, NavigationMenuContent, NavigationMenuIndicator, NavigationMenuList, NavigationMenuTrigger, navigationMenuTriggerStyle, NavigationMenuViewport

### Community 126 - "Community 126"
Cohesion: 0.67
Nodes (6): course_topics, courses, question_course_scopes, question_topics, questions, topics

### Community 127 - "Community 127"
Cohesion: 0.48
Nodes (6): exam_question_snapshots, exam_snapshots, exams, question_snapshots, question_versions, questions

### Community 128 - "Community 128"
Cohesion: 0.29
Nodes (3): Exam, Submission, User

### Community 129 - "Community 129"
Cohesion: 0.43
Nodes (5): detectAiProvider(), DetectedProvider, PROVIDER_INFO, ProviderDetectionResult, verifyApiKeyWithProvider()

### Community 130 - "Community 130"
Cohesion: 0.33
Nodes (2): AiStatusController, safeEqual()

### Community 131 - "Community 131"
Cohesion: 0.57
Nodes (4): e0e0f5b Fix Bug, fd68a4b Merge pull request #16 from OAB710/main, THEME_OPTIONS, THEME_PROVIDER_OPTIONS

### Community 132 - "Community 132"
Cohesion: 0.33
Nodes (4): _extract_json(), generate(), local_ai_server.py — Minimal local model server for ExamTrust AI feature Uses l, Try to pull the first valid JSON object out of model output.

### Community 133 - "Community 133"
Cohesion: 0.29
Nodes (6): BulkEnrollByEmailsDto, BulkEnrollmentDto, BulkImportStudentRow, BulkImportStudentsDto, CreateEnrollmentDto, UpdateEnrollmentStatusDto

### Community 134 - "Community 134"
Cohesion: 0.29
Nodes (6): AddQuestionsToExamDto, CreateExamDto, RescheduleExamDto, ShareExamDto, UpdateExamDto, UpdateExamQuestionDto

### Community 135 - "Community 135"
Cohesion: 0.29
Nodes (6): assertExplanationLength(), assertLineContent(), assertOptionsLength(), assertQuestionContentLength(), assertQuestionPresenceAndOptions(), QUESTION_LIMITS

### Community 136 - "Community 136"
Cohesion: 0.43
Nodes (3): QueueModule, SharedRedisModule, buildRedisOptions()

### Community 137 - "Community 137"
Cohesion: 0.38
Nodes (5): deleteAllUnderPrefix(), main(), parseArgs(), PREFIXES_BY_TARGET, PROTECTED_PREFIXES

### Community 138 - "Community 138"
Cohesion: 0.38
Nodes (1): AccessPolicyService

### Community 139 - "Community 139"
Cohesion: 0.38
Nodes (6): accessBadgeClass(), ExamDetail, MySubmission, statusBadgeClass(), StudentExamDetail(), getStatusBadgeLabel()

### Community 140 - "Community 140"
Cohesion: 0.29
Nodes (4): AuthState, DisplayRole, User, UserRole

### Community 141 - "Community 141"
Cohesion: 0.33
Nodes (5): anomaly_flags, exam_instances, focus_events, interaction_logs, tab_switch_events

### Community 142 - "Community 142"
Cohesion: 0.33
Nodes (4): 0aae96f add, 0e4348a add, RequestUser, REUSABLE_JOB_STATUSES

### Community 143 - "Community 143"
Cohesion: 0.60
Nodes (1): TopicGuardrailsService

### Community 144 - "Community 144"
Cohesion: 0.47
Nodes (3): EmptyState(), PageHeader(), PageHeaderProps

### Community 145 - "Community 145"
Cohesion: 0.33
Nodes (1): ExamQualityReviewService

### Community 146 - "Community 146"
Cohesion: 0.40
Nodes (4): getSessionDevice(), groupSessionsByDevice(), Session, SessionGroup

### Community 149 - "Community 149"
Cohesion: 0.40
Nodes (1): ApiRequestError

### Community 150 - "Community 150"
Cohesion: 0.33
Nodes (1): MediaController

### Community 151 - "Community 151"
Cohesion: 0.33
Nodes (1): QuestionMetadataController

### Community 152 - "Community 152"
Cohesion: 0.73
Nodes (5): pickId(), pollAiJob(), request(), requireOk(), run()

### Community 154 - "Community 154"
Cohesion: 0.33
Nodes (5): Exam, ExamHistoryItem, ExamResult, ExamStatus, UpcomingExam

### Community 155 - "Community 155"
Cohesion: 0.60
Nodes (5): ipToLong(), isIpInAnyCidr(), isIpInCidr(), isValidIpOrCidr(), normalizeIp()

### Community 156 - "Community 156"
Cohesion: 0.70
Nodes (4): ai_generation_records, question_drafts, question_versions, questions

### Community 157 - "Community 157"
Cohesion: 0.70
Nodes (4): ai_generation_records, exam_quality_review_items, questions, users

### Community 158 - "Community 158"
Cohesion: 0.70
Nodes (4): exam_instances, exam_submissions, proctoring_evidence_captures, users

### Community 159 - "Community 159"
Cohesion: 0.40
Nodes (1): AuditService

### Community 160 - "Community 160"
Cohesion: 0.40
Nodes (1): RateLimiterService

### Community 161 - "Community 161"
Cohesion: 0.40
Nodes (4): ApproveQuestionAiImprovementDto, CreateQuestionAiImprovementDto, RejectQuestionAiImprovementDto, UpdateQuestionAiImprovementDraftDto

### Community 162 - "Community 162"
Cohesion: 0.40
Nodes (4): CopyQuestionBankDto, CreateQuestionCrudDto, PreviewCopyQuestionBankDto, UpdateQuestionCrudDto

### Community 163 - "Community 163"
Cohesion: 0.50
Nodes (2): CanActivate, RateLimitGuard

### Community 164 - "Community 164"
Cohesion: 0.40
Nodes (2): CanActivate, RolesGuard

### Community 165 - "Community 165"
Cohesion: 0.40
Nodes (1): ExamAuditService

### Community 166 - "Community 166"
Cohesion: 0.40
Nodes (4): Direction, evaluateMatrixCase(), MATRIX_27_CASES, MatrixCase

### Community 167 - "Community 167"
Cohesion: 0.40
Nodes (4): MEDIA_ALLOWED_MIME_TYPES, MEDIA_EXTENSION_BY_MIME, MEDIA_MAX_BYTES, MediaAttachmentType

### Community 168 - "Community 168"
Cohesion: 0.40
Nodes (3): IdempotencyMiddleware, IdempotencyStore, NestMiddleware

### Community 169 - "Community 169"
Cohesion: 0.60
Nodes (4): hasColumn(), hasIndex(), main(), prisma

### Community 170 - "Community 170"
Cohesion: 0.50
Nodes (2): FormattedText(), FormattedTextProps

### Community 171 - "Community 171"
Cohesion: 0.83
Nodes (3): exam_link_usages, exam_links, exams

### Community 172 - "Community 172"
Cohesion: 1.00
Nodes (3): integrity_review_audits, integrity_reviews, users

### Community 173 - "Community 173"
Cohesion: 0.83
Nodes (3): exam_submissions, score_adjustments, users

### Community 174 - "Community 174"
Cohesion: 0.50
Nodes (1): SystemOverviewController

### Community 175 - "Community 175"
Cohesion: 0.50
Nodes (1): AuditController

### Community 176 - "Community 176"
Cohesion: 0.50
Nodes (3): GenerateExamLinkDto, JoinExamLinkDto, UpdateExamLinkDto

### Community 177 - "Community 177"
Cohesion: 0.50
Nodes (3): GenerateExamQuestionsDto, GenerateQuestionDto, SuggestSimilarTopicsDto

### Community 178 - "Community 178"
Cohesion: 0.50
Nodes (3): ConfirmMediaUploadDto, CreatePresignedUploadDto, ReleaseMediaUploadDto

### Community 179 - "Community 179"
Cohesion: 0.50
Nodes (2): PaginatedResult, PaginationDto

### Community 180 - "Community 180"
Cohesion: 0.50
Nodes (3): CreateDuplicateAnalysisJobDto, DuplicateQuestionCheckDto, UpdateDuplicatePreferenceDto

### Community 181 - "Community 181"
Cohesion: 0.50
Nodes (3): CreateTopicDto, ListTopicsQueryDto, SetCourseTopicsDto

### Community 182 - "Community 182"
Cohesion: 0.50
Nodes (3): ChangePasswordDto, DeleteProfileDto, UpdateProfileDto

### Community 183 - "Community 183"
Cohesion: 0.50
Nodes (1): LecturerDashboardController

### Community 184 - "Community 184"
Cohesion: 0.50
Nodes (1): LecturerDashboardService

### Community 187 - "Community 187"
Cohesion: 0.50
Nodes (2): prisma, TABLES

### Community 188 - "Community 188"
Cohesion: 0.50
Nodes (2): prisma, REQUIRED_COLUMNS

### Community 189 - "Community 189"
Cohesion: 0.50
Nodes (2): backendEnvPath, prisma

### Community 190 - "Community 190"
Cohesion: 0.50
Nodes (2): backendEnvPath, prisma

### Community 191 - "Community 191"
Cohesion: 0.50
Nodes (1): EventsProcessor

### Community 192 - "Community 192"
Cohesion: 0.50
Nodes (1): GradingProcessor

### Community 193 - "Community 193"
Cohesion: 0.50
Nodes (1): IntegrityLogsProcessor

### Community 194 - "Community 194"
Cohesion: 0.50
Nodes (1): AIGenerationJobsController

### Community 196 - "Community 196"
Cohesion: 0.50
Nodes (1): SubmissionsEventsService

### Community 198 - "Community 198"
Cohesion: 1.00
Nodes (2): notifications, users

### Community 199 - "Community 199"
Cohesion: 1.33
Nodes (2): auth_sessions, users

### Community 200 - "Community 200"
Cohesion: 1.00
Nodes (2): question_bank_preferences, users

### Community 201 - "Community 201"
Cohesion: 1.00
Nodes (2): ai_generation_records, anomaly_flags

### Community 202 - "Community 202"
Cohesion: 0.67
Nodes (2): VerifyApiKeyDto, VerifyApiKeyResult

### Community 203 - "Community 203"
Cohesion: 0.67
Nodes (2): prisma, { PrismaClient }

### Community 204 - "Community 204"
Cohesion: 0.67
Nodes (2): LimitConfig, POLICIES

### Community 205 - "Community 205"
Cohesion: 0.67
Nodes (1): mocks

### Community 206 - "Community 206"
Cohesion: 0.67
Nodes (1): prisma

### Community 207 - "Community 207"
Cohesion: 0.67
Nodes (1): prisma

### Community 208 - "Community 208"
Cohesion: 0.67
Nodes (1): prisma

### Community 209 - "Community 209"
Cohesion: 0.67
Nodes (1): prisma

### Community 210 - "Community 210"
Cohesion: 0.67
Nodes (1): prisma

### Community 211 - "Community 211"
Cohesion: 0.67
Nodes (1): prisma

### Community 212 - "Community 212"
Cohesion: 0.67
Nodes (1): prisma

### Community 213 - "Community 213"
Cohesion: 0.67
Nodes (1): prisma

### Community 214 - "Community 214"
Cohesion: 0.67
Nodes (1): prisma

### Community 215 - "Community 215"
Cohesion: 0.67
Nodes (1): prisma

### Community 216 - "Community 216"
Cohesion: 0.67
Nodes (1): prisma

### Community 217 - "Community 217"
Cohesion: 0.67
Nodes (1): HealthController

### Community 218 - "Community 218"
Cohesion: 1.00
Nodes (2): bootstrap(), parseCsvList()

### Community 219 - "Community 219"
Cohesion: 0.67
Nodes (1): JwtStrategy

### Community 221 - "Community 221"
Cohesion: 1.00
Nodes (1): media_storage_usage

### Community 224 - "Community 224"
Cohesion: 1.00
Nodes (1): MediaModule

## Knowledge Gaps
- **734 isolated node(s):** `local_ai_server.py — Minimal local model server for ExamTrust AI feature Uses l`, `Try to pull the first valid JSON object out of model output.`, `prisma`, `prisma`, `prisma` (+729 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 1`** (1 nodes): `ApiClient`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 6`** (1 nodes): `QuestionsService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 8`** (2 nodes): `2d105be Convert FE from embedded repository to regular folder`, `mocks`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 11`** (1 nodes): `SubmissionsController`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 17`** (2 nodes): `AiService`, `OnModuleInit`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 28`** (1 nodes): `ExamsService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 31`** (1 nodes): `QuestionDraftsController`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 37`** (1 nodes): `ExamsController`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 43`** (1 nodes): `AuthService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 45`** (2 nodes): `AuthUser`, `CoursesService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 48`** (1 nodes): `AuthController`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 56`** (2 nodes): `28db160 feat(ai): integrate LangGraph multi-agent squad for autonomous exam audit and optimization (EX-044)`, `ExamAuditGraphRunnable`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 64`** (1 nodes): `EnrollmentsController`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 65`** (1 nodes): `EnrollmentsService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 66`** (1 nodes): `ExamLinksService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 77`** (1 nodes): `CoursesController`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 82`** (1 nodes): `AiController`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 84`** (1 nodes): `CacheService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 88`** (1 nodes): `QueueService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 99`** (1 nodes): `ExamRiskAssessmentService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 102`** (1 nodes): `UsersController`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 103`** (1 nodes): `UsersService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 105`** (2 nodes): `EmbeddingService`, `SemanticMatchResult`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 108`** (1 nodes): `ExamLinksController`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 115`** (1 nodes): `DistributedEventsService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 121`** (1 nodes): `AIGenerationProcessor`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 130`** (2 nodes): `AiStatusController`, `safeEqual()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 138`** (1 nodes): `AccessPolicyService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 143`** (1 nodes): `TopicGuardrailsService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 145`** (1 nodes): `ExamQualityReviewService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 149`** (1 nodes): `ApiRequestError`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 150`** (1 nodes): `MediaController`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 151`** (1 nodes): `QuestionMetadataController`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 159`** (1 nodes): `AuditService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 160`** (1 nodes): `RateLimiterService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 163`** (2 nodes): `CanActivate`, `RateLimitGuard`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 164`** (2 nodes): `CanActivate`, `RolesGuard`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 165`** (1 nodes): `ExamAuditService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 170`** (2 nodes): `FormattedText()`, `FormattedTextProps`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 174`** (1 nodes): `SystemOverviewController`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 175`** (1 nodes): `AuditController`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 179`** (2 nodes): `PaginatedResult`, `PaginationDto`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 183`** (1 nodes): `LecturerDashboardController`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 184`** (1 nodes): `LecturerDashboardService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 187`** (2 nodes): `prisma`, `TABLES`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 188`** (2 nodes): `prisma`, `REQUIRED_COLUMNS`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 189`** (2 nodes): `backendEnvPath`, `prisma`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 190`** (2 nodes): `backendEnvPath`, `prisma`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 191`** (1 nodes): `EventsProcessor`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 192`** (1 nodes): `GradingProcessor`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 193`** (1 nodes): `IntegrityLogsProcessor`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 194`** (1 nodes): `AIGenerationJobsController`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 196`** (1 nodes): `SubmissionsEventsService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 198`** (2 nodes): `notifications`, `users`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 199`** (2 nodes): `auth_sessions`, `users`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 200`** (2 nodes): `question_bank_preferences`, `users`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 201`** (2 nodes): `ai_generation_records`, `anomaly_flags`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 202`** (2 nodes): `VerifyApiKeyDto`, `VerifyApiKeyResult`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 203`** (2 nodes): `prisma`, `{ PrismaClient }`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 204`** (2 nodes): `LimitConfig`, `POLICIES`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 205`** (1 nodes): `mocks`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 206`** (1 nodes): `prisma`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 207`** (1 nodes): `prisma`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 208`** (1 nodes): `prisma`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 209`** (1 nodes): `prisma`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 210`** (1 nodes): `prisma`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 211`** (1 nodes): `prisma`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 212`** (1 nodes): `prisma`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 213`** (1 nodes): `prisma`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 214`** (1 nodes): `prisma`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 215`** (1 nodes): `prisma`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 216`** (1 nodes): `prisma`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 217`** (1 nodes): `HealthController`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 218`** (2 nodes): `bootstrap()`, `parseCsvList()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 219`** (1 nodes): `JwtStrategy`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 221`** (1 nodes): `media_storage_usage`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 224`** (1 nodes): `MediaModule`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ApiClient` connect `Community 1` to `Community 69`, `Community 147`, `Community 148`, `Community 149`, `Community 185`, `Community 186`, `Community 222`, `Community 223`?**
  _High betweenness centrality (0.090) - this node is a cross-community bridge._
- **Why does `SubmissionsService` connect `Community 26` to `Community 0`, `Community 220`, `Community 62`, `Community 123`, `Community 74`, `Community 197`, `Community 100`, `Community 153`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Why does `QuestionsService` connect `Community 6` to `Community 0`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **What connects `local_ai_server.py — Minimal local model server for ExamTrust AI feature Uses l`, `Try to pull the first valid JSON object out of model output.`, `prisma` to the rest of the system?**
  _734 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.10408031684627429 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.028855721393034824 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.051582278481012656 - nodes in this community are weakly interconnected._