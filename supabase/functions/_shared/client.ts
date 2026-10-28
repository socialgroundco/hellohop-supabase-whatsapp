// Default generated from fixtures/openapi.v1.json servers[0].url (without /v1).
const DEFAULT_ORIGIN = "https://api.hellohop.app";
export type Env = (name: string) => string | undefined;
export type SendResult = { ok: true; id: string; status: "server_ack" } | {
  ok: false;
  code: string;
  window?: string;
  resets_at?: string;
  retry_after?: number;
};
export function buildSendBody(to: string, text: string) {
  return { to, text };
}
export async function sendText(
  to: string,
  text: string,
  env: Env,
  fetcher: typeof fetch = fetch,
): Promise<SendResult> {
  const token = env("HELLOHOP_TOKEN");
  const channel = env("HELLOHOP_CHANNEL_ID");
  if (!token || !channel || !/^[A-Za-z0-9_-]+$/.test(channel)) {
    return { ok: false, code: "configuration_error" };
  }
  let origin: URL;
  try {
    origin = new URL(env("HELLOHOP_API_ORIGIN") || DEFAULT_ORIGIN);
    if (
      origin.protocol !== "https:" || origin.username || origin.password ||
      origin.search || origin.hash || origin.pathname !== "/"
    ) return { ok: false, code: "configuration_error" };
  } catch {
    return { ok: false, code: "configuration_error" };
  }
  try {
    const response = await fetcher(
      `${origin.origin}/v1/sessions/${channel}/messages/text`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildSendBody(to, text)),
        redirect: "error",
        signal: AbortSignal.timeout(5000),
      },
    );
    const body: unknown = await response.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return { ok: false, code: "invalid_response" };
    }
    const data = body as Record<string, unknown>;
    const clean = (value: unknown): value is string =>
      typeof value === "string" && !value.includes(token);
    if (response.ok) {
      if (clean(data.id) && data.status === "server_ack") {
        return { ok: true, id: data.id, status: "server_ack" };
      }
      return { ok: false, code: "invalid_response" };
    }
    // Only named branches reach callers; never forward upstream prose or unknown fields.
    if (data.code === "unauthorized") {
      return { ok: false, code: "unauthorized" };
    }
    if (response.status === 429 && data.code === "sandbox_allowance_exceeded") {
      const result: SendResult = {
        ok: false,
        code: "sandbox_allowance_exceeded",
      };
      if (clean(data.window)) result.window = data.window;
      if (clean(data.resets_at)) result.resets_at = data.resets_at;
      if (
        typeof data.retry_after === "number" &&
        Number.isFinite(data.retry_after)
      ) result.retry_after = data.retry_after;
      return result;
    }
    return { ok: false, code: "api_error" };
  } catch {
    return { ok: false, code: "transport_error" };
  }
}
