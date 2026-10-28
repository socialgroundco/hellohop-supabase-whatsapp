/** Shared verbatim across runtimes. Only the raw body is signed. */
export async function verify(
  secret: string,
  rawBody: Uint8Array,
  signatureHeader?: string | null,
): Promise<boolean> {
  if (!secret || !signatureHeader || !/^[0-9a-f]{64}$/.test(signatureHeader)) return false;
  const signature = Uint8Array.from(signatureHeader.match(/../g)!, (hex) => Number.parseInt(hex, 16));
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"],
  );
  // Delegate the constant-time MAC comparison to the Web Crypto implementation.
  return crypto.subtle.verify("HMAC", key, signature, new Uint8Array(rawBody));
}
