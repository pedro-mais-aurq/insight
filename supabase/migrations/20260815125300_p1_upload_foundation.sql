create table public.model_uploads (
  id uuid primary key default gen_random_uuid(),
  original_name text not null,
  extension text not null,
  mime_type text,
  size_bytes bigint not null,
  storage_bucket text not null default 'model-uploads',
  storage_path text unique,
  upload_status text not null default 'pending',
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint model_uploads_original_name_not_blank
    check (length(btrim(original_name)) > 0),
  constraint model_uploads_extension_allowed
    check (extension = lower(extension) and extension in ('stl', '3mf', 'obj')),
  constraint model_uploads_size_bytes_positive
    check (size_bytes > 0),
  constraint model_uploads_upload_status_allowed
    check (upload_status in ('pending', 'uploading', 'uploaded', 'failed', 'removed')),
  constraint model_uploads_uploaded_requires_storage_path
    check (upload_status <> 'uploaded' or storage_path is not null)
);

create table public.model_analyses (
  id uuid primary key default gen_random_uuid(),
  model_upload_id uuid not null unique
    references public.model_uploads(id) on delete cascade,
  analysis_status text not null default 'pending',
  result jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint model_analyses_analysis_status_allowed
    check (analysis_status in ('pending', 'processing', 'completed', 'failed')),
  constraint model_analyses_completed_requires_result
    check (analysis_status <> 'completed' or result is not null)
);

create or replace function public.insight_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger model_uploads_set_updated_at
before update on public.model_uploads
for each row
execute function public.insight_set_updated_at();

create trigger model_analyses_set_updated_at
before update on public.model_analyses
for each row
execute function public.insight_set_updated_at();

create index model_uploads_upload_status_idx
  on public.model_uploads (upload_status);

create index model_uploads_created_at_idx
  on public.model_uploads (created_at);

create index model_analyses_analysis_status_idx
  on public.model_analyses (analysis_status);

alter table public.model_uploads enable row level security;
alter table public.model_analyses enable row level security;

insert into storage.buckets (id, name, public)
values ('model-uploads', 'model-uploads', false)
on conflict (id) do update
set public = false;
