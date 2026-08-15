import { describe, expect, it } from "vitest";
import { UPLOAD_CONFIG } from "../src/config/upload.config.js";

describe("UPLOAD_CONFIG", () => {
  it("define o bucket privado preparado para os modelos", () => {
    expect(UPLOAD_CONFIG.bucketName).toBe("model-uploads");
  });

  it("aceita exatamente STL, 3MF e OBJ", () => {
    expect(UPLOAD_CONFIG.allowedExtensions).toEqual(["stl", "3mf", "obj"]);
  });

  it("limita o fluxo a um arquivo de até 50 MB decimais", () => {
    expect(UPLOAD_CONFIG.maxFiles).toBe(1);
    expect(UPLOAD_CONFIG.maxFileSizeBytes).toBe(50_000_000);
  });
});
