import { verify } from "../_shared/verify.ts";
import type { Env } from "../_shared/client.ts";

export function createWebhookHandler(env: Env, fetcher: typeof fetch = fetch) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== "POST") return Response.json({}, { status: 405 });
    const secret = env("HELLOHOP_WEBHOOK_SECRET");
    const database = env("SUPABASE_URL");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
    if (!secret || !database || !serviceKey) return Response.json({}, { status: 503 });
    const raw = new Uint8Array(await req.arrayBuffer());
    if (!(await verify(secret, raw, req.headers.get("X-HelloHop-Signature")))) {
      return Response.json({}, { status: 401 });
    }
    let event;
    try { event = JSON.parse(new TextDecoder().decode(raw)); }
    catch { return Response.json({}, { status: 400 }); }
    if (!event || typeof event !== "object" || typeof event.id !== "string" || !event.id) {
      return Response.json({}, { status: 400 });
    }
    if (event.type !== "message") return Response.json({});
    const message = event.payload;
    if (!message || typeof message !== "object") return Response.json({}, { status: 400 });
    if (message.from_me === true || message.type !== "text") return Response.json({});
    if ([message.id, message.chat_jid, message.sender_jid, message.timestamp].some(
      value => typeof value !== "string" || !value,
    ) || typeof message.text !== "string" || typeof message.from_me !== "boolean" ||
      typeof message.is_group !== "boolean" || !Number.isFinite(Date.parse(message.timestamp))) {
      return Response.json({}, { status: 400 });
    }
    const row = {
      event_id: event.id, message_id: message.id, chat_jid: message.chat_jid,
      sender_jid: message.sender_jid, type: message.type, text: message.text,
      from_me: message.from_me, is_group: message.is_group, sent_at: message.timestamp,
    };
    try {
      const origin = new URL(database);
      if (origin.protocol !== "https:" || origin.username || origin.password ||
          origin.pathname !== "/" || origin.search || origin.hash) throw new Error("configuration");
      const url = new URL("/rest/v1/whatsapp_messages", origin);
      url.searchParams.set("on_conflict", "event_id");
      // PostgREST translates this preference to on conflict (event_id) do nothing.
      // The unique constraint, not an instance-local set, serializes simultaneous retries.
      const result = await fetcher(url, {
        method: "POST", headers: {
          Authorization: `Bearer ${serviceKey}`, apikey: serviceKey,
          "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates,return=minimal",
        }, body: JSON.stringify(row), redirect: "error", signal: AbortSignal.timeout(5000),
      });
      await result.body?.cancel();
      if (!result.ok) return Response.json({}, { status: 503 });
      return Response.json({});
    } catch { return Response.json({}, { status: 503 }); }
  };
}
if (import.meta.main) Deno.serve(createWebhookHandler(name => Deno.env.get(name)));
