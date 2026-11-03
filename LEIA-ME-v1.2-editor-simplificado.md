# Teif Backbone Panel — v1.2 · Editor simplificado (29/10/2026)

Base: `teif_v12_demo_integrada.zip` de 28/10/2026, preservando a v1.2 com GeoJSON externo, sidebar NOC, POPs, enlaces e KMZ. Este pacote é um PATCH para o projeto Grafana EXISTENTE; não instala um plugin novo.

## Alterações

1. Barra superior compacta: `Mapa [Escuro / Claro / Satélite]`, `Camadas` quando aplicável e `Edit / Concluir`. O NOC agora é a apresentação padrão; o editor aparece com o botão Edit.
2. Ferramentas do editor recolhíveis: `+ POP`, `+ Enlace`, `Rotas KMZ` e `Salvar visão`; ações não ficam mais disputando espaço com o mapa.
3. Painéis do editor ampliados para 460 px e rolagem local.
4. Novo enlace por POPs (como antes) ou `Desenhar no mapa`: escolha origem/destino entre POPs, clique para criar pontos intermediários, desfaça, limpe ou salve. O caminho desenhado é armazenado como uma `ImportedRoute` com ID próprio, vinculado ao enlace. *Esta primeira versão não cria enlaces sem POPs de extremidade.*
5. POP com vários equipamentos opcionais: adicione switch/roteador/OLT por POP, associe `MonitorFieldsEditor` individualmente e configure regra DOWN de cada equipamento. O POP conserva as métricas legadas e pode consolidar resultados dos equipamentos; dados ausentes não viram UP.
6. Enlaces monitorados: verde só quando regra avaliada OK, amarelo ATENÇÃO, vermelho DOWN e cinza pontilhado quando sem regra/dados. Geometrias KMZ de referência continuam roxas ou neutras, sem afirmar status operacional.
7. Fundo escuro padrão: CARTO Dark Matter com chave informada no editor Grafana em **Mapa > Chave CARTO Dark Matter (opcional)**. Sem chave, o mapa escuro provisório aplica filtro CSS SOMENTE nos tiles OSM. **NÃO** funciona como um tema cartográfico oficial; prefira configurar a chave CARTO para resultado final. A chave no dashboard NÃO é segredo: restrinja por domínio na CARTO.

## Aplicar exclusivamente no ambiente de desenvolvimento

No WSL, *dentro do diretório do plugin*, confira a branch e faça backup:

```bash
cd ~/projetos/teif/teif-backbonemap-panel
git status -sb
tar -czf "$HOME/teif-antes-editor-20261029.tar.gz" src package.json
```

Copie `teif_v12_editor_simplificado.zip` para a raiz do plugin e execute:

```bash
unzip -l teif_v12_editor_simplificado.zip
unzip -o teif_v12_editor_simplificado.zip -d .
npm run typecheck
npm run build
# Restaurar o GeoJSON externo após build se o processo limpar dist/maps:
mkdir -p dist/maps
cp maps/teif-projeto-completo.geojson dist/maps/
```

Se o comando `npm run typecheck` falhar, **não** atualize o Grafana operacional. Confirme qual arquivo e linha falhou, corrigindo antes de implantar. Faça refresh `Ctrl+Shift+R` do dashboard de teste.

**Não instale o pacote no Grafana operacional antes de validar.** Este patch usa o último pacote recuperado da Biblioteca, e pode não incluir edições locais mais recentes que tenham sido feitas no WSL após 28/10/2026. Compare `git diff` antes de aceitar mudanças.

## Testar

- Visualização começa escura. Alternar para Claro/Satélite preserva POPs e KMZ.
- Barra superior tem só Mapa, Camadas (se geometrias) e Edit. Botão Edit mostra ferramentas recolhíveis.
- Clique em + POP, cadastre localização, salve: o editor desse POP abre. Adicione 2 equipamentos e configure métricas distintas, depois salve o dashboard e reabra.
- Clique em + Enlace > Entre POPs: selecione dois POPs e crie o enlace. Em Desenhar: selecione origem/destino, clique em vários pontos vazios do mapa, use Desfazer e Salvar. Após salvar, confira o trajeto e a edição.
- Configure no painel métricas Zabbix para um enlace e confirme UP/ATENÇÃO/DOWN/SEM DADOS. Sem regras, a cor não deve ser verde.
- Teste clique na fibra GeoJSON, destaque, associação a enlace existente, navegação POP ↔ enlace, filtros e alertas laterais.
- Teste com resolução de uma TV do NOC e com vários POPs próximos.

## Limitações e rollback

- `hostName` de equipamento é **informativo**; a seleção das métricas ainda depende das queries configuradas no Grafana. Não há descoberta Zabbix automática nesta etapa.
- Para desenhar por enquanto é necessário definir POPs nas extremidades; cliques nos pontos de referência KMZ não são convertidos automaticamente em POPs.
- A visualização escura sem chave usa tiles OSM com filtro CSS. Para instalações comerciais, revise política do provedor de tiles e considere cache/servidor próprio de tiles se houver muitas TVs.
- A validação feita aqui é de sintaxe TS/TSX, sem build Grafana completo por ausência das dependências do WSL.

Rollback:

```bash
tar -xzf "$HOME/teif-antes-editor-20261029.tar.gz" -C .
npm run typecheck && npm run build
mkdir -p dist/maps
cp maps/teif-projeto-completo.geojson dist/maps/
```
