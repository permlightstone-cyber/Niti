const $=id=>document.getElementById(id);
const KEY="niti-clean-v2";
const LEGACY_KEYS=["niti-clean-v1","niti-live-lab","niti-live-lab-v14"];
const base={
  profile:{name:"",birthDate:""},
  layers:{threads:true,events:true,plans:true,finance:true,activity:true},
  threads:[],events:[],plans:[],finance:[],financeTransactions:[],activity:[]
};
let restored=null;
for(const key of [KEY,...LEGACY_KEYS]){try{const value=JSON.parse(localStorage.getItem(key)||"null");if(value){restored=value;break}}catch{}}
let s=restored||structuredClone(base);
s={...base,...s,profile:{...base.profile,...(s.profile||{})},layers:{...base.layers,...(s.layers||{})}};
s.financeTransactions=Array.isArray(s.financeTransactions)?s.financeTransactions:[];
const save=()=>localStorage.setItem(KEY,JSON.stringify(s));
const today=()=>new Date().toISOString().slice(0,10);
const esc=x=>String(x??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));

let zoom=1, pan=0;
const MIN_ZOOM=1,MAX_ZOOM=250000;
const canvas=$("lifeCanvas"),wrap=$("canvasWrap");
const ctx=canvas.getContext("2d");
if(!ctx) throw new Error("Canvas 2D недоступен");

