import { sendText, type Env } from "../_shared/client.ts";

// Backend callers only. Never give the service-role key to a browser.
export function createSendHandler(env: Env, fetcher: typeof fetch = fetch) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== "POST") return Response.json({}, { status: 405 });
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
    if (!serviceKey || req.headers.get("Authorization") !== `Bearer ${serviceKey}`) {
      return Response.json({}, { status: 401 });
    }
    let body;
    try { body = await req.json(); } catch { return Response.json({}, { status: 400 }); }
    if (!body || typeof body !== "object" || Array.isArray(body) ||
      typeof body.to !== "string" || !body.to.trim() || typeof body.text !== "string" ||
      !body.text.trim() || Object.keys(body).some(key => key !== "to" && key !== "text")) {
      return Response.json({}, { status: 400 });
    }
    const result = await sendText(body.to, body.text, env, fetcher);
    if (result.ok) return Response.json({ id: result.id, status: result.status });
    const { ok: _ok, ...error } = result;
    const status = result.code === "sandbox_allowance_exceeded" ? 429 : 502;
    return Response.json(error, { status });
  };
}
if (import.meta.main) Deno.serve(createSendHandler(name => Deno.env.get(name)));
