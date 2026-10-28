import { createSendHandler } from "../supabase/functions/hellohop-send/index.ts";
import { sendText } from "../supabase/functions/_shared/client.ts";
import { assert, fixture } from "./helpers.ts";
const values: Record<string, string> = {
  SUPABASE_SERVICE_ROLE_KEY: "<SERVICE_ROLE_KEY>",
  HELLOHOP_TOKEN: "<CHANNEL_TOKEN>",
  HELLOHOP_CHANNEL_ID: "CHANNEL_ID",
  HELLOHOP_API_ORIGIN: "https://api.hellohop.app",
};
const env = (name: string) => values[name];
const request = (
  authorization = "Bearer <SERVICE_ROLE_KEY>",
  body: unknown = { to: "66XXXXXXXXX", text: "<MESSAGE_TEXT>" },
) =>
  new Request("https://example.com/send", {
    method: "POST",
    headers: { Authorization: authorization },
    body: JSON.stringify(body),
  });
Deno.test("hellohop-send: refuses a request without the service-role authorization", async () => {
  let calls = 0;
  const handler = createSendHandler(
    env,
    (() => {
      calls++;
      throw Error("unexpected call");
    }) as typeof fetch,
  );
  for (
    const auth of [
      "",
      "Bearer <ANON_KEY>",
      "Bearer <USER_JWT>",
      "<SERVICE_ROLE_KEY>",
    ]
  ) assert.equal((await handler(request(auth))).status, 401);
  assert.equal(calls, 0);
  assert.equal(
    (await createSendHandler(() => undefined)(request())).status,
    401,
  );
});
Deno.test("sendText builds POST <origin>/v1/sessions/<id>/messages/text with Authorization: Bearer and body {to, text} only", async () => {
  let calls = 0;
  const result = await sendText(
    "66XXXXXXXXX",
    "<MESSAGE_TEXT>",
    env,
    ((url, init) => {
      calls++;
      assert.equal(
        String(url),
        "https://api.hellohop.app/v1/sessions/CHANNEL_ID/messages/text",
      );
      assert.equal(init?.method, "POST");
      assert.equal(
        new Headers(init?.headers).get("Authorization"),
        "Bearer <CHANNEL_TOKEN>",
      );
      assert.deepEqual(JSON.parse(String(init?.body)), {
        to: "66XXXXXXXXX",
        text: "<MESSAGE_TEXT>",
      });
      assert.equal(init?.redirect, "error");
      return Promise.resolve(Response.json(fixture("send-text-response")));
    }) as typeof fetch,
  );
  assert.equal(calls, 1);
  assert.deepEqual(result, {
    ok: true,
    id: "3EB0C767D26A1D8E2A41",
    status: "server_ack",
  });
});
Deno.test('sendText returns {id, status: "server_ack"} from the fixture response', async () => {
  const result = await createSendHandler(
    env,
    (() =>
      Promise.resolve(
        Response.json(fixture("send-text-response")),
      )) as typeof fetch,
  )(request());
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), {
    id: "3EB0C767D26A1D8E2A41",
    status: "server_ack",
  });
});
Deno.test("sendText maps the 429 fixture to {code, window, resets_at, retry_after} and throws nothing it cannot name", async () => {
  const response = await createSendHandler(
    env,
    (() =>
      Promise.resolve(
        Response.json(fixture("error-429-sandbox"), { status: 429 }),
      )) as typeof fetch,
  )(request());
  assert.equal(response.status, 429);
  assert.deepEqual(await response.json(), {
    code: "sandbox_allowance_exceeded",
    window: "sandbox_messages_daily",
    resets_at: "2026-09-30T00:00:00+07:00",
    retry_after: 3600,
  });
});
Deno.test("sendText maps the 401 fixture to code unauthorized", async () => {
  assert.deepEqual(
    await sendText(
      "66XXXXXXXXX",
      "<MESSAGE_TEXT>",
      env,
      (() =>
        Promise.resolve(
          Response.json(fixture("error-401"), { status: 401 }),
        )) as typeof fetch,
    ),
    { ok: false, code: "unauthorized" },
  );
});
Deno.test("sendText never logs or includes the token in an error", async () => {
  for (
    const mock of [
      () => Promise.reject(Error(values.HELLOHOP_TOKEN)),
      () =>
        Promise.resolve(
          Response.json({ code: "unknown", error: values.HELLOHOP_TOKEN }, {
            status: 500,
          }),
        ),
      () =>
        Promise.resolve(
          Response.json({ id: values.HELLOHOP_TOKEN, status: "server_ack" }),
        ),
      () =>
        Promise.resolve(
          Response.json({
            code: "sandbox_allowance_exceeded",
            window: values.HELLOHOP_TOKEN,
            resets_at: values.HELLOHOP_TOKEN,
          }, { status: 429 }),
        ),
    ]
  ) {
    const result = await sendText(
      "66XXXXXXXXX",
      "<MESSAGE_TEXT>",
      env,
      mock as typeof fetch,
    );
    assert(!JSON.stringify(result).includes(values.HELLOHOP_TOKEN));
  }
  assert(
    !Deno.readTextFileSync("supabase/functions/_shared/client.ts").includes(
      "console.",
    ),
  );
});
Deno.test("hellohop-send: invalid JSON, wrong method or unexpected fields cannot send", async () => {
  let calls = 0;
  const handler = createSendHandler(
    env,
    (() => {
      calls++;
      throw Error("unexpected call");
    }) as typeof fetch,
  );
  assert.equal(
    (await handler(new Request("https://example.com/send"))).status,
    405,
  );
  for (
    const body of [{}, null, { to: "", text: "<MESSAGE_TEXT>" }, {
      to: "66XXXXXXXXX",
      text: "<MESSAGE_TEXT>",
      extra: true,
    }]
  ) assert.equal((await handler(request(undefined, body))).status, 400);
  const malformed = new Request("https://example.com/send", {
    method: "POST",
    headers: { Authorization: "Bearer <SERVICE_ROLE_KEY>" },
    body: "{",
  });
  assert.equal((await handler(malformed)).status, 400);
  assert.equal(calls, 0);
});
Deno.test("sendText: missing token or unsafe origin fails before fetch", async () => {
  let calls = 0;
  const mock = (() => {
    calls++;
    throw Error("unexpected call");
  }) as typeof fetch;
  assert.deepEqual(
    await sendText("66XXXXXXXXX", "<MESSAGE_TEXT>", () => undefined, mock),
    { ok: false, code: "configuration_error" },
  );
  for (
    const origin of [
      "http://example.com",
      "https://example.com/path",
      "https://example.com/?query=1",
      "https://user:pass@example.com",
    ]
  ) {
    assert.deepEqual(
      await sendText(
        "66XXXXXXXXX",
        "<MESSAGE_TEXT>",
        (n) => n === "HELLOHOP_API_ORIGIN" ? origin : env(n),
        mock,
      ),
      { ok: false, code: "configuration_error" },
    );
  }
  assert.equal(calls, 0);
});
