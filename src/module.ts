
import { PanelPlugin } from '@grafana/data';
import { SimpleOptions } from './types';
import { SimplePanel } from './components/SimplePanel';

export const plugin = new PanelPlugin<SimpleOptions>(
  SimplePanel
)
  .setPanelOptions((builder) => {
    return builder
      .addNumberInput({
        path: 'latitude',
        name: 'Latitude inicial',
        description: 'Latitude do centro do mapa',
        category: ['Mapa'],
        defaultValue: -24.18,
        settings: {
          min: -90,
          max: 90,
        },
      })
      .addNumberInput({
        path: 'longitude',
        name: 'Longitude inicial',
        description: 'Longitude do centro do mapa',
        category: ['Mapa'],
        defaultValue: -46.79,
        settings: {
          min: -180,
          max: 180,
        },
      })
      .addTextInput({
        path: 'externalGeojsonUrl',
        name: 'GeoJSON externo (v1.2)',
        description: 'URL HTTP(S) do GeoJSON geográfico. Preferir /public/plugins/<id>/maps/arquivo.geojson. Não salva geometrias no dashboard.',
        category: ['Mapa'],
        defaultValue: '',
      })
      .addNumberInput({
        path: 'zoom',
        name: 'Zoom inicial',
        description: 'Nível de aproximação inicial',
        category: ['Mapa'],
        defaultValue: 10,
        settings: {
          min: 1,
          max: 19,
          integer: true,
        },
      });
  })
  .setNoPadding();
