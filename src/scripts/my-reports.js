import { api, ApiError, ENDPOINTS } from './api.js';
import { getUser } from './session.js';

const FOUND_STATUSES = new Set(['FOUND', 'ENCONTRADO', 'ENCONTRADA', 'HALLADO']);
const CATEGORIES = ['Documentos', 'Electrónica', 'Ropa', 'Otros'];

function normalizedValue(value) {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value).trim().toLocaleLowerCase()
    : '';
}

export function belongsToUser(report, user) {
  if (!report || !user) return false;
  const userId = normalizedValue(user.sub);
  const email = normalizedValue(user.email);
  const reportUserId = normalizedValue(report.user_id);
  const reportEmail = normalizedValue(report.email);
  return Boolean(
    (userId && reportUserId === userId)
    || (email && reportEmail === email)
    || (email && reportUserId === email)
    || (userId && reportEmail === userId)
  );
}

function reportStatus(report) {
  const value = String(report.status ?? report.type ?? report.tipo ?? report.estado ?? '')
    .trim()
    .toUpperCase();
  return FOUND_STATUSES.has(value) ? 'Encontrado' : 'Perdido';
}

function reportStatusValue(report) {
  const value = String(report.status ?? report.type ?? report.tipo ?? report.estado ?? '')
    .trim()
    .toUpperCase();
  return FOUND_STATUSES.has(value) ? 'FOUND' : 'LOST';
}

function reportTitle(report) {
  return report.title || report.nombre || report.description || report.desc_short || 'Reporte sin título';
}

function reportDescription(report) {
  const description = report.description || report.desc_short || '';
  const title = report.title || report.nombre || '';
  return description && title && description !== title ? description : '';
}

function photoSource(report) {
  const photo = report.foto || report.photo_url || report.photo || report.imagen;
  if (!photo || photo === '/photos/no_image.png') return null;
  return api.resolveUrl(photo);
}

function reportDate(report) {
  const raw = report.created_at ?? report.createdAt ?? report.timestamp ?? report.fecha;
  if (raw === null || raw === undefined || raw === '') return '';
  const numeric = Number(raw);
  const date = Number.isFinite(numeric)
    ? new Date(numeric < 1_000_000_000_000 ? numeric * 1000 : numeric)
    : new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' }).format(date);
}

function setFeedback(element, message, kind = '') {
  element.textContent = message;
  element.dataset.kind = kind;
}

