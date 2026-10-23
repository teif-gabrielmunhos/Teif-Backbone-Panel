
import React, { useEffect, useRef, useState } from 'react';
import type { PanelProps } from '@grafana/data';
import { Button } from '@grafana/ui';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import type {
  BackbonePop,
  BackboneLink,
  SimpleOptions,
} from '../types';

type Props = PanelProps<SimpleOptions>;

// ========================================
// CONFIGURAÇÕES INICIAIS
// ========================================

const DEFAULT_VIEW = {
  latitude: -24.18,
  longitude: -46.79,
  zoom: 10,
};

// ========================================
// APARÊNCIA DOS POPs
// ========================================

const popIcon = L.divIcon({
  className: 'teif-pop-marker',
  html: `
    <div style="
      width:16px;
      height:16px;
      background:#00ffff;
      border:2px solid #073344;
      border-radius:50%;
      box-shadow:0 0 10px #00ffff;
    "></div>
  `,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

// ========================================
// APARÊNCIA DAS JANELAS
// ========================================

const cardStyle: React.CSSProperties = {
  background: 'rgba(18, 26, 40, 0.97)',
  color: '#ffffff',
  padding: 12,
  borderRadius: 6,
  border: '1px solid #405065',
  width: 260,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  pointerEvents: 'auto',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: 8,
  color: '#ffffff',
  background: '#111827',
  border: '1px solid #526174',
  borderRadius: 4,
};

// ========================================
// COMPONENTE PRINCIPAL
// ========================================

export const SimplePanel: React.FC<Props> = ({
  width,
  height,
  options,
  onOptionsChange,
}) => {
  // ======================================
  // REFERÊNCIAS DO LEAFLET
  // ======================================

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  const markersRef = useRef<L.LayerGroup | null>(null);
  const linksRef = useRef<L.LayerGroup | null>(null);

  // Mantém as opções atualizadas nos eventos
  const optionsRef = useRef(options);
  const changeRef = useRef(onOptionsChange);

  useEffect(() => {
    optionsRef.current = options;
    changeRef.current = onOptionsChange;
  }, [options, onOptionsChange]);

  // ======================================
  // CONFIGURAÇÕES GEOGRÁFICAS
  // ======================================

  const latitude =
    options.latitude ?? DEFAULT_VIEW.latitude;

  const longitude =
    options.longitude ?? DEFAULT_VIEW.longitude;

  const zoom =
    options.zoom ?? DEFAULT_VIEW.zoom;

  const initialView = useRef({
    latitude,
    longitude,
    zoom,
  });

  const pops = options.pops ?? [];
  const links = options.links ?? [];

  // ======================================
  // ESTADOS DO EDITOR
  // ======================================

  const [editMode, setEditMode] = useState(false);

  // POPs
  const [adding, setAdding] = useState(false);

  const [pendingPosition, setPendingPosition] =
    useState<L.LatLng | null>(null);

  const [newName, setNewName] = useState('');

  const [selectedId, setSelectedId] =
    useState<string | null>(null);

  const [editName, setEditName] = useState('');
  const [confirmDelete, setConfirmDelete] =
    useState(false);

  // Enlaces
  const [creatingLink, setCreatingLink] =
    useState(false);

  const [linkOriginId, setLinkOriginId] =
    useState<string | null>(null);

  const selectedPop = pops.find(
    (pop) => pop.id === selectedId
  );

  const originPop = pops.find(
    (pop) => pop.id === linkOriginId
  );

  // ======================================
  // 1. INICIALIZAÇÃO DO MAPA
  // ======================================

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const initial = initialView.current;

    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: true,
    }).setView(
      [initial.latitude, initial.longitude],
      initial.zoom
    );

    // OpenStreetMap
    L.tileLayer(
      'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }
    ).addTo(map);

    // Camada dos enlaces
    const linkGroup = L.layerGroup().addTo(map);

    // Camada dos POPs
    const markerGroup = L.layerGroup().addTo(map);

    // Guardar referências
    mapRef.current = map;
    linksRef.current = linkGroup;
    markersRef.current = markerGroup;

    const frame = requestAnimationFrame(() => {
      map.invalidateSize();
    });

    // Limpeza
    return () => {
      cancelAnimationFrame(frame);

      map.remove();

      mapRef.current = null;
      markersRef.current = null;
      linksRef.current = null;
    };
  }, []);

  // ======================================
  // 2. ATUALIZAR POSIÇÃO DO MAPA
  // ======================================

  useEffect(() => {
    const map = mapRef.current;

    if (!map) {
      return;
    }

    const target = L.latLng(latitude, longitude);

    if (
      !map.getCenter().equals(target, 0.000001) ||
      map.getZoom() !== zoom
    ) {
      map.setView(target, zoom);
    }
  }, [latitude, longitude, zoom]);

  // ======================================
  // 3. REDIMENSIONAMENTO
  // ======================================

  useEffect(() => {
    mapRef.current?.invalidateSize({
      pan: false,
    });
  }, [width, height]);

  // ======================================
  // 4. DESENHAR ENLACES
  // ======================================

  useEffect(() => {
    const group = linksRef.current;

    if (!group) {
      return;
    }

    group.clearLayers();

    const currentPops = options.pops ?? [];
    const currentLinks = options.links ?? [];

    for (const link of currentLinks) {
      const origin = currentPops.find(
        (pop) => pop.id === link.sourcePopId
      );

      const destination = currentPops.find(
        (pop) => pop.id === link.targetPopId
      );

      if (!origin || !destination) {
        continue;
      }

      const line = L.polyline(
        [
          [origin.latitude, origin.longitude],
          [destination.latitude, destination.longitude],
        ],
        {
          color: link.color || '#00FF66',
          weight: link.width || 4,
          opacity: 0.9,
        }
      ).addTo(group);

      // Nome do enlace
      const label = document.createElement('span');
      label.textContent = link.name;

      line.bindTooltip(label, {
        sticky: true,
      });
    }
  }, [options.pops, options.links]);

  // ======================================
  // 5. DESENHAR POPs
  // ======================================

  useEffect(() => {
    const group = markersRef.current;

    if (!group) {
      return;
    }

    group.clearLayers();

    for (const pop of options.pops ?? []) {
      const marker = L.marker(
        [pop.latitude, pop.longitude],
        {
          icon: popIcon,
          draggable: editMode && !creatingLink,
          bubblingMouseEvents: false,
        }
      ).addTo(group);

      // Nome do POP
      const label = document.createElement('span');
      label.textContent = pop.name;

      marker.bindTooltip(label, {
        permanent: true,
        direction: 'top',
        offset: [0, -12],
      });

      // ==================================
      // CLIQUE NO POP
      // ==================================

      marker.on('click', () => {
        // Criação de enlace
        if (creatingLink) {
          // Primeiro POP
          if (!linkOriginId) {
            setLinkOriginId(pop.id);
            return;
          }

          // Impedir ligação consigo mesmo
          if (linkOriginId === pop.id) {
            return;
          }

          const current = optionsRef.current;

          const origin = (current.pops ?? []).find(
            (item) => item.id === linkOriginId
          );

          if (!origin) {
            setLinkOriginId(null);
            return;
          }

          // Criar novo enlace
          const newLink: BackboneLink = {
            id: `link-${Date.now()}-${Math.random()
              .toString(36)
              .slice(2, 8)}`,
            name: `${origin.name} - ${pop.name}`,
            sourcePopId: origin.id,
            targetPopId: pop.id,
            color: '#00FF66',
            width: 4,
          };

          changeRef.current({
            ...current,
            links: [
              ...(current.links ?? []),
              newLink,
            ],
          });

          setCreatingLink(false);
          setLinkOriginId(null);

          return;
        }

        // Edição de POP
        if (editMode) {
          setSelectedId(pop.id);
          setEditName(pop.name);
          setConfirmDelete(false);
        }
      });

      // ==================================
      // MOVIMENTAR POP
      // ==================================

      marker.on('dragend', () => {
        if (!editMode || creatingLink) {
          return;
        }

        const point = marker.getLatLng();
        const current = optionsRef.current;

        const updated = (current.pops ?? []).map(
          (item) =>
            item.id === pop.id
              ? {
                  ...item,
                  latitude: Number(
                    point.lat.toFixed(6)
                  ),
                  longitude: Number(
                    point.lng.toFixed(6)
                  ),
                }
              : item
        );

        changeRef.current({
          ...current,
          pops: updated,
        });
      });
    }
  }, [
    options.pops,
    editMode,
    creatingLink,
    linkOriginId,
  ]);

  // ======================================
  // 6. CLIQUE PARA ADICIONAR POP
  // ======================================

  useEffect(() => {
    const map = mapRef.current;

    if (!map || !adding) {
      return;
    }

    const container = map.getContainer();

    container.style.cursor = 'crosshair';

    const handleClick = (
      event: L.LeafletMouseEvent
    ) => {
      setPendingPosition(event.latlng);
      setNewName('');
      setSelectedId(null);
      setAdding(false);
    };

    map.on('click', handleClick);

    return () => {
      map.off('click', handleClick);
      container.style.cursor = '';
    };
  }, [adding]);

  // ======================================
  // 7. SALVAR POSIÇÃO ATUAL
  // ======================================

  const salvarPosicaoAtual = () => {
    const map = mapRef.current;

    if (!map) {
      return;
    }

    const center = map.getCenter();
    const current = optionsRef.current;

    changeRef.current({
      ...current,
      latitude: Number(center.lat.toFixed(6)),
      longitude: Number(center.lng.toFixed(6)),
      zoom: map.getZoom(),
    });
  };

  // ======================================
  // 8. ADICIONAR POP
  // ======================================

  const adicionarPop = () => {
    const name = newName.trim();

    if (!pendingPosition || !name) {
      return;
    }

    const current = optionsRef.current;

    const novoPop: BackbonePop = {
      id: `pop-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`,
      name,
      latitude: Number(
        pendingPosition.lat.toFixed(6)
      ),
      longitude: Number(
        pendingPosition.lng.toFixed(6)
      ),
    };

    changeRef.current({
      ...current,
      pops: [
        ...(current.pops ?? []),
        novoPop,
      ],
    });

    setPendingPosition(null);
    setNewName('');
  };

  // ======================================
  // 9. RENOMEAR POP
  // ======================================

  const renomearPop = () => {
    const name = editName.trim();

    if (!selectedId || !name) {
      return;
    }

    const current = optionsRef.current;

    changeRef.current({
      ...current,
      pops: (current.pops ?? []).map((pop) =>
        pop.id === selectedId
          ? { ...pop, name }
          : pop
      ),
    });
  };

  // ======================================
  // 10. EXCLUIR POP
  // ======================================

  const excluirPop = () => {
    if (!selectedId) {
      return;
    }

    const current = optionsRef.current;

    // Remove o POP e os enlaces conectados
    changeRef.current({
      ...current,

      pops: (current.pops ?? []).filter(
        (pop) => pop.id !== selectedId
      ),

      links: (current.links ?? []).filter(
        (link) =>
          link.sourcePopId !== selectedId &&
          link.targetPopId !== selectedId
      ),
    });

    setSelectedId(null);
    setConfirmDelete(false);
  };

  // ======================================
  // 11. ALTERNAR EDIÇÃO
  // ======================================

  const alternarEdicao = () => {
    if (editMode) {
      setAdding(false);
      setPendingPosition(null);
      setSelectedId(null);
      setConfirmDelete(false);
      setCreatingLink(false);
      setLinkOriginId(null);
    }

    setEditMode(!editMode);
  };

  // ======================================
  // 12. INICIAR OU CANCELAR ENLACE
  // ======================================

  const alternarCriacaoEnlace = () => {
    if (creatingLink) {
      setCreatingLink(false);
      setLinkOriginId(null);
      return;
    }

    setCreatingLink(true);
    setLinkOriginId(null);

    // Cancelar outros modos
    setAdding(false);
    setPendingPosition(null);
    setSelectedId(null);
  };

  // ======================================
  // INTERFACE DO PLUGIN
  // ======================================

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        isolation: 'isolate',
      }}
    >
      {/* MAPA LEAFLET */}
      <div
        ref={containerRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          zIndex: 0,
        }}
      />

      {/* BARRA DE FERRAMENTAS */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          zIndex: 2000,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 8,
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: 6,
            pointerEvents: 'auto',
            flexWrap: 'wrap',
            justifyContent: 'flex-end',
            background: 'rgba(15, 23, 42, 0.96)',
            padding: 8,
            borderRadius: 8,
            border:
              '1px solid rgba(0, 255, 255, 0.65)',
            boxShadow:
              '0 4px 16px rgba(0, 0, 0, 0.5)',
          }}
        >
          <Button
            size="sm"
            variant="secondary"
            onClick={salvarPosicaoAtual}
          >
            Usar posição atual
          </Button>

          <Button
            size="sm"
            variant={editMode ? 'primary' : 'secondary'}
            onClick={alternarEdicao}
          >
            {editMode
              ? 'Concluir edição'
              : 'Editar POPs'}
          </Button>

          {editMode && (
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                setAdding(true);
                setCreatingLink(false);
                setLinkOriginId(null);
                setPendingPosition(null);
                setSelectedId(null);
              }}
            >
              Adicionar POP
            </Button>
          )}

          {editMode && (
            <Button
              size="sm"
              variant={
                creatingLink ? 'primary' : 'secondary'
              }
              onClick={alternarCriacaoEnlace}
              disabled={pops.length < 2 && !creatingLink}
            >
              {creatingLink
                ? 'Cancelar enlace'
                : 'Criar enlace'}
            </Button>
          )}
        </div>

        {/* INSTRUÇÕES DE CRIAÇÃO DE ENLACE */}
        {creatingLink && (
          <div style={cardStyle}>
            <strong>Criar enlace</strong>

            {!linkOriginId ? (
              <span>
                Clique no POP de origem.
              </span>
            ) : (
              <>
                <span>
                  Origem: <strong>{originPop?.name}</strong>
                </span>

                <span>
                  Agora clique no POP de destino.
                </span>
              </>
            )}

            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setCreatingLink(false);
                setLinkOriginId(null);
              }}
            >
              Cancelar
            </Button>
          </div>
        )}

        {/* INSTRUÇÃO PARA ADICIONAR POP */}
        {adding && (
          <div style={cardStyle}>
            <strong>Adicionar POP</strong>

            <span>
              Clique no local desejado no mapa.
            </span>

            <Button
              size="sm"
              variant="secondary"
              onClick={() => setAdding(false)}
            >
              Cancelar
            </Button>
          </div>
        )}

        {/* CADASTRO DE POP */}
        {pendingPosition && editMode && (
          <div style={cardStyle}>
            <strong>Novo POP</strong>

            <input
              style={inputStyle}
              placeholder="Nome do POP"
              maxLength={80}
              value={newName}
              onChange={(event) =>
                setNewName(event.target.value)
              }
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  adicionarPop();
                }
              }}
            />

            <small>
              Lat: {pendingPosition.lat.toFixed(6)}
              {' | '}
              Lon: {pendingPosition.lng.toFixed(6)}
            </small>

            <Button
              size="sm"
              variant="primary"
              disabled={!newName.trim()}
              onClick={adicionarPop}
            >
              Salvar POP
            </Button>

            <Button
              size="sm"
              variant="secondary"
              onClick={() => setPendingPosition(null)}
            >
              Cancelar
            </Button>
          </div>
        )}

        {/* EDIÇÃO DE POP */}
        {selectedPop && editMode && (
          <div style={cardStyle}>
            <strong>Editar POP</strong>

            <input
              style={inputStyle}
              value={editName}
              maxLength={80}
              onChange={(event) =>
                setEditName(event.target.value)
              }
            />

            <small>
              Lat: {selectedPop.latitude.toFixed(6)}
              {' | '}
              Lon: {selectedPop.longitude.toFixed(6)}
            </small>

            <small>
              Arraste o marcador para movê-lo.
            </small>

            <Button
              size="sm"
              variant="primary"
              disabled={!editName.trim()}
              onClick={renomearPop}
            >
              Salvar nome
            </Button>

            {!confirmDelete ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setConfirmDelete(true)}
              >
                Excluir POP
              </Button>
            ) : (
              <>
                <small>
                  Os enlaces conectados também serão excluídos.
                </small>

                <Button
                  size="sm"
                  variant="primary"
                  onClick={excluirPop}
                >
                  Confirmar exclusão
                </Button>
              </>
            )}

            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setSelectedId(null);
                setConfirmDelete(false);
              }}
            >
              Fechar
            </Button>
          </div>
        )}

        {/* CONTADORES */}
        {editMode && (
          <div
            style={{
              ...cardStyle,
              width: 'auto',
              padding: '6px 10px',
            }}
          >
            <small>
              POPs: {pops.length}
              {' | '}
              Enlaces: {links.length}
            </small>
          </div>
        )}
      </div>
    </div>
  );
};

