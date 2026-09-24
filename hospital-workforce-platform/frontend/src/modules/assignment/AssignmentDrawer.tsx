"use client";

import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { formatPersianTime, toPersianDigits } from "../../lib/jalali";
import { SHIFT_STATUS_CONFIG, SHIFT_TYPES_CONFIG } from "../../lib/terminology";
import type { CandidateRecommendation, ShiftInstance } from "../../lib/types";
import { Alert, Button, Card, Modal, Spinner } from "../../components/ui";
import { ConflictBadge } from "./ConflictBadge";

export function AssignmentDrawer({
  shiftId,
  open,
  onClose,
  onUpdated,
}: {
  shiftId: string;
  open: boolean;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [shift, setShift] = useState<ShiftInstance | null>(null);
  const [candidates, setCandidates] = useState<CandidateRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [allowOverride, setAllowOverride] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [shiftData, candData] = await Promise.all([
        api.getShift(shiftId),
        api.candidatesForShift(shiftId),
      ]);
      setShift(shiftData);
      setCandidates(candData.candidates);
    } catch (e: any) {
      setError(e.message ?? "خطا در دریافت اطلاعات شیفت و پرسنل");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && shiftId) {
      loadData();
    }
  }, [open, shiftId]);

  const handleAssign = async (employeeId: string, hasConflict: boolean) => {
    if (hasConflict && !allowOverride) {
      setError("این پرسنل دارای تداخل قوانین است. جهت تخصیص اجباری، گزینه «مجوز سرپرستار» را فعال کنید.");
      return;
    }
    setAssigningId(employeeId);
    setError(null);
    try {
      await api.assignEmployee(shiftId, {
        employeeId,
        forceOverride: allowOverride,
      });
      await loadData();
      onUpdated();
    } catch (e: any) {
      setError(e.message ?? "خطا در تخصیص پرسنل");
    } finally {
      setAssigningId(null);
    }
  };

  const handleRemove = async (assignmentId: string) => {
    try {
      await api.removeAssignment(assignmentId);
      await loadData();
      onUpdated();
    } catch (e: any) {
      setError(e.message ?? "خطا در حذف تخصیص");
    }
  };

  if (!open) return null;

  const typeConfig = shift ? SHIFT_TYPES_CONFIG[shift.shift_type] : null;
  const statusConfig = shift ? SHIFT_STATUS_CONFIG[shift.status] : null;

  return (
    <Modal open={open} title="مدیریت تخصیص پرسنل و چیدمان شیفت" onClose={onClose} wide>
      {loading || !shift ? (
        <Spinner label="در حال بارگذاری اطلاعات شیفت و تحلیل تداخل‌ها..." />
      ) : (
        <div className="space-y-6 text-right" dir="rtl">
          {error && <Alert tone="error">{error}</Alert>}

          {/* Shift Requirements Header */}
          <div className="rounded-xl border border-teal-200 bg-teal-50/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-slate-900">{shift.name_fa}</h3>
                  {typeConfig && (
                    <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${typeConfig.color}`}>
                      شیفت {typeConfig.label_fa}
                    </span>
                  )}
                  {statusConfig && (
                    <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${statusConfig.color}`}>
                      {statusConfig.label_fa}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  بخش: <strong className="text-slate-800">{shift.department_name_fa}</strong> · تاریخ:{" "}
                  <strong className="text-slate-800">{toPersianDigits(shift.jalali_date)}</strong> · ساعت:{" "}
                  <span className="font-mono text-slate-800">
                    {formatPersianTime(shift.start_time)} الی {formatPersianTime(shift.end_time)}
                  </span>
                </p>
              </div>

              {/* Staffing Meter */}
              <div className="text-center rounded-xl bg-white border border-slate-200 px-4 py-2 shadow-sm">
                <span className="block text-[11px] font-semibold text-slate-500">پوشش پرسنلی شیفت</span>
                <span className="text-lg font-black text-teal-800">
                  {toPersianDigits(shift.assigned_staff_count)} از {toPersianDigits(shift.required_staff)} نفر
                </span>
                <span className="block text-[10px] text-slate-400">
                  {shift.assigned_staff_count >= shift.required_staff ? "تکمیل کادر" : "دارای کمبود نیرو"}
                </span>
              </div>
            </div>

            {/* Specific requirements */}
            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-teal-200/60 pt-3 text-xs sm:grid-cols-3">
              <div>
                <span className="text-slate-500">نقش / رده شغلی الزامی:</span>{" "}
                <span className="font-semibold text-slate-800">{shift.required_role || "هر رده پرستاری / بالینی"}</span>
              </div>
              <div>
                <span className="text-slate-500">مهارت تخصصی الزامی:</span>{" "}
                <span className="font-semibold text-teal-700">{shift.required_skill || "مهارت‌های عمومی بالینی"}</span>
              </div>
              <div>
                <span className="text-slate-500">یادداشت شیفت:</span>{" "}
                <span className="text-slate-700">{shift.notes || "بدون یادداشت"}</span>
              </div>
            </div>
          </div>

          {/* Currently Assigned Employees */}
          <Card title={`پرسنل تخصیص‌یافته به این شیفت (${toPersianDigits(shift.assignments?.length ?? 0)} نفر)`}>
            {!shift.assignments || shift.assignments.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-500">
                هنوز هیچ پرسنلی برای این شیفت تخصیص داده نشده است. از لیست پیشنهادی زیر پرسنل واجد شرایط را انتخاب کنید.
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {shift.assignments.map((asg) => (
                  <div key={asg.id} className="flex items-center justify-between py-2.5">
                    <div>
                      <span className="font-bold text-slate-900">{asg.full_name}</span>
                      <span className="mx-2 text-xs text-slate-400 font-mono">({toPersianDigits(asg.employee_number)})</span>
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{asg.job_title}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                        تایید شده
                      </span>
                      <Button
                        variant="ghost"
                        className="text-xs text-rose-600 hover:bg-rose-50 px-2 py-1"
                        onClick={() => handleRemove(asg.id)}
                      >
                        لغو تخصیص
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Recommended Candidates & Conflict Engine Evaluation */}
          <Card
            title="پرسنل پیشنهادی و تحلیل تداخل قوانین ۴ گانه (موتور تخصیص هوشمند)"
            action={
              <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowOverride}
                  onChange={(e) => setAllowOverride(e.target.checked)}
                  className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                />
                <span>مجوز سرپرستار جهت تخصیص موردی</span>
              </label>
            }
          >
            <div className="space-y-3">
              {candidates.map((cand) => {
                const isAssigned = shift.assignments?.some((a) => a.employee_id === cand.employee.id);
                return (
                  <div
                    key={cand.employee.id}
                    className={`rounded-xl border p-3 transition ${
                      isAssigned
                        ? "border-emerald-200 bg-emerald-50/30"
                        : cand.eligible
                        ? "border-slate-200 bg-white hover:border-teal-400"
                        : "border-rose-100 bg-rose-50/20"
                    }`}
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900">{cand.employee.fullName}</span>
                          <span className="font-mono text-xs text-slate-500">
                            ({toPersianDigits(cand.employee.employeeNumber)})
                          </span>
                          <span className="text-xs text-slate-600 font-medium">
                            {cand.employee.jobTitle} · {cand.employee.department}
                          </span>
                        </div>
                        <div className="mt-1.5">
                          <ConflictBadge validation={cand.validation} />
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-center">
                        <span className="text-xs text-slate-500 font-semibold" title="امتیاز تطابق هوشمند">
                          امتیاز: {toPersianDigits(cand.score)}٪
                        </span>
                        {isAssigned ? (
                          <span className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white">
                            تخصیص یافته
                          </span>
                        ) : (
                          <Button
                            variant={cand.eligible ? "primary" : allowOverride ? "secondary" : "ghost"}
                            disabled={assigningId === cand.employee.id || (!cand.eligible && !allowOverride)}
                            onClick={() => handleAssign(cand.employee.id, !cand.eligible)}
                            className="text-xs px-3 py-1.5"
                          >
                            {assigningId === cand.employee.id ? "در حال ثبت..." : "تخصیص به شیفت"}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <div className="flex justify-end pt-2">
            <Button variant="secondary" onClick={onClose}>
              بستن
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
