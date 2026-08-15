export const CLEANUP_POLICY = Object.freeze({
  abandonedAfterHours: 24,
  uploadedRetentionDays: 7,
  removedRetentionDays: 30,
  batchSize: 100
});

export const CLEANUP_ACTIONS = Object.freeze({
  KEEP: "keep",
  REMOVE_ABANDONED: "remove_abandoned",
  EXPIRE_BINARY: "expire_binary",
  HARD_DELETE: "hard_delete"
});

export function classifyCleanupAction(upload: Record<string, unknown>, now: Date) {
  const nowMs = now.getTime();

  if (!Number.isFinite(nowMs)) {
    throw new TypeError("now inválido");
  }

  if (["pending", "uploading", "failed"].includes(String(upload.upload_status))) {
    return isOlderThan(
      upload.updated_at,
      nowMs,
      hours(CLEANUP_POLICY.abandonedAfterHours)
    )
      ? CLEANUP_ACTIONS.REMOVE_ABANDONED
      : CLEANUP_ACTIONS.KEEP;
  }

  if (upload.upload_status === "uploaded") {
    return isOlderThan(
      upload.uploaded_at,
      nowMs,
      days(CLEANUP_POLICY.uploadedRetentionDays)
    )
      ? CLEANUP_ACTIONS.EXPIRE_BINARY
      : CLEANUP_ACTIONS.KEEP;
  }

  if (upload.upload_status === "removed") {
    return isOlderThan(
      upload.removed_at,
      nowMs,
      days(CLEANUP_POLICY.removedRetentionDays)
    )
      ? CLEANUP_ACTIONS.HARD_DELETE
      : CLEANUP_ACTIONS.KEEP;
  }

  return CLEANUP_ACTIONS.KEEP;
}

function isOlderThan(value: unknown, nowMs: number, durationMs: number) {
  const timestamp = typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isFinite(timestamp) && nowMs - timestamp > durationMs;
}

function hours(value: number) {
  return value * 60 * 60 * 1000;
}

function days(value: number) {
  return hours(value * 24);
}
