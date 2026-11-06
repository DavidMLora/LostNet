// src/scripts/map.js
import L from 'leaflet';
import { api, ENDPOINTS } from './api.js';
import { applyFilters, setCategoryFilter, setSearchTerm } from './map-filters.js';

const DEFAULT_COORDS = [21.914, -102.316]; // Aguascalientes / Campus
const DEFAULT_ZOOM = 15;

let mapInstance = null;
let reportsLayer = null;
let safePointsLayer = null;
let selectionMarker = null;

let rawReports = [];
let rawSafePoints = [];
let isPickingLocation = false;

function normalizeCoords(item) {
  const lat = item.latitude !== undefined ? item.latitude : item.lat;
  const lng = item.longitude !== undefined ? item.longitude : item.lon;
  if (lat === null || lat === undefined || lng === null || lng === undefined) return null;
  const numLat = Number(lat);
  const numLng = Number(lng);
  if (isNaN(numLat) || isNaN(numLng)) return null;
  return { lat: numLat, lng: numLng };
}

export function initMap() {
  const container = document.getElementById('map');
  if (!container || mapInstance) return;

  mapInstance = L.map('map').setView(DEFAULT_COORDS, DEFAULT_ZOOM);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(mapInstance);

  safePointsLayer = L.layerGroup().addTo(mapInstance);
  reportsLayer = L.layerGroup().addTo(mapInstance);

  // Escuchar clics en el mapa
  mapInstance.on('click', handleMapClick);

  // Escuchar eventos de integración entre módulos según contrato
  document.addEventListener('lostnet:map:pick-requested', enableLocationPicking);
  document.addEventListener('lostnet:reports:changed', async () => {
    await fetchReports();
    renderFilteredReports();
  });

  setupUIEventListeners();
  loadInitialData();
}

function handleMapClick(e) {
  if (!isPickingLocation) return;

  const { lat, lng } = e.latlng;
  const latitude = Number(lat.toFixed(6));
  const longitude = Number(lng.toFixed(6));

  if (selectionMarker) {
    selectionMarker.setLatLng([latitude, longitude]);
  } else {
    const pickIcon = L.divIcon({
      className: 'custom-pin-pick',
      iconSize: [18, 18],
      iconAnchor: [9, 9]
    });
    selectionMarker = L.marker([latitude, longitude], { icon: pickIcon }).addTo(mapInstance);
  }

  // Notificar al formulario del compañero B
  document.dispatchEvent(
    new CustomEvent('lostnet:map:location-selected', {
      detail: { latitude, longitude }
    })
  );

  // Desactivar modo selección tras la elección
  disableLocationPicking();
}

function enableLocationPicking() {
  isPickingLocation = true;
  const banner = document.getElementById('map-selection-banner');
  if (banner) banner.hidden = false;
  if (mapInstance) mapInstance.getContainer().style.cursor = 'crosshair';
}

function disableLocationPicking() {
  isPickingLocation = false;
  const banner = document.getElementById('map-selection-banner');
  if (banner) banner.hidden = true;
  if (mapInstance) mapInstance.getContainer().style.cursor = '';
}

async function loadInitialData() {
  await Promise.all([fetchReports(), fetchSafePoints()]);
  renderSafePoints();
  renderFilteredReports();
}

async function fetchReports() {
  try {
    const data = await api.get(ENDPOINTS.REPORTES);
    rawReports = Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('Error cargando reportes:', err);
    rawReports = [];
  }
}

async function fetchSafePoints() {
  try {
    const data = await api.get(ENDPOINTS.PUNTOS_SEGUROS);
    rawSafePoints = Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('Error cargando puntos seguros:', err);
    rawSafePoints = [];
  }
}

function renderSafePoints() {
  if (!safePointsLayer) return;
  safePointsLayer.clearLayers();

  rawSafePoints.forEach((point) => {
    const coords = normalizeCoords(point);
    if (!coords) return;

    const icon = L.divIcon({
      className: 'custom-pin-safe',
      iconSize: [16, 16],
      iconAnchor: [8, 8]
    });

    const marker = L.marker([coords.lat, coords.lng], { icon });
    marker.bindPopup(`
      <div style="font-family: inherit;">
        <strong>🛡️ ${point.nombre || 'Punto Seguro'}</strong>
        ${point.horario ? `<p style="margin: 4px 0; font-size: 0.85em;">Horario: ${point.horario}</p>` : ''}
      </div>
    `);
    safePointsLayer.addLayer(marker);
  });
}

function renderFilteredReports() {
  if (!reportsLayer) return;
  reportsLayer.clearLayers();

  const filtered = applyFilters(rawReports);

  filtered.forEach((report) => {
    const coords = normalizeCoords(report);
    if (!coords) return;

    // Rojo para LOST, Azul para FOUND
    const isLost = (report.status || '').toUpperCase() === 'LOST';
    const className = isLost ? 'custom-pin-lost' : 'custom-pin-found';

    const icon = L.divIcon({
      className,
      iconSize: [14, 14],
      iconAnchor: [7, 7]
    });

    const marker = L.marker([coords.lat, coords.lng], { icon });

    const photoUrl = report.foto ? api.resolveUrl(report.foto) : null;
    const photoHtml = photoUrl
      ? `<div style="margin-top: 6px;"><img src="${photoUrl}" alt="Foto del reporte" style="width: 100%; max-height: 120px; object-fit: cover; border-radius: 4px;" /></div>`
      : '';

    marker.bindPopup(`
      <div style="font-family: inherit; max-width: 200px;">
        <span style="font-size: 0.75rem; text-transform: uppercase; font-weight: bold; color: ${isLost ? '#ef4444' : '#3b82f6'};">
          ${isLost ? 'Objeto Perdido' : 'Objeto Encontrado'}
        </span>
        <h4 style="margin: 4px 0 2px 0;">${report.category || 'Sin categoría'}</h4>
        <p style="margin: 0; font-size: 0.85rem;">${report.description || ''}</p>
        ${photoHtml}
      </div>
    `);

    reportsLayer.addLayer(marker);
  });
}

function setupUIEventListeners() {
  // Buscador por descripción
  const searchInput = document.getElementById('map-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      setSearchTerm(e.target.value);
      renderFilteredReports();
    });
  }

  // Chips de categoría
  const chips = document.querySelectorAll('.chip-btn');
  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      chips.forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      const category = chip.getAttribute('data-category');
      setCategoryFilter(category);
      renderFilteredReports();
    });
  });
}