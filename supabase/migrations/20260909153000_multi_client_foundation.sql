-- Multi-client foundation applied after P5 Manufacturing.
--
-- Existing uploads predate tenant awareness and therefore belong to Insight.
-- client_id intentionally remains nullable in this migration so the currently
-- deployed model-upload Edge Functions can keep inserting rows during rollout.

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint clients_slug_unique unique (slug),
  constraint clients_slug_format
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint clients_name_not_blank
    check (length(btrim(name)) > 0)
);

create trigger clients_set_updated_at
before update on public.clients
for each row
execute function public.insight_set_updated_at();

alter table public.clients enable row level security;
alter table public.clients force row level security;

revoke all on table public.clients from public, anon, authenticated;
grant select on table public.clients to service_role;

comment on table public.clients is
  'Clientes que compartilham a infraestrutura do Insight; acesso somente por Edge Functions com service role.';

insert into public.clients (slug, name, is_active)
values
  ('insight', 'Insight', true),
  ('ana-3d', 'Ana 3D', true)
on conflict (slug) do nothing;

alter table public.model_uploads
  add column client_id uuid;

comment on column public.model_uploads.client_id is
  'Temporariamente nullable durante o rollout das Edge Functions multi-client.';

alter table public.model_uploads
  add constraint model_uploads_client_id_fkey
    foreign key (client_id)
    references public.clients (id)
    not valid;

update public.model_uploads as uploads
set client_id = insight_client.id
from public.clients as insight_client
where insight_client.slug = 'insight'
  and uploads.client_id is null;

do $$
begin
  if not exists (
    select 1
    from public.clients
    where slug = 'insight'
  ) then
    raise exception using
      errcode = 'check_violation',
      message = 'Multi-client foundation blocked: insight client seed is missing.';
  end if;

  if exists (
    select 1
    from public.model_uploads
    where client_id is null
  ) then
    raise exception using
      errcode = 'check_violation',
      message = 'Multi-client foundation blocked: model_uploads contains rows without client_id after Insight backfill.';
  end if;
end;
$$;

alter table public.model_uploads
  validate constraint model_uploads_client_id_fkey;

create index model_uploads_client_id_idx
  on public.model_uploads (client_id);

create index model_uploads_client_id_upload_status_idx
  on public.model_uploads (client_id, upload_status);
