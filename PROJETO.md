# Insight — Projeto de Impressão 3D

> Documento de consolidação + proposta de MVP inicial.
>
> **Nota de precisão:** não tenho, nesta conversa, acesso recuperável ao conteúdo integral das discussões anteriores sobre o projeto de impressão 3D. Portanto, não vou apresentar como "já decidido" qualquer detalhe que não esteja disponível. A seção **MVP proposto** abaixo é uma proposta inicial, explicitamente separada dos dados recuperados.

---

## 1. Identidade visual confirmada

### Marca
**Insight**

### Logo fornecida
A marca utiliza um personagem/mascote octopodal estilizado, dividido verticalmente em duas metades de alto contraste:

- metade branca;
- metade preta;
- contornos pretos;
- expressão assimétrica;
- pequeno raio sobre a cabeça;
- lettering **insight** em caixa baixa;
- lettering condensado, inclinado/itálico e de aparência tecnológica;
- composição predominantemente monocromática.

### Direção estética para o produto digital

**Princípios:**

1. Preto e branco como base.
2. Alto contraste.
3. Formas arredondadas combinadas com tipografia condensada.
4. Visual técnico, jovem e direto.
5. Poucos elementos decorativos.
6. Uso de linhas, grids e cartões como linguagem de produto.
7. Acentos gráficos inspirados no raio da marca.
8. Evitar gradientes multicoloridos, estética "gamer" genérica e excesso de efeitos 3D.
9. A interface deve parecer uma extensão da logo, não apenas usar a logo como um elemento isolado.

**Paleta inicial:**

| Token | Valor | Uso |
|---|---|---|
| `--black` | `#0A0A0A` | fundo, texto forte |
| `--white` | `#FFFFFF` | superfícies e contraste |
| `--gray-100` | `#F4F4F4` | fundo secundário |
| `--gray-300` | `#D6D6D6` | bordas |
| `--gray-600` | `#6B6B6B` | texto secundário |
| `--accent` | `#0A0A0A` | ações primárias |

---

# 2. MVP inicial — proposta

Esta seção é uma **proposta nova**, não uma transcrição de decisões anteriores.

## Hipótese de produto

Uma plataforma enxuta para transformar uma necessidade de impressão 3D em um pedido/orçamento, reduzindo o atrito entre **arquivo/modelo → configuração → orçamento → produção**.

## Fluxo mínimo

```text
INÍCIO
  ↓
Enviar modelo 3D
  ↓
Analisar arquivo
  ↓
Escolher material / acabamento / quantidade
  ↓
Estimativa
  ↓
Solicitar impressão
  ↓
Acompanhar pedido
```

## Funcionalidades do MVP

### 2.1 Upload

Aceitar inicialmente:

- `.STL`
- `.3MF`
- `.OBJ`

Interface:

- drag & drop;
- seleção de arquivo;
- nome do arquivo;
- tamanho;
- status de processamento.

### 2.2 Configuração

Campos mínimos:

- material;
- cor;
- qualidade/resolução;
- quantidade;
- acabamento;
- observações.

### 2.3 Estimativa

Exibir:

- preço estimado;
- quantidade;
- prazo estimado;
- configuração escolhida;
- botão **Solicitar impressão**.

> No MVP, a estimativa pode ser parametrizada por regras simples. Um motor de precificação real pode ser integrado posteriormente.

### 2.4 Pedido

Estados:

```text
Recebido
↓
Análise
↓
Aguardando aprovação
↓
Em produção
↓
Finalizado
↓
Entregue
```

---

# 3. Estrutura de páginas do MVP

```text
/
├── Home
├── /imprimir
│   ├── Upload
│   ├── Configuração
│   └── Estimativa
├── /pedido/:id
│   └── Acompanhamento
└── /sobre
```

---

# 4. Homepage — estrutura proposta

## Hero

**Headline:**

> Sua ideia.  
> Em três dimensões.

**Subheadline:**

> Envie seu modelo, configure a impressão e transforme o arquivo em uma peça física.

CTA:

> **Começar uma impressão**

CTA secundário:

> Ver como funciona

## Bloco de processo

### 01 — Envie
Seu modelo 3D entra no sistema.

### 02 — Configure
Escolha material, qualidade e quantidade.

### 03 — Produza
Receba uma estimativa e acompanhe o pedido.

## Bloco de posicionamento

Título:

> Do digital para o físico.

Texto curto explicando a proposta do serviço.

## CTA final

> **Pronto para imprimir?**

---

# 5. Prévia visual

O arquivo `preview.html` incluído neste pacote apresenta uma homepage estática baseada na identidade da logo fornecida.

### Elementos presentes

- logo Insight;
- navegação minimalista;
- hero monocromático;
- indicador visual inspirado no raio;
- CTA principal;
- cards do fluxo de impressão;
- área de upload simulada;
- bloco de estimativa;
- seção de acompanhamento;
- footer.

A prévia não depende de framework e pode ser aberta diretamente no navegador.

---

# 6. Linguagem visual

## Tipografia

Prioridade:

1. fonte condensada/geométrica para títulos;
2. sans-serif neutra para corpo;
3. itálico ou oblíquo em elementos de ação quando fizer sentido.

O lettering da logo deve servir como referência de personalidade, mas **não deve ser recriado ou distorcido artificialmente**.

## Componentes

### Botões

Formato:

- retangular com cantos moderadamente arredondados;
- preto sobre branco;
- branco sobre preto em áreas escuras;
- tipografia forte;
- sem sombras excessivas.

### Cards

- borda fina;
- raio moderado;
- fundo branco ou `#F4F4F4`;
- bastante espaço interno;
- números grandes para etapas.

### Inputs

- alto contraste;
- borda preta/cinza;
- foco evidente;
- labels sempre visíveis.

---

# 7. Arquitetura sugerida para evolução

```text
frontend
├── pages
├── components
├── styles
└── assets

backend
├── uploads
├── models
├── pricing
├── orders
└── users
```

Uma implementação posterior pode separar:

- autenticação;
- armazenamento de arquivos;
- processamento/análise de modelos;
- cálculo de preço;
- pedidos;
- notificações;
- painel administrativo.

---

# 8. O que ainda precisa ser recuperado/definido

Como o histórico específico do projeto de impressão 3D não está disponível para mim nesta conversa, estes pontos **não devem ser tratados como decisões anteriores**:

- nome exato do produto/serviço, caso diferente de Insight;
- público-alvo;
- modelo de negócio;
- impressoras utilizadas;
- tecnologias de impressão;
- materiais disponíveis;
- regras reais de precificação;
- cidades/região de atendimento;
- logística;
- política de arquivos;
- autenticação;
- banco de dados;
- integrações;
- identidade visual além da logo fornecida;
- funcionalidades já implementadas;
- decisões técnicas anteriormente tomadas.

---

# 9. Próxima etapa recomendada

Para transformar este documento em uma especificação fiel ao projeto original, é necessário recuperar o material anterior da discussão sobre impressão 3D.

Com esse material, esta estrutura pode ser consolidada em:

1. **PRD definitivo**
2. **arquitetura técnica**
3. **modelo de dados**
4. **fluxos de usuário**
5. **backlog do MVP**
6. **design system Insight**
7. **protótipo navegável**
8. **versão de deploy**

---

> **Nota da P1:** a arquitetura executável da foundation de upload e análise está documentada em [`docs/ARCHITECTURE_P1.md`](docs/ARCHITECTURE_P1.md). Essa fase não implementa upload nem análise de modelos.
