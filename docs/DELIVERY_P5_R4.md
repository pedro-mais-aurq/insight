# Relatório de entrega — P5 Manufacturing Hardening R4

Status: **implementação e testes locais aprovados; release ainda bloqueada pelo smoke
real do Orca e pela materialização do fingerprint do profile de estimation**.

Este relatório registra uma única rodada controlada sobre a P5. Nenhum deploy, `db
push`, ativação de profile ou alteração remota foi executado.

## 1. Proveniência e baseline

O pacote completo recebido declara o commit-base
`2b4baf1f903da8d1115dbcfa776b06e109dc75ff`. A cópia fornecida não contém `.git`,
portanto não foi possível consultar `git status`, branch ou histórico local; `main` e o
commit foram tratados como proveniência declarada pelo ZIP, não como checkout
criptograficamente verificável.

Antes desta rodada:

- Vitest: 33 arquivos, 238 testes aprovados;
- worker: 23 testes aprovados;
- build Vite: aprovado;
- `readFirstGcode` já usava corretamente o parâmetro `run`; o typo `runs` não existia.

## 2. Resultado implementado

- O profile físico `insight-a1m-pla-020-v1` não é modificado.
- Foi criado `insight-estimation-a1m-pla-020-v1`, derivado do mesmo machine/process/
  filament, alterando apenas `printable_area` e `printable_height` para um volume
  finito de `2000 × 2000 × 2000 mm`.
- O build gera manifest, hashes e fingerprint independentes para os dois profiles e
  aborta se o fingerprint aprovado do profile real mudar.
- Manufacturing não aceita mais `unit` do navegador. A Edge Function deriva unidade e
  fator exclusivamente de `model_analyses.result.unit` concluída e confirmada.
- Um 3MF com unidade declarada não pode ter essa unidade sobrescrita na interface; o
  worker também rejeita divergência antes do Orca.
- STL/OBJ são convertidos deterministicamente para milímetros e transladados para a
  origem, sem `--scale`, `--convert-unit`, auto-scale ou auto-orient.
- 3MF é reconstruído como pacote core geometry-only, preservando meshes, components,
  referências, build items e transforms e descartando metadata/presets do usuário.
- Dimensões acima de 2000 mm são rejeitadas antes do Orca. Um modelo acima da mesa real
  e dentro do volume virtual segue para slicing comercial.
- `-24/232`, `-50/206`, `-100/156` e `139/SIGSEGV` possuem códigos internos distintos.
- O Orca permanece com concorrência 1; timeout de 105 s mata o grupo de processos e
  libera o slot. A chamada Edge → worker permanece em 120 s.
- Logs `slice_failed` preservam os campos técnicos previstos, sem URL assinada ou
  credenciais.
- Toda falha terminal no frontend exibe exatamente:
  `não conseguimos estipular os valores mínimos, favor consultar a insight no whatsapp`.

## 3. Profile e fingerprint

| Profile | Finalidade | Estado nesta entrega |
| --- | --- | --- |
| `insight-a1m-pla-020-v1` | impressora real | fingerprint aprovado preservado: `29b61bb6e0d3c5f9e7cfb8a763a735236ff25ee2af88111939d240cfe9be0d46` |
| `insight-estimation-a1m-pla-020-v1` | estimativa comercial | fingerprint determinístico implementado, mas valor concreto pendente do build Docker |

O hash antigo está pinado em código e é comparado de forma fatal durante a geração a
partir da AppImage. O valor novo **não foi inventado**: ele deve ser copiado do
manifest somente depois do estágio `validation` passar. Como Docker, AppImage e fontes
de profile extraídas não existem neste ambiente, os critérios de aceite 4 e 5 ainda
não podem ser declarados concluídos em runtime.

## 4. Migration criada

`supabase/migrations/20260907114500_p5_manufacturing_hardening_r4.sql`

Ela:

- adiciona o novo profile com `is_active = false` e sem fingerprint TOFU;
- registra a relação com o profile físico e o limite virtual;
- não atualiza nem remove estimates históricos;
- amplia somente a constraint de sanidade de resultados para 100 kg e 10.000 h.

A ativação continua administrativa e desativa o profile anteriormente ativo sem
alterar as referências históricas existentes.

## 5. Testes executados

| Gate | Resultado |
| --- | --- |
| `npm test` | aprovado: 34 arquivos/250 testes Vitest + 38 testes Node do worker |
| `npm run build` | aprovado: Vite 8.2.1, 89 módulos |
| `node --check` nos módulos críticos do worker | aprovado |
| timeout/process group | aprovado com processo-pai e neto reais; arquivo marcador do órfão não foi criado |
| job B após timeout do job A | aprovado |
| Deno typecheck | não executado: `deno` indisponível |
| migration local/advisors Supabase | não executado: CLI Supabase indisponível |
| Docker validation/smoke Orca 2.4.2 | não executado: comando/daemon Docker indisponível |

O build gera apenas o aviso não bloqueante já conhecido de chunk JavaScript acima de
500 kB.

## 6. Evidência com os STL reais anexados

