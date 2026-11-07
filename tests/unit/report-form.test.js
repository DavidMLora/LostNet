import { describe, it, expect } from 'vitest';
import {
  LIMITS, VALID_CATEGORIES, isValidCoordinate, validateReportInput, buildReportFormData,
} from '../../src/scripts/report-form.js';

const photo = new File(['bytes'], 'objeto.jpg', { type: 'image/jpeg' });
const valid = {
  status: 'LOST', title: 'Cartera', category: 'Documentos',
  description: 'Cartera café con credencial', photo, latitude: 21.91, longitude: -102.31,
};
const user = { sub: 'google-1', email: 'ana@example.test' };

describe('CU-03 / CU-07 · Validación del formulario', () => {
  it('acepta un reporte completo perdido o encontrado', () => {
    expect(validateReportInput(valid)).toEqual({ valid: true, errors: {} });
    expect(validateReportInput({ ...valid, status: ' found ' }).valid).toBe(true);
  });
  it('exige tipo Perdido o Encontrado', () => {
    expect(validateReportInput({ ...valid, status: 'OTRO' }).errors).toHaveProperty('status');
  });
  it('aplica los límites del título', () => {
    expect(validateReportInput({ ...valid, title: '  ' }).errors).toHaveProperty('title');
    expect(validateReportInput({ ...valid, title: 'ab' }).errors).toHaveProperty('title');
    expect(validateReportInput({ ...valid, title: 'x'.repeat(LIMITS.TITLE_MAX + 1) }).errors).toHaveProperty('title');
    expect(validateReportInput({ ...valid, title: 'x'.repeat(LIMITS.TITLE_MAX) }).valid).toBe(true);
  });
  it('aplica los límites de la descripción', () => {
    expect(validateReportInput({ ...valid, description: 'abcd' }).errors).toHaveProperty('description');
    expect(validateReportInput({ ...valid, description: 'x'.repeat(LIMITS.DESCRIPTION_MAX + 1) }).errors).toHaveProperty('description');
  });
  it('solo admite las categorías del catálogo', () => {
    for (const category of VALID_CATEGORIES) expect(validateReportInput({ ...valid, category }).valid).toBe(true);
    expect(validateReportInput({ ...valid, category: 'Mascotas' }).errors).toHaveProperty('category');
  });
  it('exige una imagen no vacía de hasta 10 MB', () => {
    expect(validateReportInput({ ...valid, photo: null }).errors).toHaveProperty('photo');
    expect(validateReportInput({ ...valid, photo: new File([], 'v.jpg', { type: 'image/jpeg' }) }).errors).toHaveProperty('photo');
    expect(validateReportInput({ ...valid, photo: new File(['x'], 'a.pdf', { type: 'application/pdf' }) }).errors).toHaveProperty('photo');
    expect(validateReportInput({ ...valid, photo: { size: LIMITS.MAX_PHOTO_BYTES + 1, type: 'image/png' } }).errors).toHaveProperty('photo');
  });
  it('exige ubicación válida', () => {
    expect(validateReportInput({ ...valid, latitude: '' }).errors).toHaveProperty('location');
  });
});

describe('Coordenadas', () => {
  it('acepta límites y cero', () => {
    expect(isValidCoordinate(0, 0)).toBe(true);
    expect(isValidCoordinate(-90, 180)).toBe(true);
    expect(isValidCoordinate('21.9', '-102.3')).toBe(true);
  });
  it('rechaza vacíos, booleanos, infinitos y fuera de rango', () => {
    for (const [lat, lng] of [[null, 0], [0, ''], [true, 0], [Infinity, 0], [91, 0], [0, -181], ['abc', 0]]) {
      expect(isValidCoordinate(lat, lng)).toBe(false);
    }
  });
});

describe('Construcción del multipart', () => {
  it('incluye usuario, ubicación, tipo, marca de tiempo y la foto', () => {
    const form = buildReportFormData({ user, ...valid, status: 'found', nowMs: 1_700_000_000_500 });
    expect(form.get('user_id')).toBe('google-1');
    expect(form.get('email')).toBe('ana@example.test');
    expect(form.get('status')).toBe('FOUND');
    expect(form.get('type')).toBe('FOUND');
    expect(form.get('latitude')).toBe('21.91');
    expect(form.get('timestamp')).toBe('1700000000');
    expect(form.get('foto').name).toBe('objeto.jpg');
  });
  it('antepone el título a la descripción sin duplicarlo', () => {
    expect(buildReportFormData({ user, ...valid, description: 'Café con credencial' }).get('description')).toBe('Cartera: Café con credencial');
    expect(buildReportFormData({ user, ...valid, description: 'cartera café' }).get('description')).toBe('cartera café');
  });
  it('cualquier tipo desconocido se guarda como LOST', () => {
    expect(buildReportFormData({ user, ...valid, status: undefined }).get('status')).toBe('LOST');
  });
  it('sin sesión activa no construye el reporte', () => {
    expect(() => buildReportFormData({ user: null, ...valid })).toThrow();
    expect(() => buildReportFormData({ user: { sub: 'x' }, ...valid })).toThrow();
  });
});
