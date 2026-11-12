"use client";

import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Link2,
  Copy,
  CheckCircle2,
  Loader2,
  QrCode,
  Trash2,
  Clock,
  Shield,
  Users,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import api, { unwrapPaginatedData } from "@/lib/api";
import { BackToDashboardButton } from "@/components/common/BackToDashboardButton";
import { getStatusBadgeLabel } from "@/components/ui/status-badge";
import {
  getNumericInputError,
  parseNumericInput,
  sanitizeNumericInput,
} from "@/lib/number-input";

interface ExamItem {
  id: string;
  title: string;
  startTime?: string | null;
  endTime?: string | null;
  status?: string;
  course?: { code?: string; name?: string };
}

interface ExamLinkItem {
  id: string;
  expiresAt: string | null;
  maxUses: number | null;
  usedCount: number;
  lastUsedAt: string | null;
  restrictedToCourse: boolean;
  disabled: boolean;
  note?: string | null;
  createdAt: string;
  createdBy?: { fullName?: string; email?: string };
  hasPassword?: boolean;
}

interface LinkUsage {
  id: string;
  userAgent?: string;
  usedAt: string;
  user?: { fullName?: string; email?: string; studentId?: string };
}

const LINK_STATE_LABELS: Record<string, string> = {
  active: "Hoạt động",
  disabled: "Đã thu hồi",
  expired: "Hết hạn",
};

