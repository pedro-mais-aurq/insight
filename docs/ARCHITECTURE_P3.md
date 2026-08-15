# Arquitetura P3 — Análise 3D, viewer e hardening de produção

## Architecture

A P3 começa somente depois de `complete-model-upload` confirmar o objeto no Storage e o frontend receber `status = "uploaded"`. O browser interpreta a geometria, calcula um `ModelAnalysis` versionado e exibe o mesmo objeto Three.js no viewer. O backend controla a elegibilidade, o ciclo de vida e a persistência do resumo, mas não trata o resultado calculado no cliente como evidência autoritativa.

O upload continua no bucket privado `model-uploads`, com path canônico `<uploadId>/model.<extension>`. O browser não escolhe bucket nem path e nunca recebe a service role.

## Analysis Pipeline

1. `start-model-analysis(uploadId)` verifica no banco se o upload está confirmado e dentro da retenção binária de sete dias.
2. O loader oficial correspondente interpreta o `File`: `STLLoader`, `OBJLoader` ou `ThreeMFLoader`.
3. `geometry-normalizer.js` percorre meshes, aplica `matrixWorld` e converte geometrias indexed e non-indexed em um `Float32Array` linear de triângulos.
4. O buffer é transferido ao Web Worker, que calcula bounding box, dimensões, centro, área, volume bruto e sinais topológicos.
5. O frontend monta o contrato `ModelAnalysis`, aplica unidade física apenas quando conhecida ou escolhida e envia um resumo JSON para `save-model-analysis`.
6. Somente uma persistência server-side bem-sucedida leva a state machine a `ready`; então o objeto já interpretado é exibido no viewer.

Falhas de análise levam a `analysis_error`. O retry reutiliza o mesmo `File` e `uploadId`, sem novo upload, somente quando o erro é classificado explicitamente como transitório. Substituir ou remover dispõe Worker, controles, renderer, geometrias, materiais e texturas associados ao modelo anterior.

## Retryable Analysis Errors

`analysis-error-classifier.js` é a fonte central para retry. `ANALYSIS_WORKER_FAILED`, `ANALYSIS_START_FAILED`, `ANALYSIS_SAVE_FAILED` e `RATE_LIMITED` são transitórios e armazenam `error.retryable = true`. Nesses casos a UI oferece nova tentativa e o controller impede execuções concorrentes.

Códigos desconhecidos nunca são considerados repetíveis automaticamente.

## Definitive Analysis Errors

`UPLOAD_EXPIRED`, `UPLOAD_STATE_INVALID`, `NO_GEOMETRY`, `NO_TRIANGLES`, `UNSUPPORTED_STRUCTURE`, `INVALID_COORDINATES` e `PARSE_FAILED` armazenam `error.retryable = false`. Repetir a mesma análise não chama `start-model-analysis`, parser, Worker ou persistência. A UI oculta o retry e orienta novo envio, preservando as ações explícitas de substituir ou remover o arquivo.

Warnings topológicos continuam informativos e não são promovidos a erros definitivos.

## Worker Boundary

O parsing com loaders Three.js permanece no main thread porque esses loaders produzem árvores `Object3D`. Antes do trabalho geométrico pesado, a aplicação permite um frame de renderização para que o estado `analyzing` apareça.

A fronteira do Worker recebe somente:

- `requestId`;
- `positionsBuffer`, transferido com transfer list;
- configuração numérica de análise.

O Worker não acessa DOM, Supabase ou objetos Three.js. Ele retorna apenas dados serializáveis. Métricas e topologia ficam fora do main thread; a troca de unidade reutiliza os valores brutos e não repete parsing ou análise.

## ModelAnalysis Contract

O contrato atual possui `version: 1` e `source: "client"`. Ele registra formato, unidade, métricas brutas, métricas físicas derivadas, contagens geométricas, sinais topológicos, confiabilidade do volume, warnings e timestamp.

`save-model-analysis` aceita apenas chaves e códigos previstos, números finitos, contagens inteiras válidas e JSON de até 64 KiB. Arrays de vértices, buffers e geometria não fazem parte do contrato persistido. O resultado é um resumo operacional e visual, não uma prova de integridade e não uma fonte de preço.

## Units

As métricas geométricas brutas usam a unidade das coordenadas do arquivo. Conversões físicas suportam `mm`, `cm`, `m` e `inch`; comprimentos usam o fator linear, áreas usam o fator ao quadrado e volumes usam o fator ao cubo.

STL e OBJ não carregam, em geral, unidade física confiável. Nesses casos o resultado começa com `unit.value = null`, `physicalMetrics = null` e warning `UNIT_UNKNOWN`. O usuário pode confirmar a unidade; essa ação apenas recalcula métricas físicas.

O `ThreeMFLoader` utilizado não expõe de forma confiável a unidade declarada no contêiner no objeto retornado. Portanto a implementação não inventa milímetros: a unidade de 3MF também permanece desconhecida quando não puder ser confirmada pelo loader.

## Topology

Vértices são soldados por quantização com tolerância `max(diagonal × 10⁻⁶, 10⁻⁹)`. A incidência de arestas identifica:

- arestas abertas: incidência igual a 1;
- arestas non-manifold: incidência maior que 2;
- malha fechada: nenhuma aresta aberta ou non-manifold;
- componentes: conjuntos conectados após a soldagem;
- triângulos degenerados: área menor ou igual a `10⁻¹²` na unidade bruta.

A topologia completa é limitada a 500.000 triângulos. Acima desse limite, `TOPOLOGY_SKIPPED_COMPLEXITY` é emitido, contagens topológicas ficam não verificadas e métricas básicas continuam sendo calculadas. Volume bruto pode existir, mas só é apresentado como confiável quando a análise topológica foi executada e a malha foi classificada como fechada.

