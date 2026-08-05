import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const warnings = [];

function fail(message) {
  errors.push(message);
}

function warn(message) {
  warnings.push(message);
}

function read(path) {
  return readFileSync(join(root, path), 'utf8');
}

function json(path) {
  try {
    return JSON.parse(read(path));
  } catch (error) {
    fail(`${path} 不是有效 JSON：${error.message}`);
    return {};
  }
}

function walk(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function checkJavaScript() {
  const files = [join(root, 'src'), join(root, 'scripts'), join(root, 'tests')]
    .flatMap(walk)
    .filter(path => ['.js', '.mjs'].includes(extname(path)));

  for (const file of files) {
    const result = spawnSync(process.execPath, ['--input-type=module', '--check'], {
      input: readFileSync(file, 'utf8'),
      encoding: 'utf8'
    });
    if (result.status !== 0) {
      fail(`${relative(root, file)} JavaScript 语法错误：${(result.stderr || result.stdout).trim()}`);
    }
  }
}

function checkVersions() {
  const packageJson = json('package.json');
  const tauriConfig = json('src-tauri/tauri.conf.json');
  const serviceWorker = read('src/service-worker.js');
  const cargoToml = read('src-tauri/Cargo.toml');
  const swVersion = serviceWorker.match(/const APP_VERSION = '([^']+)'/)?.[1];
  const cargoVersion = cargoToml.match(/\[package\][\s\S]*?\nversion\s*=\s*"([^"]+)"/)?.[1];

  for (const [label, version] of [
    ['Service Worker', swVersion],
    ['Tauri', tauriConfig.version],
    ['Cargo', cargoVersion]
  ]) {
    if (version !== packageJson.version) {
      fail(`${label} 版本 ${version ?? '缺失'} 与 package.json ${packageJson.version} 不一致`);
    }
  }

  if (!existsSync(join(root, 'src-tauri', 'Cargo.lock'))) {
    warn('尚未提交 src-tauri/Cargo.lock；首次云构建会生成并上传它，正式 Release 前必须放回原路径提交');
  }
}

