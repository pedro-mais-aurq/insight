# Arquitetura P5 — Manufacturing Estimation / Slicing

## Responsabilidade

A P5 responde apenas quanto material e tempo um modelo exige no perfil técnico ativo.
Sua saída é `{ weightGrams, printTimeSeconds }`. A conversão
`printTimeHours = printTimeSeconds / 3600` acontece no frontend imediatamente antes de
chamar a Edge Function real da P4. Nenhuma fórmula financeira foi copiada para a P5.

## Fluxo

```text
UPLOAD
  │
  ▼
P3 — Geometry Analysis
  │ uploadId; unidade confirmada persistida
  ▼
P5 — Manufacturing Estimate
  ├── Bambu A1 mini
  ├── PLA
  ├── 0.20 mm
  ├── canonical profile
  └── OrcaSlicer 2.4.2
         ├── weightGrams
         └── printTimeSeconds
                 │
                 ▼
P4 — Pricing Engine
                 │
                 ▼
         unitPrice + totalPrice
```

Internamente, `start-manufacturing-estimate` faz claim idempotente no Postgres, cria a
signed URL privada por 300 s e usa `EdgeRuntime.waitUntil(...)` para chamar o worker
com HMAC. O frontend consulta `get-manufacturing-estimate` até o estado terminal.

O Edge Runtime coordena a tarefa, mas não executa binário nativo. O Orca fica limitado
a 105 s e a chamada Edge → worker a 120 s, preservando margem para download,
normalização, parsing e resposta assinada. Jobs `processing` sem heartbeat há 10 minutos são recuperados pelo RPC
`claim_manufacturing_estimate` na próxima solicitação.

## Perfis técnicos

O profile real `insight-a1m-pla-020-v1` continua selecionando, pelo nome exato:

- machine: `Bambu Lab A1 mini 0.4 nozzle`;
- process: `0.20mm Standard @BBL A1M`;
- filament: `Bambu PLA Basic @BBL A1M`.

Esses valores não foram recriados. O estágio `orca` do Dockerfile baixa a AppImage
oficial 2.4.2, valida o SHA-256 e percorre os JSONs distribuídos nela. A ferramenta de
build resolve `inherits` recursivamente, falha diante de pai ausente, ciclo ou nome
ambíguo, aplica override do filho e grava três JSONs finais achatados. Seu fingerprint
aprovado permanece `29b61bb6e0d3c5f9e7cfb8a763a735236ff25ee2af88111939d240cfe9be0d46`;
o build aborta se esse valor mudar.

Manufacturing usa o novo `insight-estimation-a1m-pla-020-v1`. Ele copia os três
presets achatados e altera exclusivamente `printable_area` e `printable_height` para
um volume virtual finito de `2000 x 2000 x 2000 mm`. Isso não representa a capacidade
física da A1 mini e nunca redimensiona o modelo; significa somente “estimativa
comercial baseada nos parâmetros de fabricação da A1 mini”. O novo bundle tem
manifest, hashes e fingerprint próprios.

O manifesto contém engine, versão, release, seleções, cadeia de fontes, hashes de cada
arquivo e timestamp reprodutível. O fingerprint final deve ser pinado administrativamente
no banco antes de ativar o perfil. Não existe confiança automática na primeira chamada;
qualquer imagem divergente falha com `SLICER_PROFILE_MISMATCH`.

Política de suporte, preenchimento, velocidade, temperaturas e demais parâmetros vêm
integralmente do preset oficial de processo. Não há flags de usuário nem overrides
ocultos no worker.

## Unidades e orientação

- O frontend envia `uploadId`/profile, nunca a unidade. A Edge Function carrega a
  `model_analyses` concluída e deriva `sourceUnit`/`unitScale` apenas de
  `result.unit` confirmado.
- STL e OBJ não têm unidade intrínseca: depois da confirmação na P3, o worker converte
  coordenadas para milímetros e normaliza a origem de forma determinística antes do
  Orca. Não usa `--scale`, `--convert-unit` nem heurística por bounding box.
- 3MF: a P3 lê a unidade declarada no `3D/3dmodel.model`; o worker confere novamente a
  declaração antes do slicing. A unidade não é inferida por dimensões.
- O adapter não usa `--orient`. A orientação do modelo é preservada. Usa apenas
  `--arrange 0` e `--ensure-on-bed`.
