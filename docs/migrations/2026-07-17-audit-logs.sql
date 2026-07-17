-- Audit-tabel voor het Niva-dashboard. De code (lib/audit.ts) schreef hier al
-- naar, maar de tabel bestond nooit; alle audit-inserts faalden stilletjes.
-- Append-only: authenticated mag alleen INSERTen, niets lezen/wijzigen/wissen.
-- Lezen en beheren kan uitsluitend via de service role (API-routes / beheer).

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  user_email text,
  action text not null,
  details jsonb,
  created_at timestamptz not null default now()
);

alter table public.audit_logs enable row level security;

create policy "Authenticated can insert audit entries"
  on public.audit_logs for insert to authenticated with check (true);

-- Bewust GEEN select/update/delete-policies voor authenticated:
-- de log is niet client-side leesbaar en niet te manipuleren.

create index if not exists audit_logs_action_created_idx
  on public.audit_logs (action, created_at desc);
create index if not exists audit_logs_details_call_id_idx
  on public.audit_logs ((details ->> 'call_id'));
