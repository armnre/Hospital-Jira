"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "../lib/auth";

/** Root layout for all Phase 1 routes: provides JWT session state. */
export default function WorkforceLayout({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
