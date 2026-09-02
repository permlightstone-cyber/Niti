const $=id=>document.getElementById(id);
const KEY="niti-clean-v2";
const LEGACY_KEYS=["niti-clean-v1","niti-live-lab","niti-live-lab-v14"];
const base={
  profile:{name:"",birthDate:""},
  layers:{threads:true,events:true,plans:true,finance:true,activity:true},
  threads:[],events:[],plans:[],finance:[],activity:[]
};
let restored=null;
for(const key of [KEY,...LEGACY_KEYS]){try{const value=JSON.parse(localStorage.getItem(key)||"null");if(value){restored=value;break}}catch{}}
let s=restored||structuredClone(base);
s={...base,...s,profile:{...base.profile,...(s.profile||{})},layers:{...base.layers,...(s.layers||{})}};
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
    for(const f of s.finance){
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

