import { redirect } from "react-router";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  const url = new URL(request.url);
  // Forward all params including embedded=1, shop, host so the layout's auth
  // check on /app/home can still identify the session correctly.
  return redirect(`/app/home?${url.searchParams.toString()}`);
};

export default function AppIndex() {
  return null;
}
