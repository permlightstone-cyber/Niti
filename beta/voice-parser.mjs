// Voice-to-memory proposal parser. Pure heuristics, NOT an AI and never an
// authoritative transcription. Explicit confirmation required before saving.
const months=["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
const dateString=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
const dateCheck=s=>{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;
  const [y,m,d]=s.split("-").map(Number),v=new Date(Date.UTC(y,m-1,d));
  return v.getUTCFullYear()===y&&v.getUTCMonth()===m-1&&v.getUTCDate()===d;
};
const clock=(h,m="0")=>{
 const hour=Number(h),minute=Number(m);
 return hour>=0&&hour<=23&&minute>=0&&minute<=59?String(hour).padStart(2,"0")+":"+String(minute).padStart(2,"0"):null;
};
const trimText=text=>String(text||"").trim().replace(/\s+/g," ").slice(0,4000);
export function proposeVoiceEvent(input,now=new Date()){
 const utterance=trimText(input);
 if(!utterance)throw new Error("Сначала произнеси или введи фразу");
 const lower=utterance.toLocaleLowerCase("ru");
 const base=new Date(now.getFullYear(),now.getMonth(),now.getDate());
 let start="",end="",mentionedTime=false,dateReason="";
 const iso=lower.match(/\b(20\d{2}|19\d{2})-(\d{2})-(\d{2})\b/);
 const numeric=lower.match(/\b(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})\b/);
 const named=lower.match(/(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)(?:\s+(\d{4}))?/);
 if(iso){start=iso[0];dateReason="explicit";}
 else if(numeric){start=numeric[3]+"-"+numeric[2].padStart(2,"0")+"-"+numeric[1].padStart(2,"0");dateReason="explicit";}
 else if(named){const index=months.indexOf(named[2]);start=(named[3]||String(now.getFullYear()))+"-"+String(index+1).padStart(2,"0")+"-"+named[1].padStart(2,"0");dateReason="explicit";}
 else if(/\bпозавчера\b/.test(lower)){base.setDate(base.getDate()-2);start=dateString(base);dateReason="relative";}
 else if(/\bвчера\b/.test(lower)){base.setDate(base.getDate()-1);start=dateString(base);dateReason="relative";}
 else if(/\bпослезавтра\b/.test(lower)){base.setDate(base.getDate()+2);start=dateString(base);dateReason="relative";}
 else if(/\bзавтра\b/.test(lower)){base.setDate(base.getDate()+1);start=dateString(base);dateReason="relative";}
 else if(/\bсегодня\b/.test(lower)){start=dateString(base);dateReason="relative";}
 if(start&&!dateCheck(start)){start="";dateReason="invalid";}
 const range=lower.match(/(?:\bс\s+)(\d{1,2})(?::(\d{2}))?\s*(?:до|по|[-–—])\s*(\d{1,2})(?::(\d{2}))?(?!\d)/);
 const atTime=lower.match(/\bв\s+(\d{1,2}):(\d{2})(?!\d)/);
 if(start&&range){
  const a=clock(range[1],range[2]),b=clock(range[3],range[4]);
  if(a&&b&&b>=a){start+="T"+a;end=start.slice(0,10)+"T"+b;mentionedTime=true}
 }else if(start&&atTime){
  const t=clock(atTime[1],atTime[2]);if(t){start+="T"+t;mentionedTime=true}
 }
 const task=/\b(надо|нужно|купить|запланир|напомни|сделать|заехать|позвонить|закажи|планирую|проверить)\b/u.test(lower)||
   /\b(надо|нужно)\s+\S+/u.test(lower);
 const idea=/\b(идея|придумал|предлагаю|думаю|хочу чтобы|хочу, чтобы|мысль|концепц)\b/u.test(lower);
 const work=/\b(работал|работала|работы|стрижк|подстриг|газон|сад|объект|бассейн|полив|туи|куст|уборк|бахче|bahçe)\b/u.test(lower);
 const kind=task?"task":"event",status=task?"planned":"completed";
 const spaceId=work?"work":"personal";
 const category=idea?"Идея":work?"Работа":task?"Дела":"Воспоминание";
 let title=utterance.replace(/[.!?]+$/,"");
 if(title.length>130)title=title.slice(0,127)+"…";
 // Extract only the explicit client phrase. Never manufacture identity links.
 const person=utterance.match(/\bу\s+([А-ЯЁ][а-яё]{2,}(?:\s+[А-ЯЁ][а-яё]+)?)/u);
 const links=person?[person[1]]:[];
 const noteParts=[];
 if(!start)noteParts.push("Дата из речи не определена. Укажи её при необходимости.");
 if(!mentionedTime&&start)noteParts.push("Точное время не сообщено.");
 if(dateReason==="relative")noteParts.push("Относительная дата определена по дате устройства.");
 return {
   title,kind,status,start,end,spaceId,category,links,
   notes:utterance,
   tags:[],fields:{},source:{kind:"voice-draft",ref:""},
   hints:noteParts,transcript:utterance,
   confidence:"requires-confirmation"
 };
}
