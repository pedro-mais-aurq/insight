import { describe, expect, it } from "vitest";
import {
  COMPLETE_UPLOAD_ACTIONS,
  getCompleteUploadAction
} from "../supabase/functions/_shared/upload-status.ts";

describe("getCompleteUploadAction", () => {
  it("retorna sucesso idempotente para registro já uploaded", () => {
    expect(getCompleteUploadAction("uploaded")).toBe(
      COMPLETE_UPLOAD_ACTIONS.RETURN_UPLOADED
    );
  });

  it("exige verificação do objeto antes de concluir uploading", () => {
    expect(getCompleteUploadAction("uploading")).toBe(
      COMPLETE_UPLOAD_ACTIONS.VERIFY_OBJECT
    );
  });

  it.each([
    ["removed", COMPLETE_UPLOAD_ACTIONS.REJECT_REMOVED],
    ["failed", COMPLETE_UPLOAD_ACTIONS.REJECT_INVALID],
    ["pending", COMPLETE_UPLOAD_ACTIONS.REJECT_INVALID],
    [null, COMPLETE_UPLOAD_ACTIONS.REJECT_INVALID]
  ])("não conclui status %s", (status, action) => {
    expect(getCompleteUploadAction(status)).toBe(action);
  });
});
