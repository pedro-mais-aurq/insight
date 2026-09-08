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
  'insight-estimation-a1m-pla-020-v1',
  1,
  'Estimativa comercial · parâmetros A1 mini · 0,4 mm · PLA · camada 0,20 mm',
  'Bambu Lab A1 mini',
  0.40,
  'PLA',
  'PLA',
  0.20,
  'OrcaSlicer',
  '2.4.2',
  'p5-orca-2.4.2-r4',
  null,
  'preserve',
  'official-process-preset',
  jsonb_build_object(
    'purpose', 'commercial-estimation',
    'baseProfileKey', 'insight-a1m-pla-020-v1',
    'source', 'OrcaSlicer release AppImage resources/profiles',
    'sourceRelease', 'v2.4.2',
    'machinePreset', 'Bambu Lab A1 mini 0.4 nozzle',
    'processPreset', '0.20mm Standard @BBL A1M',
    'filamentPreset', 'Bambu PLA Basic @BBL A1M',
    'supportPolicy', 'official-process-preset',
    'virtualBuildVolumeMm', jsonb_build_object('x', 2000, 'y', 2000, 'z', 2000)
  ),
  false
);

comment on table public.manufacturing_profiles is
  'Perfis técnicos de fabricação e estimativa, separados dos perfis financeiros. O profile real permanece histórico; somente um profile validado por fingerprint pode ficar ativo.';

alter table public.manufacturing_estimates
  drop constraint manufacturing_estimates_completed_result;

alter table public.manufacturing_estimates
  add constraint manufacturing_estimates_completed_result check (
    estimate_status <> 'completed'
    or (
      weight_grams > 0 and weight_grams <= 100000
      and print_time_seconds > 0 and print_time_seconds <= 36000000
      and profile_fingerprint is not null
      and completed_at is not null
      and failed_at is null
      and error_code is null
    )
  );