function bounds(){
  const birth=s.profile.birthDate?new Date(s.profile.birthDate+"T00:00:00").getTime():new Date(new Date().getFullYear()-40,0,1).getTime();
  let end=Date.now();
  for(const p of s.plans){
    if(!p.date)continue;
    const ms=new Date(p.date+"T"+(p.time||"23:59")+":00").getTime();
    if(Number.isFinite(ms)) end=Math.max(end,ms);
  }
  return {birth,end,span:Math.max(1,end-birth)};
}
function draw(){
  let r=wrap.getBoundingClientRect();
  if(r.width<10||r.height<10){
    r={width:Math.max(320,window.innerWidth-28),height:Math.max(420,window.innerHeight*.56)};
  }
  const dpr=Math.max(1,devicePixelRatio||1);
  canvas.width=Math.round(r.width*dpr);canvas.height=Math.round(r.height*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  const w=r.width,h=r.height;ctx.clearRect(0,0,w,h);
  const {birth,end,span}=bounds();
  const pad=28,usable=w-pad*2,content=usable*zoom,left=pad-(content-usable)/2+pan,cy=h/2;
  const xFor=ms=>left+((ms-birth)/span)*content;
  const visible=x=>x>-50&&x<w+50;
  const nowX=xFor(Date.now());
  if(nowX>=0&&nowX<=w){
    ctx.save();ctx.strokeStyle="#bcaaff";ctx.lineWidth=1;ctx.setLineDash([4,5]);
    ctx.beginPath();ctx.moveTo(nowX,30);ctx.lineTo(nowX,h-26);ctx.stroke();
    ctx.fillStyle="#d9ceff";ctx.font="11px system-ui";ctx.textAlign="center";
    ctx.fillText("Сегодня",Math.max(28,Math.min(w-28,nowX)),20);ctx.restore();
  }
  const startMs=birth+Math.max(0,(-left)/content)*span;
  const endMs=birth+Math.min(1,(w-left)/content)*span;
  const vspan=Math.max(1,endMs-startMs);
  const D=86400000,H=3600000,MIN=60000;

  // central life axis = zero baseline for finance/activity
  ctx.strokeStyle="rgba(215,228,255,.35)";ctx.lineWidth=1.4;
  ctx.beginPath();ctx.moveTo(0,cy);ctx.lineTo(w,cy);ctx.stroke();

  // adaptive scale
  let last=-1e9;
  function tick(ms,label,strong=false){
    const x=xFor(ms);if(!visible(x))return;
    ctx.strokeStyle=strong?"rgba(205,220,255,.18)":"rgba(190,210,255,.10)";
    ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,18);ctx.lineTo(x,h-26);ctx.stroke();
    if(label&&x-last>54){ctx.fillStyle="#8fa2bc";ctx.font="10px system-ui";ctx.textAlign="center";ctx.fillText(label,x,h-8);last=x}
  }

  const mid=new Date((startMs+endMs)/2);
  $("watermark").textContent="";
  if(vspan>5*365.25*D){
    const ys=new Date(startMs).getFullYear()-1,ye=new Date(endMs).getFullYear()+1;
    const years=vspan/(365.25*D);let st=10;if(years<25)st=5;if(years<12)st=2;if(years<7)st=1;
    for(let y=Math.ceil(ys/st)*st;y<=ye;y+=st)tick(new Date(y,0,1).getTime(),String(y),true);
    $("scaleTitle").textContent="Годы";
  }else if(vspan>2*D){
    $("watermark").textContent=mid.getFullYear();
    let d=new Date(startMs);d.setHours(0,0,0,0);
    const px=w/Math.max(1,vspan/D);let every=1;if(px<44)every=7;else if(px<64)every=3;else if(px<84)every=2;
    let i=0;
    for(;d.getTime()<=endMs+D;d.setDate(d.getDate()+1),i++)tick(d.getTime(),i%every===0?d.toLocaleDateString("ru-RU",{day:"2-digit",month:"short"}):"",true);
    $("scaleTitle").textContent=vspan>60*D?"Месяцы":"Дни";
  }else{
    const step=vspan<=3*H?10*MIN:vspan<=18*H?30*MIN:H;
    $("scaleTitle").textContent=step===10*MIN?"Часы • 10 мин":step===30*MIN?"Часы • 30 мин":"Часы • 1 час";
    $("watermark").textContent=mid.toLocaleDateString("ru-RU",{day:"2-digit",month:"long"});
    let t=Math.floor(startMs/step)*step;
    for(;t<=endMs+step;t+=step){
      const d=new Date(t),label=step===H?d.toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"}):
        (d.getMinutes()===0?d.toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"}):"");
      tick(t,label,d.getMinutes()===0);
    }
  }

  // base life waveform
  ctx.save();
  ctx.strokeStyle="#9a7dff";ctx.lineWidth=2.5;ctx.shadowColor="#7d68ff";ctx.shadowBlur=10;
  ctx.beginPath();
  for(let i=0;i<=220;i++){
    const t=i/220,x=left+t*content;if(!visible(x))continue;
    const y=cy+Math.sin(t*Math.PI*20)*8;
    i?ctx.lineTo(x,y):ctx.moveTo(x,y);
  }
  ctx.stroke();ctx.restore();

  // threads
  if(s.layers.threads){
    s.threads.forEach((th,idx)=>{
      const ms=new Date((th.startDate||s.profile.birthDate||today())+"T12:00:00").getTime();
      const st=Math.max(0,Math.min(1,(ms-birth)/span));
      ctx.strokeStyle=th.color||"#67d6a4";ctx.globalAlpha=.8;ctx.lineWidth=2;
      ctx.beginPath();let started=false;
      for(let j=0;j<=180;j++){
        const t=st+(1-st)*(j/180),x=left+t*content;if(!visible(x))continue;
        const y=cy+Math.sin(t*Math.PI*18+idx*.75)*(18+idx*4);
        if(!started){ctx.moveTo(x,y);started=true}else ctx.lineTo(x,y)
      }
      if(started)ctx.stroke();
      ctx.globalAlpha=1;
    });
  }

  // finance cardiogram on same zero axis: + above, - below
  if(s.layers.finance){
    ctx.save();
    ctx.strokeStyle="#61e3a6";ctx.lineWidth=2;ctx.shadowColor="#61e3a6";ctx.shadowBlur=8;
    for(const f of financeTimelinePoints()){
      if(!f.date)continue;
      const ms=new Date(f.date+"T"+(f.time||"12:00")+":00").getTime(),x=xFor(ms);if(!visible(x))continue;
      const val=Number(f.amount)||0;
      const amp=Math.min(92,18+Math.log10(Math.abs(val)+1)*18);
      const dir=val>=0?-1:1; // canvas y: up is negative
      const y=cy+dir*amp,wv=18;
      ctx.beginPath();ctx.moveTo(x-wv,cy);ctx.lineTo(x-wv*.45,cy);ctx.lineTo(x-wv*.15,cy+dir*7);
      ctx.lineTo(x,y);ctx.lineTo(x+wv*.18,cy-dir*10);ctx.lineTo(x+wv*.45,cy);ctx.lineTo(x+wv,cy);ctx.stroke();
    }
    ctx.restore();
  }

  // activity on same axis: sleep below, physical activity above
  if(s.layers.activity){
    ctx.save();ctx.strokeStyle="#38c7ff";ctx.lineWidth=2;ctx.shadowColor="#38c7ff";ctx.shadowBlur=8;
    for(const a of s.activity){
      if(!a.date)continue;
      const ms=new Date(a.date+"T"+(a.time||"12:00")+":00").getTime(),x=xFor(ms);if(!visible(x))continue;
      const sleep=a.kind==="sleep";
      const metric=sleep?(Number(a.minutes)||0):(Number(a.steps)||0)+(Number(a.minutes)||0)*60+(Number(a.km)||0)*300;
      const amp=Math.min(85,16+Math.log10(metric+1)*17),dir=sleep?1:-1,wv=15;
      ctx.beginPath();ctx.moveTo(x-wv,cy);ctx.lineTo(x-wv*.45,cy);ctx.lineTo(x-wv*.1,cy+dir*6);
      ctx.lineTo(x,cy+dir*amp);ctx.lineTo(x+wv*.18,cy-dir*7);ctx.lineTo(x+wv*.45,cy);ctx.lineTo(x+wv,cy);ctx.stroke();
    }
    ctx.restore();
  }

  // events and plans
  if(s.layers.events) for(const e of s.events) drawMarker(e,false);
  if(s.layers.plans) for(const p of s.plans.filter(x=>!x.done)) drawMarker(p,true);

  function drawMarker(item,plan){
    if(!item.date)return;
    const ms=new Date(item.date+"T"+(item.time||"12:00")+":00").getTime(),x=xFor(ms);if(!visible(x))return;
    ctx.save();ctx.globalAlpha=plan?.45:1;ctx.fillStyle=plan?"#f0bd65":"#ffffff";ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=12;
    ctx.beginPath();ctx.arc(x,cy,plan?5:6,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
    if(vspan<10*365.25*D){
      ctx.font="11px system-ui";ctx.textAlign="left";ctx.fillStyle=plan?"rgba(240,189,101,.65)":"#dce8fb";
      ctx.fillText(item.title|| (plan?"План":"Событие"),x+8,cy-(plan?18:30));
    }
    ctx.restore();
  }
}

let pointers=new Map(),lastDist=0,startX=0,startPan=0;
wrap.addEventListener("pointerdown",e=>{
  e.preventDefault();wrap.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pointers.size===1){startX=e.clientX;startPan=pan}
  if(pointers.size===2){const a=[...pointers.values()];lastDist=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y)}
},{passive:false});
wrap.addEventListener("pointermove",e=>{
  if(!pointers.has(e.pointerId))return;e.preventDefault();pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pointers.size===2){
    const a=[...pointers.values()],dist=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);
    if(lastDist>0){
      const ratio=Math.max(.92,Math.min(1.08,dist/lastDist));
      zoom=Math.max(MIN_ZOOM,Math.min(MAX_ZOOM,zoom*Math.pow(ratio,.7)));
      lastDist=dist;draw();
    }
  }else if(pointers.size===1){pan=startPan+(e.clientX-startX)*.72;draw()}
},{passive:false});
["pointerup","pointercancel"].forEach(t=>wrap.addEventListener(t,e=>{
  e.preventDefault();pointers.delete(e.pointerId);if(pointers.size===1){const a=[...pointers.values()][0];startX=a.x;startPan=pan}
  if(pointers.size<2)lastDist=0;draw()
},{passive:false}));

