import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const redirectUri = process.argv[2];
if (!redirectUri) {
  throw new Error("A production Feishu redirect URI is required.");
}

const values = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const separator = line.indexOf("=");
      const key = line.slice(0, separator).trim();
      let value = line.slice(separator + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      return [key, value.replace(/\\n/g, "\n")];
    }),
);

values.FEISHU_REDIRECT_URI = redirectUri;

const requiredKeys = [
  "FEISHU_APP_ID",
  "FEISHU_APP_SECRET",
  "FEISHU_SESSION_SECRET",
  "FEISHU_BASE_WIKI_TOKEN",
  "FEISHU_REDIRECT_URI",
];
const missing = requiredKeys.filter((key) => !values[key]);
if (missing.length) {
  throw new Error(`Missing required configuration: ${missing.join(", ")}`);
}

const secrets = Object.fromEntries(
  requiredKeys.map((key) => [key, values[key]]),
);

const result = spawnSync(
  "./node_modules/.bin/wrangler",
  ["secret", "bulk", "--config", "wrangler.jsonc"],
  {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      WRANGLER_LOG_PATH: ".wrangler/wrangler.log",
    },
    input: JSON.stringify(secrets),
    stdio: ["pipe", "inherit", "inherit"],
  },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
