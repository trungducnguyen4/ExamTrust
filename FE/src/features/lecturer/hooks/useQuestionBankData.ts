import { useCallback, useEffect, useRef, useState } from "react";
import api, { unwrapPaginatedData } from "@/lib/api";
import type { Question } from "../question-bank-utils";

export type QuestionBankCourse = {
  id: string;
  code: string;
  name: string;
  faculty?: string;
  _count?: { questions?: number; enrollments?: number; exams?: number };
};

export function useQuestionBankData(selectedCourseCode?: string | null) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [courses, setCourses] = useState<QuestionBankCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const activeRef = useRef(true);
  const fetchedCourseIdsRef = useRef<Set<string>>(new Set());

  // 1. Tải nhanh danh sách khóa học (chỉ ~400ms) để giải phóng loading và hiển thị giao diện ngay lập tức
  const loadCourses = useCallback(async () => {
    try {
      setLoading(true);
      const coursesData = await api.getCourses();
      if (!activeRef.current) return;
      const list = unwrapPaginatedData<QuestionBankCourse>(coursesData);
      setCourses(list);
    } catch (error) {
      console.error("Failed to fetch courses for question-bank:", error);
    } finally {
      if (activeRef.current) setLoading(false);
    }
  }, []);

  // 2. Tải câu hỏi có chủ đích (on-demand) theo khóa học đã chọn
  const loadCourseQuestions = useCallback(async (courseId: string) => {
    if (fetchedCourseIdsRef.current.has(courseId)) return;
    try {
      setLoadingQuestions(true);
      const response = await api.listQuestions({ courseId, page: 1, limit: 100 });
      if (!activeRef.current) return;
      const courseQuestions = unwrapPaginatedData<Question>(response);
      fetchedCourseIdsRef.current.add(courseId);
      setQuestions((prev) => {
        const existingIds = new Set(prev.map((q) => q.id));
        const newItems = courseQuestions.filter((q) => !existingIds.has(q.id));
        return [...prev, ...newItems];
      });
    } catch (error) {
      console.error(`Failed to fetch questions for course ${courseId}:`, error);
    } finally {
      if (activeRef.current) setLoadingQuestions(false);
    }
  }, []);

  // 3. Tải ngầm câu hỏi nền (background idle fetch) để hỗ trợ thống kê mà không chặn UI
  const prefetchBackgroundQuestions = useCallback(async () => {
    try {
      const firstPage = await api.listQuestions({ page: 1, limit: 100 });
      if (!activeRef.current) return;
      const firstQuestions = unwrapPaginatedData<Question>(firstPage);
      setQuestions((prev) => {
        const existingIds = new Set(prev.map((q) => q.id));
        const newItems = firstQuestions.filter((q) => !existingIds.has(q.id));
        return [...prev, ...newItems];
      });
    } catch {
      // Background prefetch fail is non-fatal
    }
  }, []);

  useEffect(() => {
    activeRef.current = true;
    void loadCourses();
    const timer = setTimeout(() => {
      void prefetchBackgroundQuestions();
    }, 600);
    return () => {
      activeRef.current = false;
      clearTimeout(timer);
    };
  }, [loadCourses, prefetchBackgroundQuestions]);

  // When selectedCourseCode changes and matches a course, ensure that course's questions are loaded
  useEffect(() => {
    if (!selectedCourseCode || courses.length === 0) return;
    const matched = courses.find((c) => c.code === selectedCourseCode);
    if (matched) {
      void loadCourseQuestions(matched.id);
    }
  }, [selectedCourseCode, courses, loadCourseQuestions]);

  const refetch = useCallback(async () => {
    fetchedCourseIdsRef.current.clear();
    await loadCourses();
    if (selectedCourseCode) {
      const matched = courses.find((c) => c.code === selectedCourseCode);
      if (matched) {
        await loadCourseQuestions(matched.id);
      }
    }
  }, [loadCourses, loadCourseQuestions, selectedCourseCode, courses]);

  return {
    questions,
    setQuestions,
    courses,
    setCourses,
    loading,
    loadingQuestions,
    refetch,
  };
}
