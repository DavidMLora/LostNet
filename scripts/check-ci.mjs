import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { parseDocument } from 'yaml';

const jobIds = ['analisis-estatico','vulnerabilidades','pruebas-unitarias','pruebas-integracion','empaquetado','publicar'];
const publicationGuard = "github.event_name == 'push' && github.ref == 'refs/heads/main' && github.repository == 'DavidMLora/LostNet'";
const sorted = values => [...values].sort();

/** Check policy without evaluating untrusted expressions or contacting GitHub. */
export function validateWorkflow(ci) {
  assert.deepEqual(ci.permissions, { contents: 'read' });
  assert.deepEqual(sorted(Object.keys(ci.on)), ['pull_request','push','workflow_dispatch']);
  for (const event of ['push','pull_request']) {
    assert.deepEqual(Object.keys(ci.on[event]), ['branches'], `${event}: no path/type filters that could suppress required checks`);
    assert.deepEqual(sorted(ci.on[event].branches), ['develop','main'], `${event}: expected Git Flow branches only`);
  }
  assert.deepEqual(sorted(Object.keys(ci.jobs)), sorted(jobIds));
  const needs = name => [ci.jobs[name].needs || []].flat();
  assert.deepEqual(needs('pruebas-integracion'), ['pruebas-unitarias']);
  assert.deepEqual(sorted(needs('empaquetado')), sorted(jobIds.filter(name => !['empaquetado','publicar'].includes(name))));
  assert.deepEqual(needs('publicar'), ['empaquetado']);
  for (const name of ['analisis-estatico','vulnerabilidades','pruebas-unitarias']) assert.deepEqual(needs(name), []);
  for (const [name, job] of Object.entries(ci.jobs)) {
    assert.equal(job.name, name, `${name}: stable branch-protection check name`);
    assert.equal(job.strategy, undefined, `${name}: keep stable, non-matrix check names`);
    assert.ok(job['timeout-minutes'] > 0, `${name}: timeout required`);
    assert.ok(job.steps.some(step => step.uses?.startsWith('actions/checkout@') && step.with?.['persist-credentials'] === false));
    assert.ok(job.steps.some(step => step.uses?.startsWith('actions/setup-node@') && step.with?.['node-version-file'] === '.nvmrc'));
    assert.ok(job.steps.some(step => step.run === 'npm ci'));
    assert.equal(job['continue-on-error'], undefined);
    if (name !== 'publicar') {
      assert.equal(job.if, undefined, `${name}: must run on normal PRs to develop/main`);
      assert.ok(job.permissions === undefined || JSON.stringify(job.permissions) === JSON.stringify({ contents: 'read' }), `${name}: read-only permissions`);
    }
    for (const step of job.steps) {
      if (step.uses) assert.match(step.uses, /@[a-f0-9]{40}$/, 'Actions must be pinned to verified SHAs');
      assert.equal(step['continue-on-error'], undefined);
      if (name !== 'publicar') assert.equal(step.if, undefined, `${name}: validation steps cannot be silently skipped`);
      if (step.with?.push === true || step.with?.password) assert.equal(name, 'publicar');
    }
  }
  assert.ok(ci.jobs['analisis-estatico'].steps.some(step => step.run === 'npm run lint'));
  assert.ok(ci.jobs['pruebas-unitarias'].steps.some(step => step.run === 'npm run test:unit'));
  assert.ok(ci.jobs['pruebas-integracion'].steps.some(step => step.run === 'npm run test:integration'));
  assert.ok(ci.jobs.vulnerabilidades.steps.some(step => step.run === 'npm audit --audit-level=high'));
  assert.deepEqual(ci.jobs.publicar.permissions, { contents: 'read', packages: 'write' });
  // Exact policy avoids accepting an otherwise plausible guard followed by "|| true".
  assert.equal(ci.jobs.publicar.if.replace(/\s+/g, ' ').trim(), publicationGuard);
  const publishing = ci.jobs.publicar.steps.filter(step => step.with?.push === true);
  assert.equal(publishing.length, 1);
  assert.ok(publishing[0].with.tags.includes(':sha-${{ github.sha }}'));
  assert.ok(publishing[0].with.tags.includes(':latest'));
  assert.ok(ci.jobs.empaquetado.steps.some(step => step.with?.load === true && step.with?.push === false));
  assert.ok(ci.jobs.empaquetado.steps.some(step => step.run === 'bash scripts/smoke-container.sh lostnet:ci'));
  const visited = new Set();
  function visit(name, ancestors = new Set()) {
    assert.ok(ci.jobs[name], `Missing dependency ${name}`);
    assert.ok(!ancestors.has(name), 'Job dependency cycle');
    if (visited.has(name)) return;
    for (const dependency of needs(name)) visit(dependency, new Set([...ancestors, name]));
    visited.add(name);
  }
  jobIds.forEach(name => visit(name));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const document = parseDocument(await readFile('.github/workflows/ci.yml', 'utf8'), { uniqueKeys: true });
  assert.deepEqual(document.errors, [], 'Invalid workflow YAML');
  validateWorkflow(document.toJS());
  console.log('Workflow valid: 6 stable jobs, Git Flow main/develop push + PR, no skipped PR validation steps, DAG, audit gate and main-only publication. This does not execute GitHub Actions.');
}
