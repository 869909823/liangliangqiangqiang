import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../src/service-worker.js', import.meta.url), 'utf8');

class MemoryCache {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.entries = new Map();
  }

  key(request) {
    return new URL(typeof request === 'string' ? request : request.url, this.baseUrl).href;
  }

  async addAll(requests) {
    for (const request of requests) {
      this.entries.set(this.key(request), new Response(`cached:${request}`));
    }
  }

  async match(request) {
    return this.entries.get(this.key(request))?.clone();
  }

  async put(request, response) {
    this.entries.set(this.key(request), response.clone());
  }
}

class MemoryCacheStorage {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.stores = new Map();
  }

  async open(name) {
    if (!this.stores.has(name)) this.stores.set(name, new MemoryCache(this.baseUrl));
    return this.stores.get(name);
  }

  async keys() {
    return [...this.stores.keys()];
  }

  async delete(name) {
    return this.stores.delete(name);
  }
}

function createRuntime(scope = 'https://example.test/liangliangqiangqiang/beta/', hasActiveWorker = false) {
  const listeners = new Map();
  const messages = [];
  const cacheStorage = new MemoryCacheStorage(scope);
  let fetchCalls = 0;
  let fetchImplementation = async () => new Response('network');
  let skippedWaiting = false;
  let claimedClients = false;

  const self = {
    registration: { scope, active: hasActiveWorker ? {} : null },
    location: new URL('service-worker.js', scope),
    addEventListener(type, listener) { listeners.set(type, listener); },
    skipWaiting() { skippedWaiting = true; },
    clients: {
      async claim() { claimedClients = true; },
      async matchAll() { return [{ postMessage(message) { messages.push(message); } }]; }
    }
  };

  vm.runInNewContext(source, {
    self,
    caches: cacheStorage,
    fetch: (...args) => {
      fetchCalls += 1;
      return fetchImplementation(...args);
    },
    URL,
    Request,
    Response,
    Headers,
    console
  }, { filename: 'service-worker.js' });

  async function dispatchLifecycle(type) {
    let pending;
    listeners.get(type)({ waitUntil(promise) { pending = promise; } });
    await pending;
  }

  async function dispatchFetch(request) {
    let response;
    listeners.get('fetch')({
      request,
      respondWith(promise) { response = Promise.resolve(promise); }
    });
    return response || null;
  }


  function dispatchMessage(data) {
    listeners.get('message')({ data });
  }

  return {
    caches: cacheStorage,
    messages,
    dispatchLifecycle,
    dispatchFetch,
    dispatchMessage,
    setFetch(implementation) { fetchImplementation = implementation; },
    get fetchCalls() { return fetchCalls; },
    get skippedWaiting() { return skippedWaiting; },
    get claimedClients() { return claimedClients; }
  };
}

function cachePrefix(scope) {
  return `liangliangqiangqiang-pwa-${encodeURIComponent(new URL(scope).pathname)}-`;
}

test('首次安装时只用当前 beta scope 的相对路径预缓存应用外壳', async () => {
  const scope = 'https://example.test/repository/beta/';
  const runtime = createRuntime(scope);
  await runtime.dispatchLifecycle('install');

  assert.equal(runtime.skippedWaiting, false);
  assert.equal(runtime.messages.length, 0);
  const [cacheName] = await runtime.caches.keys();
  assert.equal(cacheName, `${cachePrefix(scope)}0.2.0-beta.1`);
  const cache = await runtime.caches.open(cacheName);
  assert.ok(cache.entries.has(`${scope}index.html`));
  assert.ok(cache.entries.has(`${scope}icons/icon-192.png`));
  assert.equal(cache.entries.has('https://example.test/index.html'), false);
});

test('更新安装完成后提示刷新，收到明确指令才跳过等待', async () => {
  const scope = 'https://example.test/repository/beta/';
  const runtime = createRuntime(scope, true);

  await runtime.dispatchLifecycle('install');

  assert.equal(runtime.messages.length, 1);
  assert.equal(runtime.messages[0].type, 'pwa:update-available');
  assert.equal(runtime.messages[0].version, '0.2.0-beta.1');
  assert.equal(runtime.skippedWaiting, false);
  runtime.dispatchMessage({ type: 'SKIP_WAITING' });
  assert.equal(runtime.skippedWaiting, true);
});

test('激活时只清理同一 scope 的旧缓存', async () => {
  const scope = 'https://example.test/repository/beta/';
  const runtime = createRuntime(scope);
  const prefix = cachePrefix(scope);
  const stableCache = 'liangliangqiangqiang-pwa-%2Frepository%2F-0.1.0';
  const legacyCache = 'liangliangqiangqiang-v1';
  await runtime.caches.open(`${prefix}0.2.0-beta.0`);
  await runtime.caches.open(`${prefix}0.2.0-beta.1`);
  await runtime.caches.open(stableCache);
  await runtime.caches.open(legacyCache);

  await runtime.dispatchLifecycle('activate');

  assert.equal(runtime.claimedClients, true);
  assert.deepEqual(
    (await runtime.caches.keys()).sort(),
    [`${prefix}0.2.0-beta.1`, stableCache, legacyCache].sort()
  );
  assert.equal(runtime.messages.length, 0);
});

test('正式根路径升级后清理 V1 遗留缓存', async () => {
  const scope = 'https://example.test/repository/';
  const runtime = createRuntime(scope);
  await runtime.caches.open('liangliangqiangqiang-v1');

  await runtime.dispatchLifecycle('activate');

  assert.equal((await runtime.caches.keys()).includes('liangliangqiangqiang-v1'), false);
});

test('HTML 使用 network-first，并把成功响应写入当前版本缓存', async () => {
  const scope = 'https://example.test/repository/beta/';
  const runtime = createRuntime(scope);
  await runtime.dispatchLifecycle('install');
  runtime.setFetch(async () => new Response('fresh-html', {
    headers: { 'content-type': 'text/html' }
  }));
  const request = new Request(`${scope}index.html`, {
    headers: { accept: 'text/html' }
  });

  const response = await runtime.dispatchFetch(request);

  assert.equal(await response.text(), 'fresh-html');
  assert.equal(runtime.fetchCalls, 1);
  const [cacheName] = await runtime.caches.keys();
  assert.equal(await (await runtime.caches.open(cacheName)).match(request).then(item => item.text()), 'fresh-html');
});

test('HTML 离线时回退到已缓存页面', async () => {
  const scope = 'https://example.test/repository/beta/';
  const runtime = createRuntime(scope);
  await runtime.dispatchLifecycle('install');
  runtime.setFetch(async () => { throw new Error('offline'); });
  const request = new Request(`${scope}index.html`, {
    headers: { accept: 'text/html' }
  });

  const response = await runtime.dispatchFetch(request);

  assert.equal(await response.text(), 'cached:./index.html');
});

test('静态资源使用 cache-first，命中缓存时不访问网络', async () => {
  const scope = 'https://example.test/repository/beta/';
  const runtime = createRuntime(scope);
  await runtime.dispatchLifecycle('install');
  const response = await runtime.dispatchFetch(new Request(`${scope}styles.css`));

  assert.equal(await response.text(), 'cached:./styles.css');
  assert.equal(runtime.fetchCalls, 0);
});

test('不拦截 scope 外的请求', async () => {
  const runtime = createRuntime();
  const response = await runtime.dispatchFetch(new Request('https://api.github.com/repos/example/releases'));
  assert.equal(response, null);
  assert.equal(runtime.fetchCalls, 0);
});
