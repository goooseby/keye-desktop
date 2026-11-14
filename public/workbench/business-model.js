'use strict';

// Pure translation at the service boundary; the UI and backend keep their own schemas.
const WorkbenchModel = (() => {
  const palette=['#2356bc','#7256b8','#007e9c','#c26829'];
  function courses(snapshot) {
    const pending=new Set((snapshot.pendingCourseDeletions||[]).map(op=>op.courseId));
    return [...(snapshot.courseLibrary||[]).map((course,index)=>({id:course.id,name:course.title,term:course.term||'',pending:pending.has(course.id),color:palette[index%palette.length],dark:'#152e60',short:''})),{id:'unfiled',name:'未归类',term:'',color:'#657286',dark:'#354156',short:''}];
  }
  function file(material,previous) {
    const topic=material.topic&&!['本地资料','课堂课件'].includes(material.topic)?material.topic:material.title;
    const title=material.note||(material.source==='import'?material.title:[material.day,topic].filter(Boolean).join(' · '));
    return {id:material.id,course:material.courseId||'unfiled',title,date:material.day||'',pages:material.pages,
      review:material.reviewRevision===material.revision?'done':material.edited?'reviewing':'pending',
      exported:!!material.exported&&material.exportRevision===material.revision,
      excluded:new Set(material.excluded||[]),crops:new Map(Object.entries(material.crops||{}).map(([page,[x,y,w,h]])=>[Number(page),{x,y,w,h}])),
      history:previous?.history||[],lastPage:material.lastPage||1,deleted:!!material.deleted,revision:material.revision,media:material.media||[],missingPages:material.missingPages||[],raw:material};
  }
  function pageState(file,excluded,crops) {
    return {id:file.id,revision:file.revision,excluded:[...excluded].sort((a,b)=>a-b),crops:Object.fromEntries([...crops].map(([page,r])=>[String(page),[r.x,r.y,r.w,r.h].map(value=>Math.round(value*1e6)/1e6)]))};
  }
  function task(task) {
    return {...task,status:task.status==='done'&&task.warning?'attention':task.status,fileId:task.materialId,description:task.error||task.warning||task.message||'',progress:Number(task.progress)||0};
  }
  function scanGroups(rows,selected,unavailable,stored) {
    const grouped=new Map();
    for(const row of rows){
      const id=String(row.groupId||row.course_id||row.course||row.id);
      if(!grouped.has(id))grouped.set(id,{id,name:row.name||row.title,items:[]});
      grouped.get(id).items.push(row);
    }
    return [...grouped.values()].map(group=>{
      group.items.sort((a,b)=>(a.date||a.day).localeCompare(b.date||b.day)||String(a.sub_id||a.id).localeCompare(String(b.sub_id||b.id),undefined,{numeric:true}));
      const eligible=group.items.filter(row=>!unavailable(row.id)),chosen=eligible.filter(row=>selected.has(row.id));
      return {...group,eligible,chosen,stored:group.items.filter(row=>stored(row.id)).length,
        checked:eligible.length>0&&chosen.length===eligible.length,partial:chosen.length>0&&chosen.length<eligible.length};
    });
  }
  return {courses,file,pageState,task,scanGroups};
})();
