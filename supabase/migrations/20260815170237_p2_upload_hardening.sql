alter table public.model_uploads
  add constraint model_uploads_storage_bucket_fixed
    check (storage_bucket = 'model-uploads'),
  add constraint model_uploads_storage_path_canonical
    check (
      storage_path is null
      or storage_path = id::text || '/model.' || extension
    ),
  add constraint model_uploads_uploading_requires_storage_path
    check (
      upload_status <> 'uploading'
      or storage_path is not null
    );
