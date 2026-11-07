// Pure timeline math. UTC is used as a NOMINAL wall-clock coordinate: event timezone
// is NOT inferred or converted. Month/year/day precision remains an interval.
const M=60000,H=60*M,D=24*H;
export const MIN_WINDOW=10*M;
export const PRESETS={life:null,years:10*365.2425*D,year:365.2425*D,month:31*D,day:D,hours:4*H};
const good=n=>Number.isFinite(n);
function parseTime(value){
  if(!value||typeof value!=="string")return null;
  const m=value.match(/^(\d{4})(?:-(\d{2})(?:-(\d{2})(?:T(\d{2}):(\d{2}))?)?)?$/);
  if(!m)return null;
  const y=Number(m[1]),mo=Number(m[2]||1),d=Number(m[3]||1),h=Number(m[4]||0),mi=Number(m[5]||0);
  const ms=Date.UTC(y,mo-1,d,h,mi);
  const verify=new Date(ms);
  if(verify.getUTCFullYear()!==y||verify.getUTCMonth()!==mo-1||verify.getUTCDate()!==d||
     verify.getUTCHours()!==h||verify.getUTCMinutes()!==mi)return null;
  return {ms,year:y,month:mo,day:d,hour:h,minute:mi,
    precision:value.length===4?"year":value.length===7?"month":value.length===10?"day":"minute"};
}
export function timeExtent(value){
  const p=parseTime(value);
  if(!p)return null;
  const {year:y,month:mo,day:d,ms,precision}=p;
  const end=precision==="year"?Date.UTC(y+1,0,1):
     precision==="month"?Date.UTC(y,mo,1):
     precision==="day"?Date.UTC(y,mo-1,d+1):ms+M;
  return {start:ms,end,precision};
}
export function eventExtent(event){
  const start=timeExtent(event.start);
  if(!start)return null;
  const last=event.end?timeExtent(event.end):null;
  return {...start,end:Math.max(start.end,last?.end??start.end),approximate:start.precision!=="minute"||!!event.timeApproximate};
}
export function dataDomain(events=[],nowMs=Date.now()){
  const year=new Date(nowMs).getUTCFullYear();
  const dated=events.map(eventExtent).filter(Boolean);
  if(!dated.length)return {start:Date.UTC(year-1,0,1),end:Date.UTC(year+1,0,1),count:0};
  const rawStart=Math.min(...dated.map(d=>d.start));
  const rawEnd=Math.max(nowMs,...dated.map(d=>d.end));
  const span=Math.max(rawEnd-rawStart,7*D);
  const margin=Math.min(span*.025,60*D);
  return {start:rawStart-margin,end:rawEnd+margin,count:dated.length};
}
export function panDomain(domain,shift,outer){
  const width=domain.end-domain.start,full=outer.end-outer.start;
  if(width>=full)return {start:outer.start,end:outer.end};
  let start=domain.start+shift;
  start=Math.max(outer.start,Math.min(outer.end-width,start));
  return {start,end:start+width};
}
export function zoomDomain(domain,ratio,anchor=0.5,outer){
  if(!outer||!good(ratio)||ratio<=0)return domain;
  const full=outer.end-outer.start,oldWidth=domain.end-domain.start;
  const width=Math.min(full,Math.max(MIN_WINDOW,oldWidth*ratio));
  if(width>=full)return {start:outer.start,end:outer.end};
  const position=domain.start+oldWidth*Math.max(0,Math.min(1,anchor));
  return panDomain({start:position-width*Math.max(0,Math.min(1,anchor)),
    end:position+width*(1-Math.max(0,Math.min(1,anchor)))},0,outer);
}
export function presetDomain(preset,domain,outer,focusMs=Date.now()){
  if(!PRESETS.hasOwnProperty(preset))return domain;
  if(preset==="life")return {start:outer.start,end:outer.end};
  const full=outer.end-outer.start;
  const width=Math.min(full,Math.max(MIN_WINDOW,PRESETS[preset]));
  const focus=Math.max(outer.start,Math.min(outer.end,focusMs));
  return panDomain({start:focus-width/2,end:focus+width/2},0,outer);
}
export function coordinate(ms,domain,width,left=22,right=20){
  const room=Math.max(1,width-left-right);
  return left+(ms-domain.start)/(domain.end-domain.start)*room;
}
export function ticks(domain,locale="ru-RU",maxTicks=10){
  const span=domain.end-domain.start,limit=Math.max(4,maxTicks);
  const ticks=[];
  const format=(ms,options)=>new Date(ms).toLocaleDateString(locale,{timeZone:"UTC",...options});
  // Tick precision follows the visible window, not the precision of a single event.
  let cursor,step,move,label;
  if(span>3*365.2425*D){
    const years=span/(365.2425*D),options=[1,2,5,10,20,50,100],n=options.find(x=>years/x<=limit)||100;
    const y=new Date(domain.start).getUTCFullYear();
    cursor=Date.UTC(Math.ceil(y/n)*n,0,1);
    move=ms=>Date.UTC(new Date(ms).getUTCFullYear()+n,0,1);
    label=ms=>String(new Date(ms).getUTCFullYear());
  }else if(span>85*D){
    const n=span>2*365*D?6:span>365*D?3:span>180*D?2:1;
    const d=new Date(domain.start),month=Math.ceil((d.getUTCFullYear()*12+d.getUTCMonth())/n)*n;
    cursor=Date.UTC(Math.floor(month/12),month%12,1);
    move=ms=>{const d=new Date(ms);return Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+n,1)};
    label=ms=>format(ms,{month:"short",year:"numeric"});
  }else if(span>2*D){
    const n=span>45*D?7:span>16*D?3:1;
    cursor=Math.ceil(domain.start/D)*D;
    move=ms=>ms+n*D;
    label=ms=>format(ms,{day:"numeric",month:"short"});
  }else{
    const stepOptions=[15*M,30*M,H,2*H,3*H,6*H,12*H],n=stepOptions.find(x=>span/x<=limit)||12*H;
    cursor=Math.ceil(domain.start/n)*n;
    move=ms=>ms+n;
    label=ms=>{
      const d=new Date(ms);
      return String(d.getUTCHours()).padStart(2,"0")+":"+String(d.getUTCMinutes()).padStart(2,"0");
    };
  }
  for(let i=0;good(cursor)&&cursor<=domain.end&&i<100;i++,cursor=move(cursor)){
    if(cursor>=domain.start)ticks.push({at:cursor,label:label(cursor)});
  }
  return ticks;
}
export function marks(events,domain,spaces,width){
  const palette=new Map(spaces.map(s=>[s.id,s.color]));
  const records=[];
  for(const event of events){
    const range=eventExtent(event);
    if(!range||range.end<domain.start||range.start>domain.end)continue;
    const x=coordinate(range.start,domain,width);
    const stop=coordinate(range.end,domain,width);
    const color=/^#[\da-f]{6}$/i.test(palette.get(event.spaceId)||"")?palette.get(event.spaceId):"#9b86e8";
    records.push({id:event.id,title:event.title,spaceId:event.spaceId,x,endX:stop,
      color,approximate:range.approximate,kind:event.kind,status:event.status});
  }
  // Same-position events stack instead of disappearing over each other.
  const occupancy=new Map();
  records.sort((a,b)=>a.x-b.x);
  for(const m of records){
    const cell=Math.floor(m.x/14);
    const count=occupancy.get(cell)||0;
    m.level=count%5;m.overlap=count;
    occupancy.set(cell,count+1);
  }
  return records;
}
