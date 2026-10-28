"use client";

import { ReactNode, useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  FileText,
  BarChart3,
  Settings,
  Users,
  BookOpen,
  Shield,
  GraduationCap,
  CalendarDays,
  LogOut,
  ChevronRight,
  PanelLeftClose,
  PanelLeft,
  Menu,
  X,
  User,
  Bot,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface NavItem {
  title: string;
  href: string;
  icon: ReactNode;
}

const studentNavItems: NavItem[] = [
  {
    title: "Tổng quan",
    href: "/student",
    icon: <LayoutDashboard className="h-[18px] w-[18px]" />,
  },
  {
    title: "Khóa học",
    href: "/student/courses",
    icon: <GraduationCap className="h-[18px] w-[18px]" />,
  },
  {
    title: "Bài thi",
    href: "/student/exams",
    icon: <FileText className="h-[18px] w-[18px]" />,
  },
  {
    title: "Lịch",
    href: "/student/schedule",
    icon: <CalendarDays className="h-[18px] w-[18px]" />,
  },
  {
    title: "Kết quả",
    href: "/student/results",
    icon: <BarChart3 className="h-[18px] w-[18px]" />,
  },
];

const lecturerNavItems: NavItem[] = [
  {
    title: "Tổng quan",
    href: "/lecturer",
    icon: <LayoutDashboard className="h-[18px] w-[18px]" />,
  },
  {
    title: "Khóa học",
    href: "/lecturer/create-course",
    icon: <GraduationCap className="h-[18px] w-[18px]" />,
  },
  {
    title: "Bài thi",
    href: "/lecturer/exams",
    icon: <FileText className="h-[18px] w-[18px]" />,
  },
  {
    title: "Ngân hàng câu hỏi",
    href: "/lecturer/question-bank",
    icon: <BookOpen className="h-[18px] w-[18px]" />,
  },
  {
    title: "Phân tích",
    href: "/lecturer/analytics",
    icon: <BarChart3 className="h-[18px] w-[18px]" />,
  },
  {
    title: "Giám sát rủi ro",
    href: "/lecturer/integrity",
    icon: <Shield className="h-[18px] w-[18px]" />,
  },
];

const adminNavItems: NavItem[] = [
  {
    title: "Tổng quan",
    href: "/admin",
    icon: <LayoutDashboard className="h-[18px] w-[18px]" />,
  },
  {
    title: "Khóa học",
    href: "/admin/courses",
    icon: <GraduationCap className="h-[18px] w-[18px]" />,
  },
  {
    title: "Bài thi",
    href: "/admin/exams",
    icon: <FileText className="h-[18px] w-[18px]" />,
  },
  {
    title: "Ngân hàng câu hỏi",
    href: "/admin/question-bank",
    icon: <BookOpen className="h-[18px] w-[18px]" />,
  },
  {
    title: "Người dùng",
    href: "/admin/users",
    icon: <Users className="h-[18px] w-[18px]" />,
  },
  {
    title: "Giám sát rủi ro",
    href: "/admin/integrity",
    icon: <Shield className="h-[18px] w-[18px]" />,
  },
  {
    title: "Thiết lập",
    href: "/admin/settings",
    icon: <Settings className="h-[18px] w-[18px]" />,
  },
  {
    title: "DevOps & Bot",
    href: "/admin/devops",
    icon: <Bot className="h-[18px] w-[18px]" />,
  },
];

interface DashboardLayoutProps {
  children: ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  useEffect(() => {
    if (!isLoading && (!isAuthenticated || !user)) {
      router.replace("/login");
    }
  }, [isAuthenticated, isLoading, router, user]);

  if (isLoading || !isAuthenticated || !user) {
    return null;
  }

  const navItems =
    user.role === "STUDENT"
      ? studentNavItems
      : user.role === "LECTURER"
        ? lecturerNavItems
        : adminNavItems;

  const roleLabel =
    user.role === "STUDENT"
      ? "Sinh viên"
      : user.role === "LECTURER"
        ? "Giảng viên"
        : "Quản trị viên";

  const sidebarWidth = collapsed ? "w-[72px]" : "w-[260px]";

  const sidebarContent = (isMobile: boolean) => (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div
        className={cn(
          "flex h-14 items-center border-b border-sidebar-border px-4",
          !isMobile && collapsed ? "justify-center" : "gap-3",
        )}
      >
        <img src="/examtrust-mark.svg" alt="" width={28} height={28} className="h-7 w-7 shrink-0" />
        {(isMobile || !collapsed) && (
          <span className="font-bold text-sidebar-foreground text-base tracking-normal">
            ExamTrust
          </span>
        )}
        {isMobile && (
          <button
            type="button"
            aria-label="Đóng thanh điều hướng"
            onClick={() => setMobileOpen(false)}
            className="ml-auto text-sidebar-foreground/60 hover:text-sidebar-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-3 mt-2 overflow-y-auto">
        {(isMobile || !collapsed) && (
          <p className="px-3 mb-3 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/85">
            Điều hướng
          </p>
        )}
        {navItems.map((item) => {
          const isRootItem = item.href === "/student" || item.href === "/lecturer" || item.href === "/admin";
          const isActive = pathname === item.href || (!isRootItem && pathname.startsWith(`${item.href}/`));
          const link = (
            <Link
              key={item.href}
              href={item.href as any}
              onClick={() => isMobile && setMobileOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors duration-150",
                !isMobile && collapsed && "justify-center px-0",
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-foreground",
              )}
            >
              <span className="shrink-0">{item.icon}</span>
              {(isMobile || !collapsed) && <span>{item.title}</span>}
              {(isMobile || !collapsed) && isActive && (
                <ChevronRight className="ml-auto h-4 w-4 opacity-70" />
              )}
            </Link>
          );

          if (!isMobile && collapsed) {
            return (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right" className="font-medium">
                  {item.title}
                </TooltipContent>
              </Tooltip>
            );
          }

          return link;
        })}
      </nav>

      {/* Collapse toggle (desktop only) */}
      {!isMobile && (
        <div className="px-3 mb-2">
          <button
            type="button"
            aria-label={collapsed ? "Mở rộng thanh điều hướng" : "Thu gọn thanh điều hướng"}
            onClick={() => setCollapsed(!collapsed)}
            className="flex w-full items-center justify-center rounded-lg p-2 text-sidebar-foreground/40 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
          >
            {collapsed ? (
              <PanelLeft className="h-[18px] w-[18px]" />
            ) : (
              <PanelLeftClose className="h-[18px] w-[18px]" />
            )}
          </button>
        </div>
      )}

      {/* User section */}
      <div className="border-t border-sidebar-border p-3">
        <div
          className={cn(
            "flex items-center gap-3 rounded-md p-2",
            !isMobile && collapsed && "justify-center",
          )}
        >
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback className="bg-primary text-primary-foreground text-sm font-bold">
              {user.fullName.charAt(0)}
            </AvatarFallback>
          </Avatar>
          {(isMobile || !collapsed) && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-sidebar-foreground truncate">
                {user.fullName}
              </p>
              <span className="text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/85">
                {roleLabel}
              </span>
            </div>
          )}
        </div>
        {(isMobile || !collapsed) && (
          <>
            <Separator className="my-2 bg-sidebar-border" />
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-sidebar-foreground/85 hover:text-destructive hover:bg-destructive/10 rounded-md"
              onClick={logout}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Đăng xuất
            </Button>
          </>
        )}
        {!isMobile && collapsed && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Đăng xuất"
                onClick={logout}
                className="flex w-full items-center justify-center rounded-md p-2 mt-2 text-sidebar-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors"
              >
                <LogOut className="h-[18px] w-[18px]" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Đăng xuất</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );

  return (
    <TooltipProvider delayDuration={0}>
      <div className="min-h-[100dvh] bg-background">
        {/* Mobile overlay backdrop */}
        {mobileOpen && (
          <button
            type="button"
            aria-label="Đóng thanh điều hướng"
            className="fixed inset-0 z-40 bg-foreground/20 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}

        {/* Mobile sidebar (overlay) */}
        <aside
          className={cn(
            "fixed left-0 top-0 z-50 h-[100dvh] w-[280px] border-r border-sidebar-border bg-sidebar transition-transform duration-300 ease-in-out lg:hidden",
            mobileOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          {sidebarContent(true)}
        </aside>

        {/* Desktop sidebar (fixed) */}
        <aside
          className={cn(
            "fixed left-0 top-0 z-40 hidden h-[100dvh] border-r border-sidebar-border bg-sidebar transition-all duration-300 ease-in-out lg:block",
            sidebarWidth,
          )}
        >
          {sidebarContent(false)}
        </aside>

        {/* Main content */}
        <main
          id="main-content"
          className={cn(
            "min-w-0 transition-[padding] duration-300 ease-in-out",
            collapsed ? "lg:pl-[72px]" : "lg:pl-[260px]",
          )}
        >
          {/* Top bar */}
          <div className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border/80 bg-background/90 px-4 backdrop-blur-lg lg:px-6">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden text-muted-foreground hover:text-foreground"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <div className="hidden lg:block" />
            <div className="flex items-center gap-1 sm:gap-2">
              <ThemeToggle compact />
              <div className="h-6 w-px bg-border hidden sm:block" />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="flex items-center gap-2 h-8 px-2 rounded-lg"
                  >
                    <Avatar className="h-7 w-7">
                      <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
                        {user.fullName.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm hidden sm:block">
                      <span className="text-muted-foreground">Xin chào, </span>
                      <span className="font-semibold text-foreground">
                        {user.fullName.split(" ")[0]}
                      </span>
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end" forceMount>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-semibold">{user.fullName}</p>
                      <p className="text-xs text-muted-foreground">
                        {user.email}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/profile" className="flex items-center">
                      <User className="mr-2 h-4 w-4" />
                      Hồ sơ cá nhân
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={logout}
                    className="text-destructive focus:text-destructive"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    Đăng xuất
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="page-surface min-h-[calc(100dvh-4rem)] p-4 sm:p-5 lg:p-7">
            <div className="min-w-0">{children}</div>
          </div>
        </main>
      </div>
    </TooltipProvider>
  );
}

export { FileText };



