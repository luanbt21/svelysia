import { redirect } from "@sveltejs/kit";
import { auth } from "$lib/server/auth";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ request, url }) => {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session) {
    const fromUrl = url.pathname + url.search;
    throw redirect(302, `/login?redirect=${encodeURIComponent(fromUrl)}`);
  }

  return {
    user: session.user,
    session: session.session,
  };
};
