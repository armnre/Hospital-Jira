# Phase 3 Preparation: AI Workforce Matching Engine Architecture

> این سند، ساختار آماده‌سازی زیرساخت، بردارهای ویژگی و ارتباط داده‌های فازهای ۱ و ۲ را برای پیاده‌سازی موتور هوشمند تخصیص کادر درمان در فاز ۳ تشریح می‌کند.

## ۱. اهداف موتور تخصیص هوشمند (AI Matching Engine)

در فاز ۳، سامانه از یک مدل بهینه‌سازی ترکیبی (Constraint Satisfaction + Multi-Objective Ranking) برای پیشنهاد خودکار بهترین پرسنل برای شیفت‌های خالی استفاده خواهد کرد:
1. **انطباق مهارت‌های بالینی (Skill Competency Alignment):** ترجیح پرسنل با سطح مهارت Expert و Advanced در شیفت‌های حساس (مانند ICU و اتاق عمل).
2. **رعایت عدالت در توزیع کشیک‌ها (Workload Fairness):** جلوگیری از تخصیص مکرر شیفت‌های شب به یک فرد و توزیع متوازن ساعات کاری ماهانه.
3. **پیش‌بینی خستگی و فرسودگی شغلی (Fatigue & Safety Buffer):** رعایت حداقل فاصله استراحت استاندارد (حداقل ۱۶ ساعت استراحت پس از شیفت شب).
4. **اولویت‌بندی تمایلات و مرخصی‌ها (Preference Satisfaction):** ترجیح پرسنلی که اعلام آمادگی داوطلبانه برای نوبت مورد نظر داشته‌اند.

## ۲. ارتباط با مدل‌های داده فازهای ۱ و ۲

```text
 ┌───────────────────────────┐      ┌───────────────────────────┐
 │ Phase 1: Workforce Core   │      │ Phase 1: Credential Core  │
 │ - employee_skills (سطح/سال)│      │ - v_credentials (اعتبار)   │
 │ - departments (بخش تخصصی)  │      │ - Rule 2 (is_valid flag)  │
 └─────────────┬─────────────┘      └─────────────┬─────────────┘
               │                                  │
               └─────────────────┬────────────────┘
                                 │
                                 ▼
                 ┌───────────────────────────────┐
                 │ Phase 2: Shift & Availability │
                 │ - shift_instances (ساعت/بخش)   │
                 │ - employee_availability       │
                 │ - conflict_engine (قوانین ۴گانه)│
                 └───────────────┬───────────────┘
                                 │
                                 ▼
                 ┌───────────────────────────────┐
                 │ Phase 3: AI Matching Engine   │
                 │ - Multi-Criteria Scoring      │
                 │ - Linear Programming / OR-Tools│
                 │ - Automated Roster Generator  │
                 └───────────────────────────────┘
```

## ۳. فرمول امتیازدهی برازش کادر (Suitability Score Formulation)

امتیاز اولیه هر کاندیدا در بازه ۰ تا ۱۰۰ بر اساس بردار زیر محاسبه می‌شود (که نقطه شروع آن در تابع `getEligibleCandidates` فاز ۲ پیاده‌سازی شده است):

$$\text{Score} = w_1 \cdot C_{\text{valid}} + w_2 \cdot S_{\text{match}} + w_3 \cdot E_{\text{years}} + w_4 \cdot A_{\text{status}} - P_{\text{fatigue}}$$

- $C_{\text{valid}}$: امتیاز اعتبار پروانه‌ها (در صورت انقضا امتیاز صفر و رد قطعی توسط موتور تداخل)
- $S_{\text{match}}$: ضریب تطابق سطح مهارت (Expert: 1.0, Advanced: 0.8, Intermediate: 0.5, Beginner: 0.2)
- $E_{\text{years}}$: سابقه کار بالینی در بخش تخصصی
- $A_{\text{status}}$: امتیاز تمایل حضور پرسنل
- $P_{\text{fatigue}}$: جریمه نزدیکی شیفت‌ها به منظور حفظ ایمنی بیمار و کادر درمان

## ۴. نقاط اتصال نرم‌افزاری (Integration Hooks)

- **اندپوینت فعلی آماده‌سازی:** `GET /api/v1/shifts/:id/candidates` فهرست مرتب‌شده پرسنل را همراه با ارزیابی برخط موتور تداخل برمی‌گرداند.
- **لاگ تاریخچه تصمیمات:** رویدادهای `platform.audit_log` داده‌های آموزشی واقعی چیدمان‌های گذشته را برای آموزش مدل یادگیری ماشین فراهم می‌سازد.
- **ماژولار بودن معماری:** لایه `conflictEngine` به عنوان فیلتر سخت (Hard Constraint Checker) و هسته هوش مصنوعی به عنوان بهینه‌ساز نرم (Soft Constraint Optimizer) عمل خواهند کرد.
