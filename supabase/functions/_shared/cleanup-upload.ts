import type { createAdminClient } from "./admin-client.ts";
import { UPLOAD_BUCKET } from "./constants.ts";
import {
  buildStoragePath,
  splitStoragePath
} from "./upload-metadata.ts";

export type CleanupUploadRow = {
  id: string;
  extension: string;
  storage_bucket: string;
  storage_path: string | null;
  upload_status: string;
  error_code: string | null;
};

export async function removeAndMarkUpload(
  supabase: ReturnType<typeof createAdminClient>,
  upload: CleanupUploadRow,
  now: Date,
  errorCode: string | null
) {
  if (upload.storage_path !== null) {
    const expectedPath = buildStoragePath(upload.id, upload.extension);

    if (
      upload.storage_bucket !== UPLOAD_BUCKET
      || upload.storage_path !== expectedPath
    ) {
      return false;
    }

    const pathParts = splitStoragePath(expectedPath);

    if (!pathParts) {
      return false;
    }

    const { data: objects, error: listError } = await supabase.storage
      .from(UPLOAD_BUCKET)
      .list(pathParts.folder, {
        limit: 10,
        search: pathParts.fileName
      });

    if (listError) {
      return false;
    }

    if (objects?.some((object) => object.name === pathParts.fileName)) {
      const { error: removeError } = await supabase.storage
        .from(UPLOAD_BUCKET)
        .remove([expectedPath]);

      if (removeError) {
        return false;
      }
    }
  }

  const { data, error: updateError } = await supabase
    .from("model_uploads")
    .update({
      upload_status: "removed",
      removed_at: now.toISOString(),
      error_code: errorCode
    })
    .eq("id", upload.id)
    .eq("upload_status", upload.upload_status)
    .select("id")
    .maybeSingle();

  return !updateError && Boolean(data);
}
