import { createAdminClient } from "../_shared/admin-client.ts";
import { CLEANUP_POLICY } from "../_shared/cleanup-policy.ts";
import {
  removeAndMarkUpload,
  type CleanupUploadRow
} from "../_shared/cleanup-upload.ts";

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return error("METHOD_NOT_ALLOWED", 405);
  }

  const configuredSecret = Deno.env.get("INSIGHT_CLEANUP_SECRET");
  const receivedSecret = request.headers.get("x-insight-cleanup-secret");

  if (!configuredSecret || !receivedSecret || !constantTimeEqual(
    configuredSecret,
    receivedSecret
  )) {
    return error("CLEANUP_UNAUTHORIZED", 401);
  }

  let supabase;

  try {
    supabase = createAdminClient();
  } catch {
    return error("CLEANUP_FAILED", 500);
  }

  const now = new Date();
  const abandonedBefore = new Date(
    now.getTime() - CLEANUP_POLICY.abandonedAfterHours * 60 * 60 * 1000
  ).toISOString();
  const uploadedBefore = new Date(
    now.getTime() - CLEANUP_POLICY.uploadedRetentionDays * 24 * 60 * 60 * 1000
  ).toISOString();
  const removedBefore = new Date(
    now.getTime() - CLEANUP_POLICY.removedRetentionDays * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: abandoned, error: abandonedError } = await supabase
    .from("model_uploads")
    .select("id, extension, storage_bucket, storage_path, upload_status, error_code")
    .in("upload_status", ["pending", "uploading", "failed"])
    .lt("updated_at", abandonedBefore)
    .order("updated_at", { ascending: true })
    .limit(CLEANUP_POLICY.batchSize);

  const { data: expired, error: expiredError } = await supabase
    .from("model_uploads")
    .select("id, extension, storage_bucket, storage_path, upload_status, error_code")
    .eq("upload_status", "uploaded")
    .lt("uploaded_at", uploadedBefore)
    .order("uploaded_at", { ascending: true })
    .limit(CLEANUP_POLICY.batchSize);

  const { data: removed, error: removedError } = await supabase
    .from("model_uploads")
    .select("id")
    .eq("upload_status", "removed")
    .lt("removed_at", removedBefore)
    .order("removed_at", { ascending: true })
    .limit(CLEANUP_POLICY.batchSize);

  if (abandonedError || expiredError || removedError) {
    return error("CLEANUP_QUERY_FAILED", 500);
  }

  let abandonedRemoved = 0;
  let binariesExpired = 0;
  let cleanupFailures = 0;

  for (const upload of (abandoned ?? []) as CleanupUploadRow[]) {
    if (await removeAndMarkUpload(supabase, upload, now, upload.error_code)) {
      abandonedRemoved += 1;
    } else {
      cleanupFailures += 1;
    }
  }

  for (const upload of (expired ?? []) as CleanupUploadRow[]) {
    if (await removeAndMarkUpload(supabase, upload, now, "RETENTION_EXPIRED")) {
      binariesExpired += 1;
    } else {
      cleanupFailures += 1;
    }
  }

  const removedIds = (removed ?? []).map((upload) => upload.id);
  let metadataDeleted = 0;

  if (removedIds.length > 0) {
    const { error: deleteError, count } = await supabase
      .from("model_uploads")
      .delete({ count: "exact" })
      .in("id", removedIds);

    if (deleteError) {
      return error("CLEANUP_DELETE_FAILED", 500);
    }

    metadataDeleted = count ?? removedIds.length;
  }

  const rateLimitBefore = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    .toISOString();
  const { error: rateLimitCleanupError } = await supabase
    .from("insight_rate_limits")
    .delete()
    .lt("window_started_at", rateLimitBefore);

  if (rateLimitCleanupError) {
    return error("CLEANUP_RATE_LIMIT_FAILED", 500);
  }

  if (cleanupFailures > 0) {
    console.error(JSON.stringify({
      event: "cleanup-model-uploads",
      errorCode: "CLEANUP_PARTIAL_FAILED",
      cleanupFailures
    }));
    return error("CLEANUP_PARTIAL_FAILED", 500);
  }

  return Response.json({
    abandonedRemoved,
    binariesExpired,
    metadataDeleted
  });
});

function constantTimeEqual(first: string, second: string) {
  const firstBytes = new TextEncoder().encode(first);
  const secondBytes = new TextEncoder().encode(second);
  let difference = firstBytes.length ^ secondBytes.length;
  const length = Math.max(firstBytes.length, secondBytes.length);

  for (let index = 0; index < length; index += 1) {
    difference |= (firstBytes[index] ?? 0) ^ (secondBytes[index] ?? 0);
  }

  return difference === 0;
}

function error(code: string, status: number) {
  return Response.json({ error: { code } }, { status });
}
