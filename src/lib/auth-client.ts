import {
  adminClient,
  anonymousClient,
  usernameClient,
  phoneNumberClient,
  emailOTPClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/svelte";

export const authClient = createAuthClient({
  plugins: [
    adminClient(),
    anonymousClient(),
    usernameClient(),
    phoneNumberClient(),
    emailOTPClient(),
    // organizationClient({ teams: { enabled: true } }),
    // genericOAuthClient(),
  ],
});
