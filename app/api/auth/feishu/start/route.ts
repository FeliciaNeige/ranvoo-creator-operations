import {
  FEISHU_AUTHORIZE_URL,
  OAUTH_COOKIE,
  OAuthCookie,
  cookie,
  randomBase64Url,
  requiredEnv,
  seal,
  sha256Base64Url,
} from "../_shared";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const state = randomBase64Url(24);
    const verifier = randomBase64Url(48);
    const challenge = await sha256Base64Url(verifier);
    const oauthCookie: OAuthCookie = {
      state,
      verifier,
      expiresAt: Date.now() + 10 * 60 * 1000,
    };

    const authorizeUrl = new URL(FEISHU_AUTHORIZE_URL);
    authorizeUrl.searchParams.set("client_id", requiredEnv("FEISHU_APP_ID"));
    authorizeUrl.searchParams.set(
      "redirect_uri",
      requiredEnv("FEISHU_REDIRECT_URI"),
    );
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set(
      "scope",
      [
        "bitable:app",
        "wiki:node:read",
        "mail:user_mailbox.message:send",
        "mail:user_mailbox.message:readonly",
        "mail:user_mailbox.message.subject:read",
        "mail:user_mailbox.message.address:read",
        "mail:user_mailbox.message.body:read",
        "mail:user_mailbox.folder:read",
      ].join(" "),
    );
    authorizeUrl.searchParams.set("state", state);
    authorizeUrl.searchParams.set("code_challenge", challenge);
    authorizeUrl.searchParams.set("code_challenge_method", "S256");

    return new Response(null, {
      status: 302,
      headers: {
        Location: authorizeUrl.toString(),
        "Set-Cookie": cookie(
          OAUTH_COOKIE,
          await seal(oauthCookie),
          10 * 60,
          "/api/auth/feishu",
        ),
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return Response.json(
      { connected: false, error: "飞书连接尚未完成配置。" },
      { status: 503 },
    );
  }
}
