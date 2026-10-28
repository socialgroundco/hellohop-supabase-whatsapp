export function tree(
  root = ".",
  prefix = "",
): { path: string; text: string }[] {
  const result: { path: string; text: string }[] = [];
  for (const entry of Deno.readDirSync(root)) {
    if (entry.name === ".git") continue;
    const path = `${root}/${entry.name}`, relative = prefix + entry.name;
    if (entry.isSymlink) throw Error("Symlink in source tree");
    if (entry.isDirectory) result.push(...tree(path, relative + "/"));
    else {
      if (entry.name.startsWith(".env") && entry.name !== ".env.example") {
        throw Error("Unexpected environment file");
      }
      result.push({ path: relative, text: Deno.readTextFileSync(path) });
    }
  }
  return result;
}
export function history() {
  const result = new Deno.Command("git", {
    args: ["log", "--all", "-p", "--format=fuller"],
    stdout: "piped",
    stderr: "piped",
  }).outputSync();
  if (!result.success) throw Error("Git history scan failed");
  return new TextDecoder().decode(result.stdout);
}
export function secretFindings(text: string): string[] {
  const findings: string[] = [];
  if (/hh_acct_[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])/.test(text)) {
    findings.push("account credential");
  }
  if (
    /(?:HELLOHOP_TOKEN|Authorization)[^\n]{0,100}?[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])/
      .test(text)
  ) findings.push("bearer credential");
  if (/(?<![A-Za-z0-9])\+?\d{10,20}(?![A-Za-z0-9])/.test(text)) {
    findings.push("phone shape");
  }
  if (/\d{6,20}@(?:s\.whatsapp\.net|g\.us|(?:hosted\.)?lid)/.test(text)) {
    findings.push("address shape");
  }
  return findings;
}
export const envFindings = (text: string) =>
  text.split("\n").filter((line) =>
    line && !line.startsWith("#") && !/^[A-Z_]+=<[^>]+>$/.test(line)
  );
