import { describe, expect, it, vi } from "vitest";
import { UPLOAD_STATES } from "../src/state/upload-state.js";
import { createUploadController } from "../src/upload/upload-controller.js";
import { UPLOAD_ERROR_CODES } from "../src/upload/file-validator.js";

const createdUpload = Object.freeze({
  uploadId: "550e8400-e29b-41d4-a716-446655440000",
  storagePath: "550e8400-e29b-41d4-a716-446655440000/model.stl"
});
const definitiveCompleteCodes = [
  UPLOAD_ERROR_CODES.OBJECT_NOT_FOUND,
  UPLOAD_ERROR_CODES.SIZE_MISMATCH,
  UPLOAD_ERROR_CODES.UPLOAD_REMOVED,
  UPLOAD_ERROR_CODES.UPLOAD_STATE_INVALID,
  UPLOAD_ERROR_CODES.UPLOAD_NOT_FOUND
];

function createViewMock() {
  return {
    bind: vi.fn(),
    render: vi.fn(),
    setInteractionsDisabled: vi.fn(),
    openFilePicker: vi.fn(),
    resetInput: vi.fn()
  };
}

function validResult() {
  return {
    valid: true,
    normalized: {
      originalName: "peca.STL",
      extension: "stl",
      mimeType: "application/octet-stream",
      sizeBytes: 2048
    },
    error: null
  };
}

