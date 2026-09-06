# Relatório de entrega — P5 Manufacturing Estimation / Slicing

## 1. Baseline P4 real encontrado

O baseline é o projeto em `work/merged/insight-p4`, originado do pacote completo P4.
A suíte inicial tinha 29 arquivos/228 testes e o build Vite passava. O pacote não
continha `.git`.

## 2. Commit-base

`2b4baf1f903da8d1115dbcfa776b06e109dc75ff`, registrado no relatório/comentário do
artefato P4. `git status` e `git log -5` retornaram “not a git repository”.

## 3. Divergências P4 real × contrato

O contrato congelado foi preservado: a função real é `estimate-model-price`, o motor é
`supabase/functions/_shared/pricing-engine.ts`, a tabela é `pricing_profiles` e o
cliente é `src/pricing/pricing-client.js`. A implementação real já limitava a entrada
a `weightGrams`, `printTimeHours` e `quantity`. A única lacuna prevista era funcional:
o frontend permanecia neutro porque P1–P4 não possuíam fonte confiável de peso/tempo.

## 4. Árvore de mudanças P5

```text
services/slicer-worker/
  Dockerfile
  THIRD_PARTY_NOTICES.md
  scripts/flatten-presets.js
  profiles/README.md
  src/{server,input-policy,download-model}.js
  src/orca/{orca-adapter,command,process,result-parser,canonicalize-3mf}.js
  src/profile/{prepare-profiles,profile-flattener,profile-store,canonical-json}.js
  src/security/{hmac,url-policy}.js
  test/ (cubo, overhang, fora do volume, smoke real)
src/manufacturing/
  manufacturing-client.js
  manufacturing-controller.js
  manufacturing-errors.js
  manufacturing-view.js
supabase/functions/start-manufacturing-estimate/index.ts
supabase/functions/get-manufacturing-estimate/index.ts
supabase/functions/_shared/manufacturing-contract.ts
supabase/functions/_shared/manufacturing-worker-client.ts
supabase/migrations/20260906220000_p5_manufacturing_estimation.sql
docs/{ARCHITECTURE_P5,DEPLOY_P5,P5_CALIBRATION,DELIVERY_P5}.md
THIRD_PARTY_NOTICES.md
```

Também foram integrados `model-parser.js`, `analysis-controller.js`, `upload-shell.js`,
`main.js`, `index.html`, CSS, rate limit, `config.toml`, env examples, testes, scripts
NPM e configuração do Vitest. Nenhum teste P1–P4 foi removido.

## 5. Arquitetura do worker

Servidor HTTP Node provider-neutral, containerizado, com adapter isolando a CLI do
Orca. Cada job usa diretório exclusivo, HOME/cache/temp próprios e cleanup em `finally`.
O worker recebe apenas signed URL, parâmetros fechados e identidade do perfil. Uma
instância executa no máximo um slicer por vez.

## 6. OrcaSlicer

- versão: 2.4.2;
- commit de release: `8500fcd`;
- asset: `OrcaSlicer_Linux_AppImage_Ubuntu2404_V2.4.2.AppImage`;
- SHA-256: `d12fb8c8eac1aecd2dfb6377acd48f994f8fa439ed5292fa532dd82880f029fd`;
- base: Ubuntu 24.04 pinada por digest;
- licença: AGPL-3.0, com fonte correspondente e notice preservados.

## 7. Manufacturing profile inicial

`insight-a1m-pla-020-v1`: Bambu Lab A1 mini, nozzle 0,4 mm, PLA e processo 0,20 mm.
Machine/process/filament são resolvidos a partir dos presets oficiais distribuídos na
AppImage, sem valores de velocidade, temperatura, infill ou suporte inventados.

## 8. Profile fingerprint

O fingerprint SHA-256 é produzido no build depois do flatten real e exposto no log de
startup. A migration deixa o perfil inativo; um operador precisa pinar explicitamente
o hash com `activate_manufacturing_profile` antes de ativá-lo. Não há TOFU. O valor
concreto não pôde ser materializado nesta máquina porque Docker e o binário não estão
instalados.

## 9. Edge Functions

- `start-manufacturing-estimate`: valida upload/perfil/unidade, claim, cache, signed URL
  de 300 s e agenda background task; responde 202;
- `get-manufacturing-estimate`: polling público por UUID não enumerável e resposta
  sanitizada.

## 10. Migration

`20260906220000_p5_manufacturing_estimation.sql` cria `manufacturing_profiles`,
`manufacturing_estimates`, índices, constraints, RLS forçada, seed inativo, claim
idempotente, recovery stale, ativação administrativa do fingerprint e novos escopos de
rate limit.

