import { UPLOAD_STATES } from "../state/upload-state.js";
import { isDefinitiveCompleteError } from "./complete-error-classifier.js";
import { UPLOAD_ERROR_CODES } from "./file-validator.js";

const ERROR_MESSAGES = Object.freeze({
  [UPLOAD_ERROR_CODES.NO_FILE]: "Selecione um arquivo para continuar.",
  [UPLOAD_ERROR_CODES.TOO_MANY_FILES]: "Envie apenas um arquivo por vez.",
  [UPLOAD_ERROR_CODES.INVALID_FILE_NAME]: "O arquivo precisa possuir um nome válido.",
  [UPLOAD_ERROR_CODES.INVALID_EXTENSION]: "Formato não suportado. Envie um arquivo STL, 3MF ou OBJ.",
  [UPLOAD_ERROR_CODES.EMPTY_FILE]: "O arquivo está vazio e não pode ser enviado.",
  [UPLOAD_ERROR_CODES.FILE_TOO_LARGE]: "O arquivo excede o limite máximo permitido.",
  [UPLOAD_ERROR_CODES.REQUEST_FAILED]: "Não foi possível iniciar o envio. Tente novamente.",
  [UPLOAD_ERROR_CODES.UPLOAD_FAILED]: "Não foi possível enviar o arquivo. Tente novamente.",
  [UPLOAD_ERROR_CODES.UPLOAD_CANCELLED]: "O envio foi cancelado.",
  [UPLOAD_ERROR_CODES.COMPLETE_FAILED]: "O arquivo foi enviado, mas não foi possível confirmar o estado final. Tente confirmar novamente.",
  [UPLOAD_ERROR_CODES.OBJECT_NOT_FOUND]: "O arquivo não foi encontrado no armazenamento. Faça um novo envio.",
  [UPLOAD_ERROR_CODES.SIZE_MISMATCH]: "O arquivo armazenado não corresponde ao tamanho esperado. Faça um novo envio.",
  [UPLOAD_ERROR_CODES.UPLOAD_REMOVED]: "Este envio já foi removido. Faça um novo envio.",
  [UPLOAD_ERROR_CODES.UPLOAD_STATE_INVALID]: "Este envio não pode ser confirmado no estado atual. Faça um novo envio.",
  [UPLOAD_ERROR_CODES.UPLOAD_NOT_FOUND]: "O registro deste envio não foi encontrado. Faça um novo envio.",
  [UPLOAD_ERROR_CODES.RATE_LIMITED]: "Muitas solicitações foram feitas. Aguarde antes de tentar novamente.",
  [UPLOAD_ERROR_CODES.REMOVE_FAILED]: "Não foi possível remover o arquivo. Tente novamente."
});

export function createUploadView(root, config) {
  const elements = getElements(root);
  let bound = false;
  let dragDepth = 0;

  elements.input.accept = config.acceptAttribute;
  elements.limits.textContent = `Arraste STL, 3MF ou OBJ · até ${formatDecimalMegabytes(config.maxFileSizeBytes)}`;

  function bind(callbacks) {
    if (bound) {
      return;
    }

    bound = true;

    elements.select.addEventListener("click", () => openFilePicker());
    elements.input.addEventListener("change", () => callbacks.onFiles(elements.input.files));
    elements.remove.addEventListener("click", () => callbacks.onRemove());
    elements.replace.addEventListener("click", () => callbacks.onReplace());
    elements.retry.addEventListener("click", () => callbacks.onRetry());

    elements.dropzone.addEventListener("dragenter", (event) => {
      preventDragDefaults(event);

      if (elements.input.disabled) {
        return;
      }

      dragDepth += 1;
      root.dataset.dragActive = "true";
    });

    elements.dropzone.addEventListener("dragover", (event) => {
      preventDragDefaults(event);

      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "copy";
      }
    });

    elements.dropzone.addEventListener("dragleave", (event) => {
      preventDragDefaults(event);
      dragDepth = Math.max(0, dragDepth - 1);

      if (dragDepth === 0) {
        root.dataset.dragActive = "false";
      }
    });

    elements.dropzone.addEventListener("drop", (event) => {
      preventDragDefaults(event);
      dragDepth = 0;
      root.dataset.dragActive = "false";

      if (!elements.input.disabled) {
        callbacks.onFiles(event.dataTransfer?.files ?? []);
      }
    });
  }

  function render(state) {
    const isIdle = state.status === UPLOAD_STATES.IDLE;
    const isInvalid = state.status === UPLOAD_STATES.INVALID;
    const isUploadError = state.status === UPLOAD_STATES.UPLOAD_ERROR;
    const isUploaded = state.status === UPLOAD_STATES.UPLOADED;
    const isAnalysisError = state.status === UPLOAD_STATES.ANALYSIS_ERROR;
    const isReady = state.status === UPLOAD_STATES.READY;
    const isRetryingConfirmation = isUploadError && state.error?.retrying === true;
    const showsDropzone = isIdle || isInvalid;
    const showsActions = isUploaded || isUploadError || isAnalysisError || isReady;

    root.dataset.uploadState = state.status;
    root.setAttribute(
      "aria-busy",
      String([
        UPLOAD_STATES.VALIDATING,
        UPLOAD_STATES.UPLOADING
      ].includes(state.status) || isRetryingConfirmation)
    );

    renderHeading(elements, state);
    renderMetadata(elements, state);
    renderStatus(elements, state);

    elements.dropzone.hidden = !showsDropzone;
    elements.actions.hidden = !showsActions;
    elements.retry.hidden = !isUploadError;
    elements.retry.textContent = getRetryActionLabel(state.error);
    elements.replace.textContent = getReplaceActionLabel(state);
    setInteractionsDisabled(isRetryingConfirmation || [
      UPLOAD_STATES.VALIDATING,
      UPLOAD_STATES.UPLOADING
    ].includes(state.status));
  }

  function setInteractionsDisabled(disabled) {
    elements.input.disabled = disabled;
    elements.select.disabled = disabled;
    elements.retry.disabled = disabled;
    elements.replace.disabled = disabled;
    elements.remove.disabled = disabled;
  }

  function openFilePicker() {
    if (!elements.input.disabled) {
      elements.input.click();
    }
  }

  function resetInput() {
    elements.input.value = "";
  }

  return Object.freeze({
    bind,
    render,
    setInteractionsDisabled,
    openFilePicker,
    resetInput
  });
}

