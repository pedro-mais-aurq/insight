import { describe, expect, it, vi } from "vitest";
import { removeAndMarkUpload } from "../supabase/functions/_shared/cleanup-upload.ts";

const upload = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  extension: "stl",
  storage_bucket: "model-uploads",
  storage_path: "550e8400-e29b-41d4-a716-446655440000/model.stl",
  upload_status: "uploading",
  error_code: null
};

function createClient({ objects = [], removeError = null } = {}) {
  const remove = vi.fn().mockResolvedValue({ error: removeError });
  const bucket = {
    list: vi.fn().mockResolvedValue({ data: objects, error: null }),
    remove
  };
  const maybeSingle = vi.fn().mockResolvedValue({
    data: { id: upload.id },
    error: null
  });
  const query = {
    eq: vi.fn(() => query),
    select: vi.fn(() => query),
    maybeSingle
  };
  const update = vi.fn(() => query);
  const client = {
    storage: { from: vi.fn(() => bucket) },
    from: vi.fn(() => ({ update }))
  };

  return { client, bucket, remove, update };
}

describe("cleanup de objeto e metadata", () => {
  it("converge para removed quando o objeto já não existe", async () => {
    const test = createClient();
    const now = new Date("2026-08-15T12:00:00.000Z");

    await expect(removeAndMarkUpload(
      test.client,
      upload,
      now,
      upload.error_code
    )).resolves.toBe(true);

    expect(test.bucket.list).toHaveBeenCalledOnce();
    expect(test.remove).not.toHaveBeenCalled();
    expect(test.update).toHaveBeenCalledWith({
      upload_status: "removed",
      removed_at: now.toISOString(),
      error_code: null
    });
  });

  it("não marca removed quando a remoção física falha", async () => {
    const test = createClient({
      objects: [{ name: "model.stl" }],
      removeError: new Error("storage")
    });

    await expect(removeAndMarkUpload(
      test.client,
      upload,
      new Date("2026-08-15T12:00:00.000Z"),
      null
    )).resolves.toBe(false);

    expect(test.remove).toHaveBeenCalledOnce();
    expect(test.update).not.toHaveBeenCalled();
  });
});
