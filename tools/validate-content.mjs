import assert from 'node:assert/strict';
import { QUIZ_BANK } from '../src/js/quiz-bank.js';
import { STORY_BANK } from '../src/js/story-bank.js';

assert.ok(QUIZ_BANK.length >= 1000, '题库必须至少 1000 题');
assert.equal(new Set(QUIZ_BANK.map(item => item.id)).size, QUIZ_BANK.length, '题目 id 必须唯一');
for (const item of QUIZ_BANK) {
  assert.ok(item.question && item.explanation && item.source && item.license && item.sourceUrl);
  assert.ok(item.options.length >= 3 && item.options.length <= 4);
  assert.ok(Number.isInteger(item.answerIndex) && item.answerIndex < item.options.length);
}
assert.ok(STORY_BANK.length >= 100, '故事必须至少 100 篇');
assert.equal(new Set(STORY_BANK.map(item => item.id)).size, STORY_BANK.length, '故事 id 必须唯一');
console.log(`内容校验通过：${QUIZ_BANK.length} 题，${STORY_BANK.length} 篇故事。`);