export function formatFileSize(sizeBytes) {
  if (!Number.isFinite(sizeBytes) || sizeBytes < 0) {
    return "";
  }

  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  const units = ["KB", "MB", "GB", "TB"];
  let value = sizeBytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const rounded = Math.round(value * 10) / 10;
  const formatted = String(rounded).replace(".", ",");

  return `${formatted} ${units[unitIndex]}`;
}

function getElements(root) {
  const selectors = {
    eyebrow: "[data-upload-eyebrow]",
    title: "[data-upload-title]",
    metadata: "[data-upload-file-meta]",
    dropzone: "[data-upload-dropzone]",
    input: "[data-upload-input]",
    select: "[data-upload-select]",
    status: "[data-upload-status]",
    limits: "[data-upload-limits]",
    actions: "[data-upload-actions]",
    retry: "[data-upload-retry]",
    replace: "[data-upload-replace]",
    remove: "[data-upload-remove]"
  };

  return Object.fromEntries(
    Object.entries(selectors).map(([key, selector]) => {
      const element = root.querySelector(selector);

      if (!element) {
        throw new Error(`Elemento obrigatório ausente: ${selector}`);
      }

      return [key, element];
    })
  );
}

function renderHeading(elements, state) {
  if (state.status === UPLOAD_STATES.IDLE) {
    elements.eyebrow.textContent = "Arquivo 3D";
    elements.title.innerHTML = "Solte seu<br>modelo aqui.";
    return;
  }

  const labels = {
    [UPLOAD_STATES.INVALID]: "Arquivo recusado",
    [UPLOAD_STATES.UPLOADING]: "Enviando modelo",
    [UPLOAD_STATES.UPLOADED]: "Modelo anexado",
    [UPLOAD_STATES.UPLOAD_ERROR]: "Falha no envio",
    [UPLOAD_STATES.ANALYZING]: "Analisando modelo",
    [UPLOAD_STATES.READY]: "Modelo analisado",
    [UPLOAD_STATES.ANALYSIS_ERROR]: "Falha na análise"
  };

  elements.eyebrow.textContent = hasPendingConfirmation(state.error)
    ? "Confirmação pendente"
    : labels[state.status] ?? "Modelo selecionado";
  elements.title.textContent = state.originalName ?? "Arquivo sem nome";
}

function renderMetadata(elements, state) {
  const hasMetadata = state.extension && Number.isFinite(state.sizeBytes);

  elements.metadata.hidden = !hasMetadata;
  elements.metadata.textContent = hasMetadata
    ? `${state.extension.toUpperCase()} · ${formatFileSize(state.sizeBytes)}`
    : "";
}

function renderStatus(elements, state) {
  const stateMessages = {
    [UPLOAD_STATES.SELECTED]: "Arquivo selecionado.",
    [UPLOAD_STATES.VALIDATING]: "Validando arquivo…",
    [UPLOAD_STATES.UPLOADING]: "Enviando modelo…",
    [UPLOAD_STATES.UPLOADED]: "Arquivo enviado com sucesso.",
    [UPLOAD_STATES.ANALYZING]: "Análise geométrica em andamento…",
    [UPLOAD_STATES.READY]: "Análise concluída.",
    [UPLOAD_STATES.ANALYSIS_ERROR]: "A análise não pôde ser concluída."
  };

  elements.status.textContent = state.error?.retrying
    ? "Confirmando o envio com o servidor…"
    : state.error?.code
    ? getErrorMessage(state.error.code)
    : stateMessages[state.status] ?? "";
}

export function getErrorMessage(code) {
  return ERROR_MESSAGES[code]
    ?? "Não foi possível concluir a operação. Tente novamente.";
}

export function getRetryActionLabel(error) {
  if (error?.retrying) {
    return "Confirmando…";
  }

  if (hasPendingConfirmation(error)) {
    return "Tentar confirmar novamente";
  }

  return isDefinitiveCompleteError(error?.code)
    ? "Tentar novo envio"
    : "Tentar novamente";
}

export function getReplaceActionLabel(state) {
  return state.status === UPLOAD_STATES.ANALYSIS_ERROR
    && state.error?.retryable === false
    ? "Enviar outro arquivo"
    : "Substituir";
}

function hasPendingConfirmation(error) {
  return error?.confirmationPending === true
    || error?.code === UPLOAD_ERROR_CODES.COMPLETE_FAILED;
}

function preventDragDefaults(event) {
  event.preventDefault();
  event.stopPropagation();
}

function formatDecimalMegabytes(sizeBytes) {
  return Number.isFinite(sizeBytes)
    ? `${sizeBytes / 1_000_000} MB`
    : "limite definido";
}
