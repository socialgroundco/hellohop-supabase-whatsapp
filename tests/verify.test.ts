import { verify } from "../supabase/functions/_shared/verify.ts";
import { assert, bytes, rawFixture, secret, sign } from "./helpers.ts";
const raw = rawFixture();
Deno.test("verify: accepts the docs fixture", async () => {
  assert.equal(await verify(secret, bytes(raw), await sign(raw)), true);
});
Deno.test("verify: rejects a body changed by one byte", async () => {
  const changed = raw.replace("MESSAGE_TEXT", "MESSAGE_TEXU");
  assert.notEqual(changed, raw);
  assert.equal(bytes(changed).length, bytes(raw).length);
  assert.equal(await verify(secret, bytes(changed), await sign(raw)), false);
});
Deno.test("verify: rejects a signature changed by one hex character", async () => {
  const signature = await sign(raw);
  const changed = (signature[0] === "a" ? "b" : "a") + signature.slice(1);
  assert.notEqual(changed, signature);
  assert.equal(await verify(secret, bytes(raw), changed), false);
});
Deno.test("verify: rejects an empty secret even when the signature matches HMAC of empty key", async () => {
  assert.equal(await verify("", bytes(raw), await sign(raw, "")), false);
});
Deno.test("verify: rejects an empty or missing header", async () => {
  for (const header of ["", null, undefined]) {
    assert.equal(await verify(secret, bytes(raw), header), false);
  }
});
Deno.test("verify: rejects uppercase hex of the correct value", async () => {
  const upper = await (await sign(raw)).toUpperCase();
  assert.notEqual(upper, await sign(raw));
  assert.equal(await verify(secret, bytes(raw), upper), false);
});
Deno.test("verify: does not depend on JSON key order", async () => {
  const parsed = JSON.parse(raw);
  const reordered = JSON.stringify(
    Object.fromEntries(Object.entries(parsed).reverse()),
    null,
    2,
  ) + "\n";
  assert.equal(
    JSON.stringify(JSON.parse(reordered).payload),
    JSON.stringify(parsed.payload),
  );
  assert.notEqual(reordered, raw);
  assert.equal(await verify(secret, bytes(reordered), await sign(raw)), false);
});
