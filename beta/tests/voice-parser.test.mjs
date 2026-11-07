import test from "node:test";
import assert from "node:assert/strict";
import {proposeVoiceEvent} from "../voice-parser.mjs";
const current=new Date(2026,10,7,9,30);
test("Russian day and time range are recognized without inventing extra precision",()=>{
 const e=proposeVoiceEvent("Сегодня с 9 до 11 работал у Леонида, стрижка кустов",current);
 assert.equal(e.start,"2026-11-07T09:00");
 assert.equal(e.end,"2026-11-07T11:00");
 assert.equal(e.spaceId,"work");
 assert.deepEqual(e.links,["Леонида"]);
 assert.equal(e.source.kind,"voice-draft");
 assert.equal(e.confidence,"requires-confirmation");
});
test("ordinary phrase without date does not invent a timestamp",()=>{
 const e=proposeVoiceEvent("Встретился с другом",current);
 assert.equal(e.start,"");
 assert.equal(e.end,"");
 assert.ok(e.hints.some(x=>x.includes("Дата")));
});
test("Russian words and relative dates have correct local meaning",()=>{
 assert.equal(proposeVoiceEvent("Вчера была поездка",current).start,"2026-11-06");
 assert.equal(proposeVoiceEvent("Завтра нужно купить фильтр",current).start,"2026-11-08");
 assert.equal(proposeVoiceEvent("Послезавтра нужно заехать",current).start,"2026-11-09");
 assert.equal(proposeVoiceEvent("Позавчера работал",current).start,"2026-11-05");
});
test("calendar date and time parsing preserves exact minute",()=>{
 const e=proposeVoiceEvent("06.11.2026 в 12:40 купил продукты",current);
 assert.equal(e.start,"2026-11-06T12:40");
 assert.equal(e.end,"");
});
test("tasks and workspaces are proposals, not written events",()=>{
 const a=proposeVoiceEvent("Нужно проверить полив завтра",current);
 assert.equal(a.kind,"task");assert.equal(a.status,"planned");assert.equal(a.spaceId,"work");
 const b=proposeVoiceEvent("Сегодня идея: создать нить памяти",current);
 assert.equal(b.category,"Идея");
});
test("nonsensical date remains unknown rather than being corrected silently",()=>{
 const e=proposeVoiceEvent("31.02.2026 на объекте",current);
 assert.equal(e.start,"");
 assert.ok(e.hints.length);
});
test("input is bounded and requires content",()=>{
 assert.throws(()=>proposeVoiceEvent("  ",current));
 assert.ok(proposeVoiceEvent("а".repeat(5000),current).transcript.length<=4000);
});
