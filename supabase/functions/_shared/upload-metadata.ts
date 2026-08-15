import {
  ALLOWED_EXTENSIONS,
  MAX_FILE_SIZE_BYTES,
  type AllowedExtension
} from "./constants.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type NormalizedUploadMetadata = {
  originalName: string;
  extension: AllowedExtension;
  mimeType: string | null;
  sizeBytes: number;
};

export type UploadMetadataValidation =
  | { valid: true; value: NormalizedUploadMetadata; error: null }
  | { valid: false; value: null; error: { code: string } };

export function validateUploadMetadata(input: unknown): UploadMetadataValidation {
  if (!isRecord(input)) {
    return invalid("INVALID_REQUEST");
  }

  if (typeof input.originalName !== "string" || input.originalName.trim().length === 0) {
    return invalid("INVALID_FILE_NAME");
  }

  if (typeof input.extension !== "string") {
    return invalid("INVALID_EXTENSION");
  }

  const originalName = input.originalName.trim();
  const derivedExtension = extractExtension(originalName);
  const receivedExtension = input.extension.trim().toLowerCase();

  if (
    !derivedExtension
    || !isAllowedExtension(derivedExtension)
    || receivedExtension !== derivedExtension
  ) {
    return invalid("INVALID_EXTENSION");
  }

  if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes <= 0) {
    return invalid("EMPTY_FILE");
  }

  if (input.sizeBytes > MAX_FILE_SIZE_BYTES) {
    return invalid("FILE_TOO_LARGE");
  }

  const mimeType = normalizeMimeType(input.mimeType);

  if (mimeType === undefined) {
    return invalid("INVALID_MIME_TYPE");
  }

  return {
    valid: true,
    value: {
      originalName,
      extension: derivedExtension,
      mimeType,
      sizeBytes: input.sizeBytes
    },
    error: null
  };
}

export function extractExtension(fileName: string): string | null {
  const normalizedName = fileName.trim();
  const lastDotIndex = normalizedName.lastIndexOf(".");

  if (lastDotIndex <= 0 || lastDotIndex === normalizedName.length - 1) {
    return null;
  }

  return normalizedName.slice(lastDotIndex + 1).toLowerCase();
}

export function isValidUploadId(uploadId: unknown): uploadId is string {
  return typeof uploadId === "string" && UUID_PATTERN.test(uploadId);
}

export function buildStoragePath(uploadId: string, extension: string): string {
  if (!isValidUploadId(uploadId) || !isAllowedExtension(extension)) {
    throw new Error("INVALID_STORAGE_PATH_INPUT");
  }

  return `${uploadId}/model.${extension}`;
}

export function splitStoragePath(storagePath: string) {
  const separatorIndex = storagePath.lastIndexOf("/");

  if (separatorIndex <= 0 || separatorIndex === storagePath.length - 1) {
    return null;
  }

  return {
    folder: storagePath.slice(0, separatorIndex),
    fileName: storagePath.slice(separatorIndex + 1)
  };
}

function isAllowedExtension(extension: string): extension is AllowedExtension {
  return (ALLOWED_EXTENSIONS as readonly string[]).includes(extension);
}

function normalizeMimeType(mimeType: unknown): string | null | undefined {
  if (mimeType === null || mimeType === undefined || mimeType === "") {
    return null;
  }

  if (typeof mimeType !== "string") {
    return undefined;
  }

  const normalizedMimeType = mimeType.trim();
  return normalizedMimeType.length > 0 ? normalizedMimeType : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalid(code: string): UploadMetadataValidation {
  return {
    valid: false,
    value: null,
    error: { code }
  };
}
