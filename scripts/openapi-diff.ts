export function changedPaths(
  before: unknown,
  after: unknown,
  path = "",
): string[] {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  if (
    before && after && typeof before === "object" && typeof after === "object"
  ) {
    const left = before as Record<string, unknown>,
      right = after as Record<string, unknown>;
    return [...new Set([...Object.keys(left), ...Object.keys(right)])].sort()
      .flatMap(
        (key) =>
          changedPaths(
            left[key],
            right[key],
            `${path}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`,
          ),
      );
  }
  return [path || "/"];
}
export async function renderDiff(
  raw: Uint8Array,
  vendored: unknown,
  source: { openapi_source_sha256: string },
): Promise<string> {
  const hash = [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new Uint8Array(raw)),
    ),
  ].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (hash === source.openapi_source_sha256) return "";
  const redact = (value: unknown): unknown => {
    if (typeof value === "string") {
      return value.replace(
        /\b\d{6,20}(?=@(?:s\.whatsapp\.net|g\.us|lid))/g,
        "<ADDRESS>",
      ).replace(/(?<![A-Za-z0-9])\+?\d{10,20}(?![A-Za-z0-9])/g, "<PHONE>");
    }
    if (Array.isArray(value)) return value.map(redact);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, redact(item)]),
      );
    }
    return value;
  };
  const paths = changedPaths(
    vendored,
    redact(JSON.parse(new TextDecoder().decode(raw))),
  );
  return "The live OpenAPI source changed. Review before refreshing fixtures.\n\n" +
    (paths.length
      ? paths.map((path) => `- ${path}`).join("\n")
      : "- Source bytes changed; no redacted JSON value changed.") +
    "\n";
}
if (import.meta.main) {
  const result = await renderDiff(
    Deno.readFileSync(Deno.args[0]),
    JSON.parse(Deno.readTextFileSync("fixtures/openapi.v1.json")),
    JSON.parse(Deno.readTextFileSync("fixtures/SOURCE")),
  );
  Deno.writeTextFileSync(Deno.args[1], result);
}