$("resetView").onclick=()=>{zoom=1;pan=0;draw()};
$("todayView").onclick=()=>{
  const {birth,span}=bounds();
  const width=wrap.getBoundingClientRect().width;
  // Match draw's coordinates and keep the current zoom level.
  pan=(.5-(Date.now()-birth)/span)*(width-56)*zoom;
  draw();
};
document.querySelectorAll("[data-layer]").forEach(b=>b.onclick=()=>{
  const k=b.dataset.layer;s.layers[k]=!s.layers[k];b.classList.toggle("active",s.layers[k]);save();draw();
});
function syncLayerButtons(){document.querySelectorAll("[data-layer]").forEach(b=>b.classList.toggle("active",!!s.layers[b.dataset.layer]))}

const modal=$("modal"),fields=$("modalFields");
let currentType="";
function field(label,name,type="text",extra=""){
  if(type==="select")return `<div class="field"><label>${label}</label><select name="${name}">${extra}</select></div>`;
  if(type==="textarea")return `<div class="field"><label>${label}</label><textarea name="${name}" rows="3"></textarea></div>`;
  return `<div class="field"><label>${label}</label><input name="${name}" type="${type}" ${extra}></div>`;
}
function openAdd(type){
  currentType=type;const titles={thread:"Новая нить",event:"Новое событие",plan:"Новый план",finance:"Финансы",activity:"Активность"};
  $("modalTitle").textContent=titles[type];
  if(type==="thread")fields.innerHTML=field("Название","title")+field("Дата начала","date","date",`value="${today()}"`)+field("Цвет","color","color",'value="#67d6a4"');
  if(type==="event")fields.innerHTML=field("Название","title")+field("Дата","date","date",`value="${today()}"`)+field("Время","time","time",'value="12:00"');
  if(type==="plan")fields.innerHTML=field("Название","title")+field("Дата","date","date",`value="${today()}"`)+field("Время","time","time",'value="12:00"');
  if(type==="finance")fields.innerHTML=field("Сумма (+ доход / − расход)","amount","number",'step="0.01"')+field("Дата","date","date",`value="${today()}"`)+field("Время","time","time",'value="12:00"');
  if(type==="activity")fields.innerHTML=field("Тип","kind","select",'<option value="walk">Ходьба</option><option value="run">Бег</option><option value="bike">Велосипед</option><option value="swim">Плавание</option><option value="workout">Тренировка</option><option value="sleep">Сон</option>')+field("Дата","date","date",`value="${today()}"`)+field("Время","time","time",'value="12:00"')+field("Шаги","steps","number")+field("Минуты","minutes","number")+field("Км","km","number",'step="0.1"');
  modal.showModal();
}
document.querySelectorAll("[data-add]").forEach(b=>b.onclick=()=>openAdd(b.dataset.add));