describe("createUploadController", () => {
  it("valida e não chama upload para arquivo inválido", async () => {
    const file = { name: "peca.exe", size: 20, type: "" };
    const validator = vi.fn(() => ({
      valid: false,
      normalized: null,
      error: { code: UPLOAD_ERROR_CODES.INVALID_EXTENSION }
    }));
    const uploadService = {
      uploadModel: vi.fn(),
      removeUpload: vi.fn()
    };
    const view = createViewMock();
    const controller = createUploadController({ validator, uploadService, view });

    controller.init();
    await controller.handleFiles([file]);

    expect(validator).toHaveBeenCalledWith([file]);
    expect(uploadService.uploadModel).not.toHaveBeenCalled();
    expect(controller.getState()).toMatchObject({
      status: UPLOAD_STATES.INVALID,
      error: { code: UPLOAD_ERROR_CODES.INVALID_EXTENSION }
    });
  });

  it("percorre o fluxo de sucesso e guarda UUID/path produzidos pelo servidor", async () => {
    const file = { name: "peca.STL", size: 2048, type: "application/octet-stream" };
    const validator = vi.fn(validResult);
    const uploadService = {
      uploadModel: vi.fn(async (_file, _metadata, { onCreated }) => {
        onCreated({
          uploadId: "550e8400-e29b-41d4-a716-446655440000",
          storagePath: "550e8400-e29b-41d4-a716-446655440000/model.stl"
        });

        return {
          uploadId: "550e8400-e29b-41d4-a716-446655440000",
          storagePath: "550e8400-e29b-41d4-a716-446655440000/model.stl"
        };
      }),
      removeUpload: vi.fn()
    };
    const view = createViewMock();
    const controller = createUploadController({
      validator,
      uploadService,
      view,
      now: () => "2026-08-15T17:00:00.000Z"
    });

    controller.init();
    await controller.handleFiles([file]);

    expect(uploadService.uploadModel).toHaveBeenCalledWith(
      file,
      validResult().normalized,
      expect.objectContaining({ onCreated: expect.any(Function) })
    );
    expect(view.render.mock.calls.map(([state]) => state.status)).toEqual([
      UPLOAD_STATES.IDLE,
      UPLOAD_STATES.SELECTED,
      UPLOAD_STATES.VALIDATING,
      UPLOAD_STATES.UPLOADING,
      UPLOAD_STATES.UPLOADING,
      UPLOAD_STATES.UPLOADED
    ]);
    expect(controller.getState()).toMatchObject({
      id: "550e8400-e29b-41d4-a716-446655440000",
      storagePath: "550e8400-e29b-41d4-a716-446655440000/model.stl",
      status: UPLOAD_STATES.UPLOADED,
      upload: {
        progress: 100,
        startedAt: "2026-08-15T17:00:00.000Z",
        completedAt: "2026-08-15T17:00:00.000Z"
      }
    });
  });

  it("inicia análise somente depois do upload confirmado", async () => {
    const file = { name: "peca.STL", size: 2048, type: "application/octet-stream" };
    const onUploaded = vi.fn();
    const uploadService = {
      uploadModel: vi.fn(async (_file, _metadata, { onCreated }) => {
        onCreated(createdUpload);
        return createdUpload;
      }),
      removeUpload: vi.fn()
    };
    const controller = createUploadController({
      validator: vi.fn(validResult),
      uploadService,
      view: createViewMock(),
      analysisHooks: { onUploaded }
    });

    controller.init();
    await controller.handleFiles([file]);

    expect(onUploaded).toHaveBeenCalledOnce();
    expect(onUploaded).toHaveBeenCalledWith(expect.objectContaining({
      id: createdUpload.uploadId,
      status: UPLOAD_STATES.UPLOADED
    }));
  });

  it("limpa identidade após UPLOAD_FAILED sem apagar o arquivo selecionado", async () => {
    const file = { name: "peca.stl", size: 2048, type: "" };
    const uploadService = {
      uploadModel: vi.fn().mockRejectedValue(Object.assign(new Error("offline"), {
        code: UPLOAD_ERROR_CODES.UPLOAD_FAILED
      })),
      removeUpload: vi.fn()
    };
    const controller = createUploadController({
      validator: vi.fn(validResult),
      uploadService,
      view: createViewMock()
    });

    controller.init();
    await controller.handleFiles([file]);

    expect(controller.getState()).toMatchObject({
      id: null,
      file,
      storagePath: null,
      status: UPLOAD_STATES.UPLOAD_ERROR,
      error: { code: UPLOAD_ERROR_CODES.UPLOAD_FAILED }
    });
  });

  it("preserva identidade e metadata após COMPLETE_FAILED", async () => {
    const file = { name: "peca.stl", size: 2048, type: "" };
    const uploadService = {
      uploadModel: vi.fn(async (_file, _metadata, { onCreated }) => {
        onCreated(createdUpload);
        throw Object.assign(new Error("timeout"), {
          code: UPLOAD_ERROR_CODES.COMPLETE_FAILED,
          ...createdUpload
        });
      }),
      completeUpload: vi.fn(),
      removeUpload: vi.fn()
    };
    const controller = createUploadController({
      validator: vi.fn(validResult),
      uploadService,
      view: createViewMock()
    });

    controller.init();
    await controller.handleFiles([file]);

    expect(controller.getState()).toMatchObject({
      id: createdUpload.uploadId,
      file,
      originalName: "peca.STL",
      extension: "stl",
      mimeType: "application/octet-stream",
      sizeBytes: 2048,
      storagePath: createdUpload.storagePath,
      status: UPLOAD_STATES.UPLOAD_ERROR,
      error: {
        code: UPLOAD_ERROR_CODES.COMPLETE_FAILED,
        confirmationPending: true,
        retrying: false
      }
    });
  });

  it.each(definitiveCompleteCodes)(
    "preserva %s como erro definitivo sem retry de confirmação",
    async (code) => {
      const file = { name: "peca.stl", size: 2048, type: "" };
      const uploadModel = vi.fn(async (_file, _metadata, { onCreated }) => {
        onCreated(createdUpload);
        throw Object.assign(new Error(code), {
          code,
          confirmationPending: false,
          ...createdUpload
        });
      });
      const completeUpload = vi.fn();
      const controller = createUploadController({
        validator: vi.fn(validResult),
        uploadService: {
          uploadModel,
          completeUpload,
          removeUpload: vi.fn()
        },
        view: createViewMock()
      });

      controller.init();
      await controller.handleFiles([file]);

      expect(controller.getState()).toMatchObject({
        id: null,
        file,
        storagePath: null,
        status: UPLOAD_STATES.UPLOAD_ERROR,
        error: {
          code,
          confirmationPending: false,
          retrying: false
        }
      });
      expect(uploadModel).toHaveBeenCalledOnce();
      expect(completeUpload).not.toHaveBeenCalled();
    }
  );

  it("SIZE_MISMATCH só inicia novo upload após ação explícita", async () => {
    const file = { name: "peca.stl", size: 2048, type: "" };
    const uploadModel = vi.fn(async (_file, _metadata, { onCreated }) => {
      onCreated(createdUpload);
      throw Object.assign(new Error("mismatch"), {
        code: UPLOAD_ERROR_CODES.SIZE_MISMATCH,
        confirmationPending: false,
        ...createdUpload
      });
    });
    const completeUpload = vi.fn();
    const controller = createUploadController({
      validator: vi.fn(validResult),
      uploadService: {
        uploadModel,
        completeUpload,
        removeUpload: vi.fn()
      },
      view: createViewMock()
    });

    controller.init();
    await controller.handleFiles([file]);

    expect(uploadModel).toHaveBeenCalledOnce();
    expect(completeUpload).not.toHaveBeenCalled();

    await controller.retryUpload();

    expect(uploadModel).toHaveBeenCalledTimes(2);
    expect(completeUpload).not.toHaveBeenCalled();
  });

  it("retry de COMPLETE_FAILED confirma o mesmo UUID sem novo upload", async () => {
    const file = { name: "peca.stl", size: 2048, type: "" };
    const uploadModel = vi.fn(async (_file, _metadata, { onCreated }) => {
      onCreated(createdUpload);
      throw Object.assign(new Error("resposta perdida"), {
        code: UPLOAD_ERROR_CODES.COMPLETE_FAILED,
        ...createdUpload
      });
    });
    const completeUpload = vi.fn().mockResolvedValue({
      uploadId: createdUpload.uploadId,
      uploadStatus: "uploaded"
    });
    const uploadService = {
      uploadModel,
      completeUpload,
      removeUpload: vi.fn()
    };
    const controller = createUploadController({
      validator: vi.fn(validResult),
      uploadService,
      view: createViewMock()
    });

    controller.init();
    await controller.handleFiles([file]);
    await controller.retryUpload();

    expect(uploadModel).toHaveBeenCalledOnce();
    expect(completeUpload).toHaveBeenCalledOnce();
    expect(completeUpload).toHaveBeenCalledWith(createdUpload.uploadId);
    expect(controller.getState()).toMatchObject({
      id: createdUpload.uploadId,
      storagePath: createdUpload.storagePath,
      status: UPLOAD_STATES.UPLOADED,
      error: null,
      upload: { progress: 100 }
    });
  });

  it("retry de confirmação falho mantém contexto e COMPLETE_FAILED", async () => {
    const file = { name: "peca.stl", size: 2048, type: "" };
    const uploadModel = vi.fn(async (_file, _metadata, { onCreated }) => {
      onCreated(createdUpload);
      throw Object.assign(new Error("timeout"), {
        code: UPLOAD_ERROR_CODES.COMPLETE_FAILED,
        ...createdUpload
      });
    });
    const completeUpload = vi.fn().mockRejectedValue(Object.assign(
      new Error("offline"),
      { code: UPLOAD_ERROR_CODES.COMPLETE_FAILED }
    ));
    const controller = createUploadController({
      validator: vi.fn(validResult),
      uploadService: {
        uploadModel,
        completeUpload,
        removeUpload: vi.fn()
      },
      view: createViewMock()
    });

    controller.init();
    await controller.handleFiles([file]);
    await controller.retryUpload();

    expect(uploadModel).toHaveBeenCalledOnce();
    expect(completeUpload).toHaveBeenCalledOnce();
    expect(controller.getState()).toMatchObject({
      id: createdUpload.uploadId,
      file,
      storagePath: createdUpload.storagePath,
      status: UPLOAD_STATES.UPLOAD_ERROR,
      error: {
        code: UPLOAD_ERROR_CODES.COMPLETE_FAILED,
        confirmationPending: true,
        retrying: false
      }
    });
  });

  it("retry de confirmação que recebe erro definitivo encerra a pendência", async () => {
    const file = { name: "peca.stl", size: 2048, type: "" };
    const uploadModel = vi.fn(async (_file, _metadata, { onCreated }) => {
      onCreated(createdUpload);
      throw Object.assign(new Error("timeout"), {
        code: UPLOAD_ERROR_CODES.COMPLETE_FAILED,
        confirmationPending: true,
        ...createdUpload
      });
    });
    const completeUpload = vi.fn().mockRejectedValue(Object.assign(
      new Error("mismatch"),
      {
        code: UPLOAD_ERROR_CODES.SIZE_MISMATCH,
        confirmationPending: false
      }
    ));
    const controller = createUploadController({
      validator: vi.fn(validResult),
      uploadService: {
        uploadModel,
        completeUpload,
        removeUpload: vi.fn()
      },
      view: createViewMock()
    });

    controller.init();
    await controller.handleFiles([file]);
    await controller.retryUpload();

    expect(uploadModel).toHaveBeenCalledOnce();
    expect(completeUpload).toHaveBeenCalledOnce();
    expect(controller.getState()).toMatchObject({
      id: null,
      file,
      storagePath: null,
      status: UPLOAD_STATES.UPLOAD_ERROR,
      error: {
        code: UPLOAD_ERROR_CODES.SIZE_MISMATCH,
        confirmationPending: false,
        retrying: false
      }
    });
  });

  it("bloqueia confirmações simultâneas do mesmo upload", async () => {
    const file = { name: "peca.stl", size: 2048, type: "" };
    let resolveComplete;
    const uploadModel = vi.fn(async (_file, _metadata, { onCreated }) => {
      onCreated(createdUpload);
      throw Object.assign(new Error("timeout"), {
        code: UPLOAD_ERROR_CODES.COMPLETE_FAILED,
        ...createdUpload
      });
    });
    const completeUpload = vi.fn(() => new Promise((resolve) => {
      resolveComplete = resolve;
    }));
    const controller = createUploadController({
      validator: vi.fn(validResult),
      uploadService: {
        uploadModel,
        completeUpload,
        removeUpload: vi.fn()
      },
      view: createViewMock()
    });

    controller.init();
    await controller.handleFiles([file]);
    const firstRetry = controller.retryUpload();
    const duplicateRetry = controller.retryUpload();

    expect(completeUpload).toHaveBeenCalledOnce();
    resolveComplete({
      uploadId: createdUpload.uploadId,
      uploadStatus: "uploaded"
    });
    await Promise.all([firstRetry, duplicateRetry]);

    expect(controller.getState().status).toBe(UPLOAD_STATES.UPLOADED);
  });

  it("remove manualmente o objeto após COMPLETE_FAILED antes de voltar a idle", async () => {
    const file = { name: "peca.stl", size: 2048, type: "" };
    let resolveRemoval;
    const removeUpload = vi.fn(() => new Promise((resolve) => {
      resolveRemoval = resolve;
    }));
    const uploadService = {
      uploadModel: vi.fn(async (_file, _metadata, { onCreated }) => {
        onCreated(createdUpload);
        throw Object.assign(new Error("timeout"), {
          code: UPLOAD_ERROR_CODES.COMPLETE_FAILED,
          ...createdUpload
        });
      }),
      completeUpload: vi.fn(),
      removeUpload
    };
    const controller = createUploadController({
      validator: vi.fn(validResult),
      uploadService,
      view: createViewMock()
    });

    controller.init();
    await controller.handleFiles([file]);
    const removal = controller.removeCurrent();

    expect(removeUpload).toHaveBeenCalledWith(createdUpload.uploadId);
    expect(controller.getState().status).toBe(UPLOAD_STATES.UPLOAD_ERROR);
    resolveRemoval();
    await removal;

    expect(controller.getState().status).toBe(UPLOAD_STATES.IDLE);
  });

  it("remove no servidor e retorna a idle", async () => {
    const file = { name: "peca.stl", size: 2048, type: "" };
    const uploadService = {
      uploadModel: vi.fn(async (_file, _metadata, { onCreated }) => {
        const uploaded = {
          uploadId: "550e8400-e29b-41d4-a716-446655440000",
          storagePath: "550e8400-e29b-41d4-a716-446655440000/model.stl"
        };
        onCreated(uploaded);
        return uploaded;
      }),
      removeUpload: vi.fn().mockResolvedValue(undefined)
    };
    const controller = createUploadController({
      validator: vi.fn(validResult),
      uploadService,
      view: createViewMock()
    });

    controller.init();
    await controller.handleFiles([file]);
    await controller.removeCurrent();

    expect(uploadService.removeUpload).toHaveBeenCalledWith(
      "550e8400-e29b-41d4-a716-446655440000"
    );
    expect(controller.getState().status).toBe(UPLOAD_STATES.IDLE);
  });
});
