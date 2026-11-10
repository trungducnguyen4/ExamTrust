# Graph Report - .  (2026-11-10)

## Corpus Check
- Large corpus: 707 files · ~1,073,050 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder, or use --no-semantic to run AST-only.

## Summary
- 3340 nodes · 14148 edges · 209 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output
- Edge kinds: ON_BRANCH: 5123 · MODIFIES: 2370 · imports: 1862 · contains: 1763 · imports_from: 1134 · method: 739 · calls: 728 · PARENT_OF: 319 · references: 87 · inherits: 11 · implements: 10 · rationale_for: 2


## Input Scope
- Requested: auto
- Resolved: committed (source: default-auto)
- Included files: 707 · Candidates: 774
- Excluded: 4 untracked · 111250 ignored · 1 sensitive · 0 missing committed
- Recommendation: Use --scope all or graphify.yaml inputs.corpus for a knowledge-base folder.

## Graph Freshness
- Built from Git commit: `14777e7`
- Compare this hash to `git rev-parse HEAD` before trusting freshness-sensitive graph output.
## God Nodes (most connected - your core abstractions)
1. `ApiClient` - 163 edges
2. `SubmissionsService` - 88 edges
3. `Button` - 77 edges
4. `cn()` - 68 edges
5. `Card` - 57 edges
6. `CardContent` - 57 edges
7. `QuestionsService` - 53 edges
8. `CardHeader` - 51 edges
9. `CardTitle` - 50 edges
10. `DashboardLayout()` - 49 edges

## Surprising Connections (you probably didn't know these)
- `02b1de4 Pagination` --PARENT_OF--> `4e55692 Merge pull request #23 from OAB710/main`  [EXTRACTED]
  git → git  _Bridges community 0 → community 25_
- `0391dc3 mang project tu repo cu qua` --ON_BRANCH--> `hotfix/EX-029-filter-panel-syntax`  [EXTRACTED]
  git → git  _Bridges community 2 → community 0_
- `0aae96f add` --PARENT_OF--> `0e4348a add`  [EXTRACTED]
  git → git  _Bridges community 0 → community 17_
- `14777e7 perf(audit,exam-preview,question-bank): optimize load times and implement GET ai/jobs/:id [EX-052]` --ON_BRANCH--> `feature/EX-052-perf-optimization-and-audit-endpoint`  [EXTRACTED]
  git → git  _Bridges community 8 → community 0_
- `1ea6b35 add` --PARENT_OF--> `b9a4c06 add`  [EXTRACTED]
  git → git  _Bridges community 0 → community 21_

## Communities

### Community 0 - "Community 0"
Cohesion: 0.09
Nodes (299): media_storage_usage, media_user_storage_usage, AiModule, SWITCHABLE_PROVIDERS, bugfix/EX-033-metadata-base-env, bugfix/EX-038-optimize-dashboard-queries, chore/EX-036-warm-window, duc (+291 more)

### Community 1 - "Community 1"
Cohesion: 0.03
Nodes (1): ApiClient

### Community 2 - "Community 2"
Cohesion: 0.03
Nodes (25): courses, topics, courses, exam_snapshots, AuditModule, AuthModule, CacheModule, 0391dc3 mang project tu repo cu qua (+17 more)

### Community 3 - "Community 3"
Cohesion: 0.06
Nodes (54): AuditLog, Unit, UNIT_LABELS, UNIT_SECONDS, aliases, EditableStudentImport(), Field, fields (+46 more)

### Community 4 - "Community 4"
Cohesion: 0.05
Nodes (53): EVIDENCE_SIGNAL_LABELS, EvidenceCapture, getEvidenceEventLabel(), IntegrityCaseDetail(), IntegrityCaseDetailProps, IntegrityTimelineEvent, FlaggedSubmission, IntegrityReason (+45 more)

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
Cohesion: 0.06
Nodes (29): AiController, 14777e7 perf(audit,exam-preview,question-bank): optimize load times and implement GET ai/jobs/:id [EX-052], DonutSegment, QuestionBankDonutStats(), QuestionBankDonutStatsProps, QuestionBankCourse, useQuestionBankData(), Params (+21 more)

### Community 9 - "Community 9"
Cohesion: 0.05
Nodes (3): 2d105be Convert FE from embedded repository to regular folder, mocks, mocks

### Community 10 - "Community 10"
Cohesion: 0.08
Nodes (37): DurationInput(), BankQuestionOption, BankTopic, buildReviewSettingsPayload(), CourseOption, createDefaultForm(), createDefaultReviewSettingsDraft(), DIFFICULTY_LABEL_VI (+29 more)

### Community 11 - "Community 11"
Cohesion: 0.07
Nodes (28): AuthPageShell(), AuthContext, AuthContextType, AuthState, demoAccounts, elapsedMs(), enabledValues, isPerfLogEnabled() (+20 more)

### Community 12 - "Community 12"
Cohesion: 0.05
Nodes (1): SubmissionsController

