// All prohibited literals live in this one constant, encoded to keep the repository spelling-clean.
const BANNED = [
  [119, 97, 103, 97, 116, 101],
  [119, 104, 97, 112, 105],
  [103, 114, 101, 101, 110, 32, 97, 112, 105],
  [116, 119, 105, 108, 105, 111],
  [
    111,
    102,
    102,
    105,
    99,
    105,
    97,
    108,
    32,
    119,
    104,
    97,
    116,
    115,
    97,
    112,
    112,
  ],
  [
    119,
    104,
    97,
    116,
    115,
    97,
    112,
    112,
    32,
    98,
    117,
    115,
    105,
    110,
    101,
    115,
    115,
    32,
    97,
    112,
    105,
  ],
].map((chars) => String.fromCharCode(...chars));
import { assert } from "./helpers.ts";
import { history, tree } from "./scan.ts";
export const brandFindings = (text: string) =>
  BANNED.filter((term) => text.toLowerCase().includes(term));
Deno.test("brand: no banned legacy name anywhere in the tree; positive control flags each banned term", () => {
  const dir = Deno.makeTempDirSync({ dir: "/tmp", prefix: "hh-brand-" });
  try {
    for (const [i, term] of BANNED.entries()) {
      const value = term.toUpperCase(), file = `${dir}/control-${i}`;
      Deno.writeTextFileSync(file, value);
      assert.equal(Deno.readTextFileSync(file), value);
      assert(brandFindings(Deno.readTextFileSync(file)).includes(term));
    }
    assert.equal(tree(dir).length, 6);
  } finally {
    Deno.removeSync(dir, { recursive: true });
  }
  for (const file of tree()) {
    assert.equal(brandFindings(file.path + "\n" + file.text).length, 0);
  }
  assert.equal(brandFindings(history()).length, 0);
});