- A unidade e o fator participam da cache key.

## Neutralização de 3MF

Um 3MF enviado pelo usuário é tratado como geometria, não como perfil de produção. O
worker valida todos os paths do ZIP, lê somente model parts, resolve objetos e
referências, preserva meshes/components/build/transforms, converte coordenadas e
translações para milímetros e emite um único `3D/3dmodel.model` core, além de
`[Content_Types].xml` e relacionamento raiz controlados. Metadata/vendor extensions,
processos e filamentos do original não entram no slicer.

Há teste que gera dois 3MFs com geometria idêntica e settings conflitantes e confirma
que ambos produzem o mesmo pacote canônico.

## Extração de resultados

Prioridade:

1. `Metadata/slice_info.config`: `prediction` em segundos e `weight` em gramas;
2. soma de `used_g` quando o peso total não estiver presente;
3. comentários de G-code `filament used [g]` e
   `estimated printing time (normal mode)` como fallback.

`first_layer_time` é deliberadamente ignorado. Resultados acima de 100 kg ou 10.000 h,
zero, negativos ou não finitos são rejeitados.

## Segurança e isolamento

- bucket privado; o worker recebe uma signed URL de cinco minutos, sem key do Supabase;
- HMAC-SHA256 sobre `timestamp.body`, comparação segura e janela antirreplay de 5 min;
- resposta do worker também é assinada;
- allowlist HTTPS de hosts de download e redirects validados para bloquear SSRF;
- `spawn` com array de argumentos e `shell: false`; timeout mata o process group que
  contém `xvfb-run`, Xvfb, AppRun e Orca;
- diretório exclusivo por job e remoção em `finally`; G-code nunca é persistido;
- processo não-root, raiz read-only recomendada, capabilities removidas e `/work`
  temporário com quota;
- uma execução de slicing por instância; overflow recebe `WORKER_BUSY` e pode ser
  retomado pelo mesmo job idempotente.

## Banco

`manufacturing_profiles` guarda somente o perfil técnico. `pricing_profiles` continua
privado e independente. `manufacturing_estimates` guarda estado, cache key, unidade,
versões, métricas finais e erro seguro. Ambas as tabelas P5 têm RLS forçada e nenhum
acesso direto de `anon`/`authenticated`.

A cache key SHA-256 inclui upload, perfil, versão do perfil, OrcaSlicer 2.4.2, unidade e
escala. Quantidade não participa: alterar a quantidade recalcula somente a P4. Jobs
falhos só são reclamados automaticamente quando o código pertence à lista transitória;
falhas definitivas e códigos desconhecidos permanecem terminais.

## Taxonomia de erro e limitações

Erros de upload/unidade, 3MF inválido, mismatch de fingerprint e output fora de faixa
são terminais para aquele input. `-24`, `-50`, `-100` e `139/SIGSEGV` viram códigos
internos distintos; `-50` sozinho nunca significa volume excedido. Indisponibilidade,
timeout e `WORKER_BUSY` preservam diagnóstico/retry. A resposta pública nunca inclui
stderr, URL, path local ou conteúdo do modelo. Na interface, toda falha terminal usa
somente `não conseguimos estipular os valores mínimos, favor consultar a insight no whatsapp`.

A arquitetura não envia arquivos à impressora, não expõe G-code e não implementa fila
distribuída. O background task continua sujeito ao limite do Edge Runtime; se a duração
real exceder esse teto, a evolução correta é uma fila durável externa, preservando os
mesmos contratos P3/P5/P4.

## Deploy, licença e calibração

O worker é uma imagem OCI provider-neutral. A imagem fixa Ubuntu por digest e snapshot,
OrcaSlicer 2.4.2 por release/checksum, executa como usuário não-root e exige filesystem
read-only/tmpfs/limites no runtime. O procedimento completo está em `DEPLOY_P5.md`.

OrcaSlicer é AGPL-3.0; versão, fonte e checksum estão em `THIRD_PARTY_NOTICES.md`. A
separação por processo/container não é tratada como conclusão jurídica. Antes de produção,
o smoke real da imagem, a ativação explícita do fingerprint e o protocolo
`CALIBRATION_PENDING` de `P5_CALIBRATION.md` são gates obrigatórios.
