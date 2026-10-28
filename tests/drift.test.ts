import { assert, bytes, sha256 } from "./helpers.ts";
import { changedPaths, renderDiff } from "../scripts/openapi-diff.ts";
Deno.test("drift: identical source hash produces no issue; changed source reports only escaped paths", async () => {
  const raw = bytes('{"paths":{"/new~route":{"post":{}}}}');
  assert.equal(
    await renderDiff(raw, {}, { openapi_source_sha256: await sha256(raw) }),
    "",
  );
  const changed = await renderDiff(raw, {}, {
    openapi_source_sha256: "0".repeat(64),
  });
  assert(changed.includes("- /paths"));
  assert.deepEqual(
    changedPaths({ paths: {} }, JSON.parse(new TextDecoder().decode(raw))),
    ["/paths/~1new~0route"],
  );
  assert(!changed.includes('"post"'));
});
Deno.test("drift: a source-only byte change still opens a signal without leaking examples", async () => {
  const raw = bytes('{"example":"<MESSAGE_TEXT>"} ');
  const result = await renderDiff(raw, { example: "<MESSAGE_TEXT>" }, {
    openapi_source_sha256: "0".repeat(64),
  });
  assert(result.includes("Source bytes changed"));
  assert(!result.includes("<MESSAGE_TEXT>"));
});
