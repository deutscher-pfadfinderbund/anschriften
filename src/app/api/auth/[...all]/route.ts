import { toNextJsHandler } from "better-auth/next-js";

import { auth, CALLBACK_PATH, LEGACY_CALLBACK_PATH } from "@/lib/auth";

const handler = toNextJsHandler(auth);

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
export const POST = bridged(handler.POST);
