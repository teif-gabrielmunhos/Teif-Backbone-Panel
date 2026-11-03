import { PanelPlugin } from '@grafana/data';
import { SimpleOptions } from './types';
import { SimplePanel } from './components/SimplePanel';

/** Preferências gerais e aparência pertencem ao Grafana.
 * As operações cartográficas (POPs, equipamentos, enlaces, KMZ) ficam no Edit do mapa.
 * Campos opcionais preservam dashboards previamente salvos.
 */
export const plugin = new PanelPlugin<SimpleOptions>(SimplePanel)
  .setPanelOptions((builder) => {
    return builder
      .addSelect({
        path: 'defaultBaseMap', name: 'Mapa padrão',
        description: 'Estilo do mapa aplicado ao abrir o painel.', category: ['Mapa'],
        defaultValue: 'escuro',
        settings: { options: [
          { value: 'escuro', label: 'Escuro' },
          { value: 'osm', label: 'OpenStreetMap claro' },
          { value: 'satelite', label: 'Satélite' },
          { value: 'nenhum', label: 'Sem fundo (somente topologia)' },
        ] },
      })
      .addNumberInput({ path: 'latitude', name: 'Latitude inicial',
        description: 'Centro do mapa (ou use Edit > Outras ações > Salvar visão).',
        category: ['Mapa'], defaultValue: -24.18, settings: { min: -90, max: 90 } })
      .addNumberInput({ path: 'longitude', name: 'Longitude inicial',
        description: 'Longitude do centro do mapa.',
        category: ['Mapa'], defaultValue: -46.79, settings: { min: -180, max: 180 } })
      .addNumberInput({ path: 'zoom', name: 'Zoom inicial',
        category: ['Mapa'], defaultValue: 10, settings: { min: 1, max: 19, integer: true } })
      .addTextInput({ path: 'cartoBasemapApiKey', name: 'Chave CARTO (opcional)',
        description: 'Para Dark Matter. Sem chave, usa OSM escurecido. Chave visível no dashboard: restringir por domínio.',
        category: ['Mapa'], defaultValue: '' })
      .addBooleanSwitch({ path: 'showPopLabels', name: 'Mostrar nomes dos POPs',
        description: 'Quando desativado, os nomes aparecem apenas ao passar o mouse.',
        category: ['Aparência e NOC'], defaultValue: true })
      .addBooleanSwitch({ path: 'showOperationsSidebar', name: 'Barra de alarmes e pesquisa',
        description: 'Exibe os atalhos operacionais à direita do mapa.',
        category: ['Aparência e NOC'], defaultValue: true })
      .addNumberInput({ path: 'linkWidthScale', name: 'Escala da espessura dos enlaces',
        description: '1 = original; 1.5 = 50% mais espesso. Preserva as espessuras individuais.',
        category: ['Aparência e NOC'], defaultValue: 1, settings: { min: 0.5, max: 2 } })
      .addBooleanSwitch({ path: 'pulseDownLinks', name: 'Piscar enlaces em DOWN',
        description: 'Mantém a linha vermelha visível e o X fixo durante a pulsação.',
        category: ['Monitoramento'], defaultValue: true })
      .addTextInput({ path: 'externalGeojsonUrl', name: 'URL do GeoJSON externo',
        description: 'Referência HTTP(S) ou /public/plugins/<id>/maps/arquivo.geojson. Não grava geometria no painel.',
        category: ['Camadas e GeoJSON'], defaultValue: '' })
      .addBooleanSwitch({ path: 'showKmzPreview', name: 'Mostrar referências KMZ',
        description: 'Exibe rotas e pontos importados que não são enlaces monitorados.',
        category: ['Camadas e GeoJSON'], defaultValue: false })
      .addNumberInput({ path: 'referenceOpacity', name: 'Opacidade das rotas KMZ',
        description: 'Apenas rotas de referência, não os enlaces monitorados.',
        category: ['Camadas e GeoJSON'], defaultValue: 0.6, settings: { min: 0.1, max: 1 } })
      .addNumberInput({ path: 'maxGeojsonFeatures', name: 'Limite de geometrias por tela',
        description: 'Ajuste de desempenho. Não descarta elementos do arquivo GeoJSON.',
        category: ['Avançado'], defaultValue: 650, settings: { min: 50, max: 650, integer: true } });
  })
  .setNoPadding();
