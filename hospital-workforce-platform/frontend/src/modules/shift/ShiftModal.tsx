"use client";

import React, { useEffect, useState, type FormEvent } from "react";
import { api } from "../../lib/api";
import { getTodayJalali, jalaliToGregorian, toPersianDigits } from "../../lib/jalali";
import { SHIFT_TYPES_CONFIG, type ShiftTypeKey } from "../../lib/terminology";
import type { Department, ShiftInstance, ShiftTemplate } from "../../lib/types";
import { Alert, Button, Field, Input, Modal, Select } from "../../components/ui";

export function ShiftModal({
  open,
  onClose,
  onSaved,
  initialShift,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  initialShift?: ShiftInstance | null;
}) {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = getTodayJalali();

  const [form, setForm] = useState({
    nameFa: initialShift?.name_fa ?? "شیفت صبح بخش مراقبت‌های ویژه",
    departmentId: initialShift?.department_id ?? 1,
    shiftType: (initialShift?.shift_type ?? "MORNING") as ShiftTypeKey,
    jalaliDate: initialShift?.jalali_date ?? today.jalali,
    startTime: initialShift?.start_time?.slice(0, 5) ?? "07:30",
    endTime: initialShift?.end_time?.slice(0, 5) ?? "14:00",
    requiredStaff: initialShift?.required_staff ?? 3,
    requiredRole: initialShift?.required_role ?? "Critical Care Nurse",
    requiredSkill: initialShift?.required_skill ?? "Ventilator Management",
    notes: initialShift?.notes ?? "",
  });

  useEffect(() => {
    api.departments().then((r) => setDepartments(r.data)).catch(() => undefined);
    api.shiftTemplates().then((r) => setTemplates(r.data)).catch(() => undefined);
  }, []);

  const handleTemplateSelect = (templateIdStr: string) => {
    const tmplId = Number(templateIdStr);
    const tmpl = templates.find((t) => t.id === tmplId);
    if (!tmpl) return;
    setForm((f) => ({
      ...f,
      nameFa: tmpl.name_fa,
      departmentId: tmpl.department_id,
      shiftType: tmpl.shift_type as ShiftTypeKey,
      startTime: tmpl.start_time.slice(0, 5),
      endTime: tmpl.end_time.slice(0, 5),
      requiredStaff: tmpl.required_staff_count,
      requiredRole: tmpl.required_role ?? "",
      requiredSkill: tmpl.required_skill ?? "",
    }));
  };

  const handleShiftTypeChange = (type: ShiftTypeKey) => {
    const cfg = SHIFT_TYPES_CONFIG[type];
    setForm((f) => ({
      ...f,
      shiftType: type,
      startTime: cfg.defaultStart,
      endTime: cfg.defaultEnd,
    }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const gDate = jalaliToGregorian(form.jalaliDate);
      if (!gDate) {
        throw new Error("تاریخ جلالی وارد شده معتبر نمی‌باشد (فرمت صحیح: ۱۴۰۴/۱۰/۲۰)");
      }

      if (initialShift) {
        await api.updateShift(initialShift.id, {
          nameFa: form.nameFa,
          shiftType: form.shiftType,
          startTime: form.startTime,
          endTime: form.endTime,
          requiredStaff: Number(form.requiredStaff),
          requiredRole: form.requiredRole || null,
          requiredSkill: form.requiredSkill || null,
          notes: form.notes || null,
        });
      } else {
        await api.createShift({
          nameFa: form.nameFa,
          departmentId: Number(form.departmentId),
          shiftType: form.shiftType,
          jalaliDate: form.jalaliDate,
          gregorianDate: gDate,
          startTime: form.startTime,
          endTime: form.endTime,
          requiredStaff: Number(form.requiredStaff),
          requiredRole: form.requiredRole || null,
          requiredSkill: form.requiredSkill || null,
          notes: form.notes || null,
        });
      }

      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message ?? "خطا در ثبت شیفت");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} title={initialShift ? "ویرایش شیفت بیمارستان" : "تعریف شیفت کاری جدید"} onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="space-y-4 text-right" dir="rtl">
        {error && <Alert tone="error">{error}</Alert>}

        {!initialShift && templates.length > 0 && (
          <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-3">
            <span className="mb-1 block text-xs font-semibold text-teal-800">انتخاب از الگوهای استاندارد شیفت:</span>
            <Select onChange={(e) => handleTemplateSelect(e.target.value)}>
              <option value="">انتخاب الگوی پیش‌فرض (اختیاری)...</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name_fa} · {t.department_name_fa} ({SHIFT_TYPES_CONFIG[t.shift_type]?.label_fa}) · ساعت {t.start_time.slice(0, 5)} تا {t.end_time.slice(0, 5)}
                </option>
              ))}
            </Select>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="عنوان فارسی شیفت" required>
            <Input
              value={form.nameFa}
              onChange={(e) => setForm({ ...form, nameFa: e.target.value })}
              placeholder="مثال: شیفت صبح بخش مراقبت‌های ویژه"
              required
            />
          </Field>

          <Field label="بخش درمانی / بستری" required>
            <Select
              value={form.departmentId}
              onChange={(e) => setForm({ ...form, departmentId: Number(e.target.value) })}
              disabled={Boolean(initialShift)}
            >
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name_fa || d.name} {d.code ? `(${d.code})` : ""}
                </option>
              ))}
            </Select>
          </Field>

          <div>
            <span className="mb-1 block text-xs font-semibold text-slate-600">نوبت کاری (نوع شیفت) *</span>
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
              {(Object.keys(SHIFT_TYPES_CONFIG) as ShiftTypeKey[]).map((t) => {
                const cfg = SHIFT_TYPES_CONFIG[t];
                const isSelected = form.shiftType === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => handleShiftTypeChange(t)}
                    className={`rounded-lg border px-2 py-1.5 text-xs font-bold transition ${
                      isSelected ? "border-teal-600 bg-teal-600 text-white shadow-sm" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {cfg.label_fa}
                  </button>
                );
              })}
            </div>
          </div>

          <Field label="تاریخ شمسی شیفت (جلالی)" required hint="فرمت: سال/ماه/روز e.g. ۱۴۰۴/۱۰/۲۰">
            <Input
              value={form.jalaliDate}
              onChange={(e) => setForm({ ...form, jalaliDate: e.target.value })}
              placeholder="۱۴۰۴/۱۰/۲۰"
              required
              disabled={Boolean(initialShift)}
            />
          </Field>

          <Field label="ساعت شروع شیفت" required>
            <Input
              type="time"
              value={form.startTime}
              onChange={(e) => setForm({ ...form, startTime: e.target.value })}
              required
            />
          </Field>

          <Field label="ساعت پایان شیفت" required>
            <Input
              type="time"
              value={form.endTime}
              onChange={(e) => setForm({ ...form, endTime: e.target.value })}
              required
            />
          </Field>

          <Field label="تعداد پرسنل مورد نیاز (ظرفیت چیدمان)" required>
            <Input
              type="number"
              min={1}
              max={50}
              value={form.requiredStaff}
              onChange={(e) => setForm({ ...form, requiredStaff: Number(e.target.value) })}
              required
            />
          </Field>

          <Field label="رده شغلی الزامی" hint="مثال: Critical Care Nurse, Emergency Physician">
            <Input
              value={form.requiredRole}
              onChange={(e) => setForm({ ...form, requiredRole: e.target.value })}
              placeholder="پرستار ویژه / پزشک مقیم"
            />
          </Field>

          <Field label="مهارت الزامی (قانون ۴)" hint="مثال: Ventilator Management, ACLS, BLS, Triage">
            <Input
              value={form.requiredSkill}
              onChange={(e) => setForm({ ...form, requiredSkill: e.target.value })}
              placeholder="مدیریت ونتیلاتور / تریاژ"
            />
          </Field>

          <Field label="یادداشت و دستورات سرپرستاری">
            <Input
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="توضیحات ویژه شیفت..."
            />
          </Field>
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
          <Button type="button" variant="secondary" onClick={onClose}>
            انصراف
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "در حال ثبت..." : initialShift ? "ذخیره تغییرات" : "ایجاد شیفت"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
