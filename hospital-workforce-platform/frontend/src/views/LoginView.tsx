"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Alert, Button, Field, Input } from "../components/ui";
import { ApiError, api } from "../lib/api";
import { homeFor, useAuth } from "../lib/auth";
import { getTodayJalali } from "../lib/jalali";
import { HOSPITAL_ROLES_CONFIG } from "../lib/terminology";

export default function LoginView() {
  const { login, user, ready } = useAuth();
  const router = useRouter();
  const today = getTodayJalali();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState<{ password?: string; accounts: { email: string; name: string; role: string }[] } | null>(null);

  useEffect(() => {
    api.demoAccounts().then((d) => d.enabled && setDemo(d)).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (ready && user) router.replace(nextUrl() ?? homeFor(user));
  }, [ready, user, router]);

  function nextUrl(): string | null {
    if (typeof window === "undefined") return null;
    const n = new URLSearchParams(window.location.search).get("next");
    return n && n.startsWith("/") && !n.startsWith("//") ? n : null;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const u = await login(email, password);
      router.replace(nextUrl() ?? homeFor(u));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "خطا در اتصال به سرور سامانه بیمارستان");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2 text-right" dir="rtl">
      {/* Visual Brand Side */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-teal-900 via-slate-900 to-slate-950 p-12 text-white lg:flex lg:flex-col lg:justify-between shadow-2xl">
        <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-teal-500/15 blur-3xl pointer-events-none" />
        <div className="relative flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-teal-400 text-2xl font-black text-slate-950 shadow-md">
            ب
          </div>
          <div>
            <p className="font-bold text-lg text-white">سامانه همزاد دیجیتال نیروی انسانی بیمارستان</p>
            <p className="text-xs text-teal-300">مدیریت شیفت، چیدمان پرسنلی و اعتباربخشی درمانی (فاز ۲)</p>
          </div>
        </div>

        <div className="relative max-w-lg my-auto py-8">
          <span className="rounded-full bg-teal-500/20 border border-teal-400/30 px-3 py-1 text-xs font-semibold text-teal-300 inline-block mb-4">
            📅 امروز: {today.formatted}
          </span>
          <h1 className="text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
            چیدمان هوشمند شیفت‌های درمانی، بدون تداخل و کسری نیرو.
          </h1>
          <p className="mt-4 text-sm text-slate-300 leading-relaxed">
            سامانه تخصصی مدیریت شیفت‌های بیمارستانی، تقویم جلالی، انطباق صلاحیت‌های بالینی، کنترل پروانه‌های پزشکی و
            پرستاری، و موتور پیشرفته تشخیص تداخل در لحظه.
          </p>

          <div className="mt-8 grid grid-cols-3 gap-3 text-center">
            {[
              ["تقویم جلالی", "روزانه، هفتگی و ماهانه"],
              ["موتور تداخل", "اعتبار، ساعت، مهارت"],
              ["فرآیند تایید", "مترون و سرپرستار"],
            ].map(([a, b]) => (
              <div key={a} className="rounded-xl border border-white/10 bg-white/5 p-3 backdrop-blur-xs">
                <p className="font-bold text-sm text-white">{a}</p>
                <p className="text-[11px] text-teal-200/80 mt-0.5">{b}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative text-xs text-slate-400 flex items-center justify-between border-t border-white/10 pt-4">
          <span>طراحی‌شده منطبق بر استانداردهای فرآیندی بیمارستان‌های کشور</span>
          <span>HWDT Enterprise v2.0</span>
        </div>
      </div>

      {/* Login Form Side */}
      <div className="flex items-center justify-center bg-slate-50 p-6 sm:p-10">
        <div className="w-full max-w-md">
          <div className="mb-6">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">ورود به سامانه بیمارستان</h2>
            <p className="mt-1 text-xs text-slate-500">جهت دسترسی به پنل کاربری، مشخصات خود را وارد نمایید.</p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            {error && <Alert tone="error">{error}</Alert>}
            <Field label="پست الکترونیکی (ایمیل)" required>
              <Input
                type="email"
                autoComplete="username"
                dir="ltr"
                className="text-left font-mono"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="supervisor@hwdt.local"
                required
              />
            </Field>

            <Field label="رمز عبور" required>
              <Input
                type="password"
                autoComplete="current-password"
                dir="ltr"
                className="text-left font-mono"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Field>

            <Button type="submit" className="w-full py-2.5 text-sm" disabled={busy}>
              {busy ? "در حال اعتبارسنجی..." : "ورود به سامانه"}
            </Button>
          </form>

          {/* Quick Demo Accounts Selection */}
          {demo && (
            <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between border-b pb-2 mb-3">
                <span className="text-xs font-bold text-slate-700">حساب‌های کاربری آزمایشی (Demo Roles)</span>
                <span className="text-[11px] text-teal-700 font-mono">رمز: {demo.password}</span>
              </div>
              <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                {demo.accounts.map((a) => {
                  const roleFa = HOSPITAL_ROLES_CONFIG[a.role]?.label_fa ?? a.role;
                  return (
                    <button
                      key={a.email}
                      type="button"
                      onClick={() => {
                        setEmail(a.email);
                        setPassword(demo.password ?? "");
                      }}
                      className="flex w-full items-center justify-between rounded-lg border border-slate-100 p-2 text-right text-xs hover:border-teal-400 hover:bg-teal-50 transition"
                    >
                      <div>
                        <span className="block font-bold text-slate-900">{a.name}</span>
                        <span className="block font-mono text-[10px] text-slate-400" dir="ltr">
                          {a.email}
                        </span>
                      </div>
                      <span className="rounded bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-900 whitespace-nowrap">
                        {roleFa}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
