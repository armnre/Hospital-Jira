import { toJalaali, toGregorian } from "jalaali-js";

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

export const PERSIAN_WEEKDAY_NAMES = [
  "یکشنبه",
  "دوشنبه",
  "سه‌شنبه",
  "چهارشنبه",
  "پنج‌شنبه",
  "جمعه",
  "شنبه",
] as const;

/** Convert Arabic/English numerals to Persian digits */
export function toPersianDigits(input: string | number): string {
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
  const weekday = PERSIAN_WEEKDAY_NAMES[d.getUTCDay()];

  const dayStr = options.withPersianDigits !== false ? toPersianDigits(jd) : String(jd);
  const yearStr = options.withPersianDigits !== false ? toPersianDigits(jy) : String(jy);

  let formatted = `${dayStr} ${monthName} ${yearStr}`;
  if (options.withWeekday) {
    formatted = `${weekday}، ${formatted}`;
  }
  return formatted;
}

/** Get today's Jalali date */
export function todayJalali(now: Date = new Date()): string {
  const gy = now.getUTCFullYear();
  const gm = now.getUTCMonth() + 1;
  const gd = now.getUTCDate();
  const { jy, jm, jd } = toJalaali(gy, gm, gd);
  return `${jy}/${String(jm).padStart(2, "0")}/${String(jd).padStart(2, "0")}`;
}
