# TEIF Backbone Panel v1.2 — Editor simplificado e configurações globais

Data: 29/10/2026. Destino: somente Grafana de DESENVOLVIMENTO.

## Base
- Construído sobre `teif_v12_editor_simplificado.zip` de 29/10 com o hotfix TS2322 do `SimplePanel.tsx` já incorporado.
- Atualização incremental: substitui 4 arquivos existentes e adiciona 1 CSS. Não substitui o projeto inteiro, nem `package.json`, `plugin.json`, KMZ/GeoJSON ou dados do dashboard.

## Novo visual
1. A barra horizontal do mapa fica apenas com **Edit/Concluir**. No modo Edit, o rail vertical apresenta **POP, Enlace e Rotas**. Em `···` permanece **Salvar visão atual**.
2. POP: dados básicos e `+ Adicionar equipamento` visíveis. Formulário de cadastro de equipamentos abre sob demanda; cada dispositivo tem seus próprios campos/limites Zabbix. Métricas gerais, regras DOWN e exclusão são seções recolhíveis. As listas de enlaces/rotas ligadas ao POP aparecem em VISUALIZAÇÃO, não no editor.
3. Enlace: nome e estado no topo. Aparência, trajeto, métricas, regras e exclusão são seções recolhíveis.
4. Rotas KMZ: importação continua em destaque; filtros de camadas recolhíveis; pesquisas e listagens mostram no máximo 80 itens por vez para preservar fluidez (o arquivo e demais entradas continuam intactos).
5. Editor nativo do Grafana: categorias Mapa, Aparência e NOC, Monitoramento, Camadas e GeoJSON, Avançado. Controle do mapa-base, mostrar nomes/rail operacional, espessura global de enlaces, pulsação DOWN, referências KMZ, opacidade e limite de renderização.
6. POPs, equipamentos, links, vínculos GeoJSON, thresholds, cores e importação existentes NÃO são apagados ou migrados. Novas opções são todas opcionais, com defaults compatíveis.

**Limites atuais:** agrupamento inteligente de POPs por zoom não está incluído neste pacote; é uma funcionalidade separada para testar sem risco de esconder POPs/alertas. A escolha de projeto/categoria continua disponível no gerenciador KMZ e no atalho Camadas do modo operacional.

## Backup e instalação no WSL
```bash
cd ~/projetos/teif/teif-backbonemap-panel
git status -sb
tar -czf "$HOME/teif-pre-editor-ux-20261029.tar.gz" src package.json
unzip -l TEIF-v1.2-editor-UX-20261029.zip
unzip -o TEIF-v1.2-editor-UX-20261029.zip -d .
npm run typecheck
npm run build
```

**Não prossiga para o Grafana operacional se os comandos falharem.** Caso seu build limpe as rotas locais publicadas, restaure o GeoJSON conforme seu processo de desenvolvimento:
```bash
mkdir -p dist/maps
cp maps/teif-projeto-completo.geojson dist/maps/
```

## Testes
1. Abra um dashboard v1.2 com POPs e enlaces existentes. Confirme que não desapareceram.
2. Editor Grafana: mude o mapa Claro/Escuro/Satélite e verifique o efeito no painel; use a chave CARTO quando disponível, ou OSM escurecido.
3. Editor Grafana: desligue nomes dos POPs e confirme que retornam ao passar mouse; desligue barra operacional e religue.
4. Edit: abra POP > `+ Adicionar equipamento`; adicione um dispositivo com nome, abra suas métricas e vincule a query Zabbix. Confirme dados preservados após salvar/reabrir dashboard.
5. Edit: crie um enlace (entre POPs ou desenho) e teste suas seções recolhíveis de monitoramento. Valide estados UP, ATENÇÃO, DOWN e SEM DADOS.
6. Rotas: importe um KMZ, confira que opções de camadas estão em seção recolhida; confirme os vínculos com POPs e que o arquivo GeoJSON externo permanece disponível.
7. No modo Edit `··· > Salvar visão atual`, confira centro e zoom no editor Grafana. Teste também numa TV sem mouse.

## Rollback
```bash
cd ~/projetos/teif/teif-backbonemap-panel
tar -xzf "$HOME/teif-pre-editor-ux-20261029.tar.gz" -C .
npm run typecheck && npm run build
```
Remova `src/components/editorUX.css` caso o import tenha sido revertido e não haja mais referência; ele não causa efeito se não for importado.

## Validação realizada fora do WSL
- Conferida sintaxe TS/TSX dos arquivos alterados por `typescript.transpileModule`.
- Conferido conteúdo do ZIP.
- NÃO foi possível executar `npm run typecheck` e `npm run build` do plugin real nesta máquina sem `node_modules` e configuração de build original. A validação completa é obrigatória no WSL.
