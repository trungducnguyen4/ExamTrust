import { CourseTerm } from './course-term';
import type { LecturerAttentionResponse } from '@/features/lecturer/attention/types';
import { elapsedMs, isPerfLogEnabled, logPerf, nowMs } from './perf';

const rawApiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  (typeof import.meta !== "undefined"
    ? ((import.meta as { env?: { VITE_API_BASE_URL?: string } }).env?.VITE_API_BASE_URL as
        | string
        | undefined)
    : undefined);

export const API_BASE_URL = (rawApiBaseUrl?.trim() || 'http://localhost:3001/api').replace(/\/$/, '');

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: any;
  headers?: Record<string, string>;
}

interface RefreshedSession {
  accessToken: string;
  user: any;
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

class ApiClient {
  private baseUrl: string;
  // Access token is kept in memory only (not localStorage) to reduce XSS exposure.
  private memoryToken: string | null = null;
  private refreshPromise: Promise<RefreshedSession | null> | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  /** Public read access for callers that build raw requests (e.g. SSE). */
  getToken(): string | null {
    return this.memoryToken;
  }

  setToken(token: string): void {
    this.memoryToken = token;
  }

  clearToken(): void {
    this.memoryToken = null;
  }

  private async refreshAccessToken(): Promise<RefreshedSession | null> {
    if (!this.refreshPromise) {
      this.refreshPromise = (async () => {
        try {
          const res = await fetch(`${this.baseUrl}/auth/refresh`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
          });
          if (!res.ok) {
            this.memoryToken = null;
            return null;
          }
          const data = (await res.json()) as Partial<RefreshedSession>;
          if (data?.accessToken) {
            this.memoryToken = data.accessToken;
            return { accessToken: data.accessToken, user: data.user };
          }
          this.memoryToken = null;
          return null;
        } catch {
          this.memoryToken = null;
          return null;
        } finally {
          this.refreshPromise = null;
        }
      })();
    }
    return this.refreshPromise;
  }

  /**
   * Restores an authenticated browser session after a page reload without
   * first issuing a protected request that would inevitably return 401.
   */
  async restoreSession(): Promise<any> {
    const session = await this.refreshAccessToken();
    if (!session?.user) {
      throw new ApiRequestError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', 401);
    }
    return session.user;
  }

  async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const { method = 'GET', body, headers = {} } = options;
    const startedAt = nowMs();

