import { MAX_FILE_SIZE_BYTES } from "./constants.ts";

export function isUploadSizeAllowed(sizeBytes: unknown) {
  return Number.isSafeInteger(sizeBytes)
    && Number(sizeBytes) > 0
    && Number(sizeBytes) <= MAX_FILE_SIZE_BYTES;
}
