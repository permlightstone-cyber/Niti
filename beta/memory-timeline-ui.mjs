import {dataDomain,panDomain,zoomDomain,presetDomain,coordinate,ticks,marks,eventExtent} from "./memory-timeline.mjs";
// Visual timeline is a view: never writes to storage and never changes event dates.
export function createMemoryTimeline({canvas,label,hint,openEvent}){
  const ctx=canvas.getContext("2d");
  if(!ctx)return {render(){}};
  let outer=null,domain=null,all=[],spaces=[],points=[],pointers=new Map();
  let activeDrag=null,initialDistance=0,lastDistance=0,gesture=false;
  const minW=200,padL=22,padR=22;
  function size(){
    const rect=canvas.getBoundingClientRect();
    const width=Math.max(minW,Math.round(rect.width||320));
    const height=Math.round(rect.height||228);
    const dpr=Math.min(3,Math.max(1,window.devicePixelRatio||1));
    if(canvas.width!==Math.round(width*dpr)||canvas.height!==Math.round(height*dpr)){
      canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
    }
    ctx.setTransform(dpr,0,0,dpr,0,0);
    return {width,height};
  }
  function stamp(ms,short=false){
    const d=new Date(ms);
    if(!Number.isFinite(d.getTime()))return "";
    const day=String(d.getUTCDate()).padStart(2,"0"),month=String(d.getUTCMonth()+1).padStart(2,"0");
    return (short?day+"."+month:day+"."+month+"."+d.getUTCFullYear());
  }
  function redraw(){
    if(!domain||!outer)return;
    const {width,height}=size();
    ctx.clearRect(0,0,width,height);
    ctx.fillStyle="#0c1729";ctx.fillRect(0,0,width,height);
    ctx.lineWidth=1;
    const grid=ticks(domain,"ru-RU",Math.max(4,Math.floor(width/72)));
    ctx.font="11px system-ui";ctx.textAlign="center";ctx.textBaseline="middle";
    for(const tick of grid){
      const x=coordinate(tick.at,domain,width,padL,padR);
      ctx.strokeStyle="rgba(174,194,235,.10)";
      ctx.beginPath();ctx.moveTo(x,25);ctx.lineTo(x,height-25);ctx.stroke();
      ctx.fillStyle="#8d9fb7";ctx.fillText(tick.label,x,14);
    }
    const axisY=height-46;
    ctx.strokeStyle="rgba(156,144,235,.55)";ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(padL,axisY);ctx.lineTo(width-padR,axisY);ctx.stroke();
    const now=Date.now();
    if(now>=domain.start&&now<=domain.end){
      const x=coordinate(now,domain,width,padL,padR);
      ctx.strokeStyle="#d7bb83";ctx.lineWidth=1.5;
      ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(x,30);ctx.lineTo(x,axisY+12);ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle="#dfc69c";ctx.textAlign=x>width-70?"right":"left";
      ctx.fillText("Сейчас",x+(x>width-70?-6:6),height-24);ctx.textAlign="center";
    }
    points=marks(all,domain,spaces,width).map(p=>({...p,y:axisY-20-(p.level*25)}));
    for(const p of points){
      const x=Math.max(padL,Math.min(width-padR,p.x));
      ctx.globalAlpha=p.status==="cancelled"?.28:p.status==="planned"?.65:.94;
      if(p.endX-p.x>8 && p.endX>padL){
        ctx.strokeStyle=p.color;ctx.lineWidth=p.approximate?3:6;
        if(p.approximate)ctx.setLineDash([3,5]);
        ctx.beginPath();ctx.moveTo(x,p.y);ctx.lineTo(Math.min(width-padR,p.endX),p.y);ctx.stroke();ctx.setLineDash([]);
      }
      ctx.beginPath();ctx.arc(x,p.y,5.6,0,Math.PI*2);
      ctx.fillStyle=p.color;ctx.fill();
      ctx.lineWidth=1;ctx.strokeStyle="#0c1729";ctx.stroke();
      ctx.globalAlpha=1;
    }
    const visibleCount=points.length;
    const unknown=all.filter(e=>!e.start).length;
    ctx.font="11px system-ui";ctx.fillStyle="#9cabc2";ctx.textAlign="left";
    ctx.fillText(visibleCount+" событий в обзоре"+(unknown?" · "+unknown+" без даты":""),padL,height-17);
    if(label){
      const rangeDays=(domain.end-domain.start)/86400000;
      const detail=rangeDays>365*4?"годы":rangeDays>90?"месяцы":rangeDays>2?"дни":rangeDays>.125?"часы":"минуты";
      label.textContent=stamp(domain.start)+" — "+stamp(domain.end)+" · "+detail;
    }
    if(hint && !gesture)hint.textContent="Двумя пальцами — масштаб · одним — перемещение · нажми на точку";
  }
  function pointerX(e){
    const box=canvas.getBoundingClientRect();
    return Math.max(0,Math.min(box.width,e.clientX-box.left));
  }
  function zoom(ratio,anchor=.5){domain=zoomDomain(domain,ratio,anchor,outer);redraw()}
  function shift(deltaPixels){
    const rect=canvas.getBoundingClientRect(),working=Math.max(1,rect.width-padL-padR);
    const shift=-deltaPixels/working*(domain.end-domain.start);
    domain=panDomain(domain,shift,outer);redraw();
  }
  function onDown(e){
    e.preventDefault();canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId,{x:pointerX(e),y:e.clientY});
    if(pointers.size===1){activeDrag={x:pointerX(e),y:e.clientY,moved:0};gesture=false}
    else if(pointers.size===2){
      const v=[...pointers.values()];
      initialDistance=lastDistance=Math.abs(v[0].x-v[1].x);gesture=true;activeDrag=null;
    }
  }
  function onMove(e){
    if(!pointers.has(e.pointerId))return;
    e.preventDefault();
    const x=pointerX(e),last=pointers.get(e.pointerId);
    pointers.set(e.pointerId,{x,y:e.clientY});
    if(pointers.size===2){
      const v=[...pointers.values()],distance=Math.abs(v[0].x-v[1].x);
      if(distance>8&&lastDistance>8){
        zoom(lastDistance/distance,((v[0].x+v[1].x)/2)/Math.max(1,canvas.getBoundingClientRect().width));
      }
      lastDistance=distance;return;
    }
    if(activeDrag){
      const distance=Math.abs(x-activeDrag.x)+Math.abs(e.clientY-activeDrag.y);
      activeDrag.moved=Math.max(activeDrag.moved,distance);
      if(activeDrag.moved>4)shift(x-last.x);
    }
  }
  function onUp(e){
    if(!pointers.has(e.pointerId))return;
    const pos=pointerX(e),y=e.clientY-canvas.getBoundingClientRect().top;
    pointers.delete(e.pointerId);
    if(activeDrag && activeDrag.moved<7 && !gesture){
      const nearest=points.filter(p=>Math.abs(p.x-pos)<15&&Math.abs(p.y-y)<18)
       .sort((a,b)=>Math.abs(a.x-pos)+Math.abs(a.y-y)-Math.abs(b.x-pos)-Math.abs(b.y-y))[0];
      if(nearest)openEvent(nearest.id);
    }
    activeDrag=null;
    if(!pointers.size){gesture=false;initialDistance=0;lastDistance=0}
  }
  canvas.addEventListener("pointerdown",onDown,{passive:false});
  canvas.addEventListener("pointermove",onMove,{passive:false});
  canvas.addEventListener("pointerup",onUp);
  canvas.addEventListener("pointercancel",onUp);
  canvas.addEventListener("wheel",e=>{
    e.preventDefault();
    const rect=canvas.getBoundingClientRect();
    zoom(e.deltaY<0?.78:1.28,Math.max(0,Math.min(1,(e.clientX-rect.left)/Math.max(1,rect.width))));
  },{passive:false});
  canvas.addEventListener("keydown",e=>{
    if(["ArrowRight","ArrowLeft","=","+","-","Home"].includes(e.key)){
      e.preventDefault();
      if(e.key==="Home")domain={...outer};
      else if(e.key==="ArrowRight")shift(-60);
      else if(e.key==="ArrowLeft")shift(60);
      else zoom(e.key==="-"?1.5:.66);
      redraw();
    }
  });
  if(typeof ResizeObserver!=="undefined")new ResizeObserver(redraw).observe(canvas);
  else window.addEventListener("resize",redraw);
  return {
    render(events,knownSpaces){
      all=events;spaces=knownSpaces;
      const next=dataDomain(events);
      if(!outer||!domain){outer=next;domain={start:outer.start,end:outer.end}}
      else{
        const fullBefore=outer.end-outer.start;
        const changed=next.start!==outer.start||Math.abs(next.end-outer.end)>60000;
        if(changed){
          const oldSpan=domain.end-domain.start;
          const wasAll=oldSpan>=fullBefore*.999;
          outer=next;
          domain=wasAll?{start:outer.start,end:outer.end}:panDomain(domain,0,outer);
        }
      }
      redraw();
    },
    focusEvent(event){
      if(!domain||!outer)return null;
      const extent=eventExtent(event);
      if(!extent)return null;
      const focus=(extent.start+extent.end)/2,span=Math.max(86400000,Math.min(outer.end-outer.start,domain.end-domain.start));
      domain=panDomain({start:focus-span/2,end:focus+span/2},0,outer);
      redraw();
      const point=points.find(p=>p.id===event.id);
      if(!point)return null;
      const bounds=canvas.getBoundingClientRect();
      return {x:bounds.left+point.x,y:bounds.top+point.y};
    },
    preset(name){if(!domain)return;domain=presetDomain(name,domain,outer,Date.now());redraw()},
    zoomIn(){if(domain)zoom(.5)},
    zoomOut(){if(domain)zoom(2)},
    reset(){if(outer){domain={start:outer.start,end:outer.end};redraw()}}
  };
}
