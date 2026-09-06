# Relatório de entrega — P4 Motor de precificação

## 1. Resumo técnico

A P4 adiciona um motor puro de precificação no backend, um perfil financeiro privado no Supabase, a Edge Function pública `estimate-model-price`, integração ao rate limit existente, cliente frontend dedicado, estado neutro da estimativa e testes automatizados. Upload, análise geométrica e viewer da P1–P3 foram preservados.

## 2. Commit-base

`2b4baf1f903da8d1115dbcfa776b06e109dc75ff`

O hash foi registrado no comentário do arquivo ZIP fornecido como baseline. O pacote não continha o diretório `.git`.

## 3. Arquivos da P4

### Criados

```text
docs/ARCHITECTURE_P4.md
docs/DELIVERY_P4.md
src/pricing/pricing-client.js
src/pricing/pricing-errors.js
src/pricing/pricing-view.js
supabase/functions/_shared/pricing-engine.ts
supabase/functions/estimate-model-price/index.ts
supabase/migrations/20260905203000_p4_pricing_engine.sql
tests/p4-pricing-sql.test.js
tests/pricing-client.test.js
tests/pricing-engine.test.js
tests/pricing-view.test.js
```

### Modificados

```text
README.md
assets/css/style.css
index.html
src/main.js
supabase/config.toml
supabase/functions/_shared/rate-limit-policy.ts
tests/rate-limit.test.js
```

## 4. Fórmula implementada

```text
material = peso_g × (filamento_kg / 1000)
operacional = tempo_h × (energia_h + depreciação_h + desgaste_h + manutenção_h + mão_de_obra_h)
base = material + operacional + embalagem_unitária + acabamento_unitário
reserva = base × taxa_de_reserva
protegido = base + reserva
preço_antes_da_taxa = protegido / (1 - margem_alvo)
preço_bruto = preço_antes_da_taxa / (1 - taxa_de_pagamento)
preço_unitário = arredondar_centavos(preço_bruto)
preço_lote = arredondar_centavos(preço_unitário × quantidade)
```

A margem de 65% é margem sobre o preço de venda; não foi implementada como markup.

## 5. Parâmetros extraídos da planilha

| Parâmetro | Valor |
| --- | ---: |
| Filamento | R$ 90,00/kg |
| Energia | R$ 0,90/kWh |
| Consumo A1 Mini | 0,06 kW |
| Aquisição A1 Mini | R$ 3.000,00 |
| Vida útil | 5.000 h |
| Desgaste adicional | R$ 0,00/h |
| Manutenção | R$ 0,40/h |
| Mão de obra | R$ 4,00/h |
| Margem-alvo | 65% |
| Reserva | 5% |
| Taxa de pagamento | 0% |
| Embalagem | R$ 0,00/peça |
| Acabamento | R$ 0,00/peça |

## 6. Resultados reproduzidos

| Tempo | Peso | Resultado |
| ---: | ---: | ---: |
| 1 h | 50 g | R$ 28,66 |
| 2 h | 50 g | R$ 43,82 |
| 3 h | 100 g | R$ 72,49 |
| 5 h | 100 g | R$ 102,81 |
| 10 h | 250 g | R$ 219,12 |
| 20 h | 500 g | R$ 438,24 |

Também foram validados os indicadores intermediários da seção “Referência rápida”: R$ 14,44/h sem filamento, R$ 0,257142857/g, R$ 27,297142857 para 1 h + 50 g antes da reserva e R$ 97,914285714 para 5 h + 100 g antes da reserva.

## 7. Migration

`20260905203000_p4_pricing_engine.sql` cria `pricing_profiles` com `numeric`, constraints, timestamps, trigger de `updated_at`, apenas um perfil ativo, RLS forçada, privilégios públicos revogados e seed inicial. A mesma migration amplia a whitelist atômica do rate limit para `estimate-model-price`.

## 8. Função Supabase

`estimate-model-price`:

- aceita somente `weightGrams`, `printTimeHours` e `quantity`;
- exige peso e tempo positivos e quantidade inteira positiva;
- aplica limites máximos antiabuso;
- usa o rate limit já existente: 30 chamadas por 10 minutos;
- lê o perfil com service role;
- devolve somente `unitPrice`, `totalPrice`, `quantity` e `currency`.

## 9. Testes adicionados

Os testes cobrem caso principal, seis exemplos, indicadores rápidos, quantidade, embalagem, acabamento, margem, taxa de pagamento, arredondamento, entradas inválidas, limites máximos, perfil inválido, resposta pública, cliente frontend, estado neutro, migration/RLS e novo escopo de rate limit.

## 10. Resultado de `npm test`

```text
Test Files  29 passed (29)
Tests       228 passed (228)
```

## 11. Resultado de `npm run build`

```text
vite v8.2.1
83 modules transformed
build concluído com sucesso
```

O Vite mantém um aviso não bloqueante de chunk acima de 500 kB, relacionado ao bundle atual com Three.js.

## 12. Limitações conhecidas

- Migration e Edge Function ainda precisam ser aplicadas/deployadas no projeto Supabase autorizado.
- Não existe painel administrativo para versionar perfis; a estrutura de banco está pronta para manutenção server-side.
- A landing page não possui fonte confiável de peso/tempo nesta etapa e, portanto, exibe estado neutro.
- Não foi executado teste de integração contra um Supabase remoto.

## 13. Confirmação de escopo

P5 não foi implementada. Não há slicer, G-code, estimativa falsa por bounding box, conversão ingênua de volume em peso, suporte inventado ou tempo de impressão derivado da geometria.
