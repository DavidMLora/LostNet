import assert from 'node:assert/strict';
import test from 'node:test';
import { belongsToUser } from '../src/scripts/my-reports.js';

const user = { sub: 'google-user-123', email: 'sebas@example.test' };

test('incluye reportes propios por identificador o correo', () => {
  assert.equal(belongsToUser({ user_id: 'google-user-123' }, user), true);
  assert.equal(belongsToUser({ email: 'SEBAS@example.test' }, user), true);
  assert.equal(belongsToUser({ user_id: 'sebas@example.test' }, user), true);
});

test('excluye reportes de otras personas y registros sin propietario', () => {
  assert.equal(belongsToUser({ user_id: 'another-user', email: 'other@example.test' }, user), false);
  assert.equal(belongsToUser({ id: 17, description: 'Sin propietario' }, user), false);
  assert.equal(belongsToUser({ user_id: user.sub }, null), false);
});
