import { assert } from "./helpers.ts";
import { envFindings, history, secretFindings, tree } from "./scan.ts";
Deno.test("secrets: tree and git history contain no live token shape; positive control flags a synthetic one; .env.example values are all placeholders; .gitignore lists .env, .env.local, .env.*.local", () => {
  const dir = Deno.makeTempDirSync({ dir: "/tmp", prefix: "hh-scan-" });
  try {
    const controls: [string, string][] = [
      ["hh_acct_" + "A".repeat(43), "account credential"],
      ["HELLOHOP_TOKEN=" + "B".repeat(43), "bearer credential"],
      ["Authorization: Bearer " + "C".repeat(43), "bearer credential"],
      ["+" + "1".repeat(11), "phone shape"],
      ["2".repeat(11) + "@s.whatsapp.net", "address shape"],
      ["3".repeat(11) + "@g.us", "address shape"],
      ["4".repeat(11) + "@hosted.lid", "address shape"],
    ];
    for (const [i, [value, category]] of controls.entries()) {
      const file = `${dir}/control-${i}`;
      Deno.writeTextFileSync(file, value);
      assert.equal(Deno.readTextFileSync(file), value);
      assert(secretFindings(Deno.readTextFileSync(file)).includes(category));
    }
    assert.equal(tree(dir).length, 7);
  } finally {
    Deno.removeSync(dir, { recursive: true });
  }
  for (const file of tree()) {
    assert.equal(secretFindings(file.path + "\n" + file.text).length, 0);
  }
  assert.equal(secretFindings(history()).length, 0);
  assert.deepEqual(envFindings(Deno.readTextFileSync(".env.example")), []);
  const bad = "HELLOHOP_TOKEN=synthetic";
  assert.deepEqual(envFindings(bad), [bad]);
  const ignore = Deno.readTextFileSync(".gitignore").split("\n");
  for (
    const entry of [
      ".env",
      ".env.local",
      ".env.*.local",
      "supabase/.temp/",
      ".playwright*/",
    ]
  ) assert(ignore.includes(entry));
});
