# TEIF Backbone Panel v1.2 — opção Sem fundo

**Origem desta atualização:** pacote `TEIF-v1.2-editor-UX-20261029.zip` (29/10/2026).

**Alterações:**
- Em `Mapa > Mapa padrão`, adicionada a opção `Sem fundo (somente topologia)`.
- O Leaflet não cria nem carrega tiles de mapas-base nessa opção; preserva POPs, enlaces, alarmes, rotas KMZ/GeoJSON, zoom, arraste, coordenadas e estado das consultas Zabbix.
- O fundo torna-se transparente, herdando a aparência do painel/dashboard Grafana.
- Alternar entre Escuro, OpenStreetMap, Satélite e Sem fundo não recria o mapa nem altera os objetos persistidos.
- O padrão das dashboards existentes permanece Escuro, salvo se o painel já tiver outro valor.

**Conteúdo do ZIP:** somente os três arquivos alterados (`src/module.ts`, `src/types.ts`, `src/components/SimplePanel.tsx`) e este README. Não contém o plugin inteiro.

## Aplicação no ambiente de desenvolvimento WSL

```bash
cd ~/projetos/teif/teif-backbonemap-panel

git status -sb
# Backup dos arquivos e do estado local antes de substituir.
tar -czf "$HOME/teif-antes-sem-fundo-$(date +%Y%m%d-%H%M%S).tar.gz" src package.json

# Copie o ZIP recebido para a raiz do projeto e então rode:
unzip -l TEIF-Backbone-Panel-v1.2-sem-fundo.zip
unzip -o TEIF-Backbone-Panel-v1.2-sem-fundo.zip -d .

npm run typecheck
npm run build
```

No Grafana de testes, vá a **Editar painel > Mapa > Mapa padrão > Sem fundo (somente topologia)**; salve o dashboard para persistir a escolha. Volte a `OpenStreetMap claro` quando quiser visualizar ruas.

**Observações:**
- Não aplicar diretamente no Grafana operacional sem validar no ambiente de testes; mantenha seu deploy manual.
- Caso tenha alterado algum desses arquivos depois de 29/10/2026, confira as diferenças antes de substituir: este pacote foi produzido sobre a v1.2 de 29/10.
- Verificação realizada aqui: os 3 arquivos passaram na análise sintática do compilador TypeScript. Não foi feito `npm run build` completo, pois não há `node_modules` nem o repositório completo neste ambiente.
