import { describe, expect, it, vi } from "vitest";
import { UPLOAD_CONFIG } from "../src/config/upload.config.js";
import { UPLOAD_ERROR_CODES } from "../src/upload/file-validator.js";
import {
  UploadServiceError,
  createUploadService
} from "../src/upload/upload-service.js";

const uploadId = "550e8400-e29b-41d4-a716-446655440000";
const storagePath = `${uploadId}/model.stl`;
const definitiveCompleteCodes = [
  UPLOAD_ERROR_CODES.OBJECT_NOT_FOUND,
  UPLOAD_ERROR_CODES.SIZE_MISMATCH,
  UPLOAD_ERROR_CODES.UPLOAD_REMOVED,
  UPLOAD_ERROR_CODES.UPLOAD_STATE_INVALID,
  UPLOAD_ERROR_CODES.UPLOAD_NOT_FOUND
];

function createClientMock({
  uploadError = null,
  completeError = null,
  completeThrows = null
} = {}) {
  const invoke = vi.fn(async (name) => {
    if (name === "create-model-upload") {
      return {
        data: {
          uploadId,
          bucket: "model-uploads",
          storagePath,
          signedUpload: { path: storagePath, token: "temporary-token" }
        },
        error: null
      };
    }

    if (name === "complete-model-upload") {
      if (completeThrows) {
        throw completeThrows;
      }

      return completeError
        ? { data: null, error: completeError }
        : { data: { uploadId, uploadStatus: "uploaded" }, error: null };
    }

    return { data: { uploadId, uploadStatus: "removed" }, error: null };
  });
  const uploadToSignedUrl = vi.fn().mockResolvedValue({
    data: uploadError ? null : { path: storagePath },
    error: uploadError
  });
  const from = vi.fn(() => ({ uploadToSignedUrl }));

  return {
    client: {
      functions: { invoke },
      storage: { from }
    },
    invoke,
    from,
    uploadToSignedUrl
  };
}

