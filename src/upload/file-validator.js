import { UPLOAD_CONFIG } from "../config/upload.config.js";

export const UPLOAD_ERROR_CODES = Object.freeze({
  NO_FILE: "NO_FILE",
  TOO_MANY_FILES: "TOO_MANY_FILES",
  INVALID_FILE_NAME: "INVALID_FILE_NAME",
  INVALID_EXTENSION: "INVALID_EXTENSION",
  EMPTY_FILE: "EMPTY_FILE",
  FILE_TOO_LARGE: "FILE_TOO_LARGE",
  REQUEST_FAILED: "REQUEST_FAILED",
  UPLOAD_FAILED: "UPLOAD_FAILED",
  UPLOAD_CANCELLED: "UPLOAD_CANCELLED",
  COMPLETE_FAILED: "COMPLETE_FAILED",
  OBJECT_NOT_FOUND: "OBJECT_NOT_FOUND",
  SIZE_MISMATCH: "SIZE_MISMATCH",
  UPLOAD_REMOVED: "UPLOAD_REMOVED",
  UPLOAD_STATE_INVALID: "UPLOAD_STATE_INVALID",
  UPLOAD_NOT_FOUND: "UPLOAD_NOT_FOUND",
  RATE_LIMITED: "RATE_LIMITED",
  REMOVE_FAILED: "REMOVE_FAILED"
});

export function extractFileExtension(fileName) {
  if (typeof fileName !== "string") {
    return null;
  }

  const normalizedName = fileName.trim();
  const lastDotIndex = normalizedName.lastIndexOf(".");

  if (lastDotIndex <= 0 || lastDotIndex === normalizedName.length - 1) {
    return null;
  }

  return normalizedName.slice(lastDotIndex + 1).toLowerCase();
}

export function validateFile(file, config = UPLOAD_CONFIG) {
  if (!file) {
    return invalidResult(UPLOAD_ERROR_CODES.NO_FILE);
  }

  if (typeof file.name !== "string" || file.name.trim().length === 0) {
    return invalidResult(UPLOAD_ERROR_CODES.INVALID_FILE_NAME);
  }

  const originalName = file.name.trim();
  const extension = extractFileExtension(originalName);

  if (!extension || !config.allowedExtensions.includes(extension)) {
    return invalidResult(UPLOAD_ERROR_CODES.INVALID_EXTENSION);
  }

  if (!Number.isFinite(file.size) || file.size <= 0) {
    return invalidResult(UPLOAD_ERROR_CODES.EMPTY_FILE);
  }

  if (
    config.maxFileSizeBytes !== null
    && file.size > config.maxFileSizeBytes
  ) {
    return invalidResult(UPLOAD_ERROR_CODES.FILE_TOO_LARGE);
  }

  return {
    valid: true,
    normalized: {
      originalName,
      extension,
      mimeType: normalizeMimeType(file.type),
      sizeBytes: file.size
    },
    error: null
  };
}

export function validateFiles(files, config = UPLOAD_CONFIG) {
  const normalizedFiles = files ? Array.from(files) : [];

  if (normalizedFiles.length === 0) {
    return invalidResult(UPLOAD_ERROR_CODES.NO_FILE);
  }

  if (normalizedFiles.length > config.maxFiles) {
    return invalidResult(UPLOAD_ERROR_CODES.TOO_MANY_FILES);
  }

  return validateFile(normalizedFiles[0], config);
}

function normalizeMimeType(mimeType) {
  if (typeof mimeType !== "string") {
    return null;
  }

  const normalizedMimeType = mimeType.trim();
  return normalizedMimeType.length > 0 ? normalizedMimeType : null;
}

function invalidResult(code) {
  return {
    valid: false,
    normalized: null,
    error: { code }
  };
}
