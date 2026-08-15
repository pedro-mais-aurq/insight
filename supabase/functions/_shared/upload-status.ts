export const COMPLETE_UPLOAD_ACTIONS = Object.freeze({
  RETURN_UPLOADED: "return_uploaded",
  VERIFY_OBJECT: "verify_object",
  REJECT_REMOVED: "reject_removed",
  REJECT_INVALID: "reject_invalid"
} as const);

export function getCompleteUploadAction(uploadStatus: unknown) {
  if (uploadStatus === "uploaded") {
    return COMPLETE_UPLOAD_ACTIONS.RETURN_UPLOADED;
  }

  if (uploadStatus === "uploading") {
    return COMPLETE_UPLOAD_ACTIONS.VERIFY_OBJECT;
  }

  if (uploadStatus === "removed") {
    return COMPLETE_UPLOAD_ACTIONS.REJECT_REMOVED;
  }

  return COMPLETE_UPLOAD_ACTIONS.REJECT_INVALID;
}
