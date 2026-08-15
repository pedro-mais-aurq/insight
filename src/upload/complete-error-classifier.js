import { UPLOAD_ERROR_CODES } from "./file-validator.js";

export const DEFINITIVE_COMPLETE_ERROR_CODES = Object.freeze([
  UPLOAD_ERROR_CODES.OBJECT_NOT_FOUND,
  UPLOAD_ERROR_CODES.SIZE_MISMATCH,
  UPLOAD_ERROR_CODES.UPLOAD_REMOVED,
  UPLOAD_ERROR_CODES.UPLOAD_STATE_INVALID,
  UPLOAD_ERROR_CODES.UPLOAD_NOT_FOUND
]);

const DEFINITIVE_COMPLETE_ERRORS = new Set(DEFINITIVE_COMPLETE_ERROR_CODES);

export function isDefinitiveCompleteError(code) {
  return DEFINITIVE_COMPLETE_ERRORS.has(code);
}

export function classifyCompleteError(code) {
  if (isDefinitiveCompleteError(code)) {
    return {
      code,
      confirmationPending: false
    };
  }

  return {
    code: UPLOAD_ERROR_CODES.COMPLETE_FAILED,
    confirmationPending: true
  };
}
