import { recordPresence } from "../presence.server";
import { verifyAppProxySignature } from "../verify-app-proxy.server";

// Public, appele depuis le storefront (app embed "Live presence") toutes
// les ~15s pendant qu'un drop est LIVE, pour alimenter le compteur "on site
// now" de la page Live. Rien n'est stocke en base : voir presence.server.js.
export const action = async ({ request }) => {
  try {
    const url = new URL(request.url);
    if (!verifyAppProxySignature(url)) {
      return Response.json({ success: false }, { status: 401 });
    }

    const formData = await request.formData();
    const externalDropId = (formData.get("dropId") || "").toString().trim();
    const visitorId = (formData.get("visitorId") || "").toString().trim();

    if (!externalDropId || !visitorId) {
      return Response.json({ success: false }, { status: 400 });
    }

    recordPresence(externalDropId, visitorId);
    return Response.json({ success: true });
  } catch (err) {
    console.error("presence-ping: failed", err);
    return Response.json({ success: false }, { status: 500 });
  }
};

export const loader = async () => {
  return new Response("Method not allowed", { status: 405 });
};
