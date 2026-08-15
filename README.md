# Insight

Landing page da Insight para serviços de impressão 3D.

## Estado atual

- Upload seguro de STL, 3MF ou OBJ: implementado.
- Análise geométrica client-side com Web Worker: implementada.
- Viewer 3D interativo: implementado.
- Slicing e G-code: não implementados.
- Precificação real: não implementada.

## Pré-requisitos

- Node.js
- npm

## Instalação

```bash
npm ci
```

## Configuração

Copie `.env.example` para `.env` e preencha:

```dotenv
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

O cliente Supabase é inicializado somente quando solicitado. A página pode ser visualizada sem essas variáveis, mas o upload exige um projeto configurado.

As Edge Functions usam `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` somente no ambiente server-side. Para produção, configure também `ALLOWED_ORIGINS`, `INSIGHT_RATE_LIMIT_SALT` e `INSIGHT_CLEANUP_SECRET`. Consulte `supabase/.env.example`; não exponha essas variáveis no frontend.

O produto aceita no máximo 50.000.000 bytes por arquivo. O bucket e a configuração local usam 50 MB; antes de deploy, confirme que o limite global de Storage do projeto remoto não é inferior.

## Desenvolvimento

```bash
npm run dev
```

## Build

```bash
npm run build
```

## Testes

```bash
npm test
```

## Supabase local

Com Docker e Supabase CLI disponíveis:

```bash
supabase start
supabase db reset
supabase functions serve
```

As funções públicas `create-model-upload`, `complete-model-upload`, `remove-model-upload`, `start-model-analysis` e `save-model-analysis` estão configuradas sem JWT e protegidas por validação, CORS e rate limiting. `cleanup-model-uploads` é server-to-server e exige secret próprio. A P3 não implementa autenticação.

O agendamento horário de retenção está preparado em `supabase/schedules/setup-cleanup-cron.sql`, com URL e secret lidos do Vault. O SQL é manual e não significa que o cron tenha sido ativado. Não execute `supabase db push`, deploy de funções ou o SQL de cron em projeto remoto sem revisar e autorizar o destino.

## Arquitetura

Consulte [`docs/ARCHITECTURE_P1.md`](docs/ARCHITECTURE_P1.md) para a foundation, [`docs/ARCHITECTURE_P2.md`](docs/ARCHITECTURE_P2.md) para o fluxo de upload e [`docs/ARCHITECTURE_P3.md`](docs/ARCHITECTURE_P3.md) para análise, viewer e hardening operacional.
