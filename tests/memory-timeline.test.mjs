import test from "node:test";
import assert from "node:assert/strict";
import {timeExtent,eventExtent,dataDomain,presetDomain,zoomDomain,panDomain,ticks,marks,coordinate,MIN_WINDOW} from "../memory-timeline.mjs";
const D=86400000;
test("year/month/day have ranges and never get invented minutes",()=>{
 const y=timeExtent("2024");assert.equal(y.precision,"year");
 assert.equal(new Date(y.end).toISOString().slice(0,10),"2025-01-01");
 const mo=timeExtent("2024-02");assert.equal((mo.end-mo.start)/D,29);
 const day=timeExtent("2024-03-01");assert.equal((day.end-day.start)/D,1);
 const minute=timeExtent("2024-03-01T08:30");assert.equal(minute.end-minute.start,60000);
 assert.equal(timeExtent("2024-02-30"),null);
 assert.equal(timeExtent(""),null);
 assert.equal(eventExtent({title:"unknown",start:""}),null);
});
test("known 2-hour interval is a range; missing time remains imprecise",()=>{
 const r=eventExtent({start:"2026-11-06T09:00",end:"2026-11-06T11:00"});
 assert.equal(r.start,Date.UTC(2026,10,6,9,0));
 assert.equal(r.end,Date.UTC(2026,10,6,11,1));
 assert.equal(r.approximate,false);
 assert.equal(eventExtent({start:"2020"}).approximate,true);
});
test("zoom keeps anchor and prevents escape or microscopic windows",()=>{
 const outer={start:0,end:365*D},full={...outer};
 const a=zoomDomain(full,.2,.35,outer);
 assert.ok(a.start>=0&&a.end<=outer.end);
 assert.ok(Math.abs((a.start+(a.end-a.start)*.35)-outer.end*.35)<1);
 const b=panDomain(a,-50*D,outer);
 assert.equal(b.start,0);
 const c=panDomain(a,500*D,outer);
 assert.equal(c.end,outer.end);
 const tiny=zoomDomain(a,.000000001,.5,outer);
 assert.equal(tiny.end-tiny.start,MIN_WINDOW);
});
test("preset focuses around selected date, all restores domain",()=>{
 const now=Date.UTC(2026,10,7),outer={start:Date.UTC(1984,0,1),end:Date.UTC(2030,0,1)};
 const selected=presetDomain("day",outer,outer,now);
 assert.ok(selected.start<=now&&selected.end>=now);
 assert.ok((selected.end-selected.start)/D<=1.01);
 assert.deepEqual(presetDomain("life",selected,outer,now),outer);
});
test("tick labels adapt from decades to hours",()=>{
 const y={start:Date.UTC(1984,0,1),end:Date.UTC(2027,0,1)};
 const d={start:Date.UTC(2026,10,5),end:Date.UTC(2026,10,9)};
 const hour={start:Date.UTC(2026,10,6,9),end:Date.UTC(2026,10,6,14)};
 assert.ok(ticks(y).length>=3);
 assert.ok(ticks(d).length>=2);
 assert.ok(ticks(hour).some(x=>x.label.includes(":")));
});
test("one event has one mark; crowded same-time events stack",()=>{
 const events=Array.from({length:8},(_,i)=>({id:String(i),title:"Event "+i,start:"2026-11-06",spaceId:"work"}));
 const domain=dataDomain(events,Date.UTC(2026,10,7)),before=JSON.stringify(events);
 const m=marks(events,domain,[{id:"work",color:"#4eb68c"}],500);
 assert.equal(m.length,8);assert.equal(new Set(m.map(x=>x.id)).size,8);
 assert.ok(m.some(x=>x.level!==0));
 assert.equal(m[0].color,"#4eb68c");
 assert.equal(JSON.stringify(events),before);
 assert.ok(coordinate(domain.start,domain,500)>=0);
});
