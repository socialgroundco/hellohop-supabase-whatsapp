import { assert } from "./helpers.ts";
const sql = () =>
  Deno.readTextFileSync("supabase/migrations/0001_whatsapp_messages.sql");
Deno.test("migration: SQL contains UNIQUE (event_id), ENABLE ROW LEVEL SECURITY, the retention function, and the guarded pg_cron block; no policy grants select to anon", () => {
  const source = sql();
  for (
    const pattern of [
      /UNIQUE \(event_id\)/i,
      /ENABLE ROW LEVEL SECURITY/i,
      /delete_messages_older_than\(days int\)/i,
      /do \$cron\$/i,
      /create extension if not exists pg_cron/i,
      /exception when feature_not_supported or undefined_file or insufficient_privilege/i,
      /cron.schedule/i,
      /delete_messages_older_than\(30\)/i,
    ]
  ) assert.match(source, pattern);
  assert(!/create policy/i.test(source));
});
Deno.test("migration: column list equals the documented minimum and excludes push_name and raw payload", () => {
  const source = sql();
  const table = source.match(
    /create table public.whatsapp_messages \(([\s\S]*?)\n\);/i,
  )![1];
  const columns = table.split("\n").map((line) => line.trim()).filter((line) =>
    line && !line.startsWith("constraint")
  ).map((line) => line.split(/\s/)[0]);
  assert.deepEqual(columns, [
    "event_id",
    "message_id",
    "chat_jid",
    "sender_jid",
    "type",
    "text",
    "from_me",
    "is_group",
    "sent_at",
    "received_at",
  ]);
  assert(!table.includes("push_name"));
  assert(!table.includes("payload"));
});
Deno.test("migration: retention uses received_at and rejects nonpositive days; only service role may execute", () => {
  const source = sql();
  assert.match(source, /days is null or days < 1/i);
  assert.match(
    source,
    /received_at < now\(\) - make_interval\(days => days\)/i,
  );
  assert.match(source, /security invoker/i);
  assert.match(
    source,
    /revoke all on function public.delete_messages_older_than\(int\) from public, anon, authenticated/i,
  );
  assert.match(
    source,
    /grant execute on function public.delete_messages_older_than\(int\) to service_role/i,
  );
  assert.match(
    source,
    /revoke all on table public.whatsapp_messages from anon, authenticated/i,
  );
});

Deno.test("migration: unavailable or unloaded pg_cron skips extension creation before scheduling", () => {
  const source = sql();
  const extension = source.indexOf("create extension if not exists pg_cron");
  assert.match(source, /pg_available_extensions/);
  assert.match(source, /shared_preload_libraries/);
  assert.match(source, /pg_extension/);
  assert(source.indexOf("pg_available_extensions") < extension);
  assert(source.indexOf("shared_preload_libraries") < extension);
  assert.match(
    source,
    /if not exists \(select 1 from pg_extension where extname = 'pg_cron'\)/i,
  );
  assert.match(
    source,
    /raise notice 'pg_cron unavailable or not preloaded; run retention daily with your scheduler';\s*return;/i,
  );
});
