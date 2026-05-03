import { opentelemetry } from "@elysiajs/opentelemetry";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-node";
import { Elysia, t } from "elysia";
import { openapi, fromTypes } from "@elysiajs/openapi";
import { env } from "./api/env";

import { logger, traceExporter } from "./api/prelude";
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
          title: "Elysia Documentation",
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

  .post(
    "api/test",
    function test({ body }) {
      return body;
    },
    {
      body: t.Object({
        name: t.String(),
      }),
    },
  )
  .use(routes);

app.listen(3000);

const handleShutdown = async () => {
  console.log("\nShutting down gracefully...");
  await app.stop(true);

  console.log("Server stopped. Exiting process.");
  process.exit(0);
};

// Listen for termination signals
process.on("SIGINT", handleShutdown);
process.on("SIGTERM", handleShutdown);

logger.info(`🦊 Elysia is running at ${app.server?.url}`);
