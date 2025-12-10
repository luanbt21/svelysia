import { getCurrentSpan, opentelemetry } from "@elysiajs/opentelemetry";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-node";
import { Elysia } from "elysia";

import { logger, traceExporter } from "./prelude";
import { routes } from "./routes";
import { getSvelteHandler } from "./setup";
import { wrap } from "@bogeychan/elysia-logger";

logger.info("Starting application");
const app = new Elysia()
  .use(
    opentelemetry({
      spanProcessors: [new BatchSpanProcessor(traceExporter)],
    }),
  )
  .use(wrap(logger, { autoLogging: true }))

  .get("api/hola", async function hello(ctx) {
    ctx.log.info(ctx.request, "Request");

    const span = getCurrentSpan();
    if (span) {
      const { traceId, spanId } = span.spanContext();
      ctx.log.info({ trace_id: traceId, span_id: spanId }, "Hello World!");
      return { traceId, spanId };
    }
    return {};
  })
  .use(routes);

const svelteHandler = await getSvelteHandler();

if (svelteHandler) {
  logger.info("✅ SvelteKit handler mounted.");
  app.mount("/", svelteHandler.fetch);
} else {
  logger.warn("⚠️ SvelteKit build not found. Running in API-only mode.");
  app.get("/", () => "Elysia is running (SvelteKit not found)");
}

app.listen(3000);

logger.info(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`,
);