Os arquivos foram lidos somente para caracterização e passaram pelo mesmo normalizador
usado pelo adapter. Nenhum resultado do Orca foi simulado.

| Arquivo | SHA-256 | Unidade confirmada usada | Dimensões normalizadas (mm) | Triângulos | Resultado local |
| --- | --- | --- | ---: | ---: | --- |
| `key(1).stl` | `a3fab755a2b2f2aa35ce1c9a1077eb20928a073c48d8114542e027619d8341c5` | mm | 140,428 × 28,270 × 6,001 | 3.274 | aceito |
| `wing.stl` | `b7cd93bb397ac4f77c327b5cd549afa0eba3b26c0db44e2ccdbce3ad23aa9c8d` | mm | 88,580 × 29,305 × 1 | 2.448 | aceito |
| busto de hipogrifo | `8be40f6cdb98099e7507dd238acd32f9cf9e6d53f969d8c185636cfd28aef727` | cm | 555,546 × 782,730 × 1000 | 298.730 | aceito pelo limite virtual |

Isso comprova que coordenadas negativas e modelos maiores que 180 mm não são rejeitados
artificialmente. O sucesso de slicing de `key`, `wing` e do busto continua pendente do
smoke em uma máquina com Docker/Orca.

## 7. Cobertura de erro

| Evidência | Código interno | Comportamento |
| --- | --- | --- |
| dimensão conhecida acima de 2000 mm | `MODEL_OUTSIDE_BUILD_VOLUME` | falha antes do download/Orca |
| Orca `-24` ou Unix `232` | `ORCA_FILE_VERSION_UNSUPPORTED` | terminal e observável |
| Orca `-50` ou Unix `206` | `ORCA_NO_SUITABLE_OBJECTS` | não é inferido como volume excedido |
| Orca `-100` ou Unix `156` | `ORCA_SLICING_ERROR` | terminal e observável |
| `139`, `SIGSEGV` ou texto de segmentation fault | `ORCA_PROCESS_CRASH` | terminal e observável |
| limite de 105 s | `SLICER_TIMEOUT` | mata o process group e libera o worker |
| falha ao iniciar processo | `SLICER_UNAVAILABLE` | preservada e testada |
| download/redirect inválido | `MODEL_DOWNLOAD_FAILED` no worker; `SLICER_DOWNLOAD_FAILED` no contrato público | HMAC/allowlist permanecem ativos |
| capacidade ocupada | `WORKER_BUSY` | concorrência continua em 1 |

Todos esses estados convergem apenas na camada visual para a mensagem comercial única;
o banco e os logs preservam o diagnóstico.

## 8. Arquivos alterados nesta rodada

### Profiles, worker e container

- `.github/workflows/ci.yaml`
- `services/slicer-worker/.env.example`
- `services/slicer-worker/Dockerfile`
- `services/slicer-worker/profiles/README.md`
- `services/slicer-worker/scripts/flatten-presets.js`
- `services/slicer-worker/src/index.js`
- `services/slicer-worker/src/profile/prepare-profiles.js`
- `services/slicer-worker/src/profile/profile-definitions.js`
- `services/slicer-worker/src/orca/canonicalize-3mf.js`
- `services/slicer-worker/src/orca/command.js`
- `services/slicer-worker/src/orca/model-normalizer.js`
- `services/slicer-worker/src/orca/orca-adapter.js`
- `services/slicer-worker/src/orca/process.js`
- `services/slicer-worker/src/orca/result-parser.js`
- `services/slicer-worker/src/server.js`
- `services/slicer-worker/test/canonicalize-3mf.test.js`
- `services/slicer-worker/test/command.test.js`
- `services/slicer-worker/test/input-policy.test.js`
- `services/slicer-worker/test/model-normalizer.test.js`
- `services/slicer-worker/test/observability.test.js`
- `services/slicer-worker/test/orca-adapter.test.js`
- `services/slicer-worker/test/orca-smoke.js`
- `services/slicer-worker/test/prepare-profiles.test.js`
- `services/slicer-worker/test/process.test.js`
- `services/slicer-worker/test/result-parser.test.js`
- `services/slicer-worker/test/server.test.js`
- `services/slicer-worker/test/fixtures/outside-build-volume.obj`
- `services/slicer-worker/test/fixtures/outside-virtual-volume.obj`.

### Frontend e análise

- `src/analysis/analysis-controller.js`
- `src/analysis/analysis-view.js`
- `src/analysis/model-analysis.js`
- `src/manufacturing/manufacturing-client.js`
- `src/manufacturing/manufacturing-controller.js`
- `src/manufacturing/manufacturing-errors.js`
- `src/manufacturing/manufacturing-view.js`
- `tests/analysis-controller.test.js`
- `tests/analysis-view-helpers.test.js`
- `tests/manufacturing-client.test.js`
- `tests/manufacturing-contract.test.js`
- `tests/manufacturing-controller.test.js`
- `tests/manufacturing-view.test.js`
- `tests/p5-manufacturing-sql.test.js`.

### Supabase e documentação

