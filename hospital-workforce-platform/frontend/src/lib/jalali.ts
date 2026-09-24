import { toJalaali, toGregorian, jalaaliMonthLength } from "jalaali-js";

export const PERSIAN_MONTH_NAMES = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
] as const;

export const PERSIAN_WEEKDAYS = [
  { key: 6, short: "ش", name: "شنبه" },
  { key: 0, short: "ی", name: "یکشنبه" },
  { key: 1, short: "د", name: "دوشنبه" },
  { key: 2, short: "س", name: "سه‌شنبه" },
  { key: 3, short: "چ", name: "چهارشنبه" },
  { key: 4, short: "پ", name: "پنج‌شنبه" },
  { key: 5, short: "ج", name: "جمعه" },
] as const;

/** Convert English/Arabic digits to Persian digits */
export function toPersianDigits(input: string | number | null | undefined): string {
  if (input === null || input === undefined) return "";
  const str = String(input);
  const persianDigits = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
  return str.replace(/[0-9]/g, (d) => persianDigits[Number(d)]);
}

/** Convert Persian numerals to standard ASCII digits */
export function toAsciiDigits(input: string): string {
  const persianToAscii: Record<string, string> = {
    "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
    "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
    "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
    "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
  };
  return input.replace(/[۰-۹٠-٩]/g, (ch) => persianToAscii[ch] ?? ch);
}

/** Convert ISO Gregorian date (YYYY-MM-DD) to Jalali string (YYYY/MM/DD) */
export function gregorianToJalali(isoDate: string): string {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}/.test(isoDate)) return "";
  const [gy, gm, gd] = isoDate.slice(0, 10).split("-").map(Number);
  const { jy, jm, jd } = toJalaali(gy, gm, gd);
  return `${jy}/${String(jm).padStart(2, "0")}/${String(jd).padStart(2, "0")}`;
}

/** Convert Jalali date (YYYY/MM/DD or YYYY-MM-DD) to Gregorian date (YYYY-MM-DD) */
export function jalaliToGregorian(jalaliStr: string): string {
  const normalized = toAsciiDigits(jalaliStr).replace(/[.\-]/g, "/");
  const parts = normalized.split("/").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return "";
  const [jy, jm, jd] = parts;
  const { gy, gm, gd } = toGregorian(jy, jm, jd);
  return `${gy}-${String(gm).padStart(2, "0")}-${String(gd).padStart(2, "0")}`;
}

/** Format a Gregorian ISO date into Persian words: e.g. "۲۰ دی ۱۴۰۴" */
export function formatJalaliDate(isoDate: string, options: { withWeekday?: boolean; withPersianDigits?: boolean } = {}): string {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}/.test(isoDate)) return "—";
  const [gy, gm, gd] = isoDate.slice(0, 10).split("-").map(Number);
  const { jy, jm, jd } = toJalaali(gy, gm, gd);
  const monthName = PERSIAN_MONTH_NAMES[jm - 1] ?? "";

  const d = new Date(Date.UTC(gy, gm - 1, gd));
  const weekday = PERSIAN_WEEKDAYS.find((w) => w.key === d.getUTCDay())?.name ?? "";

  const dayStr = options.withPersianDigits !== false ? toPersianDigits(jd) : String(jd);
  const yearStr = options.withPersianDigits !== false ? toPersianDigits(jy) : String(jy);

  let formatted = `${dayStr} ${monthName} ${yearStr}`;
  if (options.withWeekday) {
    formatted = `${weekday}، ${formatted}`;
  }
  return formatted;
}

/** Get today in Jalali and Gregorian */
export function getTodayJalali() {
  const now = new Date();
  const iso = now.toISOString().slice(0, 10);
  const [gy, gm, gd] = iso.split("-").map(Number);
  const { jy, jm, jd } = toJalaali(gy, gm, gd);
  return {
    gregorian: iso,
    jalali: `${jy}/${String(jm).padStart(2, "0")}/${String(jd).padStart(2, "0")}`,
    jy,
    jm,
    jd,
    formatted: formatJalaliDate(iso, { withWeekday: true }),
  };
}

/** Format time e.g. "07:30" to Persian digits "۰۷:۳۰" */
export function formatPersianTime(timeStr: string | null | undefined): string {
  if (!timeStr) return "—";
  const clean = timeStr.slice(0, 5);
  return toPersianDigits(clean);
}

/** Generate calendar days for a given Jalali month (year, month 1-12) */
export function getJalaliMonthCalendar(jy: number, jm: number) {
  const length = jalaaliMonthLength(jy, jm);
  const days: {
    jalaliDate: string;
    gregorianDate: string;
    dayOfMonth: number;
    weekdayIndex: number; // 0=Sat, 1=Sun, ..., 6=Fri
    isFriday: boolean;
  }[] = [];

  for (let d = 1; d <= length; d++) {
    const { gy, gm, gd } = toGregorian(jy, jm, d);
    const gregStr = `${gy}-${String(gm).padStart(2, "0")}-${String(gd).padStart(2, "0")}`;
    const dateObj = new Date(Date.UTC(gy, gm - 1, gd));
    // JS: 0=Sun, 1=Mon, ..., 6=Sat.
    // In Persian calendar, week starts on Saturday:
    // Sat=6 -> 0, Sun=0 -> 1, Mon=1 -> 2, Tue=2 -> 3, Wed=3 -> 4, Thu=4 -> 5, Fri=5 -> 6
    const jsDay = dateObj.getUTCDay();
    const persianWeekday = jsDay === 6 ? 0 : jsDay + 1;

    days.push({
      jalaliDate: `${jy}/${String(jm).padStart(2, "0")}/${String(d).padStart(2, "0")}`,
      gregorianDate: gregStr,
      dayOfMonth: d,
      weekdayIndex: persianWeekday,
      isFriday: persianWeekday === 6,
    });
  }

  // First day of month offset
  const firstDayOffset = days[0]?.weekdayIndex ?? 0;

  return {
    jy,
    jm,
    monthName: PERSIAN_MONTH_NAMES[jm - 1],
    length,
    firstDayOffset,
    days,
  };
}
