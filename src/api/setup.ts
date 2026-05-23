import { logger } from "$lib/server/logger";
import type { MaybePromise } from "bun";

type SvelteHandler = {
  fetch: (request: Request) => MaybePromise<Response>;
  websocket: any;
};

/**
 * Lazily loads the SvelteKit build handler.
 * Returns `undefined` if the build artifact does not exist.
 */
export async function getSvelteHandler(): Promise<SvelteHandler | undefined> {
  // const buildPath = `${import.meta.dir}/../../build/handler.js`;
  const buildPath = `${process.cwd()}/build/handler.js`;

  const buildFile = Bun.file(buildPath);

  if (!(await buildFile.exists())) {
    return undefined;
  }

  try {
    const module = await import(buildPath);
    return module.getHandler();
  } catch (error) {
    logger.error(error, `Error loading SvelteKit handler from ${buildPath}`);
    return undefined;
  }
}
