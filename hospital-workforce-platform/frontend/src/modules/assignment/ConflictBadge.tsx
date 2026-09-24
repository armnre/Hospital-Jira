"use client";

import React from "react";
import type { ConflictValidationResponse } from "../../lib/types";
import { toPersianDigits } from "../../lib/jalali";

export function ConflictBadge({ validation }: { validation: ConflictValidationResponse }) {
  if (validation.valid) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-300">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        فاقد تداخل (واجد شرایط)
      </span>
    );
  }

  return (
    <div className="space-y-1">
      <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-300">
        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
        دارای {toPersianDigits(validation.errors.length)} تداخل / مانع
      </span>
      <ul className="text-[11px] text-rose-600 space-y-0.5">
        {validation.errors.map((err: string, i: number) => (
          <li key={i} className="flex items-start gap-1">
            <span className="text-rose-400 font-bold">•</span>
            <span>{err}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
