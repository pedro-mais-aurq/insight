import fs from "node:fs";
import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(new URL("../supabase/migrations/20260906220000_p5_manufacturing_estimation.sql", import.meta.url), "utf8").toLowerCase();
const hardeningMigration = fs.readFileSync(new URL("../supabase/migrations/20260907114500_p5_manufacturing_hardening_r4.sql", import.meta.url), "utf8").toLowerCase();
const config = fs.readFileSync(new URL("../supabase/config.toml", import.meta.url), "utf8").toLowerCase();
const dockerfile = fs.readFileSync(new URL("../services/slicer-worker/Dockerfile", import.meta.url), "utf8");
const startFunction = fs.readFileSync(new URL("../supabase/functions/start-manufacturing-estimate/index.ts", import.meta.url), "utf8");

describe("P5 manufacturing SQL e container", () => {
  it("separa perfis técnicos e resultados do pricing", () => {
    expect(migration).toContain("create table public.manufacturing_profiles");
    expect(migration).toContain("create table public.manufacturing_estimates");
    expect(migration).toContain("profile_fingerprint");
    expect(migration).toContain("orientation_policy");
    expect(migration).toContain("support_policy");
    expect(migration).toContain("failed_at timestamptz");
    expect(migration).toContain("warnings jsonb");
    expect(migration).not.toContain("target_margin_rate");
    expect(migration).not.toContain("filament_price_per_kg");
  });

  it("mantém tabelas privadas e claim idempotente com recuperação stale", () => {
    expect(migration).toContain("force row level security");
    expect(migration).toContain("revoke all on table public.manufacturing_profiles from public, anon, authenticated");
    expect(migration).toContain("cache_key text not null unique");
    expect(migration).toContain("interval '10 minutes'");
    expect(migration).toContain("for update");
    expect(migration).toContain("create or replace function public.activate_manufacturing_profile");
    expect(migration).toContain("'slicer_timeout'");
  });

  it("adiciona profile virtual sem reescrever o profile real ou o histórico", () => {
    expect(hardeningMigration).toContain("'insight-estimation-a1m-pla-020-v1'");
    expect(hardeningMigration).toContain("'baseprofilekey', 'insight-a1m-pla-020-v1'");
    expect(hardeningMigration).toContain("'virtualbuildvolumemm'");
    expect(hardeningMigration).toContain("'x', 2000, 'y', 2000, 'z', 2000");
    expect(hardeningMigration).toContain("false");
    expect(hardeningMigration).not.toMatch(/update\s+public\.manufacturing_estimates/);
    expect(hardeningMigration).not.toMatch(/delete\s+from\s+public\.manufacturing/);
  });

  it("configura background task e as duas funções públicas", () => {
    expect(config).toMatch(/\[edge_runtime\]\s+policy = "per_worker"/);
    expect(config).toMatch(/\[functions\.start-manufacturing-estimate\]\s+verify_jwt = false/);
    expect(config).toMatch(/\[functions\.get-manufacturing-estimate\]\s+verify_jwt = false/);
  });

  it("carrega a análise e usa unidade autoritativa antes do dispatch", () => {
    expect(startFunction).toContain('.from("model_analyses")');
    expect(startFunction).toContain("resolveAuthoritativeManufacturingUnit(analysis)");
    expect(startFunction).toContain("exceedsEstimationBuildVolume(authoritativeUnit.dimensionsMm)");
    expect(startFunction).not.toContain("sourceUnit: input.sourceUnit");
    expect(startFunction).not.toContain("unitScale: input.unitScale");
  });

  it("pina release, checksum, base e usuário não-root", () => {
    expect(dockerfile).toContain("ORCA_VERSION=2.4.2");
    expect(dockerfile).toContain("UBUNTU_SNAPSHOT=20260707T120000Z");
    expect(dockerfile).toContain("d12fb8c8eac1aecd2dfb6377acd48f994f8fa439ed5292fa532dd82880f029fd");
    expect(dockerfile).toMatch(/^FROM ubuntu:24\.04@sha256:[0-9a-f]{64}/m);
    expect(dockerfile).toContain("USER 10001:10001");
    expect(dockerfile).toContain("PROFILE_KEY=insight-estimation-a1m-pla-020-v1");
    expect(dockerfile).toContain("SLICER_TIMEOUT_MS=105000");
    expect(dockerfile).toContain("SLICER_MAX_CONCURRENT=1");
    expect(dockerfile).toContain("MAX_WEIGHT_GRAMS=100000");
    expect(dockerfile).toContain("MAX_PRINT_TIME_SECONDS=36000000");
    expect(dockerfile).toContain("node /build/scripts/flatten-presets.js");
    expect(dockerfile).toContain("test/orca-smoke.js");
  });
});
