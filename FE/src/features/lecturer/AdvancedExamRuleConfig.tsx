"use client";

import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
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
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Save,
  Settings2,
  Shuffle,
  Shield,
  Globe,
  Timer,
  Eye,
  Wifi,
  WifiOff,
  BarChart3,
  AlertTriangle,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { BackToDashboardButton } from "@/components/common/BackToDashboardButton";
import { getNumericInputError, sanitizeNumericInput } from "@/lib/number-input";

export default function AdvancedExamRuleConfig() {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Difficulty Distribution
  const [easyRatio, setEasyRatio] = useState([30]);
  const [mediumRatio, setMediumRatio] = useState([50]);
  const [hardRatio, setHardRatio] = useState([20]);

  // Exam Settings
  const [duration, setDuration] = useState("120");
  const [totalQuestions, setTotalQuestions] = useState("40");
  const [passingScore, setPassingScore] = useState("50");

  // Shuffle Settings
  const [shuffleQuestions, setShuffleQuestions] = useState(true);
  const [shuffleOptions, setShuffleOptions] = useState(true);
  const [shuffleMode, setShuffleMode] = useState("random");

  // Security / Integrity
  const [fullscreenRequired, setFullscreenRequired] = useState(true);
  const [tabSwitchDetection, setTabSwitchDetection] = useState(true);
  const [maxTabSwitches, setMaxTabSwitches] = useState([3]);
  const [mouseTracking, setMouseTracking] = useState(true);
  const [ipRestriction, setIpRestriction] = useState(false);
  const [allowedIpRange, setAllowedIpRange] = useState("192.168.1.0/24");

  // Scoring
  const [immediateScoring, setImmediateScoring] = useState(true);
  const [showCorrectAnswer, setShowCorrectAnswer] = useState(false);
  const [negativeMarking, setNegativeMarking] = useState(false);
  const [negativeMarkPercent, setNegativeMarkPercent] = useState([25]);

  // Offline Mode
  const [offlineMode, setOfflineMode] = useState(false);
  const [offlineEncryption, setOfflineEncryption] = useState(true);

  // Auto Submit
  const [autoSubmit, setAutoSubmit] = useState(true);
  const [gracePeriod, setGracePeriod] = useState("5");

  const [numberErrors, setNumberErrors] = useState<Record<string, string>>({});

  // AI Integrity
  const [similarityThreshold, setSimilarityThreshold] = useState([80]);
  const [timingAnomalyThreshold, setTimingAnomalyThreshold] = useState([3]);

  const handleSave = async () => {
    const nextErrors = {
      duration:
        getNumericInputError(duration, { min: 10, max: 300, integer: true }) ||
        "",
      totalQuestions:
        getNumericInputError(totalQuestions, {
          min: 1,
          max: 200,
          integer: true,
        }) || "",
      passingScore:
        getNumericInputError(passingScore, {
          min: 0,
          max: 100,
          integer: true,
        }) || "",
      gracePeriod:
        getNumericInputError(gracePeriod, {
          min: 0,
          max: 30,
          integer: true,
        }) || "",
    };
    setNumberErrors(nextErrors);

    const firstError = Object.values(nextErrors).find(Boolean);
    if (firstError) return;

    setSaving(true);
    await new Promise((r) => setTimeout(r, 1000));
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <DashboardLayout>
      <div className="mx-auto w-full max-w-[1280px] space-y-6 px-4 sm:px-6 lg:px-8 py-2 sm:py-4">
        <BackToDashboardButton to="/lecturer" className="mb-4 -ml-2" />

        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-foreground mb-1">
              Cấu hình quy tắc bài thi
            </h1>
            <p className="text-muted-foreground">
              Cấu hình phân bổ độ khó, trộn đề, toàn vẹn học thuật và quy tắc
              tính điểm
            </p>
          </div>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : saved ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saved ? "Đã lưu!" : "Lưu cấu hình"}
          </Button>
        </div>

        <div className="space-y-6">
          {/* Basic Exam Settings */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Settings2 className="h-4 w-4" /> Cài đặt cơ bản
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Thời lượng (phút)</Label>
                  <Input
                    type="number"
                    min={10}
                    max={300}
                    value={duration}
                    onChange={(e) => setDuration(sanitizeNumericInput(e.target.value))}
                    onBlur={(e) =>
                      setNumberErrors((prev) => ({
                        ...prev,
                        duration:
                          getNumericInputError(e.target.value, {
                            min: 10,
                            max: 300,
                            integer: true,
                          }) || "",
                      }))
                    }
                  />
                  {numberErrors.duration ? (
                    <p className="text-xs text-destructive">{numberErrors.duration}</p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label>Tổng số câu hỏi</Label>
                  <Input
                    type="number"
                    min={1}
                    max={200}
                    value={totalQuestions}
                    onChange={(e) =>
                      setTotalQuestions(sanitizeNumericInput(e.target.value))
                    }
                    onBlur={(e) =>
                      setNumberErrors((prev) => ({
                        ...prev,
                        totalQuestions:
                          getNumericInputError(e.target.value, {
                            min: 1,
                            max: 200,
                            integer: true,
                          }) || "",
                      }))
                    }
                  />
                  {numberErrors.totalQuestions ? (
                    <p className="text-xs text-destructive">
                      {numberErrors.totalQuestions}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label>Điểm đạt (%)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={passingScore}
                    onChange={(e) =>
                      setPassingScore(sanitizeNumericInput(e.target.value))
                    }
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
                  />
                  {numberErrors.passingScore ? (
                    <p className="text-xs text-destructive">
                      {numberErrors.passingScore}
                    </p>
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Difficulty Distribution */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-4 w-4" /> Phân bổ độ khó
              </CardTitle>
              <CardDescription>
                Phân bổ tỷ lệ câu hỏi theo từng mức độ khó
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-green-600 font-medium">Dễ</span>
                    <span>{easyRatio[0]}%</span>
                  </div>
                  <Slider
                    value={easyRatio}
                    onValueChange={setEasyRatio}
                    min={0}
                    max={100}
                    step={5}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-yellow-600 font-medium">Trung bình</span>
                    <span>{mediumRatio[0]}%</span>
                  </div>
                  <Slider
                    value={mediumRatio}
                    onValueChange={setMediumRatio}
                    min={0}
                    max={100}
                    step={5}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-red-600 font-medium">Khó</span>
                    <span>{hardRatio[0]}%</span>
                  </div>
                  <Slider
                    value={hardRatio}
                    onValueChange={setHardRatio}
                    min={0}
                    max={100}
                    step={5}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted">
                <div className="flex-1">
                  <div className="flex h-3 rounded-full overflow-hidden">
                    <div
                      className="bg-green-500"
                      style={{ width: `${easyRatio[0]}%` }}
                    />
                    <div
                      className="bg-yellow-500"
                      style={{ width: `${mediumRatio[0]}%` }}
                    />
                    <div
                      className="bg-red-500"
                      style={{ width: `${hardRatio[0]}%` }}
                    />
                  </div>
                </div>
                <span
                  className={`text-xs font-medium ${easyRatio[0] + mediumRatio[0] + hardRatio[0] === 100 ? "text-green-600" : "text-red-600"}`}
                >
                  Tổng: {easyRatio[0] + mediumRatio[0] + hardRatio[0]}%
                  {easyRatio[0] + mediumRatio[0] + hardRatio[0] !== 100 &&
                    " (phải bằng 100%)"}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Shuffle Algorithm */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Shuffle className="h-4 w-4" /> Thiết lập trộn đề
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Trộn câu hỏi</Label>
                  <p className="text-xs text-muted-foreground">
                    Xáo trộn thứ tự câu hỏi cho từng sinh viên
                  </p>
                </div>
                <Switch
                  checked={shuffleQuestions}
                  onCheckedChange={setShuffleQuestions}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <Label>Trộn thứ tự đáp án</Label>
                  <p className="text-xs text-muted-foreground">
                    Xáo trộn thứ tự đáp án trong mỗi câu hỏi
                  </p>
                </div>
                <Switch
                  checked={shuffleOptions}
                  onCheckedChange={setShuffleOptions}
                />
              </div>
              <Separator />
              <div className="space-y-2">
                <Label>Cách trộn đề</Label>
                <Select value={shuffleMode} onValueChange={setShuffleMode}>
                  <SelectTrigger className="w-[280px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="random">Ngẫu nhiên hoàn toàn</SelectItem>
                    <SelectItem value="by_topic">
                      Nhóm theo chủ đề, trộn trong nhóm
                    </SelectItem>
                    <SelectItem value="by_difficulty">
                      Sắp xếp theo độ khó (dễ → khó)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Security & Integrity */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="h-4 w-4" /> Bảo mật & toàn vẹn học thuật
              </CardTitle>
              <CardDescription>
                Các biện pháp chống gian lận và giám sát
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Yêu cầu toàn màn hình</Label>
                  <p className="text-xs text-muted-foreground">
                    Bắt buộc chế độ toàn màn hình trong khi thi
                  </p>
                </div>
                <Switch
                  checked={fullscreenRequired}
                  onCheckedChange={setFullscreenRequired}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <Label>Phát hiện chuyển tab</Label>
                  <p className="text-xs text-muted-foreground">
                    Phát hiện và ghi nhận khi sinh viên chuyển tab
                  </p>
                </div>
                <Switch
                  checked={tabSwitchDetection}
                  onCheckedChange={setTabSwitchDetection}
                />
              </div>
              {tabSwitchDetection && (
                <div className="ml-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Số lần chuyển tab tối đa trước khi tự động đánh dấu</span>
                    <span className="font-medium">{maxTabSwitches[0]}</span>
                  </div>
                  <Slider
                    value={maxTabSwitches}
                    onValueChange={setMaxTabSwitches}
                    min={1}
                    max={10}
                    step={1}
                  />
                </div>
              )}
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <Label>Theo dõi di chuyển chuột</Label>
                  <p className="text-xs text-muted-foreground">
                    Theo dõi hành vi con trỏ để phát hiện bất thường
                  </p>
                </div>
                <Switch
                  checked={mouseTracking}
                  onCheckedChange={setMouseTracking}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <Label className="flex items-center gap-2">
                    <Globe className="h-4 w-4" /> Giới hạn địa chỉ IP
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Chỉ cho phép thi từ dải IP xác định
                  </p>
                </div>
                <Switch
                  checked={ipRestriction}
                  onCheckedChange={setIpRestriction}
                />
              </div>
              {ipRestriction && (
                <div className="ml-4 space-y-2">
                  <Label>Dải IP được phép (CIDR)</Label>
                  <Input
                    value={allowedIpRange}
                    onChange={(e) => setAllowedIpRange(e.target.value)}
                    placeholder="VD: 192.168.1.0/24"
                    className="w-[280px]"
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* AI Integrity Thresholds */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" /> Ngưỡng toàn vẹn học thuật AI
              </CardTitle>
              <CardDescription>
                Cấu hình các tham số phát hiện gian lận tự động
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Ngưỡng tương đồng câu trả lời</span>
                  <span className="font-medium">{similarityThreshold[0]}%</span>
                </div>
                <Slider
                  value={similarityThreshold}
                  onValueChange={setSimilarityThreshold}
                  min={50}
                  max={100}
                  step={5}
                />
                <p className="text-xs text-muted-foreground">
                  Đánh dấu khi câu trả lời giữa các sinh viên giống nhau trên{" "}
                  {similarityThreshold[0]}%
                </p>
              </div>
              <Separator />
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Ngưỡng bất thường về thời gian</span>
                  <span className="font-medium">
                    {timingAnomalyThreshold[0]} lần
                  </span>
                </div>
                <Slider
                  value={timingAnomalyThreshold}
                  onValueChange={setTimingAnomalyThreshold}
                  min={1}
                  max={10}
                  step={1}
                />
                <p className="text-xs text-muted-foreground">
                  Đánh dấu khi sinh viên có hơn {timingAnomalyThreshold[0]}{" "}
                  lần bất thường về thời gian
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Scoring Rules */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Eye className="h-4 w-4" /> Quy tắc tính điểm
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Chấm điểm ngay</Label>
                  <p className="text-xs text-muted-foreground">
                    Hiển thị điểm ngay sau khi nộp bài
                  </p>
                </div>
                <Switch
                  checked={immediateScoring}
                  onCheckedChange={setImmediateScoring}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <Label>Hiện đáp án đúng</Label>
                  <p className="text-xs text-muted-foreground">
                    Hiện đáp án đúng sau khi nộp bài
                  </p>
                </div>
                <Switch
                  checked={showCorrectAnswer}
                  onCheckedChange={setShowCorrectAnswer}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <Label>Trừ điểm câu sai</Label>
                  <p className="text-xs text-muted-foreground">
                    Trừ điểm với câu trả lời sai
                  </p>
                </div>
                <Switch
                  checked={negativeMarking}
                  onCheckedChange={setNegativeMarking}
                />
              </div>
              {negativeMarking && (
                <div className="ml-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Mức trừ mỗi câu sai</span>
                    <span className="font-medium">
                      {negativeMarkPercent[0]}% điểm câu hỏi
                    </span>
                  </div>
                  <Slider
                    value={negativeMarkPercent}
                    onValueChange={setNegativeMarkPercent}
                    min={10}
                    max={100}
                    step={5}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Offline & Auto Submit */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <WifiOff className="h-4 w-4" /> Ngoại tuyến & tự động nộp bài
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Chế độ ngoại tuyến</Label>
                  <p className="text-xs text-muted-foreground">
                    Cho phép làm bài khi không có internet
                  </p>
                </div>
                <Switch
                  checked={offlineMode}
                  onCheckedChange={setOfflineMode}
                />
              </div>
              {offlineMode && (
                <div className="ml-4 flex items-center justify-between">
                  <div>
                    <Label>Mã hóa AES-256</Label>
                    <p className="text-xs text-muted-foreground">
                      Mã hóa dữ liệu phiên thi được bảo vệ
                    </p>
                  </div>
                  <Switch
                    checked={offlineEncryption}
                    onCheckedChange={setOfflineEncryption}
                  />
                </div>
              )}
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <Label>Tự động nộp bài khi hết giờ</Label>
                  <p className="text-xs text-muted-foreground">
                    Tự động nộp bài khi hết thời gian
                  </p>
                </div>
                <Switch checked={autoSubmit} onCheckedChange={setAutoSubmit} />
              </div>
              {autoSubmit && (
                <div className="ml-4 space-y-2">
                  <Label>Thời gian gia hạn (phút)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={30}
                    value={gracePeriod}
                    onChange={(e) =>
                      setGracePeriod(sanitizeNumericInput(e.target.value))
                    }
                    onBlur={(e) =>
                      setNumberErrors((prev) => ({
                        ...prev,
                        gracePeriod:
                          getNumericInputError(e.target.value, {
                            min: 0,
                            max: 30,
                            integer: true,
                          }) || "",
                      }))
                    }
                    className="w-24"
                  />
                  {numberErrors.gracePeriod ? (
                    <p className="text-xs text-destructive">
                      {numberErrors.gracePeriod}
                    </p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    Số phút gia hạn thêm trước khi tự động nộp sau khi hết giờ
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

