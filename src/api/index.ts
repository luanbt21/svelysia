import { type MaybePromise, Elysia } from "elysia";
import { opentelemetry } from "@elysiajs/opentelemetry";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";

import { routes } from "./routes";

type SvelteHandler = {
  fetch: (request: Request) => MaybePromise<Response>;
  websocket: any;
};

/**
 * Lazily loads the SvelteKit build handler.
 * Returns `undefined` if the build artifact does not exist.
 */
async function getSvelteHandler(): Promise<SvelteHandler | undefined> {
  const buildPath = `${import.meta.dir}/../../build/handler.js`;

  const buildFile = Bun.file(buildPath);

  if (!(await buildFile.exists())) {
    return undefined;
  }

  try {
    const module = await import(buildPath);
    return module.getHandler();
  } catch (error) {
    console.error(`Error loading SvelteKit handler from ${buildPath}:`, error);
    return undefined;
  }
}

const traceExporter = new OTLPTraceExporter({
  url: Bun.env.OPEN_OBSERVE_URL,
  headers: {
    Authorization: `Basic ${Bun.env.OPEN_OBSERVE_TOKEN}`,
  },
});

const app = new Elysia()
  .use(
    opentelemetry({
      spanProcessors: [new BatchSpanProcessor(traceExporter)],
    }),
  )
  .derive(async function getProfile({ cookie: { session } }) {
    console.log("Fetching profile");
    return {
      user: { name: "John Doe" },
    };
  })
  .get("api/hola", async function hello() {
    await fetch("http://localhost:3000", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Bun.env.OPEN_OBSERVE_TOKEN}`,
      },
      body: JSON.stringify({ message: "Hello World!" }),
    });
    return "Hola World!";
  })
  .use(routes);

const svelteHandler = await getSvelteHandler();

if (svelteHandler) {
  console.log("✅ SvelteKit handler mounted.");
  app.mount("/", svelteHandler.fetch);
} else {
  console.log("⚠️ SvelteKit build not found. Running in API-only mode.");
  app.get("/", () => "Elysia is running (SvelteKit not found)");
}

app.listen(3000);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`,
);
