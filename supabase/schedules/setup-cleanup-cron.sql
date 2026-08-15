-- Preparação manual para ambiente remoto. Este arquivo não é uma migration.
-- Antes de executar, crie no Supabase Vault os secrets:
--   insight_project_url     Ex.: https://<project-ref>.supabase.co
--   insight_cleanup_secret  Mesmo valor de INSIGHT_CLEANUP_SECRET na função.
-- Não versione os valores.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'insight-cleanup-model-uploads-hourly',
  '0 * * * *',
  $$
  select net.http_post(
    url := (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'insight_project_url'
    ) || '/functions/v1/cleanup-model-uploads',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-insight-cleanup-secret', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'insight_cleanup_secret'
      )
    ),
    body := '{}'::jsonb
  );
  $$
);
