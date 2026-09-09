# Insight

Landing page da Insight para serviços de impressão 3D.

## Estado atual

- Upload seguro de STL, 3MF ou OBJ: implementado.
- Análise geométrica client-side com Web Worker: implementada.
- Viewer 3D interativo: implementado.
- Motor de precificação server-side com perfil privado: implementado.
- Worker OCI com OrcaSlicer 2.4.2 pinado: implementado.
- Estimativa automática de peso e tempo: implementada pela P5.
- Integração P3 → P5 → P4: implementada.
- Barra progressiva de análise, preparo, fabricação e preço: implementada e exibida somente após o início da análise.
- Aviso de análise prolongada aos 20 segundos com atalho para contato: implementado.
- Continuidade comercial por WhatsApp em sucesso ou falha: implementada; requer número oficial configurado.

O deploy de produção permanece bloqueado até o `docker build` concluir o smoke real,
o fingerprint emitido pela imagem ser ativado no banco e o gate
`CALIBRATION_PENDING` ser aprovado. Nenhum resultado de slicing foi simulado. A rodada
de hardening `p5-orca-2.4.2-r4` usa um profile virtual finito apenas para estimativa,
mantendo o profile físico da A1 mini intacto.

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
VITE_WHATSAPP_NUMBER=
```

`VITE_WHATSAPP_NUMBER` deve receber o número oficial da Insight com DDI e somente
dígitos. O frontend não possui telefone de fallback: sem essa configuração, o CTA
permanece visível quando há contexto, mas desabilitado, evitando encaminhar o usuário
para um destino inventado.

O cliente Supabase é inicializado somente quando solicitado. A página pode ser visualizada sem essas variáveis, mas o upload exige um projeto configurado.

As Edge Functions usam `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` somente no ambiente server-side. Para produção, configure também `ALLOWED_ORIGINS`, `INSIGHT_RATE_LIMIT_SALT`, `INSIGHT_CLEANUP_SECRET`, `MANUFACTURING_WORKER_URL` e `MANUFACTURING_WORKER_HMAC_SECRET`. Consulte `supabase/.env.example`; não exponha essas variáveis no frontend.

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

As funções públicas `create-model-upload`, `complete-model-upload`, `remove-model-upload`, `start-model-analysis`, `save-model-analysis`, `start-manufacturing-estimate`, `get-manufacturing-estimate` e `estimate-model-price` estão configuradas sem JWT e protegidas por validação, CORS e rate limiting. `cleanup-model-uploads` é server-to-server e exige secret próprio. A P5 não implementa autenticação.

`estimate-model-price` recebe somente `weightGrams`, `printTimeHours` e `quantity`. O perfil financeiro permanece na tabela privada `pricing_profiles`; a resposta pública contém apenas preço unitário, preço total, quantidade e moeda. A P5 fornece peso e tempo medidos pelo OrcaSlicer; alterar quantidade recalcula somente a P4 e não executa um novo slice.

O agendamento horário de retenção está preparado em `supabase/schedules/setup-cleanup-cron.sql`, com URL e secret lidos do Vault. O SQL é manual e não significa que o cron tenha sido ativado. Não execute `supabase db push`, deploy de funções ou o SQL de cron em projeto remoto sem revisar e autorizar o destino.

## Arquitetura

Consulte [`docs/ARCHITECTURE_P1.md`](docs/ARCHITECTURE_P1.md) para a foundation, [`docs/ARCHITECTURE_P2.md`](docs/ARCHITECTURE_P2.md) para o fluxo de upload, [`docs/ARCHITECTURE_P3.md`](docs/ARCHITECTURE_P3.md) para análise/viewer, [`docs/ARCHITECTURE_P4.md`](docs/ARCHITECTURE_P4.md) para precificação e [`docs/ARCHITECTURE_P5.md`](docs/ARCHITECTURE_P5.md) para slicing. O deploy completo está em [`docs/DEPLOY_P5.md`](docs/DEPLOY_P5.md) e o relatório da rodada atual em [`docs/DELIVERY_P5_R4.md`](docs/DELIVERY_P5_R4.md).

A rodada de apresentação está documentada em
[`docs/DELIVERY_UI_UX_HARDENING.md`](docs/DELIVERY_UI_UX_HARDENING.md).
