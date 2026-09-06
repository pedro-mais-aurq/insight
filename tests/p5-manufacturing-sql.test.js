import fs from "node:fs";
import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(new URL("../supabase/migrations/20260906220000_p5_manufacturing_estimation.sql", import.meta.url), "utf8").toLowerCase();
const config = fs.readFileSync(new URL("../supabase/config.toml", import.meta.url), "utf8").toLowerCase();
const dockerfile = fs.readFileSync(new URL("../services/slicer-worker/Dockerfile", import.meta.url), "utf8");

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

  it("configura background task e as duas funções públicas", () => {
    expect(config).toMatch(/\[edge_runtime\]\s+policy = "per_worker"/);
    expect(config).toMatch(/\[functions\.start-manufacturing-estimate\]\s+verify_jwt = false/);
    expect(config).toMatch(/\[functions\.get-manufacturing-estimate\]\s+verify_jwt = false/);
  });

  it("pina release, checksum, base e usuário não-root", () => {
    expect(dockerfile).toContain("ORCA_VERSION=2.4.2");
    expect(dockerfile).toContain("UBUNTU_SNAPSHOT=20260707T120000Z");
    expect(dockerfile).toContain("d12fb8c8eac1aecd2dfb6377acd48f994f8fa439ed5292fa532dd82880f029fd");
    expect(dockerfile).toMatch(/^FROM ubuntu:24\.04@sha256:[0-9a-f]{64}/m);
    expect(dockerfile).toContain("USER 10001:10001");
    expect(dockerfile).toContain("SLICER_TIMEOUT_MS=90000");
    expect(dockerfile).toContain("SLICER_MAX_CONCURRENT=1");
    expect(dockerfile).toContain("node /build/scripts/flatten-presets.js");
    expect(dockerfile).toContain("test/orca-smoke.js");
  });
});
