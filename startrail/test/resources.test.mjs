import assert from 'node:assert/strict';
import test from 'node:test';
import { auditCases, caseTarget, categoryOf, gateWorkResults, styleSignature } from '../src/library/resources.js';
import { normalizeTaskInput } from '../src/core/modes.js';

test('工作资源规则：数量、分类隔离、拼图门槛和交付闸门', () => {
  assert.equal(caseTarget({}), 50);
  assert.equal(caseTarget({ brief: '找20个案例' }), 20);
  assert.equal(caseTarget({ case_target: 100 }), 100);
  for (const n of [19, 101, 50.5, NaN]) assert.throws(() => caseTarget({ case_target: n }));
  assert.equal(categoryOf({ brief: '拼图' }), 'collage');
  assert.equal(categoryOf({ resource_category: 'makeup', brief: '拼图' }), 'makeup');
  assert.equal(styleSignature({ slots: '2' }), null);
  const task = { id: 'batch-a', mode: 'work', resource_category: 'collage', case_target: 50 };
  const rows = Array.from({ length: 50 }, (_, i) => ({
    id: `case-${i}`, resource_category: 'collage', platform_post_id: `post-${i}`, canonical_url: `https://example.org/${i}`,
    media_index: 1, platform: i % 2 ? 'A' : 'B', region: i % 2 ? '中国' : '美国', full_post_review_complete: true,
    reviewed_count: 3, total_media: 3, person_visible: true, designed_composition: true, plain_grid: false,
    style_signature: `layout-${i}`, media_sha256: `hash-${i}`,
  }));
  assert.equal(auditCases(rows, task).ok, true);
  for (const patch of [{ person_visible: false }, { plain_grid: true }, { reviewed_count: 2 }, { resource_category: 'makeup' }, { style_signature: null }]) {
    const bad = structuredClone(rows);
    Object.assign(bad[0], patch);
    assert.equal(auditCases(bad, task).ok, false);
  }
  assert.equal(auditCases(rows, task, [{ ...rows[0], seen: true }]).ok, false);
  assert.equal(auditCases(rows, task, [{ ...rows[0], resource_category: 'makeup' }]).ok, true);
  assert.equal(auditCases(rows, task, [{ resource_category: 'collage', cases: [rows[0]] }]).ok, false);
  assert.equal(auditCases(rows.slice(1), task).ok, false);
  const same = structuredClone(rows);
  same[1].style_signature = same[0].style_signature;
  assert.equal(auditCases(same, task).ok, false);
  const samePhoto = structuredClone(rows);
  samePhoto[1].media_sha256 = samePhoto[0].media_sha256;
  assert.equal(auditCases(samePhoto, task).ok, false);
  const noCases = { tasks: [{ ...task, results: [{ status: 'available' }] }] };
  gateWorkResults(noCases);
  assert.equal(noCases.tasks[0].results[0].status, 'needs_review');
  const valid = { tasks: [{ ...task, resource_cases: rows, results: [{ status: 'available' }] }] };
  gateWorkResults(valid, { collage: [{ ...rows[0], batch_id: 'batch-a' }] });
  assert.equal(valid.tasks[0].results[0].status, 'available');
  const normalized = normalizeTaskInput({ topic: '美妆趋势', mode: 'work', resourceCategory: 'makeup', caseTarget: 20, engine: 'model' });
  assert.equal(normalized.resourceCategory, 'makeup');
  assert.equal(normalized.caseTarget, 20);
  assert.equal(normalized.engine, 'model');
  assert.equal(normalized.direction, 'hotspot');
  assert.throws(() => normalizeTaskInput({ topic: '拼图', mode: 'work', caseTarget: 19 }));
});
