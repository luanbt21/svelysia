Bun.build({
  entrypoints: ["src/server.ts"],
  outdir: "dist",
  target: "bun",
  format: "esm",
  sourcemap: "linked",
  bytecode: true,
  compile: true,
});
