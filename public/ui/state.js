'use strict';

// 全局状态与语义：快照数据、视图状态、派生选择器，以及“整理/导出”的唯一口径。

let state={materials:[],tasks:[],settings:{exportMode:'review'},lastMaterial:null};
let availableCourses=[];
const today=new Date();
const dateString=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const weekAgo=new Date(today);weekAgo.setDate(today.getDate()-6);
const view={page:'library',filter:'all',search:'',sort:'recent',materialId:null,pageFilter:'all',selected:new Set(),
  currentPage:1,undo:[],scanSelected:new Set(),loggedIn:false,scanned:false,scanning:false,taskFilter:'all',
  scanStart:dateString(weekAgo),scanEnd:dateString(today),directExport:false,saving:false,
  selectionAnchor:null,pageShiftPending:false,
  courseId:null,courseSelected:new Set(),courseFilter:'all',courseFrom:'',courseTo:'',scanExpanded:new Set(),sessionMenuId:null};
const main=document.querySelector('#main'),modal=document.querySelector('#modal');
const $=selector=>document.querySelector(selector);
const material=()=>state.materials.find(m=>m.id===view.materialId);
const activeMaterials=()=>state.materials.filter(m=>!m.deleted);
const pageList=()=>{const m=material();if(!m)return[];const all=Array.from({length:m.pages},(_,i)=>i+1);return view.pageFilter==='kept'?all.filter(p=>!m.excluded.includes(p)):all;};
const stepTarget=step=>{const pages=pageList();if(!pages.length)return null;if(step<0){for(let i=pages.length-1;i>=0;i--)if(pages[i]<view.currentPage)return pages[i];return null;}for(const p of pages)if(p>view.currentPage)return p;return null;};
const cropsOf=m=>(m&&m.crops)||{};
const cropOf=(m,page)=>cropsOf(m)[String(page)]||null;
const cropCount=(m,keptOnly=false)=>{const crops=cropsOf(m);return Object.keys(crops).filter(k=>!keptOnly||!m.excluded.includes(Number(k))).length;};
const fullCrop=()=>({x:0,y:0,w:1,h:1});
const round6=value=>Math.round(value*1e6)/1e6;
const badge=m=>`<span class="badge ${m.reviewRevision===m.revision?'exported':m.edited?'editing':'pending'}">${m.reviewRevision===m.revision?'已整理':m.edited?'整理中':'待整理'}</span>`;

const reviewed=m=>m.reviewRevision===m.revision;
const courseById=id=>(state.courseLibrary||[]).find(c=>c.id===id)||{id:'unfiled',title:'未归类',term:''};
const sessions=id=>activeMaterials().filter(m=>(m.courseId||'unfiled')===id).sort((a,b)=>a.day.localeCompare(b.day)||String(a.lectureId||'').localeCompare(String(b.lectureId||''),undefined,{numeric:true})||a.id.localeCompare(b.id));
const exportBadge=m=>`<span class="badge ${m.exported?(m.exportRevision===m.revision?'exported':'changed'):'pending'}">${m.exported?(m.exportRevision===m.revision?'已导出':'修改后待导出'):'未导出'}</span>`;
const queueMaterials=()=> (state.reviewQueue||[]).map(id=>activeMaterials().find(m=>m.id===id)).filter(Boolean);

