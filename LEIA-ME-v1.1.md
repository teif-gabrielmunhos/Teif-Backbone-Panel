# Teif Backbone Panel v1.1 — POPs do KMZ, coordenadas e enlaces por seleção

**Base necessária:** Teif Backbone Panel v1.0 com importação KMZ/KML e `jszip` instalado. Este pacote substitui apenas `src/types.ts`, `src/components/SimplePanel.tsx` e adiciona `src/kmzAssociations.ts` e `src/components/KmzManager.tsx`. **Não altera** `src/monitoring.ts`, `src/components/MonitorFieldsEditor.tsx`, CSS, `src/plugin.json`, dashboards existentes, nem o ID do plugin.

## O que muda

### Gerenciar KMZ: Pontos
- Em **Editar POPs → Rotas KMZ → Pontos**, pesquise pelo nome e expanda um ponto.
- **Salvar nome do ponto** atualiza sua identificação no JSON do painel.
- **Transformar em POP monitorável** cria um POP na mesma latitude/longitude; nele você poderá configurar CPU, ping, memória, thresholds, DOWN e outros campos, como nos POPs normais.
- **Vincular POP selecionado** associa o ponto a um POP já cadastrado sem movimentar esse POP nem duplicá-lo.
- **Desvincular POP** preserva o POP e seus dados de monitoramento.
- O editor bloqueia conversão automática se houver um POP a até **10 metros**, sugerindo vínculo explícito para evitar cópias acidentais. A visualização de referência deixa de duplicar o marcador depois da vinculação.

### Gerenciar KMZ: Rotas
- Em **Editar POPs → Rotas KMZ → Rotas**, pesquise trajetos e configure **POP de origem** e **POP de destino** de cada rota.
- Existe opção de **sugerir extremidades a até 100 m**, mas é necessário clicar para aceitar; nenhuma associação é aplicada silenciosamente.
- Clique no marcador de um POP: a janela mostrará rotas que **saem**, **chegam** ou são usadas em um enlace associado, com botão **Ver** para centralizar a rota.
- A seção mostra também os enlaces associados ao POP, com botão para abri-los.
- Remover um POP limpa automaticamente seus vínculos com rotas e pontos; excluir um ponto de referência não remove nenhum POP.

### Adicionar POP por coordenadas
- **Editar POPs → Adicionar POP** permite duas maneiras:
  - **Clicar no mapa**, como antes;
  - **Coordenadas**, preenchendo **Nome**, **Latitude** e **Longitude**.
- São aceitos valores decimais negativos (ex.: `-24.254950`, `-46.908702`) e vírgula como separador decimal, com validação dos intervalos -90..90 e -180..180.
- POPs com nome idêntico na mesma localização aproximada (até 5 m) não são recriados por engano. POPs diferentes podem compartilhar uma instalação física.

### Criar enlace selecionando POPs
- **Editar POPs → Criar enlace** agora oferece **POP de origem**, **POP de destino** e, opcionalmente, **Trajeto KMZ**.
- O método antigo de clicar em dois POPs no mapa continua disponível.
- Origem e destino não podem ser o mesmo POP. Enlaces paralelos entre dois POPs distintos permanecem permitidos.

## Instalação no WSL de laboratório

1. Salve o dashboard atual. No terminal de desenvolvimento:

```bash
cd ~/projetos/teif/teif-backbonemap-panel
mkdir -p ~/projetos/teif/backups
# Backup antes de substituir fontes
 tar -czf ~/projetos/teif/backups/pre-v11-src.tar.gz src package.json package-lock.json
```

2. Copie o ZIP baixado para a raiz do projeto. Execute:

```bash
unzip -o Teif-Backbone-Panel-v1.1-pops-kmz-coordenadas.zip
npx tsc --noEmit
npm run build
```

3. Somente se ambos concluírem sem erros:

```bash
sudo docker compose restart grafana
```

4. Atualize o navegador com `Ctrl + Shift + R`. **Salve a dashboard depois de configurar POPs e associações.**

## Teste recomendado

1. Abra um ponto KMZ, renomeie e clique em **Transformar em POP monitorável**. Verifique o novo marcador e configure um campo de Ping.
2. Em **Rotas KMZ → Rotas**, selecione uma rota, atribua origem e destino. Clique no POP de origem fora do modo edição e confira a lista de rotas. Clique em **Ver**.
3. Em **Adicionar POP → Coordenadas**, informe um nome e `-24.254950` / `-46.908702`. Salve e confirme o posicionamento.
4. Em **Criar enlace**, escolha dois POPs pelos menus. Selecione uma rota KMZ opcional ou deixe linha reta. Clique em **Criar enlace pelos POPs selecionados**.
5. Teste novamente o DOWN vermelho com X e os thresholds amarelos de um enlace existente. Salve o dashboard e recarregue.

## Notas importantes

- Uma rota **não é conectada automaticamente a um POP por mera proximidade**: confirme origem/destino para evitar falsos vínculos na rede.
- O vínculo de uma rota com dois POPs é **lógico**; a geometria KML original não é reescrita.
- O Grafana **operacional permanece com atualização manual**, após validação no laboratório.
- Testes realizados no preparo: sintaxe TypeScript/TSX dos arquivos alterados e testes isolados dos helpers de proximidade/associação. A verificação completa `npx tsc --noEmit`, `npm run build` e os testes visuais devem ser executados no seu WSL com as dependências reais do projeto.
