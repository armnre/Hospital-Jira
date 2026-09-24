/**
 * فرهنگ واژگان تخصصی بیمارستان و مدیریت شیفت‌ها (Persian Hospital Terminology)
 */

export const SHIFT_TYPES_CONFIG = {
  MORNING: {
    label_fa: "صبح",
    label_en: "Morning",
    color: "bg-amber-100 text-amber-900 border-amber-300 ring-amber-400/40",
    badgeTone: "amber",
    defaultStart: "07:30",
    defaultEnd: "14:00",
  },
  AFTERNOON: {
    label_fa: "عصر",
    label_en: "Afternoon",
    color: "bg-blue-100 text-blue-900 border-blue-300 ring-blue-400/40",
    badgeTone: "sky",
    defaultStart: "13:30",
    defaultEnd: "20:00",
  },
  NIGHT: {
    label_fa: "شب",
    label_en: "Night",
    color: "bg-indigo-100 text-indigo-900 border-indigo-300 ring-indigo-400/40",
    badgeTone: "violet",
    defaultStart: "19:30",
    defaultEnd: "08:00",
  },
  ON_CALL: {
    label_fa: "آنکال",
    label_en: "On Call",
    color: "bg-emerald-100 text-emerald-900 border-emerald-300 ring-emerald-400/40",
    badgeTone: "emerald",
    defaultStart: "20:00",
    defaultEnd: "08:00",
  },
  EMERGENCY: {
    label_fa: "اضطراری",
    label_en: "Emergency",
    color: "bg-rose-100 text-rose-900 border-rose-300 ring-rose-400/40",
    badgeTone: "rose",
    defaultStart: "08:00",
    defaultEnd: "20:00",
  },
} as const;

export type ShiftTypeKey = keyof typeof SHIFT_TYPES_CONFIG;

export const SHIFT_STATUS_CONFIG = {
  DRAFT: {
    label_fa: "پیش‌نویس",
    color: "bg-slate-100 text-slate-700 border-slate-300 ring-slate-200",
  },
  PENDING_APPROVAL: {
    label_fa: "در انتظار تایید",
    color: "bg-amber-100 text-amber-800 border-amber-300 ring-amber-300",
  },
  APPROVED: {
    label_fa: "تایید شده",
    color: "bg-emerald-100 text-emerald-800 border-emerald-300 ring-emerald-300",
  },
  ACTIVE: {
    label_fa: "فعال",
    color: "bg-teal-100 text-teal-800 border-teal-300 ring-teal-300",
  },
  RUNNING: {
    label_fa: "در حال اجرا",
    color: "bg-teal-100 text-teal-800 border-teal-300 ring-teal-300",
  },
  COMPLETED: {
    label_fa: "تکمیل شده",
    color: "bg-blue-100 text-blue-800 border-blue-300 ring-blue-200",
  },
  CANCELLED: {
    label_fa: "لغو شده",
    color: "bg-rose-100 text-rose-800 border-rose-300 ring-rose-300",
  },
} as const;

export type ShiftStatusKey = keyof typeof SHIFT_STATUS_CONFIG;

export const ASSIGNMENT_STATUS_CONFIG = {
  PROPOSED: {
    label_fa: "پیشنهاد شده",
    color: "bg-purple-100 text-purple-800 border-purple-200",
  },
  PENDING_CONFIRMATION: {
    label_fa: "در انتظار تایید پرسنل",
    color: "bg-amber-100 text-amber-800 border-amber-200",
  },
  CONFIRMED: {
    label_fa: "تایید و قطعی شده",
    color: "bg-emerald-100 text-emerald-800 border-emerald-200",
  },
  REJECTED: {
    label_fa: "رد شده",
    color: "bg-rose-100 text-rose-800 border-rose-200",
  },
  CANCELLED: {
    label_fa: "لغو شده",
    color: "bg-slate-100 text-slate-600 border-slate-200",
  },
} as const;

export type AssignmentStatusKey = keyof typeof ASSIGNMENT_STATUS_CONFIG;

export const AVAILABILITY_REASONS_CONFIG = {
  AVAILABLE: {
    label_fa: "در دسترس برای شیفت",
    available: true,
    color: "text-emerald-700 bg-emerald-50 border-emerald-200",
  },
  UNAVAILABLE: {
    label_fa: "عدم امکان حضور",
    available: false,
    color: "text-slate-700 bg-slate-50 border-slate-200",
  },
  VACATION: {
    label_fa: "مرخصی استحقاقی",
    available: false,
    color: "text-amber-800 bg-amber-50 border-amber-200",
  },
  SICK_LEAVE: {
    label_fa: "بیماری",
    available: false,
    color: "text-rose-800 bg-rose-50 border-rose-200",
  },
  MEDICAL_LEAVE: {
    label_fa: "مرخصی استعلاجی / پزشکی",
    available: false,
    color: "text-rose-800 bg-rose-50 border-rose-200",
  },
  TRAINING: {
    label_fa: "دوره آموزشی / بازآموزی",
    available: false,
    color: "text-indigo-800 bg-indigo-50 border-indigo-200",
  },
} as const;

export type AvailabilityReasonKey = keyof typeof AVAILABILITY_REASONS_CONFIG;

export const HOSPITAL_ROLES_CONFIG: Record<string, { label_fa: string; desc: string }> = {
  HOSPITAL_ADMIN: {
    label_fa: "مدیر ارشد بیمارستان",
    desc: "نظارت عالی بر تمام بخش‌ها، شیفت‌ها و سیاست‌های کلان منابع انسانی",
  },
  NURSING_MANAGER: {
    label_fa: "مدیر پرستاری (مترون)",
    desc: "تایید نهایی شیفت‌های پرستاری، بررسی کمبود نیرو و چیدمان پرسنلی",
  },
  SHIFT_SUPERVISOR: {
    label_fa: "سوپروایزر شیفت / سرپرستار",
    desc: "تعریف شیفت، تخصیص پرسنل، بررسی تداخل‌ها و مدیریت شیفت‌های جاری",
  },
  DEPARTMENT_HEAD: {
    label_fa: "رئیس / سرپرست بخش",
    desc: "برنامه‌ریزی و نظارت بر کادر تخصصی و الگوهای شیفت بخش",
  },
  HR_MANAGER: {
    label_fa: "مدیر منابع انسانی",
    desc: "مدیریت احکام پرسنلی، قراردادها و مدارک هویتی",
  },
  COMPLIANCE_OFFICER: {
    label_fa: "مسئول تطبیق و اعتباربخشی",
    desc: "اعتبارسنجی پروانه‌ها، مجوزها و انقضای صلاحیت‌های بالینی",
  },
  EMPLOYEE: {
    label_fa: "پرسنل بیمارستان",
    desc: "مشاهده برنامه کاری شخصی، ثبت دسترسی و درخواست مرخصی",
  },
  ADMIN: {
    label_fa: "مدیر ارشد سامانه",
    desc: "دسترسی جامع سیستمی و زیرساختی",
  },
};
