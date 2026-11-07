import {DEFAULT_SPACES,normalizeEvent,normalizeSpace,visibleEvents,groupByTime,legacyToEvents,uid,validTime,timePrecision} from "./memory-core.mjs";
import {openMemoryDb,listEvents,listSpaces,listAssets,getEvent,putEvent,putSpace,putAsset,removeAsset,exportMemory,importMemory} from "./memory-store.mjs";
const $=id=>document.getElementById(id);
const escapeHtml=x=>String(x===undefined||x===null?"":x).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let state={events:[],spaces:[],assets:[],view:"timeline"};
let urls=[];
const today=()=>new Date().toLocaleDateString("sv-SE");
function toast(message,problem=false){
 const el=$("toast");el.textContent=message;el.classList.toggle("problem",problem);el.classList.add("show");
 clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove("show"),4500);
}
function formatDate(value){
 if(!value)return "Дата неизвестна";
 const v=value.replace("T"," ");
 return value.length>=10 ? v.slice(8,10)+"."+v.slice(5,7)+"."+v.slice(0,4)+(value.length>10?" · "+v.slice(11,16):""):v;
}
function spaceFor(id){return state.spaces.find(s=>s.id===id)||{id,name:"Другое",color:"#9b86e8",fields:[]}}
function clearUrls(){urls.forEach(u=>URL.revokeObjectURL(u));urls=[]}
function imageTiles(eventId,compact){
 const list=state.assets.filter(a=>a.eventId===eventId).slice(0,compact?3:30);
 if(!list.length)return "";
 return '<div class="photo-grid">'+list.map(a=>{
  const url=URL.createObjectURL(a.blob);urls.push(url);
  return '<a href="'+url+'" target="_blank" rel="noopener" title="'+escapeHtml(a.name)+'"><img src="'+url+'" alt="Фотография события" loading="lazy"></a>';
 }).join("")+'</div>';
}
async function reload(){state.events=await listEvents();state.spaces=await listSpaces();state.assets=await listAssets();render()}
function eventCard(e,mini=false){
 const s=spaceFor(e.spaceId),color=escapeHtml(s.color);
 const meta='<div class="record-meta"><span class="dot" style="background:'+color+'"></span>'+escapeHtml(s.name)+' · '+escapeHtml(formatDate(e.start))+' · '+escapeHtml(e.status==="planned"?"Запланировано":e.status==="cancelled"?"Архив":"Произошло")+'</div>';
 const links=e.links?.length?'<div class="link-tags">'+e.links.map(t=>'<span class="tag">'+escapeHtml(t)+'</span>').join("")+'</div>':"";
 return '<article class="record" style="--record-color:'+color+'"><button class="open-record" data-event="'+escapeHtml(e.id)+'" aria-label="Открыть событие: '+escapeHtml(e.title)+'"><strong>'+escapeHtml(e.title)+'</strong><span>Редактировать ›</span></button>'+meta+
  (e.notes?'<p>'+escapeHtml(mini?e.notes.slice(0,160):e.notes)+'</p>':"")+
  (e.category?'<span class="category">'+escapeHtml(e.category)+'</span>':"")+links+imageTiles(e.id,mini)+'</article>';
}
function render(){
 clearUrls();
 const sf=$("spaceFilter"),prev=sf.value||"all";
 sf.innerHTML='<option value="all">Все пространства</option>'+state.spaces.map(s=>'<option value="'+escapeHtml(s.id)+'">'+escapeHtml(s.name)+'</option>').join("");
 sf.value=state.spaces.some(s=>s.id===prev)?prev:"all";
 const list=visibleEvents(state.events,{spaceId:sf.value,status:$("statusFilter").value,search:$("searchInput").value});
 $("countEvents").textContent=state.events.filter(e=>e.status!=="cancelled").length;
 $("countSpaces").textContent=state.spaces.length;
 $("countConnected").textContent=new Set(state.events.flatMap(e=>e.links||[])).size;
 document.querySelectorAll("[data-view]").forEach(b=>{
  const active=b.dataset.view===state.view;b.classList.toggle("active",active);b.setAttribute("aria-pressed",String(active));
 });
 if(!list.length){
  $("memoryResults").innerHTML='<div class="empty"><b>Здесь появится твоя история</b><p>Сохрани первое событие или импортируй данные из старых «Нитей». Ничего не добавляется без твоего действия.</p></div>';
  return;
 }
 if(state.view==="cards"){
  $("memoryResults").innerHTML='<div class="record-grid">'+list.map(e=>eventCard(e,true)).join("")+'</div>';return;
 }
 if(state.view==="table"){
  $("memoryResults").innerHTML='<div class="table-scroll"><table><thead><tr><th>Время</th><th>Событие</th><th>Пространство</th><th>Категория</th><th>Статус</th></tr></thead><tbody>'+
    list.map(e=>'<tr><td>'+escapeHtml(formatDate(e.start))+'</td><td><button data-event="'+escapeHtml(e.id)+'" class="table-open">'+escapeHtml(e.title)+'</button></td><td>'+escapeHtml(spaceFor(e.spaceId).name)+'</td><td>'+escapeHtml(e.category||"—")+'</td><td>'+escapeHtml(e.status==="planned"?"План":e.status==="cancelled"?"Архив":"Событие")+'</td></tr>').join("")+'</tbody></table></div>';
  return;
 }
 const grouped=groupByTime(list);
 $("memoryResults").innerHTML='<div class="timeline">'+grouped.map(g=>
  '<section class="day-group"><div class="day-heading">'+escapeHtml(formatDate(g.key==="Без даты"?"":g.key))+'<small>'+g.items.length+' зап.</small></div><div class="day-records">'+g.items.map(e=>eventCard(e,true)).join("")+'</div></section>'
 ).join("")+'</div>';
}
function fillSpaces(selected){
 $("eventSpace").innerHTML=state.spaces.map(s=>'<option value="'+escapeHtml(s.id)+'">'+escapeHtml(s.name)+'</option>').join("");
 $("eventSpace").value=selected||"personal";if(!$("eventSpace").value)$("eventSpace").selectedIndex=0;
}
function renderFields(values={}){
 const space=spaceFor($("eventSpace").value);
 $("customFields").innerHTML=space.fields.length?'<h3>Свои поля · '+escapeHtml(space.name)+'</h3>'+space.fields.map(f=>{
  const v=values[f.key],type=f.type==="date"?"date":f.type==="number"?"number":f.type==="checkbox"?"checkbox":"text";
  return '<label>'+escapeHtml(f.label)+'<input data-custom="'+escapeHtml(f.key)+'" type="'+type+'" '+(type==="checkbox"?(v?"checked":""):'value="'+escapeHtml(v??"")+'"')+'></label>';
 }).join(""):"";
}
function updatePrecision(){
 const p=$("eventPrecision").value;
 $("eventStart").placeholder=p==="year"?"ГГГГ":p==="month"?"ГГГГ-ММ":p==="minute"?"ГГГГ-ММ-ДДTчч:мм":p==="unknown"?"Необязательно":"ГГГГ-ММ-ДД";
 $("eventEnd").placeholder=$("eventStart").placeholder;
}
function openEvent(id){
 $("eventForm").reset();$("eventId").value=id||"";$("eventFormTitle").textContent=id?"Изменить событие":"Новое событие";
 const e=id?state.events.find(x=>x.id===id):null;
 fillSpaces(e?.spaceId||"personal");
 $("eventTitle").value=e?.title||"";
 $("eventKind").value=e?.kind||"event";
 $("eventStatus").value=e?.status||"completed";
 $("eventPrecision").value=e?.precision||"day";
 $("eventStart").value=e?.start||today();
 $("eventEnd").value=e?.end||"";
 $("eventCategory").value=e?.category||"";
 $("eventTags").value=(e?.tags||[]).join(", ");
 $("eventLinks").value=(e?.links||[]).join(", ");
 $("eventNotes").value=e?.notes||"";
 $("existingPhotos").innerHTML="";
 renderFields(e?.fields||{});updatePrecision();
 if(e) $("existingPhotos").innerHTML=state.assets.filter(a=>a.eventId===e.id).map(a=>
  '<div class="attachment-row"><span>📷 '+escapeHtml(a.name)+'</span><button type="button" class="secondary" data-remove-asset="'+escapeHtml(a.id)+'">Удалить</button></div>').join("");
 $("eventPhotos").value="";
 $("eventDialog").showModal();
}
function openSpace(id){
 $("spaceForm").reset();
 const s=id?state.spaces.find(x=>x.id===id):null;
 $("spaceId").value=s?.id||"";$("spaceFormTitle").textContent=s?"Настроить пространство":"Новое пространство";
 $("spaceName").value=s?.name||"";$("spaceColor").value=s?.color||"#9b86e8";
 $("spaceFields").value=(s?.fields||[]).map(f=>f.label+" | "+f.type).join("\n");
 $("spaceDialog").showModal();
}
async function saveEvent(e){
 const existing=$("eventId").value?state.events.find(x=>x.id===$("eventId").value):null;
 const start=$("eventStart").value.trim(),end=$("eventEnd").value.trim();
 const precision=$("eventPrecision").value;
 if((start && timePrecision(start)!==precision)||(!start && precision!=="unknown"))
   throw new Error("Формат начала не соответствует выбранной точности времени");
 if(end && timePrecision(end)!==precision)throw new Error("Формат окончания не соответствует выбранной точности");
 if(!validTime(start)||!validTime(end))throw new Error("Проверь дату");
 const photos=[...$("eventPhotos").files];
 if(photos.some(f=>!f.type.startsWith("image/")||f.size>8*1024*1024))
   throw new Error("Можно добавлять только фотографии размером не больше 8 МБ");
 const fields={};$("customFields").querySelectorAll("[data-custom]").forEach(el=>{
  fields[el.dataset.custom]=el.type==="checkbox"?el.checked:el.type==="number"?(el.value===""?"":Number(el.value)):el.value;
 });
 const record=normalizeEvent({
  id:existing?.id,kind:$("eventKind").value,status:$("eventStatus").value,
  title:$("eventTitle").value,start,end,spaceId:$("eventSpace").value,
  category:$("eventCategory").value,notes:$("eventNotes").value,
  tags:$("eventTags").value.split(","),links:$("eventLinks").value.split(","),fields
 },existing);
 await putEvent(record);
 let savedPhotos=0;
 for(const file of photos){
  await putAsset({id:uid("photo"),eventId:record.id,name:file.name,type:file.type,size:file.size,
    blob:file,createdAt:new Date().toISOString()});savedPhotos++;
 }
 return {record,savedPhotos};
}
function downloadJson(content,name){
 const blob=new Blob([JSON.stringify(content,null,2)],{type:"application/json;charset=utf-8"});
 const url=URL.createObjectURL(blob),a=document.createElement("a");
 a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1200);
}
document.addEventListener("click",async e=>{
 const close=e.target.closest("[data-close]");
 if(close){$(close.dataset.close).close();return}
 const open=e.target.closest("[data-event]");
 if(open){openEvent(open.dataset.event);return}
 const remove=e.target.closest("[data-remove-asset]");
 if(remove){
  const a=state.assets.find(x=>x.id===remove.dataset.removeAsset);
  if(a && confirm('Удалить фотографию «'+a.name+'» без возможности восстановления из текущей базы?')){
   await removeAsset(a.id);await reload();openEvent($("eventId").value);toast("Фотография удалена");
  }
 }
});
$("eventSpace").addEventListener("change",()=>renderFields());
$("eventPrecision").addEventListener("change",updatePrecision);
$("addEventBtn").addEventListener("click",()=>openEvent(""));
$("addSpaceBtn").addEventListener("click",()=>openSpace(""));
for(const id of ["spaceFilter","statusFilter"])$(id).addEventListener("change",render);
$("searchInput").addEventListener("input",render);
document.querySelectorAll("[data-view]").forEach(b=>b.addEventListener("click",()=>{state.view=b.dataset.view;render()}));
$("eventForm").addEventListener("submit",async e=>{
 e.preventDefault();$("saveEventBtn").disabled=true;
 try{
  const saved=await saveEvent(e);$("eventDialog").close();await reload();
  toast("Событие сохранено"+(saved.savedPhotos?" · фотографий: "+saved.savedPhotos:""));
 }catch(err){toast(err.message||"Ошибка сохранения",true)}finally{$("saveEventBtn").disabled=false}
});
$("spaceForm").addEventListener("submit",async e=>{
 e.preventDefault();
 try{
  const previous=state.spaces.find(s=>s.id===$("spaceId").value);
  const rawLines=$("spaceFields").value.split("\n").map(s=>s.trim()).filter(Boolean);
  const fields=rawLines.map((line,i)=>{
   const parts=line.split("|").map(s=>s.trim());
   return {key:previous?.fields?.[i]?.key||"field"+(i+1),label:parts[0],type:parts[1]||"text"};
  });
  const space=normalizeSpace({name:$("spaceName").value,color:$("spaceColor").value,fields},previous);
  await putSpace(space);$("spaceDialog").close();await reload();toast("Пространство сохранено");
 }catch(err){toast(err.message||"Ошибка сохранения",true)}
});
$("backupBtn").addEventListener("click",async()=>{
 try{
  toast("Создаю полную копию…");
  const data=await exportMemory();
  downloadJson(data,"niti-memory-backup-"+today()+".json");
  toast("Копия скачана — сохрани её в надёжном месте");
 }catch(err){toast(err.message||"Ошибка создания копии",true)}
});
$("restoreBtn").addEventListener("click",()=>$("backupFile").click());
$("backupFile").addEventListener("change",async e=>{
 const file=e.target.files?.[0];if(!file)return;
 try{
  const data=JSON.parse(await file.text());
  if(!confirm("Добавить записи из копии? Существующие записи не будут заменены."))return;
  const result=await importMemory(data);await reload();
  toast("Добавлено: "+result.events+" событий, "+result.spaces+" пространств, "+result.assets+" фото");
 }catch(err){toast(err.message||"Не удалось восстановить копию",true)}finally{e.target.value=""}
});
$("legacyBtn").addEventListener("click",async()=>{
 const keys=["niti-clean-v2","niti-clean-v1","niti-live-lab","niti-live-lab-v14"];
 const key=keys.find(k=>localStorage.getItem(k));
 if(!key){toast("Здесь нет локальных данных старой версии. Если они на другом устройстве — сначала экспортируй их там.",true);return}
 try{
  const raw=localStorage.getItem(key),data=JSON.parse(raw);
  const list=legacyToEvents(data);
  if(!list.length){toast("В старой версии не найдены события для переноса",true);return}
  if(!confirm("Нашла "+list.length+" записей в "+key+". Сначала будет скачана копия старых данных. Затем записи добавятся в новую память без удаления старых. Продолжить?"))return;
  downloadJson({key,data,exportedAt:new Date().toISOString()},"niti-legacy-original-"+today()+".json");
  const existing=new Set(state.events.map(e=>e.id)),toAdd=list.filter(e=>!existing.has(e.id));
  for(const item of toAdd)await putEvent(normalizeEvent(item,null));
  await reload();toast("Перенесено "+toAdd.length+" записей; исходные данные не изменены");
 }catch(err){toast(err.message||"Ошибка переноса",true)}
});
async function init(){
 try{
  await openMemoryDb();
  const spaces=await listSpaces();
  if(!spaces.length)for(const s of DEFAULT_SPACES)await putSpace(s);
  await reload();
 }catch(err){$("memoryResults").innerHTML='<div class="empty"><b>Не удалось открыть память</b><p>'+escapeHtml(err.message)+'</p></div>';toast(err.message,true)}
}
init();

if("serviceWorker" in navigator)navigator.serviceWorker.register("./sw.js").catch(()=>{});
