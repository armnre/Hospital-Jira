"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "../lib/auth";
import { getTodayJalali, toPersianDigits } from "../lib/jalali";
import { initials } from "../lib/format";
import { HOSPITAL_ROLES_CONFIG } from "../lib/terminology";
import { Spinner } from "./ui";

type NavItem = { href: string; label: string; icon: string; permission?: string };

export function AppShell({ children }: { children: ReactNode }) {
  const { user, ready, logout, can, expiresAt } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [minutesLeft, setMinutesLeft] = useState<number | null>(null);
  const today = getTodayJalali();

  useEffect(() => {
    if (ready && !user) router.replace(`/login?next=${encodeURIComponent(pathname ?? "/supervisor")}`);
  }, [ready, user, router, pathname]);

  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => setMinutesLeft(Math.max(0, Math.round((Date.parse(expiresAt) - Date.now()) / 60000)));
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, [expiresAt]);

  if (!ready || !user) return <Spinner label="در حال اعتبارسنجی نشست کاربری..." />;

  const nav: NavItem[] = [
    { href: "/supervisor", label: "داشبورد سرپرستار", icon: "🏥", permission: "supervisor:read" },
    { href: "/shifts", label: "مدیریت شیفت‌ها", icon: "📋", permission: "shifts:read" },
    { href: "/schedule", label: "برنامه کاری و تقویم جلالی", icon: "📅", permission: "shifts:read" },
    { href: "/availability", label: "ثبت دسترسی و مرخصی", icon: "⏱", permission: "availability:read" },
    { href: "/employees", label: "پرسنل بیمارستان", icon: "👥", permission: "employees:read" },
    { href: "/credentials", label: "پروانه‌ها و صلاحیت‌های بالینی", icon: "📜", permission: "credentials:read" },
    { href: "/dashboard", label: "داشبورد اعتباربخشی و منابع انسانی", icon: "📊", permission: "compliance:read" },
    { href: "/reference-data", label: "بخش‌های درمانی و مهارت‌ها", icon: "⚙", permission: "reference:write" },
  ].filter((n) => !n.permission || can(n.permission));

  if (user.employeeId) {
    nav.push({ href: `/employees/${user.employeeId}`, label: "پروفایل پرسنلی من", icon: "👤" });
  }

  const roleFa = HOSPITAL_ROLES_CONFIG[user.role]?.label_fa ?? user.role;

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 lg:flex-row text-right" dir="rtl">
      {/* Persian Hospital Sidebar */}
      <aside className="bg-gradient-to-b from-teal-950 via-slate-900 to-slate-950 text-slate-100 lg:sticky lg:top-0 lg:h-screen lg:w-68 lg:shrink-0 flex flex-col justify-between shadow-lg">
        <div>
          {/* Header Brand */}
          <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-teal-500 text-xl font-black text-slate-950 shadow-md">
              ب
            </div>
            <div>
              <p className="text-sm font-bold leading-tight tracking-tight text-white">سامانه همزاد دیجیتال بیمارستان</p>
              <p className="text-[11px] text-teal-300 font-medium">مدیریت شیفت و چیدمان پرسنلی</p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="flex gap-1 overflow-x-auto p-3 lg:flex-col lg:overflow-visible">
            {nav.map((n) => {
              const active =
                pathname === n.href ||
                (n.href !== "/supervisor" &&
                  pathname?.startsWith(n.href + "/") &&
                  !(n.label === "پرسنل بیمارستان" && pathname === `/employees/${user.employeeId}`));
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-semibold transition ${
                    active
                      ? "bg-teal-500 text-slate-950 font-bold shadow-sm"
                      : "text-slate-300 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <span className="text-base" aria-hidden>
                    {n.icon}
                  </span>
                  <span>{n.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Footer info */}
        <div className="border-t border-white/10 p-4 text-[11px] text-slate-400">
          <div className="flex items-center justify-between mb-1">
            <span>نسخه بیمارستانی:</span>
            <span className="font-mono text-teal-400">۲.۰.۰ (فاز ۲)</span>
          </div>
          <Link href="/" className="text-teal-300 hover:underline block text-[10px]">
            ← مرکز کنترل زیرساخت پلتفرم (Platform Control)
          </Link>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="min-w-0 flex-1 flex flex-col">
        {/* Persian Top Bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur sm:px-8 shadow-xs">
          {/* Jalali Date badge */}
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-teal-50 border border-teal-200 px-3 py-1 text-xs font-bold text-teal-800">
              📅 امروز: {today.formatted}
            </span>
          </div>

          {/* User profile & actions */}
          <div className="flex items-center gap-4">
            {minutesLeft !== null && (
              <span className="hidden text-xs text-slate-500 sm:inline">
                اعتبار نشست: <strong>{toPersianDigits(minutesLeft)}</strong> دقیقه
              </span>
            )}
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-teal-100 text-sm font-black text-teal-900 border border-teal-200">
                {initials(user.name)}
              </div>
              <div className="hidden text-right sm:block">
                <p className="text-sm font-bold leading-tight text-slate-900">{user.name}</p>
                <p className="text-[11px] text-teal-700 font-semibold">{roleFa}</p>
              </div>
            </div>
            <button
              onClick={() => {
                logout();
                router.replace("/login");
              }}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
            >
              خروج از سامانه
            </button>
          </div>
        </header>

        {/* Content body */}
        <main className="px-4 py-6 sm:px-8 lg:py-8 flex-1">{children}</main>
      </div>
    </div>
  );
}
