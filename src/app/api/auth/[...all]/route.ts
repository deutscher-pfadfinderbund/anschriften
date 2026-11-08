import { toNextJsHandler } from "better-auth/next-js";

import { auth, CALLBACK_PATH, LEGACY_CALLBACK_PATH } from "@/lib/auth";

const { GET: authGET, POST } = toNextJsHandler(auth);

export { POST };

/** Bridges the legacy OAuth callback path (see LEGACY_CALLBACK_PATH); better-auth routes by request URL. */
export function GET(request: Request) {
  const url = new URL(request.url);
  if (url.pathname !== LEGACY_CALLBACK_PATH) return authGET(request);
  url.pathname = CALLBACK_PATH;
  return authGET(new Request(url, request));
}
