# Deploy P5 pelo terminal

## 1. Worker OCI

Execute a partir da raiz do projeto:

```bash
docker build --target validation --progress plain \
  -t insight-slicer-validation:p5-orca-2.4.2-r4 \
  services/slicer-worker

docker build --target final --progress plain \
  -t insight-slicer-worker:p5-orca-2.4.2-r4 \
  services/slicer-worker
```

No Windows CMD, execute cada comando em uma linha. A imagem `final` só existe se o
smoke real do OrcaSlicer 2.4.2 criar o marker após todos os slices.

O build valida a AppImage com SHA-256 antes de extrair o OrcaSlicer e gerar os presets.
No provedor escolhido, configure:

```text
WORKER_HMAC_SECRET=<64+ caracteres hex aleatórios>
MODEL_DOWNLOAD_HOSTS=<project-ref>.supabase.co
PORT=8080
PROFILE_KEY=insight-estimation-a1m-pla-020-v1
SLICER_TIMEOUT_MS=105000
SLICER_MAX_CONCURRENT=1
MAX_WEIGHT_GRAMS=100000
MAX_PRINT_TIME_SECONDS=36000000
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
  -e PROFILE_KEY="insight-estimation-a1m-pla-020-v1" \
  -e SLICER_TIMEOUT_MS="105000" \
  insight-slicer-worker:p5-orca-2.4.2-r4
```

Confirme os dois fingerprints diretamente na imagem validada:

```bash
docker run --rm --entrypoint node insight-slicer-worker:p5-orca-2.4.2-r4 \
  -e "const fs=require('node:fs'); for (const key of ['insight-a1m-pla-020-v1','insight-estimation-a1m-pla-020-v1']) { const m=JSON.parse(fs.readFileSync('/app/profiles/'+key+'/manifest.json')); console.log(key+'='+m.profileFingerprint); }"
```

O primeiro precisa ser exatamente
`29b61bb6e0d3c5f9e7cfb8a763a735236ff25ee2af88111939d240cfe9be0d46`.
Use o segundo na ativação do banco.

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
supabase migration list
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

Faça redeploy das duas funções P5, pois ambas empacotam o contrato compartilhado:

```bash
supabase functions deploy start-manufacturing-estimate --no-verify-jwt
supabase functions deploy get-manufacturing-estimate --no-verify-jwt
```

Antes de aceitar jobs, copie o `profileFingerprint` do log `worker_ready` e ative o
perfil de forma explícita no banco. A migration o deixa inativo para impedir TOFU:

```sql
select public.activate_manufacturing_profile(
  'insight-estimation-a1m-pla-020-v1',
  1,
  '<fingerprint-do-profile-de-estimation>'
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

1. Envie STL/OBJ, confirme a unidade na P3 e confirme que o payload de manufacturing
   não contém `unit`.
2. Envie um 3MF com unidade declarada e confirme início automático.
3. Aguarde peso/tempo e, em seguida, o preço da P4.
4. Altere apenas quantidade e confirme que não surge novo job P5.
5. Consulte logs por `estimateId`; URLs assinadas não devem aparecer.
6. Rode os advisors de segurança e performance no Dashboard/MCP após `db push`.
7. Teste um modelo acima de 180 mm e abaixo de 2000 mm; ele deve chegar ao Orca.
8. Teste uma dimensão acima de 2000 mm; deve falhar antes de chamar o Orca.

## 5. Render

Sem fazer deploy automático, a configuração recomendada para um Web Service é:

1. selecione o repositório/commit validado e runtime **Docker**;
2. defina **Root Directory** como `services/slicer-worker` e **Dockerfile Path** como
   `./Dockerfile` (o último estágio é `final`);
3. use `/health` como Health Check Path e mantenha a porta fornecida por `PORT`;
4. configure os envs do worker listados na seção 1, sem prefixo `VITE_`;
5. mantenha uma única instância durante esta rodada e recursos de pelo menos 2 GiB RAM,
   2 CPUs e storage efêmero suficiente para `/work`;
6. publique somente depois do build `validation` local passar e fixe o deploy no mesmo
   commit/tag da imagem `p5-orca-2.4.2-r4`;
7. valide `/health`, confira `worker_ready` e só então ative o fingerprint novo.

Se o fluxo usar registry em vez de build do Render, a tag imutável sugerida é
`<registry>/insight-slicer-worker:p5-orca-2.4.2-r4`; faça `docker tag`/`docker push`
somente após o validation gate.

Se o JSON da função estiver correto mas a tela continuar neutra, confira no DevTools se
o domínio publicado coincide exatamente com `ALLOWED_ORIGINS` e se o frontend novo foi
rebuildado/republicado. Alterar apenas o secret do Supabase não atualiza um bundle Vite
antigo.
