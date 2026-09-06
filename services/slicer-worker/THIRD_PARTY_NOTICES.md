# Third-party notices — Insight Slicer Worker

## OrcaSlicer 2.4.2

- Projeto: OrcaSlicer
- Versão incorporada: 2.4.2, commit de release `8500fcd`
- Licença declarada pelo projeto: GNU Affero General Public License v3.0
- Código-fonte correspondente: <https://github.com/OrcaSlicer/OrcaSlicer/tree/v2.4.2>
- Release/binários: <https://github.com/OrcaSlicer/OrcaSlicer/releases/tag/v2.4.2>
- Binário Linux x86_64: `OrcaSlicer_Linux_AppImage_Ubuntu2404_V2.4.2.AppImage`
- SHA-256 verificado no build: `d12fb8c8eac1aecd2dfb6377acd48f994f8fa439ed5292fa532dd82880f029fd`
- Dependências Ubuntu: snapshot imutável `20260707T120000Z`

O Dockerfile baixa somente essa release, valida o checksum antes da extração e mantém
o worker desacoplado do frontend. A imagem Ubuntu inclui uma cópia da AGPL-3 em
`/usr/share/common-licenses/AGPL-3`.

OrcaSlicer incorpora componentes e pode oferecer plugin de rede com termos próprios.
O worker não instala, ativa nem utiliza o plugin de rede Bambu; usa apenas o slicing
local por CLI e os presets distribuídos na release.

A separação em container/subprocesso é uma decisão técnica de isolamento e não uma
garantia jurídica de inexistência de obrigações da AGPL. A avaliação de distribuição e
uso em rede deve ser concluída antes da produção comercial.
