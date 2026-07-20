import { redirect } from "react-router";

export const loader = ({ request }) => {
  const url = new URL(request.url);
  // Forward all Shopify params (shop, host, hmac, embedded, session…) to /app
  // where the layout's authenticate.admin() handles them properly and sets the
  // session cookie. Doing auth here and redirecting to /app/home directly drops
  // the embedded=1 flag, which makes the library treat subsequent requests as
  // non-embedded and redirects OAuth inside the iframe → CSP block.
  return redirect(`/app?${url.searchParams.toString()}`);
};

export default function Index() {
  return null;
}