### Community 13 - "Community 13"
Cohesion: 0.08
Nodes (29): metadata, Providers(), AuthProvider(), Action, ActionType, actionTypes, addToRemoveQueue(), dispatch() (+21 more)

### Community 14 - "Community 14"
Cohesion: 0.08
Nodes (26): themes, ThemeToggle(), AGGREGATE_ALERT_TYPES, EMPTY_STUDENT_FILTERS, EVIDENCE_SIGNAL_LABELS, EvidenceCapture, ExamMonitor(), ExamOverview (+18 more)

### Community 15 - "Community 15"
Cohesion: 0.06
Nodes (32): useIsMobile(), SheetContent, SheetContentProps, SheetDescription, SheetOverlay, SheetTitle, sheetVariants, Sidebar (+24 more)

### Community 16 - "Community 16"
Cohesion: 0.15
Nodes (2): AiService, OnModuleInit

### Community 17 - "Community 17"
Cohesion: 0.09
Nodes (18): 0e4348a add, 23cc713 Merge remote-tracking branch 'upstream/main', f2db362 Refactor VI + RCM Topic + AI Summarize, CreateCourseDto, CreateUserDto, LoginDto, RegisterDto, UpdateCourseDto (+10 more)

### Community 18 - "Community 18"
Cohesion: 0.17
Nodes (30): buildBeInfoText(), buildFeInfoText(), buildPublicInfoText(), buildR2InfoText(), buildSystemOverviewConclusions(), buildSystemOverviewText(), cfGraphQL(), formatBuildStatus() (+22 more)

### Community 19 - "Community 19"
Cohesion: 0.13
Nodes (14): iso(), rangeFor(), AdminPageShell(), AdminPageShellProps, AdminStatCardProps, copy, DevopsStatus, Props (+6 more)

### Community 20 - "Community 20"
Cohesion: 0.07
Nodes (3): OnModuleDestroy, OnModuleInit, SubmissionsService

### Community 21 - "Community 21"
Cohesion: 0.07
Nodes (8): b9a4c06 add, CoursesController, CoursesModule, EnrollmentsModule, ExamLinksModule, ExamsModule, SubmissionsModule, UsersModule

### Community 22 - "Community 22"
Cohesion: 0.08
Nodes (9): buildEvidenceStorageKey(), DEFAULT_EVENT_CAPTURE_LIMITS, DEFAULT_POLICY, EventCaptureLimits, KNOWN_SIGNAL_SLUGS, OnModuleInit, ProctoringEvidenceService, SCHEDULED_CAPTURE_PERCENTAGES (+1 more)

### Community 23 - "Community 23"
Cohesion: 0.10
Nodes (11): MetricCardProps, cn(), ListToolbarProps, AccordionContent, AccordionItem, AccordionTrigger, AvatarImage, HoverCardContent (+3 more)

### Community 24 - "Community 24"
Cohesion: 0.11
Nodes (1): ExamsService

### Community 25 - "Community 25"
Cohesion: 0.12
Nodes (12): 4e55692 Merge pull request #23 from OAB710/main, 7aa5196 Fix Luồng Quan Trọng, fd78aa1 Doi thang diem 10, sua ma tran dap an, dong bo naming giam sat, doi AI provider truc tiep, mocks, formatSignedScoreAdjustment(), getScoreAdjustmentCategoryLabel(), SCORE_ADJUSTMENT_CATEGORY_LABELS, StructuredValue (+4 more)

### Community 26 - "Community 26"
Cohesion: 0.11
Nodes (20): GeneratedQuestion, Params, StoredActiveAiJob, typeMap, useQuestionAiGeneration(), EditorQuestionType, useQuestionAnswerState(), useQuestionPersistence() (+12 more)

### Community 27 - "Community 27"
Cohesion: 0.15
Nodes (9): AdminDashboardModule, a4ea817 Merge pull request #4 from trungducnguyen4/duc, f4e10e9 add, f593a1b Merge remote-tracking branch 'upstream/main', ReviewAnomalyFlagDto, ReviewIntegrityCaseDto, RiskFlagDecision, nextConfig (+1 more)

### Community 28 - "Community 28"
Cohesion: 0.08
Nodes (1): QuestionDraftsController

### Community 29 - "Community 29"
Cohesion: 0.11
Nodes (19): { academicYear: defaultAcademicYear, term: defaultTerm }, academicYearOptions, buildToken(), CourseForm, CourseItem, defaultForm, EMPTY_FILTERS, EnrollResult (+11 more)

### Community 30 - "Community 30"
Cohesion: 0.11
Nodes (17): EMPTY_FILTERS, EMPTY_PATTERNS, EMPTY_STATS, IntegrityCasesResponse, IntegrityPatterns, IntegrityStats, 1f86444 feat(fe): unify search bar and filter controls into single toolbar globally across all tabs (EX-043), d0edeff Merge pull request #46 from trungducnguyen4/feature/EX-044-langgraph-autonomous-exam-qa-squad (+9 more)

### Community 31 - "Community 31"
Cohesion: 0.11
Nodes (11): ListPageHeader(), ListPageHeaderProps, compareValues(), parseDate(), SortableItem, sortItems(), SortOrder, StudentCourse (+3 more)

