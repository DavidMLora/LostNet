import { describe, it, expect, beforeEach } from 'vitest';
import { applyFilters, setCategoryFilter, setSearchTerm } from '../../src/scripts/map-filters.js';

const reports = [
  { id: 1, category: 'Documentos', description: 'Credencial de la UAA' },
  { id: 2, category: 'Electrónica', desc_short: 'Celular con funda azul' },
  { id: 3, category: 'electrónica', description: 'Audífonos blancos' },
  { id: 4, description: 'Paraguas sin categoría' },
];
const ids = (list) => list.map((report) => report.id);

describe('CU-14 · Filtros del mapa', () => {
  beforeEach(() => { setCategoryFilter(null); setSearchTerm(null); });

  it('sin filtros devuelve todos los reportes', () => {
    expect(ids(applyFilters(reports))).toEqual([1, 2, 3, 4]);
  });
  it('filtra por categoría sin distinguir mayúsculas', () => {
    setCategoryFilter('Electrónica');
    expect(ids(applyFilters(reports))).toEqual([2, 3]);
  });
  it('"TODOS" o una categoría vacía restablecen el filtro', () => {
    setCategoryFilter('Ropa'); setCategoryFilter('');
    expect(applyFilters(reports)).toHaveLength(4);
    setCategoryFilter('todos');
    expect(applyFilters(reports)).toHaveLength(4);
  });
  it('busca en description y desc_short, recortando espacios', () => {
    setSearchTerm('  FUNDA ');
    expect(ids(applyFilters(reports))).toEqual([2]);
  });
  it('combina categoría y búsqueda', () => {
    setCategoryFilter('Electrónica'); setSearchTerm('audí');
    expect(ids(applyFilters(reports))).toEqual([3]);
  });
  it('un reporte sin categoría no coincide con una categoría concreta', () => {
    setCategoryFilter('Otros');
    expect(applyFilters(reports)).toEqual([]);
  });
  it('sin lista devuelve un arreglo vacío y no modifica la original', () => {
    expect(applyFilters()).toEqual([]);
    const copy = structuredClone(reports);
    setSearchTerm('uaa'); applyFilters(reports);
    expect(reports).toEqual(copy);
  });
});
