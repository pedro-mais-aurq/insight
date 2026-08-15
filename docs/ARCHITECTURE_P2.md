# Arquitetura P2 — Anexagem segura de arquivos

## Implementado

A P2 implementa seleção por seletor nativo e drag-and-drop, validação de metadata no cliente e no servidor, autorização temporária de upload, persistência no Storage privado, confirmação server-side, remoção e substituição.

Os formatos permitidos são STL, 3MF e OBJ. Apenas um arquivo é aceito por seleção. Arquivos vazios são recusados. `maxFileSizeBytes` permanece `null`, portanto nenhum limite máximo de produto foi inventado.

## Fluxo

1. O browser recebe um `File` pelo seletor ou por drag-and-drop.
2. `file-validator.js` valida nome, extensão e tamanho básico.
3. `create-model-upload` repete as validações pertinentes, cria o registro canônico em `model_uploads`, gera `<uploadId>/model.<ext>` e entrega um token temporário limitado a esse objeto.
4. `upload-service.js` envia o arquivo ao bucket privado `model-uploads` com a autorização assinada.
5. `complete-model-upload` consulta bucket e path a partir do registro, confirma que o objeto existe e compara seu tamanho armazenado com `size_bytes`.
6. Somente após essa confirmação o registro passa para `uploaded`.
7. Remoção e substituição usam `remove-model-upload`; uma substituição inicia depois um registro com novo UUID.

As três fases do envio são tratadas separadamente:

- `CREATE`: cria o registro e obtém autorização assinada;
- `UPLOAD`: persiste fisicamente o arquivo no Storage;
- `COMPLETE`: verifica o objeto server-side e confirma o registro.

Em forma compacta:

```text
File
  → Client Validator
  → create-model-upload
  → model_uploads
  → Signed Upload Authorization
  → Supabase Storage privado
  → complete-model-upload
  → uploaded
```

## Falhas e retry de confirmação

`UPLOAD_FAILED` e `COMPLETE_FAILED` possuem semânticas diferentes:

```text
UPLOAD_FAILED
=
o envio físico ao Storage falhou.
```

Nesse caso, a aplicação pode chamar `remove-model-upload` como cleanup best-effort e um retry executa novamente o fluxo completo.

```text
COMPLETE_FAILED
=
o envio físico pode ter concluído,
mas o cliente não conseguiu confirmar o estado final.
```

Uma falha de confirmação não remove automaticamente o objeto. O frontend preserva `uploadId`, `storagePath`, `File` e metadata e oferece retry exclusivo de `complete-model-upload`:

```text
uploadToSignedUrl
  → OK
  → complete-model-upload
  → falha ou resposta perdida
  → COMPLETE_FAILED
  → retry complete(uploadId)
  → uploaded
```

Esse retry não chama `create-model-upload`, não emite outro token, não cria UUID e não reenvia o arquivo. Se uma resposta anterior se perdeu depois de o backend confirmar, `complete-model-upload` reconhece o registro já `uploaded` e retorna sucesso idempotente.

O retry de confirmação é reservado a falhas incertas: rede, timeout, resposta perdida, resposta ilegível ou falha interna inesperada. Nesses casos o frontend normaliza o erro para `COMPLETE_FAILED` e mantém `confirmationPending = true`.

Respostas estruturadas do backend que provam que o envio atual não pode ser confirmado preservam seu código e usam `confirmationPending = false`:

| Código | Semântica | Próxima ação |
|---|---|---|
| `OBJECT_NOT_FOUND` | O objeto esperado não existe no Storage. | Novo envio explícito. |
| `SIZE_MISMATCH` | O tamanho armazenado difere de `size_bytes`; o backend remove o objeto incompatível e marca o registro como falho. | Novo envio explícito. |
| `UPLOAD_REMOVED` | O registro já está em `removed`. | Novo envio explícito. |
| `UPLOAD_STATE_INVALID` | O status atual não admite conclusão. | Novo envio explícito. |
| `UPLOAD_NOT_FOUND` | O UUID não corresponde a um registro existente. | Novo envio explícito. |

