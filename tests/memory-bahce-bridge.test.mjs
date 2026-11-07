import test from "node:test";
import assert from "node:assert/strict";
import {prepareBahceImport,BAHCE_SNAPSHOT_SCHEMA} from "../memory-bahce-bridge.mjs";
const snapshot={
 schema:BAHCE_SNAPSHOT_SCHEMA,
 objects:[{objectId:22,name:"Клиент А"},{objectId:12,name:"Объект Б"}],
 workdays:[
  {date:"2026-11-06",entries:[
    {id:"work-1",objectId:"22",object:"Клиент А",date:"2026-11-06",time:"09:00",endTime:"11:00",status:"done",kind:"prune",durationMinutes:120,note:"Стрижка кустов",revision:1},
    {id:"work-2",objectId:"12",date:"2026-11-06",status:"done",kind:"check",timeApproximate:true,note:"Примерное время"}],
    plans:[{id:"task1",objectId:"22",note:"Купить фильтр",date:"2026-11-07",status:"planned"}]},
  {date:"2026-11-07",entries:[],plans:[{id:"task1",objectId:"22",note:"Купить фильтр",date:"2026-11-07",status:"planned"}]}
 ],
 payments:[{id:"pay1",object_id:22,date:"2026-11-06",amount:6000,currency:"TRY",note:"За октябрь"}]
};
test("Bahçe input creates independent memories from one source record",()=>{
 const s=prepareBahceImport(snapshot);
 assert.equal(s.total,4);assert.equal(s.proposed.length,4);
 assert.equal(s.summary.tasks,1);assert.equal(s.summary.payments,1);
 const w=s.proposed.find(x=>x.source.ref==="work:work-1");
 assert.equal(w.start,"2026-11-06T09:00");assert.equal(w.end,"2026-11-06T11:00");
 assert.equal(w.fields.durationMinutes,120);
 const p=s.proposed.find(x=>x.source.ref==="payment:pay1");
 assert.equal(p.fields.amount,6000);assert.equal(p.fields.currency,"TRY");
 assert.match(p.notes,/не считать автоматически чистым доходом/);
});
test("Repeated day plans and repeated imports do not create duplicates",()=>{
 const first=prepareBahceImport(snapshot),second=prepareBahceImport(snapshot,first.proposed);
 assert.equal(second.proposed.length,0);assert.equal(second.skippedExisting,4);
 assert.deepEqual(first.proposed.map(x=>x.id),prepareBahceImport(snapshot).proposed.map(x=>x.id));
});
test("Approximate times remain approximate; missing time is not synthesized",()=>{
 const s=prepareBahceImport(snapshot);
 const e=s.proposed.find(x=>x.source.ref==="work:work-2");
 assert.equal(e.start,"2026-11-06");assert.equal(e.end,"");
 assert.match(e.notes,/приблизительное/);
});
test("rejects untrusted formats and skips data without source IDs",()=>{
 assert.throws(()=>prepareBahceImport({schema:"arbitrary",workdays:[],payments:[]}));
 const s=prepareBahceImport({schema:BAHCE_SNAPSHOT_SCHEMA,workdays:[{date:"2026-11-06",entries:[{note:"No id"}],plans:[]}],payments:[]});
 assert.equal(s.proposed.length,0);assert.ok(s.warnings.length>0);
});
test("currency is preserved without implicit conversion",()=>{
 const p={...snapshot,workdays:[],payments:[{id:"pay2",date:"2026-11-06",amount:150,currency:"EUR"}]};
 const s=prepareBahceImport(p);
 assert.equal(s.proposed[0].fields.currency,"EUR");
});