### Community 32 - "Community 32"
Cohesion: 0.12
Nodes (20): completedStatuses, useStudentDashboardData(), COMPLETED_STATUSES, CourseExamAction, CourseExamForAction, CourseExamSubmission, ExamDisplayState, getCourseExamAction() (+12 more)

### Community 33 - "Community 33"
Cohesion: 0.12
Nodes (21): QUESTION_TYPES, QuestionType, backendEnvPath, buildSampleMediaFields(), buildTypePlan(), COURSE_QUESTION_PLAN, COURSE_TOPIC_LABELS, DupQuestion (+13 more)

### Community 34 - "Community 34"
Cohesion: 0.15
Nodes (14): SessionMeta, TokenUser, NestInterceptor, PerfInterceptor, OnModuleDestroy, OnModuleInit, { PrismaClient }, PrismaService (+6 more)

### Community 35 - "Community 35"
Cohesion: 0.15
Nodes (19): 7ff6d1c Merge pull request #28 from OAB710/main, EXAM_PLANS, ExamPlan, main(), prisma, toExamStatus(), touchDemoExamToTop(), addMinutes() (+11 more)

### Community 36 - "Community 36"
Cohesion: 0.10
Nodes (1): ExamsController

### Community 37 - "Community 37"
Cohesion: 0.13
Nodes (14): ActiveFilterChips(), ActiveFilterChipsProps, getFilterChips(), Course, Exam, completedAttemptStatuses, rowAccentByStatus, statusLabel() (+6 more)

### Community 38 - "Community 38"
Cohesion: 0.15
Nodes (14): AdminStatCard(), EMPTY_FILTERS, Exam, da20a4e add, CourseOption, Exam, GRADING_STRATEGY_LABELS, unwrapPaginatedData() (+6 more)

### Community 39 - "Community 39"
Cohesion: 0.11
Nodes (11): AttentionSection(), PRIORITY_STYLES, HelpedTitle(), CourseSummary, difficultyClassName(), Exam, formatDifficulty(), QuestionBankSummary (+3 more)

### Community 40 - "Community 40"
Cohesion: 0.16
Nodes (12): answerTitles, FillBlankGuide(), OptionRowProps, Props, QuestionAnswerEditor(), lineContentCounterText(), LineValidationResult, validateLineContent() (+4 more)

### Community 41 - "Community 41"
Cohesion: 0.11
Nodes (10): hash64(), LogSpec, main(), now, prisma, Profile, PROFILES, randomHash64() (+2 more)

### Community 42 - "Community 42"
Cohesion: 0.18
Nodes (9): BackToDashboardButton(), BackToDashboardButtonProps, ButtonSize, ButtonVariant, TimelineEvent, TimelinePayload, Button, CardContent (+1 more)

### Community 43 - "Community 43"
Cohesion: 0.16
Nodes (17): formatAttemptLimitVi(), formatDateVi(), formatNumberVi(), formatPercentVi(), formatScoreVi(), getAttemptStatusLabel(), getExamStatusLabel(), getExamWindowLabel() (+9 more)

### Community 44 - "Community 44"
Cohesion: 0.12
Nodes (14): main(), prisma, TARGET_EXAM_KEYS, main(), EXAMS, main(), prisma, QUESTIONS (+6 more)

### Community 45 - "Community 45"
Cohesion: 0.19
Nodes (8): DashboardLayout(), GradedQuestion, gradedQuestions, gradingHistory, JoinStep, CardHeader, Separator, StatusBadge

### Community 46 - "Community 46"
Cohesion: 0.19
Nodes (1): AuthService

### Community 47 - "Community 47"
Cohesion: 0.16
Nodes (9): BaseQ, FillBlankQ, FindErrorQ, MatchingQ, MultiChoiceQ, OrderingQ, ShortAnswerQ, SingleChoiceQ (+1 more)

### Community 48 - "Community 48"
Cohesion: 0.17
Nodes (1): AuthController

### Community 49 - "Community 49"
Cohesion: 0.20
Nodes (12): AuditReportData, AutonomousAuditDialogProps, QuestionImprovementItem, BatchGeneratedQuestion, Props, QuestionBatchReviewDialog(), typeLabels, DialogContent (+4 more)

### Community 50 - "Community 50"
Cohesion: 0.15
Nodes (12): useAuth(), getSessionDevice(), groupSessionsByDevice(), Session, SessionGroup, adminNavItems, DashboardLayoutProps, lecturerNavItems (+4 more)

### Community 51 - "Community 51"
Cohesion: 0.12
Nodes (16): AddLogsDto, AutosaveAnswerDto, AutosaveExamDto, CreateScoreAdjustmentDto, ExtendSubmissionDeadlineDto, FinalizeEvidenceCaptureDto, GradeAnswerDto, ReopenSubmissionDto (+8 more)

### Community 52 - "Community 52"
Cohesion: 0.17
Nodes (12): formatAnswerCell(), formatChoiceAnswer(), formatPoints(), formatStructuredAnswer(), GradingBreakdown(), OptionDisplay, optionDisplays(), parseOptionTexts() (+4 more)

