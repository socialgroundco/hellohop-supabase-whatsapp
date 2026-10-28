interface Injection {
  testFile: string;
  name: string;
  path: string;
  find: string;
  replace: string;
  kind?: string;
}
function ensure(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function copy(from: string, to: string) {
  Deno.mkdirSync(to, { recursive: true });
  for (const entry of Deno.readDirSync(from)) {
    ensure(!entry.isSymlink, "Symlinks are not copied");
    ensure(
      !entry.name.startsWith(".env") || entry.name === ".env.example",
      "Unexpected environment file",
    );
    if (entry.isDirectory) copy(`${from}/${entry.name}`, `${to}/${entry.name}`);
    else Deno.copyFileSync(`${from}/${entry.name}`, `${to}/${entry.name}`);
  }
}
const cases: Injection[] = JSON.parse(
  Deno.readTextFileSync("scripts/injections.json"),
);
const names = [...Deno.readDirSync("tests")].filter((e) =>
  e.name.endsWith(".test.ts")
).flatMap((e) => {
  const text = Deno.readTextFileSync(`tests/${e.name}`);
  return [
    ...text.matchAll(/Deno.test\(\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g),
  ].map((match) => ({
    file: `tests/${e.name}`,
    name: match[1].startsWith('"')
      ? JSON.parse(match[1])
      : match[1].slice(1, -1),
  }));
});
ensure(names.length > 0, "No named tests found");
for (const test of names) {
  ensure(
    cases.some((item) =>
      item.name === test.name && item.testFile === test.file
    ),
    `Missing injection for ${test.name}`,
  );
}
for (const item of cases) {
  ensure(
    names.some((test) =>
      test.name === item.name && test.file === item.testFile
    ),
    `Unknown injection target ${item.name}`,
  );
}
const root = Deno.makeTempDirSync({ dir: "/tmp", prefix: "hh-injections-" });
const decoder = new TextDecoder();
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const args = [
  "test",
  "--cached-only",
  "--no-remote",
  "--no-npm",
  "--deny-net",
  "--allow-read=.,/tmp",
  "--allow-write=/tmp",
  "--allow-run=git",
];
let passed = 0;
try {
  copy(".", root);
  const baseline = await new Deno.Command(Deno.execPath(), {
    args: [...args, "tests"],
    cwd: root,
    env: { NO_COLOR: "1" },
    stdout: "piped",
    stderr: "piped",
  }).output();
  ensure(baseline.success, "Baseline suite failed before injection");
  for (const [index, item] of cases.entries()) {
    const path = `${root}/${item.path}`;
    let original: string | undefined;
    try {
      original = Deno.readTextFileSync(path);
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
    }
    try {
      let changed: string;
      if (item.kind === "append") changed = original + item.replace;
      else if (item.kind === "credential") {
        changed = "HELLOHOP_TOKEN=" + "A".repeat(43);
      } else if (item.kind === "brand") {
        const source = Deno.readTextFileSync(`${root}/tests/brand.test.ts`);
        const encoded = source.match(/const BANNED = (\[[\s\S]*?\])\.map/)?.[1];
        ensure(encoded, "Brand constant not found");
        const vectors = JSON.parse(encoded.replace(/,\s*\]/g, "]"));
        changed = String.fromCharCode(...vectors[0]);
      } else if (item.kind === "source-date" || item.kind === "source-sha") {
        const source = JSON.parse(original!);
        source[
          item.kind === "source-date" ? "fetched_at" : "console_repo_sha"
        ] = "<INVALID>";
        changed = JSON.stringify(source);
      } else {
        ensure(original !== undefined, "Injection source missing");
        ensure(
          original.split(item.find).length - 1 === 1,
          `Injection anchor must occur once: ${index + 1}`,
        );
        changed = original.replace(item.find, item.replace);
      }
      ensure(changed !== original, `Injection changed no bytes: ${index + 1}`);
      Deno.writeTextFileSync(path, changed);
      ensure(
        Deno.readTextFileSync(path) === changed,
        `Injection did not apply: ${index + 1}`,
      );
      const run = await new Deno.Command(Deno.execPath(), {
        args: [...args, "--filter", `/^${escape(item.name)}$/`, item.testFile],
        cwd: root,
        env: { NO_COLOR: "1" },
        stdout: "piped",
        stderr: "piped",
      }).output();
      const output = decoder.decode(run.stdout) + decoder.decode(run.stderr);
      ensure(
        !run.success && /FAILED \| 0 passed \| 1 failed/.test(output),
        `Injection ${
          index + 1
        } did not yield one failed test (${item.name}):\n${
          output.slice(-2500)
        }`,
      );
      passed++;
      console.log(`RED ${index + 1}/${cases.length}: ${item.name}`);
    } finally {
      if (original === undefined) Deno.removeSync(path);
      else {
        Deno.writeTextFileSync(path, original);
        ensure(Deno.readTextFileSync(path) === original, "Restore failed");
      }
    }
  }
  const green = await new Deno.Command(Deno.execPath(), {
    args: [...args, "tests"],
    cwd: root,
    env: { NO_COLOR: "1" },
    stdout: "piped",
    stderr: "piped",
  }).output();
  ensure(green.success, "Restored suite failed");
  console.log(
    `${passed}/${cases.length} applied injections RED; all ${names.length} named tests covered; restored suite GREEN.`,
  );
} finally {
  Deno.removeSync(root, { recursive: true });
}
