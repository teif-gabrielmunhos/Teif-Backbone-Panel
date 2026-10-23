# TEIF Backbone Map — v0.6 experimental: campos dinâmicos

Este pacote contém **somente os arquivos que precisam ser adicionados ou substituídos** no código-fonte da v0.5 (commit `b33d447`). Não substitui a pasta inteira do plugin.

## Arquivos

- `src/types.ts`: adiciona `MonitorField` a POPs e enlaces, preservando propriedades anteriores.
- `src/monitoring.ts`: identifica as queries e os campos dos Data Frames do Grafana; recupera o último valor válido.
- `src/components/MonitorFieldsEditor.tsx`: editor reutilizável, seleção de query + item, ordem, exclusão e leitura.
- `src/components/SimplePanel.tsx`: adiciona clique nos enlaces e editor/visualização de campos, preservando Leaflet e funções da v0.5.

## Antes de aplicar

Seu backup `~/projetos/teif/backups/v0.5` e sua tag `backup-v0.5` devem estar intactos.

Recomendado: dentro do repositório original, crie uma branch de desenvolvimento:

```bash
cd ~/projetos/teif/teif-backbonemap-panel
git switch -c feature/campos-dinamicos-v06
```

## Instalação

Copie o arquivo ZIP para a raiz do repositório do plugin (`~/projetos/teif/teif-backbonemap-panel`) e execute:

```bash
unzip -o TEIF-Backbone-Map-v0.6-campos.zip
npm run build
sudo docker compose restart grafana
```

A extração deve criar/atualizar exatamente os quatro arquivos acima, preservando o restante do projeto. Se `unzip` não estiver disponível, execute `sudo apt install unzip`.

Se a compilação concluir sem erros, atualize o navegador com Ctrl+Shift+R.

## Teste no Grafana

1. Entre no modo de edição do dashboard/painel para que alterações possam ser salvas.
2. Na aba **Queries** do painel, crie queries reais do Zabbix ou outra fonte de dados. Aguarde resultados.
3. Ative **Editar POPs** no mapa e clique em um POP existente ou em uma linha de enlace.
4. Clique em **+ Adicionar campo**. Dê um nome, selecione Query A/B/C e depois a **série/campo específico retornado**.
5. Selecione a unidade. O editor mostrará uma prévia do último valor não nulo disponível.
6. Clique em **Concluir edição**, clique novamente no POP/enlace para ver somente os valores e **salve o dashboard** pela interface do Grafana.
7. Recarregue a página e confirme que os campos permanecem cadastrados.

## Comportamento

- Permite múltiplos campos por POP ou enlace, sem impor nomes fixos (Download, Upload, Status, Erros, etc.).
- Múltiplos itens da mesma query são selecionáveis individualmente.
- As configurações ficam em `options.pops[].monitoringFields` ou `options.links[].monitoringFields` e são serializáveis no JSON do dashboard.
- Um item ausente exibe `Item não encontrado`; dados vazios exibem `Sem dados`. O zero é um valor válido.
- O cálculo é **último valor não nulo/não vazio**. Não há derivação dos contadores SNMP nesta versão; prepare suas queries conforme a unidade desejada.
- A unidade `bps` trata o valor como **bits por segundo já calculados**; não multiplica por oito.
- A identidade do item usa `refId`, nome da série, nome do campo e labels. Duas séries perfeitamente idênticas recebem um índice de desempate; alterações radicais no formato das queries podem exigir reassociação.
- A criação de queries não ocorre dentro do modal; elas continuam configuradas na aba **Queries** do Grafana.
- A v0.6 ainda não inclui thresholds, cores dinâmicas, animação de alarme, agregações personalizadas ou rotas KMZ.

## Se algo der errado

Os arquivos alterados pela atualização podem ser recuperados pelo Git, sem mexer no dashboard do Grafana, por exemplo:

```bash
git restore --source=backup-v0.5 -- src/types.ts src/components/SimplePanel.tsx
rm -f src/monitoring.ts src/components/MonitorFieldsEditor.tsx
npm run build
sudo docker compose restart grafana
```

Esses comandos restauram **somente o código**. Não revertem campos que você já tenha salvo dentro de uma dashboard de teste.

## Validação anterior à entrega

Arquivos TypeScript/TSX analisados com o parser TypeScript. Lógica de associação de séries, zero, unidades e ausência de dados testada isoladamente com dados simulados. A compilação com `npm run build` e o teste em uma instância Grafana real deverão ser feitos no seu ambiente, porque não dispomos das dependências do seu repositório aqui.
