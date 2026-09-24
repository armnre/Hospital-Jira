"use client";

import { AppShell } from "../components/AppShell";
import { ShiftList } from "../modules/shift/ShiftList";

export default function ShiftsView() {
  return (
    <AppShell>
      <ShiftList />
    </AppShell>
  );
}