describe("createUploadService", () => {
  it("envia somente metadata, usa bucket/path do contrato e conclui por uploadId", async () => {
    const mocks = createClientMock();
    const onCreated = vi.fn();
    const service = createUploadService({
      getClient: () => mocks.client,
      config: UPLOAD_CONFIG
    });
    const file = { name: "peca.stl", size: 123, type: "application/octet-stream" };
    const metadata = {
      originalName: "peca.stl",
      extension: "stl",
      mimeType: "application/octet-stream",
      sizeBytes: 123
    };

    await expect(service.uploadModel(file, metadata, { onCreated })).resolves.toEqual({
      uploadId,
      storagePath
    });

    expect(mocks.invoke).toHaveBeenNthCalledWith(1, "create-model-upload", {
      body: metadata
    });
    expect(mocks.from).toHaveBeenCalledWith("model-uploads");
    expect(mocks.uploadToSignedUrl).toHaveBeenCalledWith(
      storagePath,
      "temporary-token",
      file,
      { contentType: "application/octet-stream" }
    );
    expect(mocks.invoke).toHaveBeenNthCalledWith(2, "complete-model-upload", {
      body: { uploadId }
    });
    expect(onCreated).toHaveBeenCalledWith({ uploadId, storagePath });
  });

  it("limpa server-side quando o envio falha", async () => {
    const mocks = createClientMock({ uploadError: new Error("network") });
    const service = createUploadService({ getClient: () => mocks.client });

    await expect(service.uploadModel(
      { name: "peca.stl" },
      {
        originalName: "peca.stl",
        extension: "stl",
        mimeType: null,
        sizeBytes: 123
      }
    )).rejects.toMatchObject({
      name: "UploadServiceError",
      code: UPLOAD_ERROR_CODES.UPLOAD_FAILED
    });

    expect(mocks.invoke).toHaveBeenLastCalledWith("remove-model-upload", {
      body: { uploadId }
    });
    expect(mocks.invoke).not.toHaveBeenCalledWith("complete-model-upload", {
      body: { uploadId }
    });
  });

  it("preserva o contexto e não limpa quando somente a confirmação falha", async () => {
    const completeError = {
      context: {
        json: vi.fn().mockResolvedValue({
          error: { code: UPLOAD_ERROR_CODES.COMPLETE_FAILED }
        })
      }
    };
    const mocks = createClientMock({ completeError });
    const onCreated = vi.fn();
    const service = createUploadService({ getClient: () => mocks.client });

    await expect(service.uploadModel(
      { name: "peca.stl" },
      {
        originalName: "peca.stl",
        extension: "stl",
        mimeType: null,
        sizeBytes: 123
      },
      { onCreated }
    )).rejects.toMatchObject({
      name: "UploadServiceError",
      code: UPLOAD_ERROR_CODES.COMPLETE_FAILED,
      uploadId,
      storagePath,
      confirmationPending: true
    });

    expect(onCreated).toHaveBeenCalledWith({ uploadId, storagePath });
    expect(mocks.uploadToSignedUrl).toHaveBeenCalledOnce();
    expect(mocks.invoke).toHaveBeenCalledWith("complete-model-upload", {
      body: { uploadId }
    });
    expect(mocks.invoke).not.toHaveBeenCalledWith("remove-model-upload", {
      body: { uploadId }
    });
  });

  it("classifica falha de rede no complete como confirmação incerta", async () => {
    const mocks = createClientMock({
      completeThrows: new Error("connection reset")
    });
    const service = createUploadService({ getClient: () => mocks.client });

    await expect(service.uploadModel(
      { name: "peca.stl" },
      {
        originalName: "peca.stl",
        extension: "stl",
        mimeType: null,
        sizeBytes: 123
      }
    )).rejects.toMatchObject({
      code: UPLOAD_ERROR_CODES.COMPLETE_FAILED,
      uploadId,
      storagePath,
      confirmationPending: true
    });

    expect(mocks.invoke).not.toHaveBeenCalledWith("remove-model-upload", {
      body: { uploadId }
    });
  });

  it.each(definitiveCompleteCodes)(
    "preserva o erro definitivo %s sem cleanup nem confirmação pendente",
    async (code) => {
      const completeError = {
        context: {
          json: vi.fn().mockResolvedValue({ error: { code } })
        }
      };
      const mocks = createClientMock({ completeError });
      const service = createUploadService({ getClient: () => mocks.client });

      await expect(service.uploadModel(
        { name: "peca.stl" },
        {
          originalName: "peca.stl",
          extension: "stl",
          mimeType: null,
          sizeBytes: 123
        }
      )).rejects.toMatchObject({
        code,
        uploadId,
        storagePath,
        confirmationPending: false
      });

      expect(mocks.invoke).not.toHaveBeenCalledWith("remove-model-upload", {
        body: { uploadId }
      });
    }
  );

  it("repete somente a confirmação para um upload existente", async () => {
    const mocks = createClientMock();
    const service = createUploadService({ getClient: () => mocks.client });

    await expect(service.completeUpload(uploadId)).resolves.toEqual({
      uploadId,
      uploadStatus: "uploaded"
    });

    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.invoke).toHaveBeenCalledWith("complete-model-upload", {
      body: { uploadId }
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("recusa resposta que tenta trocar o bucket canônico", async () => {
    const mocks = createClientMock();
    mocks.invoke.mockResolvedValueOnce({
      data: {
        uploadId,
        bucket: "public-bucket",
        storagePath,
        signedUpload: { path: storagePath, token: "temporary-token" }
      },
      error: null
    });
    const service = createUploadService({ getClient: () => mocks.client });

    await expect(service.uploadModel({}, {
      originalName: "peca.stl",
      extension: "stl",
      mimeType: null,
      sizeBytes: 123
    })).rejects.toBeInstanceOf(UploadServiceError);

    expect(mocks.uploadToSignedUrl).not.toHaveBeenCalled();
  });

  it("remove por UUID sem aceitar path do browser", async () => {
    const mocks = createClientMock();
    const service = createUploadService({ getClient: () => mocks.client });

    await service.removeUpload(uploadId);

    expect(mocks.invoke).toHaveBeenCalledWith("remove-model-upload", {
      body: { uploadId }
    });
  });
});