function render(){
  syncLayerButtons();
  $("eventsList").className="list"+(s.events.length?"":" empty");
  $("eventsList").innerHTML=s.events.length?s.events.slice().sort((a,b)=>(b.date||"").localeCompare(a.date||"")).map(e=>`<div class="item"><b>${esc(e.title||"Событие")}</b><div class="meta">${esc(e.date)} ${esc(e.time||"")}</div></div>`).join(""):"Пока нет событий";
  $("plansList").className="list"+(s.plans.length?"":" empty");
  $("plansList").innerHTML=s.plans.length?s.plans.slice().sort((a,b)=>(a.date||"").localeCompare(b.date||"")).map(p=>`<div class="item"><b>${esc(p.title||"План")}</b><div class="meta">${esc(p.date)} ${esc(p.time||"")}</div></div>`).join(""):"Пока нет планов";
  renderFinance();
}
window.addEventListener("resize",()=>requestAnimationFrame(draw));
window.addEventListener("error",ev=>{
  console.error(ev.error||ev.message);
  const b=document.createElement("div");
  b.style.cssText="position:fixed;left:10px;right:10px;bottom:10px;z-index:9999;background:#7f1d1d;color:white;padding:10px 12px;border-radius:12px;font:12px system-ui";
  b.textContent="Ошибка приложения: "+(ev.message||"неизвестная ошибка");
  document.body.appendChild(b);
});
requestAnimationFrame(()=>{render();draw();});
if(!s.profile.birthDate)setTimeout(()=>$("profileBtn").click(),350);