### Community 53 - "Community 53"
Cohesion: 0.13
Nodes (10): BulkStudentImport(), completedSubmissionStatuses, Course, CourseExam, CourseExamSummary, Enrollment, ExamSubmission, Student (+2 more)

### Community 54 - "Community 54"
Cohesion: 0.16
Nodes (12): ExamSecurityModal(), ExamSecurityModalProps, violationLabels, LiveClock(), emptyCounts, ExamSecurityState, FirstViolationNotice, useExamSecurity() (+4 more)

### Community 55 - "Community 55"
Cohesion: 0.23
Nodes (1): CoursesService

### Community 56 - "Community 56"
Cohesion: 0.14
Nodes (9): AnswerMatrix, EvidenceCapture, ExamOverview, ExamResultsList(), groupAnomaliesByStudent(), MonitoringGroup, RiskFlag, SubmissionTimeline (+1 more)

### Community 57 - "Community 57"
Cohesion: 0.17
Nodes (9): DateRangeValue, FilterChip, FilterDefinition, FilterValue, FilterValues, ListFilterOption, NumberRangeValue, TextFilterOperator (+1 more)

### Community 58 - "Community 58"
Cohesion: 0.17
Nodes (9): CalendarView, ExamDetailsDialog(), FlexibleExamCard(), getEventTone(), getStatusLabel(), HOURS, LaidOutEvent, ScheduleExamItem (+1 more)

### Community 59 - "Community 59"
Cohesion: 0.19
Nodes (8): AiEvaluationJudge, EvalMetricResult, GOLDEN_ESSAY_GRADING_CASES, GOLDEN_QUESTION_CASES, GOLDEN_RISK_CASES, GoldenEssayGradingCase, GoldenQuestionCase, GoldenRiskAssessmentCase

### Community 60 - "Community 60"
Cohesion: 0.29
Nodes (14): ai_generation_records, course_topics, courses, exam_questions, question_course_scopes, question_drafts, question_tags, question_topics (+6 more)

### Community 61 - "Community 61"
Cohesion: 0.19
Nodes (13): AnswerMap, denormalizeSubmissionAnswer(), isAnswered(), mapBackendToUiQuestion(), normalizeSubmissionAnswer(), parseOptions(), QType, Question (+5 more)

### Community 63 - "Community 63"
Cohesion: 0.16
Nodes (9): Exam, Submission, User, answerPatterns, examResult, feedbackHistory, recommendations, sectionScores (+1 more)

### Community 64 - "Community 64"
Cohesion: 0.24
Nodes (11): ApiKeyConfigDialog(), ApiKeyConfigDialogProps, AI_PROVIDERS, clearUserAiConfig(), detectAiProvider(), getUserAiConfig(), ProviderMeta, saveUserAiConfig() (+3 more)

### Community 65 - "Community 65"
Cohesion: 0.15
Nodes (1): EnrollmentsController

### Community 66 - "Community 66"
Cohesion: 0.27
Nodes (1): EnrollmentsService

### Community 67 - "Community 67"
Cohesion: 0.24
Nodes (1): ExamLinksService

### Community 68 - "Community 68"
Cohesion: 0.15
Nodes (4): ExamData, ExamQuestion, getCorrectAnswerText(), getOptionEntries()

### Community 69 - "Community 69"
Cohesion: 0.15
Nodes (4): ExamData, ExamQuestion, getCorrectAnswerText(), getOptionEntries()

### Community 70 - "Community 70"
Cohesion: 0.21
Nodes (13): AUTO_GRADED_TYPES, buildQuestionTemplate(), buildSnapshotPayload(), buildSubmittedAnswer(), buildToken(), createExamSnapshot(), generateCourseCode(), isAutoGradable() (+5 more)

### Community 71 - "Community 71"
Cohesion: 0.14
Nodes (6): ButtonProps, buttonVariants, CalendarProps, PaginationContent, PaginationItem, PaginationLinkProps

### Community 72 - "Community 72"
Cohesion: 0.15
Nodes (12): AIGenerateSectionDto, AIGenerationConstraintsDto, AISection, ApplyAICandidateDto, CreateQuestionDraftDto, DraftPublishMode, DraftValidationLevel, PublishQuestionDraftDto (+4 more)

### Community 73 - "Community 73"
Cohesion: 0.18
Nodes (7): BATCH_SIZE, fetchBatch(), LegacyQuestion, main(), prisma, { PrismaClient }, processQuestion()

### Community 75 - "Community 75"
Cohesion: 0.19
Nodes (12): formatBadgeText(), getStatusBadgeTone(), LegacyStatusBadgeVariant, normalizeStatusKey(), renderBadgeContent(), STATUS_BADGE_MAP, StatusBadgeDomain, StatusBadgeMapEntry (+4 more)

### Community 76 - "Community 76"
Cohesion: 0.17
Nodes (4): roleToPath, capabilityGroups, operatingPrinciples, Header()