Esses sinais não equivalem a afirmar que um modelo é imprimível: orientação, suportes, material, processo, impressora e slicing estão fora desta fase.

## Viewer

O viewer usa Three.js e `OrbitControls`, material neutro, iluminação simples, rotação, zoom e pan. A câmera é ajustada pela bounding box real, o canvas acompanha o container com `ResizeObserver` e o pixel ratio é limitado a 2.

Falha de WebGL ou do viewer não invalida uma análise concluída. A UI informa que o preview está indisponível, preserva as métricas e dispõe recursos parcialmente inicializados. Não existe thumbnail ou preview fictício.

## Security

- `model-uploads` permanece privado e limitado a 50.000.000 bytes por objeto.
- O frontend e as Edge Functions validam o mesmo limite de produto: 50 MB decimais.
- A migration também adiciona constraint de 50.000.000 bytes em `model_uploads`. Antes da constraint, uma guarda bloqueia a aplicação com mensagem explícita se existirem registros legados maiores; ela não apaga nem altera esses dados.
- A service role existe somente nas Edge Functions.
- RLS permanece habilitado; nenhuma policy pública foi adicionada ao Storage ou às tabelas internas.
- `start-model-analysis` e `save-model-analysis` recebem apenas `uploadId` e payloads limitados; paths canônicos continuam sendo resolvidos no servidor.
- O backend valida rigorosamente o resumo client-side, mas não o promove a verdade autoritativa nem o usa para orçamento.
- CORS limita origens de browser; não autentica nem substitui rate limiting.

Em produção, o limite global de Storage do projeto também precisa ser igual ou superior a 50 MB. O repositório configura 50 MB para o ambiente local e para o bucket; a configuração global do projeto remoto deve ser verificada antes do deploy. Um valor remoto inferior é bloqueador operacional.

## Rate Limiting

As cinco funções públicas consomem limite antes de interpretar o JSON:

| Escopo | Limite | Janela |
|---|---:|---:|
| `create-model-upload` | 10 | 10 min |
| `complete-model-upload` | 30 | 10 min |
| `remove-model-upload` | 30 | 10 min |
| `start-model-analysis` | 20 | 10 min |
| `save-model-analysis` | 20 | 10 min |

A identidade usa o primeiro IP válido de `X-Forwarded-For`, com fallback para `X-Real-IP`. Apenas SHA-256 de `INSIGHT_RATE_LIMIT_SALT + IP` é persistido. IP bruto não é armazenado ou logado. O consumo é atômico por RPC `security definer`; `anon` e `authenticated` não acessam tabela ou RPC. Excesso retorna HTTP 429 e `Retry-After`. Ausência de identidade, salt ou backend de rate limit falha fechada com 503.

## Retention

| Categoria | Prazo | Ação |
|---|---:|---|
| upload abandonado (`pending`, `uploading`, `failed`) | 24 h desde `updated_at` | remove objeto, se existir, e marca `removed` |
| binário confirmado (`uploaded`) | 7 dias desde `uploaded_at` | remove objeto e marca `removed` com `RETENTION_EXPIRED` |
| metadata removida | 30 dias desde `removed_at` | hard delete de `model_uploads`; análises são removidas por cascade |
| entradas de rate limit | 24 h | hard delete |

`uploaded_at` e `removed_at` são preenchidos apenas nas respectivas transições. A migration faz backfill conservador a partir de `updated_at` para registros históricos.

## Cleanup

`cleanup-model-uploads` é uma Edge Function server-to-server protegida por `INSIGHT_CLEANUP_SECRET`. Cada categoria é processada em batches de até 100 registros. Objetos são removidos pela Storage API, nunca por `DELETE` direto em `storage.objects`. Se o objeto já não existir, o estado final ainda pode convergir idempotentemente para `removed`; erros reais de listagem, Storage ou banco não são mascarados.

`supabase/schedules/setup-cleanup-cron.sql` prepara execução horária (`0 * * * *`) com `pg_cron`, `pg_net` e valores lidos do Vault. `pg_cron` é instalado no próprio schema da extensão; `pg_net` permanece no schema `extensions`. O cron lê URL e segredo no Vault e chama `cleanup-model-uploads` por HTTP. O arquivo não contém segredos e não é migration. Ele deve ser revisado e executado manualmente no projeto autorizado; sua presença no repositório não significa que o cron esteja ativo.

## Known Limitations

- STL e OBJ podem não possuir unidade física confiável.
- OBJ externo com MTL/texturas não é suportado como pacote; a análise usa geometria e material neutro, sem fetch de dependências.
- 3MF pode utilizar recursos ou extensões além do suporte do loader instalado.
- A unidade declarada em 3MF pode não estar disponível na saída do loader e, nesse caso, permanece desconhecida.
- Topologia completa é limitada a 500.000 triângulos.
- `ModelAnalysis` é calculado client-side e pode variar com a implementação/versionamento.
- `ModelAnalysis` não é fonte de preço e não confirma printabilidade absoluta.
- A UI não oferece cancelamento cooperativo da análise; reset/substituição termina o Worker ativo.
- A P3 não executa slicing.

## Future Slicing Boundary

Um slicer futuro deverá ser um subsistema separado, com parâmetros explícitos de impressora, material, orientação, suportes e processo. Não deve inferir tempo, filamento, G-code ou preço a partir do `ModelAnalysis` client-side. A elegibilidade mínima continua sendo um upload confirmado server-side; a decisão de fatiamento exigirá contrato e validação próprios.
