"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { formatJalaliDate, formatPersianTime, getTodayJalali, toPersianDigits } from "../../lib/jalali";
import { SHIFT_STATUS_CONFIG, SHIFT_TYPES_CONFIG } from "../../lib/terminology";
import type { ShiftInstance, SupervisorDashboardData } from "../../lib/types";
import { Alert, Button, Card, PageTitle, Spinner, Stat } from "../../components/ui";
import { AssignmentDrawer } from "../assignment/AssignmentDrawer";

export function SupervisorDashboard() {
  const { can, user } = useAuth();
  const today = getTodayJalali();
  const [targetDate, setTargetDate] = useState(today.gregorian);
  const [data, setData] = useState<SupervisorDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Drawer
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const res = await api.supervisorDashboard(targetDate);
      setData(res);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? "خطا در بارگذاری اطلاعات داشبورد سرپرستار");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, [targetDate]);

  const handleApprove = async (shiftId: string) => {
    try {
      await api.approveShift(shiftId);
      loadDashboard();
    } catch (e: any) {
      alert(e.message ?? "خطا در تایید شیفت");
    }
  };

  return (
    <div className="space-y-6 text-right" dir="rtl">
      <PageTitle
        title="داشبورد سرپرستاری و مدیریت کادر درمان"
        subtitle={`پایش برخط چیدمان پرسنلی، کمبود نیرو و وضعیت شیفت‌ها برای ${formatJalaliDate(targetDate, {
          withWeekday: true,
        })}`}
        actions={
          <div className="flex items-center gap-2">
            <Link href="/shifts">
              <Button variant="secondary">مدیریت شیفت‌ها</Button>
            </Link>
            <Link href="/schedule">
              <Button variant="primary">تقویم جامع شیفت‌ها</Button>
            </Link>
          </div>
        }
      />

      {error && <Alert tone="error">{error}</Alert>}

      {loading || !data ? (
        <Spinner label="در حال دریافت داده‌های برخط بخش‌ها و کادر بالینی..." />
      ) : (
        <>
          {/* Top KPI Cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat
              label="شیفت‌های امروز"
              value={toPersianDigits(data.todayShifts.length)}
              tone="teal"
              sub="کل شیفت‌های فعال ۲۴ ساعت"
            />
            <Stat
              label="کمبود نیرو در شیفت‌ها"
              value={toPersianDigits(data.shortageCount)}
              tone={data.shortageCount > 0 ? "rose" : "emerald"}
              sub={data.shortageCount > 0 ? "نیازمند چیدمان فوری" : "پوشش کامل کادر"}
            />
            <Stat
              label="شیفت‌های نیازمند تایید"
              value={toPersianDigits(data.pendingApprovalCount)}
              tone={data.pendingApprovalCount > 0 ? "amber" : "slate"}
              sub="منتظر تایید مترون / سرپرست بخش"
            />
            <Stat
              label="کادر حاضر در شیفت"
              value={toPersianDigits(data.staffOnDuty.length)}
              tone="emerald"
              sub="پرسنل مستقر در بخش‌های درمانی"
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Department Coverage Status */}
            <Card title="وضعیت پوشش بخش‌های بیمارستان" className="lg:col-span-1">
              <div className="space-y-4">
                {data.departmentCoverage.map((dept) => (
                  <div key={dept.departmentId} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-800">{dept.departmentNameFa}</span>
                      <span className="font-mono text-slate-600">
                        {toPersianDigits(dept.assignedStaff)} از {toPersianDigits(dept.requiredStaff)} نفر (
                        {toPersianDigits(dept.coveragePercent)}٪)
                      </span>
                    </div>

                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          dept.coveragePercent >= 100
                            ? "bg-emerald-500"
                            : dept.coveragePercent >= 60
                            ? "bg-amber-400"
                            : "bg-rose-500"
                        }`}
                        style={{ width: `${dept.coveragePercent}%` }}
                      />
                    </div>

                    {dept.isShortage && (
                      <span className="inline-block text-[10px] font-semibold text-rose-600">
                        ⚠️ کسری کادر در این بخش وجود دارد
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </Card>

            {/* Today's Shifts Table */}
            <Card title="شیفت‌های کاری امروز و وضعیت تخصیص" className="lg:col-span-2">
              {data.todayShifts.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">شیفت فعالی برای امروز ثبت نشده است.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                        <th className="py-2.5">عنوان شیفت</th>
                        <th className="py-2.5">بخش</th>
                        <th className="py-2.5">نوبت</th>
                        <th className="py-2.5">ساعات</th>
                        <th className="py-2.5">چیدمان پرسنلی</th>
                        <th className="py-2.5">وضعیت</th>
                        <th className="py-2.5 text-left">عملیات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.todayShifts.map((s) => {
                        const typeCfg = SHIFT_TYPES_CONFIG[s.shift_type];
                        const statusCfg = SHIFT_STATUS_CONFIG[s.status];
                        const isShortage = s.assigned_staff_count < s.required_staff;

                        return (
                          <tr key={s.id} className="hover:bg-slate-50">
                            <td className="py-2 font-bold text-slate-900">{s.name_fa}</td>
                            <td className="py-2 text-slate-700">{s.department_name_fa}</td>
                            <td className="py-2">
                              {typeCfg && (
                                <span className={`rounded px-1.5 py-0.5 font-bold ${typeCfg.color}`}>
                                  {typeCfg.label_fa}
                                </span>
                              )}
                            </td>
                            <td className="py-2 font-mono text-slate-600">
                              {formatPersianTime(s.start_time)} - {formatPersianTime(s.end_time)}
                            </td>
                            <td className="py-2 font-mono">
                              <span
                                className={`font-bold ${isShortage ? "text-amber-700 font-black" : "text-emerald-700"}`}
                              >
                                {toPersianDigits(s.assigned_staff_count)}/{toPersianDigits(s.required_staff)}
                              </span>
                            </td>
                            <td className="py-2">
                              {statusCfg && (
                                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusCfg.color}`}>
                                  {statusCfg.label_fa}
                                </span>
                              )}
                            </td>
                            <td className="py-2 text-left">
                              <div className="flex items-center justify-end gap-1">
                                {can("assignments:write") && (
                                  <Button
                                    variant="primary"
                                    className="px-2 py-0.5 text-[11px]"
                                    onClick={() => setSelectedShiftId(s.id)}
                                  >
                                    چیدمان نیرو
                                  </Button>
                                )}
                                {can("shifts:approve") && s.status === "PENDING_APPROVAL" && (
                                  <Button
                                    variant="secondary"
                                    className="px-2 py-0.5 text-[11px] text-emerald-700"
                                    onClick={() => handleApprove(s.id)}
                                  >
                                    تایید
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>

          {/* Active staff on duty */}
          <Card title="پرسنل بالینی حاضر در شیفت‌های جاری بیمارستان">
            {data.staffOnDuty.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-500">
                در حال حاضر اطلاعات شیفت‌های جاری ثبت نشده است.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.staffOnDuty.map((st, i) => (
                  <div key={i} className="flex items-center justify-between rounded-xl border border-slate-100 p-3 bg-slate-50/60">
                    <div>
                      <span className="font-bold text-slate-900 text-sm">{st.full_name}</span>
                      <span className="block text-xs text-slate-500">{st.job_title}</span>
                    </div>
                    <div className="text-left text-xs">
                      <span className="rounded bg-teal-100 px-2 py-0.5 font-semibold text-teal-800">
                        {st.department_name_fa}
                      </span>
                      <span className="block text-[11px] text-slate-400 mt-1">{st.shift_name}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}

      {/* Assignment Drawer */}
      {selectedShiftId && (
        <AssignmentDrawer
          shiftId={selectedShiftId}
          open={Boolean(selectedShiftId)}
          onClose={() => setSelectedShiftId(null)}
          onUpdated={loadDashboard}
        />
      )}
    </div>
  );
}
