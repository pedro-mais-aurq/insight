alter table public.model_uploads
  add column uploaded_at timestamptz,
  add column removed_at timestamptz;

update public.model_uploads
set uploaded_at = updated_at
where upload_status = 'uploaded'
  and uploaded_at is null;

update public.model_uploads
set removed_at = updated_at
where upload_status = 'removed'
  and removed_at is null;

do $$
begin
  if exists (
    select 1
    from public.model_uploads
    where size_bytes > 50000000
  ) then
    raise exception using
      errcode = 'check_violation',
      message = 'P3 migration blocked: model_uploads contains size_bytes above 50000000. Resolve legacy rows before adding model_uploads_size_bytes_max.';
  end if;
end;
$$;

alter table public.model_uploads
  add constraint model_uploads_size_bytes_max
    check (size_bytes <= 50000000),
  add constraint model_uploads_uploaded_requires_uploaded_at
    check (upload_status <> 'uploaded' or uploaded_at is not null),
  add constraint model_uploads_removed_requires_removed_at
    check (upload_status <> 'removed' or removed_at is not null);

update storage.buckets
set public = false,
    file_size_limit = 50000000
where id = 'model-uploads';

create index model_uploads_status_updated_at_idx
  on public.model_uploads (upload_status, updated_at);

create index model_uploads_status_uploaded_at_idx
  on public.model_uploads (upload_status, uploaded_at)
  where upload_status = 'uploaded';

create index model_uploads_status_removed_at_idx
  on public.model_uploads (upload_status, removed_at)
  where upload_status = 'removed';

create table public.insight_rate_limits (
  scope text not null,
  key_hash text not null,
  window_started_at timestamptz not null,
  request_count integer not null default 1,
  updated_at timestamptz not null default now(),

  primary key (scope, key_hash, window_started_at),

  constraint insight_rate_limits_scope_allowed
    check (scope in (
      'create-model-upload',
      'complete-model-upload',
      'remove-model-upload',
      'start-model-analysis',
      'save-model-analysis'
    )),
  constraint insight_rate_limits_key_hash_sha256
    check (key_hash ~ '^[0-9a-f]{64}$'),
  constraint insight_rate_limits_request_count_positive
    check (request_count > 0)
);

alter table public.insight_rate_limits enable row level security;

create index insight_rate_limits_window_started_at_idx
  on public.insight_rate_limits (window_started_at);

create or replace function public.consume_insight_rate_limit(
  p_scope text,
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns table (
  allowed boolean,
  request_count integer,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_window_started_at timestamptz;
  v_request_count integer;
begin
  if p_scope not in (
    'create-model-upload',
    'complete-model-upload',
    'remove-model-upload',
    'start-model-analysis',
    'save-model-analysis'
  )
    or p_key_hash !~ '^[0-9a-f]{64}$'
    or p_limit <= 0
    or p_window_seconds <= 0
  then
    raise exception 'INVALID_RATE_LIMIT_INPUT';
  end if;

  v_window_started_at := to_timestamp(
    floor(extract(epoch from v_now) / p_window_seconds) * p_window_seconds
  );

  insert into public.insight_rate_limits (
    scope,
    key_hash,
    window_started_at,
    request_count,
    updated_at
  ) values (
    p_scope,
    p_key_hash,
    v_window_started_at,
    1,
    v_now
  )
  on conflict (scope, key_hash, window_started_at)
  do update set
    request_count = public.insight_rate_limits.request_count + 1,
    updated_at = excluded.updated_at
  returning public.insight_rate_limits.request_count
  into v_request_count;

  return query select
    v_request_count <= p_limit,
    v_request_count,
    case
      when v_request_count > p_limit then greatest(
        1,
        ceil(extract(epoch from (
          v_window_started_at
          + make_interval(secs => p_window_seconds)
          - v_now
        )))::integer
      )
      else 0
    end;
end;
$$;

revoke all on table public.insight_rate_limits from anon, authenticated;
revoke all on function public.consume_insight_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_insight_rate_limit(text, text, integer, integer)
  to service_role;
