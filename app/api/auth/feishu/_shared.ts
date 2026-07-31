const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const FEISHU_AUTHORIZE_URL =
  "https://accounts.feishu.cn/open-apis/authen/v1/authorize";
export const FEISHU_TOKEN_URL =
  "https://open.feishu.cn/open-apis/authen/v2/oauth/token";
export const OAUTH_COOKIE = "ranvoo_feishu_oauth";
export const SESSION_COOKIE = "ranvoo_feishu_session";

export type OAuthCookie = {
  state: string;
  verifier: string;
  expiresAt: number;
};

export type FeishuSession = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  scope?: string;
};

export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function readCookie(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get("cookie") ?? "";
  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName === name) return decodeURIComponent(rawValue.join("="));
  }
  return null;
}

export function randomBase64Url(bytes = 32): string {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return toBase64Url(value);
}

export async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return toBase64Url(new Uint8Array(digest));
}

export async function seal<T>(value: T): Promise<string> {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const key = await sessionKey();
  const plaintext = encoder.encode(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    plaintext,
  );
  return `${toBase64Url(iv)}.${toBase64Url(new Uint8Array(ciphertext))}`;
}

export async function unseal<T>(value: string): Promise<T | null> {
  try {
    const [ivPart, ciphertextPart] = value.split(".");
    if (!ivPart || !ciphertextPart) return null;
    const key = await sessionKey();
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64Url(ivPart) },
      key,
      fromBase64Url(ciphertextPart),
    );
    return JSON.parse(decoder.decode(plaintext)) as T;
  } catch {
    return null;
  }
}

export function cookie(
  name: string,
  value: string,
  maxAge: number,
  path = "/",
): string {
  return [
    `${name}=${encodeURIComponent(value)}`,
    `Max-Age=${maxAge}`,
    `Path=${path}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ].join("; ");
}

export function clearCookie(name: string, path = "/"): string {
  return cookie(name, "", 0, path);
}

async function sessionKey(): Promise<CryptoKey> {
  const secret = requiredEnv("FEISHU_SESSION_SECRET");
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey(
    "raw",
    digest,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

function toBase64Url(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