export default function GenerateExamLink() {
  const [exams, setExams] = useState<ExamItem[]>([]);
  const [selectedExamId, setSelectedExamId] = useState("");
  const [links, setLinks] = useState<ExamLinkItem[]>([]);
  const [selectedLinkId, setSelectedLinkId] = useState("");
  const [usage, setUsage] = useState<LinkUsage[]>([]);

  const [expiryDatetime, setExpiryDatetime] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [maxUsesError, setMaxUsesError] = useState("");
  const [password, setPassword] = useState("");
  const [restrictedToCourse, setRestrictedToCourse] = useState(false);
  const [note, setNote] = useState("");

  const [newlyCreatedUrl, setNewlyCreatedUrl] = useState("");
  const [newlyCreatedQr, setNewlyCreatedQr] = useState("");
  const [copied, setCopied] = useState(false);

  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [loadingUsage, setLoadingUsage] = useState(false);

  const selectedExam = useMemo(
    () => exams.find((e) => e.id === selectedExamId),
    [exams, selectedExamId],
  );

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        const examsRes = await api.getExams();
        const examItems = unwrapPaginatedData(examsRes) as ExamItem[];
        setExams(examItems);

        if (examItems.length > 0) {
          const firstExamId = examItems[0].id;
          setSelectedExamId(firstExamId);
        }
      } catch (error) {
        console.error("Failed to load exams for link generation:", error);
      } finally {
        setLoading(false);
      }
    };

    init();
  }, []);

  const [linksLoading, setLinksLoading] = useState(false);

  const loadLinks = async () => {
    if (!selectedExamId) {
      setLinks([]);
      return;
    }

    setLinksLoading(true);
    try {
      const res = await api.getExamLinks(selectedExamId);
      setLinks(res || []);
    } catch (error) {
      console.error("Failed to load exam links:", error);
    } finally {
      setLinksLoading(false);
    }
  };

  useEffect(() => {
    loadLinks();
  }, [selectedExamId]);

  const loadUsage = async () => {
    if (!selectedLinkId) {
      setUsage([]);
      return;
    }

    setLoadingUsage(true);
    try {
      const res = await api.getExamLinkUsage(selectedLinkId);
      setUsage(res || []);
    } catch (error) {
      console.error("Failed to load usage logs:", error);
    } finally {
      setLoadingUsage(false);
    }
  };

  useEffect(() => {
    loadUsage();
  }, [selectedLinkId]);

  const handleGenerate = async () => {
    if (!selectedExamId) return;

    const maxUsesMessage = getNumericInputError(maxUses, {
      min: 1,
      integer: true,
    });
    if (maxUsesMessage) {
      setMaxUsesError(maxUsesMessage);
      toast.error(maxUsesMessage);
      return;
    }

    setCreating(true);
    try {
      const payload: any = {
        restrictedToCourse,
      };

      if (expiryDatetime)
        payload.expiryDatetime = new Date(expiryDatetime).toISOString();
      if (maxUses) {
        const parsedMaxUses = parseNumericInput(maxUses, { min: 1 });
        if (parsedMaxUses !== undefined) {
          payload.maxUses = parsedMaxUses;
        }
      }
      if (password.trim()) payload.password = password.trim();
      if (note.trim()) payload.note = note.trim();

      const created = await api.generateExamLink(selectedExamId, payload);
      setNewlyCreatedUrl(created.url);
      setNewlyCreatedQr(created.qrDataUrl || "");

      const updatedLinks = await api.getExamLinks(selectedExamId);
      setLinks(updatedLinks || []);

      setPassword("");
      setNote("");
      setMaxUsesError("");
    } catch (error: any) {
      toast.error(error?.message || "Không thể tạo liên kết thi");
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async (text: string) => {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const handleRevoke = async (linkId: string) => {
    setRevokingId(linkId);
    try {
      await api.updateExamLink(linkId, { disabled: true });
      const updatedLinks = await api.getExamLinks(selectedExamId);
      setLinks(updatedLinks || []);
      if (selectedLinkId === linkId) {
        setUsage([]);
      }
    } catch (error: any) {
      toast.error(error?.message || "Không thể thu hồi liên kết");
    } finally {
      setRevokingId(null);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="h-64 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="mx-auto w-full max-w-[1280px] space-y-6 px-4 sm:px-6 lg:px-8 py-2 sm:py-4">
        <BackToDashboardButton to="/lecturer" className="-ml-2" />

        <div>
          <h1 className="text-2xl font-semibold">
            Tạo liên kết thi có thể chia sẻ
          </h1>
          <p className="text-muted-foreground mt-1">
            Tạo liên kết tham gia an toàn có thời hạn, giới hạn số lần dùng,
            mật khẩu tùy chọn và theo dõi truy cập.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Link2 className="h-4 w-4" /> Cấu hình liên kết
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Bài thi</Label>
                <Select
                  value={selectedExamId}
                  onValueChange={setSelectedExamId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn bài thi" />
                  </SelectTrigger>
                  <SelectContent>
                    {exams.map((exam) => (
                      <SelectItem key={exam.id} value={exam.id}>
                        {exam.title}{" "}
                        {exam.course?.code ? `(${exam.course.code})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Thời gian hết hạn (không bắt buộc)</Label>
                <Input
                  type="datetime-local"
                  value={expiryDatetime}
                  onChange={(e) => setExpiryDatetime(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Số lần dùng tối đa (không bắt buộc)</Label>
                <Input
                  type="number"
                  min={1}
                  placeholder="Để trống nếu không giới hạn"
                  value={maxUses}
                  onChange={(e) =>
                    setMaxUses(sanitizeNumericInput(e.target.value, { min: 1 }))
                  }
                  onBlur={(e) =>
                    setMaxUsesError(
                      getNumericInputError(e.target.value, {
                        min: 1,
                        integer: true,
                      }) || "",
                    )
                  }
                />
                {maxUsesError ? (
                  <p className="text-xs text-destructive">{maxUsesError}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label>Mật khẩu (không bắt buộc)</Label>
                <Input
                  type="password"
                  placeholder="Để trống nếu không cần mật khẩu"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Ghi chú (không bắt buộc)</Label>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Ghi chú nội bộ cho liên kết này"
              />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={restrictedToCourse}
                onChange={(e) => setRestrictedToCourse(e.target.checked)}
              />
              Chỉ cho phép sinh viên đã đăng ký khóa học này dùng liên kết
            </label>

            {selectedExam && (
              <div className="rounded-lg border p-3 text-sm text-muted-foreground">
                <p>
                  Khung giờ thi:{" "}
                  {selectedExam.startTime
                    ? new Date(selectedExam.startTime).toLocaleString()
                    : "Chưa đặt"}
                  {" - "}
                  {selectedExam.endTime
                    ? new Date(selectedExam.endTime).toLocaleString()
                    : "Chưa đặt"}
                </p>
                <p>Trạng thái: {getStatusBadgeLabel(selectedExam.status || "DRAFT")}</p>
              </div>
            )}

            <Button
              onClick={handleGenerate}
              disabled={creating || !selectedExamId}
              className="gap-2"
            >
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Link2 className="h-4 w-4" />
              )}
              Tạo liên kết
            </Button>

            {newlyCreatedUrl && (
              <div className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">URL vừa tạo</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopy(newlyCreatedUrl)}
                    className="gap-1"
                  >
                    {copied ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                    {copied ? "Đã sao chép" : "Sao chép"}
                  </Button>
                </div>
                <p className="text-sm break-all text-muted-foreground">
                  {newlyCreatedUrl}
                </p>
                {newlyCreatedQr && (
                  <div className="inline-flex flex-col items-center gap-2">
                    <img
                      src={newlyCreatedQr}
                      alt="QR"
                      className="h-36 w-36 rounded border"
                    />
                    <p className="text-xs text-muted-foreground">
                      Chia sẻ mã QR để tham gia nhanh
                    </p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div>
              <CardTitle className="text-lg">Liên kết bài thi</CardTitle>
              <CardDescription>Thu hồi liên kết và kiểm tra lượt sử dụng</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={loadLinks}
              disabled={linksLoading}
              className="gap-2"
            >
              {linksLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Làm mới
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ngày tạo</TableHead>
                  <TableHead>Hết hạn</TableHead>
                  <TableHead>Lượt dùng</TableHead>
                  <TableHead>Ràng buộc</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead className="text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {links.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-center py-10 text-muted-foreground"
                    >
                      Chưa có liên kết nào được tạo cho bài thi này.
                    </TableCell>
                  </TableRow>
                ) : (
                  links.map((link) => {
                    const isExpired =
                      !!link.expiresAt &&
                      new Date(link.expiresAt).getTime() <= Date.now();
                    const maxReached =
                      link.maxUses != null && link.usedCount >= link.maxUses;
                    const state = link.disabled
                      ? "disabled"
                      : isExpired || maxReached
                        ? "expired"
                        : "active";

                    return (
                      <TableRow key={link.id}>
                        <TableCell className="text-sm">
                          {new Date(link.createdAt).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-sm">
                          {link.expiresAt
                            ? new Date(link.expiresAt).toLocaleString()
                            : "Không hết hạn"}
                        </TableCell>
                        <TableCell>
                          <span className="font-medium">{link.usedCount}</span>
                          <span className="text-muted-foreground">
                            /{link.maxUses ?? "∞"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            {link.hasPassword && (
                              <Shield className="h-3.5 w-3.5" />
                            )}
                            {link.restrictedToCourse && (
                              <Users className="h-3.5 w-3.5" />
                            )}
                            {link.expiresAt && (
                              <Clock className="h-3.5 w-3.5" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            variant={
                              state === "active"
                                ? "success"
                                : state === "disabled"
                                  ? "destructive"
                                  : "default"
                            }
                          >
                            {LINK_STATE_LABELS[state] ?? state}
                          </StatusBadge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedLinkId(link.id)}
                            >
                              Lượt dùng
                            </Button>
                            {!link.disabled && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive"
                                onClick={() => handleRevoke(link.id)}
                                disabled={revokingId === link.id}
                              >
                                {revokingId === link.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div>
              <CardTitle className="text-lg">Nhật ký sử dụng</CardTitle>
              <CardDescription>
                {selectedLinkId
                  ? `Nhật ký truy cập gần nhất cho liên kết ${selectedLinkId}`
                  : "Chọn một liên kết để xem lịch sử sử dụng"}
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={loadUsage}
              disabled={loadingUsage || !selectedLinkId}
              className="gap-2"
            >
              {loadingUsage ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Làm mới
            </Button>
          </CardHeader>
          <CardContent>
            {loadingUsage ? (
              <div className="h-28 flex items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Thời gian</TableHead>
                    <TableHead>Người dùng</TableHead>
                    <TableHead>Mã sinh viên</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usage.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={3}
                        className="text-center py-8 text-muted-foreground"
                      >
                        Chưa có lượt sử dụng nào.
                      </TableCell>
                    </TableRow>
                  ) : (
                    usage.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          {new Date(item.usedAt).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          {item.user?.fullName || item.user?.email || "Không xác định"}
                        </TableCell>
                        <TableCell>{item.user?.studentId || "-"}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
