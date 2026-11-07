// Нити v1 local-first storage. IndexedDB only; no network and no automatic sharing.
import {MEMORY_SCHEMA,checkBackup} from "./memory-core.mjs";
const DB="niti-memory-local-v1";
const VERSION=1;
let connection=null;
export function openMemoryDb(){
  if(connection)return connection;
  connection=new Promise((resolve,reject)=>{
    if(!("indexedDB" in window)){reject(new Error("Браузер не поддерживает локальную базу IndexedDB"));return}
    const req=indexedDB.open(DB,VERSION);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains("events"))db.createObjectStore("events",{keyPath:"id"});
      if(!db.objectStoreNames.contains("spaces"))db.createObjectStore("spaces",{keyPath:"id"});
      if(!db.objectStoreNames.contains("assets"))db.createObjectStore("assets",{keyPath:"id"});
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||new Error("Ошибка открытия памяти"));
  });
  return connection;
}
async function request(store,mode,operation){
  const db=await openMemoryDb();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(store,mode);
    const req=operation(tx.objectStore(store));
    tx.oncomplete=()=>resolve(req.result);
    tx.onabort=()=>reject(tx.error||new Error("Операция отменена"));
    tx.onerror=()=>reject(tx.error||new Error("Ошибка сохранения"));
  });
}
export const listEvents=()=>request("events","readonly",s=>s.getAll());
export const listSpaces=()=>request("spaces","readonly",s=>s.getAll());
export const listAssets=()=>request("assets","readonly",s=>s.getAll());
export const getEvent=id=>request("events","readonly",s=>s.get(id));
export const putEvent=e=>request("events","readwrite",s=>s.put(e));
export const putSpace=e=>request("spaces","readwrite",s=>s.put(e));
export const putAsset=e=>request("assets","readwrite",s=>s.put(e));
export const removeAsset=id=>request("assets","readwrite",s=>s.delete(id));
export function fileToBase64(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result).split(",")[1]||"");
    reader.onerror=()=>reject(reader.error);
    reader.readAsDataURL(file);
  });
}
function base64ToBlob(base64,type){
  const bytes=atob(base64),parts=[];
  for(let i=0;i<bytes.length;i+=32768){
    const part=bytes.slice(i,i+32768),arr=new Uint8Array(part.length);
    for(let j=0;j<part.length;j++)arr[j]=part.charCodeAt(j);
    parts.push(arr);
  }
  return new Blob(parts,{type:type||"application/octet-stream"});
}
export async function exportMemory(){
  const [events,spaces,assets]=await Promise.all([listEvents(),listSpaces(),listAssets()]);
  const packed=[];
  for(const a of assets){
    packed.push({id:a.id,eventId:a.eventId,name:a.name,type:a.type,size:a.size,
      createdAt:a.createdAt,contentBase64:await fileToBase64(a.blob)});
  }
  return {schema:MEMORY_SCHEMA,exportedAt:new Date().toISOString(),events,spaces,assets:packed};
}
export async function importMemory(data){
  checkBackup(data);
  const [oldEvents,oldSpaces,oldAssets]=await Promise.all([listEvents(),listSpaces(),listAssets()]);
  const evtIds=new Set(oldEvents.map(e=>e.id)),spaceIds=new Set(oldSpaces.map(e=>e.id)),assetIds=new Set(oldAssets.map(a=>a.id));
  let events=0,spaces=0,assets=0;
  for(const s of data.spaces){
    if(s?.id && !spaceIds.has(s.id)){await putSpace(s);spaceIds.add(s.id);spaces++}
  }
  for(const e of data.events){
    if(e?.schema===MEMORY_SCHEMA && e?.id && !evtIds.has(e.id)){
      await putEvent(e);evtIds.add(e.id);events++;
    }
  }
  for(const a of (Array.isArray(data.assets)?data.assets:[])){
    if(a?.id && a?.eventId && evtIds.has(a.eventId) && !assetIds.has(a.id) && typeof a.contentBase64==="string"){
      const blob=base64ToBlob(a.contentBase64,a.type);
      await putAsset({id:a.id,eventId:a.eventId,name:String(a.name||"Фото"),type:a.type||"image/jpeg",
        size:blob.size,blob,createdAt:a.createdAt||new Date().toISOString()});
      assetIds.add(a.id);assets++;
    }
  }
  return {events,spaces,assets,skipped:data.events.length-events};
}
