import { useCallback, useEffect, useRef, useState } from "react";
import api, { unwrapPaginatedData } from "@/lib/api";
import type { Question } from "../question-bank-utils";

export type QuestionBankCourse = { id: string; code: string; name: string; faculty?: string };

export function useQuestionBankData() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [courses, setCourses] = useState<QuestionBankCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const activeRef = useRef(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      // Giai đoạn 1: Tải nhanh trang 1 (100 câu) và danh sách khóa học để giải phóng UI ngay lập tức (~1.0s - 1.2s)
      const [coursesData, firstPage] = await Promise.all([
        api.getCourses(),
        api.listQuestions({ page: 1, limit: 100 }),
      ]);
      const firstQuestions = unwrapPaginatedData<Question>(firstPage);
      if (!activeRef.current) return;

      setQuestions(firstQuestions);
      setCourses(unwrapPaginatedData<QuestionBankCourse>(coursesData));
      // Giải phóng loading ngay lập tức để người dùng tương tác mà không bị nghẽn
      setLoading(false);

      // Giai đoạn 2: Tải ngầm bất đồng bộ (Non-blocking background fetch) các trang còn lại nếu có
      const totalPages = Math.max(1, Number(firstPage?.pagination?.totalPages ?? 1));
      if (totalPages > 1) {
        const remaining = await Promise.all(
          Array.from({ length: totalPages - 1 }, (_, index) =>
            api.listQuestions({ page: index + 2, limit: 100 })
          )
        );
        if (!activeRef.current) return;
        const allRemaining = remaining.flatMap((page) => unwrapPaginatedData<Question>(page));
        setQuestions((prev) => {
          const existingIds = new Set(prev.map((q) => q.id));
          const newQuestions = allRemaining.filter((q) => !existingIds.has(q.id));
          return [...prev, ...newQuestions];
        });
      }
    } catch (error) {
      console.error("Failed to fetch question-bank data:", error);
    } finally {
      if (activeRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    activeRef.current = true;
    void load();
    return () => {
      activeRef.current = false;
    };
  }, [load]);

  return { questions, setQuestions, courses, setCourses, loading, refetch: load };
}
