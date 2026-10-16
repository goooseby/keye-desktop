'use strict';

// 动作与表单事件的注册表：页面模块各自注册，app.js 按名字统一分发。

// 动作（按钮 data-action）注册表。
const actionHandlers = {};
const registerActions = handlers => Object.assign(actionHandlers, handlers);
function runAction(name, element, event) { const handler = actionHandlers[name]; return handler ? handler(element, event) : undefined; }

// 点击类 dataset（data-xxx）注册表：每个键名唯一对应一种元素，互不重叠。
const dataHandlers = {};
const registerDataHandlers = handlers => Object.assign(dataHandlers, handlers);
async function runDataHandler(element, event) {
  if (!element) return undefined;
  for (const key of Object.keys(dataHandlers)) {
    if (element.dataset[key] !== undefined) return dataHandlers[key](element, event);
  }
  return undefined;
}

// 表单控件注册表：按元素 id 分派（表单 onchange）。
const fieldHandlers = {};
const registerFields = handlers => Object.assign(fieldHandlers, handlers);
function runFieldHandler(element) { const handler = fieldHandlers[element.id]; return handler ? handler(element) : undefined; }

// 复选类 dataset 注册表（表单 onchange）。
const dataChangeHandlers = {};
const registerDataChanges = handlers => Object.assign(dataChangeHandlers, handlers);
async function runDataChangeHandler(element) {
  for (const key of Object.keys(dataChangeHandlers)) {
    if (element.dataset[key] !== undefined) return dataChangeHandlers[key](element);
  }
  return undefined;
}
