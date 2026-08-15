# Insight — Arquitetura P1

## Stack

- Vite
- Vanilla JavaScript com ES Modules
- Supabase PostgreSQL
- Supabase Storage

## Estado da implementação

- P1: implementada
- P2: não implementada
- P3: não implementada

A P1 define contratos e infraestrutura. Não há seleção, drag-and-drop, upload, parsing, análise geométrica ou visualização 3D funcionais.

## Fluxo de evolução

```text
P1 Foundation
      ↓
P2 Upload
      ↓
UploadedModel
      ↓
P3 Analysis
      ↓
ModelAnalysis
```

## Contratos de frontend

P2 recebe `UPLOAD_CONFIG`, `UPLOAD_STATES`, `createInitialUploadState()`, `canTransition()`, `getSupabaseClient()`, `[data-upload-root]` e `[data-upload-dropzone]`.

A ausência de arquivo é representada por `null`. Antes de existir um registro persistido, `id` é `null`; no banco, todo registro de upload possui UUID obrigatório.

## Persistência preparada

- `public.model_uploads`: metadados e estado de persistência do arquivo.
- `public.model_analyses`: análise futura em relação opcional 1:1 com um upload.

A migration apenas cria a foundation. A P1 não grava registros nessas tabelas.

## Storage

O bucket `model-uploads` é privado. O caminho futuro de cada objeto segue este contrato:

```text
model-uploads/
└── <model_upload_id>/
    └── model.<extension>
```

O nome original permanece em `model_uploads.original_name` e não identifica o objeto.

## Fronteira de segurança prevista para P2

```text
Browser
   │ metadata validada
   ▼
função server-side
   ├── cria model_upload
   ├── define caminho seguro
   └── gera autorização temporária
           │
           ▼
      Browser envia arquivo
           │
           ▼
    bucket model-uploads
           │
           ▼
    confirma persistência
```

Esse fluxo é apenas um contrato. Nenhuma função server-side ou autorização temporária foi implementada na P1.

Nenhuma service role key é exposta ao frontend.

Nenhuma policy pública de upload é criada na P1. O RLS permanece habilitado sem policies permissivas em `model_uploads`, `model_analyses` ou `storage.objects`.

## Open Decisions

- limite máximo de tamanho por arquivo;
- estratégia definitiva de upload resumível da P2;
- retenção e expiração dos arquivos;
- política de exclusão;
- autenticação, caso venha a existir;
- entidade futura de orçamento/pedido;
- estrutura definitiva de ModelAnalysis;
- estratégia de slicing/precificação futura.
