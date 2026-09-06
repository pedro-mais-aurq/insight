# P5 — Protocolo de calibração física

Status: **CALIBRATION_PENDING**. Nenhum fator empírico foi aplicado sem dados.

## Objetivo

Medir o desvio entre OrcaSlicer 2.4.2 e a Bambu Lab A1 mini real usando exatamente o
perfil `insight-a1m-pla-020-v1`, sem confundir erro do slicer com perda operacional.

## Amostra mínima

Use ao menos cinco geometrias: cubo simples, peça fina, peça com cavidades, peça com
overhang e peça que acione suporte pelo preset. A golden comparison inicial deve conter
no mínimo três modelos e aceitar peso em ±2% e tempo em ±5%. Mantenha o mesmo lote de
PLA seco e a mesma impressora/nozzle.

## Golden comparison inicial

Não preencha a tabela sem executar o mesmo arquivo e profile no worker e na GUI do
OrcaSlicer 2.4.2. Os marcadores preservam o gate sem inventar medições.

| Modelo | Worker peso | GUI peso | Erro peso | Worker tempo | GUI tempo | Erro tempo | Gate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Cubo 20 mm | — | — | — | — | — | — | CALIBRATION_PENDING |
| Overhang | — | — | — | — | — | — | CALIBRATION_PENDING |
| Peça com cavidade | — | — | — | — | — | — | CALIBRATION_PENDING |

Para cada peça, registre:

| Campo | Como obter |
| --- | --- |
| SHA-256 do arquivo | antes do upload |
| fingerprint do perfil | `/health` do worker |
| peso estimado | resposta P5 |
| tempo estimado | resposta P5 |
| peso real | diferença da bobina em balança calibrada |
| tempo real | início/fim do job, excluindo espera humana |
| resultado | sucesso, falha ou impressão interrompida |
| observações | suporte, brim, purge e incidentes |

## Método

1. Zere/valide a balança com massa conhecida.
2. Pese a bobina imediatamente antes e depois da impressão.
3. Use somente impressões concluídas para o erro principal; registre falhas à parte.
4. Calcule erro percentual por peça e mediana da amostra para peso e tempo.
5. Repita peças cujo desvio seja explicado por incidente observável.
6. Só proponha correção se houver viés consistente em duas rodadas independentes.

Um eventual fator deve ser versionado em novo perfil, acompanhado dos dados brutos e
jamais aplicado silenciosamente ao perfil v1. O preço da P4 não deve ser usado para
calibrar o slicing.
