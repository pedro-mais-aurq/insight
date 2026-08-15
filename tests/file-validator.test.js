import { describe, expect, it } from "vitest";
import { UPLOAD_CONFIG } from "../src/config/upload.config.js";
import {
  UPLOAD_ERROR_CODES,
  validateFile,
  validateFiles
} from "../src/upload/file-validator.js";

function modelFile(name, size = 1024, type = "application/octet-stream") {
  return { name, size, type };
}

describe("validateFile", () => {
  it.each([
    ["peca.stl", "stl"],
    ["peca.obj", "obj"],
    ["peca.3mf", "3mf"],
    ["peca.final.STL", "stl"]
  ])("aceita %s e normaliza a extensão", (name, extension) => {
    expect(validateFile(modelFile(name))).toEqual({
      valid: true,
      normalized: {
        originalName: name,
        extension,
        mimeType: "application/octet-stream",
        sizeBytes: 1024
      },
      error: null
    });
  });

  it("aceita MIME vazio sem usá-lo como prova de validade", () => {
    const result = validateFile(modelFile("peca.obj", 200, ""));

    expect(result.valid).toBe(true);
    expect(result.normalized.mimeType).toBeNull();
  });

  it.each([
    [modelFile("vazio.stl", 0), UPLOAD_ERROR_CODES.EMPTY_FILE],
    [modelFile("sem-extensao", 10), UPLOAD_ERROR_CODES.INVALID_EXTENSION],
    [modelFile("arquivo.exe", 10), UPLOAD_ERROR_CODES.INVALID_EXTENSION],
    [modelFile("", 10), UPLOAD_ERROR_CODES.INVALID_FILE_NAME]
  ])("rejeita metadata inválida", (file, code) => {
    expect(validateFile(file).error.code).toBe(code);
  });

  it.each([
    [50_000_000, true, null],
    [50_000_001, false, UPLOAD_ERROR_CODES.FILE_TOO_LARGE]
  ])("aplica o limite decimal em %s bytes", (size, valid, code) => {
    const result = validateFile(modelFile("grande.3mf", size), UPLOAD_CONFIG);
    expect(result.valid).toBe(valid);
    expect(result.error?.code ?? null).toBe(code);
  });

  it("aplica um limite somente quando ele é configurado", () => {
    const result = validateFile(modelFile("peca.stl", 101), {
      ...UPLOAD_CONFIG,
      maxFileSizeBytes: 100
    });

    expect(result.error.code).toBe(UPLOAD_ERROR_CODES.FILE_TOO_LARGE);
  });
});

describe("validateFiles", () => {
  it("rejeita seleção vazia", () => {
    expect(validateFiles([]).error.code).toBe(UPLOAD_ERROR_CODES.NO_FILE);
  });

  it("rejeita mais de um arquivo", () => {
    const result = validateFiles([
      modelFile("um.stl"),
      modelFile("dois.obj")
    ]);

    expect(result.error.code).toBe(UPLOAD_ERROR_CODES.TOO_MANY_FILES);
  });
});
