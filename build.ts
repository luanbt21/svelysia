Bun.build({
  entrypoints: ["src/server.ts"],
  outdir: "dist",
  sourcemap: "linked",
  external: ["@opentelemetry/exporter-trace-otlp-http"],
  // bytecode: true,
  target: "bun",
  format: "esm",
});
