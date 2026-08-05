import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const manifestUrl = new URL('../src/manifest.webmanifest', import.meta.url);
const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));

test('PWA 导航字段全部使用相对路径，可同时部署到根目录和 beta 子目录', () => {
  assert.equal(manifest.id, './');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
});

test('PWA 图标均为存在的相对本地文件', async () => {
  assert.ok(manifest.icons.length >= 2);
  for (const icon of manifest.icons) {
    assert.match(icon.src, /^\.\//);
    await access(new URL(icon.src, manifestUrl));
  }
});

test('PWA 使用独立应用显示且保留中文角色信息', () => {
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.lang, 'zh-CN');
  assert.match(manifest.name, /踉踉跄跄/);
});
