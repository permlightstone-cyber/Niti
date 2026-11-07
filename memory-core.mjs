// Нити Memory Core v1 — pure, portable data model. No network or personal data.
export const MEMORY_SCHEMA = "niti.memory.v1";
export const PRECISIONS = ["year","month","day","minute","unknown"];
export const DEFAULT_SPACES = [
  {id:"personal",name:"Моя жизнь",color:"#9b86e8",fields:[]},
  {id:"work",name:"Моё дело",color:"#4eb68c",fields:[{key:"client",label:"Клиент / объект",type:"text"},{key:"duration",label:"Время работы (мин.)",type:"number"}]}
];
const own = (object,key) => Object.prototype.hasOwnProperty.call(object,key);
export function uid(prefix="rec") {
  return prefix + "-" + (typeof crypto!=="undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)+"-"+Math.random().toString(36).slice(2));
}
export function safeText(v,max=4000) {
  return String(v===null||v===undefined?"":v).trim().slice(0,max);
}
export function timePrecision(value) {
  if(!value)return "unknown";
  if(/^\d{4}$/.test(value))return "year";
  if(/^\d{4}-\d{2}$/.test(value))return "month";
  if(/^\d{4}-\d{2}-\d{2}$/.test(value))return "day";
  if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))return "minute";
  throw new Error("Неверный формат даты");
}
export function validTime(value) {
  const p=timePrecision(value);
  if(p==="unknown")return true;
  const parts=value.match(/^(\d{4})(?:-(\d{2})(?:-(\d{2})(?:T(\d{2}):(\d{2}))?)?)?$/);
  if(!parts)return false;
  const y=Number(parts[1]),m=Number(parts[2]||1),d=Number(parts[3]||1),h=Number(parts[4]||0),mm=Number(parts[5]||0);
  const date=new Date(Date.UTC(y,m-1,d,h,mm));
  return date.getUTCFullYear()===y && date.getUTCMonth()===m-1 && date.getUTCDate()===d && h<24 && mm<60 && (p==="year"||m>=1);
}
export function normalizeSpace(input,old) {
  const name=safeText(input.name,80);
  if(!name)throw new Error("Укажи название пространства");
  const color=/^#[\da-fA-F]{6}$/.test(input.color||"")?input.color:"#9b86e8";
  const fields=(input.fields||[]).slice(0,30).map((f,i)=>({
    key:safeText(f.key||"field"+(i+1),40).replace(/[^a-zA-Z0-9_]/g,"_"),
    label:safeText(f.label,80),type:["text","number","date","checkbox"].includes(f.type)?f.type:"text"
  })).filter(f=>f.key&&f.label);
  return {id:old?.id||safeText(input.id,80)||uid("space"),name,color,fields};
}
export function normalizeEvent(input,old=null,at=new Date().toISOString()) {
  if(!input||typeof input!=="object")throw new Error("Некорректная запись");
  const title=safeText(input.title,200);
  if(!title)throw new Error("Нужно название события");
  const start=safeText(input.start,16),end=safeText(input.end,16);
  if(!validTime(start)||!validTime(end))throw new Error("Некорректная дата или время");
  if(end && !start)throw new Error("Окончание без начала");
  if(end && start && end<start)throw new Error("Окончание раньше начала");
  const precision=timePrecision(start);
  const fields={};
  for(const [k,v] of Object.entries(input.fields||{})) {
    if(!/^[a-zA-Z0-9_]{1,40}$/.test(k))continue;
    if(typeof v==="boolean"||typeof v==="number")fields[k]=v;
    else if(typeof v==="string")fields[k]=safeText(v,500);
  }
  const changed = old ? [...(old.history||[]).slice(-49),{
    at,revision:old.revision||1,previous:{title:old.title,start:old.start,end:old.end,spaceId:old.spaceId,category:old.category,notes:old.notes}
  }] : [];
  const source=old?.source || (input.source && typeof input.source==="object" ? {
    kind:safeText(input.source.kind||"manual",60),
    ref:safeText(input.source.ref||"",200)
  } : {kind:"manual",ref:""});
  return {
    schema:MEMORY_SCHEMA,id:old?.id||safeText(input.id,120)||uid(),
    kind:input.kind==="task"?"task":"event",
    status:["planned","completed","cancelled"].includes(input.status)?input.status:"completed",
    title,start,end,precision,
    zone:safeText(input.zone||(typeof Intl!=="undefined"?Intl.DateTimeFormat().resolvedOptions().timeZone:"UTC")||"UTC",80),
    spaceId:safeText(input.spaceId||"personal",80),
    category:safeText(input.category||"",60),
    notes:safeText(input.notes,6000),
    tags:[...new Set((input.tags||[]).map(t=>safeText(t,70)).filter(Boolean))].slice(0,30),
    links:[...new Set((input.links||[]).map(t=>safeText(t,120)).filter(Boolean))].slice(0,30),
    fields,source,
    createdAt:old?.createdAt||at,updatedAt:at,
    revision:old?(old.revision||1)+1:1,history:changed
  };
}
export function matchesEvent(e,query={}) {
  if(query.spaceId && query.spaceId!=="all" && e.spaceId!==query.spaceId)return false;
  if(query.status && query.status!=="all" && e.status!==query.status)return false;
  const q=safeText(query.search,200).toLocaleLowerCase("ru");
  if(q){
    const hay=[e.title,e.notes,e.category,(e.tags||[]).join(" "),(e.links||[]).join(" "),Object.values(e.fields||{}).join(" ")].join(" ").toLocaleLowerCase("ru");
    if(!hay.includes(q))return false;
  }
  return true;
}
export function visibleEvents(events,query={}) {
  return events.filter(e=>matchesEvent(e,query)).sort((a,b)=>(b.start||"").localeCompare(a.start||"")||(b.updatedAt||"").localeCompare(a.updatedAt||""));
}
export function groupByTime(events) {
  const groups=new Map();
  for(const e of events){
    const period=e.start ? e.start.slice(0,10) : "Без даты";
    if(!groups.has(period))groups.set(period,[]);
    groups.get(period).push(e);
  }
  return [...groups.entries()].map(([key,items])=>({key,items}));
}
function hashText(text){
  let h=2166136261;
  for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}
  return (h>>>0).toString(36);
}
export function legacyToEvents(legacy){
  if(!legacy||typeof legacy!=="object")throw new Error("Нет данных старой версии");
  const list=[];
  const push=(array,type,mapper)=>{
    for(const item of (Array.isArray(array)?array:[])){
      if(!item||typeof item!=="object")continue;
      const rawId=hashText(type+":"+(item.id!==undefined&&item.id!==null?String(item.id):JSON.stringify(item)));
      const p=mapper(item); if(!p||!p.title)continue;
      try{list.push(normalizeEvent({
        ...p,id:"legacy-"+type+"-"+rawId,
        source:{kind:"legacy-niti",ref:type+":"+rawId}
      },null,"1970-01-01T00:00:00.000Z"))}catch{}
    }
  };
  push(legacy.events,"event",x=>({kind:"event",title:x.title||"Событие",start:x.date?(x.date+(x.time?"T"+x.time:"")):"",spaceId:"personal",notes:x.notes||""}));
  push(legacy.plans,"plan",x=>({kind:"task",status:x.done?"completed":"planned",title:x.title||"План",start:x.date?(x.date+(x.time?"T"+x.time:"")):"",spaceId:"personal"}));
  push(legacy.activity,"activity",x=>({kind:"event",title:"Активность: "+(x.kind||"событие"),start:x.date?(x.date+(x.time?"T"+x.time:"")):"",spaceId:"personal",category:"Здоровье",fields:{steps:Number(x.steps)||0,minutes:Number(x.minutes)||0,km:Number(x.km)||0}}));
  push(legacy.finance,"finance",x=>({kind:"event",title:(Number(x.amount)>=0?"Доход ":"Расход ")+String(x.amount||0),start:x.date?(x.date+(x.time?"T"+x.time:"")):"",spaceId:"personal",category:"Финансы",fields:{amount:Number(x.amount)||0}}));
  push(legacy.financeTransactions,"financeTransaction",x=>({kind:"event",title:(x.category||({income:"Доход",expense:"Расход",transfer:"Перевод"}[x.kind])||"Операция")+" · "+(x.amountTry||""),start:x.date||"",spaceId:"personal",category:"Финансы",notes:x.comment||"",fields:{amount:Number(x.amountTry)||0,kind:x.kind||""}}));
  return list;
}
export function checkBackup(data){
  if(!data||data.schema!==MEMORY_SCHEMA||!Array.isArray(data.events)||!Array.isArray(data.spaces))
    throw new Error("Это не резервная копия памяти Нитей");
  if(data.events.length>200000)throw new Error("Слишком большая копия");
  return true;
}