### Community 77 - "Community 77"
Cohesion: 0.21
Nodes (7): QuestionRenderer(), clearPersistedIntegrityQueue(), DuringReviewFeedback, getIntegrityQueueStorageKey(), loadPersistedIntegrityQueue(), PendingIntegrityEvent, savePersistedIntegrityQueue()

### Community 78 - "Community 78"
Cohesion: 0.26
Nodes (9): FilterPanelProps, Drawer(), DrawerContent, DrawerDescription, DrawerFooter(), DrawerHeader(), DrawerOverlay, DrawerTitle (+1 more)

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
Nodes (10): buildContextLines(), buildExamTrustPromptHeader(), ExamTrustAiAnalyticsSummary, ExamTrustAiContext, ExamTrustAiPromptParams, ExamTrustAiUseCase, formatNumber(), getOllamaGenerationOptions() (+2 more)

### Community 83 - "Community 83"
Cohesion: 0.20
Nodes (1): CacheService

### Community 84 - "Community 84"
Cohesion: 0.29
Nodes (2): extractUploaderIdFromKey(), MediaService

### Community 85 - "Community 85"
Cohesion: 0.22
Nodes (9): COURSE_PLANS, CoursePlan, main(), prisma, daysAgo(), LECTURER_DEPARTMENTS, LECTURER_FULL_NAMES, main() (+1 more)

### Community 86 - "Community 86"
Cohesion: 0.24
Nodes (1): QueueService

### Community 87 - "Community 87"
Cohesion: 0.18
Nodes (7): ChartConfig, ChartContainer, ChartContext, ChartContextProps, ChartLegendContent, ChartTooltipContent, THEMES

### Community 88 - "Community 88"
Cohesion: 0.36
Nodes (9): anomaly_flags, exam_instances, exam_questions, exam_submissions, exams, focus_events, interaction_logs, question_versions (+1 more)

### Community 89 - "Community 89"
Cohesion: 0.24
Nodes (3): AdminDashboardService, COMPLETED, ZALO_BOT_COMMANDS

### Community 90 - "Community 90"
Cohesion: 0.27
Nodes (3): AITelemetry, AiTelemetryService, ProviderPricing

### Community 91 - "Community 91"
Cohesion: 0.29
Nodes (4): auditChaos(), auditFeatures(), auditPerformance(), auditSecurity()

### Community 92 - "Community 92"
Cohesion: 0.24
Nodes (7): AttentionItemData, AttentionPriority, LecturerAttentionResponse, LecturerAttentionSummary, LECTURER_ATTENTION_QUERY_KEY, PRIORITY_ORDER, useAttentionItems()

### Community 93 - "Community 93"
Cohesion: 0.22
Nodes (6): 72d5704 add, CheckStatus, defaultExamInfo, ExamStep, SystemCheck, Checkbox

### Community 94 - "Community 94"
Cohesion: 0.24
Nodes (7): 9765fa3 Sua lenh bot Zalo, them nut lam moi + fix cuon trang khi doi trang, DataPagination(), DataPaginationProps, Course, EMPTY_FILTERS, gradientClasses, GroupedCourses

### Community 95 - "Community 95"
Cohesion: 0.22
Nodes (8): bloomOptions, ClarificationConfig, distractorOptions, Props, QuestionClarificationDialog(), styleOptions, timeOptions, DialogDescription

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
Cohesion: 0.25
Nodes (5): AI_SECTIONS, AiJobsService, AISectionValue, AiTaskType, CreateAiJobParams

### Community 106 - "Community 106"
Cohesion: 0.33
Nodes (2): EmbeddingService, SemanticMatchResult

### Community 107 - "Community 107"
Cohesion: 0.22
Nodes (7): BulkStudentImportProps, COLUMN_ALIASES, ImportResult, ImportState, ParsedRow, ValidatedData, ValidationError

### Community 108 - "Community 108"
Cohesion: 0.22
Nodes (1): ExamLinksController

### Community 109 - "Community 109"
Cohesion: 0.22
Nodes (8): MEDIA_ACCEPT, MEDIA_ALLOWED_MIME_TYPES, MEDIA_MAX_BYTES, MediaAttachment, MediaAttachmentType, releaseMediaUpload(), uploadMediaFile(), validateMediaFile()

### Community 110 - "Community 110"
Cohesion: 0.47
Nodes (8): loginRequest(), main(), percentile(), runConcurrent(), runSequential(), safeJson(), summarize(), timedRequest()

### Community 111 - "Community 111"
Cohesion: 0.22
Nodes (6): Command, CommandDialogProps, CommandGroup, CommandInput, CommandSeparator, DialogProps

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
Nodes (6): Params, relationLabel, TopicRelation, topicRelationLabel, TopicSuggestion, useQuestionTopics()

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
Cohesion: 0.46
Nodes (1): AIGenerationProcessor

### Community 121 - "Community 121"
Cohesion: 0.25
Nodes (6): exceptions, ignoredDirectories, include, limit, oversized, root

### Community 123 - "Community 123"
Cohesion: 0.25
Nodes (5): Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage

### Community 124 - "Community 124"
Cohesion: 0.25
Nodes (7): NavigationMenu, NavigationMenuContent, NavigationMenuIndicator, NavigationMenuList, NavigationMenuTrigger, navigationMenuTriggerStyle, NavigationMenuViewport

### Community 125 - "Community 125"
Cohesion: 0.67
Nodes (6): course_topics, courses, question_course_scopes, question_topics, questions, topics

### Community 126 - "Community 126"
Cohesion: 0.48
Nodes (6): exam_question_snapshots, exam_snapshots, exams, question_snapshots, question_versions, questions

### Community 127 - "Community 127"
Cohesion: 0.43
Nodes (5): detectAiProvider(), DetectedProvider, PROVIDER_INFO, ProviderDetectionResult, verifyApiKeyWithProvider()

### Community 128 - "Community 128"
Cohesion: 0.33
Nodes (2): AiStatusController, safeEqual()

### Community 129 - "Community 129"
Cohesion: 0.57
Nodes (4): e0e0f5b Fix Bug, fd68a4b Merge pull request #16 from OAB710/main, THEME_OPTIONS, THEME_PROVIDER_OPTIONS

### Community 130 - "Community 130"
Cohesion: 0.33
Nodes (4): _extract_json(), generate(), local_ai_server.py — Minimal local model server for ExamTrust AI feature Uses l, Try to pull the first valid JSON object out of model output.

### Community 131 - "Community 131"
Cohesion: 0.29
Nodes (6): BulkEnrollByEmailsDto, BulkEnrollmentDto, BulkImportStudentRow, BulkImportStudentsDto, CreateEnrollmentDto, UpdateEnrollmentStatusDto

### Community 132 - "Community 132"
Cohesion: 0.29
Nodes (6): AddQuestionsToExamDto, CreateExamDto, RescheduleExamDto, ShareExamDto, UpdateExamDto, UpdateExamQuestionDto

### Community 133 - "Community 133"
Cohesion: 0.29
Nodes (6): main(), prisma, Q, SEMANTIC, SINGLETON, TEXT_TEXT

### Community 134 - "Community 134"
Cohesion: 0.43
Nodes (3): QueueModule, SharedRedisModule, buildRedisOptions()

### Community 135 - "Community 135"
Cohesion: 0.38
Nodes (5): deleteAllUnderPrefix(), main(), parseArgs(), PREFIXES_BY_TARGET, PROTECTED_PREFIXES

### Community 136 - "Community 136"
Cohesion: 0.38
Nodes (1): AccessPolicyService

### Community 137 - "Community 137"
Cohesion: 0.38
Nodes (6): accessBadgeClass(), ExamDetail, MySubmission, statusBadgeClass(), StudentExamDetail(), getStatusBadgeLabel()

### Community 138 - "Community 138"
Cohesion: 0.29
Nodes (4): AuthState, DisplayRole, User, UserRole

### Community 139 - "Community 139"
Cohesion: 0.33
Nodes (5): ToggleGroup, ToggleGroupContext, ToggleGroupItem, Toggle, toggleVariants

### Community 140 - "Community 140"
Cohesion: 0.33
Nodes (5): anomaly_flags, exam_instances, focus_events, interaction_logs, tab_switch_events

### Community 141 - "Community 141"
Cohesion: 0.47
Nodes (3): EmptyState(), PageHeader(), PageHeaderProps

### Community 142 - "Community 142"
Cohesion: 0.33
Nodes (1): ExamQualityReviewService

### Community 145 - "Community 145"
Cohesion: 0.40
Nodes (1): ApiRequestError

### Community 146 - "Community 146"
Cohesion: 0.33
Nodes (1): MediaController

### Community 147 - "Community 147"
Cohesion: 0.33
Nodes (1): QuestionMetadataController

### Community 148 - "Community 148"
Cohesion: 0.33
Nodes (5): assertExplanationLength(), assertLineContent(), assertOptionsLength(), assertQuestionContentLength(), QUESTION_LIMITS

### Community 149 - "Community 149"
Cohesion: 0.73
Nodes (5): pickId(), pollAiJob(), request(), requireOk(), run()

### Community 151 - "Community 151"
Cohesion: 0.33
Nodes (5): Exam, ExamHistoryItem, ExamResult, ExamStatus, UpcomingExam

### Community 152 - "Community 152"
Cohesion: 0.60
Nodes (5): ipToLong(), isIpInAnyCidr(), isIpInCidr(), isValidIpOrCidr(), normalizeIp()

### Community 153 - "Community 153"
Cohesion: 0.70
Nodes (4): ai_generation_records, question_drafts, question_versions, questions

### Community 154 - "Community 154"
Cohesion: 0.70
Nodes (4): ai_generation_records, exam_quality_review_items, questions, users

### Community 155 - "Community 155"
Cohesion: 0.70
Nodes (4): exam_instances, exam_submissions, proctoring_evidence_captures, users

### Community 156 - "Community 156"
Cohesion: 0.40
Nodes (1): AuditService

