# Teif Backbone Panel v1.2 — Etapa 1 (camadas e GeoJSON externo)

Este pacote parte dos arquivos reais enviados em `teif-v12-base.tar.gz` (28/10/2026). **Não é um plugin novo**: substitui arquivos selecionados no projeto atual preservando os recursos preexistentes do SimplePanel.

## O que esta etapa faz

- Mantém nome e caminho de pastas ao importar arquivos KMZ/KML menores.
- Classifica as referências em Backbone, FTTH e Outros, com seleção de projeto, exibição de pontos e zoom mínimo FTTH no editor **Rotas KMZ**.
- Atualiza apenas geometrias de referência visíveis na viewport; POPs e enlaces monitorados não são filtrados.
- Permite informar URL de GeoJSON externo no editor de painel Grafana (**Mapa > GeoJSON externo (v1.2)**), evitando salvar milhares de geometrias no JSON do dashboard.
- Integra projeto `teif-projeto-completo.geojson` com 9.766 geometrias, sem precisar carregar o KMZ original pelo limite do importador legado. O arquivo geográfico deve ser disponibilizado por HTTP(S).
- Inclui botão **Enquadrar projeto GeoJSON no mapa** na janela Rotas KMZ.

## Antes de aplicar — backup obrigatório

```bash
cd ~/projetos/teif/teif-backbonemap-panel
# Certifique-se da branch de desenvolvimento:
git status -sb
# Cópia de segurança do estado local inclusive arquivos ainda não commitados:
tar -czf "$HOME/teif-pre-v12-backup.tar.gz" src package.json
# Opcional: salvar diff local para conferência:
git diff > "$HOME/teif-pre-v12-local.diff"
```

## Aplicar

Baixe o ZIP, copie-o para a raiz do projeto (WSL) e execute:

```bash
# No diretório do projeto, confira primeiro os arquivos do ZIP:
unzip -l TEIF-Backbone-Panel-v1.2-etapa1.zip
# APENAS depois do backup: substituir arquivos específicos com o ZIP:
unzip -o TEIF-Backbone-Panel-v1.2-etapa1.zip -d .
# Validar dependências existentes:
npm run typecheck
npm run build
```

O ZIP contém `src/types.ts`, `src/module.ts`, `src/kmz.ts`, `src/geo/layers.ts`, `src/geo/renderer.ts`, `src/components/KmzManager.tsx` e `src/components/SimplePanel.tsx`; não contém `package.json` ou `node_modules` alterados. O arquivo `SimplePanel.tsx` desta atualização foi construído sobre a cópia atual enviada pelo usuário, com as alterações locais preexistentes de navegação e popups.

## Disponibilizar GeoJSON completo no Grafana de teste

O plugin expõe assets pela pasta pública, frequentemente `/public/plugins/<PLUGIN_ID>/...`. Confirme o ID real:

```bash
node -p "require('./src/plugin.json').id"
# Após npm run build (se estiver usando npm run dev, copie após a geração de dist):
mkdir -p dist/maps
cp maps/teif-projeto-completo.geojson dist/maps/
```

No editor do painel em Grafana, **Mapa > GeoJSON externo (v1.2)**, preencha a URL conforme o ID real do plugin:

```
/public/plugins/SEU_PLUGIN_ID/maps/teif-projeto-completo.geojson
```

**Importante:** alguns ambientes Grafana usam subcaminho (`/grafana/`) ou proxy reverso. Ajuste a URL para o caminho público verdadeiro. Verifique no navegador ou via `curl -I` se retorna HTTP 200 e conteúdo JSON; o componente mostra erro de HTTP/CORS no gerenciador se falhar. Arquivos apenas em `/var/lib/teif-backbone/maps` não ficam automaticamente acessíveis por HTTP.

Depois, selecione **Editar POPs > Rotas KMZ**, marque **Mostrar rotas não vinculadas e pontos de referência**, use os filtros de projeto/categoria e clique em **Enquadrar projeto GeoJSON no mapa**.

O arquivo é mantido na pasta `maps/` no projeto para facilitar a cópia; a cópia dentro de `dist/maps` pode desaparecer após rebuild e deve ser refeita até automatizarmos os assets no webpack.

## Limitações conhecidas / Próximas etapas

- O importador KMZ/KML **embutido** permanece com o limite v1.1 (200 rotas, 500 pontos, 15.000 vértices). O projeto grande usa **GeoJSON externo**; isso evita salvar ~9.766 objetos nas opções do painel.
- O preview externo é um contexto geográfico. Não faz vínculos automáticos com POPs ou interfaces do Zabbix e não converte todos os pontos de referência em POPs.
- Há limites visuais de 650 geometrias externas e até 500 rotas/300 pontos importados diretamente por viewport para evitar sobrecarga. A seleção das geometrias visíveis é simples (não utiliza índice R-tree ainda).
- Não foi feita migração automática de antigos `importedRoutes`; sem pasta original salva, categorias serão inferidas pelo nome.
- O pacote foi validado quanto a **sintaxe TS/TSX**, compilação do módulo puro de camadas e filtragem dos 9.766 registros. **Build completo Grafana/React e teste visual no seu ambiente ainda são necessários.**
- Próximo avanço: associação explícita das rotas externas aos enlaces monitorados, customização da sidebar e automatização do empacotamento de assets (com testes e rollback).

## Rollback de arquivos

Se `npm run typecheck` ou o painel apresentar problemas, restaure o estado anterior a partir do backup (revise o arquivo antes de sobrescrever):

```bash
cd ~/projetos/teif/teif-backbonemap-panel
tar -xzf "$HOME/teif-pre-v12-backup.tar.gz" -C .
```

Desative/limpe o campo **GeoJSON externo** caso já tenha sido salvo no dashboard de teste.
