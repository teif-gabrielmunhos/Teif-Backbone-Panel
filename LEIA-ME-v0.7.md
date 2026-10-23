# TEIF Backbone Map — v0.7 experimental: estado visual dos enlaces

## Objetivo
Cada enlace pode escolher **um de seus campos de monitoramento** para controlar a aparência. Com uma regra configurável, é possível disparar alerta quando a leitura for `0`, `2`, `DOWN`, `X`, maior/menor que limiar etc. A comparação usa **o dado bruto**, não o valor formatado em bps/%. O campo precisa estar associado a uma query e a um item retornado.

Estados:
- **Sem regra:** cor manual já cadastrada na v0.6.
- **Regra não atendida:** cor manual já cadastrada.
- **Regra atendida:** alternância entre vermelho escuro `#a51c29` e vermelho claro `#ff202f` a cada 650 ms, sem apagar a linha, com contorno escuro estático e **X branco** sobre o centro da porção visível.
- **Sem dado válido / item desapareceu:** cinza tracejado, SEM pulso nem falso alarme.

O X é um sinal visual, **não é uma localização exata de rompimento**. Tráfego zerado pode ser apenas ociosidade e não garante falha física; prefira o item de status operacional quando possível.

## Arquivos do ZIP

- `src/types.ts` — adiciona `LinkAlertRule` opcional em `BackboneLink`.
- `src/monitoring.ts` — comparação tipada da leitura original; mantém zero diferente de ausência de dados.
- `src/components/SimplePanel.tsx` — configura regra e desenho dinâmico dos enlaces, X central reposicionado com pan/zoom.
- `src/components/linkStatus.css` — animação CSS com duas cores sólidas, sem o cabo sumir.

A v0.6 continua sendo a base. O ZIP não modifica `MonitorFieldsEditor.tsx`, `module.ts`, `docker-compose.yaml`, dados do dashboard, nem os arquivos externos KMZ.

## Instalação no WSL

Confirme que o plugin da v0.6 está funcionando e faça um backup ou commit antes. Coloque o ZIP na raiz do repositório e execute:

```bash
cd ~/projetos/teif/teif-backbonemap-panel
unzip -o TEIF-Backbone-Map-v0.7-estado-enlaces.zip
npx tsc --noEmit
npm run build
sudo docker compose restart grafana
```

Atualize o Grafana com **Ctrl+Shift+R** e entre no modo de edição do dashboard.

## Teste rápido com sua query Random Walk

1. Clique em **Editar POPs** e depois clique no cabo.
2. Em **Campos de monitoramento**, mantenha seu campo atual mapeado para a query e item.
3. Na nova seção **Estado visual do enlace**, selecione esse campo.
4. Escolha **Menor que** e um limiar muito maior que seu valor de teste, por exemplo `1000`. Se o Random Walk estiver abaixo de 1000, o cabo ficará vermelho pulsante e o X aparecerá.
5. Mude o valor para `-1000`: se a leitura estiver acima de -1000, o cabo deverá retornar à cor manual e o X sumirá.
6. No futuro use `Igual a 0` com `icmpping` do Zabbix (0 é falha) ou `Igual a 2` para `ifOperStatus` da IF-MIB (2 é down).
7. Salve o **dashboard** e recarregue a página para verificar persistência.

A regra e o campo controlador ficam registrados em `options.links[].alertRule` no JSON do painel.

## Observações

- Não há timers JavaScript por enlace; a animação utiliza CSS aplicado às linhas SVG do Leaflet.
- A atualização das cores depende dos Data Frames recebidos nas queries. `data.series` é processado em cada nova resposta do Grafana.
- O pulso tem **1,3 s por ciclo**: 650 ms vermelho fraco e 650 ms vermelho forte, opacidade 100% em ambos.
- O contorno escuro permanece estático.
- Se um campo selecionado como controlador for excluído pelo editor, a regra é removida.
- Um campo cujo dado não existe aparece cinza tracejado; não assume valor zero.
- Valores textuais são comparados sem diferenciar maiúsculas/minúsculas; `X` iguala `x`.
- O último valor disponível é escolhido da mesma maneira que a v0.6. Ainda não há expiração por idade da coleta; podemos implementar TTL na próxima etapa.

## Testes feitos antes da entrega

As alterações passaram na análise sintática TypeScript e em cenários isolados simulando resultados de queries (0, 1, `DOWN`, `X`, ausência de dados, comparadores numéricos e textuais). **Ainda é necessário rodar `npx tsc --noEmit` e `npm run build` no WSL, com as dependências reais do projeto.**
