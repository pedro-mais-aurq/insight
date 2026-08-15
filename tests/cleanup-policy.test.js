import { describe, expect, it } from "vitest";
import {
  CLEANUP_ACTIONS,
  classifyCleanupAction
} from "../supabase/functions/_shared/cleanup-policy.ts";

const now = new Date("2026-08-15T12:00:00.000Z");

function ago({ hours = 0, days = 0 }) {
  return new Date(
    now.getTime() - (hours + days * 24) * 60 * 60 * 1000
  ).toISOString();
}

describe("política de cleanup", () => {
  it.each([
    [{ upload_status: "uploading", updated_at: ago({ hours: 23 }) }, CLEANUP_ACTIONS.KEEP],
    [{ upload_status: "uploading", updated_at: ago({ hours: 25 }) }, CLEANUP_ACTIONS.REMOVE_ABANDONED],
    [{ upload_status: "uploaded", uploaded_at: ago({ days: 6 }) }, CLEANUP_ACTIONS.KEEP],
    [{ upload_status: "uploaded", uploaded_at: ago({ days: 8 }) }, CLEANUP_ACTIONS.EXPIRE_BINARY],
    [{ upload_status: "removed", removed_at: ago({ days: 29 }) }, CLEANUP_ACTIONS.KEEP],
    [{ upload_status: "removed", removed_at: ago({ days: 31 }) }, CLEANUP_ACTIONS.HARD_DELETE]
  ])("classifica retenção corretamente", (upload, action) => {
    expect(classifyCleanupAction(upload, now)).toBe(action);
  });
});
