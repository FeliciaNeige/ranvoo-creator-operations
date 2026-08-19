/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

const SHELL_CACHE_VERSION = "2026-08-19-mail-send-progress-edit-v3";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    // The workbench is a single client-side application. Rendering the same
    // shell on every visit can exceed the small CPU allowance on Workers Free,
    // especially while background mail analysis is also active. Cache one
    // query-independent shell at the edge; authentication and live data are
    // still fetched client-side from /api after hydration.
    if (request.method === "GET" && url.pathname === "/") {
      const cache = caches.default;
      const cacheKey = new Request(
        `https://ranvoo-shell.invalid/${SHELL_CACHE_VERSION}`,
        { method: "GET" },
      );
      const cached = await cache.match(cacheKey);
      if (cached) {
        const headers = new Headers(cached.headers);
        headers.set("X-Ranvoo-Shell-Cache", "HIT");
        return new Response(cached.body, {
          status: cached.status,
          statusText: cached.statusText,
          headers,
        });
      }

      const shellUrl = new URL(request.url);
      shellUrl.search = "";
      const shellResponse = await handler.fetch(
        new Request(shellUrl, request),
        env,
        ctx,
      );
      if (
        shellResponse.ok &&
        shellResponse.headers.get("Content-Type")?.includes("text/html")
      ) {
        const headers = new Headers(shellResponse.headers);
        headers.delete("Set-Cookie");
        headers.set(
          "Cache-Control",
          "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800",
        );
        headers.set("X-Ranvoo-Shell-Cache", "MISS");
        const cacheable = new Response(shellResponse.clone().body, {
          status: shellResponse.status,
          statusText: shellResponse.statusText,
          headers,
        });
        ctx.waitUntil(cache.put(cacheKey, cacheable.clone()));
        return cacheable;
      }
      return shellResponse;
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
