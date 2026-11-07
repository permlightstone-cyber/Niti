// Import adapter for an EXPLICIT, user-provided Bahçe snapshot.
// This module never requests a network service, never writes to Bahçe, and
// never turns advances into income. Existing records are NEVER overwritten.
import {normalizeEvent,validTime} from "./memory-core.mjs";
export const BAHCE_SNAPSHOT_SCHEMA="niti.bahce.snapshot.v1";
function hash(s){
 let h=2166136261;
 for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}
 return (h>>>0).toString(36);
}
function key(type,value,index=0){
 const ref=String(value?.id??value?.key??type+"-index-"+index).slice(0,400);
 return {id:"bahce-"+type+"-"+hash(ref),source:{kind:"bahce",ref:type+":"+ref}};
}
function dateTime(date,time=""){
 const d=String(date||"").slice(0,10),t=String(time||"").trim();
 if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||!validTime(d))return "";
 if(!t)return d;
 if(!/^\d{2}:\d{2}$/.test(t))return d;
 const v=d+"T"+t;return validTime(v)?v:d;
}
const clean=x=>String(x===null||x===undefined?"":x).trim();
const fromWork=(item,date,i,names)=>{
 const identity=key("work",item,i);
 const objId=clean(item.objectId||item.object_id);
 const object=clean(item.object||names.get(objId));
 const confirmed=clean(item.status)==="done"||clean(item.status)==="completed";
 const start=dateTime(item.date||date,item.time);
 const end=confirmed&&item.endTime?dateTime(item.date||date,item.endTime):"";
 const kind=clean(item.kind||item.type);
 const approx=item.certainty==="approximate"||item.certainty==="inferred"||item.timeApproximate;
 return normalizeEvent({...identity,
   kind:"event",status:confirmed?"completed":"planned",
   title:clean(item.title||item.object||names.get(objId)||"Работа")+" · "+(kind==="travel"?"переезд":"работа"),
   start,end:end&&end>=start?end:"",
   spaceId:"work",
   category:kind==="travel"?"Переезд":kind==="procurement"?"Закупка":kind==="lawn"?"Газон":"Работа",
   notes:clean(item.note)+(approx?"\nВремя приблизительное по исходному журналу.":""),
   links:object?[object]:[],
   fields:{
     objectId:objId,
     operation:kind,
     durationMinutes:Number.isFinite(Number(item.durationMinutes))?Number(item.durationMinutes):"",
     sourceRevision:Number.isFinite(Number(item.revision))?Number(item.revision):0,
     approximate:!!approx
   }
 });
};
const fromPlan=(item,i,names)=>{
 const identity=key("task",item,i),objId=clean(item.objectId||item.object_id);
 const object=clean(item.object||names.get(objId));
 return normalizeEvent({...identity,kind:"task",
   status:item.status==="done"||item.status==="completed"?"completed":item.status==="cancelled"?"cancelled":"planned",
   title:clean(item.title||item.note||"Дело"),start:dateTime(item.dueDate||item.date||item.plannedDate,item.dueTime||item.time),
   spaceId:"work",category:"Задача",
   notes:clean(item.note),links:object?[object]:[],
   fields:{objectId:objId,sourceRevision:Number(item.revision)||0}
 });
};
const fromPayment=(item,i,names)=>{
 const identity=key("payment",item,i),objId=clean(item.objectId??item.object_id);
 const object=clean(item.object||names.get(objId));
 const amount=Number(item.amount);
 if(!Number.isFinite(amount)||amount<0)throw new Error("Недопустимая сумма платежа");
 const currency=clean(item.currency||"").toUpperCase();
 if(!["TRY","USD","EUR"].includes(currency))throw new Error("Неизвестная валюта платежа");
 return normalizeEvent({...identity,kind:"event",status:"completed",
   title:"Получена оплата: "+amount.toLocaleString("ru-RU")+" "+currency+(object?" · "+object:""),
   start:dateTime(item.date),spaceId:"work",category:"Полученная оплата",
   notes:clean(item.note)+"\nЭто поступление; не считать автоматически чистым доходом. Авансы учитываются отдельно.",
   links:object?[object]:[],
   fields:{objectId:objId,amount,currency}
 });
};
export function prepareBahceImport(snapshot,existing=[]){
 if(!snapshot||snapshot.schema!==BAHCE_SNAPSHOT_SCHEMA)throw new Error("Ожидается JSON-снимок niti.bahce.snapshot.v1");
 if(!Array.isArray(snapshot.workdays)||!Array.isArray(snapshot.payments))throw new Error("Нужны массивы workdays и payments");
 if(snapshot.workdays.length>2000||snapshot.payments.length>100000)throw new Error("Слишком большой импорт");
 const names=new Map((Array.isArray(snapshot.objects)?snapshot.objects:[]).map(x=>[String(x.objectId??x.id??""),clean(x.name)]));
 const records=new Map(),warnings=[],seenExisting=new Set(existing.map(e=>e.id));
 const add=(record)=>{
   if(record && !records.has(record.id))records.set(record.id,record);
 };
 for(const [i,day] of snapshot.workdays.entries()){
   if(!day || !Array.isArray(day.entries) || !Array.isArray(day.plans) || day.entries.length>10000 || day.plans.length>50000){
     warnings.push("Пропущен некорректный рабочий день №"+(i+1));continue;
   }
   for(const [j,e] of day.entries.entries()){
     if(!e||!e.id){warnings.push("Запись работы без ID пропущена");continue}
     try{add(fromWork(e,day.date,j,names))}catch{warnings.push("Пропущена некорректная работа №"+(j+1))}
   }
   for(const [j,p] of day.plans.entries()){
     if(!p||!p.id){warnings.push("Задача без ID пропущена");continue}
     try{add(fromPlan(p,j,names))}catch{warnings.push("Пропущена некорректная задача №"+(j+1))}
   }
 }
 for(const [i,p] of snapshot.payments.entries()){
   if(!p||!p.id){warnings.push("Платёж без ID пропущен");continue}
   try{add(fromPayment(p,i,names))}catch{warnings.push("Пропущен некорректный платёж №"+(i+1))}
 }
 const incoming=[...records.values()],added=incoming.filter(e=>!seenExisting.has(e.id));
 return {
   proposed:added,total:incoming.length,skippedExisting:incoming.length-added.length,
   warnings,
   summary:{
     work:added.filter(e=>e.category==="Работа"||e.category==="Закупка"||e.category==="Газон"||e.category==="Переезд").length,
     tasks:added.filter(e=>e.kind==="task").length,
     payments:added.filter(e=>e.category==="Полученная оплата").length
   }
 };
}
