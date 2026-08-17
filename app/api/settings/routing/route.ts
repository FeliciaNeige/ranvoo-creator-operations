import { createFeishuClient, OperationsApiError } from "../../operations/_shared";
import { getMailDb } from "../../mail/_shared";
import {
  loadRoutingConfig,
  saveRoutingConfig,
} from "../../../../lib/routing-settings";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const client = await createFeishuClient(request);
    const config = await loadRoutingConfig(getMailDb());
    const headers = new Headers({ "Cache-Control": "no-store" });
    if (client.setCookie) headers.set("Set-Cookie", client.setCookie);
    return Response.json({ config }, { headers });
  } catch (error) {
    return settingsError(error);
  }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    const client = await createFeishuClient(request);
    const body = await request.json() as { config?: unknown };
    const config = await saveRoutingConfig(getMailDb(), body.config);
    const headers = new Headers({ "Cache-Control": "no-store" });
    if (client.setCookie) headers.set("Set-Cookie", client.setCookie);
    return Response.json({ ok: true, config }, { headers });
  } catch (error) {
    return settingsError(error);
  }
}

function settingsError(error: unknown): Response {
  if (error instanceof OperationsApiError) {
    return Response.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }
  return Response.json(
    { error: "分类规则暂时无法读取或保存。" },
    { status: 500 },
  );
}
