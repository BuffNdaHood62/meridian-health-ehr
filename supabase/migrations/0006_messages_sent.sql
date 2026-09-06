-- ============================================================================
-- 0006_messages_sent.sql — support outbound (composed) messages
-- The demo compose flow stores `sent: true` + a free-text recipient on each
-- message; the base schema (0001) only modeled inbound org messages.
-- ============================================================================
alter table public.messages add column if not exists recipient text;
alter table public.messages add column if not exists sent boolean not null default false;

-- RLS is unchanged: messages_org already scopes every row to the caller's org,
-- so a composed message is visible to org members per the existing policy.
