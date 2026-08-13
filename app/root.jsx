import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import { VD_TOKENS_CSS } from "./styles/vd-tokens";

export default function App() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        <Meta />
        <Links />
        <style>{`body { margin: 0; padding: 0; }`}</style>
        <style dangerouslySetInnerHTML={{ __html: VD_TOKENS_CSS }} />
      </head>
      <body suppressHydrationWarning>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