function checkLocalReferences() {
  const indexPath = join(root, 'src', 'index.html');
  const html = readFileSync(indexPath, 'utf8');
  if (!html.includes('id="scale-percent" type="range" min="10" max="200" step="10"')) {
    fail('缩放滑块必须保持 10%–200%、步进 10% 的范围');
  }
  const references = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map(match => match[1]);

  for (const reference of references) {
    if (/^(?:https?:|data:|#)/.test(reference)) continue;
    const cleanPath = decodeURIComponent(reference.split(/[?#]/, 1)[0]);
    if (!existsSync(resolve(dirname(indexPath), cleanPath))) {
      fail(`src/index.html 引用了不存在的文件：${reference}`);
    }
  }

  const manifest = json('src/manifest.webmanifest');
  for (const field of ['id', 'start_url', 'scope']) {
    if (typeof manifest[field] !== 'string' || !manifest[field].startsWith('./')) {
      fail(`manifest.webmanifest 的 ${field} 必须使用 ./ 相对路径`);
    }
  }
  for (const icon of manifest.icons || []) {
    if (!icon.src?.startsWith('./')) fail(`PWA 图标必须使用 ./ 相对路径：${icon.src}`);
    if (!existsSync(resolve(root, 'src', icon.src || ''))) fail(`PWA 图标不存在：${icon.src}`);
  }

  const serviceWorker = read('src/service-worker.js');
  const appShell = serviceWorker.match(/const APP_SHELL = \[([\s\S]*?)\];/)?.[1] || '';
  const shellFiles = [...appShell.matchAll(/'([^']+)'/g)].map(match => match[1]);
  for (const shellFile of shellFiles) {
    if (!shellFile.startsWith('./')) fail(`Service Worker 预缓存路径必须以 ./ 开头：${shellFile}`);
    if (shellFile === './') continue;
    if (!existsSync(resolve(root, 'src', shellFile))) fail(`Service Worker 预缓存文件不存在：${shellFile}`);
  }

  const sourceFiles = walk(join(root, 'src'));
  const shellSet = new Set(shellFiles);
  for (const file of sourceFiles) {
    const runtimePath = relative(join(root, 'src'), file).replaceAll('\\', '/');
    if (runtimePath === 'service-worker.js') continue;
    if (!shellSet.has(`./${runtimePath}`)) {
      fail(`Service Worker 未预缓存实际网页资源：./${runtimePath}`);
    }
  }

  for (const file of sourceFiles.filter(path => extname(path) === '.js')) {
    const source = readFileSync(file, 'utf8');
    const imports = [...source.matchAll(/(?:from\s+|import\s*)["'](\.[^"']+)["']/g)]
      .map(match => match[1]);
    for (const imported of imports) {
      if (!existsSync(resolve(dirname(file), imported))) {
        fail(`${relative(root, file)} 导入了不存在的模块：${imported}`);
      }
    }
  }

  for (const file of sourceFiles.filter(path => extname(path) === '.css')) {
    const source = readFileSync(file, 'utf8');
    const urls = [...source.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)].map(match => match[1]);
    for (const url of urls) {
      if (/^(?:https?:|data:|#)/.test(url)) continue;
      if (!existsSync(resolve(dirname(file), url))) {
        fail(`${relative(root, file)} 引用了不存在的资源：${url}`);
      }
    }
  }
}

function checkWorkflows() {
  const workflowDirectory = join(root, '.github', 'workflows');
  const required = ['validate.yml', 'publish-mobile.yml', 'build-windows.yml', 'release.yml'];
  const files = existsSync(workflowDirectory)
    ? readdirSync(workflowDirectory, { withFileTypes: true }).filter(entry => entry.isFile()).map(entry => entry.name)
    : [];

  for (const name of required) {
    if (!files.includes(name)) fail(`缺少工作流 .github/workflows/${name}`);
  }
  for (const name of files.filter(name => /\.ya?ml$/i.test(name))) {
    const source = read(`.github/workflows/${name}`);
    if (source.includes('\t')) fail(`工作流 ${name} 含制表符，YAML 必须使用空格缩进`);
    for (const key of ['name:', 'on:', 'jobs:']) {
      if (!source.includes(key)) fail(`工作流 ${name} 缺少 ${key}`);
    }
  }

  const contracts = {
    'validate.yml': [
      'npm run validate',
      'cargo fmt',
      'cargo check --manifest-path src-tauri/Cargo.toml --locked'
    ],
    'publish-mobile.yml': [
      'git archive v0.1.0 src',
      '.pages/beta',
      '预发布版本 $version 不能覆盖手机版正式根路径'
    ],
    'build-windows.yml': [
      'workflow_call:',
      'generated-cargo-lock',
      'bundle/nsis/*.exe',
      'SHA256SUMS.txt'
    ],
    'release.yml': [
      'src-tauri/Cargo.lock',
      'needs: preflight',
      'uses: ./.github/workflows/build-windows.yml',
      '--prerelease'
    ]
  };
  for (const [name, requiredText] of Object.entries(contracts)) {
    if (!files.includes(name)) continue;
    const source = read(`.github/workflows/${name}`);
    for (const text of requiredText) {
      if (!source.includes(text)) fail(`工作流 ${name} 缺少发布保护：${text}`);
    }
  }
}

function checkRhythm() {
  const tokens = read('src/css/tokens.css');
  const audioManager = read('src/js/audio-manager.js');
  const beatMs = audioManager.match(/MUYU_BEAT_MS\s*=\s*(\d+)/)?.[1];
  const cssBeat = tokens.match(/--muyu-beat:\s*([0-9.]+)s/)?.[1];
  if (!beatMs || !cssBeat) {
    fail('节拍校验：缺少 js/audio-manager.js 的 MUYU_BEAT_MS 或 css/tokens.css 的 --muyu-beat');
    return;
  }
  const cssMs = Math.round(Number(cssBeat) * 1000);
  if (cssMs !== Number(beatMs)) {
    fail(`节拍不一致：js/audio-manager.js 的 MUYU_BEAT_MS=${beatMs}ms 与 css/tokens.css 的 --muyu-beat=${cssBeat}s（${cssMs}ms）不匹配`);
  }
  const strikeOffset = audioManager.match(/MUYU_STRIKE_OFFSET_MS\s*=\s*(\d+)/)?.[1];
  if (strikeOffset && Number(beatMs) > 0) {
    const percent = Math.round((Number(strikeOffset) / Number(beatMs)) * 100);
    if (percent !== 38) {
      fail(`节拍校验：MUYU_STRIKE_OFFSET_MS=${strikeOffset}ms 占节拍的 ${percent}%，应与 muyu-mallet 的触击关键帧 38% 一致`);
    }
  }
}

checkJavaScript();
checkVersions();
checkLocalReferences();
checkRhythm();
checkWorkflows();

if (warnings.length > 0) console.warn(warnings.map(warning => `警告：${warning}`).join('\n'));

if (errors.length > 0) {
  console.error(errors.map(error => `- ${error}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log('静态检查通过：JavaScript、JSON、版本、PWA 路径和工作流结构均有效。');
}
