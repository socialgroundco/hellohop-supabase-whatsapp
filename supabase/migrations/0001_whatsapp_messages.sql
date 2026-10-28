create table public.whatsapp_messages (
  event_id text not null,
  message_id text not null,
  chat_jid text not null,
  sender_jid text not null,
  type text not null,
  text text not null,
  from_me boolean not null,
  is_group boolean not null,
  sent_at timestamptz not null,
  received_at timestamptz not null default now(),
  constraint whatsapp_messages_event_unique UNIQUE (event_id)
);
alter table public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
revoke all on table public.whatsapp_messages from anon, authenticated;
grant select, insert, delete on table public.whatsapp_messages to service_role;
create index whatsapp_messages_received_at on public.whatsapp_messages (received_at);

create function public.delete_messages_older_than(days int)
returns bigint
language plpgsql
security invoker
set search_path = pg_catalog
as $retention$
declare deleted bigint;
begin
  if days is null or days < 1 then
    raise exception 'days must be positive';
  end if;
  delete from public.whatsapp_messages
    where received_at < now() - make_interval(days => days);
  get diagnostics deleted = row_count;
  return deleted;
end;
$retention$;
revoke all on function public.delete_messages_older_than(int) from public, anon, authenticated;
grant execute on function public.delete_messages_older_than(int) to service_role;

-- Extension absence is expected on some local Postgres installations.
do $cron$
begin
  begin
    create extension if not exists pg_cron;
  exception when feature_not_supported or undefined_file or insufficient_privilege then
    raise notice 'pg_cron unavailable; run the retention function daily using your scheduler';
    return;
  end;
  perform cron.schedule(
    'hellohop-message-retention', '0 3 * * *',
    'select public.delete_messages_older_than(30);'
  );
end;
$cron$;