### Community 157 - "Community 157"
Cohesion: 0.40
Nodes (1): RateLimiterService

### Community 158 - "Community 158"
Cohesion: 0.40
Nodes (4): ApproveQuestionAiImprovementDto, CreateQuestionAiImprovementDto, RejectQuestionAiImprovementDto, UpdateQuestionAiImprovementDraftDto

### Community 159 - "Community 159"
Cohesion: 0.40
Nodes (4): CopyQuestionBankDto, CreateQuestionCrudDto, PreviewCopyQuestionBankDto, UpdateQuestionCrudDto

### Community 160 - "Community 160"
Cohesion: 0.50
Nodes (2): CanActivate, RateLimitGuard

### Community 161 - "Community 161"
Cohesion: 0.40
Nodes (2): CanActivate, RolesGuard

### Community 162 - "Community 162"
Cohesion: 0.40
Nodes (1): ExamAuditService

### Community 163 - "Community 163"
Cohesion: 0.40
Nodes (4): Direction, evaluateMatrixCase(), MATRIX_27_CASES, MatrixCase

### Community 164 - "Community 164"
Cohesion: 0.40
Nodes (4): MEDIA_ALLOWED_MIME_TYPES, MEDIA_EXTENSION_BY_MIME, MEDIA_MAX_BYTES, MediaAttachmentType

### Community 165 - "Community 165"
Cohesion: 0.40
Nodes (3): IdempotencyMiddleware, IdempotencyStore, NestMiddleware

### Community 166 - "Community 166"
Cohesion: 0.60
Nodes (4): hasColumn(), hasIndex(), main(), prisma

### Community 167 - "Community 167"
Cohesion: 0.50
Nodes (2): FormattedText(), FormattedTextProps

### Community 168 - "Community 168"
Cohesion: 0.40
Nodes (4): InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot

### Community 169 - "Community 169"
Cohesion: 0.83
Nodes (3): exam_link_usages, exam_links, exams

### Community 170 - "Community 170"
Cohesion: 1.00
Nodes (3): integrity_review_audits, integrity_reviews, users

### Community 171 - "Community 171"
Cohesion: 0.83
Nodes (3): exam_submissions, score_adjustments, users

### Community 172 - "Community 172"
Cohesion: 0.50
Nodes (1): AdminDashboardController

### Community 173 - "Community 173"
Cohesion: 0.50
Nodes (1): AuditController

### Community 174 - "Community 174"
Cohesion: 0.67
Nodes (2): CourseDifficultyDistribution(), CourseDifficultyDistributionProps

### Community 175 - "Community 175"
Cohesion: 0.50
Nodes (3): NavLink, NavLinkBaseProps, NavLinkCompatProps

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
Nodes (1): LecturerDashboardController

### Community 183 - "Community 183"
Cohesion: 0.50
Nodes (1): LecturerDashboardService

### Community 186 - "Community 186"
Cohesion: 0.50
Nodes (2): prisma, TABLES

### Community 187 - "Community 187"
Cohesion: 0.50
Nodes (2): prisma, REQUIRED_COLUMNS

### Community 188 - "Community 188"
Cohesion: 0.50
Nodes (2): backendEnvPath, prisma

### Community 189 - "Community 189"
Cohesion: 0.50
Nodes (2): backendEnvPath, prisma

### Community 190 - "Community 190"
Cohesion: 0.50
Nodes (1): EventsProcessor

### Community 191 - "Community 191"
Cohesion: 0.50
Nodes (1): GradingProcessor

### Community 192 - "Community 192"
Cohesion: 0.50
Nodes (1): IntegrityLogsProcessor

### Community 193 - "Community 193"
Cohesion: 0.50
Nodes (1): AIGenerationJobsController

### Community 195 - "Community 195"
Cohesion: 0.50
Nodes (1): SubmissionsEventsService

### Community 197 - "Community 197"
Cohesion: 1.00
Nodes (2): notifications, users

### Community 198 - "Community 198"
Cohesion: 1.00
Nodes (2): exam_submissions, integrity_reviews

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
Nodes (1): SystemOverviewController

### Community 203 - "Community 203"
Cohesion: 0.67
Nodes (2): VerifyApiKeyDto, VerifyApiKeyResult

### Community 204 - "Community 204"
Cohesion: 0.67
Nodes (2): prisma, { PrismaClient }

### Community 205 - "Community 205"
Cohesion: 0.67
Nodes (1): ExamAuditGraphRunnable

### Community 206 - "Community 206"
Cohesion: 0.67
Nodes (2): courses, mocks

### Community 207 - "Community 207"
Cohesion: 0.67
Nodes (1): mocks

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
Nodes (1): prisma

### Community 218 - "Community 218"
Cohesion: 1.00
Nodes (2): bootstrap(), parseCsvList()

### Community 219 - "Community 219"
Cohesion: 0.67
Nodes (1): JwtStrategy

### Community 221 - "Community 221"
Cohesion: 1.00
Nodes (1): mocks

### Community 227 - "Community 227"
Cohesion: 1.00
Nodes (1): HealthController