function formDataObject(form){return Object.fromEntries(new FormData(form).entries())}
$("modalForm").addEventListener("submit",event=>{
  event.preventDefault();
  if(!event.submitter||event.submitter.value==="cancel"){modal.close();return}
  const value=formDataObject(event.currentTarget);
  if(currentType==="profile"){
    s.profile.name=(value.name||"").trim();s.profile.birthDate=value.birthDate||"";
  }else{
    const map={thread:"threads",event:"events",plan:"plans",finance:"finance",activity:"activity"},key=map[currentType];
    if(!key)return;
    if(currentType==="thread"){value.title=(value.title||"Новая нить").trim();value.startDate=value.date;delete value.date}
    if(currentType==="event"||currentType==="plan")value.title=(value.title||({event:"Событие",plan:"План"}[currentType])).trim();
    if(currentType==="finance")value.amount=Number(value.amount)||0;
    if(currentType==="activity"){value.steps=Math.max(0,Number(value.steps)||0);value.minutes=Math.max(0,Number(value.minutes)||0);value.km=Math.max(0,Number(value.km)||0)}
    value.id=crypto.randomUUID?.()||Date.now()+"-"+Math.random();s[key].push(value);
  }
  save();modal.close();render();draw();
});
$("profileBtn").onclick=()=>{
  currentType="profile";$("modalTitle").textContent="Мой профиль";
  fields.innerHTML=field("Имя","name","text",`value="${esc(s.profile.name)}"`)+field("Дата рождения","birthDate","date",`value="${esc(s.profile.birthDate)}"`);
  modal.showModal();
};
if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(console.error));



