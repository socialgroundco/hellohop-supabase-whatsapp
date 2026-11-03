import { assert, fixture } from "./helpers.ts";
const test = Deno.test;

// Frozen from the published Egress schema, not the fixture being checked.
// A fixture adding its own field must not expand its own acceptance rule.
type Egress = {
  mode: "none" | "url" | "invalid";
  fingerprint: string | null;
  pending_restart: boolean;
  applied_at: string | null;
};
const fields = ["mode", "fingerprint", "pending_restart", "applied_at"];

function decodeEgress(value: unknown): Egress {
  assert(value !== null && typeof value === "object" && !Array.isArray(value));
  const object = value as Record<string, unknown>;
  assert.deepEqual(Object.keys(object).sort(), [...fields].sort());
  assert(
    typeof object.mode === "string" &&
      ["none", "url", "invalid"].includes(object.mode),
  );
  assert(
    object.fingerprint === null ||
      (typeof object.fingerprint === "string" &&
        /^[0-9a-f]{16}$/.test(object.fingerprint)),
  );
  assert.equal(typeof object.pending_restart, "boolean");
  assert(
    object.applied_at === null ||
      (typeof object.applied_at === "string" &&
        /^\d{4}-\d{2}-\d{2}T/.test(object.applied_at) &&
        Number.isFinite(Date.parse(object.applied_at))),
  );
  if (object.mode !== "url") assert.equal(object.fingerprint, null);
  return object as Egress;
}

test("contract: Session fixtures decode into the published egress shape with fictional values", () => {
  const spec = fixture("openapi.v1");
  const schema = spec.components.schemas.Egress;
  assert(schema, "missing published Egress schema");
  assert.equal(schema.type, "object");
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual([...schema.required].sort(), [...fields].sort());
  assert.deepEqual(Object.keys(schema.properties).sort(), [...fields].sort());
  assert.deepEqual(schema.properties.mode.enum, ["none", "url", "invalid"]);
  assert.deepEqual(schema.properties.fingerprint.type, ["string", "null"]);
  assert.equal(schema.properties.fingerprint.pattern, "^[0-9a-f]{16}$");
  assert.equal(schema.properties.pending_restart.type, "boolean");
  assert.deepEqual(schema.properties.applied_at.type, ["string", "null"]);
  assert.equal(schema.properties.applied_at.format, "date-time");
  for (const field of fields) {
    assert.equal(schema.properties[field].readOnly, true);
  }
  assert.deepEqual(spec.components.schemas.Session.properties.egress, {
    $ref: "#/components/schemas/Egress",
    readOnly: true,
  });
  assert(spec.components.schemas.Session.required.includes("egress"));
  let checked = 0;
  for (const methods of Object.values(spec.paths)) {
    for (const operation of Object.values(methods as Record<string, unknown>)) {
      if (
        !operation || typeof operation !== "object" ||
        !("responses" in operation)
      ) continue;
      for (
        const response of Object.values(
          operation.responses as Record<string, unknown>,
        )
      ) {
        const content = (response as {
          content?: Record<
            string,
            { schema?: { $ref?: string }; example?: { egress?: unknown } }
          >;
        }).content?.["application/json"];
        if (content?.schema?.$ref !== "#/components/schemas/Session") continue;
        const egress = decodeEgress(content.example?.egress);
        assert.equal(egress.mode, "url");
        assert.equal(egress.fingerprint, "abcdef012345abcd");
        assert.equal(egress.pending_restart, false);
        assert.equal(egress.applied_at, null);
        checked++;
      }
    }
  }
  assert(checked >= 2, "must walk the GET and PATCH Session examples");
});

test("contract: egress decoder rejects unknown fields, missing fields and wrong types", () => {
  const original = {
    mode: "url",
    fingerprint: "abcdef012345abcd",
    pending_restart: false,
    applied_at: null,
  };
  // Positive control first. Every injected defect asserts it changed the input.
  assert.equal(decodeEgress(original).fingerprint, "abcdef012345abcd");
  assert.equal(
    decodeEgress({
      mode: "none",
      fingerprint: null,
      pending_restart: false,
      applied_at: null,
    }).fingerprint,
    null,
  );
  for (
    const changed of [
      { ...original, unpublished: true },
      { ...original, fingerprint: 42 },
      { ...original, fingerprint: "invalid" },
      { ...original, pending_restart: "false" },
      { ...original, mode: "unknown" },
      { ...original, applied_at: "invalid" },
      { ...original, mode: "none" },
    ]
  ) {
    assert.notEqual(JSON.stringify(changed), JSON.stringify(original));
    let rejected = false;
    try {
      decodeEgress(changed);
    } catch {
      rejected = true;
    }
    assert(rejected, "injected egress defect was accepted");
  }
  for (const field of fields) {
    const changed: Record<string, unknown> = { ...original };
    assert(field in changed);
    delete changed[field];
    assert(!(field in changed));
    let rejected = false;
    try {
      decodeEgress(changed);
    } catch {
      rejected = true;
    }
    assert(rejected, "injected egress defect was accepted");
  }
});