function buildEditForm(report, onSave, onCancel, isUpdating) {
  const form = document.createElement('form');
  form.className = 'my-report-edit-form';

  const fields = document.createElement('div');
  fields.className = 'my-report-edit-grid';

  const titleLabel = document.createElement('label');
  titleLabel.textContent = 'Título';
  const titleInput = document.createElement('input');
  titleInput.name = 'title';
  titleInput.type = 'text';
  titleInput.minLength = 3;
  titleInput.maxLength = 60;
  titleInput.required = true;
  titleInput.value = report.title || report.nombre || report.description || report.desc_short || '';
  titleLabel.append(titleInput);

  const descriptionLabel = document.createElement('label');
  descriptionLabel.textContent = 'Descripción';
  const descriptionInput = document.createElement('textarea');
  descriptionInput.name = 'description';
  descriptionInput.minLength = 5;
  descriptionInput.maxLength = 250;
  descriptionInput.rows = 3;
  descriptionInput.required = true;
  descriptionInput.value = report.description || report.desc_short || '';
  descriptionLabel.append(descriptionInput);

  const categoryLabel = document.createElement('label');
  categoryLabel.textContent = 'Categoría';
  const categorySelect = document.createElement('select');
  categorySelect.name = 'category';
  categorySelect.required = true;
  const currentCategory = report.category || 'Otros';
  const categories = CATEGORIES.includes(currentCategory)
    ? CATEGORIES
    : [...CATEGORIES, currentCategory];
  categories.forEach((category) => {
    const option = document.createElement('option');
    option.value = category;
    option.textContent = category;
    option.selected = category === currentCategory;
    categorySelect.append(option);
  });
  categoryLabel.append(categorySelect);

  const statusLabel = document.createElement('label');
  statusLabel.textContent = 'Tipo de reporte';
  const statusSelect = document.createElement('select');
  statusSelect.name = 'status';
  statusSelect.required = true;
  [
    ['LOST', 'Objeto perdido'],
    ['FOUND', 'Objeto encontrado'],
  ].forEach(([value, label]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    option.selected = value === reportStatusValue(report);
    statusSelect.append(option);
  });
  statusLabel.append(statusSelect);

  fields.append(titleLabel, descriptionLabel, categoryLabel, statusLabel);
  form.append(fields);

  const note = document.createElement('p');
  note.className = 'my-report-edit-note';
  note.textContent = 'La fotografía y la ubicación actuales se conservarán.';
  form.append(note);

  const actions = document.createElement('div');
  actions.className = 'my-report-edit-actions';
  const saveButton = document.createElement('button');
  saveButton.className = 'my-report-save';
  saveButton.type = 'submit';
  saveButton.textContent = isUpdating ? 'Guardando…' : 'Guardar cambios';
  saveButton.disabled = isUpdating;
  const cancelButton = document.createElement('button');
  cancelButton.className = 'my-report-cancel';
  cancelButton.type = 'button';
  cancelButton.textContent = 'Cancelar';
  cancelButton.disabled = isUpdating;
  cancelButton.addEventListener('click', onCancel);
  actions.append(saveButton, cancelButton);
  form.append(actions);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (form.reportValidity()) {
      onSave(report, {
        title: titleInput.value.trim(),
        description: descriptionInput.value.trim(),
        category: categorySelect.value,
        status: statusSelect.value,
      });
    }
  });

  return form;
}

function buildReportCard(report, {
  onEdit,
  onDelete,
  onSave,
  onCancel,
  isEditing,
  isDeleting,
  isUpdating,
}) {
  const card = document.createElement('article');
  card.className = 'my-report-item';

  const body = document.createElement('div');
  body.className = 'my-report-body';

  const heading = document.createElement('div');
  heading.className = 'my-report-heading';
  const title = document.createElement('h4');
  title.className = 'my-report-title';
  title.textContent = reportTitle(report);
  const status = document.createElement('span');
  const statusLabel = reportStatus(report);
  status.className = `my-report-status ${statusLabel === 'Encontrado' ? 'is-found' : 'is-lost'}`;
  status.textContent = `Objeto ${statusLabel.toLowerCase()}`;
  heading.append(title, status);
  body.append(heading);

  const description = reportDescription(report);
  if (description) {
    const text = document.createElement('p');
    text.className = 'my-report-description';
    text.textContent = description;
    body.append(text);
  }

  const metadata = document.createElement('dl');
  metadata.className = 'my-report-metadata';
  const category = document.createElement('div');
  const categoryTerm = document.createElement('dt');
  categoryTerm.textContent = 'Categoría';
  const categoryValue = document.createElement('dd');
  categoryValue.textContent = report.category || 'Sin categoría';
  category.append(categoryTerm, categoryValue);
  metadata.append(category);

  const date = reportDate(report);
  if (date) {
    const dateItem = document.createElement('div');
    const dateTerm = document.createElement('dt');
    dateTerm.textContent = 'Publicado';
    const dateValue = document.createElement('dd');
    dateValue.textContent = date;
    dateItem.append(dateTerm, dateValue);
    metadata.append(dateItem);
  }
  body.append(metadata);

  if (isEditing) {
    body.append(buildEditForm(report, onSave, onCancel, isUpdating));
  }

  const imageUrl = photoSource(report);
  if (imageUrl) {
    const image = document.createElement('img');
    image.className = 'my-report-photo';
    image.src = imageUrl;
    image.alt = `Fotografía de ${reportTitle(report)}`;
    image.loading = 'lazy';
    image.addEventListener('error', () => image.remove(), { once: true });
    card.append(image);
  }

  const actions = document.createElement('div');
  actions.className = 'my-report-actions';
  const editButton = document.createElement('button');
  editButton.className = 'my-report-edit';
  editButton.type = 'button';
  editButton.textContent = isEditing ? 'Editando' : 'Editar';
  editButton.disabled = isEditing || isDeleting || isUpdating;
  editButton.addEventListener('click', onEdit);
  const deleteButton = document.createElement('button');
  deleteButton.className = 'my-report-delete';
  deleteButton.type = 'button';
  deleteButton.textContent = isDeleting ? 'Eliminando…' : 'Eliminar reporte';
  deleteButton.disabled = isDeleting || isUpdating || isEditing;
  deleteButton.addEventListener('click', () => onDelete(report));
  actions.append(editButton, deleteButton);

  card.append(body, actions);
  return card;
}

