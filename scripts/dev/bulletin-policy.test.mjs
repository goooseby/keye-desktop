import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context=vm.createContext({});vm.runInContext(fs.readFileSync('public/workbench/bulletins.js','utf8'),context);
const policy=vm.runInContext('WorkbenchBulletinPolicy',context);
const general={key:'general:1',kind:'general',title:'提示',publishedAt:'2026-11-01T00:00:00Z',remindAfter:0};
const update={key:'release:0.6.0',kind:'update',version:'0.6.0',publishedAt:'2026-10-01T00:00:00Z',remindAfter:0};
const options={current:'0.5.0',now:1000};
test('updates take priority over general announcements in one shared prompt',()=>assert.equal(policy.next([general,update],options).key,update.key));
test('read expired snoozed and already-installed updates do not interrupt',()=>{
  for(const item of [{...general,read:true},{...general,expired:true},{...general,remindAfter:2000},{...update,version:'0.5.0'}])assert.equal(policy.next([item],options),undefined);
});
test('ignored update stays in inbox while general announcements can still prompt',()=>{
  assert.equal(policy.next([general,update],{...options,preferences:{ignoredVersion:'0.6.0'}}).key,general.key);
  assert.equal(policy.unread(update,'0.5.0'),true);
});
test('update and announcement automatic reminder preferences are independent',()=>{
  assert.equal(policy.next([general,update],{...options,autoUpdate:false}).key,general.key);
  assert.equal(policy.next([general,update],{...options,autoShow:false}).key,update.key);
  assert.equal(policy.next([general,update],{...options,autoShow:false,autoUpdate:false}),undefined);
});
test('reminders expire and a revised announcement becomes unread independently',()=>{
  assert.equal(policy.next([{...general,remindAfter:900}],options).key,general.key);
  assert.equal(policy.next([{...general,read:true},{...general,key:'general:2'}],options).key,'general:2');
});
test('remote content cannot create HTML scripts images links or event handlers',()=>{
  const rendered=policy.markup('**提示**\n\n<img src=x onerror=alert(1)>\n<script>alert(1)</script>\n[jump](javascript:alert(1))');
  assert.ok(rendered.includes('<strong>提示</strong>'));assert.ok(rendered.includes('&lt;script&gt;'));
  assert.ok(!/<(?:img|script|a)\b/.test(rendered));
});
