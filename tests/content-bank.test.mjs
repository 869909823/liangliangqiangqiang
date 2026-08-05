import assert from 'node:assert/strict';
import test from 'node:test';
import { QUIZ_BANK } from '../src/js/quiz-bank.js';
import { STORY_BANK } from '../src/js/story-bank.js';

test('题库至少 1000 题，且 id 与题干、解析各自唯一', () => {
  assert.ok(QUIZ_BANK.length >= 1000, `题库只有 ${QUIZ_BANK.length} 题`);
  assert.equal(new Set(QUIZ_BANK.map(item => item.id)).size, QUIZ_BANK.length, 'id 必须唯一');
  assert.equal(new Set(QUIZ_BANK.map(item => item.question)).size, QUIZ_BANK.length, '题干必须唯一');
  assert.equal(new Set(QUIZ_BANK.map(item => item.explanation)).size, QUIZ_BANK.length, '解析必须唯一');
});

test('每题选项 3-4 项且互不相同，答案索引合法', () => {
  for (const item of QUIZ_BANK) {
    assert.ok(item.options.length >= 3 && item.options.length <= 4, `${item.id} 选项数非法`);
    assert.equal(new Set(item.options).size, item.options.length, `${item.id} 选项重复`);
    assert.ok(
      Number.isInteger(item.answerIndex) && item.answerIndex >= 0 && item.answerIndex < item.options.length,
      `${item.id} 答案索引非法`
    );
  }
});

test('所有文案不含 < > & 等内联渲染风险字符', () => {
  for (const item of QUIZ_BANK) {
    const text = item.question + item.explanation + item.options.join('');
    assert.ok(!/[<>&]/.test(text), `${item.id} 含风险字符`);
  }
});

test('覆盖至少 10 个领域，且带来源与许可字段', () => {
  assert.ok(new Set(QUIZ_BANK.map(item => item.category)).size >= 10, '领域覆盖不足');
  for (const item of QUIZ_BANK) {
    assert.ok(item.source && item.license && item.sourceUrl, `${item.id} 缺少来源字段`);
  }
});

test('故事至少 100 篇，标题与正文各自唯一', () => {
  assert.ok(STORY_BANK.length >= 100, `故事只有 ${STORY_BANK.length} 篇`);
  assert.equal(new Set(STORY_BANK.map(item => item.id)).size, STORY_BANK.length, '故事 id 必须唯一');
  assert.equal(new Set(STORY_BANK.map(item => item.title)).size, STORY_BANK.length, '故事标题必须唯一');
  assert.equal(new Set(STORY_BANK.map(item => item.text)).size, STORY_BANK.length, '故事正文必须唯一');
});

test('每篇故事篇幅不少于 40 字', () => {
  for (const story of STORY_BANK) {
    assert.ok(story.text.length >= 40, `${story.title} 只有 ${story.text.length} 字`);
  }
});
