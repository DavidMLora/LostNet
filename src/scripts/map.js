// src/scripts/map.js
import L from 'leaflet';
import { api, ENDPOINTS } from './api.js';
import { applyFilters, setCategoryFilter, setSearchTerm } from './map-filters.js';

const DEFAULT_COORDS = [21.914, -102.316]; // Campus UAA / Aguascalientes
const DEFAULT_ZOOM = 15;
const FOUND_REPORTS_STORAGE_KEY = 'lostnet.found_reports';

let mapInstance = null;
let reportsLayer = null;
let safePointsLayer = null;
let selectionMarker = null;

let rawReports = [];
let rawSafePoints = [];
let isPickingLocation = false;
const runtimeFoundEntries = [];

// Datos de respaldo para pruebas y demo si la API remota no responde
const MOCK_REPORTS = [
  {
    id: 'rep-1',
    category: 'Electrónica',
    description: 'Audífonos Bluetooth JBL negros en estuche',
    status: 'LOST',
    latitude: 21.9163,
    longitude: -102.3168,
    foto: null
  },
  {
    id: 'rep-2',
    category: 'Documentos',
    description: 'Credencial universitaria UAA vigente',
    status: 'FOUND',
    latitude: 21.9135,
    longitude: -102.3155,
    foto: null
  },
  {
    id: 'rep-3',
    category: 'Ropa',
    description: 'Sudadera deportiva color gris talla M',
    status: 'LOST',
    latitude: 21.9152,
    longitude: -102.3125,
    foto: null
  },
  {
    id: 'rep-4',
    category: 'Otros',
    description: 'Termo metálico color verde olivo',
    status: 'FOUND',
    latitude: 21.9128,
    longitude: -102.3190,
    foto: null
  }
];

const MOCK_SAFE_POINTS = [
  {
    id: 'safe-1',
    nombre: 'Caseta Principal de Vigilancia',
    horario: '24 horas',
    latitude: 21.9142,
    longitude: -102.3160
  },
  {
    id: 'safe-2',
    nombre: 'Recepción del Edificio Central',
    horario: '08:00 - 20:00',
    latitude: 21.9170,
    longitude: -102.3140
  }
];

function normalizeCoords(item) {
  const lat = item.latitude !== undefined ? item.latitude : item.lat;
  const lng = item.longitude !== undefined ? item.longitude : item.lon;
  if (lat === null || lat === undefined || lng === null || lng === undefined) return null;
  const numLat = Number(lat);
  const numLng = Number(lng);
  if (isNaN(numLat) || isNaN(numLng)) return null;
  return { lat: numLat, lng: numLng };
}

