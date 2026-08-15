import { describe, expect, it } from "vitest";
import {
  extractClientIp,
  hashClientIp,
  isValidIp
} from "../supabase/functions/_shared/request-identity.ts";

describe("identidade server-side de rate limit", () => {
  it("usa o primeiro IP válido de X-Forwarded-For", () => {
    const headers = new Headers({
      "x-forwarded-for": "inválido, 187.123.45.67, 10.0.0.1",
      "x-real-ip": "192.168.0.1"
    });
    expect(extractClientIp(headers)).toBe("187.123.45.67");
  });

  it("usa X-Real-IP como fallback", () => {
    expect(extractClientIp(new Headers({
      "x-real-ip": "2001:db8::1"
    }))).toBe("2001:db8::1");
  });

  it("recusa candidatos IPv4 e IPv6 malformados", () => {
    expect(isValidIp("999.1.1.1")).toBe(false);
    expect(isValidIp(":::")).toBe(false);
    expect(isValidIp("1:2:3:4:5:6:7:8:9")).toBe(false);
    expect(isValidIp("not-an-ip")).toBe(false);
  });

  it("gera hash estável sem retornar IP bruto", async () => {
    const salt = "salt-server-side-com-mais-de-16-caracteres";
    const first = await hashClientIp("187.123.45.67", salt);
    const repeated = await hashClientIp("187.123.45.67", salt);
    const other = await hashClientIp("187.123.45.68", salt);

    expect(first).toBe(repeated);
    expect(first).not.toBe(other);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(first).not.toContain("187.123.45.67");
  });
});