Esses erros definitivos não disparam `complete-model-upload` novamente e não iniciam automaticamente outro upload. A interface explica o motivo em linguagem segura e só inicia um novo fluxo completo após ação explícita do usuário. Nenhuma falha da fase `COMPLETE`, transitória ou definitiva, aciona cleanup automático no cliente; isso evita apagar um objeto cuja persistência esteja incerta e evita duplicar cleanup já executado pelo backend, como em `SIZE_MISMATCH`.

A remoção durante `COMPLETE_FAILED` ocorre somente por ação explícita do usuário. `remove-model-upload` consulta o path canônico, remove o objeto quando presente e mantém a linha como `removed`.

## Fronteiras de confiança e segurança

- O browser envia somente metadata para criar e somente `uploadId` para concluir ou remover.
- UUID, bucket, path e status canônicos são decididos no servidor.
- O browser não escreve diretamente em `model_uploads` e não recebe a service role.
- A `SUPABASE_SERVICE_ROLE_KEY` é lida exclusivamente do ambiente das Edge Functions.
- O bucket continua privado e nenhuma policy pública de Storage foi criada.
- Tokens assinados, chaves, conteúdo binário e stacks não são escritos em logs nem devolvidos em erros.
- As funções aceitam somente `POST`/`OPTIONS`, retornam erros estruturados e restringem CORS a origens locais conhecidas e às origens definidas em `ALLOWED_ORIGINS`.

Não há autenticação nesta fase. Consequentemente, as três Edge Functions formam uma superfície pública: CORS restringe browsers, mas não substitui autenticação nem proteção contra clientes não-browser. Os inputs são validados e o cliente não escolhe bucket ou path; rate limiting e controles anti-abuso adicionais continuam abertos.

As funções estão configuradas com `verify_jwt = false` em `supabase/config.toml`, de acordo com a decisão explícita de não criar contas na P2. Em produção, `ALLOWED_ORIGINS` deve conter a lista separada por vírgulas das origens reais. Nenhum domínio de produção foi presumido.

## Estados e progresso

O fluxo da P2 usa `idle → selected → validating → uploading → uploaded`, além de `invalid`, `upload_error` e retorno a `idle`. `upload_error → uploaded` só ocorre no retry de confirmação após resposta bem-sucedida do backend. Os estados `analyzing`, `ready` e `analysis_error` permanecem reservados para P3.

A API de upload assinado usada nesta versão do SDK não expõe progresso granular nem cancelamento confiável para essa operação. A interface usa estado indeterminado durante o envio e só define 100% após confirmação server-side. Não há percentual ou cancelamento simulados; cancelamento real permanece decisão futura.

## Limites da P2

- A P2 valida metadata; não valida geometria.
- A P2 confirma persistência; não confirma printabilidade.
- A P2 anexa modelos; não gera preview, métricas, slicing ou preço.
- MIME é armazenado quando disponível, mas não é tratado como prova de formato.
- Um nome terminado em `.stl`, `.3mf` ou `.obj` ainda pode conter conteúdo inválido; parsing estrutural pertence à P3.

## Garantia para a P3

A P3 só deve iniciar análise quando o frontend possuir `status = "uploaded"` proveniente de confirmação server-side bem-sucedida. `selected`, `uploading` e `upload_error` nunca tornam um arquivo elegível para análise.

O primeiro `complete-model-upload` verifica registro, bucket, path, existência do objeto e tamanho armazenado antes de alterar o status. Uma repetição para um registro já `uploaded` retorna o mesmo sucesso sem efeitos colaterais destrutivos.

## Configuração operacional

O frontend requer somente variáveis públicas:

```dotenv
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

O runtime das Edge Functions fornece `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`. A configuração adicional de produção é server-side:

```dotenv
ALLOWED_ORIGINS=<origem-real-do-frontend>
```

O valor acima é apenas o formato esperado; deve ser substituído pela origem real e não deve ser copiado como domínio de produção.

## Open Decisions

- limite máximo por arquivo;
- política de retenção;
- limpeza programada de uploads abandonados;
- rate limiting;
- proteção anti-abuso;
- autenticação futura;
- cancelamento real de upload;
- slicing;
- pricing.

Rate limiting e anti-abuse são hardening obrigatório antes de produção. CORS limita comportamento de browsers, mas não autentica nem impede chamadas diretas aos endpoints públicos.
