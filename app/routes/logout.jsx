import { redirect } from "react-router";
import { getWebSession, destroyWebSession } from "../auth.web.server";

export const loader = async ({ request }) => {
  const session = await getWebSession(request);
  return redirect("/", {
    headers: { "Set-Cookie": await destroyWebSession(session) },
  });
};

export default function Logout() {
  return null;
}
