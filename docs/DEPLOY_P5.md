# Deploy P5 pelo terminal

## 1. Worker OCI

Execute a partir da raiz do projeto:

```bash
docker build -t insight-slicer-worker:p5-orca-2.4.2 services/slicer-worker
```

O build valida a AppImage com SHA-256 antes de extrair o OrcaSlicer e gerar os presets.
No provedor escolhido, configure:

```text
WORKER_HMAC_SECRET=<64+ caracteres hex aleatórios>
MODEL_DOWNLOAD_HOSTS=<project-ref>.supabase.co
PORT=8080
```

Exemplo local endurecido:

```bash
docker run --rm -p 8080:8080 \
  --read-only \
  --tmpfs /work:rw,nosuid,nodev,size=1g,mode=0700 \
  --tmpfs /tmp:rw,nosuid,nodev,size=64m,mode=1777 \
  --memory 2g \
  --cpus 2 \
  --pids-limit 256 \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  -e WORKER_HMAC_SECRET="$WORKER_HMAC_SECRET" \
  -e MODEL_DOWNLOAD_HOSTS="<project-ref>.supabase.co" \
  insight-slicer-worker:p5-orca-2.4.2
```

Depois do deploy, valide `GET https://<worker>/health`. O corpo deve ser exatamente
`{"status":"ok","engine":"OrcaSlicer","version":"2.4.2"}`. O fingerprint completo
aparece no log estruturado `worker_ready`. Guarde a URL HTTPS; não exponha o secret ao
frontend.

## 2. Supabase CLI

Instale a CLI oficial, autentique e vincule o projeto:

```bash
supabase login
supabase link --project-ref <project-ref>
supabase db push
```

Defina os secrets. Para Vite local use `http://localhost:5173` — não
`https://localhost:5173`. Origem não recebe path ou barra final.

```bash
supabase secrets set \
  ALLOWED_ORIGINS="https://pedro-mais-aurq.github.io,http://localhost:5173,http://127.0.0.1:5173" \
  INSIGHT_RATE_LIMIT_SALT="<aleatório>" \
  MANUFACTURING_WORKER_URL="https://<worker>" \
  MANUFACTURING_WORKER_HMAC_SECRET="<mesmo secret do worker>" \
  MANUFACTURING_WORKER_TIMEOUT_MS="120000"
```

No Windows CMD, coloque tudo em uma linha ou use `^` em vez de `\`.

Faça deploy das novas funções e redeploy da P4 quando houver mudança de secrets/CORS:

```bash
supabase functions deploy start-manufacturing-estimate --no-verify-jwt
supabase functions deploy get-manufacturing-estimate --no-verify-jwt
supabase functions deploy estimate-model-price --no-verify-jwt
```

Antes de aceitar jobs, copie o `profileFingerprint` do log `worker_ready` e ative o
perfil de forma explícita no banco. A migration o deixa inativo para impedir TOFU:

```sql
select public.activate_manufacturing_profile(
  'insight-a1m-pla-020-v1',
  1,
  '<sha256-de-64-caracteres-do-worker>'
);
```

Execute a instrução pelo SQL Editor ou por `psql` com uma conexão administrativa e
confirme que o retorno é `true`. Um valor diferente do já pinado retorna `false` e não
troca o perfil ativo.

## 3. Frontend

```bash
npm install
npm test
npm run build
```

Configure no ambiente do Vite somente:

```text
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable key>
```

Service role, HMAC e URL interna do worker nunca usam prefixo `VITE_`.

## 4. Verificação

1. Envie STL/OBJ, escolha unidade e confirme que o estado técnico fica `processing`.
2. Envie um 3MF com unidade declarada e confirme início automático.
3. Aguarde peso/tempo e, em seguida, o preço da P4.
4. Altere apenas quantidade e confirme que não surge novo job P5.
5. Consulte logs por `estimateId`; URLs assinadas não devem aparecer.
6. Rode os advisors de segurança e performance no Dashboard/MCP após `db push`.

Se o JSON da função estiver correto mas a tela continuar neutra, confira no DevTools se
o domínio publicado coincide exatamente com `ALLOWED_ORIGINS` e se o frontend novo foi
rebuildado/republicado. Alterar apenas o secret do Supabase não atualiza um bundle Vite
antigo.
