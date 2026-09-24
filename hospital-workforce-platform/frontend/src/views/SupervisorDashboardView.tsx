"use client";

import { AppShell } from "../components/AppShell";
import { SupervisorDashboard } from "../modules/dashboard/SupervisorDashboard";

export default function SupervisorDashboardView() {
  return (
    <AppShell>
      <SupervisorDashboard />
    </AppShell>
  );
}
