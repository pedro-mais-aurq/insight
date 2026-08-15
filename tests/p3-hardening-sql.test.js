import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationUrl = new URL(
  "../supabase/migrations/20260815190000_p3_analysis_and_hardening.sql",
  import.meta.url
);
const cronUrl = new URL(
  "../supabase/schedules/setup-cleanup-cron.sql",
  import.meta.url
);

describe("hardening SQL da P3", () => {
  it("bloqueia dados legados acima de 50 MB antes de criar a constraint", async () => {
    const sql = await readFile(migrationUrl, "utf8");
    const guardPosition = sql.indexOf("where size_bytes > 50000000");
    const constraintPosition = sql.indexOf("add constraint model_uploads_size_bytes_max");

    expect(guardPosition).toBeGreaterThan(-1);
    expect(constraintPosition).toBeGreaterThan(guardPosition);
    expect(sql).toContain("Resolve legacy rows before adding model_uploads_size_bytes_max");
    expect(sql).not.toMatch(/delete\s+from\s+public\.model_uploads/i);
  });

  it("instala pg_cron no próprio schema e mantém pg_net em extensions", async () => {
    const sql = await readFile(cronUrl, "utf8");

    expect(sql).toContain("create extension if not exists pg_cron;");
    expect(sql).not.toContain("pg_cron with schema extensions");
    expect(sql).toContain("create extension if not exists pg_net with schema extensions;");
    expect(sql).toContain("'0 * * * *'");
  });
});
