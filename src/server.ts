import { fromTypes, openapi } from "@elysiajs/openapi";
import { opentelemetry } from "@elysiajs/opentelemetry";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-node";
import { Elysia } from "elysia";

import { env } from "$lib/server/env";
import { logger, traceExporter } from "$lib/server/logger";
import { routes } from "./api/routes";
import { getSvelteHandler } from "./api/setup";

if (!env.ENABLE_TRACING) {
  logger.info("Tracing is disabled");
}
logger.info("Starting application");

const app = new Elysia();

const svelteHandler = await getSvelteHandler();
if (svelteHandler) {
  logger.info("🚀 SvelteKit handler mounted.");
  app.mount("/", svelteHandler.fetch);
} else {
  logger.warn("⚠️ SvelteKit build not found. Running in API-only mode.");
  app.get("/", () => "Elysia is running (SvelteKit not found)");
}

app
  .use(
    openapi({
      documentation: {
        info: {
          title: "Svelysia Documentation",
          version: "1.0.0",
        },
      },
      references: fromTypes(),
    }),
  )
  .use(
    opentelemetry(
      env.ENABLE_TRACING ? { spanProcessors: [new BatchSpanProcessor(traceExporter)] } : {},
    ),
  )
  .use(logger.into({ autoLogging: true }))
  .onError((ctx) => {
    logger.error(ctx, ((ctx.error as Error).name as string) || "Unknown error");
    return "onError";
  })
  .onBeforeHandle(({ log, params, query, body }) => {
    log.info({ params, query, body }, "Incoming request");
  })
  .use(routes);

app.listen(3000);

const handleShutdown = async () => {
  logger.info("\nShutting down gracefully...");
  await app.stop(true);

  logger.info("Server stopped. Exiting process.");
  process.exit(0);
};

process.on("SIGINT", handleShutdown);
process.on("SIGTERM", handleShutdown);

logger.info(`🦊 Elysia is running at ${app.server?.url}`);
