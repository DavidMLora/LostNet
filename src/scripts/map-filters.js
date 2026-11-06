// src/scripts/map-filters.js

let currentCategory = 'TODOS';
let currentSearchTerm = '';

export function setCategoryFilter(category) {
  currentCategory = category ? category.toUpperCase() : 'TODOS';
}

export function setSearchTerm(term) {
  currentSearchTerm = term ? term.trim().toLowerCase() : '';
}

export function applyFilters(reports = []) {
  return reports.filter((report) => {
    // 1. Filtro por categoría
    const reportCat = (report.category || '').toUpperCase();
    const matchesCategory =
      currentCategory === 'TODOS' || reportCat === currentCategory;

    // 2. Filtro por término de búsqueda en descripción
    const description = (report.description || report.desc_short || '').toLowerCase();
    const matchesSearch =
      !currentSearchTerm || description.includes(currentSearchTerm);

    return matchesCategory && matchesSearch;
  });
}