import { transport } from "pino";
import { OpenobserveTransport } from "@openobserve/pino-openobserve";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { getCurrentSpan } from "@elysiajs/opentelemetry";
import { createPinoLogger } from "@bogeychan/elysia-logger";

import { env } from "./env";

const openObserveToken = Buffer.from(
  `${env.OPEN_OBSERVE_EMAIL}:${env.OPEN_OBSERVE_PASSWORD}`,
).toString("base64");

const options: ConstructorParameters<typeof OpenobserveTransport>[0] = {
  url: env.OPEN_OBSERVE_URL,
  organization: env.OPEN_OBSERVE_ORGANIZATION,
  streamName: env.OPEN_OBSERVE_STREAM_NAME,
  silentSuccess: true,
  batchSize: 1,
  // timeThreshold: 1000,
  auth: {
    username: env.OPEN_OBSERVE_EMAIL,
    password: env.OPEN_OBSERVE_PASSWORD,
  },
};

type TargetOptions = {
  target: string;
  options?: Record<string, unknown>;
  level: string;
};

const targets: TargetOptions[] = [
  {
    target: "pino-pretty",
    options: {
      colorize: true,
      destination: 1, // 1 = stdout
      ignore: "pid,hostname", // cleaner output
    },
    level: "info",
  },
  ...(env.ENABLE_TRACING
    ? [
        {
          target: "@openobserve/pino-openobserve",
          options: { ...options },
          level: "info",
        },
      ]
    : []),
];

export const logger = createPinoLogger({
  level: "info",
  stream: transport({ targets }),
  mixin() {
    const activeSpan = getCurrentSpan();
    if (!activeSpan) return {};
    const { traceId, spanId } = activeSpan.spanContext();
    return { trace_id: traceId, span_id: spanId };
  },
});

export const traceExporter = new OTLPTraceExporter({
  url: `${Bun.env.OPEN_OBSERVE_URL}/api/${env.OPEN_OBSERVE_ORGANIZATION}/v1/traces`,
  headers: {
    Authorization: `Basic ${openObserveToken}`,
    "stream-name": env.OPEN_OBSERVE_STREAM_NAME,
  },
});
