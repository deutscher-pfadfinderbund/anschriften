import { toNextJsHandler } from "better-auth/next-js";

import { auth, CALLBACK_PATH, LEGACY_CALLBACK_PATH } from "@/lib/auth";

const handler = toNextJsHandler(auth);

/**
 * Auth request bodies are tiny (a sign-in or sign-out JSON, a form_post callback), but
 * better-auth buffers whatever arrives before any check runs, for anonymous callers too.
 * Anything larger is refused here, also when it comes chunked without a Content-Length.
 */
const MAX_BODY_BYTES = 16 * 1024;

async function capBody(request: Request): Promise<Request | Response> {
  const tooLarge = () => new Response("Payload Too Large", { status: 413 });
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return tooLarge();
  if (!request.body) return request;
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = request.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      return tooLarge();
    }
    chunks.push(value);
  }
  // From parts: `new Request(request, …)` rejects Next's Request subclass.
  return new Request(request.url, { method: request.method, headers: request.headers, body: Buffer.concat(chunks) });
}

/** Bridges the legacy OAuth callback path (see LEGACY_CALLBACK_PATH); better-auth routes by request URL. */
function bridged(method: (request: Request) => Promise<Response>) {
  return (request: Request) => {
    const url = new URL(request.url);
    if (url.pathname !== LEGACY_CALLBACK_PATH) return method(request);
    url.pathname = CALLBACK_PATH;
    return method(new Request(url, request));
  };
}

export const GET = bridged(handler.GET);
export const POST = bridged(async (request) => {
  const capped = await capBody(request);
  return capped instanceof Response ? capped : handler.POST(capped);
});
