import { env } from "$env/dynamic/public";
import { treaty } from "@elysia/eden";
import type { App } from "../server";

export const config = {
  runtime: "edge",
};

export const client = treaty<App>(env.PUBLIC_API_BASE_URL);