function getStoredFoundEntries() {
  try {
    const raw = globalThis.localStorage?.getItem(FOUND_REPORTS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? [...parsed, ...runtimeFoundEntries] : [...runtimeFoundEntries];
  } catch {
    return [...runtimeFoundEntries];
  }
}

export function normalizeReportStatus(report) {
  if (!report || typeof report !== 'object') return 'LOST';

  // 1. Revisar propiedades de estado/tipo sin importar mayúsculas/minúsculas ni idioma
  const rawStatus = String(
    report.status ?? report.type ?? report.tipo ?? report.estado ?? ''
  )
    .trim()
    .toUpperCase();

  if (['FOUND', 'ENCONTRADO', 'ENCONTRADA', 'HALLADO'].includes(rawStatus)) {
    return 'FOUND';
  }

  // 2. Verificar si el reporte fue registrado como FOUND desde el formulario local
  // (respaldo cuando el backend remoto devuelve 'LOST' por defecto en GET /api/reportes)
  const coords = normalizeCoords(report);
  const reportId = report.id ? String(report.id) : null;
  const reportDesc = String(report.description ?? report.desc_short ?? '')
    .trim()
    .toLowerCase();

  const foundEntries = getStoredFoundEntries();
  const matchesStoredFound = foundEntries.some((entry) => {
    if (!entry) return false;
    if (reportId && entry.id && String(entry.id) === reportId) return true;
    if (coords && Number.isFinite(entry.lat) && Number.isFinite(entry.lng)) {
      const sameCoords =
        Math.abs(Number(coords.lat.toFixed(4)) - Number(entry.lat)) <= 0.0002 &&
        Math.abs(Number(coords.lng.toFixed(4)) - Number(entry.lng)) <= 0.0002;
      if (sameCoords && (!entry.desc || !reportDesc || reportDesc === entry.desc)) {
        return true;
      }
    }
    return false;
  });

  if (matchesStoredFound) {
    return 'FOUND';
  }

  // 3. Respaldo para reportes ya guardados en el servidor cuya descripción indica hallazgo
  if (/\b(encontrad[oa]s?|found)\b/i.test(reportDesc)) {
    return 'FOUND';
  }

  if (['LOST', 'PERDIDO', 'PERDIDA'].includes(rawStatus)) {
    return 'LOST';
  }

  return 'LOST';
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

  mapInstance.on('click', handleMapClick);

  document.addEventListener('lostnet:map:pick-requested', enableLocationPicking);
  document.addEventListener('lostnet:reports:changed', async (event) => {
    const detail = event?.detail;
    const reportId = detail?.reportId ? String(detail.reportId) : null;
    const isFound = String(detail?.status ?? '').trim().toUpperCase() === 'FOUND';

    if (detail?.action === 'updated' && reportId) {
      const updatedEntry = {
        id: reportId,
        lat: Number(Number(detail.latitude).toFixed(4)),
        lng: Number(Number(detail.longitude).toFixed(4)),
        desc: String(detail.description ?? '').trim().toLowerCase(),
      };
      for (let index = runtimeFoundEntries.length - 1; index >= 0; index -= 1) {
        if (String(runtimeFoundEntries[index]?.id) === reportId) runtimeFoundEntries.splice(index, 1);
      }
      try {
        const stored = JSON.parse(globalThis.localStorage?.getItem(FOUND_REPORTS_STORAGE_KEY) || '[]');
        const entries = Array.isArray(stored)
          ? stored.filter((entry) => String(entry?.id) !== reportId)
          : [];
        if (isFound && Number.isFinite(updatedEntry.lat) && Number.isFinite(updatedEntry.lng)) {
          entries.push(updatedEntry);
        }
        globalThis.localStorage?.setItem(FOUND_REPORTS_STORAGE_KEY, JSON.stringify(entries.slice(-100)));
      } catch {
        // El mapa puede actualizarse desde la API aunque el almacenamiento local esté bloqueado.
      }
      if (isFound && Number.isFinite(updatedEntry.lat) && Number.isFinite(updatedEntry.lng)) {
        runtimeFoundEntries.push(updatedEntry);
      }
    } else if (detail && isFound) {
      runtimeFoundEntries.push({
        id: reportId,
        lat: Number(Number(detail.latitude).toFixed(4)),
        lng: Number(Number(detail.longitude).toFixed(4)),
        desc: String(detail.description ?? '').trim().toLowerCase(),
      });
    }

    if (selectionMarker) {
      selectionMarker.remove();
      selectionMarker = null;
    }

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

  document.dispatchEvent(
    new CustomEvent('lostnet:map:location-selected', {
      detail: { latitude, longitude }
    })
  );

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
    rawReports = Array.isArray(data) ? data : MOCK_REPORTS;
  } catch (err) {
    console.warn('API no disponible, cargando reportes locales de respaldo:', err.message);
    rawReports = MOCK_REPORTS;
  }
}

async function fetchSafePoints() {
  try {
    const data = await api.get(ENDPOINTS.PUNTOS_SEGUROS);
    rawSafePoints = Array.isArray(data) && data.length > 0 ? data : MOCK_SAFE_POINTS;
  } catch (err) {
    console.warn('API no disponible, cargando puntos seguros de respaldo:', err.message);
    rawSafePoints = MOCK_SAFE_POINTS;
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

    const normalizedStatus = normalizeReportStatus(report);
    const isFound = normalizedStatus === 'FOUND';
    const isLost = !isFound;
    const className = isFound ? 'custom-pin-found' : 'custom-pin-lost';

    const icon = L.divIcon({
      className,
      iconSize: [14, 14],
      iconAnchor: [7, 7]
    });

    const marker = L.marker([coords.lat, coords.lng], { icon });

    const rawPhoto =
      report.foto ||
      (report.photo_url && report.photo_url !== '/photos/no_image.png'
        ? report.photo_url
        : null);
    const photoUrl = rawPhoto ? api.resolveUrl(rawPhoto) : null;
    const photoHtml = photoUrl
      ? `<div style="margin-top: 6px;"><img src="${photoUrl}" alt="Foto del reporte" style="width: 100%; max-height: 120px; object-fit: cover; border-radius: 4px;" /></div>`
      : '';

    const descriptionText = report.description || report.desc_short || '';

    marker.bindPopup(`
      <div style="font-family: inherit; max-width: 200px;">
        <span style="font-size: 0.75rem; text-transform: uppercase; font-weight: bold; color: ${isLost ? '#ef4444' : '#3b82f6'};">
          ${isLost ? 'Objeto Perdido' : 'Objeto Encontrado'}
        </span>
        <h4 style="margin: 4px 0 2px 0;">${report.category || 'Sin categoría'}</h4>
        <p style="margin: 0; font-size: 0.85rem;">${descriptionText}</p>
        ${photoHtml}
      </div>
    `);

    reportsLayer.addLayer(marker);
  });
}

function setupUIEventListeners() {
  const searchInput = document.getElementById('map-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      setSearchTerm(e.target.value);
      renderFilteredReports();
    });
  }

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
