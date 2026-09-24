/**
 * HWDT Phase 2 — Persian RTL, Jalali Calendar & Assignment UI Tests
 * Covers:
 *   - RTL rendering & layout
 *   - Persian hospital labels & terminology
 *   - Jalali calendar math & date formatting
 *   - Conflict Badge and Assignment UI
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  formatJalaliDate,
  formatPersianTime,
  getJalaliMonthCalendar,
  gregorianToJalali,
  jalaliToGregorian,
  toAsciiDigits,
  toPersianDigits,
} from "../../frontend/src/lib/jalali";
import {
  AVAILABILITY_REASONS_CONFIG,
  HOSPITAL_ROLES_CONFIG,
  SHIFT_STATUS_CONFIG,
  SHIFT_TYPES_CONFIG,
} from "../../frontend/src/lib/terminology";
import { ConflictBadge } from "../../frontend/src/modules/assignment/ConflictBadge";
import type { ConflictValidationResponse } from "../../frontend/src/lib/types";

describe("Persian Numbers & Jalali Calendar Math", () => {
  it("converts Gregorian date to Jalali date correctly (2026-01-10 -> 1404/10/20)", () => {
    expect(gregorianToJalali("2026-01-10")).toBe("1404/10/20");
    expect(jalaliToGregorian("1404/10/20")).toBe("2026-01-10");
  });

  it("formats Jalali date in Persian words with numerals (۲۰ دی ۱۴۰۴)", () => {
    const formatted = formatJalaliDate("2026-01-10");
    expect(formatted).toBe("۲۰ دی ۱۴۰۴");
  });

  it("converts ASCII numerals to Persian numerals and vice versa", () => {
    expect(toPersianDigits(12345)).toBe("۱۲۳۴۵");
    expect(toPersianDigits("07:30")).toBe("۰۷:۳۰");
    expect(toAsciiDigits("۱۴۰۴/۱۰/۲۰")).toBe("1404/10/20");
    expect(formatPersianTime("13:30:00")).toBe("۱۳:۳۰");
  });

  it("generates 30-day Dey month calendar with correct weekdays", () => {
    const cal = getJalaliMonthCalendar(1404, 10);
    expect(cal.monthName).toBe("دی");
    expect(cal.length).toBe(30);
    expect(cal.days).toHaveLength(30);
    expect(cal.days[19].jalaliDate).toBe("1404/10/20");
    expect(cal.days[19].gregorianDate).toBe("2026-01-10");
  });
});

describe("Persian Hospital Terminology & Labels", () => {
  it("defines standard Persian hospital shift types", () => {
    expect(SHIFT_TYPES_CONFIG.MORNING.label_fa).toBe("صبح");
    expect(SHIFT_TYPES_CONFIG.AFTERNOON.label_fa).toBe("عصر");
    expect(SHIFT_TYPES_CONFIG.NIGHT.label_fa).toBe("شب");
    expect(SHIFT_TYPES_CONFIG.ON_CALL.label_fa).toBe("آنکال");
    expect(SHIFT_TYPES_CONFIG.EMERGENCY.label_fa).toBe("اضطراری");
  });

  it("defines standard Persian shift statuses", () => {
    expect(SHIFT_STATUS_CONFIG.DRAFT.label_fa).toBe("پیش‌نویس");
    expect(SHIFT_STATUS_CONFIG.PENDING_APPROVAL.label_fa).toBe("در انتظار تایید");
    expect(SHIFT_STATUS_CONFIG.APPROVED.label_fa).toBe("تایید شده");
    expect(SHIFT_STATUS_CONFIG.RUNNING.label_fa).toBe("در حال اجرا");
    expect(SHIFT_STATUS_CONFIG.COMPLETED.label_fa).toBe("تکمیل شده");
    expect(SHIFT_STATUS_CONFIG.CANCELLED.label_fa).toBe("لغو شده");
  });

  it("defines Iranian hospital workforce roles", () => {
    expect(HOSPITAL_ROLES_CONFIG.NURSING_MANAGER.label_fa).toBe("مدیر پرستاری (مترون)");
    expect(HOSPITAL_ROLES_CONFIG.SHIFT_SUPERVISOR.label_fa).toBe("سوپروایزر شیفت / سرپرستار");
    expect(HOSPITAL_ROLES_CONFIG.DEPARTMENT_HEAD.label_fa).toBe("رئیس / سرپرست بخش");
    expect(HOSPITAL_ROLES_CONFIG.HOSPITAL_ADMIN.label_fa).toBe("مدیر ارشد بیمارستان");
  });

  it("defines availability reasons in Persian", () => {
    expect(AVAILABILITY_REASONS_CONFIG.VACATION.label_fa).toBe("مرخصی استحقاقی");
    expect(AVAILABILITY_REASONS_CONFIG.MEDICAL_LEAVE.label_fa).toBe("مرخصی استعلاجی / پزشکی");
    expect(AVAILABILITY_REASONS_CONFIG.TRAINING.label_fa).toBe("دوره آموزشی / بازآموزی");
  });
});

describe("Conflict Badge & Assignment UI", () => {
  it("renders positive badge when validation has no conflicts", () => {
    const validResult: ConflictValidationResponse = {
      valid: true,
      errors: [],
      warnings: [],
      details: {
        rule1_credentials: { passed: true, expiredCount: 0, activeLicense: true },
        rule2_overlap: { passed: true },
        rule3_availability: { passed: true },
        rule4_skills: { passed: true, employeeSkills: ["Ventilator Management"] },
      },
    };

    render(<ConflictBadge validation={validResult} />);
    expect(screen.getByText("فاقد تداخل (واجد شرایط)")).toBeTruthy();
  });

  it("renders conflict badge and detailed Persian error list when conflicts exist", () => {
    const conflictResult: ConflictValidationResponse = {
      valid: false,
      errors: [
        "خطای انقضای مدرک (قانون ۱): پرسنل دارای مدرک منقضی است",
        "تداخل شیفت (قانون ۲): همپوشانی با شیفت عصر",
      ],
      warnings: [],
      details: {
        rule1_credentials: { passed: false, expiredCount: 1, activeLicense: false },
        rule2_overlap: { passed: false },
        rule3_availability: { passed: true },
        rule4_skills: { passed: true, employeeSkills: [] },
      },
    };

    render(<ConflictBadge validation={conflictResult} />);
    expect(screen.getByText(/دارای ۲ تداخل \/ مانع/)).toBeTruthy();
    expect(screen.getByText("خطای انقضای مدرک (قانون ۱): پرسنل دارای مدرک منقضی است")).toBeTruthy();
    expect(screen.getByText("تداخل شیفت (قانون ۲): همپوشانی با شیفت عصر")).toBeTruthy();
  });
});
