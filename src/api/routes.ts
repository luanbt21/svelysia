import { Elysia } from "elysia";
import { betterAuthView } from "./better-auth";

export const routes = new Elysia({ prefix: "/api" })
  .all("/api/auth/*", betterAuthView)
  .get("/hello", function hello() {
    return "Hello World!";
  });
