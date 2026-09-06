create table public.manufacturing_profiles (
  id uuid primary key default gen_random_uuid(),
  profile_key text not null,
  version integer not null,
  label text not null,
  printer_model text not null,
  nozzle_diameter_mm numeric(4,2) not null,
  material_code text not null,
  material_label text not null,
  layer_height_mm numeric(4,2) not null,
  slicer_engine text not null,
  slicer_version text not null,
  profile_bundle_version text not null,
  profile_fingerprint text,
  orientation_policy text not null,
  support_policy text not null,
  preset_manifest jsonb not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint manufacturing_profiles_key_version_unique unique (profile_key, version),
  constraint manufacturing_profiles_key_valid check (profile_key ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  constraint manufacturing_profiles_version_positive check (version > 0),
  constraint manufacturing_profiles_label_not_blank check (length(btrim(label)) > 0),
  constraint manufacturing_profiles_nozzle_positive check (nozzle_diameter_mm > 0),
  constraint manufacturing_profiles_layer_positive check (layer_height_mm > 0),
  constraint manufacturing_profiles_material_code_valid check (material_code ~ '^[A-Z0-9_-]{1,32}$'),
  constraint manufacturing_profiles_material_label_not_blank check (length(btrim(material_label)) > 0),
  constraint manufacturing_profiles_bundle_version_valid check (profile_bundle_version ~ '^[a-z0-9][a-z0-9.-]{0,79}$'),
  constraint manufacturing_profiles_orientation_policy check (orientation_policy = 'preserve'),
  constraint manufacturing_profiles_support_policy_not_blank check (length(btrim(support_policy)) > 0),
  constraint manufacturing_profiles_orca_version check (
    slicer_engine = 'OrcaSlicer' and slicer_version = '2.4.2'
  ),
  constraint manufacturing_profiles_fingerprint_sha256 check (
    profile_fingerprint is null or profile_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  constraint manufacturing_profiles_manifest_object check (jsonb_typeof(preset_manifest) = 'object')
);

create unique index manufacturing_profiles_single_active_idx
  on public.manufacturing_profiles ((is_active))
  where is_active = true;

create trigger manufacturing_profiles_set_updated_at
before update on public.manufacturing_profiles
for each row execute function public.insight_set_updated_at();

alter table public.manufacturing_profiles enable row level security;
alter table public.manufacturing_profiles force row level security;
revoke all on table public.manufacturing_profiles from public, anon, authenticated;
grant select, update on table public.manufacturing_profiles to service_role;

comment on table public.manufacturing_profiles is
  'Perfis técnicos de fabricação, separados dos perfis financeiros da P4. Um perfil só pode ser ativado após pin administrativo do fingerprint produzido pela imagem validada.';

insert into public.manufacturing_profiles (
  profile_key,
  version,
  label,
  printer_model,
  nozzle_diameter_mm,
  material_code,
  material_label,
  layer_height_mm,
  slicer_engine,
  slicer_version,
  profile_bundle_version,
  profile_fingerprint,
  orientation_policy,
  support_policy,
  preset_manifest,
  is_active
) values (
  'insight-a1m-pla-020-v1',
  1,
  'Bambu Lab A1 mini · 0,4 mm · PLA · camada 0,20 mm',
  'Bambu Lab A1 mini',
  0.40,
  'PLA',
  'PLA',
  0.20,
  'OrcaSlicer',
  '2.4.2',
  'insight-a1m-pla-020-v1',
  null,
  'preserve',
  'official-process-preset',
  jsonb_build_object(
    'source', 'OrcaSlicer release AppImage resources/profiles',
    'sourceRelease', 'v2.4.2',
    'machinePreset', 'Bambu Lab A1 mini 0.4 nozzle',
    'processPreset', '0.20mm Standard @BBL A1M',
    'filamentPreset', 'Bambu PLA Basic @BBL A1M',
    'supportPolicy', 'official-process-preset'
  ),
  false
);

create table public.manufacturing_estimates (
  id uuid primary key default gen_random_uuid(),
  model_upload_id uuid not null references public.model_uploads(id) on delete cascade,
  manufacturing_profile_id uuid not null references public.manufacturing_profiles(id),
  profile_version integer not null,
  slicer_engine text not null,
  slicer_version text not null,
  profile_fingerprint text,
  source_unit text not null,
  unit_scale numeric(12,6) not null,
  cache_key text not null unique,
  estimate_status text not null default 'pending',
  weight_grams numeric(12,4),
  print_time_seconds bigint,
  support_used boolean,
  warnings jsonb not null default '[]'::jsonb,
  result_source text,
  error_code text,
  attempt_count integer not null default 0,
  started_at timestamptz,
  heartbeat_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint manufacturing_estimates_cache_sha256 check (cache_key ~ '^[0-9a-f]{64}$'),
  constraint manufacturing_estimates_engine_version check (
    slicer_engine = 'OrcaSlicer' and slicer_version = '2.4.2'
  ),
  constraint manufacturing_estimates_fingerprint_sha256 check (
    profile_fingerprint is null or profile_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  constraint manufacturing_estimates_warnings_array check (jsonb_typeof(warnings) = 'array'),
  constraint manufacturing_estimates_status_allowed check (
    estimate_status in ('pending', 'processing', 'completed', 'failed')
  ),
  constraint manufacturing_estimates_source_unit_allowed check (source_unit in ('mm', 'cm', 'm', 'inch')),
  constraint manufacturing_estimates_unit_scale_allowed check (unit_scale in (1, 10, 1000, 25.4)),
  constraint manufacturing_estimates_attempt_non_negative check (attempt_count >= 0),
  constraint manufacturing_estimates_completed_result check (
    estimate_status <> 'completed'
    or (
      weight_grams > 0 and weight_grams <= 10000
      and print_time_seconds > 0 and print_time_seconds <= 2592000
      and profile_fingerprint is not null
      and completed_at is not null
      and failed_at is null
      and error_code is null
    )
  ),
  constraint manufacturing_estimates_noncompleted_no_result check (
    estimate_status = 'completed' or (weight_grams is null and print_time_seconds is null)
  ),
  constraint manufacturing_estimates_failed_state check (
    estimate_status <> 'failed'
    or (failed_at is not null and completed_at is null and error_code is not null)
  ),
  constraint manufacturing_estimates_processing_state check (
    estimate_status <> 'processing'
    or (started_at is not null and heartbeat_at is not null and failed_at is null)
  )
);

create trigger manufacturing_estimates_set_updated_at
before update on public.manufacturing_estimates
for each row execute function public.insight_set_updated_at();

create index manufacturing_estimates_upload_idx
  on public.manufacturing_estimates (model_upload_id, created_at desc);
create index manufacturing_estimates_recovery_idx
  on public.manufacturing_estimates (estimate_status, heartbeat_at)
  where estimate_status = 'processing';

alter table public.manufacturing_estimates enable row level security;
alter table public.manufacturing_estimates force row level security;
revoke all on table public.manufacturing_estimates from public, anon, authenticated;
grant select, insert, update on table public.manufacturing_estimates to service_role;

create or replace function public.claim_manufacturing_estimate(
  p_model_upload_id uuid,
  p_manufacturing_profile_id uuid,
  p_profile_version integer,
  p_slicer_version text,
  p_source_unit text,
  p_unit_scale numeric,
  p_cache_key text
)
returns table (
  estimate_id uuid,
  estimate_status text,
  should_dispatch boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_estimate public.manufacturing_estimates%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if p_cache_key !~ '^[0-9a-f]{64}$'
    or p_profile_version <= 0
    or p_slicer_version <> '2.4.2'
    or p_source_unit not in ('mm', 'cm', 'm', 'inch')
    or p_unit_scale not in (1, 10, 1000, 25.4)
  then
    raise exception 'INVALID_MANUFACTURING_CLAIM';
  end if;

  insert into public.manufacturing_estimates (
    model_upload_id,
    manufacturing_profile_id,
    profile_version,
    slicer_engine,
    slicer_version,
    source_unit,
    unit_scale,
    cache_key
  ) values (
    p_model_upload_id,
    p_manufacturing_profile_id,
    p_profile_version,
    'OrcaSlicer',
    p_slicer_version,
    p_source_unit,
    p_unit_scale,
    p_cache_key
  ) on conflict (cache_key) do nothing;

  select * into v_estimate
  from public.manufacturing_estimates
  where cache_key = p_cache_key
  for update;

  if v_estimate.estimate_status = 'completed' then
    return query select v_estimate.id, v_estimate.estimate_status, false;
    return;
  end if;

  if v_estimate.estimate_status = 'processing'
    and v_estimate.heartbeat_at > v_now - interval '10 minutes'
  then
    return query select v_estimate.id, v_estimate.estimate_status, false;
    return;
  end if;

  if v_estimate.estimate_status = 'failed'
    and coalesce(v_estimate.error_code, '') not in (
      'SLICER_UNAVAILABLE',
      'SLICER_TIMEOUT',
      'SLICER_DOWNLOAD_FAILED',
      'MANUFACTURING_START_FAILED',
      'MANUFACTURING_SAVE_FAILED',
      'WORKER_BUSY'
    )
  then
    return query select v_estimate.id, v_estimate.estimate_status, false;
    return;
  end if;

  update public.manufacturing_estimates
  set estimate_status = 'processing',
      weight_grams = null,
      print_time_seconds = null,
      result_source = null,
      profile_fingerprint = null,
      support_used = null,
      warnings = '[]'::jsonb,
      error_code = null,
      attempt_count = attempt_count + 1,
      started_at = v_now,
      heartbeat_at = v_now,
      completed_at = null,
      failed_at = null
  where id = v_estimate.id;

  return query select v_estimate.id, 'processing'::text, true;
end;
$$;

revoke all on function public.claim_manufacturing_estimate(uuid, uuid, integer, text, text, numeric, text)
  from public, anon, authenticated;
grant execute on function public.claim_manufacturing_estimate(uuid, uuid, integer, text, text, numeric, text)
  to service_role;

create or replace function public.activate_manufacturing_profile(
  p_profile_key text,
  p_version integer,
  p_fingerprint text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_fingerprint !~ '^[0-9a-f]{64}$' then
    return false;
  end if;

  perform 1
  from public.manufacturing_profiles
  where profile_key = p_profile_key
    and version = p_version
    and (profile_fingerprint is null or profile_fingerprint = p_fingerprint)
  for update;
  if not found then
    return false;
  end if;

  update public.manufacturing_profiles
  set is_active = false
  where is_active = true
    and (profile_key, version) <> (p_profile_key, p_version);

  update public.manufacturing_profiles
  set profile_fingerprint = p_fingerprint,
      is_active = true
  where profile_key = p_profile_key
    and version = p_version
    and (profile_fingerprint is null or profile_fingerprint = p_fingerprint);

  return found;
end;
$$;

revoke all on function public.activate_manufacturing_profile(text, integer, text)
  from public, anon, authenticated;
grant execute on function public.activate_manufacturing_profile(text, integer, text)
  to service_role;

alter table public.insight_rate_limits
  drop constraint insight_rate_limits_scope_allowed;

alter table public.insight_rate_limits
  add constraint insight_rate_limits_scope_allowed
    check (scope in (
      'create-model-upload',
      'complete-model-upload',
      'remove-model-upload',
      'start-model-analysis',
      'save-model-analysis',
      'estimate-model-price',
      'start-manufacturing-estimate',
      'get-manufacturing-estimate'
    ));

create or replace function public.consume_insight_rate_limit(
  p_scope text,
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns table (allowed boolean, request_count integer, retry_after_seconds integer)
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
    'create-model-upload', 'complete-model-upload', 'remove-model-upload',
    'start-model-analysis', 'save-model-analysis', 'estimate-model-price',
    'start-manufacturing-estimate', 'get-manufacturing-estimate'
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
    scope, key_hash, window_started_at, request_count, updated_at
  ) values (p_scope, p_key_hash, v_window_started_at, 1, v_now)
  on conflict (scope, key_hash, window_started_at)
  do update set request_count = public.insight_rate_limits.request_count + 1,
                updated_at = excluded.updated_at
  returning public.insight_rate_limits.request_count into v_request_count;

  return query select
    v_request_count <= p_limit,
    v_request_count,
    case when v_request_count > p_limit then greatest(
      1,
      ceil(extract(epoch from (
        v_window_started_at + make_interval(secs => p_window_seconds) - v_now
      )))::integer
    ) else 0 end;
end;
$$;

revoke all on function public.consume_insight_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_insight_rate_limit(text, text, integer, integer)
  to service_role;
