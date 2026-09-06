import { createWriteStream } from "node:fs";
import { once } from "node:events";

export async function downloadModel({
  url,
  destination,
  assertAllowedUrl,
  maxBytes = 50_000_000,
  timeoutMs = 30_000,
  fetchImpl = fetch
}) {
  let currentUrl = assertAllowedUrl(url);

  for (let redirect = 0; redirect <= 3; redirect += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response;

    try {
      response = await fetchImpl(currentUrl, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: { "User-Agent": "Insight-Slicer-Worker/1.0" }
      });
    } finally {
      clearTimeout(timeout);
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location || redirect === 3) throw new Error("MODEL_DOWNLOAD_REDIRECT_INVALID");
      currentUrl = assertAllowedUrl(new URL(location, currentUrl).href);
      continue;
    }

    if (!response.ok || !response.body) throw new Error("MODEL_DOWNLOAD_FAILED");
    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      throw new Error("MODEL_TOO_LARGE");
    }

    const output = createWriteStream(destination, { flags: "wx", mode: 0o600 });
    let received = 0;
    try {
      for await (const chunk of response.body) {
        received += chunk.byteLength;
        if (received > maxBytes) throw new Error("MODEL_TOO_LARGE");
        if (!output.write(chunk)) await once(output, "drain");
      }
      output.end();
      await once(output, "close");
    } catch (error) {
      output.destroy();
      throw error;
    }

    if (received === 0) throw new Error("MODEL_EMPTY");
    return { bytes: received };
  }

  throw new Error("MODEL_DOWNLOAD_FAILED");
}
