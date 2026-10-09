/** A Server Action request that failed before an answer arrived. */
export const NO_ANSWER = "Verbindung zum Server fehlgeschlagen. Bitte versuche es noch einmal.";

/**
 * Await a Server Action from a client component. A failed request (Wi-Fi drop, proxy
 * timeout, server error) throws, and uncaught it reaches the error boundary, which
 * replaces the page and loses the open form. Here it becomes an ordinary failure result
 * that the caller already shows as a toast or a dialog error, with the form intact.
 */
export async function callAction<T extends { ok: true } | { ok: false; message: string }>(
  action: () => Promise<T>,
): Promise<T> {
  try {
    return await action();
  } catch {
    return { ok: false, message: NO_ANSWER } as unknown as T;
  }
}
