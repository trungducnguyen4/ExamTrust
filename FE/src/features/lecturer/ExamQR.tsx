"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";
import api from "@/lib/api";
import { BackToDashboardButton } from "@/components/common/BackToDashboardButton";

export default function ExamQR() {
  const params = useParams();
  const slug = Array.isArray(params?.slug) ? params.slug : [];
  const id = slug[1];
  const [exam, setExam] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  const loadExam = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await api.getExam(id);
      setExam(res);
    } catch (err) {
      console.error("Failed to load exam for QR", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadExam();
  }, [id]);

  const link =
    typeof window !== "undefined" && id
      ? `${window.location.origin}/student/exam-ready?examId=${id}`
      : "";

  return (
    <DashboardLayout>
      <div className="flex items-center justify-center min-h-[70vh]">
        <div className="w-full max-w-[1280px]">
          {/* <BackToDashboardButton to="/lecturer" className="mb-4 -ml-2" /> */}
          <Card className="w-full">
            <CardContent className="p-8 text-center">
              {loading ? (
                <div className="flex items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : (
                <div>
                  <div className="mb-4 flex items-center justify-between gap-2">
                    <h2 className="text-xl font-semibold">
                      {exam?.title || "Exam QR"}
                    </h2>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={loadExam}
                      disabled={loading}
                      className="gap-2"
                    >
                      {loading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                      Làm mới
                    </Button>
                  </div>
                  <div className="mx-auto mb-4">
                    <img
                      alt="Exam QR"
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=800x800&data=${encodeURIComponent(link)}`}
                      style={{ width: 640, height: 640 }}
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Ask students to scan the QR code displayed on the monitor to
                    join the exam.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}



