import { getSupabaseClient } from "../lib/supabase.js";
import {
  MANUFACTURING_ERROR_CODES,
  ManufacturingClientError
} from "./manufacturing-errors.js";

const KNOWN_CODES = new Set(Object.values(MANUFACTURING_ERROR_CODES));

export function createManufacturingClient({ getClient = getSupabaseClient } = {}) {
  if (typeof getClient !== "function") throw new TypeError("getClient deve ser uma função.");

  async function startEstimate(input) {
    const data = await invoke(getClient(), "start-manufacturing-estimate", input);
    if (
      typeof data?.estimateId !== "string"
      || !["pending", "processing", "completed"].includes(data.estimateStatus)
      || !Number.isSafeInteger(data.pollAfterMs)
      || data.pollAfterMs < 250
      || data.pollAfterMs > 10_000
    ) {
      throw failure();
    }
    return Object.freeze(data);
  }

  async function getEstimate(estimateId) {
    const data = await invoke(getClient(), "get-manufacturing-estimate", { estimateId });
    if (data?.estimateId !== estimateId || !["pending", "processing", "completed", "failed"].includes(data.estimateStatus)) {
      throw failure();
    }
    if (data.estimateStatus === "completed") assertCompleted(data);
    return Object.freeze(data);
  }

  return Object.freeze({ startEstimate, getEstimate });
}

async function invoke(client, name, body) {
  let response;
  try {
    response = await client.functions.invoke(name, { body });
  } catch (error) {
    throw failure(error);
  }
  if (response.error) throw await toFunctionError(response.error);
  if (response.data?.error?.code) throw new ManufacturingClientError(normalizeCode(response.data.error.code));
  return response.data;
}

function assertCompleted(value) {
  if (
    typeof value.weightGrams !== "number"
    || !Number.isFinite(value.weightGrams)
    || value.weightGrams <= 0
    || !Number.isSafeInteger(value.printTimeSeconds)
    || value.printTimeSeconds <= 0
    || typeof value.profile?.label !== "string"
  ) {
    throw failure();
  }
}

async function toFunctionError(error) {
  try {
    const body = await error.context?.json();
    if (typeof body?.error?.code === "string") {
      return new ManufacturingClientError(normalizeCode(body.error.code), { cause: error });
    }
  } catch {
    // A infraestrutura pode responder sem corpo JSON.
  }
  return failure(error);
}

function normalizeCode(code) {
  return KNOWN_CODES.has(code) ? code : MANUFACTURING_ERROR_CODES.MANUFACTURING_ESTIMATION_FAILED;
}

function failure(cause) {
  return new ManufacturingClientError(
    MANUFACTURING_ERROR_CODES.MANUFACTURING_ESTIMATION_FAILED,
    cause ? { cause } : {}
  );
}
