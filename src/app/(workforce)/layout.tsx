import type { ReactNode } from "react";
import WorkforceLayout from "@hwdt/frontend/views/WorkforceLayout";

export default function Layout({ children }: { children: ReactNode }) {
  return <WorkforceLayout>{children}</WorkforceLayout>;
}
