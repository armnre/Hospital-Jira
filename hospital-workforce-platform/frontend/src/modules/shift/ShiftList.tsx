"use client";

import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { formatPersianTime, toPersianDigits } from "../../lib/jalali";
import { SHIFT_STATUS_CONFIG, SHIFT_TYPES_CONFIG } from "../../lib/terminology";
import type { Department, ShiftInstance } from "../../lib/types";
import { Alert, Button, Card, EmptyState, Input, PageTitle, Select, Spinner } from "../../components/ui";
import { AssignmentDrawer } from "../assignment/AssignmentDrawer";
import { ShiftModal } from "./ShiftModal";

export function ShiftList() {
  const { can } = useAuth();
  const [shifts, setShifts] = useState<ShiftInstance[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [departmentId, setDepartmentId] = useState<string>("");
  const [shiftType, setShiftType] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [search, setSearch] = useState("");

  // Modals state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<ShiftInstance | null>(null);
  const [assigningShiftId, setAssigningShiftId] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [shiftRes, deptRes] = await Promise.all([
        api.listShifts({
          departmentId: departmentId ? Number(departmentId) : undefined,
          shiftType: shiftType ? (shiftType as any) : undefined,
          status: status ? (status as any) : undefined,
          limit: 300,
        }),
        api.departments(),
      ]);
      setShifts(shiftRes.data);
      setDepartments(deptRes.data);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? "خطا در بارگذاری لیست شیفت‌ها");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [departmentId, shiftType, status]);

  const handleApprove = async (id: string) => {
    try {
      await api.approveShift(id);
      loadData();
    } catch (e: any) {
      alert(e.message ?? "خطا در تایید شیفت");
    }
  };

  const handleDelete = async (shift: ShiftInstance) => {
    if (!confirm(`آیا از حذف شیفت «${shift.name_fa}» مطمئن هستید؟`)) return;
    try {
      await api.deleteShift(shift.id);
      loadData();
    } catch (e: any) {
      alert(e.message ?? "خطا در حذف شیفت");
    }
  };

  const filteredShifts = shifts.filter((s) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      s.name_fa.toLowerCase().includes(q) ||
      s.department_name_fa.toLowerCase().includes(q) ||
      s.jalali_date.includes(q) ||
      (s.required_skill && s.required_skill.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6 text-right" dir="rtl">
      <PageTitle
        title="مدیریت شیفت‌های بیمارستان"
        subtitle="برنامه‌ریزی، چیدمان پرسنلی و فرآیند تایید نوبت‌های کاری"
        actions={
          can("shifts:write") && (
            <Button
              onClick={() => {
                setEditingShift(null);
                setModalOpen(true);
              }}
            >
              + تعریف شیفت جدید
            </Button>
          )
        }
      />

      {error && <Alert tone="error">{error}</Alert>}

      {/* Filter Toolbar */}
      <Card>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            placeholder="جستجوی عنوان، بخش، تاریخ یا مهارت..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
            <option value="">همه بخش‌های بیمارستان</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name_fa || d.name}
              </option>
            ))}
          </Select>

          <Select value={shiftType} onChange={(e) => setShiftType(e.target.value)}>
            <option value="">همه نوبت‌های کاری</option>
            {Object.entries(SHIFT_TYPES_CONFIG).map(([k, cfg]) => (
              <option key={k} value={k}>
                شیفت {cfg.label_fa} ({cfg.defaultStart} - {cfg.defaultEnd})
              </option>
            ))}
          </Select>

          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">همه وضعیت‌ها</option>
            {Object.entries(SHIFT_STATUS_CONFIG).map(([k, cfg]) => (
              <option key={k} value={k}>
                {cfg.label_fa}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      {/* Shifts Table */}
      {loading ? (
        <Spinner label="در حال بارگذاری لیست شیفت‌ها..." />
      ) : filteredShifts.length === 0 ? (
        <EmptyState title="شیفتی با این مشخصات یافت نشد">
          جهت ایجاد شیفت کاری جدید برای بخش‌های بیمارستان، دکمه «تعریف شیفت جدید» را انتخاب کنید.
        </EmptyState>
      ) : (
        <Card className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                  <th className="px-4 py-3">عنوان شیفت</th>
                  <th className="px-4 py-3">بخش</th>
                  <th className="px-4 py-3">نوبت</th>
                  <th className="px-4 py-3">تاریخ شمسی</th>
                  <th className="px-4 py-3">ساعات</th>
                  <th className="px-4 py-3">پوشش پرسنلی</th>
                  <th className="px-4 py-3">وضعیت</th>
                  <th className="px-4 py-3 text-left">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredShifts.map((s) => {
                  const typeCfg = SHIFT_TYPES_CONFIG[s.shift_type];
                  const statusCfg = SHIFT_STATUS_CONFIG[s.status];
                  const isShortage = s.assigned_staff_count < s.required_staff;

                  return (
                    <tr key={s.id} className="hover:bg-slate-50 transition">
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        {s.name_fa}
                        {s.required_skill && (
                          <span className="block text-[11px] font-normal text-teal-700">
                            مهارت: {s.required_skill}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-700 font-medium">
                        {s.department_name_fa}
                      </td>
                      <td className="px-4 py-3">
                        {typeCfg && (
                          <span className={`inline-flex rounded px-2 py-0.5 text-xs font-bold ${typeCfg.color}`}>
                            {typeCfg.label_fa}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-700 font-medium">
                        {toPersianDigits(s.jalali_date)}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-600 text-xs">
                        {formatPersianTime(s.start_time)} - {formatPersianTime(s.end_time)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`font-black text-sm ${
                              isShortage ? "text-amber-700 font-bold" : "text-emerald-700"
                            }`}
                          >
                            {toPersianDigits(s.assigned_staff_count)} / {toPersianDigits(s.required_staff)}
                          </span>
                          {isShortage && (
                            <span className="rounded bg-amber-100 px-1.5 py-0.2 text-[10px] font-semibold text-amber-800">
                              کسری نیرو
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {statusCfg && (
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusCfg.color}`}>
                            {statusCfg.label_fa}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-left">
                        <div className="flex items-center justify-end gap-1">
                          {can("assignments:write") && (
                            <Button
                              variant="primary"
                              className="px-2.5 py-1 text-xs"
                              onClick={() => setAssigningShiftId(s.id)}
                            >
                              تخصیص نیرو
                            </Button>
                          )}
                          {can("shifts:approve") && s.status === "PENDING_APPROVAL" && (
                            <Button
                              variant="secondary"
                              className="px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50"
                              onClick={() => handleApprove(s.id)}
                            >
                              تایید شیفت
                            </Button>
                          )}
                          {can("shifts:write") && (
                            <Button
                              variant="ghost"
                              className="px-2 py-1 text-xs"
                              onClick={() => {
                                setEditingShift(s);
                                setModalOpen(true);
                              }}
                            >
                              ویرایش
                            </Button>
                          )}
                          {can("shifts:delete") && (
                            <Button
                              variant="ghost"
                              className="px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
                              onClick={() => handleDelete(s)}
                            >
                              حذف
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
        </Card>
      )}

      {/* Shift Create / Edit Modal */}
      <ShiftModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={loadData}
        initialShift={editingShift}
      />

      {/* Assignment & Conflict Resolution Drawer */}
      {assigningShiftId && (
        <AssignmentDrawer
          shiftId={assigningShiftId}
          open={Boolean(assigningShiftId)}
          onClose={() => setAssigningShiftId(null)}
          onUpdated={loadData}
        />
      )}
    </div>
  );
}
