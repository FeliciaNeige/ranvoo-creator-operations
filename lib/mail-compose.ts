const ALLOWED_TAGS = new Set([
  "a", "b", "br", "div", "em", "i", "li", "mark", "ol", "p",
  "span", "strong", "u", "ul",
]);

export function sanitizeMailHtml(value: string): string {
  let html = value
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|iframe|object|embed|form)[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<(script|style|iframe|object|embed|form|img|video|audio|input|button)[^>]*\/?\s*>/gi, "");

  html = html.replace(/<\/?([a-z0-9-]+)([^>]*)>/gi, (match, rawTag: string, rawAttrs: string) => {
    const tag = rawTag.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return "";
    if (match.startsWith("</")) return `</${tag}>`;
    if (tag === "br") return "<br>";

    const attrs: string[] = [];
    if (tag === "a") {
      const hrefMatch = rawAttrs.match(/\bhref\s*=\s*(["'])(.*?)\1/i);
      const href = hrefMatch?.[2]?.trim() ?? "";
      if (/^(https?:|mailto:)/i.test(href)) {
        attrs.push(`href="${escapeAttribute(href)}"`);
        attrs.push('target="_blank"', 'rel="noopener noreferrer"');
      }
    }
    const styleMatch = rawAttrs.match(/\bstyle\s*=\s*(["'])(.*?)\1/i);
    if (styleMatch) {
      const safeStyle = styleMatch[2]
        .split(";")
        .map((part: string) => part.trim())
        .filter((part: string) => /^(background-color|color)\s*:\s*(#[0-9a-f]{3,8}|rgb\([\d\s,.%]+\)|[a-z]+)$/i.test(part))
        .join("; ");
      if (safeStyle) attrs.push(`style="${escapeAttribute(safeStyle)}"`);
    }
    return `<${tag}${attrs.length ? ` ${attrs.join(" ")}` : ""}>`;
  });
  return html.trim();
}

export function htmlToPlainText(value: string): string {
  return decodeEntities(
    value
      .replace(/<\s*br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|ol|ul)>/gi, "\n")
      .replace(/<li[^>]*>/gi, "• ")
      .replace(/<[^>]+>/g, "")
      .replace(/\n{3,}/g, "\n\n"),
  ).trim();
}

export function plainTextToHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function buildMailEml(input: {
  from: string;
  to: string;
  subject: string;
  html: string;
  plainText: string;
  sourceMessageId?: string;
  smtpMessageId?: string;
  references?: string;
}): string {
  const boundary = `ranvoo_${crypto.randomUUID().replace(/-/g, "")}`;
  const messageId = `${crypto.randomUUID()}@ranvoo-creator-operations`;
  const headers = [
    `From: <${cleanHeader(input.from)}>`,
    `To: <${cleanHeader(input.to)}>`,
    `Subject: ${encodeHeader(input.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${messageId}>`,
    "MIME-Version: 1.0",
  ];
  const smtpId = normalizeMessageId(input.smtpMessageId);
  if (smtpId) {
    headers.push(`In-Reply-To: <${smtpId}>`);
    const references = cleanHeader(input.references ?? "").trim();
    headers.push(`References: ${references ? `${references} ` : ""}<${smtpId}>`);
    if (input.sourceMessageId) {
      headers.push(`X-LMS-Reply-To-Message-Id: ${cleanHeader(input.sourceMessageId)}`);
    }
  }
  headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);

  return [
    ...headers,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(toBase64(input.plainText)),
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(toBase64(`<!doctype html><html><body>${input.html}</body></html>`)),
    `--${boundary}--`,
    "",
  ].join("\n");
}

export function toBase64Url(value: string): string {
  return toBase64(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function toBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function wrapBase64(value: string): string {
  return value.match(/.{1,76}/g)?.join("\n") ?? "";
}

function encodeHeader(value: string): string {
  const clean = cleanHeader(value).trim();
  return /^[\x20-\x7E]*$/.test(clean)
    ? clean
    : `=?UTF-8?B?${toBase64(clean)}?=`;
}

function cleanHeader(value: string): string {
  return value.replace(/[\r\n]+/g, " ");
}

function normalizeMessageId(value?: string): string {
  return cleanHeader(value ?? "").trim().replace(/^<|>$/g, "");
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}