- `supabase/functions/_shared/manufacturing-contract.ts`
- `supabase/functions/_shared/manufacturing-worker-client.ts`
- `supabase/functions/start-manufacturing-estimate/index.ts`
- `supabase/migrations/20260907114500_p5_manufacturing_hardening_r4.sql`
- `README.md`
- `docs/ARCHITECTURE_P5.md`
- `docs/DELIVERY_P5.md`
- `docs/DELIVERY_P5_R4.md`
- `docs/DEPLOY_P5.md`
- `docs/P5_CALIBRATION.md`.

Nenhuma migration anterior foi editada.

## 9. Build e tag OCI

Da raiz do projeto:

```bash
docker build --target validation --progress plain \
  -t insight-slicer-validation:p5-orca-2.4.2-r4 \
  services/slicer-worker

docker build --target final --progress plain \
  -t insight-slicer-worker:p5-orca-2.4.2-r4 \
  services/slicer-worker
```

No Windows CMD, use cada comando em uma linha. A tag imutável sugerida é
`p5-orca-2.4.2-r4`. O segundo build não substitui o primeiro gate: `final` copia o
marker que só é criado ao final do smoke real.

Os comandos para extrair os dois fingerprints, executar o container endurecido e
validar `/health` estão em `DEPLOY_P5.md`.

## 10. Deploy manual no Render

1. Só prossiga depois de o build `validation` passar no mesmo commit.
2. Crie/atualize um Web Service com runtime Docker.
3. Use `services/slicer-worker` como Root Directory e `./Dockerfile` como Dockerfile.
4. Mantenha uma instância, pelo menos 2 GiB RAM/2 CPUs e health check `/health`.
5. Configure `WORKER_HMAC_SECRET`, `MODEL_DOWNLOAD_HOSTS`, `PROFILE_KEY`,
   `SLICER_TIMEOUT_MS`, `SLICER_MAX_CONCURRENT`, `MAX_WEIGHT_GRAMS` e
   `MAX_PRINT_TIME_SECONDS` conforme `DEPLOY_P5.md`.
6. Publique a imagem/commit imutável `p5-orca-2.4.2-r4`.
7. Confira `/health` e o evento `worker_ready` antes de ativar o profile no banco.

## 11. Supabase e Edge Functions

Depois de revisar o projeto remoto correto:

```bash
supabase link --project-ref <project-ref>
supabase db push
supabase migration list
supabase functions deploy start-manufacturing-estimate --no-verify-jwt
supabase functions deploy get-manufacturing-estimate --no-verify-jwt
```

As duas funções precisam de redeploy porque importam o contrato compartilhado.
Somente após obter o fingerprint novo da imagem validada, execute
`activate_manufacturing_profile` conforme `DEPLOY_P5.md`.

## 12. Configuração a alterar

Worker:

- `PROFILE_KEY=insight-estimation-a1m-pla-020-v1`;
- `SLICER_TIMEOUT_MS=105000`;
- `SLICER_MAX_CONCURRENT=1`;
- `MAX_WEIGHT_GRAMS=100000`;
- `MAX_PRINT_TIME_SECONDS=36000000`;
- `WORKER_HMAC_SECRET` e `MODEL_DOWNLOAD_HOSTS` continuam obrigatórios.

Edge Functions:

- `MANUFACTURING_WORKER_TIMEOUT_MS=120000`;
- `MANUFACTURING_WORKER_URL` deve apontar ao novo worker HTTPS;
- `MANUFACTURING_WORKER_HMAC_SECRET` deve ser o mesmo valor do worker;
- `ALLOWED_ORIGINS` deve conter origens exatas. Vite local normalmente usa
  `http://localhost:5173`, não `https://localhost:5173`.

Nenhum valor sensível deve receber prefixo `VITE_`.

## 13. Riscos e gates residuais

- O smoke real e o novo fingerprint continuam pendentes; portanto esta entrega não é
  ainda uma release aceita pelos 20 critérios finais.
- `ModuSnap`, `Hello_Kitty` e `axolotl-skeleton-flexi` não foram anexados. Seus formatos
  de falha foram cobertos por fixtures sintéticas/testes, mas os arquivos reais não
  foram reexecutados.
- Os três STL anexados foram normalizados, não fatiados neste ambiente.
- A migration não foi aplicada a um Postgres local/remoto e os advisors não rodaram.
- O typecheck nativo Deno não rodou; os módulos compartilhados foram importados e
  exercitados por Vitest.
- O timeout de 105 s pode continuar insuficiente para `Hello_Kitty`; nessa situação o
  resultado deliberado é `SLICER_TIMEOUT` interno e fallback comercial, sem ampliar a
  arquitetura nesta rodada.
- A calibração física permanece `CALIBRATION_PENDING`.

Referências operacionais oficiais: limites atuais das Edge Functions em
<https://supabase.com/docs/guides/functions/limits>, deploy de funções em
<https://supabase.com/docs/guides/functions/deploy> e release pinada do Orca em
<https://github.com/OrcaSlicer/OrcaSlicer/releases/tag/v2.4.2>.
