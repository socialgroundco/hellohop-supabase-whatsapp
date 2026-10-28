import { assert, fixture, sha256 } from "./helpers.ts";
import { validates } from "./schema.ts";
import { buildSendBody } from "../supabase/functions/_shared/client.ts";
Deno.test("contract: fixtures/delivery-message.json validates against the vendored OpenAPI webhook envelope schema; the send body we build validates against the send-text request schema", () => {
  const spec = fixture("openapi.v1");
  assert.equal(spec.components.schemas.WebhookEnvelope, undefined);
  const envelope = fixture("webhook-envelope.schema");
  assert(validates(envelope, fixture("delivery-message")));
  const body = spec.paths["/sessions/{name}/messages/text"].post.requestBody
    .content["application/json"].schema;
  assert(validates(body, buildSendBody("66XXXXXXXXX", "<MESSAGE_TEXT>")));
  const missing = fixture("delivery-message");
  delete missing.id;
  assert(!("id" in missing));
  assert.equal(validates(envelope, missing), false);
  assert.equal(
    validates(body, {
      ...buildSendBody("66XXXXXXXXX", "<MESSAGE_TEXT>"),
      extra: true,
    }),
    false,
  );
  assert.equal(validates(body, { to: [], text: "<MESSAGE_TEXT>" }), false);
});
Deno.test("contract: fixtures/SOURCE names a sha and a date", async () => {
  const source = JSON.parse(Deno.readTextFileSync("fixtures/SOURCE"));
  assert.match(source.console_repo_sha, /^[a-f0-9]{40}$/);
  assert.match(source.fetched_at, /^\d{4}-\d{2}-\d{2}T/);
  assert(Number.isFinite(Date.parse(source.fetched_at)));
  assert.match(source.openapi_source_sha256, /^[a-f0-9]{64}$/);
  assert.equal(
    source.openapi_vendored_sha256,
    await sha256(Deno.readFileSync("fixtures/openapi.v1.json")),
  );
  assert(source.envelope_schema_note.includes("no webhook envelope schema"));
});
