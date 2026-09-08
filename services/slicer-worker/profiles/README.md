# Bundles de manufacturing profile

O build gera dois bundles neste diretório da imagem, usando somente os presets
distribuídos na AppImage oficial e pinada do OrcaSlicer 2.4.2:

- `insight-a1m-pla-020-v1` preserva a impressora real;
- `insight-estimation-a1m-pla-020-v1` altera somente o volume de slicing para
  `2000 x 2000 x 2000 mm`.

Os JSONs derivados não são simulados no repositório: o estágio `orca` extrai a fonte
oficial, executa `scripts/flatten-presets.js`, calcula hashes/fingerprint e falha diante
de herança inválida ou se o fingerprint aprovado do profile real mudar. A imagem final
contém os dois conjuntos de quatro arquivos efetivamente validados.
Para uma alteração, crie uma nova chave/versão; nunca substitua silenciosamente v1.
