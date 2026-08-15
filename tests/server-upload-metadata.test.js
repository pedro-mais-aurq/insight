import { describe, expect, it } from "vitest";
import {
  buildStoragePath,
  extractExtension,
  isValidUploadId,
  splitStoragePath,
  validateUploadMetadata
} from "../supabase/functions/_shared/upload-metadata.ts";

const uploadId = "550e8400-e29b-41d4-a716-446655440000";

describe("metadata server-side", () => {
  it("normaliza extensão e preserva metadata válida", () => {
    expect(validateUploadMetadata({
      originalName: " peca.final.STL ",
      extension: "STL",
      mimeType: "application/octet-stream",
      sizeBytes: 4096
    })).toEqual({
      valid: true,
      value: {
        originalName: "peca.final.STL",
        extension: "stl",
        mimeType: "application/octet-stream",
        sizeBytes: 4096
      },
      error: null
    });
  });

  it("rejeita divergência entre nome e extensão declarada", () => {
    const result = validateUploadMetadata({
      originalName: "malware.exe",
      extension: "stl",
      mimeType: null,
      sizeBytes: 100
    });

    expect(result).toMatchObject({
      valid: false,
      error: { code: "INVALID_EXTENSION" }
    });
  });

  it.each([
    [{ originalName: "vazio.stl", extension: "stl", sizeBytes: 0 }, "EMPTY_FILE"],
    [{ originalName: "peca.obj", extension: "obj", sizeBytes: 1.2 }, "EMPTY_FILE"],
    [{ originalName: "peca.3mf", extension: "3mf", sizeBytes: 10, mimeType: 42 }, "INVALID_MIME_TYPE"]
  ])("rejeita request inválido", (payload, code) => {
    expect(validateUploadMetadata(payload).error.code).toBe(code);
  });

  it.each([
    [50_000_000, true, null],
    [50_000_001, false, "FILE_TOO_LARGE"]
  ])("aplica o limite server-side em %s bytes", (sizeBytes, valid, code) => {
    const result = validateUploadMetadata({
      originalName: "peca.stl",
      extension: "stl",
      mimeType: null,
      sizeBytes
    });

    expect(result.valid).toBe(valid);
    expect(result.error?.code ?? null).toBe(code);
  });
});

describe("path server-side", () => {
  it("gera o path canônico sem usar o nome original", () => {
    expect(buildStoragePath(uploadId, "obj")).toBe(`${uploadId}/model.obj`);
  });

  it("separa pasta e objeto para consulta no Storage", () => {
    expect(splitStoragePath(`${uploadId}/model.3mf`)).toEqual({
      folder: uploadId,
      fileName: "model.3mf"
    });
  });

  it("valida UUIDs e extensão extraída", () => {
    expect(isValidUploadId(uploadId)).toBe(true);
    expect(isValidUploadId("../../../arquivo")).toBe(false);
    expect(extractExtension("peca.final.OBJ")).toBe("obj");
  });
});
