# Teif Backbone Panel v0.8.1 — Motivos dos alertas

Atualização incremental baseada no pacote **v0.8 Thresholds Independentes**. Não altera a configuração de queries, os campos, os thresholds, os POPs, o `plugin.json`, o nome/ID do plugin ou o Compose.

## O que muda

- Clicando em um enlace **amarelo** (fora do modo de edição), o popup mostra **Motivo(s) da atenção** e lista todos os campos cujo threshold foi ultrapassado.
- Cada motivo mostra **nome do campo**, **valor atual**, **operador** e **limite**, por exemplo: `Download 100GE 0/0/1 — Atual: 33,63 Gbps > Limite: 30 Gbps`.
- Clicando em um enlace **DOWN**, o popup mostra **Motivo do DOWN**. Se também houver thresholds amarelos disparados, são exibidos separadamente como **Outros alertas de atenção**.
- O tooltip do enlace também informa os nomes dos campos responsáveis pela cor.
- Os mesmos motivos ficam visíveis no editor do enlace.
- **A hierarquia permanece inalterada:** DOWN vermelho pulsante com X > ATENÇÃO amarela > SEM DADOS cinza > cor normal do enlace.
- O valor de comparação segue sendo o valor **bruto** da query; a formatação de `bps`, `%` etc. ocorre **somente na visualização**.
- Falta de coleta não é interpretada como zero, mas a versão ainda usa o **último valor válido** retornado na janela da query, sem TTL independente para dados antigos.

## Arquivos que o pacote substitui

- `src/monitoring.ts`
- `src/components/SimplePanel.tsx`

Nenhuma alteração de `src/types.ts`, `src/plugin.json`, `src/module.ts`, `src/components/MonitorFieldsEditor.tsx` ou das configurações Docker é necessária.

## Aplicar no computador de desenvolvimento

1. Salve uma cópia da dashboard de teste no Grafana.
2. Entre na pasta do projeto WSL e faça um backup dos dois arquivos:

```bash
cd ~/projetos/teif/teif-backbonemap-panel
mkdir -p ~/projetos/teif/backups/v0.8
cp src/monitoring.ts ~/projetos/teif/backups/v0.8/
cp src/components/SimplePanel.tsx ~/projetos/teif/backups/v0.8/
```

3. Copie o ZIP para a raiz do projeto e extraia:

```bash
unzip -o Teif-Backbone-Panel-v0.8.1-motivos-alertas.zip
npx tsc --noEmit
npm run build
```

4. No Grafana Docker de **teste**, recarregue o plugin compilado:

```bash
sudo docker compose restart grafana
```

Atualize a página com `Ctrl+Shift+R`.

> Este pacote assume a mesma base de código da v0.8 fornecida anteriormente. Se você modificou o `SimplePanel.tsx` ou o `monitoring.ts` depois da v0.8, compare as alterações antes de substituir os arquivos.

## Implantação no Grafana operacional

Depois de validar no laboratório, gere o pacote compilado e transfira-o. Exemplo no WSL:

```bash
cd ~/projetos/teif/teif-backbonemap-panel
tar -czf /tmp/teif-backbonemap-panel-v0.8.1.tar.gz -C dist .
scp /tmp/teif-backbonemap-panel-v0.8.1.tar.gz teif@IP_DO_GRAFANA:/tmp/
```

No Grafana Linux, primeiro faça backup da pasta atual e depois extraia o pacote. Confirme permissões, versão e configuração de plugins não assinados. **Planeje o reinício do serviço**, pois ele afeta usuários do Grafana operacional.

## Testes sugeridos

1. Configure Download=33,63 Gbps, threshold `gt 30000000000`. Clique no enlace amarelo: deverá mostrar `Download ... Atual: 33,63 Gbps > Limite: 30 Gbps`.
2. Configure também Erros=150 com threshold `gt 100`: ambos deverão aparecer.
3. Dispare DOWN por Status=2: cabo permanece vermelho pulsante com X, popup mostra motivo DOWN **e** lista os outros alertas amarelos.
4. Normalize o DOWN: enlace volta ao amarelo se o threshold ainda estiver acionado.
5. Normalize os thresholds: enlace volta à cor normal.

## Validação realizada aqui

Os dois arquivos passaram por verificação sintática TypeScript/TSX. A lógica de monitoramento passou por testes com condições de atenção (uma ou duas), DOWN simultâneo, estado normal, ausência de dados e DOWN textual. **O build completo com as dependências Grafana e a apresentação no navegador ainda precisam ser confirmados no seu WSL.**
