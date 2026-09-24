"use client";

import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";
import {
  formatJalaliDate,
  formatPersianTime,
  getJalaliMonthCalendar,
  getTodayJalali,
  PERSIAN_MONTH_NAMES,
  PERSIAN_WEEKDAYS,
  toPersianDigits,
} from "../../lib/jalali";
import { SHIFT_TYPES_CONFIG } from "../../lib/terminology";
import type { Department, ShiftInstance } from "../../lib/types";
import { Alert, Button, Card, PageTitle, Select, Spinner } from "../../components/ui";
import { AssignmentDrawer } from "../assignment/AssignmentDrawer";
import { ShiftModal } from "../shift/ShiftModal";

type ViewMode = "MONTHLY" | "WEEKLY" | "DAILY";

export function ScheduleCalendar() {
  const today = getTodayJalali();
  const [viewMode, setViewMode] = useState<ViewMode>("MONTHLY");
  const [curJYear, setCurJYear] = useState(today.jy);
  const [curJMonth, setCurJMonth] = useState(today.jm);
  const [curDateIso, setCurDateIso] = useState(today.gregorian);

  const [shifts, setShifts] = useState<ShiftInstance[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDeptId, setSelectedDeptId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Assignment Drawer & Shift Create
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null);
  const [newShiftOpen, setNewShiftOpen] = useState(false);

  const monthCalendar = getJalaliMonthCalendar(curJYear, curJMonth);

  const loadShifts = async () => {
    setLoading(true);
    try {
      const [shiftRes, deptRes] = await Promise.all([
        api.listShifts({
          departmentId: selectedDeptId ? Number(selectedDeptId) : undefined,
          startDate: monthCalendar.days[0]?.gregorianDate,
          endDate: monthCalendar.days[monthCalendar.days.length - 1]?.gregorianDate,
          limit: 500,
        }),
        api.departments(),
      ]);
      setShifts(shiftRes.data);
      setDepartments(deptRes.data);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? "خطا در بارگذاری برنامه شیفت‌ها");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadShifts();
  }, [curJYear, curJMonth, selectedDeptId]);

  const handlePrevMonth = () => {
    if (curJMonth === 1) {
      setCurJYear((y) => y - 1);
      setCurJMonth(12);
    } else {
      setCurJMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (curJMonth === 12) {
      setCurJYear((y) => y + 1);
      setCurJMonth(1);
    } else {
      setCurJMonth((m) => m + 1);
    }
  };

  const handleGoToday = () => {
    setCurJYear(today.jy);
    setCurJMonth(today.jm);
    setCurDateIso(today.gregorian);
  };

  // Group shifts by gregorian_date
  const shiftsByDate = shifts.reduce<Record<string, ShiftInstance[]>>((acc, s) => {
    (acc[s.gregorian_date] ??= []).push(s);
    return acc;
  }, {});

  return (
    <div className="space-y-6 text-right" dir="rtl">
      <PageTitle
        title="برنامه کاری کارکنان و تقویم جلالی شیفت‌ها"
        subtitle="بررسی تقویم شیفت‌های بیمارستان، وضعیت پوشش و تخصیص نیرو"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => setNewShiftOpen(true)}>
              + تعریف شیفت
            </Button>
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
              <button
                onClick={() => setViewMode("DAILY")}
                className={`rounded px-3 py-1 text-xs font-semibold ${
                  viewMode === "DAILY" ? "bg-teal-600 text-white" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                روزانه
              </button>
              <button
                onClick={() => setViewMode("WEEKLY")}
                className={`rounded px-3 py-1 text-xs font-semibold ${
                  viewMode === "WEEKLY" ? "bg-teal-600 text-white" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                هفتگی
              </button>
              <button
                onClick={() => setViewMode("MONTHLY")}
                className={`rounded px-3 py-1 text-xs font-semibold ${
                  viewMode === "MONTHLY" ? "bg-teal-600 text-white" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                ماهانه
              </button>
            </div>
          </div>
        }
      />

      {error && <Alert tone="error">{error}</Alert>}

      {/* Navigation and Department Filter Header */}
      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <Button variant="secondary" className="px-2.5 py-1 text-xs" onClick={handlePrevMonth}>
                ماه قبل
              </Button>
              <Button variant="secondary" className="px-2.5 py-1 text-xs" onClick={handleGoToday}>
                امروز
              </Button>
              <Button variant="secondary" className="px-2.5 py-1 text-xs" onClick={handleNextMonth}>
                ماه بعد
              </Button>
            </div>

            <h2 className="text-lg font-black text-slate-800">
              {monthCalendar.monthName} {toPersianDigits(monthCalendar.jy)}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 whitespace-nowrap">فیلتر بخش:</span>
            <Select
              value={selectedDeptId}
              onChange={(e) => setSelectedDeptId(e.target.value)}
              className="text-xs py-1.5"
            >
              <option value="">همه بخش‌های بیمارستان</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name_fa || d.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Card>

      {/* Calendar Views */}
      {loading ? (
        <Spinner label="در حال دریافت داده‌های تقویم و شیفت‌های جلالی..." />
      ) : viewMode === "MONTHLY" ? (
        /* Monthly Jalali Grid */
        <Card className="p-0 overflow-hidden">
          {/* Weekday Headers: شنبه تا جمعه */}
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-100 text-center text-xs font-bold text-slate-700">
            {PERSIAN_WEEKDAYS.map((w) => (
              <div key={w.key} className={`py-2.5 ${w.key === 5 ? "text-rose-600 bg-rose-50/50" : ""}`}>
                {w.name}
              </div>
            ))}
          </div>

          {/* Month Day Cells */}
          <div className="grid grid-cols-7 divide-x divide-y divide-slate-100 bg-slate-50">
            {/* Empty slots for first week offset */}
            {Array.from({ length: monthCalendar.firstDayOffset }).map((_, i) => (
              <div key={`empty-${i}`} className="min-h-[120px] bg-slate-100/40 p-2" />
            ))}

            {monthCalendar.days.map((day) => {
              const dayShifts = shiftsByDate[day.gregorianDate] ?? [];
              const isToday = day.gregorianDate === today.gregorian;

              return (
                <div
                  key={day.jalaliDate}
                  className={`min-h-[130px] p-2 transition bg-white ${
                    isToday ? "ring-2 ring-teal-500 ring-inset bg-teal-50/20" : ""
                  } ${day.isFriday ? "bg-rose-50/30" : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`grid h-6 w-6 place-items-center rounded-full text-xs font-black ${
                        isToday
                          ? "bg-teal-600 text-white"
                          : day.isFriday
                          ? "text-rose-600 font-bold"
                          : "text-slate-700"
                      }`}
                    >
                      {toPersianDigits(day.dayOfMonth)}
                    </span>
                    {dayShifts.length > 0 && (
                      <span className="text-[10px] font-semibold text-slate-400">
                        {toPersianDigits(dayShifts.length)} شیفت
                      </span>
                    )}
                  </div>

                  {/* Day Shifts Badges */}
                  <div className="mt-1.5 space-y-1">
                    {dayShifts.slice(0, 3).map((s) => {
                      const typeCfg = SHIFT_TYPES_CONFIG[s.shift_type];
                      const isShortage = s.assigned_staff_count < s.required_staff;

                      return (
                        <button
                          key={s.id}
                          onClick={() => setSelectedShiftId(s.id)}
                          className={`w-full text-right rounded p-1 text-[11px] font-medium transition block border ${
                            typeCfg?.color ?? "bg-slate-100"
                          } hover:shadow-sm`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="truncate font-bold">{s.department_name_fa}</span>
                            <span className="font-mono text-[10px]">
                              {toPersianDigits(s.assigned_staff_count)}/{toPersianDigits(s.required_staff)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[10px] opacity-80 mt-0.5">
                            <span>{typeCfg?.label_fa}</span>
                            {isShortage && <span className="text-rose-700 font-black">!</span>}
                          </div>
                        </button>
                      );
                    })}

                    {dayShifts.length > 3 && (
                      <button
                        onClick={() => {
                          setCurDateIso(day.gregorianDate);
                          setViewMode("DAILY");
                        }}
                        className="w-full text-center text-[10px] text-teal-700 font-bold hover:underline"
                      >
                        + {toPersianDigits(dayShifts.length - 3)} شیفت دیگر...
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ) : viewMode === "WEEKLY" ? (
        /* Weekly View */
        <Card>
          <div className="space-y-4">
            <h3 className="font-bold text-slate-800 text-sm">
              برنامه هفتگی بیمارستان (۷ روز جاری)
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {monthCalendar.days.slice(0, 7).map((d) => {
                const dayShifts = shiftsByDate[d.gregorianDate] ?? [];
                return (
                  <div key={d.jalaliDate} className="rounded-xl border border-slate-200 p-3 bg-white">
                    <div className="flex items-center justify-between border-b pb-2">
                      <span className="font-bold text-sm text-slate-800">
                        {formatJalaliDate(d.gregorianDate, { withWeekday: true })}
                      </span>
                      <span className="rounded bg-teal-50 px-2 py-0.5 text-xs text-teal-700 font-bold">
                        {toPersianDigits(dayShifts.length)} شیفت
                      </span>
                    </div>
                    <div className="mt-2 space-y-2">
                      {dayShifts.map((s) => (
                        <div
                          key={s.id}
                          onClick={() => setSelectedShiftId(s.id)}
                          className="cursor-pointer rounded-lg border border-slate-100 p-2 hover:border-teal-400 bg-slate-50/50"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-xs text-slate-900">{s.name_fa}</span>
                            <span className="text-[10px] text-slate-500">
                              {formatPersianTime(s.start_time)} - {formatPersianTime(s.end_time)}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center justify-between text-xs">
                            <span className="text-slate-600">{s.department_name_fa}</span>
                            <span
                              className={`font-mono font-bold ${
                                s.assigned_staff_count < s.required_staff ? "text-amber-700" : "text-emerald-700"
                              }`}
                            >
                              {toPersianDigits(s.assigned_staff_count)} / {toPersianDigits(s.required_staff)} نفر
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      ) : (
        /* Daily View */
        <Card title={`برنامه کاری روز: ${formatJalaliDate(curDateIso, { withWeekday: true })}`}>
          <div className="space-y-3">
            {(shiftsByDate[curDateIso] ?? []).length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">
                در این تاریخ شیفت کاری تعریف نشده است.
              </p>
            ) : (
              (shiftsByDate[curDateIso] ?? []).map((s) => {
                const typeCfg = SHIFT_TYPES_CONFIG[s.shift_type];
                return (
                  <div
                    key={s.id}
                    className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between hover:border-teal-400"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">{s.name_fa}</span>
                        {typeCfg && (
                          <span className={`rounded px-2 py-0.5 text-xs font-bold ${typeCfg.color}`}>
                            {typeCfg.label_fa}
                          </span>
                        )}
                        <span className="text-xs text-slate-500">بخش: {s.department_name_fa}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-600">
                        ساعت: <span className="font-mono font-bold">{formatPersianTime(s.start_time)}</span> تا{" "}
                        <span className="font-mono font-bold">{formatPersianTime(s.end_time)}</span>
                        {s.required_skill && ` · مهارت الزامی: ${s.required_skill}`}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-left font-mono text-sm">
                        <span className="font-bold text-teal-800">
                          {toPersianDigits(s.assigned_staff_count)} / {toPersianDigits(s.required_staff)} نفر
                        </span>
                      </div>
                      <Button
                        variant="primary"
                        className="text-xs px-3 py-1.5"
                        onClick={() => setSelectedShiftId(s.id)}
                      >
                        تخصیص و مدیریت پرسنل
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>
      )}

      {/* Assignment Drawer */}
      {selectedShiftId && (
        <AssignmentDrawer
          shiftId={selectedShiftId}
          open={Boolean(selectedShiftId)}
          onClose={() => setSelectedShiftId(null)}
          onUpdated={loadShifts}
        />
      )}

      {/* New Shift Modal */}
      <ShiftModal
        open={newShiftOpen}
        onClose={() => setNewShiftOpen(false)}
        onSaved={loadShifts}
      />
    </div>
  );
}
