import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, it, expect } from 'vitest';
import { validateWorkflow } from '../../scripts/check-ci.mjs';

const original = parse(readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8'));
const copy = () => structuredClone(original);
describe('Git Flow workflow policy', () => {
  it('accepts all six jobs for main/develop push, PR and manual events', () => {
    expect(() => validateWorkflow(copy())).not.toThrow();
  });
  it('rejects a missing develop PR trigger', () => {
    const ci=copy(); ci.on.pull_request.branches=['main']; expect(() => validateWorkflow(ci)).toThrow();
  });
  it('rejects feature push triggers', () => {
    const ci=copy(); ci.on.push.branches.push('feature/*'); expect(() => validateWorkflow(ci)).toThrow();
  });
  it('rejects a missing main push trigger', () => {
    const ci=copy(); ci.on.push.branches=['develop']; expect(() => validateWorkflow(ci)).toThrow();
  });
  it('rejects path filters that would leave required checks pending', () => {
    const ci=copy(); ci.on.pull_request.paths=['src/**']; expect(() => validateWorkflow(ci)).toThrow();
  });
  it('rejects PR event filters that omit synchronize', () => {
    const ci=copy(); ci.on.pull_request.types=['opened']; expect(() => validateWorkflow(ci)).toThrow();
  });
  it('rejects a conditional validation job that skips PRs', () => {
    const ci=copy(); ci.jobs['pruebas-integracion'].if="github.event_name == 'push'"; expect(() => validateWorkflow(ci)).toThrow();
  });
  it('rejects conditional validation steps that skip tests', () => {
    const ci=copy(); ci.jobs['pruebas-unitarias'].steps.at(-1).if="github.ref == 'refs/heads/main'"; expect(() => validateWorkflow(ci)).toThrow();
  });
  it('rejects unstable branch protection check names', () => {
    const ci=copy(); ci.jobs.empaquetado.name='Build '+Date.now(); expect(() => validateWorkflow(ci)).toThrow();
  });
  it('rejects an audit failure configured as non-blocking', () => {
    const ci=copy(); ci.jobs.vulnerabilidades.steps.at(-1)['continue-on-error']=true; expect(() => validateWorkflow(ci)).toThrow();
  });
  it('rejects omitting audit from packaging dependencies', () => {
    const ci=copy(); ci.jobs.empaquetado.needs=ci.jobs.empaquetado.needs.filter(name=>name!=='vulnerabilidades'); expect(() => validateWorkflow(ci)).toThrow();
  });
  it('rejects giving package write permission to validation jobs', () => {
    const ci=copy(); ci.jobs['pruebas-unitarias'].permissions={contents:'read',packages:'write'}; expect(() => validateWorkflow(ci)).toThrow();
  });
  it('rejects publication permission at workflow level', () => {
    const ci=copy(); ci.permissions.packages='write'; expect(() => validateWorkflow(ci)).toThrow();
  });
  it('rejects publishing via manual dispatch or an unconditional bypass', () => {
    for(const suffix of [" || true", " || github.event_name == 'workflow_dispatch'"]) {
      const ci=copy(); ci.jobs.publicar.if+=suffix; expect(() => validateWorkflow(ci)).toThrow();
    }
  });
  it('rejects publication from develop', () => {
    const ci=copy(); ci.jobs.publicar.if=ci.jobs.publicar.if.replace('refs/heads/main','refs/heads/develop'); expect(() => validateWorkflow(ci)).toThrow();
  });
  it('rejects publisher that does not depend on successful packaging', () => {
    const ci=copy(); ci.jobs.publicar.needs=[]; expect(() => validateWorkflow(ci)).toThrow();
  });
  it('rejects unpinned actions', () => {
    const ci=copy(); ci.jobs.empaquetado.steps[0].uses='actions/checkout@main'; expect(() => validateWorkflow(ci)).toThrow();
  });
  it('rejects image publication during the PR packaging job', () => {
    const ci=copy(); ci.jobs.empaquetado.steps.find(step=>step.with?.push===false).with.push=true; expect(() => validateWorkflow(ci)).toThrow();
  });
});
