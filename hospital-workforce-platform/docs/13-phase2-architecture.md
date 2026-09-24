# Phase 2 Architecture: Shift Management & Workforce Assignment

> Phase 2 expands the Hospital Workforce Digital Twin Platform to support comprehensive hospital shift scheduling, workforce assignment workflows, and conflict detection for healthcare institutions in Iran, with a native Persian-first and RTL user experience.

## 1. System Overview

```text
 ┌────────────────────────────────────────────────────────────────────────┐
 │                   مرورگر کاربر (سرپرستار / مترون / پرسنل)              │
 │                     Persian RTL Web Interface (React 19)               │
 │                  http://hwdt.local/supervisor  |  /schedule            │
 └───────────────────────────────────┬────────────────────────────────────┘
                                     │  HTTP / REST (Bearer JWT)
                                     ▼
 ┌────────────────────────────────────────────────────────────────────────┐
 │                    Nginx Reverse Proxy (پروکسی معکوس)                 │
 │            حفاظت در برابر حملات، هدرهای امنیتی، هدایت مسیرها          │
 └───────────────────┬─────────────────────────────────┬──────────────────┘
                     │ /*                              │ /api/v1/*
                     ▼                                 ▼
 ┌─────────────────────────────────────┐   ┌──────────────────────────────┐
 │   Frontend (Next.js 16 + React 19)   │   │  Backend (Express 5 + TS)    │
 │   - RTL Layout (`dir="rtl"`)        │   │  - Conflict Detection Engine │
 │   - Jalali Calendar (تقویم جلالی)   │   │  - 4 Hard Business Rules     │
 │   - Supervisor Hospital Dashboard   │   │  - Jalali Date Converter     │
 │   - Shift Management & Rostering    │   │  - Supervisor Approval State │
 └─────────────────────────────────────┘   └──────────────┬───────────────┘
                                                          │ pg connection
                                                          ▼
 ┌────────────────────────────────────────────────────────────────────────┐
 │                 PostgreSQL 15 (پایگاه داده رابطه‌ای)                  │
 │   schemas:                                                             │
 │   - shift       : shift_templates, shift_instances, assignments, ...   │
 │   - workforce   : employees, departments (name_fa), skills, ...        │
 │   - credential  : credentials, compute_status(), v_credentials         │
 │   - iam         : users (HOSPITAL_ADMIN, NURSING_MANAGER, etc.)        │
 │   - platform    : audit_log (SHIFT_CREATED, SHIFT_APPROVED, ...)       │
 └────────────────────────────────────────────────────────────────────────┘
```

## 2. Supervisor Approval Workflow

The hospital workflow enforces structured governance from shift drafting to final roster publication:

```text
  [1. تعریف شیفت] 
  سرپرستار شیفت بر اساس الگوی استاندارد یا موردی شیفت جدید را در تقویم جلالی ثبت می‌کند.
        │
        ▼
  [2. بررسی نیازمندی‌ها]
  تعیین تعداد پرسنل مورد نیاز، رده شغلی (Job Role) و مهارت‌های تخصصی الزامی (e.g. ICU, Ventilator, ACLS).
        │
        ▼
  [3. اعتبارسنجی خودکار موتور تداخل (Conflict Detection)]
  سیستم قوانین ۴ گانه را ارزیابی می‌کند: اعتبار پروانه، عدم تداخل ساعت، دسترسی/مرخصی و مهارت.
        │
        ▼
  [4. تخصیص پرسنل (Workforce Assignment)]
  تخصیص کادر درمان واجد شرایط؛ به روزرسانی خودکار شمارنده چیدمان و شاخص پوشش بخش.
        │
        ▼
  [5. ارسال جهت تایید (Pending Approval)]
  ارسال برنامه شیفت به مترون (مدیر پرستاری) یا سرپرست بخش.
        │
        ▼
  [6. تایید نهایی و انتشار (Approved / Running)]
  تایید توسط مدیر پرستاری، ثبت لاگ حسابرسی SHIFT_APPROVED و نمایش در برنامه کاری پرسنل.
```

## 3. Conflict Detection Engine (قوانین ۴ گانه قطعی)

| قانون | عنوان | نحوه اعتبارسنجی | پیامد نقض قانون |
|---|---|---|---|
| **قانون ۱** | انقضای صلاحیت و پروانه | بررسی وضعیت محاسباتی مدارک در `credential.v_credentials` | رد تخصیص با خطای انقضای پروانه |
| **قانون ۲** | تداخل زمانی شیفت‌ها | بررسی همپوشانی بازه `[start_time, end_time]` با سایر شیفت‌های همان روز (با احتساب عبور از نیمه‌شب) | رد تخصیص با خطای تداخل زمانی |
| **قانون ۳** | بررسی دسترسی و مرخصی | بررسی جدول `shift.employee_availability` برای تاریخ شیفت | رد تخصیص به علت ثبت مرخصی یا عدم امکان حضور |
| **قانون ۴** | تطابق مهارت‌های الزامی | بررسی مهارت‌های فعال پرسنل در `workforce.employee_skills` در برابر `required_skill` | رد تخصیص به علت عدم احراز مهارت تخصصی شیفت |

## 4. Role Hierarchy in Iranian Hospitals

1. **HOSPITAL_ADMIN (مدیر ارشد بیمارستان):** نظارت عالی بر پوشش کلی بیمارستان، مدیریت ظرفیت‌ها و گزارش‌های راهبردی.
2. **NURSING_MANAGER (مدیر پرستاری / مترون):** تایید نهایی برنامه‌های شیفت، پایش کسری نیرو و نظارت بر چیدمان پرستاری تمام بخش‌ها.
3. **SHIFT_SUPERVISOR (سوپروایزر شیفت / سرپرستار):** تعریف شیفت‌های بخش، ارزیابی پیشنهادهای موتور چیدمان، تخصیص کادر و مدیریت تغییرات اضطراری.
4. **DEPARTMENT_HEAD (رئیس / سرپرست بخش):** برنامه‌ریزی تخصصی کادر پزشکی و پیراپزشکی بخش.
5. **EMPLOYEE (پرسنل بالینی / عمومی):** مشاهده برنامه کاری شخصی در تقویم جلالی و ثبت درخواست‌های مرخصی و دسترسی.
