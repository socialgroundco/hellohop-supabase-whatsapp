import { assert, sha256 } from "./helpers.ts";
Deno.test("verify-identity: lib/hellohop/verify.ts sha256 equals fixtures/verify.sha256", async () => {
  assert.equal(
    await sha256(Deno.readFileSync("supabase/functions/_shared/verify.ts")),
    Deno.readTextFileSync("fixtures/verify.sha256").trim(),
  );
});
