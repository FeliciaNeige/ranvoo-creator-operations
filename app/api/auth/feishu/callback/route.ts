import {
  FEISHU_TOKEN_URL,
  FeishuSession,
  OAUTH_COOKIE,
  OAuthCookie,
  SESSION_COOKIE,
  clearCookie,
  cookie,
  readCookie,
  requiredEnv,
  seal,
  unseal,
} from "../_shared";

export const dynamic = "force-dynamic";

type TokenResponse = {
  code?: number;
  msg?: string;
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  data?: {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };
};

export async function GET(request: Request): Promise<Response> {
  const requestUrl = new URL(request.url);
  const callbackError = requestUrl.searchParams.get("error");
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const oauthCookieValue = readCookie(request, OAUTH_COOKIE);
  const oauth = oauthCookieValue
    ? await unseal<OAuthCookie>(oauthCookieValue)
    : null;

  if (
    callbackError ||
    !code ||
    !state ||
    !oauth ||
    oauth.state !== state ||
    oauth.expiresAt < Date.now()
  ) {
    return callbackRedirect(request, "error", "authorization");
  }

  try {
    const tokenResponse = await fetch(FEISHU_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: requiredEnv("FEISHU_APP_ID"),
        client_secret: requiredEnv("FEISHU_APP_SECRET"),
        code,
        redirect_uri: requiredEnv("FEISHU_REDIRECT_URI"),
        code_verifier: oauth.verifier,
      }),
    });
    const tokenBody = (await tokenResponse.json()) as TokenResponse;
    const token = tokenBody.data ?? tokenBody;

    if (
      !tokenResponse.ok ||
      (typeof tokenBody.code === "number" && tokenBody.code !== 0) ||
      !token.access_token
    ) {
      return callbackRedirect(request, "error", "token");
    }

    const expiresIn = Math.max(60, token.expires_in ?? 7200);
    const session: FeishuSession = {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: Date.now() + expiresIn * 1000,
      scope: token.scope,
    };
    const location = new URL("/", request.url);
    location.searchParams.set("feishu", "connected");

    return new Response(null, {
      status: 302,
      headers: [
        ["Location", location.toString()],
        [
          "Set-Cookie",
          cookie(
            SESSION_COOKIE,
            await seal(session),
            30 * 24 * 60 * 60,
            "/",
          ),
        ],
        ["Set-Cookie", clearCookie(OAUTH_COOKIE, "/api/auth/feishu")],
        ["Cache-Control", "no-store"],
      ],
    });
  } catch {
    return callbackRedirect(request, "error", "network");
  }
}

function callbackRedirect(
  request: Request,
  status: "error",
  reason: string,
): Response {
  const location = new URL("/", request.url);
  location.searchParams.set("feishu", status);
  location.searchParams.set("reason", reason);
  return new Response(null, {
    status: 302,
    headers: [
      ["Location", location.toString()],
      ["Set-Cookie", clearCookie(OAUTH_COOKIE, "/api/auth/feishu")],
      ["Cache-Control", "no-store"],
    ],
  });
}
