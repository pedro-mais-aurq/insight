export function createDownloadUrlPolicy(hostsValue) {
  const hosts = new Set(String(hostsValue ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean));

  if (hosts.size === 0) throw new Error("MODEL_DOWNLOAD_HOSTS_REQUIRED");

  return function assertAllowedDownloadUrl(value) {
    let url;
    try {
      url = new URL(value);
    } catch {
      throw new Error("MODEL_URL_INVALID");
    }

    if (url.protocol !== "https:" || url.username || url.password || !hosts.has(url.hostname.toLowerCase())) {
      throw new Error("MODEL_URL_NOT_ALLOWED");
    }
    if (url.port && url.port !== "443") throw new Error("MODEL_URL_NOT_ALLOWED");
    return url;
  };
}
