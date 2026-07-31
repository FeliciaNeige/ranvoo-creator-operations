import { SESSION_COOKIE, clearCookie } from "../_shared";

export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  return Response.json(
    { connected: false },
    {
      headers: {
        "Set-Cookie": clearCookie(SESSION_COOKIE, "/"),
        "Cache-Control": "no-store",
      },
    },
  );
}
