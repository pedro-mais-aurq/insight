import fs from "node:fs";
import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  new URL("../supabase/migrations/20260905203000_p4_pricing_engine.sql", import.meta.url),
  "utf8"
).toLowerCase();

const config = fs.readFileSync(
  new URL("../supabase/config.toml", import.meta.url),
  "utf8"
).toLowerCase();

describe("P4 pricing SQL hardening", () => {
  it("cria perfil numérico privado com RLS e trigger de atualização", () => {
    expect(migration).toContain("create table public.pricing_profiles");
    expect(migration).toContain("numeric(12,4)");
    expect(migration).not.toMatch(/\bfloat\b|\breal\b|double precision/);
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("force row level security");
    expect(migration).toContain("revoke all on table public.pricing_profiles from public, anon, authenticated");
    expect(migration).not.toContain("create policy");
    expect(migration).toContain("create trigger pricing_profiles_set_updated_at");
  });

  it("semeia os parâmetros observados na planilha", () => {
    expect(migration).toMatch(/90\.0000[\s\S]*0\.9000[\s\S]*0\.060000/);
    expect(migration).toMatch(/3000\.00[\s\S]*5000\.00/);
    expect(migration).toMatch(/0\.4000[\s\S]*4\.0000[\s\S]*0\.650000[\s\S]*0\.050000/);
  });

  it("estende o rate limit no banco e configura a função pública", () => {
    expect((migration.match(/'estimate-model-price'/g) ?? [])).toHaveLength(2);
    expect(config).toContain("[functions.estimate-model-price]");
    expect(config).toMatch(/\[functions\.estimate-model-price\]\s+verify_jwt = false/);
  });
});
