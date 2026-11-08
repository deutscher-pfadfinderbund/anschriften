import { toNextJsHandler } from "better-auth/next-js";

import { auth, CALLBACK_PATH, LEGACY_CALLBACK_PATH } from "@/lib/auth";

const handler = toNextJsHandler(auth);

/**
 * Auth request bodies are tiny (a sign-in JSON, a form_post callback), but better-auth
 * buffers whatever arrives before any check runs, for anonymous callers too. Anything above
 * the cap is refused — by its declared length, or while reading when it comes without one
 * (chunked, e.g. forwarded from HTTP/2).
 */
const MAX_BODY_BYTES = 16 * 1024;

async function capBody(request: Request): Promise<Request | null> {
  const declared = request.headers.get("content-length");
  if (declared != null) return Number(declared) <= MAX_BODY_BYTES ? request : null;
  if (!request.body) return request;
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of request.body) {
    size += chunk.byteLength;
    if (size > MAX_BODY_BYTES) return null;
    chunks.push(chunk);
  }
  // From parts: `new Request(request, …)` rejects Next's Request subclass.
  return new Request(request.url, { method: request.method, headers: request.headers, body: Buffer.concat(chunks) });
}

/**
 * The better-auth endpoints the app uses over HTTP; every other one answers 404. An
 * allowlist instead of better-auth's `disabledPaths`, so an endpoint added by a better-auth
 * upgrade stays closed until it is needed (better-auth 1.7 brought e.g. /account-info,
 * which refreshes and stores Keycloak tokens). Server-side `auth.api.*` calls are not HTTP
 * and not affected.
 */
const ALLOWED = new Set(
  ["/sign-in/social", "/get-session", "/sign-out", "/ok", "/error"].map((p) => `/api/auth${p}`).concat(CALLBACK_PATH),
);

/** Allowlist check, after bridging the legacy OAuth callback path (see LEGACY_CALLBACK_PATH). */
function gate(method: (request: Request) => Promise<Response>) {
  return (request: Request) => {
    const url = new URL(request.url);
    if (url.pathname === LEGACY_CALLBACK_PATH) {
      url.pathname = CALLBACK_PATH;
      // better-auth routes by request URL, which a next.config rewrite would leave unchanged.
      request = new Request(url, request);
    }
    if (!ALLOWED.has(url.pathname)) return new Response("Not Found", { status: 404 });
    return method(request);
  };
}

export const GET = gate(handler.GET);
export const POST = gate(async (request) => {
  const capped = await capBody(request);
  return capped ? handler.POST(capped) : new Response("Payload Too Large", { status: 413 });
});