## 11. Contratos públicos

Start recebe `{ uploadId, profileKey, unit }`, deriva a escala no servidor e retorna 202 com
`{ estimateId, estimateStatus, pollAfterMs }`. Get retorna estado/perfil e, quando
concluído, `{ weightGrams, printTimeSeconds, printTimeHours, assumptions }`. Não retorna G-code, signed URL, custos
internos, caminho de storage, logs ou secrets.

## 12. Contrato interno

`POST /v1/slice` recebe jobId, signed URL, extensão, unidade/fator, profile key e
fingerprint esperado. Request e response usam HMAC-SHA256 `timestamp.body`.
`GET /health` retorna somente `{ status: "ok", engine: "OrcaSlicer", version: "2.4.2" }`.

## 13. Canonicalização 3MF

O pacote é reconstruído apenas com `3D/*.model` e arquivos core controlados. Metadata
de processo do usuário não entra no Orca. Teste confirma igualdade byte a byte do
pacote canônico para settings divergentes e geometria idêntica.

## 14. Unidades

3MF usa a unidade declarada, extraída automaticamente e revalidada no worker. STL/OBJ
exigem seleção explícita. Fatores fechados: mm=1, cm=10, m=1000, inch=25.4. Não há
heurística por bounding box.

## 15. Segurança

Signed URL curta; sem credenciais Supabase no worker; HMAC e antirreplay; allowlist
HTTPS/redirect; sem shell; sem flags do usuário; limites de request/download/resultado;
não-root; root read-only e tmpfs recomendados; logs sem URL assinada; cleanup; cache e
claim impedem slicing concorrente do mesmo modelo/perfil/versão/unidade.

## 16. Testes unitários

238 testes Vitest cobrem P1–P5 no frontend/shared SQL. O worker possui 23 testes Node
para profile inheritance, fingerprint, HMAC/replay, SSRF, command argv, unidades,
parser, canonicalização e endpoint assinado.

## 17. Testes de integração

O endpoint worker foi testado com download e adapter injetados. Além disso, o
Dockerfile tem estágio obrigatório `validation`: fatia duas vezes o cubo, verifica
determinismo, normaliza quatro unidades equivalentes, fatia um overhang e rejeita um
modelo fora da plate. Também fatia dois 3MF com a mesma geometria e settings hostis
diferentes, exigindo métricas iguais. A imagem final depende do marker desse estágio.

## 18. Resultado `npm test`

```text
Vitest: 33 arquivos, 238 testes aprovados
Worker: 23 testes aprovados
```

## 19. Resultado `npm run build`

Build aprovado: Vite 8.2.1, 89 módulos. Persiste apenas o aviso não bloqueante de chunk
acima de 500 kB causado pelo bundle com Three.js.

## 20. Resultado `docker build`

Não executado localmente: o ambiente de entrega não possui comando/daemon Docker. O
Dockerfile foi validado estaticamente e o build inclui checksum obrigatório e smoke
slice obrigatório. Rodar o comando em `docs/DEPLOY_P5.md` é gate de release.

## 21. Slice real da fixture

Não executado localmente pelo mesmo bloqueio de Docker/Orca. Cubo, overhang, modelo
fora do volume e variantes de unidade são executados por `test/orca-smoke.js` dentro do
build. Não há resultado numérico fabricado neste relatório.

## 22. Calibração contra GUI/impressora

Pendente. O protocolo e o gate estão em `docs/P5_CALIBRATION.md`. Nenhum fator de
correção foi aplicado sem medição física.

## 23. Limitações conhecidas

- migration/Edge Functions/worker não foram publicados por ausência de autoridade e
  credenciais do projeto;
- Docker build + smoke real ainda precisam passar numa máquina com Docker/rede;
- o perfil precisa ser ativado administrativamente com o fingerprint emitido pela
  imagem validada antes do primeiro job;
- o modelo assíncrono usa background task do Edge Runtime e deve ficar abaixo dos
  limites do plano; volumes maiores podem exigir fila durável externa numa fase futura;
- calibração física segue pendente;
- a P5 não implementa envio à impressora, pagamento, G-code download ou print farm.

## 24. Deploy do worker

Comandos, secrets, hardening OCI, CORS permanente, Supabase CLI, healthcheck e roteiro
de verificação estão em `docs/DEPLOY_P5.md`.

## 25. ZIP completo

A entrega é o projeto Insight completo P1–P5, não um patch isolado. O ZIP final exclui
`node_modules`, `dist`, caches e secrets, mas inclui source, locks, migrations, Edge
Functions, worker, testes, fixtures e documentação.
