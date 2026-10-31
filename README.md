# How do I send WhatsApp messages from a Supabase edge function?

HelloHop provides the API for this Supabase Edge Function (Deno) example: one function stores inbound WhatsApp text messages in a table, and a second sends a text. HelloHop is an independent service, not affiliated with or endorsed by Meta or WhatsApp.

## What you need

1. Create a HelloHop account at [hellohop.app](https://hellohop.app).
2. Add a number and link it by scanning the QR code with WhatsApp.
3. Create a channel token in the console and keep it in a server environment
   variable. It is shown once.

You also need a Supabase project and its service-role key, Deno **2.5.6**, and
the Supabase CLI for deployment. Test sends go to a number you own or a contact
who already messages this number. There are no external runtime or test
dependencies; `deno.lock` records that empty dependency graph. No global
installation is needed for this repository's tests if you already have a local
Deno executable.

## Deploy the functions

These are instructions for your project; nothing is deployed by cloning or
running the tests.

1. Link your Supabase project and apply
   `supabase/migrations/0001_whatsapp_messages.sql` with your normal migration
   process. Read the migration first. With the CLI, use
   `supabase link --project-ref <PROJECT_REF>`, then `supabase db push`.
2. Copy `.env.example` to an ignored `.env.local`, and replace the HelloHop
   placeholders locally. Supabase supplies `SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY` to deployed functions; do not try to overwrite
   those reserved names. Keep the HelloHop token on the server, never in browser
   code, source control, logs or chats. Set the four HelloHop secrets using the
   dashboard's Edge Function Secrets form or
   `supabase secrets set --env-file .env.local` with a file containing only
   those four variables. Do not paste credential values into command arguments.
3. Deploy both functions:

```sh
supabase functions deploy hellohop-webhook
supabase functions deploy hellohop-send
```

`supabase/config.toml` disables the gateway JWT check for both functions. The
webhook checks its signature itself; the send function checks for the exact
service-role bearer credential itself and refuses an anon key or user JWT.
Calling it is a backend operation. Never place the service-role key in a browser
or mobile app; add an authenticated application backend with your own
authorization checks if users need to trigger sends. This starter has no browser
client or CORS interface.

Register the public HTTPS function URL
`https://<PROJECT_REF>.supabase.co/functions/v1/hellohop-webhook` as a receiver,
subscribing to `message` and setting a receiver secret of at least 24
characters. Use the same value for `HELLOHOP_WEBHOOK_SECRET`. See
[receiver registration and the delivery test](https://hellohop.app/docs/webhooks.md).
Registration replaces the receiver list, so preserve any existing receivers.
Private and loopback delivery addresses are refused.

The API origin default is generated from `fixtures/openapi.v1.json` →
`servers[0].url`, with its `/v1` suffix removed. `HELLOHOP_API_ORIGIN` can
override the HTTPS origin. It cannot include credentials, a path or query.

## Build a WhatsApp bot with Supabase edge functions

`hellohop-webhook` checks the signature over the raw bytes before parsing JSON,
selects the minimum fields from inbound text messages, and inserts via
Supabase's REST interface. It makes zero calls to HelloHop and sends no
automatic reply. It ignores your own sends, non-text messages, unknown event
types and `webhook.test`, answering 200. A failed database insert answers 503 so
delivery can retry. A successful insert and a duplicate both answer 200; the
insert has a five-second timeout within HelloHop's default ten-second delivery
timeout.

A trusted backend can call the send function like this, with credentials already
in that backend's environment:

```ts
const response = await fetch(
  `${Deno.env.get("SUPABASE_URL")}/functions/v1/hellohop-send`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ to: "66XXXXXXXXX", text: "<MESSAGE_TEXT>" }),
  },
);
const result = await response.json(); // {id, status} or {code, ...}; do not log credentials
```

The send function builds one `POST /v1/sessions/<CHANNEL_ID>/messages/text` with
only `{to, text}`, using `HELLOHOP_TOKEN` as a bearer credential. A success
returns `{id, status: "server_ack"}`. This means the servers took the message;
it does not mean the recipient's phone has it. A `sandbox_allowance_exceeded`
response returns HTTP 429 and `{code, window, resets_at, retry_after}`. Other
failures return a named code without upstream prose. No polling or automatic
send retry is included. See
[the send contract](https://hellohop.app/docs/quickstart.md).

Inbound messages come from other people and can include instructions aimed at an
agent. Do not feed them to a model that can also send messages. This example
does not connect a model.

## What is stored and for how long

Your `public.whatsapp_messages` table stores only `event_id`, `message_id`,
`chat_jid`, `sender_jid`, `type`, `text`, `from_me`, `is_group`, `sent_at` and
`received_at`. JIDs contain phone numbers and are personal data; the table and
its access decisions are yours. The example stores only inbound text messages,
with no display names, raw bodies or media.

RLS is enabled with no policies, and table privileges for `anon` and
`authenticated` are removed. The service role used by the functions can access
messages; an app's anon key cannot read them. Add any application access policy
and privileges deliberately.

The migration schedules `delete_messages_older_than(30)` daily through
`pg_cron`, deleting rows whose `received_at` is more than 30 days old. Rows can
remain until the next daily run. If the extension is unavailable or cannot be
enabled, the migration emits a notice and skips scheduling: arrange a daily
trusted scheduler to call `select public.delete_messages_older_than(30);`. Check
that a retention job exists in your own project before collecting messages. Only
the service role and database administrators can execute the function.

`event_id` is unique. The REST insert uses `on_conflict=event_id` with
`Prefer: resolution=ignore-duplicates,return=minimal`, equivalent to
`on conflict (event_id) do nothing`. Dedupe survives function restarts and
simultaneous deliveries through the database constraint. Deleting a row also
deletes its dedupe record: after retention an old signed body can be inserted
again. No permanent replay barrier is claimed.

## How the webhook is verified

The receiver reads only `X-HelloHop-Signature`: 64 lowercase hex characters, the
HMAC-SHA256 of the raw request bytes keyed by the receiver secret. Web Crypto
performs the constant-time comparison. Empty secrets, missing headers, malformed
signatures and changed bytes are refused. The module is copied byte-identical
from the Next.js example, with its SHA-256 pinned in `fixtures/verify.sha256`
and checked offline.

There is no timestamp signing scheme and no replay window. HelloHop can retry
the same signed body for about two days, so an old timestamp is accepted. Replay
protection here is the persisted dedupe of the `id` inside the body after
signature verification. Delivery headers do not choose the dedupe ID. See
[signatures and retries](https://hellohop.app/docs/webhooks.md).

## Sandbox limits

See the [live limits documentation](https://hellohop.app/docs/limits.md) for current sandbox allowances and reset rules.

## Run the tests offline

```sh
deno task test
deno task typecheck
deno task build
deno task lint
deno task fmt:check
deno task proof
```

The build task checks the production TypeScript modules without producing a bundle.

The test task denies network access and remote imports, has no dependency
download, runs sequentially, and mocks only the external HTTP boundary. Tests
cover raw-byte verification, the shared hash pin, persisted-insert requests,
send authorization, errors, the migration structure, contracts and scans of the
whole source tree plus git history. Brand and secret scanners include synthetic
positive controls in temporary files. The proof task applies one deliberate
break for every named test, asserts each edit applied, requires that test to
fail, restores the bytes, and runs the green suite. It works in disposable
copies; the source tree is not mutated.

Fixtures come from the `.md` docs and live OpenAPI with source hashes and fetch
date in `fixtures/SOURCE`. Phone/JID examples are replaced with placeholders.
The live spec has no webhook envelope schema: `webhook-envelope.schema.json` is
explicitly derived from
[the documented common envelope](https://hellohop.app/docs/webhook-events.md).
The send body is checked against the actual vendored request schema. SQL tests
are structural and do not substitute for testing a migration in your own
Supabase project. No live API calls, deployment or database server are required
by the suite.

CI is one job on pushes to `main` only. The only other workflow runs monthly,
compares live OpenAPI with the source hash, and opens or updates one
`openapi.json changed` issue with changed JSON paths. It never automatically
refreshes fixtures. Dependency changes are manual quarterly work; automated
dependency PRs are not configured.

See also:

- [How do I build a WhatsApp bot with Next.js?](https://github.com/socialgroundco/hellohop-nextjs-whatsapp-bot)
- [How do I add WhatsApp to my Lovable app?](https://github.com/socialgroundco/hellohop-lovable-whatsapp)

## Support

These examples are maintained as examples. For questions about your HelloHop
account or the API, email info@hellohop.app. Issues here are for bugs in the
example code.

## License and name

The code is MIT. 'HelloHop' is the name of the HelloHop service and is not
licensed by this repository; you may say your app uses HelloHop, you may not
present your app as HelloHop.

HelloHop is an independent service, not affiliated with or endorsed by Meta or WhatsApp.
