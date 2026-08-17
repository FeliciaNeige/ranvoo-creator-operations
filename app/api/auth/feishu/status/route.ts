import {
  ensureFeishuSession,
} from "../_shared";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const auth = await ensureFeishuSession(request).catch(() => null);
  const connected = Boolean(auth?.session.accessToken);
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (auth?.setCookie) headers.set("Set-Cookie", auth.setCookie);

  return Response.json(
    {
      configured: Boolean(
        process.env.FEISHU_APP_ID &&
          process.env.FEISHU_APP_SECRET &&
          process.env.FEISHU_REDIRECT_URI &&
          process.env.FEISHU_SESSION_SECRET,
      ),
      connected,
      expiresAt: connected ? auth?.session.expiresAt : null,
    },
    { headers },
  );
}
