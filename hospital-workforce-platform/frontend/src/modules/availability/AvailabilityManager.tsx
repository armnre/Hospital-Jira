"use client";

import React, { useEffect, useState, type FormEvent } from "react";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { formatJalaliDate, getTodayJalali, jalaliToGregorian, toPersianDigits } from "../../lib/jalali";
import { AVAILABILITY_REASONS_CONFIG, type AvailabilityReasonKey } from "../../lib/terminology";
import type { Employee, EmployeeAvailability } from "../../lib/types";
import { Alert, Button, Card, Field, Input, PageTitle, Select, Spinner } from "../../components/ui";

export function AvailabilityManager() {
  const { user, can } = useAuth();
  const today = getTodayJalali();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [availabilities, setAvailabilities] = useState<EmployeeAvailability[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form
  const [selectedEmpId, setSelectedEmpId] = useState<string>("");
  const [jalaliDate, setJalaliDate] = useState<string>(today.jalali);
  const [reason, setReason] = useState<AvailabilityReasonKey>("AVAILABLE");
  const [notes, setNotes] = useState<string>("");

  const loadData = async () => {
    setLoading(true);
    try {
      const [empRes, availRes] = await Promise.all([
        can("employees:read") ? api.listEmployees({ pageSize: 100 }) : Promise.resolve({ data: [] }),
        api.listAvailability(),
      ]);
      setEmployees(empRes.data);
      setAvailabilities(availRes.data);
      if (user?.employeeId && !selectedEmpId) {
        setSelectedEmpId(user.employeeId);
      } else if (empRes.data[0] && !selectedEmpId) {
        setSelectedEmpId(empRes.data[0].id);
      }
      setError(null);
    } catch (e: any) {
      setError(e.message ?? "خطا در بارگذاری داده‌ها");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedEmpId) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const gDate = jalaliToGregorian(jalaliDate);
      if (!gDate) throw new Error("فرمت تاریخ جلالی معتبر نیست (۱۴۰۴/۱۰/۲۰)");

      const isAvail = reason === "AVAILABLE";
      await api.setAvailability({
        employeeId: selectedEmpId,
        date: gDate,
        jalaliDate,
        available: isAvail,
        reason,
        notes: notes || undefined,
      });

      setSuccess("وضعیت دسترسی / مرخصی پرسنل با موفقیت ثبت شد.");
      setNotes("");
      await loadData();
    } catch (err: any) {
      setError(err.message ?? "خطا در ثبت وضعیت دسترسی");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 text-right" dir="rtl">
      <PageTitle
        title="مدیریت دسترسی و مرخصی پرسنل بیمارستان"
        subtitle="ثبت مرخصی‌های استحقاقی، استعلاجی، بازآموزی و ساعات در دسترس جهت بررسی قانون ۳ چیدمان"
      />

      {error && <Alert tone="error">{error}</Alert>}
      {success && <Alert tone="success">{success}</Alert>}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Form to submit availability */}
        <Card title="ثبت دسترسی یا درخواست مرخصی">
          <form onSubmit={handleSubmit} className="space-y-4">
            {can("availability:write") && employees.length > 0 ? (
              <Field label="پرسنل بیمارستان" required>
                <Select value={selectedEmpId} onChange={(e) => setSelectedEmpId(e.target.value)} required>
                  <option value="">انتخاب پرسنل...</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.fullName} ({toPersianDigits(emp.employeeNumber)}) · {emp.department.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
                ثبت وضعیت برای حساب کاربری شخصی: <strong>{user?.name}</strong>
              </div>
            )}

            <Field label="تاریخ مورد نظر (شمسی)" required hint="فرمت: سال/ماه/روز e.g. ۱۴۰۴/۱۰/۲۰">
              <Input
                value={jalaliDate}
                onChange={(e) => setJalaliDate(e.target.value)}
                placeholder="۱۴۰۴/۱۰/۲۰"
                required
              />
            </Field>

            <Field label="وضعیت حضور و دسترسی" required>
              <Select value={reason} onChange={(e) => setReason(e.target.value as AvailabilityReasonKey)}>
                {Object.entries(AVAILABILITY_REASONS_CONFIG).map(([k, cfg]) => (
                  <option key={k} value={k}>
                    {cfg.label_fa}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="توضیحات و یادداشت سرپرستاری">
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="علت مرخصی یا هماهنگی..."
              />
            </Field>

            <Button type="submit" className="w-full" disabled={submitting || !selectedEmpId}>
              {submitting ? "در حال ثبت..." : "ثبت وضعیت در سیستم"}
            </Button>
          </form>
        </Card>

        {/* List of recorded availabilities */}
        <Card title="وضعیت‌های ثبت‌شده اخیر در سیستم بیمارستان" className="lg:col-span-2">
          {loading ? (
            <Spinner label="در حال بارگذاری لیست وضعیت‌های دسترسی..." />
          ) : availabilities.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">
              هنوز هیچ وضعیت عدم دسترسی یا مرخصی ثبت نشده است.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                    <th className="px-3 py-2">نام پرسنل</th>
                    <th className="px-3 py-2">بخش</th>
                    <th className="px-3 py-2">تاریخ شمسی</th>
                    <th className="px-3 py-2">وضعیت دسترسی</th>
                    <th className="px-3 py-2">یادداشت</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {availabilities.map((av) => {
                    const cfg = AVAILABILITY_REASONS_CONFIG[av.reason as AvailabilityReasonKey];
                    return (
                      <tr key={av.id} className="hover:bg-slate-50">
                        <td className="px-3 py-2.5 font-bold text-slate-900">
                          {av.full_name}
                          <span className="block text-[11px] font-mono font-normal text-slate-400">
                            {toPersianDigits(av.employee_number)}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-slate-600">{av.department_name_fa}</td>
                        <td className="px-3 py-2.5 font-mono text-slate-800">
                          {toPersianDigits(av.jalali_date)}
                          <span className="block text-[10px] text-slate-400">
                            {formatJalaliDate(av.date, { withWeekday: true })}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cfg?.color}`}>
                            {cfg?.label_fa ?? av.reason}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-slate-500">{av.notes || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
