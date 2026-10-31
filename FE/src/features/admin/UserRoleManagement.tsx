"use client";

import { useEffect, useMemo, useState } from "react";
import { DataPagination } from "@/components/common/DataPagination";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { AdminStatCard } from "@/components/admin/AdminStatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  BadgeCheck,
  Crown,
  Loader2,
  Lock,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Trash2,
  Unlock,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import api, { unwrapPaginatedData } from "@/lib/api";
import { ListPageHeader } from "@/components/common/list/ListPageHeader";
import { SearchBar } from "@/components/common/list/SearchBar";
import { FilterPanel } from "@/components/common/list/FilterPanel";
import { SortButton, type SortOrder } from "@/components/common/list/SortButton";
import { ActiveFilterChips } from "@/components/common/list/ActiveFilterChips";
import { sortItems } from "@/components/common/list/sort-utils";
import {
  FilterDefinition,
  FilterValues,
  TextFilterValue,
} from "@/components/common/list/filter-types";
import {
  getActiveFilterCount,
  getFilterChips,
} from "@/components/common/list/filter-utils";

type BackendRole = "STUDENT" | "LECTURER" | "ADMIN";
type BackendStatus = "active" | "suspended" | "pending";

interface UserRow {
  id: string;
  fullName: string;
  email: string;
  role: BackendRole;
  studentId?: string | null;
  department?: string | null;
  status?: BackendStatus;
  createdAt: string;
}

interface UserForm {
  fullName: string;
  email: string;
  password: string;
  role: BackendRole;
  department: string;
  studentId: string;
  status: BackendStatus;
}

const EMPTY_CREATE_FORM: UserForm = {
  fullName: "",
  email: "",
  password: "",
  role: "STUDENT",
  department: "",
  studentId: "",
  status: "active",
};

const EMPTY_EDIT_FORM: UserForm = {
  fullName: "",
  email: "",
  password: "",
  role: "STUDENT",
  department: "",
  studentId: "",
  status: "active",
};

const USER_FILTERS: FilterDefinition[] = [
  {
    key: "role",
    label: "Vai trò",
    type: "select",
    allLabel: "Tất cả vai trò",
    options: [
      { label: "Sinh viên", value: "STUDENT" },
      { label: "Giảng viên", value: "LECTURER" },
      { label: "Quản trị viên", value: "ADMIN" },
    ],
  },
  {
    key: "status",
    label: "Trạng thái",
    type: "select",
    allLabel: "Tất cả trạng thái",
    options: [
      { label: "Đang hoạt động", value: "active" },
      { label: "Chờ xử lý", value: "pending" },
      { label: "Đã tạm khóa", value: "suspended" },
    ],
  },
  {
    key: "department",
    label: "Khoa",
    type: "text",
    placeholder: "Lọc theo khoa",
    defaultOperator: "contains",
    operators: ["contains", "startsWith", "equals"],
  },
  {
    key: "studentId",
    label: "Mã sinh viên",
    type: "text",
    placeholder: "Lọc theo mã sinh viên",
    defaultOperator: "contains",
    operators: ["contains", "startsWith", "equals"],
  },
  {
    key: "createdAt",
    label: "Ngày tạo",
    type: "date-range",
  },
];

const EMPTY_FILTERS: FilterValues = {
  role: "all",
  status: "all",
  department: { value: "", operator: "contains" },
  studentId: { value: "", operator: "contains" },
  createdAt: { from: undefined, to: undefined },
};

