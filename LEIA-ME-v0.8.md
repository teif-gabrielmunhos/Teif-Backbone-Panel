# Teif Backbone Panel — v0.8: Thresholds independentes e prioridade de status

Atualização **incremental** sobre a v0.7.1. Preserva o nome do plugin, o ID, a posição dos POPs, as consultas, a configuração anterior de DOWN e a animação de vermelho fraco/forte com X.

## Regra de prioridade

**DOWN (vermelho pulsante + X) > qualquer threshold de atenção ultrapassado (amarelo fixo) > sem dados (cinza tracejado) > operacional (cor cadastrada no enlace; normalmente verde).**

Cada campo de monitoramento do enlace tem um threshold **independente** (`warningRule` com operador e valor). Se qualquer um disparar, o cabo fica amarelo; se a regra DOWN também disparar, o cabo permanece VERMELHO. O alerta vermelho anterior (`alertRule`) continua como controlador exclusivo de falha crítica.

Quando houver campos configurados mas sem dados válidos: retornará cinza tracejado se não houver outra regra acionada. Não interpreta ausência como 0. Não existe TTL da última coleta nesta versão.

Valores-limite são comparados com os números **brutos** retornados pelas queries, independentemente da unidade exibida. Por exemplo, se a query devolve bits/s, um alerta em 70 Gbps usa **70000000000**, não 70. Se a query já devolve Gb/s, o limite deve acompanhar essa escala. A unidade de exibição não altera a comparação.

## Arquivos alterados

- `src/types.ts`: `MonitorField.warningRule?` opcional, compatível com dashboards antigos.
- `src/monitoring.ts`: avaliação de regras e agregação hierárquica.
- `src/components/MonitorFieldsEditor.tsx`: habilita regras individuais de atenção nos campos de enlaces (não exibe essa configuração em POPs).
- `src/components/SimplePanel.tsx`: cabo amarelo, tooltip de atenção, prioridade e mensagem de status; preserva o X e o pulso na falha DOWN.

O pacote **não altera** `plugin.json`, `module.ts`, `linkStatus.css`, `editorLayout.css`, `package.json`, Docker nem mapas.

## Instalação segura

1. Salve a dashboard no Grafana.
2. Entre no diretório do projeto:

```bash
cd ~/projetos/teif/teif-backbonemap-panel
mkdir -p ~/projetos/teif/backups
cp -a src ~/projetos/teif/backups/src-pre-v08
```

3. Copie este ZIP para a raiz do projeto e extraia:

```bash
unzip -o Teif-Backbone-Panel-v0.8-thresholds.zip
npx tsc --noEmit
npm run build
sudo docker compose restart grafana
```

4. Faça Ctrl+Shift+R no navegador.

## Teste com Random Walk

Configure 2 campos em um enlace. Num deles marque "Threshold de atenção (fibra amarela)", operador "Maior que", limite `-1000` (um valor normalmente abaixo do Random Walk). O cabo deverá ficar amarelo. Em "Estado DOWN", escolha outro campo, operador "Maior que", limite `-1000`: agora ficará vermelho pulsante com X, mesmo com o amarelo acionado. Altere o limite DOWN para `1000000` e o cabo voltará ao amarelo. Desabilite o threshold amarelo: o cabo voltará à cor manual (verde por padrão). Salve o dashboard e atualize a página.

**Nota:** a leitura Random Walk pode assumir valores diferentes; use limites extremos apenas para testar e confira os valores exibidos.

### Validação

Este pacote teve sintaxe TS/TSX e a lógica de prioridade testadas isoladamente com resultados simulados, inclusive múltiplas regras, 0 real, ausência de dados e DOWN simultâneo. Confirme a compilação completa no seu WSL com `npx tsc --noEmit` e `npm run build` antes de reiniciar o Grafana.
