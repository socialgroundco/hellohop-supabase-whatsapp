import { assert } from "./helpers.ts";
Deno.test("config: one main-push CI and one monthly drift workflow use immutable actions and pinned Deno", () => {
  const files = [...Deno.readDirSync(".github/workflows")].map((entry) =>
    entry.name
  ).sort();
  assert.deepEqual(files, ["ci.yml", "openapi-drift.yml"]);
  const ci = Deno.readTextFileSync(".github/workflows/ci.yml");
  const drift = Deno.readTextFileSync(".github/workflows/openapi-drift.yml");
  assert.match(ci, /on:\n {2}push:\n {4}branches: \[main\]/);
  assert(!/pull_request|schedule:|workflow_dispatch:|matrix:/.test(ci));
  assert.match(drift, /cron: ["']0 3 1 \* \*["']/);
  assert(!/pull_request|push:|workflow_dispatch:|matrix:/.test(drift));
  for (const workflow of [ci, drift]) {
    const actions = [...workflow.matchAll(/uses: ([^\s]+)/g)].map((match) =>
      match[1]
    );
    assert.equal(actions.length, 2);
    for (const action of actions) assert.match(action, /^[^@]+@[a-f0-9]{40}$/);
    assert.match(workflow, /deno-version: v2\.5\.6/);
  }
  assert(ci.includes("fetch-depth: 0"));
  assert(ci.includes("deno task test"));
  assert(ci.includes("deno task typecheck"));
  assert(ci.includes("deno task lint"));
  assert(!ci.includes("cache"));
});
