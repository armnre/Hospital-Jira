"use client";

import { AppShell } from "../components/AppShell";
import { ScheduleCalendar } from "../modules/schedule/ScheduleCalendar";

export default function ScheduleView() {
  return (
    <AppShell>
      <ScheduleCalendar />
    </AppShell>
  );
}