export default function UserRoleManagement() {
  const { user: currentUser } = useAuth();

  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [archiveUser, setArchiveUser] = useState<UserRow | null>(null);

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);

  const [createForm, setCreateForm] = useState<UserForm>(EMPTY_CREATE_FORM);
  const [editForm, setEditForm] = useState<UserForm>(EMPTY_EDIT_FORM);

  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [draftFilters, setDraftFilters] = useState<FilterValues>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] =
    useState<FilterValues>(EMPTY_FILTERS);
  const [sortField, setSortField] = useState("fullName");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

  const [page, setPage] = useState(1);
  const ITEMS_PER_PAGE = 10;
  const USER_ROW_HEIGHT = 56;
  const USER_TABLE_HEADER_HEIGHT = 48;
  const USER_TABLE_MIN_HEIGHT =
    ITEMS_PER_PAGE * USER_ROW_HEIGHT + USER_TABLE_HEADER_HEIGHT;

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const response = await api.getUsers({ page: 1, limit: 1000 });

      const rows = unwrapPaginatedData<UserRow>(response);
      setUsers(rows);
    } catch (error: any) {
      toast.error(error?.message || "Không thể tải danh sách người dùng");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const normalizedSearch = appliedSearch.trim().toLowerCase();

  const filteredUsers = useMemo(() => {
    const filtered = users.filter((item) => {
      const matchesSearch = !normalizedSearch
        ? true
        : [
            item.fullName,
            item.email,
            item.studentId || "",
            item.department || "",
          ]
            .join(" ")
            .toLowerCase()
            .includes(normalizedSearch);

      const roleValue = appliedFilters.role as string | undefined;
      const statusValue = appliedFilters.status as string | undefined;
      const departmentFilter = appliedFilters.department as
        | TextFilterValue
        | undefined;
      const studentIdFilter = appliedFilters.studentId as
        | TextFilterValue
        | undefined;
      const createdAtRange = appliedFilters.createdAt as
        | { from?: string; to?: string }
        | undefined;

      const matchesRole =
        !roleValue || roleValue === "all" || item.role === roleValue;
      const matchesStatus =
        !statusValue || statusValue === "all" || item.status === statusValue;

      const matchesText = (
        source: string | null | undefined,
        filter?: TextFilterValue,
      ) => {
        if (!filter || !filter.value.trim()) return true;
        const sourceValue = (source || "").toLowerCase();
        const filterValue = filter.value.trim().toLowerCase();
        if (filter.operator === "startsWith")
          return sourceValue.startsWith(filterValue);
        if (filter.operator === "equals") return sourceValue === filterValue;
        return sourceValue.includes(filterValue);
      };

      const matchesDepartment = matchesText(item.department, departmentFilter);
      const matchesStudentId = matchesText(item.studentId, studentIdFilter);

      const matchesCreatedAt = (() => {
        if (!createdAtRange?.from && !createdAtRange?.to) return true;
        const createdAt = new Date(item.createdAt).getTime();
        if (createdAtRange.from) {
          const from = new Date(createdAtRange.from).getTime();
          if (!Number.isNaN(from) && createdAt < from) return false;
        }
        if (createdAtRange.to) {
          const to = new Date(createdAtRange.to).getTime();
          if (!Number.isNaN(to) && createdAt > to) return false;
        }
        return true;
      })();

      return (
        matchesSearch &&
        matchesRole &&
        matchesStatus &&
        matchesDepartment &&
        matchesStudentId &&
        matchesCreatedAt
      );
    });

    return sortItems(filtered, sortField, sortOrder);
  }, [users, normalizedSearch, appliedFilters, sortField, sortOrder]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredUsers.length / ITEMS_PER_PAGE),
  );

  useEffect(() => {
    setPage((currentPage) => Math.min(currentPage, totalPages));
  }, [totalPages]);

  const paginatedUsers = useMemo(() => {
    const start = (page - 1) * ITEMS_PER_PAGE;
    return filteredUsers.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredUsers, page]);

  const activeFilterCount = getActiveFilterCount(appliedFilters, USER_FILTERS);
  const activeFilterChips = getFilterChips(appliedFilters, USER_FILTERS);

  const userSortOptions = [
    { field: "fullName", label: "Họ và tên" },
    { field: "role", label: "Vai trò" },
    { field: "status", label: "Trạng thái" },
    { field: "createdAt", label: "Ngày tạo" },
  ];

  const runSearch = () => {
    setAppliedSearch(searchInput.trim());
    setPage(1);
  };

  const applyFilters = () => {
    setAppliedFilters(draftFilters);
    setPage(1);
  };

  const clearFilters = () => {
    setDraftFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    setPage(1);
  };

  const removeFilter = (key: string) => {
    const nextFilters = {
      ...appliedFilters,
      [key]: EMPTY_FILTERS[key as keyof typeof EMPTY_FILTERS],
    };
    setAppliedFilters(nextFilters);
    setDraftFilters(nextFilters);
  };

  const openEditDialog = (target: UserRow) => {
    setEditingUser(target);
    setEditForm({
      fullName: target.fullName,
      email: target.email,
      password: "",
      role: target.role,
      department: target.department || "",
      studentId: target.studentId || "",
      status: target.status || "active",
    });
    setShowEditDialog(true);
  };

  const handleCreateUser = async () => {
    if (!createForm.fullName || !createForm.email || !createForm.password) {
      toast.error("Vui lòng nhập họ tên, email và mật khẩu");
      return;
    }

    setIsSubmitting(true);
    try {
      await api.createUser({
        fullName: createForm.fullName.trim(),
        email: createForm.email.trim(),
        password: createForm.password,
        role: createForm.role,
        status: createForm.status,
        department: createForm.department.trim() || undefined,
        studentId:
          createForm.role === "STUDENT"
            ? createForm.studentId.trim() || undefined
            : undefined,
      });
      toast.success("Đã tạo người dùng thành công");
      setShowAddDialog(false);
      setCreateForm(EMPTY_CREATE_FORM);
      setPage(1);
      await fetchUsers();
    } catch (error: any) {
      toast.error(error?.message || "Không thể tạo người dùng");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateUser = async () => {
    if (!editingUser) return;
    if (!editForm.fullName || !editForm.email) {
      toast.error("Vui lòng nhập họ tên và email");
      return;
    }

    setIsSubmitting(true);
    try {
      await api.updateUser(editingUser.id, {
        fullName: editForm.fullName.trim(),
        email: editForm.email.trim(),
        role: editForm.role,
        status: editForm.status,
        department: editForm.department.trim() || undefined,
        studentId:
          editForm.role === "STUDENT"
            ? editForm.studentId.trim() || undefined
            : undefined,
        password: editForm.password.trim() || undefined,
      });
      toast.success("Đã cập nhật người dùng");
      setShowEditDialog(false);
      setEditingUser(null);
      await fetchUsers();
    } catch (error: any) {
      toast.error(error?.message || "Không thể cập nhật người dùng");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickRoleChange = async (target: UserRow, role: BackendRole) => {
    if (target.id === currentUser?.id) {
      toast.error("Không thể đổi vai trò của chính bạn");
      return;
    }
    try {
      await api.updateUser(target.id, { role });
      setUsers((prev) =>
        prev.map((item) => (item.id === target.id ? { ...item, role } : item)),
      );
      toast.success("Đã cập nhật vai trò");
    } catch (error: any) {
      toast.error(error?.message || "Không thể cập nhật vai trò");
    }
  };

  const handleToggleStatus = async (target: UserRow) => {
    if (target.id === currentUser?.id) {
      toast.error("Không thể tạm khóa tài khoản của chính bạn");
      return;
    }

    const nextStatus: BackendStatus =
      target.status === "active" ? "suspended" : "active";
    try {
      await api.updateUser(target.id, { status: nextStatus });
      setUsers((prev) =>
        prev.map((item) =>
          item.id === target.id ? { ...item, status: nextStatus } : item,
        ),
      );
      toast.success("Đã cập nhật trạng thái tài khoản");
    } catch (error: any) {
      toast.error(error?.message || "Không thể cập nhật trạng thái");
    }
  };

  const handleDeleteUser = async (target: UserRow) => {
    if (target.id === currentUser?.id) {
      toast.error("Không thể xóa tài khoản của chính bạn");
      return;
    }

    try {
      setDeletingId(target.id);
      const response = await api.deleteUser(target.id);
      toast.success(response?.message || "Đã lưu trữ người dùng");
      await fetchUsers();
    } catch (error: any) {
      toast.error(error?.message || "Không thể xóa người dùng");
    } finally {
      setDeletingId(null);
    }
  };

  const handleConfirmArchiveUser = async () => {
    if (!archiveUser) return;
    await handleDeleteUser(archiveUser);
    setArchiveUser(null);
  };

  const pageStats = useMemo(
    () => ({
      students: paginatedUsers.filter((item) => item.role === "STUDENT").length,
      lecturers: paginatedUsers.filter((item) => item.role === "LECTURER")
        .length,
      admins: paginatedUsers.filter((item) => item.role === "ADMIN").length,
    }),
    [paginatedUsers],
  );

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <AdminPageShell>
        <ListPageHeader
          title="Tất cả người dùng"
          actions={
            <>
            <Button variant="outline" size="sm" onClick={fetchUsers} disabled={loading} className="gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Làm mới
            </Button>
            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <UserPlus className="h-4 w-4" /> Thêm người dùng
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Tạo người dùng</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label>Họ và tên</Label>
                    <Input
                      value={createForm.fullName}
                      onChange={(e) =>
                        setCreateForm((prev) => ({
                          ...prev,
                          fullName: e.target.value,
                        }))
                      }
                      placeholder="VD: Nguyễn Văn A"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input
                        type="email"
                        value={createForm.email}
                        onChange={(e) =>
                          setCreateForm((prev) => ({
                            ...prev,
                            email: e.target.value,
                          }))
                        }
                        placeholder="email@truong.edu.vn"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Mật khẩu ban đầu</Label>
                      <Input
                        type="password"
                        value={createForm.password}
                        onChange={(e) =>
                          setCreateForm((prev) => ({
                            ...prev,
                            password: e.target.value,
                          }))
                        }
                        placeholder="Ít nhất 6 ký tự"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Vai trò</Label>
                      <Select
                        value={createForm.role}
                        onValueChange={(value: BackendRole) =>
                          setCreateForm((prev) => ({ ...prev, role: value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="STUDENT">Sinh viên</SelectItem>
                          <SelectItem value="LECTURER">Giảng viên</SelectItem>
                          <SelectItem value="ADMIN">Quản trị viên</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Trạng thái</Label>
                      <Select
                        value={createForm.status}
                        onValueChange={(value: BackendStatus) =>
                          setCreateForm((prev) => ({ ...prev, status: value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Đang hoạt động</SelectItem>
                          <SelectItem value="pending">Chờ xử lý</SelectItem>
                          <SelectItem value="suspended">Đã tạm khóa</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Khoa</Label>
                      <Input
                        value={createForm.department}
                        onChange={(e) =>
                          setCreateForm((prev) => ({
                            ...prev,
                            department: e.target.value,
                          }))
                        }
                        placeholder="VD: Công nghệ thông tin"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Mã sinh viên</Label>
                      <Input
                        value={createForm.studentId}
                        onChange={(e) =>
                          setCreateForm((prev) => ({
                            ...prev,
                            studentId: e.target.value,
                          }))
                        }
                        placeholder="Bắt buộc với sinh viên"
                        disabled={createForm.role !== "STUDENT"}
                      />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setShowAddDialog(false)}
                  >
                    Hủy
                  </Button>
                  <Button onClick={handleCreateUser} disabled={isSubmitting}>
                    {isSubmitting && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Tạo
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            </>
          }
          className="mb-4"
        />

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 mb-6">
          <AdminStatCard
            icon={Users}
            value={filteredUsers.length}
            label="Tổng số người dùng"
          />
          <AdminStatCard
            icon={BadgeCheck}
            value={pageStats.students}
            label="Sinh viên (trang hiện tại)"
            iconWrapClassName="bg-sky-500/10"
            iconClassName="text-sky-600"
          />
          <AdminStatCard
            icon={Users}
            value={pageStats.lecturers}
            label="Giảng viên (trang hiện tại)"
            iconWrapClassName="bg-violet-500/10"
            iconClassName="text-violet-600"
          />
          <AdminStatCard
            icon={Crown}
            value={pageStats.admins}
            label="Quản trị viên (trang hiện tại)"
            iconWrapClassName="bg-amber-500/10"
            iconClassName="text-amber-600"
          />
        </div>

        <div className="mb-6 space-y-3">
          <div className="rounded-xl border border-border bg-card p-2 sm:p-2.5 shadow-sm flex flex-col gap-3 2xl:flex-row 2xl:items-center">
            <SearchBar
              value={searchInput}
              onChange={setSearchInput}
              onSearch={runSearch}
              placeholder="Tìm theo tên, email, mã sinh viên hoặc khoa"
              className="min-w-0 flex-1 sm:min-w-[280px]"
            />
            <div className="hidden 2xl:block h-6 w-px bg-border/70 shrink-0" />
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <FilterPanel
              inline
              bare
              className="shrink-0"
              title="Bộ lọc người dùng"
              description="Lọc theo vai trò, trạng thái, khoa, mã sinh viên và ngày tạo."
              filters={USER_FILTERS}
              value={draftFilters}
              onValueChange={(key, nextValue) =>
                setDraftFilters((prev) => ({ ...prev, [key]: nextValue }))
              }
              onApply={applyFilters}
              onClear={clearFilters}
              activeCount={activeFilterCount}
            />
              
              <div className="hidden sm:block h-6 w-px bg-border/70 shrink-0" />
              <SortButton
              options={userSortOptions}
              value={sortField}
              order={sortOrder}
              onSortChange={(field, order) => {
                setSortField(field);
                setSortOrder(order);
              }}
            />
            </div>
          </div>
          <ActiveFilterChips
            chips={activeFilterChips}
            onRemove={removeFilter}
            onClearAll={clearFilters}
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Kết quả</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div
              className="overflow-hidden"
              style={{ minHeight: USER_TABLE_MIN_HEIGHT }}
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Họ và tên</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Vai trò</TableHead>
                    <TableHead>Khoa</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead>Ngày tạo</TableHead>
                    <TableHead className="text-right">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedUsers.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono text-xs">
                        {item.id.slice(0, 8)}
                      </TableCell>
                      <TableCell className="font-medium">
                        {item.fullName}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {item.email}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={item.role}
                          onValueChange={(value: BackendRole) =>
                            handleQuickRoleChange(item, value)
                          }
                        >
                          <SelectTrigger className="h-8 w-[130px] text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="STUDENT">Sinh viên</SelectItem>
                            <SelectItem value="LECTURER">Giảng viên</SelectItem>
                            <SelectItem value="ADMIN">Quản trị viên</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>{item.department || "-"}</TableCell>
                      <TableCell>
                        <StatusBadge
                          status={item.status}
                          domain="user"
                        />
                      </TableCell>
                      <TableCell>
                        {new Date(item.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" disabled={deletingId === item.id}>
                              {deletingId === item.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <MoreHorizontal className="h-4 w-4" />
                              )}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              className="gap-2 text-xs"
                              onClick={() => openEditDialog(item)}
                            >
                              <Pencil className="h-4 w-4" />
                              Sửa người dùng
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="gap-2 text-xs"
                              onClick={() => handleToggleStatus(item)}
                            >
                              {item.status === "active" ? (
                                <Lock className="h-4 w-4" />
                              ) : (
                                <Unlock className="h-4 w-4" />
                              )}
                              {item.status === "active" ? "Tạm khóa tài khoản" : "Kích hoạt tài khoản"}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="gap-2 text-destructive text-xs"
                              onClick={() => setArchiveUser(item)}
                            >
                              <Trash2 className="h-4 w-4" />
                              Lưu trữ người dùng
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredUsers.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="text-center py-8 text-muted-foreground"
                      >
                        Không tìm thấy người dùng
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <DataPagination
              currentPage={page}
              totalPages={totalPages}
              totalItems={filteredUsers.length}
              onPageChange={setPage}
              itemLabel="người dùng"
            />
          </CardContent>
        </Card>

        <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Sửa người dùng</DialogTitle>
              <DialogDescription>
                Cập nhật hồ sơ, vai trò và trạng thái tài khoản
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Họ và tên</Label>
                <Input
                  value={editForm.fullName}
                  onChange={(e) =>
                    setEditForm((prev) => ({
                      ...prev,
                      fullName: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={editForm.email}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, email: e.target.value }))
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Vai trò</Label>
                  <Select
                    value={editForm.role}
                    onValueChange={(value: BackendRole) =>
                      setEditForm((prev) => ({ ...prev, role: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="STUDENT">Sinh viên</SelectItem>
                      <SelectItem value="LECTURER">Giảng viên</SelectItem>
                      <SelectItem value="ADMIN">Quản trị viên</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Trạng thái</Label>
                  <Select
                    value={editForm.status}
                    onValueChange={(value: BackendStatus) =>
                      setEditForm((prev) => ({ ...prev, status: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Đang hoạt động</SelectItem>
                      <SelectItem value="pending">Chờ xử lý</SelectItem>
                      <SelectItem value="suspended">Đã tạm khóa</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Khoa</Label>
                  <Input
                    value={editForm.department}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        department: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Mã sinh viên</Label>
                  <Input
                    value={editForm.studentId}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        studentId: e.target.value,
                      }))
                    }
                    disabled={editForm.role !== "STUDENT"}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Mật khẩu mới (không bắt buộc)</Label>
                <Input
                  type="password"
                  placeholder="Để trống nếu giữ mật khẩu hiện tại"
                  value={editForm.password}
                  onChange={(e) =>
                    setEditForm((prev) => ({
                      ...prev,
                      password: e.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowEditDialog(false)}
              >
                Hủy
              </Button>
              <Button onClick={handleUpdateUser} disabled={isSubmitting}>
                {isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Lưu thay đổi
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={Boolean(archiveUser)} onOpenChange={(open) => !open && setArchiveUser(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Lưu trữ người dùng</AlertDialogTitle>
              <AlertDialogDescription>
                Lưu trữ người dùng "{archiveUser?.fullName}"?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Hủy</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleConfirmArchiveUser}
                className="bg-destructive hover:bg-destructive/90"
                disabled={deletingId === archiveUser?.id}
              >
                {deletingId === archiveUser?.id ? "Đang lưu trữ..." : "Lưu trữ"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </AdminPageShell>
    </DashboardLayout>
  );
}
