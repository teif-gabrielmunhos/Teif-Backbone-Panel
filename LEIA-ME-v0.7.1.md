# TEIF Backbone Map — v0.7.1: editor responsivo

Esta atualização **somente ajusta o layout**, preservando o comportamento de POPs, enlaces, consultas e a animação vermelha + X da v0.7.

## O que mudou
- Painel de edição de POP/enlace com até 390 px de largura e limitado à área disponível do mapa.
- Área interna com rolagem vertical quando os campos ultrapassarem a altura do Grafana.
- Altura mínima de 36 px nos `input` de texto e `select`, impedindo que os seletores fiquem achatados.
- Barra de ferramentas permanece no topo e botão **Fechar** pode ser alcançado mesmo com muitos campos.
- Contador fica visível; animação do cabo não foi alterada.

## Instalação
1. Salve o dashboard e faça backup do `src/components/SimplePanel.tsx` atual.
2. Copie o ZIP para a pasta do plugin no WSL e extraia na raiz do repositório.
3. Execute:

```bash
unzip -o TEIF-Backbone-Map-v0.7.1-layout-editor.zip
npx tsc --noEmit
npm run build
sudo docker compose restart grafana
```

4. Recarregue o Grafana com Ctrl + Shift + R.

## O que contém
- `src/components/SimplePanel.tsx` (versão v0.7 atual com correções de layout)
- `src/components/editorLayout.css` (novo)

Não substitui `MonitorFieldsEditor.tsx`, `monitoring.ts`, `types.ts` ou dados salvos do dashboard. Teste com múltiplos campos e janela do browser baixa.

## Testes
A edição foi verificada por comparação estrutural com a v0.7 e a sintaxe deve ser conferida pelo TypeScript e Webpack no seu ambiente com as dependências instaladas.
