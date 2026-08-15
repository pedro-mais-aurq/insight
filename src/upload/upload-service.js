import { UPLOAD_CONFIG } from "../config/upload.config.js";
import { classifyCompleteError } from "./complete-error-classifier.js";
import { UPLOAD_ERROR_CODES } from "./file-validator.js";

export class UploadServiceError extends Error {
  constructor(code, options = {}) {
    const {
      uploadId = null,
      storagePath = null,
      confirmationPending = false,
      ...errorOptions
    } = options;

    super(code, errorOptions);
    this.name = "UploadServiceError";
    this.code = code;
    this.uploadId = uploadId;
    this.storagePath = storagePath;
    this.confirmationPending = confirmationPending;
  }
}

export function createUploadService({ getClient, config = UPLOAD_CONFIG }) {
  if (typeof getClient !== "function") {
    throw new TypeError("getClient deve ser uma função.");
  }

  async function uploadModel(file, metadata, { onCreated } = {}) {
    const client = getClient();
    const createdUpload = await createModelUpload(client, metadata, config);

    onCreated?.({
      uploadId: createdUpload.uploadId,
      storagePath: createdUpload.storagePath
    });

    try {
      await uploadFile(client, createdUpload, file, metadata, config);
    } catch (error) {
      await bestEffortCleanup(client, createdUpload.uploadId);
      throw new UploadServiceError(UPLOAD_ERROR_CODES.UPLOAD_FAILED, {
        cause: error,
        uploadId: createdUpload.uploadId,
        storagePath: createdUpload.storagePath
      });
    }

    await completeUploadWithClient(client, createdUpload.uploadId, {
      storagePath: createdUpload.storagePath
    });

    return {
      uploadId: createdUpload.uploadId,
      storagePath: createdUpload.storagePath
    };
  }

  async function completeUpload(uploadId) {
    let client;

    try {
      client = getClient();
    } catch (error) {
      throw createCompleteError(error, uploadId);
    }

    return completeUploadWithClient(client, uploadId);
  }

  async function removeUpload(uploadId) {
    const client = getClient();

    await invokeFunction(
      client,
      "remove-model-upload",
      { uploadId },
      UPLOAD_ERROR_CODES.REMOVE_FAILED
    );
  }

  return Object.freeze({
    uploadModel,
    completeUpload,
    removeUpload
  });
}

async function createModelUpload(client, metadata, config) {
  const createdUpload = await invokeFunction(
    client,
    "create-model-upload",
    metadata,
    UPLOAD_ERROR_CODES.REQUEST_FAILED
  );

  assertCreateResponse(createdUpload, config);
  return createdUpload;
}

async function uploadFile(client, createdUpload, file, metadata, config) {
  const { error: uploadError } = await client.storage
    .from(config.bucketName)
    .uploadToSignedUrl(
      createdUpload.storagePath,
      createdUpload.signedUpload.token,
      file,
      {
        contentType: metadata.mimeType ?? "application/octet-stream"
      }
    );

  if (uploadError) {
    throw new UploadServiceError(UPLOAD_ERROR_CODES.UPLOAD_FAILED, {
      cause: uploadError,
      uploadId: createdUpload.uploadId,
      storagePath: createdUpload.storagePath
    });
  }
}

async function completeUploadWithClient(client, uploadId, context = {}) {
  try {
    const completedUpload = await invokeFunction(
      client,
      "complete-model-upload",
      { uploadId },
      UPLOAD_ERROR_CODES.COMPLETE_FAILED
    );

    assertCompleteResponse(completedUpload, uploadId);
    return completedUpload;
  } catch (error) {
    throw createCompleteError(error, uploadId, context.storagePath);
  }
}

async function invokeFunction(client, functionName, body, fallbackCode) {
  let response;

  try {
    response = await client.functions.invoke(functionName, { body });
  } catch (error) {
    throw new UploadServiceError(fallbackCode, { cause: error });
  }

  if (response.error) {
    throw await toFunctionError(response.error, fallbackCode);
  }

  if (response.data?.error?.code) {
    throw new UploadServiceError(response.data.error.code);
  }

  return response.data;
}

async function toFunctionError(error, fallbackCode) {
  try {
    const body = await error.context?.json();
    const code = body?.error?.code;

    if (typeof code === "string" && code.length > 0) {
      return new UploadServiceError(code, { cause: error });
    }
  } catch {
    // A resposta de infraestrutura pode não conter JSON estruturado.
  }

  return new UploadServiceError(fallbackCode, { cause: error });
}

function assertCreateResponse(response, config) {
  const valid = response
    && typeof response.uploadId === "string"
    && response.uploadId.length > 0
    && response.bucket === config.bucketName
    && typeof response.storagePath === "string"
    && response.storagePath.length > 0
    && response.signedUpload
    && response.signedUpload.path === response.storagePath
    && typeof response.signedUpload.token === "string"
    && response.signedUpload.token.length > 0;

  if (!valid) {
    throw new UploadServiceError(UPLOAD_ERROR_CODES.REQUEST_FAILED);
  }
}

function assertCompleteResponse(response, uploadId) {
  if (
    response?.uploadId !== uploadId
    || response?.uploadStatus !== "uploaded"
  ) {
    throw new UploadServiceError(UPLOAD_ERROR_CODES.COMPLETE_FAILED, {
      uploadId
    });
  }
}

async function bestEffortCleanup(client, uploadId) {
  try {
    await invokeFunction(
      client,
      "remove-model-upload",
      { uploadId },
      UPLOAD_ERROR_CODES.REMOVE_FAILED
    );
  } catch {
    // A limpeza de uploads abandonados também é tratada como decisão operacional futura.
  }
}

function createCompleteError(error, uploadId, storagePath = null) {
  const classification = classifyCompleteError(error?.code);

  return new UploadServiceError(classification.code, {
    cause: error,
    uploadId,
    storagePath,
    confirmationPending: classification.confirmationPending
  });
}
