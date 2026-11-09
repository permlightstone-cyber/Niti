import test from "node:test";
import assert from "node:assert/strict";
import {MEMORY_SCHEMA,DEFAULT_SPACES,normalizeEvent,normalizeSpace,validTime,timePrecision,visibleEvents,groupByTime,legacyToEvents,checkBackup} from "../memory-core.mjs";

test("precision is exact and no artificial time is invented",()=>{
 assert.equal(timePrecision("2026"),"year");
 assert.equal(timePrecision("2026-11"),"month");
 assert.equal(timePrecision("2026-11-06"),"day");
 assert.equal(timePrecision("2026-11-06T09:00"),"minute");
 assert.equal(timePrecision(""),"unknown");
 assert.equal(validTime("2026-02-30"),false);
 assert.equal(validTime("2026-11-06T25:00"),false);
 assert.equal(validTime("2026-11-06T09:00"),true);
});
test("creating a work event keeps object, source and interval",()=>{
 const now="2026-11-07T07:00:00.000Z";
 const e=normalizeEvent({title:"Стрижка кустов",start:"2026-11-06T09:00",end:"2026-11-06T11:00",
  spaceId:"work",category:"Работа",links:["Клиент А"],fields:{client:"Клиент А",duration:120},
  source:{kind:"bahce",ref:"entry-123"}},null,now);
 assert.equal(e.schema,MEMORY_SCHEMA);
 assert.equal(e.precision,"minute");
 assert.equal(e.source.ref,"entry-123");
 assert.equal(e.links[0],"Клиент А");
 assert.equal(e.fields.duration,120);
 assert.equal(e.revision,1);
 assert.equal(e.createdAt,now);
});
test("editing preserves identity and history",()=>{
 const a=normalizeEvent({title:"Прогулка",start:"2026-11-06",spaceId:"personal"},null,"2026-11-06T01:00:00.000Z");
 const b=normalizeEvent({...a,title:"Прогулка у моря"},a,"2026-11-07T01:00:00.000Z");
 assert.equal(b.id,a.id);
 assert.equal(b.createdAt,a.createdAt);
 assert.equal(b.revision,2);
 assert.equal(b.history.length,1);
 assert.equal(b.history[0].previous.title,"Прогулка");
});
test("bad intervals and malicious field names are rejected or omitted",()=>{
 assert.throws(()=>normalizeEvent({title:"Тест",start:"2026-11-06T12:00",end:"2026-11-06T09:00"}));
 const e=normalizeEvent({title:"Тест",fields:{"<script>":"x",client:"сад"}});
 assert.deepEqual(e.fields,{client:"сад"});
});
test("separate views do not create new copies of events",()=>{
 const a=normalizeEvent({title:"Клиент А",start:"2026-11-06T09:00",spaceId:"work",links:["Клиент А"]});
 const b=normalizeEvent({title:"Семья",start:"2026-11-05",spaceId:"personal"});
 const list=visibleEvents([b,a],{spaceId:"work",search:"Клиент А"});
 assert.equal(list.length,1);
 assert.equal(list[0].id,a.id);
 assert.equal(groupByTime([a,b]).length,2);
});
test("legacy migration is deterministic and does not mutate its input",()=>{
 const original={events:[{id:"x",title:"Поездка",date:"2025-01-01"}],plans:[{title:"Работа",date:"2026-11-08",done:false}],finance:[{date:"2026-11-06",amount:100}]};
 const before=JSON.stringify(original);
 const first=legacyToEvents(original),second=legacyToEvents(original);
 assert.equal(first.length,3);
 assert.deepEqual(first.map(x=>x.id),second.map(x=>x.id));
 assert.equal(JSON.stringify(original),before);
 assert.equal(first.find(x=>x.kind==="task").status,"planned");
});
test("space custom fields and backup check",()=>{
 const s=normalizeSpace({name:"Мастерская",fields:[{key:"price",label:"Цена",type:"number"}]});
 assert.equal(s.fields[0].type,"number");
 assert.equal(DEFAULT_SPACES[1].id,"work");
 assert.equal(checkBackup({schema:MEMORY_SCHEMA,events:[],spaces:[]}),true);
 assert.throws(()=>checkBackup({schema:"incorrect",events:[],spaces:[]}));
});
