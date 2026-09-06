# Arquitetura P4 — Motor de precificação personalizada

## 1. Objetivo

A P4 responde somente quanto cobrar quando o consumo de material por peça, o tempo de impressão por peça e a quantidade já são conhecidos. Ela não estima essas entradas a partir da geometria e não executa slicing.

## 2. Fonte dos parâmetros

O perfil inicial foi transcrito de `planilha_precificacao_impressao_3d.xlsx`:

| Parâmetro | Valor inicial |
| --- | ---: |
| Filamento | R$ 90,00/kg |
| Energia | R$ 0,90/kWh |
| Consumo médio da Bambu Lab A1 Mini | 0,06 kW |
| Aquisição da impressora | R$ 3.000,00 |
| Vida útil | 5.000 h |
| Desgaste adicional | R$ 0,00/h |
| Manutenção/consumíveis | R$ 0,40/h |
| Mão de obra efetiva | R$ 4,00/h |
| Margem-alvo | 65% |
| Reserva para perdas/reimpressões | 5% |
| Taxa de pagamento | 0% |
| Embalagem | R$ 0,00/peça |
| Acabamento | R$ 0,00/peça |

Esses valores são seed inicial. Alterações comerciais futuras devem ocorrer em um novo perfil/versionamento no banco, sem mudança da fórmula no frontend.

## 3. Fórmula canônica

Para peso `g`, tempo `h` e quantidade inteira positiva `q`:

```text
material = g × (filamento_por_kg / 1000)
energia = h × energia_por_kwh × consumo_kw
depreciação = h × (aquisição / vida_útil_h)
operação = energia + depreciação + desgaste + manutenção + mão_de_obra
base = material + operação + embalagem_por_peça + acabamento_por_peça
reserva = base × taxa_de_reserva
custo_protegido = base + reserva
preço_antes_da_taxa = custo_protegido / (1 - margem_alvo)
preço_bruto_unitário = preço_antes_da_taxa / (1 - taxa_de_pagamento)
taxa_de_pagamento = preço_bruto_unitário × taxa_de_pagamento
receita_líquida = preço_bruto_unitário - taxa_de_pagamento
lucro_estimado = receita_líquida - custo_protegido
total_do_lote = preço_unitário_arredondado × q
```

Peso e tempo são valores por peça. Embalagem e acabamento também são custos por peça, aplicados uma vez antes da multiplicação do lote.

## 4. Margem não é markup

A margem da planilha representa participação-alvo no preço de venda. Portanto:

```text
preço = custo_protegido / (1 - margem)
```

Com margem de 65%, o divisor é `0,35`. Multiplicar o custo por `1,65` seria markup e produziria um preço comercial diferente do definido na planilha.

## 5. Segurança comercial

`pricing_profiles` possui RLS forçada, não possui policy pública e revoga privilégios de `public`, `anon` e `authenticated`. Apenas a Edge Function usa service role para ler o perfil ativo. A chave privilegiada e os parâmetros comerciais não entram no bundle do navegador.

A resposta pública é deliberadamente mínima:

```json
{
  "unitPrice": 102.81,
  "totalPrice": 102.81,
  "quantity": 1,
  "currency": "BRL"
}
```

Custos, margem, reserva, taxa e lucro permanecem internos.

## 6. Fluxo

```text
Browser
  │ weightGrams + printTimeHours + quantity
  ▼
estimate-model-price
  ├── valida input e limites
  ├── consome rate limit existente
  ├── lê pricing_profiles com service role
  └── executa pricing-engine puro
          │
          ▼
 resposta pública mínima em BRL
```

O cliente em `src/pricing/pricing-client.js` apenas chama a função, normaliza a resposta e converte erros conhecidos. Ele não contém fórmula nem configuração financeira.

## 7. Campos públicos e privados

| Público | Privado |
| --- | --- |
| `unitPrice` | custos de material e operação |
| `totalPrice` | aquisição/depreciação |
| `quantity` | embalagem e acabamento |
| `currency` | margem e reserva |
|  | taxa de pagamento e lucro |

## 8. Validação e arredondamento

Entradas aceitas: `weightGrams > 0`, `printTimeHours > 0` e `quantity` inteiro positivo. Os máximos são 100.000 g por peça, 10.000 h por peça e 1.000 peças por chamada. `NaN`, `Infinity`, strings, arrays, objetos inesperados e campos extras são recusados como `INVALID_PRICING_INPUT`.

Os cálculos intermediários mantêm a precisão numérica disponível. O preço unitário público é arredondado ao centavo; o total é o preço unitário arredondado multiplicado pela quantidade e novamente normalizado a centavos. Isso garante `totalPrice = unitPrice × quantity` sem preços fracionários de centavo no contrato público.

## 9. Exemplos conferidos

| Horas | Gramas | Preço final |
| ---: | ---: | ---: |
| 1 | 50 | R$ 28,66 |
| 2 | 50 | R$ 43,82 |
| 3 | 100 | R$ 72,49 |
| 5 | 100 | R$ 102,81 |
| 10 | 250 | R$ 219,12 |
| 20 | 500 | R$ 438,24 |

## 10. Limites e relação futura com a P5

O `ModelAnalysis` da P3 descreve geometria, não consumo produtivo. A P4 não converte volume em peso, não estima infill, suporte ou tempo, não gera G-code e não afirma printabilidade.

```text
P3 — MODEL ANALYSIS
        │ contexto geométrico
        ▼
P5 — MANUFACTURING ESTIMATION / SLICING (futuro)
        ├── weightGrams
        └── printTimeHours
                │
                ▼
        P4 — PRICING ENGINE
                │
                ▼
       ESTIMATIVA COMERCIAL
```

Até a P5 ou outra fonte confiável fornecer peso e tempo, a landing page exibe estado neutro: “Estimativa disponível após análise de produção.”
