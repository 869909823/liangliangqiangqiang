const pet = document.querySelector('#pet');
const cat = document.querySelector('#cat');
const bubble = document.querySelector('#bubble');
const controls = document.querySelector('#controls');
const menuToggle = document.querySelector('#menu-toggle');
const autoModeButton = document.querySelector('#auto-mode');
const stateButtons = [...document.querySelectorAll('[data-state]')];

const states = {
  idle: ['慢一点也没关系。', '今天也陪你一起。', '尾巴有自己的想法。'],
  working: ['认真工作中！', '这行代码闻起来很重要。'],
  thinking: ['让我想想……', '答案是不是藏在这里？'],
  error: ['哎呀，先喝杯修复 bug 茶。', '踉跄一下，再试一次。'],
  complete: ['任务完成！差点摔倒，但完成了！', '完成啦——站稳，站稳。'],
  sleeping: ['Zzz…', '就眯一小会儿……']
};

let currentState = 'idle';
let pointerStart = null;
let dragged = false;
let autoTimer = null;
let autoIndex = 0;
const autoSequence = ['idle', 'thinking', 'working', 'idle', 'sleeping', 'complete'];

function randomLine(state = currentState) {
  const lines = states[state];
  return lines[Math.floor(Math.random() * lines.length)];
}

function setState(state, announce = true) {
  if (!states[state]) return;
  pet.classList.remove(`state-${currentState}`);
  currentState = state;
  pet.classList.add(`state-${state}`);
  stateButtons.forEach(button => button.classList.toggle('active', button.dataset.state === state));
  if (announce) bubble.textContent = randomLine(state);
}

function stopAutoMode() {
  clearInterval(autoTimer);
  autoTimer = null;
  autoModeButton.classList.remove('active');
}

function getTauriWindow() {
  return window.__TAURI__?.window?.getCurrentWindow?.();
}

cat.addEventListener('pointerdown', event => {
  pointerStart = { x: event.clientX, y: event.clientY };
  dragged = false;
});

cat.addEventListener('pointermove', async event => {
  if (!pointerStart || dragged) return;
  if (Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) < 5) return;
  dragged = true;
  try { await getTauriWindow()?.startDragging(); } catch (error) { console.warn('无法拖动窗口', error); }
});

cat.addEventListener('pointerup', () => { pointerStart = null; });
cat.addEventListener('pointercancel', () => { pointerStart = null; });

cat.addEventListener('click', () => {
  if (dragged) return;
  bubble.textContent = Math.random() > .45 ? '我来试试——哎呀！' : randomLine();
  cat.classList.remove('reacting');
  void cat.offsetWidth;
  cat.classList.add('reacting');
  setTimeout(() => cat.classList.remove('reacting'), 600);
});

cat.addEventListener('contextmenu', event => {
  event.preventDefault();
  bubble.classList.toggle('hidden');
});

menuToggle.addEventListener('click', () => {
  const open = controls.classList.toggle('open');
  menuToggle.setAttribute('aria-expanded', String(open));
});

stateButtons.forEach(button => button.addEventListener('click', () => {
  stopAutoMode();
  setState(button.dataset.state);
  controls.classList.remove('open');
  menuToggle.setAttribute('aria-expanded', 'false');
}));

autoModeButton.addEventListener('click', () => {
  if (autoTimer) {
    stopAutoMode();
    return;
  }
  autoModeButton.classList.add('active');
  autoIndex = 0;
  setState(autoSequence[autoIndex]);
  autoTimer = setInterval(() => {
    autoIndex = (autoIndex + 1) % autoSequence.length;
    setState(autoSequence[autoIndex]);
  }, 5000);
});

window.addEventListener('message', event => {
  if (event.data?.type === 'pet:set-state') setState(event.data.state);
});

setState('idle', false);

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('./service-worker.js').catch(error => {
    console.warn('离线模式注册失败', error);
  });
}
