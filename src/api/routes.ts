import { Elysia } from "elysia";

export const routes = new Elysia({ prefix: "/api" }).get(
  "/hello",
  function hello() {
    return "Hello World!";
  },
);
