import { env } from "$env/dynamic/private";
import { zenstackAdapter } from "@zenstackhq/better-auth";
import { betterAuth } from "better-auth";
import { admin, anonymous, emailOTP, phoneNumber, username } from "better-auth/plugins";

import { db } from "$lib/server/db";

export const auth = betterAuth({
  database: zenstackAdapter(db, { provider: "postgresql" }),
  // TODO: update user model here first, run pnpx @better-auth/cli generate
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "user",
        input: false, // don't allow user to set role
      },
      lang: {
        type: "string",
        required: false,
        defaultValue: "en",
      },
    },
  },
  emailAndPassword: { enabled: true },
  plugins: [
    // sveltekitCookies(getRequestEvent),
    admin(),
    anonymous(),
    username(),
    phoneNumber({
      sendOTP: ({ phoneNumber, code }, ctx) => {
        // TODO: Implement sending OTP code via SMS
      },
    }),
    emailOTP({
      sendVerificationOTP: async ({ email, otp, type }, ctx) => {
        // TODO: send email OTP to user
      },
    }),
    // organization({
    //   teams: {
    //     enabled: true,
    //     maximumTeams: 10, // Optional: limit teams per organization
    //     allowRemovingAllTeams: false, // Optional: prevent removing the last team
    //   },
    // }),
    // genericOAuth({
    //   config: [
    //     {
    //       providerId: "zitadel",
    //       clientId: "333061723021926659",
    //       discoveryUrl: "http://localhost:8080/.well-known/openid-configuration",
    //       pkce: true,
    //       scopes: ["openid", "email", "profile"],
    //     },
    //   ],
    // }),
  ],
  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    },
  },
  trustedOrigins: ["http://localhost:3000"],
});
