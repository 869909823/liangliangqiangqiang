export const DIALOGUES = Object.freeze({
  idle: [
    '慢一点也没关系。',
    '今天也陪你一起。',
    '尾巴有自己的想法。'
  ],
  working: [
    '认真工作中！',
    '这行代码闻起来很重要。'
  ],
  thinking: [
    '让我想想……',
    '答案是不是藏在这里？'
  ],
  error: [
    '哎呀，先喝杯修复 bug 茶。',
    '踉跄一下，再试一次。'
  ],
  complete: [
    '任务完成！差点摔倒，但完成了！',
    '完成啦——站稳，站稳。'
  ],
  sleeping: [
    'Zzz……',
    '就眯一小会儿……'
  ],
  fishing: [
    '鱼钩放好了，先安静陪你一会儿。',
    '嘘——这条鱼快上钩了。',
    '摸鱼也是一种专注。'
  ],
  muyu: [
    '功德 +1，bug -1。',
    '我没有摸鱼，我在积攒功德。',
    '再敲一下就开始工作。'
  ],
  quiz: ['来做一道小题吧！', '选一个你觉得正确的答案。'],
  story: ['给你讲个小故事。', '坐稳啦，故事开始了。']
});

export const AMBIENT_DIALOGUES = Object.freeze({
  stretch: '伸个懒腰，再陪你一会儿。',
  yawn: '哈欠只是短暂加载。',
  snack: '小鱼干补充完成。',
  peek: '我只是看看你有没有累。',
  clickReaction: '我来试试——哎呀！'
});

export function randomDialogue(state, random = Math.random) {
  const lines = DIALOGUES[state] || DIALOGUES.idle;
  return lines[Math.floor(random() * lines.length)];
}