export function initMyReports() {
  const list = document.getElementById('my-reports-list');
  const feedback = document.getElementById('my-reports-feedback');
  const refreshButton = document.getElementById('my-reports-refresh');
  if (!list || !feedback || !refreshButton || list.dataset.initialized === 'true') return;
  list.dataset.initialized = 'true';

  let reports = [];
  let isLoading = false;
  let editingId = null;
  const deletingIds = new Set();
  const updatingIds = new Set();

  function render() {
    list.replaceChildren();
    reports.forEach((report) => {
      const id = String(report.id);
      list.append(buildReportCard(report, {
        onEdit: () => {
          if (report.id === null || report.id === undefined || report.id === '') {
            setFeedback(feedback, 'Este reporte no tiene un identificador válido y no se puede actualizar.', 'error');
            return;
          }
          editingId = id;
          setFeedback(feedback, '', '');
          render();
        },
        onDelete: deleteReport,
        onSave: updateReport,
        onCancel: () => {
          editingId = null;
          render();
        },
        isEditing: editingId === id,
        isDeleting: deletingIds.has(id),
        isUpdating: updatingIds.has(id),
      }));
    });
    refreshButton.disabled = isLoading || deletingIds.size > 0 || updatingIds.size > 0;
  }

  async function updateReport(report, changes) {
    const user = getUser();
    const reportId = report?.id;
    if (!user?.sub || !user?.email || !belongsToUser(report, user)) {
      setFeedback(feedback, 'Tu sesión ya no puede actualizar este reporte.', 'error');
      return;
    }
    if (reportId === null || reportId === undefined || reportId === '') {
      setFeedback(feedback, 'Este reporte no tiene un identificador válido y no se puede actualizar.', 'error');
      return;
    }

    const id = String(reportId);
    updatingIds.add(id);
    render();
    try {
      await api.put(`${ENDPOINTS.REPORTES}/${encodeURIComponent(id)}`, {
        user_id: user.sub,
        email: user.email,
        ...changes,
        type: changes.status,
      });
      const updatedReport = { ...report, ...changes, type: changes.status };
      reports = reports.map((item) => String(item.id) === id ? updatedReport : item);
      editingId = null;
      document.dispatchEvent(new CustomEvent('lostnet:reports:changed', {
        detail: {
          action: 'updated',
          reportId: id,
          status: changes.status,
          latitude: updatedReport.latitude ?? updatedReport.lat,
          longitude: updatedReport.longitude ?? updatedReport.lon,
          description: changes.description,
        },
      }));
      setFeedback(feedback, `Se actualizaron los datos de “${changes.title}”.`, 'success');
    } catch (error) {
      const message = error instanceof ApiError
        ? error.code === 'network' || error.code === 'timeout'
          ? 'No se pudo confirmar la actualización por un problema de conexión. Revisa el reporte antes de repetirla.'
          : error.status === 404
            ? 'El reporte ya no existe o el servidor no encontró la ruta de actualización.'
            : error.status === 405
              ? 'El servidor aún no admite actualizar reportes mediante PUT /api/reportes/{id}.'
              : `No se pudo actualizar el reporte${error.status ? ` (HTTP ${error.status})` : ''}. Inténtalo de nuevo.`
        : 'No se pudo actualizar el reporte. Inténtalo de nuevo.';
      setFeedback(feedback, message, 'error');
    } finally {
      updatingIds.delete(id);
      render();
    }
  }

  async function loadReports({ preserveOnError = false } = {}) {
    const user = getUser();
    if (!user?.sub || !user?.email) {
      setFeedback(feedback, 'Tu sesión terminó. Vuelve a iniciar sesión para consultar tus reportes.', 'error');
      return;
    }

    isLoading = true;
    refreshButton.disabled = true;
    if (!reports.length) setFeedback(feedback, 'Cargando tus reportes…');

    try {
      const data = await api.get(ENDPOINTS.REPORTES);
      if (!Array.isArray(data)) throw new Error('La respuesta de reportes no tiene el formato esperado.');
      reports = data.filter((report) => belongsToUser(report, user));
      render();
      setFeedback(
        feedback,
        reports.length ? `Encontramos ${reports.length} ${reports.length === 1 ? 'reporte tuyo' : 'reportes tuyos'}.` : 'Aún no has publicado reportes.',
        reports.length ? 'success' : 'empty'
      );
    } catch (error) {
      const message = error instanceof ApiError
        ? error.code === 'network' || error.code === 'timeout'
          ? 'No se pudieron cargar tus reportes. Revisa tu conexión e inténtalo de nuevo.'
          : error.status === 404
            ? 'No se encontró el listado de reportes. Intenta actualizarlo más tarde.'
            : `No se pudieron cargar tus reportes${error.status ? ` (HTTP ${error.status})` : ''}. Inténtalo de nuevo.`
        : 'La respuesta del servidor no se pudo procesar. Intenta actualizar la lista.';
      if (!preserveOnError) reports = [];
      render();
      setFeedback(feedback, message, 'error');
    } finally {
      isLoading = false;
      render();
    }
  }

  async function deleteReport(report) {
    const user = getUser();
    const reportId = report?.id;
    if (!user?.sub || !user?.email) {
      setFeedback(feedback, 'Tu sesión terminó. Vuelve a iniciar sesión antes de eliminar un reporte.', 'error');
      return;
    }
    if (reportId === null || reportId === undefined || reportId === '') {
      setFeedback(feedback, 'Este reporte no tiene un identificador válido y no se puede eliminar.', 'error');
      return;
    }

    const id = String(reportId);
    const label = reportTitle(report);
    if (!globalThis.confirm(`¿Quieres eliminar “${label}”? Esta acción quitará el reporte del mapa.`)) return;

    deletingIds.add(id);
    render();
    try {
      await api.delete(`${ENDPOINTS.REPORTES}/${encodeURIComponent(id)}`, { user_id: user.sub });
      reports = reports.filter((item) => String(item.id) !== id);
      document.dispatchEvent(new CustomEvent('lostnet:reports:changed', {
        detail: { action: 'deleted', reportId: id },
      }));
      setFeedback(feedback, `Se eliminó “${label}”. El listado y el mapa se actualizaron.`, 'success');
    } catch (error) {
      const message = error instanceof ApiError
        ? error.code === 'network' || error.code === 'timeout'
          ? 'No se pudo confirmar la eliminación por un problema de conexión. El reporte sigue en la lista.'
          : error.status === 404
            ? 'El reporte ya no existe o no pudo encontrarse. Actualiza la lista para comprobarlo.'
            : `No se pudo eliminar el reporte${error.status ? ` (HTTP ${error.status})` : ''}. El reporte sigue en la lista.`
        : 'No se pudo eliminar el reporte. Inténtalo de nuevo.';
      setFeedback(feedback, message, 'error');
    } finally {
      deletingIds.delete(id);
      render();
    }
  }

  refreshButton.addEventListener('click', () => loadReports({ preserveOnError: true }));
  loadReports();
}
