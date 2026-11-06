// src/scripts/report-form.js
import { api, ApiError, ENDPOINTS } from './api.js';
import { getUser } from './session.js';

export const VALID_STATUSES = Object.freeze(['LOST', 'FOUND']);
export const VALID_CATEGORIES = Object.freeze([
  'Documentos',
  'Electrónica',
  'Ropa',
  'Otros',
]);

export const LIMITS = Object.freeze({
  TITLE_MIN: 3,
  TITLE_MAX: 60,
  DESCRIPTION_MIN: 5,
  DESCRIPTION_MAX: 250,
  MAX_PHOTO_BYTES: 10 * 1024 * 1024, // 10 MB
});

export function isValidCoordinate(lat, lng) {
  if (lat === null || lat === undefined || lat === '' || typeof lat === 'boolean') return false;
  if (lng === null || lng === undefined || lng === '' || typeof lng === 'boolean') return false;
  const numLat = Number(lat);
  const numLng = Number(lng);
  return (
    Number.isFinite(numLat) &&
    Number.isFinite(numLng) &&
    numLat >= -90 &&
    numLat <= 90 &&
    numLng >= -180 &&
    numLng <= 180
  );
}

export function validateReportInput({
  status,
  title,
  category,
  description,
  photo,
  latitude,
  longitude,
}) {
  const errors = {};

  const normalizedStatus = typeof status === 'string' ? status.trim().toUpperCase() : '';
  if (!VALID_STATUSES.includes(normalizedStatus)) {
    errors.status = 'Selecciona si el objeto está perdido o fue encontrado.';
  }

  const trimmedTitle = typeof title === 'string' ? title.trim() : '';
  if (!trimmedTitle) {
    errors.title = 'Ingresa el nombre o título del objeto.';
  } else if (trimmedTitle.length < LIMITS.TITLE_MIN) {
    errors.title = `El título debe tener al menos ${LIMITS.TITLE_MIN} caracteres.`;
  } else if (trimmedTitle.length > LIMITS.TITLE_MAX) {
    errors.title = `El título no debe exceder ${LIMITS.TITLE_MAX} caracteres.`;
  }

  const trimmedCategory = typeof category === 'string' ? category.trim() : '';
  if (!VALID_CATEGORIES.includes(trimmedCategory)) {
    errors.category = 'Selecciona una categoría válida.';
  }

  const trimmedDescription = typeof description === 'string' ? description.trim() : '';
  if (!trimmedDescription) {
    errors.description = 'Ingresa una descripción detallada del objeto.';
  } else if (trimmedDescription.length < LIMITS.DESCRIPTION_MIN) {
    errors.description = `La descripción debe tener al menos ${LIMITS.DESCRIPTION_MIN} caracteres.`;
  } else if (trimmedDescription.length > LIMITS.DESCRIPTION_MAX) {
    errors.description = `La descripción no debe exceder ${LIMITS.DESCRIPTION_MAX} caracteres.`;
  }

  if (!photo || typeof photo !== 'object' || !('size' in photo) || photo.size <= 0) {
    errors.photo = 'Adjunta una fotografía del objeto.';
  } else if (typeof photo.type === 'string' && !photo.type.startsWith('image/')) {
    errors.photo = 'El archivo seleccionado debe ser una imagen válida (JPG, PNG, WEBP).';
  } else if (photo.size > LIMITS.MAX_PHOTO_BYTES) {
    errors.photo = 'La fotografía no debe superar los 10 MB.';
  }

  if (!isValidCoordinate(latitude, longitude)) {
    errors.location = 'Selecciona una ubicación válida haciendo clic en el mapa.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export const FOUND_REPORTS_STORAGE_KEY = 'lostnet.found_reports';

export function registerFoundReport({ id, latitude, longitude, description }) {
  try {
    const raw = globalThis.localStorage?.getItem(FOUND_REPORTS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const list = Array.isArray(parsed) ? parsed : [];

    const entry = {
      id: id ? String(id) : null,
      lat: Number(Number(latitude).toFixed(4)),
      lng: Number(Number(longitude).toFixed(4)),
      desc: String(description ?? '').trim().toLowerCase(),
      createdAt: Date.now(),
    };

    list.push(entry);
    globalThis.localStorage?.setItem(
      FOUND_REPORTS_STORAGE_KEY,
      JSON.stringify(list.slice(-100))
    );
  } catch {
    // Ignorar si el navegador restringe localStorage
  }
}

export function buildReportFormData({
  user,
  status,
  title,
  category,
  description,
  photo,
  latitude,
  longitude,
  phone = '',
  securityQuestion = '',
  securityAnswer = '',
  nowMs = Date.now(),
}) {
  if (!user?.sub || !user?.email) {
    throw new Error('Se requiere una sesión activa para construir el reporte.');
  }

  const normalizedStatus = String(status ?? 'LOST').trim().toUpperCase() === 'FOUND'
    ? 'FOUND'
    : 'LOST';
  const trimmedTitle = title.trim();
  const trimmedDesc = description.trim();
  const combinedDescription = trimmedDesc.toLowerCase().startsWith(trimmedTitle.toLowerCase())
    ? trimmedDesc
    : `${trimmedTitle}: ${trimmedDesc}`;

  const formData = new FormData();
  formData.set('user_id', String(user.sub));
  formData.set('email', String(user.email));
  formData.set('title', trimmedTitle);
  formData.set('description', combinedDescription);
  formData.set('category', category.trim());
  formData.set('phone', String(phone ?? '').trim());
  formData.set('security_question', String(securityQuestion ?? '').trim());
  formData.set('security_answer', String(securityAnswer ?? '').trim());
  formData.set('latitude', String(Number(latitude)));
  formData.set('longitude', String(Number(longitude)));
  formData.set('status', normalizedStatus);
  formData.set('type', normalizedStatus);
  formData.set('tipo', normalizedStatus);
  formData.set('timestamp', String(Math.floor(nowMs / 1000)));
  formData.set('foto', photo);

  return formData;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 1024) return `${bytes || 0} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

function resolveErrorMessage(error) {
  if (error instanceof ApiError) {
    if (error.code === 'timeout') {
      return 'Se agotó el tiempo de espera al subir el reporte. Verifica tu conexión e inténtalo de nuevo.';
    }
    if (error.code === 'network') {
      return 'No se pudo conectar con el servidor de LostNet. Tu borrador se ha conservado.';
    }
    if (error.code === 'http') {
      return `El servidor rechazó la publicación (HTTP ${error.status}). Verifica los datos e inténtalo de nuevo.`;
    }
    return error.message || 'Ocurrió un error al procesar la respuesta del servidor.';
  }
  return error?.message || 'No se pudo publicar el reporte. Inténtalo nuevamente.';
}

export function initReportForm() {
  const form = document.getElementById('report-form');
  if (!form || form.dataset.initialized === 'true') return;
  form.dataset.initialized = 'true';

  const titleInput = document.getElementById('report-title');
  const categorySelect = document.getElementById('report-category');
  const descriptionInput = document.getElementById('report-description');
  const descCounter = document.getElementById('report-description-counter');
  const photoInput = document.getElementById('report-photo');
  const photoDropzone = document.getElementById('photo-dropzone');
  const photoPlaceholder = document.getElementById('photo-placeholder');
  const photoPreviewWrapper = document.getElementById('photo-preview-wrapper');
  const photoPreviewImg = document.getElementById('photo-preview-img');
  const photoFileName = document.getElementById('photo-file-name');
  const photoFileSize = document.getElementById('photo-file-size');
  const photoClearBtn = document.getElementById('photo-clear-btn');

  const locationBox = document.getElementById('location-box');
  const locationStatusText = document.getElementById('location-status-text');
  const locationCoordsReadout = document.getElementById('location-coords-readout');
  const pickLocationBtn = document.getElementById('pick-location-btn');
  const latInput = document.getElementById('report-latitude');
  const lngInput = document.getElementById('report-longitude');

  const phoneInput = document.getElementById('report-phone');
  const secQuestionInput = document.getElementById('report-security-question');
  const secAnswerInput = document.getElementById('report-security-answer');

  const submitBtn = document.getElementById('submit-report-btn');
  const resetBtn = document.getElementById('reset-report-btn');
  const feedbackBox = document.getElementById('report-form-feedback');

  const errorEls = {
    title: document.getElementById('error-report-title'),
    category: document.getElementById('error-report-category'),
    description: document.getElementById('error-report-description'),
    photo: document.getElementById('error-report-photo'),
    location: document.getElementById('error-report-location'),
  };

  let selectedPhoto = null;
  let currentPreviewUrl = null;
  let selectedCoords = { latitude: null, longitude: null };
  let isSubmitting = false;

  function showFeedback(type, message) {
    if (!feedbackBox) return;
    if (!message) {
      feedbackBox.hidden = true;
      feedbackBox.textContent = '';
      feedbackBox.className = 'form-feedback';
      return;
    }
    feedbackBox.hidden = false;
    feedbackBox.textContent = message;
    feedbackBox.className = `form-feedback ${
      type === 'success' ? 'form-feedback--success' : 'form-feedback--error'
    }`;
  }

  function setFieldError(key, message) {
    const errEl = errorEls[key];
    if (errEl) {
      errEl.textContent = message || '';
      errEl.hidden = !message;
    }

    const targetMap = {
      title: titleInput,
      category: categorySelect,
      description: descriptionInput,
      photo: photoDropzone,
      location: locationBox,
    };

    const inputEl = targetMap[key];
    if (inputEl) {
      inputEl.classList.toggle('is-invalid', Boolean(message));
    }
  }

  function clearAllFieldErrors() {
    Object.keys(errorEls).forEach((key) => setFieldError(key, ''));
  }

  function revokePreviewUrl() {
    if (currentPreviewUrl) {
      URL.revokeObjectURL(currentPreviewUrl);
      currentPreviewUrl = null;
    }
  }

  function updatePhotoPreview(file) {
    revokePreviewUrl();

    if (!file) {
      selectedPhoto = null;
      if (photoInput) photoInput.value = '';
      if (photoPreviewImg) photoPreviewImg.removeAttribute('src');
      if (photoPreviewWrapper) photoPreviewWrapper.hidden = true;
      if (photoPlaceholder) photoPlaceholder.hidden = false;
      return;
    }

    if (typeof file.type === 'string' && !file.type.startsWith('image/')) {
      setFieldError('photo', 'El archivo debe ser una imagen (JPG, PNG, WEBP).');
      return;
    }

    if (file.size > LIMITS.MAX_PHOTO_BYTES) {
      setFieldError('photo', 'La fotografía no debe superar los 10 MB.');
      return;
    }

    selectedPhoto = file;
    setFieldError('photo', '');

    currentPreviewUrl = URL.createObjectURL(file);
    if (photoPreviewImg) photoPreviewImg.src = currentPreviewUrl;
    if (photoFileName) photoFileName.textContent = file.name;
    if (photoFileSize) photoFileSize.textContent = formatBytes(file.size);
    if (photoPlaceholder) photoPlaceholder.hidden = true;
    if (photoPreviewWrapper) photoPreviewWrapper.hidden = false;
  }

  function updateLocationUI(lat, lng) {
    if (!isValidCoordinate(lat, lng)) {
      selectedCoords = { latitude: null, longitude: null };
      if (latInput) latInput.value = '';
      if (lngInput) lngInput.value = '';
      if (locationBox) {
        locationBox.classList.remove('has-coords', 'is-picking');
      }
      if (locationStatusText) {
        locationStatusText.textContent = 'Sin ubicación seleccionada';
      }
      if (locationCoordsReadout) {
        locationCoordsReadout.textContent = 'Usa el botón para elegir un punto en el mapa superior.';
      }
      if (pickLocationBtn) {
        pickLocationBtn.textContent = '📍 Seleccionar ubicación en el mapa';
      }
      return;
    }

    const numLat = Number(Number(lat).toFixed(6));
    const numLng = Number(Number(lng).toFixed(6));
    selectedCoords = { latitude: numLat, longitude: numLng };

    if (latInput) latInput.value = String(numLat);
    if (lngInput) lngInput.value = String(numLng);

    setFieldError('location', '');
    if (locationBox) {
      locationBox.classList.remove('is-picking');
      locationBox.classList.add('has-coords');
    }
    if (locationStatusText) {
      locationStatusText.textContent = 'Ubicación fijada en el mapa';
    }
    if (locationCoordsReadout) {
      locationCoordsReadout.textContent = `Lat: ${numLat.toFixed(6)}, Lng: ${numLng.toFixed(6)}`;
    }
    if (pickLocationBtn) {
      pickLocationBtn.textContent = '📍 Cambiar ubicación en el mapa';
    }
  }

  function getSelectedStatus() {
    const checked = form.querySelector('input[name="status"]:checked');
    const rawValue = checked ? checked.value : 'LOST';
    return String(rawValue).trim().toUpperCase() === 'FOUND' ? 'FOUND' : 'LOST';
  }

  function resetFormState({ keepFeedback = false } = {}) {
    form.reset();
    updatePhotoPreview(null);
    updateLocationUI(null, null);
    clearAllFieldErrors();
    if (descCounter) {
      descCounter.textContent = `0 / ${LIMITS.DESCRIPTION_MAX}`;
    }
    if (!keepFeedback) {
      showFeedback('', '');
    }
  }

  // Contador de descripción y limpieza de errores al escribir
  if (descriptionInput) {
    descriptionInput.addEventListener('input', () => {
      const len = descriptionInput.value.length;
      if (descCounter) {
        descCounter.textContent = `${len} / ${LIMITS.DESCRIPTION_MAX}`;
      }
      if (descriptionInput.value.trim().length >= LIMITS.DESCRIPTION_MIN) {
        setFieldError('description', '');
      }
    });
  }

  if (titleInput) {
    titleInput.addEventListener('input', () => {
      if (titleInput.value.trim().length >= LIMITS.TITLE_MIN) {
        setFieldError('title', '');
      }
    });
  }

  if (categorySelect) {
    categorySelect.addEventListener('change', () => {
      if (categorySelect.value) {
        setFieldError('category', '');
      }
    });
  }

  // Selector de foto y Drag & Drop
  if (photoInput) {
    photoInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) updatePhotoPreview(file);
    });
  }

  if (photoClearBtn) {
    photoClearBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      updatePhotoPreview(null);
    });
  }

  if (photoDropzone) {
    photoDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      photoDropzone.classList.add('is-dragover');
    });
    photoDropzone.addEventListener('dragleave', () => {
      photoDropzone.classList.remove('is-dragover');
    });
    photoDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      photoDropzone.classList.remove('is-dragover');
      const file = e.dataTransfer?.files?.[0];
      if (file) updatePhotoPreview(file);
    });
  }

  // Solicitar selección de ubicación al mapa existente
  if (pickLocationBtn) {
    pickLocationBtn.addEventListener('click', () => {
      showFeedback('', '');
      setFieldError('location', '');
      if (locationBox) {
        locationBox.classList.add('is-picking');
      }
      if (locationStatusText) {
        locationStatusText.textContent = 'Esperando clic en el mapa…';
      }
      if (locationCoordsReadout) {
        locationCoordsReadout.textContent = 'Haz clic sobre el punto exacto en el mapa superior.';
      }

      document.dispatchEvent(new CustomEvent('lostnet:map:pick-requested'));

      const mapEl = document.getElementById('map');
      if (mapEl && typeof mapEl.scrollIntoView === 'function') {
        mapEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  }

  // Escuchar coordenadas emitidas por el componente de mapa
  const handleLocationSelected = (event) => {
    const detail = event?.detail;
    if (!detail) return;
    const { latitude, longitude } = detail;
    if (isValidCoordinate(latitude, longitude)) {
      updateLocationUI(latitude, longitude);
    }
  };

  document.addEventListener('lostnet:map:location-selected', handleLocationSelected);
  window.addEventListener('lostnet:map:location-selected', handleLocationSelected);

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (isSubmitting) return;
      resetFormState({ keepFeedback: false });
    });
  }

  // Envío del formulario
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (isSubmitting) return;

    showFeedback('', '');
    clearAllFieldErrors();

    const user = getUser();
    if (!user?.sub || !user?.email) {
      showFeedback('error', 'Tu sesión ha expirado. Vuelve a iniciar sesión para publicar un reporte.');
      return;
    }

    const payload = {
      status: getSelectedStatus(),
      title: titleInput?.value ?? '',
      category: categorySelect?.value ?? '',
      description: descriptionInput?.value ?? '',
      photo: selectedPhoto,
      latitude: selectedCoords.latitude,
      longitude: selectedCoords.longitude,
      phone: phoneInput?.value ?? '',
      securityQuestion: secQuestionInput?.value ?? '',
      securityAnswer: secAnswerInput?.value ?? '',
    };

    const validation = validateReportInput(payload);
    if (!validation.valid) {
      Object.entries(validation.errors).forEach(([field, message]) => {
        setFieldError(field, message);
      });
      showFeedback('error', 'Revisa los campos marcados en rojo antes de publicar.');
      return;
    }

    isSubmitting = true;
    const originalBtnText = submitBtn ? submitBtn.textContent : 'Publicar reporte';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Publicando reporte…';
    }
    if (resetBtn) {
      resetBtn.disabled = true;
    }

    try {
      const formData = buildReportFormData({
        user,
        ...payload,
      });

      const result = await api.post(ENDPOINTS.REPORTAR, formData);
      const reportId = result?.id ?? result?.report_id ?? null;

      if (payload.status === 'FOUND') {
        registerFoundReport({
          id: reportId,
          latitude: payload.latitude,
          longitude: payload.longitude,
          description: formData.get('description'),
        });
      }

      resetFormState({ keepFeedback: true });
      const statusLabel = payload.status === 'FOUND' ? 'Encontrado' : 'Perdido';
      showFeedback(
        'success',
        `¡Reporte de objeto ${statusLabel.toLowerCase()} publicado con éxito! El mapa se ha actualizado.`
      );

      const changeDetail = {
        action: 'created',
        reportId,
        status: payload.status,
        latitude: payload.latitude,
        longitude: payload.longitude,
        description: formData.get('description'),
      };
      document.dispatchEvent(
        new CustomEvent('lostnet:reports:changed', { detail: changeDetail })
      );
      window.dispatchEvent(
        new CustomEvent('lostnet:reports:changed', { detail: changeDetail })
      );
    } catch (error) {
      showFeedback('error', resolveErrorMessage(error));
    } finally {
      isSubmitting = false;
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalBtnText;
      }
      if (resetBtn) {
        resetBtn.disabled = false;
      }
    }
  });
}
