import { Elysia } from "elysia";
import { betterAuthMiddleware } from "./middleware";

export const routes = new Elysia({ prefix: "/api" }).use(betterAuthMiddleware).get(
  "/hello",
  function hello({ user }) {
    console.log(user);
    return { name: "Hello World!", user };
  },
  { auth: true },
);
