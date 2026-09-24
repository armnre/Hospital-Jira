import { integer, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";

/** One execution of the Phase 0 validation suite. */
export const validationRuns = pgTable("validation_runs", {
  id: serial("id").primaryKey(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  status: varchar("status", { length: 20 }).notNull().default("running"),
  passed: integer("passed").notNull().default(0),
  failed: integer("failed").notNull().default(0),
  blocked: integer("blocked").notNull().default(0),
  environment: text("environment").notNull().default(""),
  triggeredBy: varchar("triggered_by", { length: 60 }).notNull().default("control-center"),
});

/** Individual test result inside a validation run. */
export const validationResults = pgTable("validation_results", {
  id: serial("id").primaryKey(),
  runId: integer("run_id")
    .notNull()
    .references(() => validationRuns.id, { onDelete: "cascade" }),
  category: varchar("category", { length: 40 }).notNull(),
  testId: varchar("test_id", { length: 20 }).notNull(),
  name: text("name").notNull(),
  status: varchar("status", { length: 20 }).notNull(),
  durationMs: integer("duration_ms").notNull().default(0),
  details: text("details").notNull().default(""),
  evidence: text("evidence").notNull().default(""),
  position: integer("position").notNull().default(0),
});

export type ValidationRun = typeof validationRuns.$inferSelect;
export type ValidationResult = typeof validationResults.$inferSelect;
