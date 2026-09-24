"use client";

import { AppShell } from "../components/AppShell";
import { AvailabilityManager } from "../modules/availability/AvailabilityManager";

export default function AvailabilityView() {
  return (
    <AppShell>
      <AvailabilityManager />
    </AppShell>
  );
}
