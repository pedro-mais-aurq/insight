create table public.pricing_profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  version integer not null,
  is_active boolean not null default false,

  filament_price_per_kg numeric(12,4) not null,
  electricity_price_per_kwh numeric(12,4) not null,
  printer_average_consumption_kw numeric(12,6) not null,
  printer_purchase_price numeric(12,2) not null,
  printer_lifetime_hours numeric(12,2) not null,
  additional_wear_per_hour numeric(12,4) not null,
  maintenance_per_hour numeric(12,4) not null,
  effective_labor_per_hour numeric(12,4) not null,

  target_margin_rate numeric(8,6) not null,
  loss_reserve_rate numeric(8,6) not null,
  payment_fee_rate numeric(8,6) not null,

  packaging_per_piece numeric(12,4) not null,
  finishing_per_piece numeric(12,4) not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint pricing_profiles_name_not_blank
    check (length(btrim(name)) > 0),
  constraint pricing_profiles_version_positive
    check (version > 0),
  constraint pricing_profiles_filament_non_negative
    check (filament_price_per_kg >= 0),
  constraint pricing_profiles_electricity_non_negative
    check (electricity_price_per_kwh >= 0),
  constraint pricing_profiles_consumption_non_negative
    check (printer_average_consumption_kw >= 0),
  constraint pricing_profiles_purchase_price_non_negative
    check (printer_purchase_price >= 0),
  constraint pricing_profiles_lifetime_positive
    check (printer_lifetime_hours > 0),
  constraint pricing_profiles_wear_non_negative
    check (additional_wear_per_hour >= 0),
  constraint pricing_profiles_maintenance_non_negative
    check (maintenance_per_hour >= 0),
  constraint pricing_profiles_labor_non_negative
    check (effective_labor_per_hour >= 0),
  constraint pricing_profiles_margin_rate_valid
    check (target_margin_rate >= 0 and target_margin_rate < 1),
  constraint pricing_profiles_reserve_rate_valid
    check (loss_reserve_rate >= 0 and loss_reserve_rate < 1),
  constraint pricing_profiles_payment_rate_valid
    check (payment_fee_rate >= 0 and payment_fee_rate < 1),
  constraint pricing_profiles_packaging_non_negative
    check (packaging_per_piece >= 0),
  constraint pricing_profiles_finishing_non_negative
    check (finishing_per_piece >= 0),
  constraint pricing_profiles_name_version_unique
    unique (name, version)
);

create unique index pricing_profiles_single_active_idx
  on public.pricing_profiles ((is_active))
  where is_active = true;

create trigger pricing_profiles_set_updated_at
before update on public.pricing_profiles
for each row
execute function public.insight_set_updated_at();

alter table public.pricing_profiles enable row level security;
alter table public.pricing_profiles force row level security;

revoke all on table public.pricing_profiles from public, anon, authenticated;
grant select on table public.pricing_profiles to service_role;

comment on table public.pricing_profiles is
  'Configuração comercial privada consumida somente por Edge Functions com service role.';

insert into public.pricing_profiles (
  name,
  version,
  is_active,
  filament_price_per_kg,
  electricity_price_per_kwh,
  printer_average_consumption_kw,
  printer_purchase_price,
  printer_lifetime_hours,
  additional_wear_per_hour,
  maintenance_per_hour,
  effective_labor_per_hour,
  target_margin_rate,
  loss_reserve_rate,
  payment_fee_rate,
  packaging_per_piece,
  finishing_per_piece
) values (
  'Insight A1 Mini',
  1,
  true,
  90.0000,
  0.9000,
  0.060000,
  3000.00,
  5000.00,
  0.0000,
  0.4000,
  4.0000,
  0.650000,
  0.050000,
  0.000000,
  0.0000,
  0.0000
);

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
      'estimate-model-price'
    ));

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
    'save-model-analysis',
    'estimate-model-price'
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

revoke all on function public.consume_insight_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_insight_rate_limit(text, text, integer, integer)
  to service_role;
