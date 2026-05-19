import { auth } from "$lib/server/auth";
import { Elysia } from "elysia";
import { betterAuthView } from "./better-auth";

// user middleware (compute user and session and pass to routes)
export const betterAuthMiddleware = new Elysia({ name: "better-auth" })
  .all("/auth/*", betterAuthView)
  .macro({
    auth: {
      async resolve({ status, request: { headers } }) {
        const session = await auth.api.getSession({
          headers,
        });

        if (!session) return status(401);

        return {
          user: session.user,
          session: session.session,
        };
      },
    },
  });