## Knowledge Gaps
- **729 isolated node(s):** `local_ai_server.py — Minimal local model server for ExamTrust AI feature Uses l`, `Try to pull the first valid JSON object out of model output.`, `prisma`, `prisma`, `prisma` (+724 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 1`** (1 nodes): `ApiClient`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 6`** (1 nodes): `QuestionsService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 12`** (1 nodes): `SubmissionsController`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 16`** (2 nodes): `AiService`, `OnModuleInit`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 24`** (1 nodes): `ExamsService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 28`** (1 nodes): `QuestionDraftsController`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 36`** (1 nodes): `ExamsController`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 46`** (1 nodes): `AuthService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 48`** (1 nodes): `AuthController`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 55`** (1 nodes): `CoursesService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 65`** (1 nodes): `EnrollmentsController`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 66`** (1 nodes): `EnrollmentsService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 67`** (1 nodes): `ExamLinksService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 83`** (1 nodes): `CacheService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 84`** (2 nodes): `extractUploaderIdFromKey()`, `MediaService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 86`** (1 nodes): `QueueService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 99`** (1 nodes): `ExamRiskAssessmentService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 102`** (1 nodes): `UsersController`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 103`** (1 nodes): `UsersService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 106`** (2 nodes): `EmbeddingService`, `SemanticMatchResult`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 108`** (1 nodes): `ExamLinksController`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 114`** (1 nodes): `DistributedEventsService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 120`** (1 nodes): `AIGenerationProcessor`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 128`** (2 nodes): `AiStatusController`, `safeEqual()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 136`** (1 nodes): `AccessPolicyService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 142`** (1 nodes): `ExamQualityReviewService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 145`** (1 nodes): `ApiRequestError`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 146`** (1 nodes): `MediaController`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 147`** (1 nodes): `QuestionMetadataController`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 156`** (1 nodes): `AuditService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 157`** (1 nodes): `RateLimiterService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 160`** (2 nodes): `CanActivate`, `RateLimitGuard`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 161`** (2 nodes): `CanActivate`, `RolesGuard`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 162`** (1 nodes): `ExamAuditService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 167`** (2 nodes): `FormattedText()`, `FormattedTextProps`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 172`** (1 nodes): `AdminDashboardController`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 173`** (1 nodes): `AuditController`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 174`** (2 nodes): `CourseDifficultyDistribution()`, `CourseDifficultyDistributionProps`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 179`** (2 nodes): `PaginatedResult`, `PaginationDto`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 182`** (1 nodes): `LecturerDashboardController`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 183`** (1 nodes): `LecturerDashboardService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 186`** (2 nodes): `prisma`, `TABLES`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 187`** (2 nodes): `prisma`, `REQUIRED_COLUMNS`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 188`** (2 nodes): `backendEnvPath`, `prisma`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 189`** (2 nodes): `backendEnvPath`, `prisma`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 190`** (1 nodes): `EventsProcessor`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 191`** (1 nodes): `GradingProcessor`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 192`** (1 nodes): `IntegrityLogsProcessor`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 193`** (1 nodes): `AIGenerationJobsController`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 195`** (1 nodes): `SubmissionsEventsService`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 197`** (2 nodes): `notifications`, `users`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 198`** (2 nodes): `exam_submissions`, `integrity_reviews`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 199`** (2 nodes): `auth_sessions`, `users`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 200`** (2 nodes): `question_bank_preferences`, `users`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 201`** (2 nodes): `ai_generation_records`, `anomaly_flags`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 202`** (1 nodes): `SystemOverviewController`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 203`** (2 nodes): `VerifyApiKeyDto`, `VerifyApiKeyResult`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 204`** (2 nodes): `prisma`, `{ PrismaClient }`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 205`** (1 nodes): `ExamAuditGraphRunnable`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 206`** (2 nodes): `courses`, `mocks`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 207`** (1 nodes): `mocks`
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
- **Thin community `Community 217`** (1 nodes): `prisma`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 218`** (2 nodes): `bootstrap()`, `parseCsvList()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 219`** (1 nodes): `JwtStrategy`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 221`** (1 nodes): `mocks`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 227`** (1 nodes): `HealthController`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ApiClient` connect `Community 1` to `Community 25`, `Community 143`, `Community 144`, `Community 145`, `Community 184`, `Community 185`, `Community 222`, `Community 223`?**
  _High betweenness centrality (0.091) - this node is a cross-community bridge._
- **Why does `SubmissionsService` connect `Community 20` to `Community 0`, `Community 220`, `Community 62`, `Community 122`, `Community 74`, `Community 196`, `Community 100`, `Community 150`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Why does `QuestionsService` connect `Community 6` to `Community 0`?**
  _High betweenness centrality (0.031) - this node is a cross-community bridge._
- **What connects `local_ai_server.py — Minimal local model server for ExamTrust AI feature Uses l`, `Try to pull the first valid JSON object out of model output.`, `prisma` to the rest of the system?**
  _729 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.09171511378642108 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.028855721393034824 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.02815829528158295 - nodes in this community are weakly interconnected._