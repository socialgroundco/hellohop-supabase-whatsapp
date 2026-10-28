// This offline adapter covers the schema keywords used by these two contracts.
// It intentionally fails on an unknown validation keyword rather than silently skipping it.
export function validates(
  schema: Record<string, unknown>,
  value: unknown,
): boolean {
  const allowed = [
    "$schema",
    "type",
    "properties",
    "required",
    "additionalProperties",
    "minLength",
    "description",
    "items",
    "pattern",
  ];
  if (Object.keys(schema).some((key) => !allowed.includes(key))) {
    throw new Error("Unhandled schema keyword");
  }
  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }
    const object = value as Record<string, unknown>;
    if (
      (schema.required as string[] | undefined)?.some((key) => !(key in object))
    ) return false;
    const properties = (schema.properties ?? {}) as Record<
      string,
      Record<string, unknown>
    >;
    return Object.entries(object).every(([key, item]) =>
      key in properties
        ? validates(properties[key], item)
        : schema.additionalProperties !== false
    );
  }
  if (schema.type === "string") {
    return typeof value === "string" &&
      value.length >= (schema.minLength as number ?? 0) &&
      (!schema.pattern || new RegExp(schema.pattern as string).test(value));
  }
  if (schema.type === "array") {
    return Array.isArray(value) &&
      value.every((item) =>
        validates(schema.items as Record<string, unknown>, item)
      );
  }
  throw new Error("Unhandled schema type");
}
