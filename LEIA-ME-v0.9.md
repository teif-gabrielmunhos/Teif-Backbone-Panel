# Teif Backbone Panel — v0.9 (Estado Inteligente de POPs)

Atualização incremental **sobre a versão v0.8.1 — Motivos dos Alertas**. Mantém o mesmo ID interno do plugin, os dashboards e o comportamento dos enlaces.

## O que muda

- POPs agora aceitam thresholds individuais por campo, aproveitando o editor já usado nos enlaces.
- POP possui sua própria regra **Estado DOWN** vinculada a um campo (ex.: ICMP = 0, `ifOperStatus` = 2).
- **Hierarquia**: DOWN (vermelho pulsante, X branco) > ATENÇÃO (amarelo) > NORMAL (ciano).
- **Sem dados**: cinza tracejado se não for possível avaliar alguma regra configurada e nenhuma condição de alerta tiver sido confirmada.
- Clique no POP no modo monitoramento para consultar valores, estado e motivos (valor atual, operador e limite). No modo edição, clique para configurar campos e regras.
- Falha de POP **não** muda automaticamente os enlaces, que mantêm seus próprios critérios.
- Regra DOWN órfã é removida se o campo ao qual estava associada for excluído.
- Compatibilidade: corrige a declaração de tipo `LinkHealthState` que estava ausente no arquivo `monitoring.ts` do pacote v0.8.1.

## Arquivos deste pacote

```
src/types.ts
src/monitoring.ts
src/components/SimplePanel.tsx
src/components/MonitorFieldsEditor.tsx
src/components/popStatus.css   # novo arquivo
```

Todos os outros arquivos devem continuar exatamente como estão. **Não use este ZIP sozinho**; o projeto precisa continuar contendo `src/components/linkStatus.css` e `src/components/editorLayout.css` das versões anteriores.

## 1. Backup e instalação — WSL (ambiente de desenvolvimento)

Primeiro **salve a dashboard no Grafana**. Depois, no WSL:

```bash
cd ~/projetos/teif/teif-backbonemap-panel
mkdir -p ~/projetos/teif/backups

tar -czf ~/projetos/teif/backups/pre-v09-src.tar.gz src
```

Copie `Teif-Backbone-Panel-v0.9-monitoramento-pops.zip` da pasta de Downloads do Windows para a **raiz do projeto**. Antes de extrair, confira seu conteúdo:

```bash
unzip -l Teif-Backbone-Panel-v0.9-monitoramento-pops.zip
```

Extraia:

```bash
unzip -o Teif-Backbone-Panel-v0.9-monitoramento-pops.zip
npx tsc --noEmit
npm run build
```

**Só se ambos terminarem com sucesso**, atualize o Grafana de laboratório:

```bash
sudo docker compose restart grafana
```

Em seguida, atualize a página com `Ctrl + Shift + R`.

## 2. Teste no Grafana (pode usar TestData/Random Walk)

1. Abra a dashboard no modo de edição do painel e crie queries com os itens que deseja testar.
2. Ative **Editar POPs** e clique em um POP existente.
3. Adicione o campo `CPU`, selecione sua query e o item específico e habilite **Threshold de atenção (indicador amarelo)**, com `>` e `85` (apenas se a query entregar o percentual diretamente).
4. Adicione o campo `Ping` (exemplo: item `icmpping`, retornando 1 = UP e 0 = DOWN).
5. Na seção **Estado DOWN do POP**, selecione `Ping`, operador `=` e limite `0`.
6. Para teste com Random Walk, configure limites coerentes com a faixa retornada; não espere a mesma semântica de um item ICMP real.
7. No modo monitoramento, clique no POP para ver valores, estado e motivos.
8. Salve a dashboard e atualize a página para conferir persistência.

## Cenários esperados

| Situação | Visual do POP |
|---|---|
| Sem regras | Ciano original |
| Todas as regras normais | Ciano |
| CPU ultrapassa 85% | Amarelo |
| Ping=0, mesmo com CPU alta | Vermelho pulsante com X branco |
| Dado necessário ausente e nenhum alerta confirmado | Cinza tracejado |

**Importante:** avaliações usam os **valores brutos** das queries. Um threshold de 85 para CPU exige uma query cuja saída seja 85 (não 0,85). Ausência de dados não equivale a zero. Não força alertas nos enlaces vizinhos.

## Segurança de implantação

- **Não** reinicie o Grafana operacional durante a validação de laboratório.
- Após validar, implante o `dist/` compilado manualmente em janela apropriada, com backup e reinício coordenado, seguindo o procedimento que já utiliza.
- O ZIP distribui **código-fonte**, não um plugin compilado pronto para copiar ao servidor.
- O projeto não foi compilado contra as dependências completas do seu WSL neste ambiente de criação; foram feitos testes de sintaxe TypeScript/TSX e da lógica de estado. Execute `npx tsc --noEmit` e `npm run build` na sua instalação antes de publicar.
