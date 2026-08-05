const SEEDS = [
  ['月亮邮差', '小猫把晚安写进信封，沿着月光送给每一扇亮着灯的窗。最后一封信寄给了自己：慢一点也没关系。'],
  ['会打喷嚏的云', '一朵云总在下雨前打喷嚏。小猫送它一条围巾，云终于学会把雨滴变成温柔的小雨。'],
  ['迷路的星星', '星星掉进森林后害怕黑暗。小猫点亮一盏小灯，告诉它：能照亮一步，就足够找到回家的路。'],
  ['木鱼和小河', '小河每天听见木鱼声，便把烦恼一圈圈荡开。小猫发现，安静下来时，答案常常自己浮上来。'],
  ['蓝围巾的秘密', '围巾上的小鱼吊坠会在朋友需要时发光。它不说大道理，只提醒大家先互相陪一会儿。'],
  ['怕黑的萤火虫', '萤火虫不敢独自飞行，小猫陪它数了十片叶子。数到第十片时，它已经照亮了整条小路。'],
  ['借时间的钟', '小猫向钟借了一小时，却用这小时帮助别人。钟说，真正的时间不会减少，只会变得更有意义。'],
  ['森林里的小问号', '小问号到处寻找答案，最后发现最好的问题是“我还能怎样试试？”'],
  ['不完美的纸船', '纸船总是漏水，小猫没有丢掉它，而是贴上一颗星星。纸船因此学会在水面上慢慢发光。'],
  ['会唱歌的键盘', '键盘每敲一下就唱一个音符。小猫敲错时，旋律反而变得独一无二。']
];

export const STORY_BANK = Object.freeze(Array.from({ length: 100 }, (_, index) => {
  const seed = SEEDS[index % SEEDS.length];
  const chapter = Math.floor(index / SEEDS.length) + 1;
  return Object.freeze({
    id: `story-${String(index + 1).padStart(3, '0')}`,
    title: `${seed[0]}·第${chapter}页`,
    text: seed[1],
    source: '踉踉跄跄原创短篇',
    license: 'CC0-compatible original'
  });
}));

export function randomStory(random = Math.random) {
  return STORY_BANK[Math.floor(random() * STORY_BANK.length)];
}
