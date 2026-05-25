import { Elysia } from "elysia";
import { betterAuthMiddleware } from "./middleware";
import { nodesEdgesRouter } from "./nodes-edges";
import { treesRouter } from "./trees";

export const routes = new Elysia({ prefix: "/api" })
  .use(betterAuthMiddleware)
  .use(treesRouter)
  .use(nodesEdgesRouter);
