import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { ACTIVITIES, ACTIVITY_STATES, activityById } from '../src/js/activities.js';
import { MAIN_STATES } from '../src/js/state-machine.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('每个玩法在 index.html 都有对应状态按钮', () => {
  const html = readFileSync(join(root, 'src', 'index.html'), 'utf8');
  for (const activity of ACTIVITIES) {
    assert.ok(html.includes(`data-state="${activity.id}"`), `${activity.id} 缺少按钮`);
  }
});

test('状态机主状态尾部等于玩法状态，防止新增玩法漏接', () => {
  assert.deepEqual(MAIN_STATES.slice(-ACTIVITY_STATES.length), [...ACTIVITY_STATES]);
});

test('玩法注册表查询：已知返回条目，未知返回 null', () => {
  assert.equal(activityById('muyu')?.label, '敲木鱼');
  assert.equal(activityById('fishing')?.kind, 'scene');
  assert.equal(activityById('quiz')?.cardId, 'quiz-card');
  assert.equal(activityById('geography'), null);
});
