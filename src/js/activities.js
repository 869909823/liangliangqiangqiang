// 摸鱼玩法注册表：新增玩法（如地理图鉴）只需在此追加一条，
// 再补 index.html 的按钮/卡片与 css/animations.css 的动画。
export const ACTIVITIES = Object.freeze([
  Object.freeze({ id: 'fishing', label: '钓鱼', kind: 'scene' }),
  Object.freeze({ id: 'muyu', label: '敲木鱼', kind: 'scene' }),
  Object.freeze({ id: 'quiz', label: '十万个为什么', kind: 'card', cardId: 'quiz-card' }),
  Object.freeze({ id: 'story', label: '童话小故事', kind: 'card', cardId: 'story-card' })
]);

export const ACTIVITY_STATES = Object.freeze(ACTIVITIES.map(activity => activity.id));

export function activityById(id) {
  return ACTIVITIES.find(activity => activity.id === id) || null;
}
