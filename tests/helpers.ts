function check(value: unknown, message = "assertion failed"): void { if (!value) throw new Error(message); }
export const assert = Object.assign(check, {
 equal(actual: unknown, expected: unknown) { check(Object.is(actual,expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); },
 notEqual(actual: unknown, expected: unknown) { check(!Object.is(actual,expected),"expected different values"); },
 deepEqual(actual: unknown, expected: unknown) { check(JSON.stringify(actual)===JSON.stringify(expected),`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); },
 match(actual: string, expected: RegExp) { check(expected.test(actual),"expected pattern did not match"); },
});
export const fixture = (name: string) => JSON.parse(Deno.readTextFileSync(`fixtures/${name}.json`));
export const rawFixture = () => Deno.readTextFileSync("fixtures/delivery-message.json");
export const secret = "<24 or more characters you choose>";
export const bytes = (text: string) => new TextEncoder().encode(text);
export const hex = (value: ArrayBuffer) => [...new Uint8Array(value)].map(b=>b.toString(16).padStart(2,"0")).join("");
export const sha256 = async (value: Uint8Array) => hex(await crypto.subtle.digest("SHA-256", new Uint8Array(value)));
export async function sign(raw: string | Uint8Array, key = secret) {
 // An empty HMAC key is equivalent to one zero byte (both pad to the same block).
 const imported=await crypto.subtle.importKey("raw",key?bytes(key):new Uint8Array([0]),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 return hex(await crypto.subtle.sign("HMAC",imported,typeof raw==="string"?bytes(raw):new Uint8Array(raw)));
}