    const doFetch = (): Promise<Response> => {
      const token = this.getToken();
      const requestHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        ...headers,
      };
      if (token) {
        requestHeaders['Authorization'] = `Bearer ${token}`;
      }
      return fetch(`${this.baseUrl}${endpoint}`, {
        method,
        headers: requestHeaders,
        credentials: 'include',
        body: body ? JSON.stringify(body) : undefined,
      });
    };

    let response = await doFetch();

    // Access token is stored in memory, so /auth/me also needs a refresh after
    // a full page reload. Only endpoints that create, rotate, or revoke a
    // session are excluded to prevent a refresh loop.
    const refreshExcludedEndpoints = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'];
    if (response.status === 401 && !refreshExcludedEndpoints.includes(endpoint)) {
      const refreshed = await this.refreshAccessToken();
      if (refreshed) {
        response = await doFetch();
      }
    }

    const responseReceivedMs = elapsedMs(startedAt);

    if (!response.ok) {
      const responseText = await response.text();
      let error: any = {};
      try {
        error = responseText ? JSON.parse(responseText) : {};
      } catch {
        error = { message: responseText };
      }
      const message = Array.isArray(error?.message)
        ? error.message.filter(Boolean).join('. ')
        : error?.message || `Yêu cầu thất bại (HTTP ${response.status}).`;
      if (isPerfLogEnabled()) {
        logPerf(`${method} ${endpoint} failed network=${responseReceivedMs}ms status=${response.status}`);
      }
      throw new ApiRequestError(message, response.status, error?.code);
    }

    let parsed: T;
    try {
      parsed = await response.json();
    } catch {
      const text = await response.text().catch(() => '');
      throw new ApiRequestError(
        text || `Empty or non-JSON response (HTTP ${response.status})`,
        response.status,
      );
    }
    if (isPerfLogEnabled()) {
      logPerf(
        `${method} ${endpoint} network=${responseReceivedMs}ms parse+total=${elapsedMs(startedAt)}ms`,
      );
    }
    return parsed;
  }

  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET' });
  }


  private async waitForAiJob<T>(jobId: string, timeoutMs = 120000, intervalMs = 2000): Promise<T> {
    if (!jobId) {
      throw new Error('Không thể theo dõi tác vụ AI: thiếu jobId.');
    }

    const startedAt = Date.now();
    let attempts = 0;
    let lastStatus = 'unknown';


    while (Date.now() - startedAt < timeoutMs) {
      attempts++;
      const job = await this.getQuestionAIGenerationJob(jobId);
      const status = String(job?.status || '').toUpperCase();
      lastStatus = status;

      console.log('[AI] Poll attempt:', { attempts, jobId, status, elapsedMs: Date.now() - startedAt });


      if (status === 'SUCCEEDED') {
        const output = job?.output || {};
        return output as T;
      }

      if (status === 'FAILED' || status === 'REJECTED') {
        throw new Error(job?.errorMessage || `Tác vụ AI thất bại với trạng thái ${status}`);
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new Error(
      `Tác vụ AI đã hết thời gian chờ sau ${timeoutMs}ms. ` +
      `Mã tác vụ: ${jobId}. ` +
      `Trạng thái cuối: ${lastStatus}. ` +
      `Số lần kiểm tra: ${attempts}. ` +
      `Hãy đảm bảo backend và AI worker đang chạy.`,
    );

  }

  // Auth endpoints
  async login(email: string, password: string) {
    const data = await this.request<{ accessToken: string; user: any }>('/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    this.memoryToken = data.accessToken;
    return data;
  }

  async register(data: {
    email: string;
    password: string;
    fullName: string;
    role?: string;
    studentId?: string;
    department?: string;
  }) {
    const result = await this.request<{ accessToken: string; user: any }>('/auth/register', {
      method: 'POST',
      body: data,
    });
    this.memoryToken = result.accessToken;
    return result;
  }

  async getMe() {
    return this.request<any>('/auth/me');
  }

  async logout() {
    try {
      await this.request<{ message: string }>('/auth/logout', { method: 'POST' });
    } catch {
      // Ignore network errors; always clear the local session below.
    } finally {
      this.memoryToken = null;
    }
  }

  async listSessions() {
    return this.request<any[]>('/auth/sessions');
  }

  async revokeSession(sessionId: string) {
    return this.request<{ message: string }>(`/auth/sessions/${sessionId}/revoke`, {
      method: 'POST',
    });
  }

  async revokeAllSessions() {
    return this.request<{ message: string }>('/auth/sessions/revoke-all', {
      method: 'POST',
    });
  }

  /** Admin-only: force-revoke every session of a user (e.g. after confirmed cheating). */
  async revokeUserSessions(userId: string) {
    return this.request<{ message: string }>(`/auth/users/${userId}/sessions/revoke`, {
      method: 'POST',
    });
  }

  async getLecturerAttention() {
    return this.request<LecturerAttentionResponse>('/lecturer/dashboard/attention');
  }

  async updateMyProfile(data: {
    email?: string;
    fullName?: string;
    studentId?: string;
    department?: string;
  }) {
    return this.request<any>('/auth/me', {
      method: 'PATCH',
      body: data,
    });
  }

  async changeMyPassword(data: { currentPassword: string; newPassword: string }) {
    return this.request<{ message: string }>('/auth/me/password', {
      method: 'PATCH',
      body: data,
    });
  }

  async deleteMyProfile(data: { currentPassword: string }) {
    return this.request<{ message: string }>('/auth/me', {
      method: 'DELETE',
      body: data,
    });
  }

  // Users endpoints
  async getUsers(params?: {
    role?: string;
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const queryParams = new URLSearchParams();
    if (params?.role) queryParams.append('role', params.role);
    if (params?.status) queryParams.append('status', params.status);
    if (params?.search) queryParams.append('search', params.search);
    if (params?.page) queryParams.append('page', String(params.page));
    if (params?.limit) queryParams.append('limit', String(params.limit));
    const query = queryParams.toString() ? `?${queryParams.toString()}` : '';
    return this.request<any>(`/users${query}`);
  }

  async getUser(id: string) {
    return this.request<any>(`/users/${id}`);
  }

  async getStudents() {
    return this.request<any[]>('/users/students');
  }

  async getLecturers() {
    return this.request<any[]>('/users/lecturers');
  }

  async createUser(data: {
    email: string;
    password: string;
    fullName: string;
    role: 'ADMIN' | 'LECTURER' | 'STUDENT';
    studentId?: string;
    department?: string;
    status?: 'active' | 'suspended' | 'pending';
  }) {
    return this.request<any>('/users', {
      method: 'POST',
      body: data,
    });
  }

  async updateUser(id: string, data: {
    email?: string;
    password?: string;
    fullName?: string;
    role?: 'ADMIN' | 'LECTURER' | 'STUDENT';
    studentId?: string;
    department?: string;
    status?: 'active' | 'suspended' | 'pending';
  }) {
    return this.request<any>(`/users/${id}`, {
      method: 'PATCH',
      body: data,
    });
  }

  async deleteUser(id: string) {
    return this.request<{ message: string }>(`/users/${id}`, {
      method: 'DELETE',
    });
  }

  // Courses endpoints
  async getCourses(params?: { page?: number; limit?: number; archiveStatus?: 'active' | 'archived' | 'all' }) {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', String(params.page));
    if (params?.limit) queryParams.append('limit', String(params.limit));
    if (params?.archiveStatus) queryParams.append('archiveStatus', params.archiveStatus);
    const query = queryParams.toString() ? `?${queryParams.toString()}` : '';
    return this.request<any>(`/courses${query}`);
  }

  async getMyCourses(archiveStatus?: 'active' | 'archived' | 'all') {
    const query = archiveStatus ? `?archiveStatus=${archiveStatus}` : '';
    return this.request<any>(`/courses/my-courses${query}`);
  }

  async getCourse(id: string) {
    return this.request<any>(`/courses/${id}`);
  }

  async createCourse(data: {
    name: string;
    description?: string;
    credits?: number;
    academicYear: string;
    term: CourseTerm;
    lecturerId?: string;
  }) {
    return this.request<any>('/courses', {
      method: 'POST',
      body: data,
    });
  }

  async updateCourse(id: string, data: any) {
    return this.request<any>(`/courses/${id}`, {
      method: 'PATCH',
      body: data,
    });
  }

  async deleteCourse(id: string) {
    return this.request<any>(`/courses/${id}`, { method: 'DELETE' });
  }

  async archiveCourse(id: string) {
    return this.request<any>(`/courses/${id}/archive`, { method: 'PATCH' });
  }

  async restoreCourse(id: string) {
    return this.request<any>(`/courses/${id}/restore`, { method: 'PATCH' });
  }

  // Enrollments endpoints
  async enrollStudent(courseId: string, studentId: string) {
    return this.request<any>('/enrollments', {
      method: 'POST',
      body: { courseId, studentId },
    });
  }

  async bulkEnroll(courseId: string, studentIds: string[]) {
    return this.request<any>('/enrollments/bulk', {
      method: 'POST',
      body: { courseId, studentIds },
    });
  }

  async getCourseEnrollments(courseId: string) {
    return this.request<any[]>(`/enrollments/course/${courseId}`);
  }

  async getMyEnrollments() {
    return this.request<any[]>('/enrollments/my-enrollments');
  }

  async removeEnrollment(id: string) {
    return this.request<any>(`/enrollments/${id}`, { method: 'DELETE' });
  }

  async bulkEnrollByEmails(courseId: string, emails: string[]) {
    return this.request<{
      success: { email: string; fullName: string; studentId: string | null }[];
      failed: { email: string; reason: string }[];
      provisioned: number;
    }>('/enrollments/bulk-by-emails', {
      method: 'POST',
      body: { courseId, emails },
    });
  }

  async bulkImportStudents(courseId: string, students: { email: string; studentId: string; fullName: string; department: string }[]) {
    return this.request<{
      success: { email: string; fullName: string; studentId: string | null; row: number }[];
      failed: { email: string; reason: string; row: number }[];
      provisioned: number;
      totalProcessed: number;
    }>('/enrollments/bulk-import', {
      method: 'POST',
      body: { courseId, students },
    });
  }

  async searchTrainingSystemStudents(params: { query?: string; courseId?: string }) {
    const queryParams = new URLSearchParams();
    if (params.query) queryParams.append('query', params.query);
    if (params.courseId) queryParams.append('courseId', params.courseId);
    const query = queryParams.toString() ? `?${queryParams.toString()}` : '';
    return this.request<any[]>(`/enrollments/training-system/students${query}`);
  }

  // Questions endpoints (official)
  async listQuestions(filters?: {
    topicId?: string;
    tagId?: string;
    courseId?: string;
    type?: string;
    difficulty?: number;
    search?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const params = new URLSearchParams();
    if (filters?.topicId) params.append('topicId', filters.topicId);
    if (filters?.tagId) params.append('tagId', filters.tagId);
    if (filters?.courseId) params.append('courseId', filters.courseId);
    if (filters?.type) params.append('type', filters.type);
    if (filters?.difficulty) params.append('difficulty', String(filters.difficulty));
    if (filters?.search) params.append('search', filters.search);
    if (filters?.status) params.append('status', filters.status);
    if (filters?.page) params.append('page', String(filters.page));
    if (filters?.limit) params.append('limit', String(filters.limit));
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request<any>(`/questions${query}`);
  }

  async getQuestionById(id: string) {
    return this.request<any>(`/questions/${id}`);
  }

  async createMediaPresign(data: { mediaType: 'image' | 'audio'; mimetype: string; sizeBytes: number }) {
    return this.request<{ uploadUrl: string; key: string; publicUrl: string; expiresInSeconds: number }>(
      '/media/presign',
      { method: 'POST', body: data },
    );
  }

  async confirmMediaUpload(data: { key: string; sizeBytes: number }) {
    return this.request<{ key: string; sizeBytes: number }>('/media/confirm', { method: 'POST', body: data });
  }

  async releaseMediaUpload(data: { key: string; sizeBytes: number }) {
    return this.request<void>('/media/release', { method: 'POST', body: data });
  }

  async getQuestionStats() {
    return this.request<any>('/questions/stats');
  }

  async checkDuplicateQuestions(courseId: string) {
    return this.request<{
      courseId: string;
      scannedQuestionCount: number;
      aiReviewedPairs: number;
      pairs: Array<{
        questionA: { id: string; type: string; content: string };
        questionB: { id: string; type: string; content: string };
        /** Classification confidence (legacy name retained for compatibility). */
        similarityPercent: number;
        relation: 'EXACT_DUPLICATE' | 'SEMANTIC_DUPLICATE' | 'SAME_SKILL_DIFFERENT_QUESTION' | 'PARTIAL_OVERLAP' | 'RELATED_ONLY' | 'DISTINCT';
        matchMethod: 'EXACT' | 'TEXT' | 'AI';
        reason: string;
        diagnostics?: {
          sameKnowledgePoint: boolean;
          sameCognitiveOperation: boolean;
          sameExpectedAnswer: boolean;
          differentWording: boolean;
        };
      }>;
    }>('/questions/duplicate-check', { method: 'POST', body: { courseId } });
  }

  async getQuestionDuplicatePreference() {
    return this.request<{ similarityThreshold: number }>('/questions/duplicate-preference');
  }

  async updateQuestionDuplicatePreference(similarityThreshold: number) {
    return this.request<{ similarityThreshold: number }>('/questions/duplicate-preference', {
      method: 'PATCH', body: { similarityThreshold },
    });
  }

  async deleteQuestion(id: string) {
    return this.request<any>(`/questions/${id}`, { method: 'DELETE' });
  }

  private normalizeQuestionType(type?: string): string {
    const normalized = String(type || '').trim().toUpperCase();
    if (normalized === 'SINGLE_CHOICE') return 'MULTIPLE_CHOICE';
    const allowed = new Set([
      'MULTIPLE_CHOICE',
      'MULTI_SELECT',
      'TRUE_FALSE',
      'SHORT_ANSWER',
      'ESSAY',
      'FILL_IN_BLANK',
      'MATCHING',
      'ORDERING',
      'FIND_ERROR',
    ]);
    return allowed.has(normalized) ? normalized : 'MULTIPLE_CHOICE';
  }

  async copyQuestionBank(data: {
    sourceCourseId: string;
    targetCourseId: string;
    topicIds?: string[];
    questionIds?: string[];
    forceDuplicateIds?: string[];
  }): Promise<{ copied: number; skipped: number; total: number }> {
    return this.request('/questions/copy-bank', { method: 'POST', body: data });
  }

  async previewCopyQuestionBank(data: {
    sourceCourseId: string;
    targetCourseId: string;
    questionIds: string[];
  }): Promise<{ duplicateQuestionIds: string[] }> {
    return this.request('/questions/copy-bank/preview', { method: 'POST', body: data });
  }

  async saveQuestion(data: {
    sourceQuestionId?: string;
    type?: string;
    content: string;
    options?: Record<string, any>;
    correctAnswer?: Record<string, any>;
    explanation?: string;
    difficulty?: number;
    points?: number;
    defaultPoints?: number;
    
    courseId?: string;
    topicId?: string;
    learningObjective?: string;
    topic?: string;
    media?: { mediaUrl: string; mediaType: 'image' | 'audio'; mediaKey: string; mediaSizeBytes: number } | null;
  }) {
    const questionType = this.normalizeQuestionType(data.type);
    const draft = await this.createQuestionDraft({
      mode: data.sourceQuestionId ? 'DUPLICATE' : 'MANUAL',
      questionType,
      sourceQuestionId: data.sourceQuestionId,
      initialContext: {
        courseId: data.courseId,
        topicId: data.topicId || data.topic,
        topic: data.topic,
        learningObjective: data.learningObjective,
      },
    });

    let autosaveVersion = Number(draft?.autosaveVersion || 1);

    const intentRes = await this.saveQuestionDraftStep(draft.draftId, 'intent', {
      autosaveVersion,
      data: { questionType },
    });
    autosaveVersion = Number(intentRes?.autosaveVersion || autosaveVersion + 1);

    const contentRes = await this.saveQuestionDraftStep(draft.draftId, 'content', {
      autosaveVersion,
      data: { content: data.content || '' },
    });
    autosaveVersion = Number(contentRes?.autosaveVersion || autosaveVersion + 1);

    const answersRes = await this.saveQuestionDraftStep(draft.draftId, 'answers', {
      autosaveVersion,
      data: {
        options: data.options || {},
        correctAnswer: data.correctAnswer || {},
        explanation: data.explanation || '',
      },
    });
    autosaveVersion = Number(answersRes?.autosaveVersion || autosaveVersion + 1);

    const classificationRes = await this.saveQuestionDraftStep(
      draft.draftId,
      'classification',
      {
        autosaveVersion,
        data: {
          difficulty: data.difficulty,
          points: data.points,
          defaultPoints: data.defaultPoints ?? data.points ?? 1,
          courseId: data.courseId,
          
          topicId: data.topicId || data.topic,
          topic: data.topic,
          learningObjective: data.learningObjective,
          courseScopeIds: data.courseId ? [data.courseId] : [],
          media: data.media ?? null,
        },
      },
    );
    autosaveVersion = Number(
      classificationRes?.autosaveVersion || autosaveVersion + 1,
    );

    const publishRes = await this.publishQuestionDraft(draft.draftId, {
      expectedAutosaveVersion: autosaveVersion,
      publishMode: 'PUBLISHED',
    });

    if (publishRes?.questionId) {
      return this.getQuestionById(publishRes.questionId);
    }

    return publishRes;
  }

  async createQuestionDraft(data: {
    mode: 'MANUAL' | 'AI_ASSISTED' | 'DUPLICATE';
    questionType?: string;
    sourceQuestionId?: string;
    initialContext?: Record<string, any>;
  }) {
    return this.request<any>('/questions/drafts', {
      method: 'POST',
      body: data,
    });
  }

  async saveQuestionDraftStep(draftId: string, stepKey: 'intent' | 'content' | 'answers' | 'classification' | 'review', data: {
    autosaveVersion: number;
    data: Record<string, any>;
  }) {
    return this.request<any>(`/questions/drafts/${draftId}/steps/${stepKey}`, {
      method: 'PATCH',
      body: data,
    });
  }

  async aiGenerateQuestionDraftSection(draftId: string, data: {
    section: 'CONTENT' | 'ANSWERS' | 'EXPLANATION' | 'CLASSIFICATION';
    instruction?: string;
    constraints?: {
      difficulty?: number;
      language?: string;
      optionCount?: number;
      maxLength?: number;
      forbiddenTerms?: string[];
    };
    variants?: number;
  }) {
    const response = await this.request<{
      jobId?: string;
      status?: string;
      candidates?: Array<Record<string, any>>;
    }>(`/questions/drafts/${draftId}/ai-generate-section`, {
      method: 'POST',
      body: data,
    });

    if (response?.jobId) {
      return this.waitForAiJob<{ candidates: Array<Record<string, any>> }>(response.jobId);
    }

    return response as any;
  }

  async applyQuestionDraftAICandidate(draftId: string, data: {
    jobId: string;
    candidateId: string;
    section: 'CONTENT' | 'ANSWERS' | 'EXPLANATION' | 'CLASSIFICATION';
  }) {
    return this.request<any>(`/questions/drafts/${draftId}/ai-apply`, {
      method: 'POST',
      body: data,
    });
  }

  async validateQuestionDraft(draftId: string, data?: { level?: 'SOFT' | 'STRICT' }) {
    return this.request<any>(`/questions/drafts/${draftId}/validate`, {
      method: 'POST',
      body: data || {},
    });
  }

  async publishQuestionDraft(draftId: string, data: {
    expectedAutosaveVersion: number;
    publishMode?: 'IN_REVIEW' | 'PUBLISHED';
  }) {
    return this.request<any>(`/questions/drafts/${draftId}/publish`, {
      method: 'POST',
      body: data,
    });
  }

  async getQuestionAIGenerationJob(jobId: string) {
    return this.request<any>(`/questions/ai-jobs/${jobId}?t=${Date.now()}`);
  }

  async createQuestionAiImprovement(data: {
    questionId: string;
    examId: string;
    examQuestionId?: string;
    qualityReviewId?: string;
    analytics?: Record<string, any>;
    instruction?: string;
    targetQuestionType?: string;
  }) {
    return this.request<any>('/questions/ai-improvements', {
      method: 'POST',
      body: data,
    });
  }

  async getQuestionAiImprovement(id: string) {
    return this.request<any>(`/questions/ai-improvements/${id}?t=${Date.now()}`);
  }

  async updateQuestionAiImprovementDraft(id: string, draft: Record<string, any>) {
    return this.request<any>(`/questions/ai-improvements/${id}/draft`, {
      method: 'PATCH',
      body: { draft },
    });
  }

  async approveQuestionAiImprovement(id: string, final: Record<string, any>) {
    return this.request<any>(`/questions/ai-improvements/${id}/approve`, {
      method: 'POST',
      body: { final },
    });
  }

  async rejectQuestionAiImprovement(id: string, reason?: string) {
    return this.request<any>(`/questions/ai-improvements/${id}/reject`, {
      method: 'POST',
      body: { reason },
    });
  }

  async getQuestionHistory(filters?: { courseId?: string }) {
    const params = new URLSearchParams();
    if (filters?.courseId && filters.courseId !== 'all') params.append('courseId', filters.courseId);
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request<any>(`/questions/history${query}`);
  }

  async getAuditLogs(params?: {
    page?: number;
    limit?: number;
    search?: string;
    kind?: string;
    severity?: string;
  }) {
    const query = new URLSearchParams();
    if (params?.page) query.append('page', String(params.page));
    if (params?.limit) query.append('limit', String(params.limit));
    if (params?.search) query.append('search', params.search);
    if (params?.kind && params.kind !== 'all') query.append('kind', params.kind);
    if (params?.severity && params.severity !== 'all') query.append('severity', params.severity);
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return this.request<any>(`/audit-logs${suffix}`);
  }

  async listQuestionTags(filters?: { search?: string; page?: number; limit?: number }) {
    const params = new URLSearchParams();
    if (filters?.search) params.append('search', filters.search);
    if (filters?.page) params.append('page', String(filters.page));
    if (filters?.limit) params.append('limit', String(filters.limit));
    const query = params.toString() ? `?${params.toString()}` : '';
    // Tags metadata endpoint removed
    return { data: [], pagination: { page: 1, limit: 0, total: 0, totalPages: 0 } } as any;
  }

  async createQuestionTag(name: string) {
    // Tags creation removed
    throw new Error('Không hỗ trợ thẻ (tags)');
  }

  async listQuestionTopics(filters?: { search?: string; courseId?: string; page?: number; limit?: number }) {
    const params = new URLSearchParams();
    if (filters?.search) params.append('search', filters.search);
    if (filters?.courseId) params.append('courseId', filters.courseId);
    if (filters?.page) params.append('page', String(filters.page));
    if (filters?.limit) params.append('limit', String(filters.limit));
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request<any>(`/questions/metadata/topics${query}`);
  }

  async createQuestionTopic(data: { code: string; name: string; courseId?: string }) {
    return this.request<any>('/questions/metadata/topics', {
      method: 'POST',
      body: data,
    });
  }

  async suggestSimilarTopics(data: {
    courseId: string;
    topicName: string;
    topicDescription?: string;
    language?: string;
  }) {
    return this.request<any>('/ai/suggest-similar-topics', {
      method: 'POST',
      body: data,
    });
  }

  async setCourseTopics(courseId: string, topicIds: string[]) {
    return this.request<any>(`/questions/metadata/courses/${courseId}/topics`, {
      method: 'PUT',
      body: { topicIds },
    });
  }

  // Exams endpoints
  async getExams(filters?: { courseId?: string; status?: string; includeArchived?: boolean; search?: string; timeRange?: string; sort?: string; page?: number; limit?: number }) {
    const params = new URLSearchParams();
    if (filters?.courseId) params.append('courseId', filters.courseId);
    if (filters?.status) params.append('status', filters.status);
    if (filters?.includeArchived) params.append('includeArchived', 'true');
    if (filters?.search) params.append('search', filters.search);
    if (filters?.timeRange) params.append('timeRange', filters.timeRange);
    if (filters?.sort) params.append('sort', filters.sort);
    if (filters?.page) params.append('page', String(filters.page));
    if (filters?.limit) params.append('limit', String(filters.limit));
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request<any>(`/exams${query}`);
  }

  async getAvailableExams() {
    return this.request<any[]>('/exams/available');
  }

  async getStudentSchedule() {
    return this.request<any[]>('/exams/schedule');
  }

  async getExam(id: string) {
    return this.request<any>(`/exams/${id}`);
  }

  async createExam(data: {
    title: string;
    description?: string;
    courseId: string;
    duration: number;
    timeLimitMinutes?: number | null;
    totalPoints?: number;
    passingScore?: number;
    startTime?: string;
    endTime?: string;
    maxAttempts?: number | null;
    gradingStrategy?: 'HIGHEST' | 'AVERAGE' | 'FIRST_ATTEMPT' | 'LAST_ATTEMPT' | null;
    reviewSettings?: Record<string, any> | null;
    questionSelectionConfig?: Record<string, any> | null;
    settings?: any;
    questionIds?: string[];
  }) {
    return this.request<any>('/exams', {
      method: 'POST',
      body: data,
    });
  }

  async updateExam(id: string, data: any) {
    return this.request<any>(`/exams/${id}`, {
      method: 'PATCH',
      body: data,
    });
  }

  async rescheduleExam(id: string, data: { startTime: string; endTime: string }) {
    return this.request<any>(`/exams/${id}/reschedule`, {
      method: 'PATCH',
      body: data,
    });
  }

  async publishExam(id: string) {
    return this.request<any>(`/exams/${id}/publish`, { method: 'POST' });
  }

  async addQuestionsToExam(examId: string, questionIds: string[]) {
    return this.request<any>(`/exams/${examId}/questions`, {
      method: 'POST',
      body: { questionIds },
    });
  }

  async removeQuestionFromExam(examId: string, questionId: string) {
    return this.request<any>(`/exams/${examId}/questions/${questionId}`, {
      method: 'DELETE',
    });
  }

  async getExamStats(examId: string) {
    return this.request<any>(`/exams/${examId}/stats`);
  }

  // AI exam quality review endpoints
  async requestExamQualityReview(examId: string) {
    return this.request<{ jobId: string; status: string }>(`/exams/${examId}/quality-review`, {
      method: 'POST',
    });
  }

  async getExamQualityReviewJob(examId: string, jobId: string) {
    return this.request<any>(`/exams/${examId}/quality-review/jobs/${jobId}`);
  }

  private async waitForExamQualityReviewJob(
    examId: string,
    jobId: string,
    timeoutMs = 180000,
    intervalMs = 1500,
  ): Promise<any> {
    const startedAt = Date.now();
    let lastStatus = 'UNKNOWN';

    while (Date.now() - startedAt < timeoutMs) {
      const job = await this.getExamQualityReviewJob(examId, jobId);
      const status = String(job?.status || '').toUpperCase();
      lastStatus = status || lastStatus;

      if (status === 'SUCCEEDED') {
        return job;
      }
      if (status === 'FAILED' || status === 'REJECTED') {
        throw new Error(job?.errorMessage || `Rà soát chất lượng bằng AI thất bại với trạng thái ${status}`);
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new Error(`Rà soát chất lượng bằng AI đã hết thời gian chờ sau ${Math.round(timeoutMs / 1000)}s (jobId: ${jobId}, trạng thái cuối: ${lastStatus})`);
  }

  async generateExamQualityReview(examId: string) {
    const { jobId } = await this.requestExamQualityReview(examId);
    return this.waitForExamQualityReviewJob(examId, jobId);
  }

  async listExamQualityReviewSuggestions(examId: string, params?: { status?: string }) {
    const query = params?.status ? `?status=${encodeURIComponent(params.status)}` : '';
    return this.request<any[]>(`/exams/${examId}/quality-review/suggestions${query}`);
  }

  async reviewExamQualitySuggestion(
    examId: string,
    itemId: string,
    data: { decision: 'APPROVED' | 'REJECTED' | 'NEEDS_CHANGES'; notes?: string },
  ) {
    return this.request<any>(`/exams/${examId}/quality-review/suggestions/${itemId}/review`, {
      method: 'PATCH',
      body: data,
    });
  }

  async deleteExam(id: string) {
    return this.request<any>(`/exams/${id}`, { method: 'DELETE' });
  }

  async getAdminDashboardAnalytics(from?: string, to?: string) {
    const query = new URLSearchParams();
    if (from) query.append('from', from);
    if (to) query.append('to', to);
    return this.request<any>(`/admin/dashboard/analytics${query.size ? `?${query}` : ''}`);
  }

  async getAdminDevopsStatus() {
    return this.request<{
      ai: { provider: string; model: string };
      botCommands: Array<{ command: string; description: string; category?: string; public?: boolean }>;
    }>('/admin/dashboard/devops-status');
  }

  async archiveExam(id: string) {
    return this.request<any>(`/exams/${id}/archive`, { method: 'PATCH' });
  }

  async restoreExam(id: string) {
    return this.request<any>(`/exams/${id}/restore`, { method: 'PATCH' });
  }

  async generateExamLink(
    examId: string,
    data: {
      expiryDatetime?: string;
      maxUses?: number;
      password?: string;
      restrictedToCourse?: boolean;
      note?: string;
    },
  ) {
    return this.request<any>(`/exams/${examId}/generate-link`, {
      method: 'POST',
      body: data,
    });
  }

  async getExamLinks(examId: string) {
    return this.request<any[]>(`/exams/${examId}/links`);
  }

  async validateExamLink(token: string) {
    return this.request<any>(`/exam-links/validate/${token}`);
  }

  async joinExamByLink(token: string, data?: { password?: string }) {
    return this.request<any>(`/exam-links/${token}/join`, {
      method: 'POST',
      body: data || {},
    });
  }

  async updateExamLink(id: string, data: { disabled?: boolean; expiryDatetime?: string; maxUses?: number; note?: string }) {
    return this.request<any>(`/exam-links/${id}`, {
      method: 'PATCH',
      body: data,
    });
  }

  async getExamLinkUsage(id: string) {
    return this.request<any[]>(`/exam-links/${id}/usage`);
  }

  // Submissions endpoints
  async getSubmissions(page?: number, limit?: number) {
    const params = new URLSearchParams();
    if (page) params.append('page', String(page));
    if (limit) params.append('limit', String(limit));
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request<any>(`/submissions${query}`);
  }

  async startExam(examId: string, options?: { isMobileOrTablet?: boolean; webcamReady?: boolean; webcamConsentVersion?: string }) {
    return this.request<any>('/submissions/start', {
      method: 'POST',
      body: { examId, ...options },
    });
  }

  async submitExam(submissionId: string, answers: Array<{ questionId: string; answer: any; timeTaken?: number }>, logs?: Array<{ type: string; details?: any; ts?: number }>) {
    return this.request<any>(`/submissions/${submissionId}/submit`, {
      method: 'POST',
      body: { answers, logs },
    });
  }

  async autosaveExamAnswers(
    submissionId: string,
    payload: {
      clientBatchId?: string;
      baseSubmissionVersion?: number;
      answers: Array<{
        questionId: string;
        sequence: number;
        answer: any;
        timeTaken?: number;
      }>;
    },
  ) {
    return this.request<any>(`/submissions/${submissionId}/autosave`, {
      method: 'POST',
      body: payload,
    });
  }

  /**
   * Verifies real connectivity to the backend rather than trusting the
   * browser's navigator.onLine flag, which reflects the network adapter's
   * link state, not whether the internet/backend is actually reachable.
   * Bounded by its own timeout so a still-bad connection fails fast instead
   * of hanging the "Kiểm tra kết nối" button indefinitely.
   */
  async checkConnection(timeoutMs = 5000): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        signal: controller.signal,
      });
      return response.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  async sendExamLogs(submissionId: string, logs: Array<{ type: string; details?: any; ts?: number; clientEventId?: string }>) {
    return this.request<any>(`/submissions/${submissionId}/logs`, {
      method: 'POST',
      body: { logs },
    });
  }

  /**
   * Best-effort delivery for pagehide/unload. It deliberately does not refresh
   * authentication: that asynchronous work is unreliable while the document is
   * closing. The regular sender remains the source for normal delivery.
   */
  sendExamLogsKeepalive(submissionId: string, logs: Array<{ type: string; details?: any; ts?: number; clientEventId?: string }>) {
    if (!submissionId || logs.length === 0) return;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = this.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    void fetch(`${this.baseUrl}/submissions/${submissionId}/logs`, {
      method: 'POST',
      headers,
      credentials: 'include',
      keepalive: true,
      body: JSON.stringify({ logs }),
    }).catch(() => undefined);
  }

  async getMySubmissions() {
    return this.request<any[]>('/submissions/my-submissions');
  }

  async getMyResultsHistory() {
    return this.request<any[]>('/submissions/my-results-history');
  }

  async getMyExamSubmission(examId: string) {
    return this.request<any>(`/submissions/exam/${examId}/my-submission`);
  }

  async getMySubmissionById(submissionId: string) {
    return this.request<any>(`/submissions/my-submissions/${submissionId}`);
  }

  async getExamSubmissions(examId: string, page?: number, limit?: number) {
    const params = new URLSearchParams();
    if (page) params.append('page', String(page));
    if (limit) params.append('limit', String(limit));
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request<any>(`/submissions/exam/${examId}${query}`);
  }

  async getExamAnswerMatrix(examId: string, attemptNo?: number) {
    const query = attemptNo ? `?attemptNo=${encodeURIComponent(attemptNo)}` : "";
    return this.request<any>(`/submissions/exam/${examId}/answer-matrix${query}`);
  }

  async getExamOverview(examId: string) {
    return this.request<any>(`/submissions/exam/${examId}/overview`);
  }

  async getIntegrityCases(params?: {
    page?: number;
    limit?: number;
    search?: string;
    confidence?: string;
    examTitle?: string;
    examId?: string;
    courseId?: string;
    term?: string;
    academicYear?: string;
    submittedFrom?: string;
    submittedTo?: string;
    timeAnomaly?: boolean;
    status?: string;
    submissionId?: string;
  }) {
    const query = new URLSearchParams();
    if (params?.page) query.append('page', String(params.page));
    if (params?.limit) query.append('limit', String(params.limit));
    if (params?.search) query.append('search', params.search);
    if (params?.confidence && params.confidence !== 'all') query.append('confidence', params.confidence);
    if (params?.examTitle) query.append('examTitle', params.examTitle);
    if (params?.examId) query.append('examId', params.examId);
    if (params?.courseId) query.append('courseId', params.courseId);
    if (params?.term) query.append('term', params.term);
    if (params?.academicYear) query.append('academicYear', params.academicYear);
    if (params?.submittedFrom) query.append('submittedFrom', params.submittedFrom);
    if (params?.submittedTo) query.append('submittedTo', params.submittedTo);
    if (typeof params?.timeAnomaly === 'boolean') query.append('timeAnomaly', String(params.timeAnomaly));
    if (params?.status && params.status !== 'all') query.append('status', params.status);
    if (params?.submissionId) query.append('submissionId', params.submissionId);
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return this.request<any>(`/submissions/integrity/cases${suffix}`);
  }

  async reviewIntegrityCase(submissionId: string, data: {
    status: 'REVIEWED' | 'DISMISSED' | 'CONFIRMED';
    notes?: string;
    deductionPercent?: 10 | 25 | 50 | 100;
    applyPenalty?: boolean;
    penaltyMode?: 'PERCENT' | 'FIXED';
    penaltyAmount?: number;
  }) {
    return this.request<any>(`/submissions/integrity/cases/${submissionId}`, {
      method: 'PATCH',
      body: data,
    });
  }

  async getExamIntelligence(examId: string, params?: { attemptScope?: string }) {
    const query = params?.attemptScope ? `?attemptScope=${encodeURIComponent(params.attemptScope)}` : "";
    return this.request<any>(`/submissions/exam/${examId}/intelligence${query}`);
  }

  async getSubmissionTimeline(submissionId: string) {
    return this.request<any>(`/submissions/${submissionId}/timeline`);
  }

  async getExamManualGradingStatus(examId: string) {
    return this.request<any>(`/submissions/exam/${examId}/manual-grading-status`);
  }

  async publishExamResults(examId: string) {
    return this.request<any>(`/submissions/exam/${examId}/publish-results`, {
      method: 'POST',
    });
  }

  async getSubmission(id: string) {
    return this.request<any>(`/submissions/${id}`);
  }

  async getManualGradingSubmission(submissionId: string) {
    return this.request<any>(`/submissions/${submissionId}/manual-grading`);
  }

  async gradeAnswer(submissionAnswerId: string, pointsAwarded: number, feedback?: string) {
    return this.request<any>('/submissions/grade-answer', {
      method: 'POST',
      body: { submissionAnswerId, pointsAwarded, feedback },
    });
  }

  async suggestGradeForAnswer(submissionAnswerId: string) {
    return this.request<{
      summary: string;
      strengths: string[];
      gaps: string[];
      suggestedPoints: number;
      confidence: number;
    }>('/submissions/grade-answer/ai-suggest', {
      method: 'POST',
      body: { submissionAnswerId },
    });
  }

  async requestEvidenceCapture(submissionId: string, data: { trigger: 'SCHEDULED' | 'SUSPICIOUS_EVENT'; signals?: string[]; final?: boolean }) {
    return this.request<{ captureId: string; nonce: string; expiresAt: string; maxBytes: number; screen?: { captureId: string; nonce: string; expiresAt: string; maxBytes: number } }>(`/submissions/${submissionId}/evidence-captures/request`, { method: 'POST', body: data });
  }

  async finalizeEvidenceCapture(submissionId: string, captureId: string, data: { nonce: string; imageDataUrl: string }) {
    return this.request<any>(`/submissions/${submissionId}/evidence-captures/${captureId}/finalize`, { method: 'POST', body: data });
  }

  async getEvidenceCaptures(submissionId: string) {
    return this.request<any[]>(`/submissions/${submissionId}/evidence-captures`);
  }

  async reviewEvidenceCapture(submissionId: string, captureId: string, data: { reviewStatus: 'REVIEWED' | 'DISMISSED'; reviewerNote?: string }) {
    return this.request<any>(`/submissions/${submissionId}/evidence-captures/${captureId}/review`, { method: 'PATCH', body: data });
  }

  async reanalyzeEvidenceCapture(submissionId: string, captureId: string) {
    return this.request<any>(`/submissions/${submissionId}/evidence-captures/${captureId}/reanalyze`, { method: 'POST' });
  }

  async getEvidenceImageUrl(submissionId: string, captureId: string) {
    const response = await fetch(`${this.baseUrl}/submissions/${submissionId}/evidence-captures/${captureId}/image`, {
      headers: this.memoryToken ? { Authorization: `Bearer ${this.memoryToken}` } : {}, credentials: 'include',
    });
    if (!response.ok) throw new ApiRequestError('Không thể tải ảnh bằng chứng.', response.status);
    return URL.createObjectURL(await response.blob());
  }

  async createScoreAdjustment(
    submissionId: string,
    data: { amount: number; category: "QUESTION_ERROR" | "PARTICIPATION" | "OTHER"; reason: string },
  ) {
    return this.request<any>(`/submissions/${submissionId}/score-adjustments`, {
      method: "POST",
      body: data,
    });
  }

  async revokeScoreAdjustment(submissionId: string, adjustmentId: string, reason: string) {
    return this.request<any>(`/submissions/${submissionId}/score-adjustments/${adjustmentId}/revoke`, {
      method: "PATCH",
      body: { reason },
    });
  }

  async reopenSubmission(submissionId: string, reason: string) {
    return this.request<any>(`/submissions/${submissionId}/reopen`, {
      method: "POST",
      body: { reason },
    });
  }

  async extendSubmissionDeadline(submissionId: string, deadlineAt: string, reason: string) {
    return this.request<any>(`/submissions/${submissionId}/deadline-extension`, {
      method: "POST",
      body: { deadlineAt, reason },
    });
  }

  async finalizeGrading(submissionId: string) {
    return this.request<any>(`/submissions/${submissionId}/finalize-grading`, {
      method: 'POST',
    });
  }

  // AI exam integrity risk assessment endpoints
  async requestExamRiskAssessment(submissionId: string) {
    return this.request<{ jobId: string; status: string }>(`/submissions/${submissionId}/risk-assessment`, {
      method: 'POST',
    });
  }

  async getExamRiskAssessmentEligibility(submissionId: string) {
    return this.request<{
      eligible: boolean;
      reasonCode?: string | null;
      reason?: string | null;
      signals?: Record<string, number>;
      existingAssessment?: {
        id: string;
        status: string;
        output?: any;
        errorMessage?: string | null;
        completedAt?: string | null;
      } | null;
    }>(`/submissions/${submissionId}/risk-assessment/eligibility`);
  }

  async getExamRiskAssessmentJob(submissionId: string, jobId: string) {
    return this.request<any>(`/submissions/${submissionId}/risk-assessment/jobs/${jobId}`);
  }

  private async waitForExamRiskAssessmentJob(
    submissionId: string,
    jobId: string,
    timeoutMs = 180000,
    intervalMs = 1500,
  ): Promise<any> {
    const startedAt = Date.now();
    let lastStatus = 'UNKNOWN';

    while (Date.now() - startedAt < timeoutMs) {
      const job = await this.getExamRiskAssessmentJob(submissionId, jobId);
      const status = String(job?.status || '').toUpperCase();
      lastStatus = status || lastStatus;

      if (status === 'SUCCEEDED') {
        return job;
      }
      if (status === 'FAILED' || status === 'REJECTED') {
        throw new Error(job?.errorMessage || `Đánh giá rủi ro bằng AI thất bại với trạng thái ${status}`);
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new Error(`Đánh giá rủi ro bằng AI đã hết thời gian chờ sau ${Math.round(timeoutMs / 1000)}s (jobId: ${jobId}, trạng thái cuối: ${lastStatus})`);
  }

  async generateExamRiskAssessment(submissionId: string) {
    const { jobId } = await this.requestExamRiskAssessment(submissionId);
    return this.waitForExamRiskAssessmentJob(submissionId, jobId);
  }

  async listExamRiskFlags(examId: string, params?: { status?: string }) {
    const query = params?.status ? `?status=${encodeURIComponent(params.status)}` : '';
    return this.request<any[]>(`/submissions/exam/${examId}/risk-flags${query}`);
  }

  async reviewExamRiskFlag(
    flagId: string,
    data: { status: 'REVIEWED' | 'DISMISSED' | 'CONFIRMED'; notes?: string },
  ) {
    return this.request<any>(`/submissions/risk-flags/${flagId}/review`, {
      method: 'PATCH',
      body: data,
    });
  }

  async updateSubmissionStatus(submissionId: string, status: 'IN_PROGRESS' | 'SUBMITTED' | 'GRADED' | 'FLAGGED') {
    return this.request<any>(`/submissions/${submissionId}/status`, {
      method: 'PATCH',
      body: { status },
    });
  }

  // AI endpoints
  async aiGenerateQuestion(data: {
    prompt: string;
    questionType?: string;
    difficulty?: number;
    language?: string;
    courseName?: string;
    useCase?: string;
    context?: Record<string, any>;
  }) {
    const response = await this.request<{
      jobId?: string;
      status?: string;
      content?: string;
      type?: string;
      explanation?: string;
      difficulty?: number;
      points?: number;
      topic?: string;
      learningObjective?: string;
      options?: Record<string, string> | null;
      correctAnswer?: Record<string, string> | null;
      pairs?: { left: string; right: string }[] | null;
      items?: string[] | null;
    }>('/ai/generate-question', {
      method: 'POST',
      body: data,
    });

    if (response?.jobId) {
      return this.waitForAiJob<{
        content: string;
        type: string;
        explanation: string;
        difficulty: number;
        points: number;
        topic?: string;
        learningObjective?: string;
        options: Record<string, string> | null;
        correctAnswer: Record<string, string> | null;
        pairs?: { left: string; right: string }[] | null;
        items?: string[] | null;
      }>(response.jobId);
    }

    return response as any;
  }

  async aiGenerateExamQuestions(data: {
    prompt: string;
    questionCount: number;
    difficulty?: number;
    questionType?: string;
    language?: string;
    courseName?: string;
    useCase?: string;
    courseId?: string;
    context?: Record<string, any>;
  }) {
    const response = await this.request<{
      jobId?: string;
      status?: string;
      questions?: Array<{
        content: string;
        type: string;
        explanation: string;
        difficulty: number;
        points: number;
        options: Record<string, string> | null;
        correctAnswer: Record<string, string> | null;
      }>;
    }>('/ai/generate-exam-questions', {
      method: 'POST',
      body: data,
    });

    if (response?.jobId) {
      return this.waitForAiJob<{
        questions: Array<{
          content: string;
          type: string;
          explanation: string;
          difficulty: number;
          points: number;
          options: Record<string, string> | null;
          correctAnswer: Record<string, string> | null;
        }>;
      }>(response.jobId);
    }

    return response as any;
  }

  async createAiQuestionJob(data: {
    prompt: string;
    questionType?: string;
    difficulty?: number;
    language?: string;
    courseName?: string;
    useCase?: string;
    context?: Record<string, any>;
  }) {
    return this.request<{
      jobId: string;
      status: string;
    }>('/ai/generate-question', {
      method: 'POST',
      body: data,
    });
  }

  async createAiExamQuestionsJob(data: {
    prompt: string;
    questionCount: number;
    difficulty?: number;
    questionType?: string;
    language?: string;
    courseName?: string;
    useCase?: string;
    courseId?: string;
    context?: Record<string, any>;
  }) {
    return this.request<{
      jobId: string;
      status: string;
    }>('/ai/generate-exam-questions', {
      method: 'POST',
      body: data,
    });
  }

  async pollAiJob<T>(jobId: string, timeoutMs = 120000, intervalMs = 2000): Promise<T> {
    return this.waitForAiJob<T>(jobId, timeoutMs, intervalMs);
  }

  async verifyAiKey(data: { apiKey: string; provider?: string; model?: string }) {
    return this.request<{
      valid: boolean;
      provider: string;
      providerName: string;
      detectedProvider?: string;
      model?: string;
      responseTimeMs: number;
      message: string;
      error?: string;
      details?: Record<string, any>;
    }>('/ai/verify-key', {
      method: 'POST',
      body: data,
    });
  }

  async detectAiKey(apiKey: string) {
    return this.request<{
      provider: string;
      providerName: string;
      confidence: 'high' | 'medium' | 'low';
      recommendedModel: string;
    }>('/ai/detect-key', {
      method: 'POST',
      body: { apiKey },
    });
  }

  async getMyRecentCourses() {
    return this.get('/courses/my-recent-courses');
  }
}

export const api = new ApiClient(API_BASE_URL);
export default api;

/**
 * Safely extract array data from a potentially paginated response.
 * If the response is already an array, return as-is.
 * If it's a paginated envelope { data: [...] }, return .data.
 */
export function unwrapPaginatedData<T = any>(response: any): T[] {
  if (Array.isArray(response)) return response;
  if (response?.data && Array.isArray(response.data)) return response.data;
  return [];
}

