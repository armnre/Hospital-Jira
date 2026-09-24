import type { Metadata } from "next";
import type { ReactNode } from "react";
import WorkforceLayout from "../views/WorkforceLayout";
import "./globals.css";

export const metadata: Metadata = { title: "HWDT Workforce Twin", description: "Employee Digital Twin & Credential Management" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body className="bg-slate-50 text-slate-900 antialiased">
        <WorkforceLayout>{children}</WorkforceLayout>
      </body>
    </html>
  );
}
