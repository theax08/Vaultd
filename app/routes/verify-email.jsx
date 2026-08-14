import { verifyAccountEmail } from "../vaultd-account.server";

function htmlPage(title, message) {
  return new Response(
    `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>${title}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f4f4f4; margin: 0; padding: 0; }
      .card { max-width: 420px; margin: 64px auto; background: #fff; border: 1px solid #e5e5e5; border-radius: 16px; padding: 32px; text-align: center; }
      h1 { font-size: 20px; margin: 0 0 8px 0; }
      p { color: #555; font-size: 14px; line-height: 1.5; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>${title}</h1>
      <p>${message}</p>
    </div>
  </body>
</html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return htmlPage("Invalid link", "This confirmation link is missing required information.");
  }

  const result = await verifyAccountEmail(token);

  if (result.error) {
    return htmlPage("Link expired", result.error);
  }

  return htmlPage(
    result.alreadyVerified ? "Already confirmed" : "Email confirmed",
    "You can close this tab and go back to Vaultd."
  );
};
