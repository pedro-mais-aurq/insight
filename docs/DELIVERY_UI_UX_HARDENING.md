# Relatório de entrega — UI/UX Hardening R3

Status: **implementação funcional concluída; aceite final ainda depende do número
oficial de WhatsApp e de uma rodada visual em navegador real**.

Nenhum deploy, `git push`, `db push`, migration apply, secret change ou alteração
remota foi executado.

## 1. Base e escopo

O pacote não contém `.git`. O commit-base declarado nos documentos recebidos é
`2b4baf1f903da8d1115dbcfa776b06e109dc75ff`; ele não pôde ser verificado contra um
checkout local.

Esta rodada altera somente a apresentação e a orquestração visual do frontend. Backend,
worker, Dockerfiles, profiles, migrations, Edge Functions, HMAC, timeout, concorrência,
regras de unidade e motor de pricing permanecem inalterados.

## 2. Limpeza do painel de visualização

Depois do envio, o painel preto apresenta somente:

- nome do arquivo;
- visualização 3D;
- unidade e medidas físicas: dimensões, área superficial e volume.

Status, ações, falhas, indisponibilidade do preview e advertências geométricas foram
retirados do painel preto. Quando necessários, aparecem no painel branco. Contagens de
triângulos, meshes, vértices e diagnósticos de topologia deixaram de ocupar a interface
do cliente, sem remover esses dados do resultado interno da análise.

## 3. Barra de etapas

A barra de Upload, Análise, Preparação, Estimativa e Preço começa oculta e é mostrada
somente quando o estado autoritativo entra em `analyzing`. Ela permanece visível nos
estados seguintes e preserva as etapas já concluídas.

Percentuais são anunciados somente quando existe progresso mensurável. Como o upload
atual via `uploadToSignedUrl` não fornece progresso granular, operações sem percentual
real usam barra indeterminada. Nenhum valor fictício é exibido.

O histórico visual redundante foi removido. O cliente acompanha o processo apenas pela
barra e pelas mensagens de cada etapa.

## 4. Estimativa

As labels “Estimativa técnica” e “Estimativa comercial” foram removidas. Peso, prazo e
valor continuam disponíveis nas linhas consolidadas do orçamento, enquanto os estados
de processamento ficam na barra progressiva. Mensagens técnicas continuam presentes
somente como anúncios acessíveis para leitores de tela.

## 5. Análise prolongada

Um temporizador cancelável começa no estado `analyzing` e permanece ativo durante toda
a jornada automática — análise geométrica, preparação, slicing e precificação. Se essa
jornada continuar por 20.000 ms, a barra passa a exibir:

- “A análise está demorando mais que o esperado.”
- “A melhor opção pode ser consultar diretamente com a Insight.”
- CTA contextual de WhatsApp.

O aviso é encerrado somente no sucesso, em uma falha terminal ou quando o fluxo exige
uma ação do cliente, como a confirmação da unidade física.

## 5.1. Ajustes finais de layout

- O alinhamento do painel preto passou de `space-between` para `flex-start`, com 14 px
  entre o nome do arquivo e a visualização.
- A seção demonstrativa “Acompanhar” e seu link de navegação foram removidos.
- O footer simples foi substituído por uma composição responsiva com apresentação da
  marca, navegação, CTA e faixa institucional.

## 6. Logo

O SVG oficial anexado foi integrado em navbar, favicon e footer como
`assets/image/insight-logo.svg`. O desenho vetorial foi preservado. A prévia PNG oculta
e sem uso, embutida no arquivo original, foi removida; o asset caiu de aproximadamente
1,1 MB para 11,3 kB. A antiga `assets/image/insight-logo.jpg` foi substituída.

## 7. WhatsApp

Uma única camada reutilizável:

- sanitiza nome, formato e valores numéricos;
- omite campos ausentes ou inválidos;
- diferencia sucesso, falha, warning físico e limite automático;
- codifica a mensagem na URL;
- atualiza todos os CTAs sem duplicar regra em componentes;
- usa exclusivamente `VITE_WHATSAPP_NUMBER`.

Nenhum telefone foi inventado. Sem o número oficial, os CTAs falham fechados e ficam
desabilitados. O painel comercial normal não aparece durante a análise; após 20
segundos, apenas o aviso solicitado oferece a consulta direta.

## 8. Capacidade física

Com unidade confirmada e dimensões físicas finitas, qualquer eixo acima de 180 mm gera
`completed + warning` e adapta a mensagem do WhatsApp. Isso não altera o controller
nem bloqueia o início da estimativa. `MODEL_OUTSIDE_BUILD_VOLUME` continua sendo um
limite da estimativa automática, nunca uma declaração de impossibilidade de produção.

## 9. Header e performance

O header 3D e o STL da McLaren foram preservados sem alterar composição, câmera,
materiais, geometria, iluminação ou trajetória. A integração continua tardia, com
fallback de WebGL, pausa fora da viewport/aba, redução de pixel ratio em mobile e
respeito a `prefers-reduced-motion`.

O entry inicial permanece em aproximadamente 5 kB. O chunk compartilhado de Three.js,
com aproximadamente 537 kB, é carregado sob demanda.

## 10. Testes desta rodada

Há cobertura específica para:

- barra oculta antes do estado `analyzing`;
- cinco etapas e semântica dos progress indicators;
- aviso acionado exatamente aos 20 segundos;
- cancelamento do aviso antes do limite;
- painel preto restrito a nome, preview e medidas;
- ausência das labels removidas e do histórico redundante;
- uso exclusivo da nova logo SVG;
- contratos responsivos em 320, 375, 390, 430, 768, 1366 e 1440 px.

Resultado final:

- Vitest: 40 arquivos e 290 testes aprovados;
- worker Node: 38 testes aprovados;
- total: 328 testes aprovados, sem falhas ou testes ignorados.

## 11. Build e validação visual

O build Vite está aprovado. O projeto é JavaScript e não possui script `typecheck`.

A inspeção visual em navegador remoto da rodada anterior não conseguiu acessar o
servidor local do ambiente (`ERR_BLOCKED_BY_CLIENT` e, na ponte estática,
`502 Bad Gateway`). O SVG desta rodada foi renderizado localmente e conferido contra o
desenho anexado, mas ainda não há alegação de validação E2E visual em navegador real.

## 12. Riscos residuais

1. Falta o número oficial de WhatsApp; o CTA está implementado, porém desabilitado sem
   `VITE_WHATSAPP_NUMBER`.
2. Falta uma rodada visual em navegador real, especialmente iPhone/Safari.
3. O chunk tardio de Three.js continua acima de 500 kB, sem bloquear o entry inicial.

## 13. Veredito

**BLOCKED**

A implementação desta rodada está funcional e testada. `UI_UX_READY` ainda depende da
configuração do destino oficial do WhatsApp e da validação visual real.
