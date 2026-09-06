# Bundles de manufacturing profile

O build gera `insight-a1m-pla-020-v1/{machine,process,filament,manifest}.json` neste
diretório da imagem, usando somente os presets distribuídos na AppImage oficial e
pinada do OrcaSlicer 2.4.2.

Os JSONs derivados não são simulados no repositório: o estágio `orca` extrai a fonte
oficial, executa `scripts/flatten-presets.js`, calcula hashes/fingerprint e falha diante
de herança inválida. A imagem final contém os quatro arquivos efetivamente executados.
Para uma alteração, crie uma nova chave/versão; nunca substitua silenciosamente v1.
