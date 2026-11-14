import fs from 'node:fs';
import {createHash} from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
const read=path=>fs.readFileSync(path,'utf8');
const config=JSON.parse(read('src-tauri/tauri.conf.json'));
test('release version agrees across npm Rust lockfiles and Tauri',()=>{
  const pkg=JSON.parse(read('package.json')),lock=JSON.parse(read('package-lock.json'));
  assert.equal(config.version,pkg.version);assert.equal(lock.version,pkg.version);assert.equal(lock.packages[''].version,pkg.version);
  assert.equal(read('src-tauri/Cargo.toml').match(/^version = "([^"]+)"/m)[1],pkg.version);
  assert.equal(read('src-tauri/Cargo.lock').match(/name = "keye-desktop"\r?\nversion = "([^"]+)"/)[1],pkg.version);
});
test('brand rename preserves data identity and the original update trust chain',()=>{
  assert.equal(config.productName,'华工课栈');assert.equal(config.identifier,'io.github.goooseby.keye.desktop');
  assert.deepEqual(config.plugins.updater.endpoints,['https://github.com/goooseby/keye-desktop/releases/latest/download/latest.json']);
  assert.equal(createHash('sha256').update(config.plugins.updater.pubkey).digest('hex'),'3ea979f95135c375fec7278a67e96dfdd6a4871d33e07588f25cbacef135d2d2');
});
test('installer uses the pinned upstream template with only two legacy registry identities changed',()=>{
  let source=read('src-tauri/windows/installer.nsi').split('\n').slice(4).join('\n');
  source=source.replace('!define UNINSTKEY "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\课页"','!define UNINSTKEY "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\'+ '$'+'{PRODUCTNAME}"');
  source=source.replace('!define MANUPRODUCTKEY "'+'$'+'{MANUKEY}\\课页"','!define MANUPRODUCTKEY "'+'$'+'{MANUKEY}\\'+'$'+'{PRODUCTNAME}"');
  assert.equal(createHash('sha256').update(source).digest('hex'),'20f4ecc730defb71f1342eaeaec4021df13be3d843abba0effe88ea5835fa079');
  assert.equal(JSON.parse(read('node_modules/@tauri-apps/cli/package.json')).version,'2.11.5','Review template compatibility when upgrading the bundler');
});
