# Teif Backbone Panel v1.0 — KMZ/KML + campos recolhíveis

**Base:** Teif Backbone Panel v0.9, com monitoramento de POPs e enlaces, thresholds independentes, motivos do alerta e DOWN de prioridade máxima. Atualização preparada para aplicar **somente no projeto de desenvolvimento WSL** e validar antes de enviar ao Grafana operacional.

## Novidades

### 1. Editor compacto de campos
- Cada campo de monitoramento aparece em uma linha com **seta, nome, query, item (quando disponível), último valor** e destaque **ATENÇÃO** quando seu threshold dispara.
- Clique na linha para **expandir ou recolher** as propriedades do campo.
- **Expandir todos / Recolher todos** no topo.
- Um campo recém-adicionado abre automaticamente.
- Reordenar e remover continuam acessíveis com o campo recolhido.
- Recolher/expandir é apenas estado da interface: **não apaga a configuração nem interfere nas consultas**.
- Funciona tanto na edição de POPs quanto na de enlaces.

### 2. KMZ/KML para trajetos reais
- **Editar POPs → Importar KMZ/KML → Selecionar arquivo** aceita `.kml` ou `.kmz`.
- Extrai geometrias `LineString`, `MultiGeometry` (LineStrings) e `gx:Track`, e pontos de referência `Point`.
- Lista as rotas importadas, permite localizá-las no mapa ou removê-las quando não vinculadas.
- **Editar enlace → Trajeto geográfico (KMZ/KML)** permite associar um trajeto ao enlace.
- Quando vinculado, o enlace segue a geometria da rota em vez da linha reta entre POPs.
- Mantém **alerta vermelho pulsante + X**, threshold amarelo, indicador de sem dados e popup com motivos ao longo da rota.
- O **X fica no meio do trecho visível** do trajeto, mesmo ao mover o mapa/alterar zoom.
- POPs e pontos de referência do KMZ permanecem independentes: a importação não cria/edita POPs automaticamente.
- Rotas e pontos importados ficam salvos nas **opções do dashboard** (JSON do painel); salve o dashboard após importar e atribuir.

**Limitações deliberadas:** a importação não interpreta imagens de sobreposição (`GroundOverlay`), `Polygon` nem transforma automaticamente `Point` em POP. É necessário **selecionar manualmente** a rota de cada enlace e conferir sua geometria. Para dashboards com muitas fibras, simplifique os trajetos antes de importar, pois coordenadas extensas aumentam o JSON e o custo no navegador.

## Instalação de desenvolvimento (Ubuntu WSL)

1. Salve sua dashboard atual no Grafana de laboratório.
2. No WSL, na pasta do plugin:

```bash
cd ~/projetos/teif/teif-backbonemap-panel
mkdir -p ~/projetos/teif/backups
# Salva código-fonte e configuração atuais
 tar -czf ~/projetos/teif/backups/pre-v10-src.tar.gz src package.json package-lock.json
```

3. Baixe e copie este ZIP para a raiz do projeto. Depois execute:

```bash
unzip -o Teif-Backbone-Panel-v1.0-kmz-editor.zip
npm install --save jszip@^3.10.1
npx tsc --noEmit
npm run build
```

4. Somente após a compilação **sem erros**:

```bash
sudo docker compose restart grafana
```

Atualize a página do Grafana de laboratório com `Ctrl+Shift+R`.

**Não atualize o Grafana operacional antes de validar.** Como acordado, a implantação nele continua manual.

## Teste sugerido

1. Em **Editar POPs**, clique em um POP com vários campos. Verifique que estão recolhidos, clique em um cabeçalho para expandir; compare o valor com a query. Teste mover e excluir campos, abrir vários, e fechar todos.
2. Adicione um campo novo: o formulário dele deve abrir automaticamente. Renomeie: o título do cabeçalho deve acompanhar.
3. Ative **Importar KMZ/KML**, selecione seu arquivo e confirme que os trajetos aparecem como linhas tracejadas de referência.
4. Clique em **Editar enlace** e escolha o trajeto desejado. O enlace deverá acompanhar a rota real.
5. Faça um teste com valor de atenção e DOWN: todo o trajeto deve mudar de cor, o X continuar visível e o popup manter os motivos das regras.
6. Salve a dashboard; recarregue e confirme que associações, campos e rotas continuam presentes.

## Em caso de erro

Cole o resultado completo de `npx tsc --noEmit` ou `npm run build`, sem apagar os arquivos antigos. Se der falha de dependência `jszip`, confirme que `npm install --save jszip@^3.10.1` foi executado na **raiz do projeto**, não como root.

**Testes realizados nesta preparação:** sintaxe TS/TSX dos quatro arquivos; verificação TypeScript isolada do parser KMZ com tipos de teste. A **compilação completa com as dependências do projeto e o teste visual no Grafana precisam ser realizados no seu WSL**.
