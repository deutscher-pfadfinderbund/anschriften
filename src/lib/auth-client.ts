import { createAuthClient } from "better-auth/react";

// better-auth 1.7 serves generic OAuth providers through the social sign-in API, so
// the client needs no plugin.
export const authClient = createAuthClient();
