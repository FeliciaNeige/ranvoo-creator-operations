import {
  FeishuSession,
  SESSION_COOKIE,
  readCookie,
  unseal,
} from "../_shared";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const sessionValue = readCookie(request, SESSION_COOKIE);
  const session = sessionValue
    ? await unseal<FeishuSession>(sessionValue)
    : null;
  const connected = Boolean(
    session?.accessToken && session.expiresAt > Date.now() + 30_000,
  );

  return Response.json(
    {
      configured: Boolean(
        process.env.FEISHU_APP_ID &&
          process.env.FEISHU_APP_SECRET &&
          process.env.FEISHU_REDIRECT_URI &&
          process.env.FEISHU_SESSION_SECRET,
      ),
      connected,
      expiresAt: connected ? session?.expiresAt : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