// Finance imports use browser-native APIs only. No transaction file is sent to the server.
function financeTimelinePoints(){
  const daily=new Map();
  for(const t of s.financeTransactions){
    if((t.kind!=="income"&&t.kind!=="expense")||!t.date)continue;
    const amount=Number(t.amountTry);
    if(!Number.isFinite(amount))continue;
    daily.set(t.date,(daily.get(t.date)||0)+(t.kind==="income"?amount:-amount));
  }
  return [...s.finance,...[...daily].map(([date,amount])=>({date,amount}))];
}
const fmtTry=n=>new Intl.NumberFormat("ru-RU",{maximumFractionDigits:2,minimumFractionDigits:0}).format(n)+" ₺";
const financeDateLabel=d=>/^\d{4}-\d\d-\d\d$/.test(d||"")?d.split("-").reverse().join("."):String(d||"");
function financeMonth(){
  const months=[...new Set([...s.financeTransactions.map(t=>(t.date||"").slice(0,7)),...s.finance.map(t=>(t.date||"").slice(0,7))].filter(x=>/^\d{4}-\d\d$/.test(x)))].sort().reverse();
  const select=$("financeMonth"),old=select.value;
  if(!months.length)months.push(today().slice(0,7));
  select.innerHTML=months.map(m=>'<option value="'+esc(m)+'">'+esc(new Date(m+"-01T12:00:00").toLocaleDateString("ru-RU",{month:"long",year:"numeric"}))+"</option>").join("");
  select.value=months.includes(old)?old:months[0];
  return select.value;
}
function renderFinance(){
  if(!$("financeMonth"))return;
  const month=financeMonth();
  const imported=s.financeTransactions.filter(t=>(t.date||"").slice(0,7)===month);
  const manual=s.finance.filter(t=>(t.date||"").slice(0,7)===month).map(t=>({
    id:t.id,kind:Number(t.amount)>=0?"income":"expense",date:t.date,
    amountTry:Math.abs(Number(t.amount)||0),category:"Ручная запись",account:"",comment:""
  }));
  const rows=[...imported,...manual];
  const income=rows.filter(t=>t.kind==="income").reduce((n,t)=>n+Number(t.amountTry||0),0);
  const expenses=rows.filter(t=>t.kind==="expense").reduce((n,t)=>n+Number(t.amountTry||0),0);
  const transfers=rows.filter(t=>t.kind==="transfer").length;
  const stats=$("financeStats");
  const tile=(label,value,cls)=>'<div class="finance-stat '+cls+'"><span>'+label+'</span><strong>'+fmtTry(value)+'</strong></div>';
  stats.innerHTML=tile("Доходы",income,"income")+tile("Расходы",expenses,"expense")+tile("Разница",income-expenses,(income-expenses)>=0?"income":"expense");
  $("financeCount").textContent=rows.length+" операций, включая "+transfers+" переводов (переводы не входят в доходы/расходы)";
  const cats=new Map();
  rows.filter(t=>t.kind==="expense").forEach(t=>cats.set(t.category||"Без категории",(cats.get(t.category||"Без категории")||0)+Number(t.amountTry||0)));
  const catRows=[...cats].sort((a,b)=>b[1]-a[1]);
  $("financeCategories").innerHTML=catRows.length?catRows.map(([name,value])=>
    '<div class="finance-cat"><div class="finance-cat-top"><span>'+esc(name)+'</span><b>'+fmtTry(value)+'</b></div><div class="finance-track"><i style="width:'+Math.min(100,Math.round(value/Math.max(expenses,1)*100))+'%"></i></div></div>'
  ).join(""):'<div class="empty">Нет расходов за этот месяц</div>';
  const names={income:"Доход",expense:"Расход",transfer:"Перевод"};
  const sorted=rows.slice().sort((a,b)=>(b.date||"").localeCompare(a.date||"")||(a.kind||"").localeCompare(b.kind||""));
  $("financeOperations").innerHTML=sorted.length?sorted.map(t=>{
    const isTransfer=t.kind==="transfer";
    const signed=t.kind==="expense"?"−":t.kind==="income"?"+":"";
    const amount=isTransfer?fmtTry(Number(t.amountFrom||0)):fmtTry(Number(t.amountTry||0));
    const detail=isTransfer?(t.accountFrom||"")+" → "+(t.accountTo||""):[t.category,t.account,t.tags,t.comment].filter(Boolean).join(" · ");
    return '<div class="finance-operation"><div class="finance-op-main"><b>'+esc(isTransfer?"Перевод":t.category||names[t.kind]||"Операция")+'</b><strong class="'+(t.kind==="income"?"positive":t.kind==="expense"?"negative":"")+'">'+signed+amount+'</strong></div><div class="meta">'+esc(financeDateLabel(t.date))+' · '+esc(detail)+'</div></div>';
  }).join(""):'<div class="empty">За этот месяц записей нет. Импортируй Excel-файл из своей финансовой программы.</div>';
}
$("financeMonth").addEventListener("change",renderFinance);
$("importFinanceBtn").addEventListener("click",()=>$("financeFile").click());
$("financeFile").addEventListener("change",async e=>{
  const file=e.target.files?.[0];if(!file)return;
  const status=$("financeImportStatus");
  status.textContent="Проверяю "+file.name+"…";
  try{
    const imported=file.name.toLowerCase().endsWith(".xlsx")?
      await readFinanceXlsx(file):JSON.parse(await file.text());
    if(imported.schema!=="niti.finance.v1"||!Array.isArray(imported.transactions))throw Error("Неизвестная структура файла");
    const clean=imported.transactions.filter(t=>t&&/^\d{4}-\d\d-\d\d$/.test(t.date||"")&&["income","expense","transfer"].includes(t.kind))
      .map(t=>({...t,amountTry:t.kind==="transfer"?null:Math.abs(Number(t.amountTry)||0)}));
    if(!clean.length)throw Error("Операции не обнаружены");
    const months=new Set(clean.map(t=>t.date.slice(0,7)));
    const previous=s.financeTransactions;
    s.financeTransactions=previous.filter(t=>!months.has((t.date||"").slice(0,7))).concat(clean);
    try{save()}catch(err){s.financeTransactions=previous;throw Error("Недостаточно памяти устройства для сохранения операций")}
    $("financeMonth").value="";
    renderFinance();draw();
    status.textContent="Импортировано "+clean.length+" операций. Записи затронутых месяцев обновлены без дубликатов.";
  }catch(error){status.textContent="Не удалось импортировать: "+(error?.message||String(error));}
  e.target.value="";
});
$("clearFinanceBtn").addEventListener("click",()=>{
  if(!s.financeTransactions.length)return;
  if(!confirm("Удалить все импортированные финансовые операции только с этого устройства? Ручные записи останутся."))return;
  s.financeTransactions=[];save();renderFinance();draw();$("financeImportStatus").textContent="Импортированные операции удалены";
});
$("exportFinanceBtn").addEventListener("click",()=>{
  const content=JSON.stringify({schema:"niti.finance.v1",transactions:s.financeTransactions},null,2);
  const url=URL.createObjectURL(new Blob([content],{type:"application/json;charset=utf-8"}));
  const a=document.createElement("a");a.href=url;a.download="niti-finance-backup.json";document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
});
function excelDay(value){
  if(typeof value==="string"&&/^\d{4}-\d\d-\d\d/.test(value))return value.slice(0,10);
  const n=Number(value);
  if(!Number.isFinite(n))return "";
  return new Date(Date.UTC(1899,11,30)+Math.floor(n)*86400000).toISOString().slice(0,10);
}
async function readFinanceXlsx(file){
  if(!("DecompressionStream" in window))throw Error("Этот браузер не поддерживает чтение XLSX. Можно импортировать JSON.");
  const bytes=new Uint8Array(await file.arrayBuffer()),dv=new DataView(bytes.buffer);
  const decoder=new TextDecoder("utf-8");
  const u16=p=>dv.getUint16(p,true),u32=p=>dv.getUint32(p,true);
  let eocd=-1;
  for(let p=bytes.length-22;p>=Math.max(0,bytes.length-65557);p--)if(u32(p)===0x06054b50){eocd=p;break}
  if(eocd<0)throw Error("Это не корректный файл XLSX");
  const entries=new Map(),count=u16(eocd+10);let p=u32(eocd+16);
  for(let i=0;i<count;i++){
    if(u32(p)!==0x02014b50)throw Error("Ошибка структуры Excel");
    const method=u16(p+10),length=u32(p+20),nameLen=u16(p+28),extra=u16(p+30),comment=u16(p+32),local=u32(p+42);
    const name=decoder.decode(bytes.slice(p+46,p+46+nameLen));
    if(u32(local)!==0x04034b50)throw Error("Ошибка содержимого Excel");
    const at=local+30+u16(local+26)+u16(local+28);
    entries.set(name,{method,data:bytes.slice(at,at+length)});
    p+=46+nameLen+extra+comment;
  }
  async function xmlFile(name){
    const entry=entries.get(name);
    if(!entry)throw Error("В Excel нет "+name);
    let raw=entry.data;
    if(entry.method===8){
      const stream=new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      raw=new Uint8Array(await new Response(stream).arrayBuffer());
    }else if(entry.method!==0)throw Error("Неподдерживаемое сжатие XLSX");
    const doc=new DOMParser().parseFromString(decoder.decode(raw),"application/xml");
    if(doc.getElementsByTagName("parsererror").length)throw Error("Повреждён XML внутри Excel");
    return doc;
  }
  const nodes=(root,name)=>Array.from(root.getElementsByTagNameNS("*",name));
  const shared=[];
  if(entries.has("xl/sharedStrings.xml")){
    const ss=await xmlFile("xl/sharedStrings.xml");
    for(const si of nodes(ss,"si"))shared.push(nodes(si,"t").map(t=>t.textContent||"").join(""));
  }
  const workbook=await xmlFile("xl/workbook.xml"),rels=await xmlFile("xl/_rels/workbook.xml.rels");
  const relation=new Map(nodes(rels,"Relationship").map(x=>[x.getAttribute("Id"),x.getAttribute("Target")]));
  const txns=[];
  function fromRows(sheetName,rows){
    const header=rows[1]||[];
    const col=label=>header.indexOf(label);
    const get=(row,label)=>{const i=col(label);return i>=0?row[i]:null};
    for(let r=2;r<rows.length;r++){
      const row=rows[r],date=excelDay(get(row,"Дата и время"));
      if(!date)continue;
      const common={id:"import-"+sheetName+"-"+r, date};
      if(sheetName==="Переводы"){
        const amount=Number(get(row,"Сумма в исходящей валюте счета"));
        if(!Number.isFinite(amount))continue;
        txns.push({...common,kind:"transfer",accountFrom:get(row,"Исходящий счет")||"",accountTo:get(row,"Входящий счет")||"",
          amountFrom:amount,currencyFrom:get(row,"Валюта исходящего счета")||"",
          amountTo:Number(get(row,"Сумма во входящей валюте счета"))||null,
          currencyTo:get(row,"Валюта входящего счета")||"",comment:get(row,"Комментарий")||""});
      }else{
        const amount=Number(get(row,"Сумма в валюте учета"));
        if(!Number.isFinite(amount))continue;
        txns.push({...common,kind:sheetName==="Доходы"?"income":"expense",
          category:get(row,"Категория")||"",account:get(row,"Счет")||"",amountTry:Math.abs(amount),
          currency:get(row,"Валюта учета")||"TRY",amountAccount:Number(get(row,"Сумма в валюте счета"))||null,
          accountCurrency:get(row,"Валюта счета")||"",tags:get(row,"Теги")||"",comment:get(row,"Комментарий")||""});
      }
    }
  }
  for(const sheet of nodes(workbook,"sheet")){
    const name=sheet.getAttribute("name");
    if(!["Доходы","Расходы","Переводы"].includes(name))continue;
    const id=sheet.getAttribute("r:id")||sheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships","id");
    let target=relation.get(id)||"";
    if(!target)continue;
    target=target.startsWith("/")?target.slice(1):"xl/"+target;
    const parts=[];for(const seg of target.split("/"))if(seg==="..")parts.pop();else if(seg&&seg!==".")parts.push(seg);
    const doc=await xmlFile(parts.join("/")),rows=[];
    for(const row of nodes(doc,"row")){
      const rowN=Number(row.getAttribute("r"))||rows.length+1;
      const out=[];for(const cell of nodes(row,"c")){
        const ref=cell.getAttribute("r")||"",letters=(ref.match(/^[A-Z]+/)||[""])[0];
        let col=0;for(const ch of letters)col=col*26+ch.charCodeAt(0)-64;
        if(!col)continue;
        const raw=nodes(cell,"v")[0]?.textContent||"";
        const type=cell.getAttribute("t");
        const value=type==="s"?(shared[Number(raw)]??""):type==="inlineStr"?nodes(cell,"t").map(x=>x.textContent).join(""):type==="str"?raw:raw===""?null:Number(raw);
        out[col-1]=value;
      }
      rows[rowN-1]=out;
    }
    fromRows(name,rows);
  }
  if(!txns.length)throw Error("В XLSX нет строк доходов, расходов или переводов");
  return {schema:"niti.finance.v1",transactions:txns};
}
