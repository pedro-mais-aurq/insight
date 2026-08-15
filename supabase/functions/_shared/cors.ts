import { corsHeaders as supabaseCorsHeaders } from "npm:@supabase/supabase-js@2.112.3/cors";

const LOCAL_DEVELOPMENT_ORIGINS = Object.freeze([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://pedro-mais-aurq.github.io"
]);

const BASE_CORS_HEADERS = Object.freeze({
  "Access-Control-Allow-Headers": supabaseCorsHeaders["Access-Control-Allow-Headers"],
  "Access-Control-Allow-Methods": "POST, OPTIONS"
});

export function isOriginAllowed(request: Request) {
  const origin = request.headers.get("Origin");
  return origin === null || getAllowedOrigins().has(origin);
}

export function handlePreflight(request: Request) {
  if (request.method !== "OPTIONS") {
    return null;
  }

  if (!isOriginAllowed(request)) {
    return new Response(null, { status: 403 });
  }

  return new Response(null, {
    status: 204,
    headers: corsHeadersFor(request)
  });
}

export function jsonResponse(request: Request, body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      ...corsHeadersFor(request),
      "Content-Type": "application/json"
    }
  });
}

export function errorResponse(
  request: Request,
  code: string,
  status: number,
  additionalHeaders: Record<string, string> = {}
) {
  const response = jsonResponse(request, { error: { code } }, status);

  for (const [name, value] of Object.entries(additionalHeaders)) {
    response.headers.set(name, value);
  }

  return response;
}

function corsHeadersFor(request: Request): Record<string, string> {
  const origin = request.headers.get("Origin");
  const headers: Record<string, string> = { ...BASE_CORS_HEADERS };

  if (origin && getAllowedOrigins().has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers.Vary = "Origin";
  }

  return headers;
}

function getAllowedOrigins() {
  const configuredOrigins = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return new Set([
    ...LOCAL_DEVELOPMENT_ORIGINS,
    ...configuredOrigins
  ]);
}
