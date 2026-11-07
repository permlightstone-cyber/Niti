// Voice presentation only. Data writes happen in memory-app after explicit confirmation.
// SpeechRecognition can involve the browser provider's online service.
import {proposeVoiceEvent} from "./voice-parser.mjs";
const $=id=>document.getElementById(id);
const WAVE_COLORS={user:"#6ee8bd",assistant:"#b8a6ff"};
const escapeHtml=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export function createVoiceExperience({onSave,onEdit}){
 const userCanvas=$("voiceUserWave"),assistantCanvas=$("voiceAssistantWave");
 const status=$("voiceStatus"),text=$("voiceTranscript"),draft=$("voiceDraft");
 const write=textValue=>{text.textContent=textValue||"Пока ничего не сказано"};
 let stream=null,context=null,analyser=null,buffer=null,recognition=null;
 let listening=false,finalText="",interimText="",cancelled=false,speaking=false;
 let proposal=null,frame=0,raf=0,timeout=null;
 const supported=!!(window.SpeechRecognition||window.webkitSpeechRecognition);
 const speechAvailable=typeof speechSynthesis!=="undefined"&&typeof SpeechSynthesisUtterance!=="undefined";
 function setStatus(label){status.textContent=label}
 function setMicButton(){
  $("voiceMic").textContent=listening?"■ Завершить запись":"● Говорить";
  $("voiceMic").setAttribute("aria-pressed",String(listening));
  $("voiceUserLane").classList.toggle("active",listening);
 }
 function draw(canvas,channel){
  const ctx=canvas.getContext("2d");if(!ctx)return;
  const rect=canvas.getBoundingClientRect(),w=Math.max(220,rect.width||320),h=Math.max(50,rect.height||70);
  const scale=Math.min(2,window.devicePixelRatio||1);
  if(canvas.width!==Math.round(w*scale)||canvas.height!==Math.round(h*scale)){
   canvas.width=Math.round(w*scale);canvas.height=Math.round(h*scale);
  }
  ctx.setTransform(scale,0,0,scale,0,0);
  ctx.clearRect(0,0,w,h);
  const live=channel==="user"?listening:speaking;
  let level=0;
  if(live&&channel==="user"&&analyser&&buffer){
   analyser.getByteTimeDomainData(buffer);
   let acc=0;for(let i=0;i<buffer.length;i++){const v=(buffer[i]-128)/128;acc+=v*v}
   level=Math.min(1,Math.sqrt(acc/buffer.length)*7);
  }else if(live&&channel==="assistant")level=.37+.13*Math.sin(frame*.08);
  const base=h/2,amp=live?Math.max(3,Math.min(h*.34,level*h*.29)):2;
  const points=110;
  ctx.lineWidth=live?2.5:1.4;
  ctx.strokeStyle=WAVE_COLORS[channel];
  ctx.shadowBlur=live?15:0;ctx.shadowColor=WAVE_COLORS[channel];
  ctx.beginPath();
  for(let i=0;i<=points;i++){
   const x=w*i/points,envelope=Math.sin(Math.PI*i/points)**1.4;
   const ripple=Math.sin(i*.68+frame*.13)*.65+Math.sin(i*.29-frame*.045)*.35;
   const y=base+ripple*amp*envelope;
   if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
  }
  ctx.stroke();ctx.shadowBlur=0;
  frame++;
 }
 function loop(){
  if(document.hidden){raf=0;return}
  draw(userCanvas,"user");draw(assistantCanvas,"assistant");
  raf=requestAnimationFrame(loop);
 }
 function startRender(){if(!raf)raf=requestAnimationFrame(loop)}
 document.addEventListener("visibilitychange",()=>{if(!document.hidden)startRender()});
 if(typeof ResizeObserver!=="undefined"){
  const ob=new ResizeObserver(()=>{draw(userCanvas,"user");draw(assistantCanvas,"assistant")});
  ob.observe(userCanvas);ob.observe(assistantCanvas);
 }
 startRender();
 async function releaseMic(){
  if(stream){for(const track of stream.getTracks())track.stop();stream=null}
  if(context){await context.close().catch(()=>{});context=null}
  analyser=null;buffer=null;
 }
 async function prepareMic(){
  if(!navigator.mediaDevices?.getUserMedia)return;
  try{
   stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
   const AudioContext=window.AudioContext||window.webkitAudioContext;
   if(AudioContext){
    context=new AudioContext();const node=context.createMediaStreamSource(stream);
    analyser=context.createAnalyser();analyser.fftSize=1024;buffer=new Uint8Array(analyser.fftSize);
    node.connect(analyser); // No connection to speakers.
   }
  }catch{
   // SpeechRecognition may still work with its own browser microphone access.
   setStatus("Волна недоступна — проверяем распознавание речи");
  }
 }
 function closeDraft(){proposal=null;draft.hidden=true;$("voiceProposedTitle").textContent="";$("voiceProposedMeta").textContent="";$("voiceProposedNotes").textContent="";$("voiceDraftActions").hidden=true}
 function stop(clear=false){
  cancelled=clear;
  if(recognition){try{clear?recognition.abort():recognition.stop()}catch{}}
 }
 async function begin(){
  if(listening){stop(false);return}
  if(!supported){setStatus("В этом браузере распознавание речи недоступно. Можно ввести фразу вручную.");$("voiceManual").focus();return}
  if(speechAvailable)speechSynthesis.cancel();
  cancelled=false;finalText="";interimText="";closeDraft();
  setStatus("Запрашиваем доступ к микрофону…");
  await prepareMic();
  try{
   const Recognizer=window.SpeechRecognition||window.webkitSpeechRecognition;
   recognition=new Recognizer();recognition.lang="ru-RU";recognition.continuous=false;recognition.interimResults=true;recognition.maxAlternatives=1;
   recognition.onstart=()=>{listening=true;setMicButton();setStatus("Слушаю… голос обрабатывается средствами браузера");write("Говори, я покажу текст здесь");};
   recognition.onresult=e=>{
    let parts=[];let interim="";
    for(let i=0;i<e.results.length;i++){
     const value=e.results[i][0]?.transcript?.trim()||"";
     if(e.results[i].isFinal)parts.push(value);else interim+=value+" ";
    }
    finalText=parts.join(" ").trim();interimText=interim.trim();
    write((finalText+" "+interimText).trim());setStatus("Распознавание речи…");
   };
   recognition.onerror=e=>{
    setStatus("Ошибка микрофона или распознавания: "+String(e.error||"неизвестно")+". Используй текстовый ввод.");
    cancelled=true;
   };
   recognition.onend=async()=>{
    listening=false;setMicButton();
    await releaseMic();
    const spoken=finalText||interimText;
    if(!cancelled&&spoken.trim()){setStatus("Распознано. Проверь перед сохранением.");makeProposal(spoken)}
    else if(!cancelled)setStatus("Речь не распознана. Попробуй ещё раз или введи текст.");
    recognition=null;
   };
   recognition.start();
  }catch(error){
   listening=false;setMicButton();await releaseMic();
   setStatus("Не удалось запустить микрофон. Введи текст вручную.");
  }
 }
 function makeProposal(phrase){
  try{
   proposal=proposeVoiceEvent(phrase,new Date());
   draft.hidden=false;$("voiceDraftActions").hidden=false;
   const date=proposal.start?escapeHtml(proposal.start.replace("T"," · ")):"дата не определена";
   $("voiceProposedTitle").textContent=proposal.title;
   $("voiceProposedMeta").textContent=[proposal.kind==="task"?"Задача":"Событие",proposal.category,date].join(" · ");
   $("voiceProposedNotes").textContent=proposal.hints.join(" ")||"Проверь содержимое и подтверди сохранение.";
   write(proposal.transcript);setStatus("Черновик · ещё не сохранено");
   return proposal;
  }catch(error){setStatus(error.message);return null}
 }
 async function accept(){
  if(!proposal)return;
  const candidate=proposal;
  $("voiceSave").disabled=true;
  try{await onSave(candidate);closeDraft();setStatus("Событие сохранено в памяти");}
  catch(e){setStatus("Не сохранено: "+e.message)}
  finally{$("voiceSave").disabled=false}
 }
 $("voiceMic").addEventListener("click",begin);
 $("voiceTextSubmit").addEventListener("click",()=>{
  const value=$("voiceManual").value.trim();
  if(!value){setStatus("Напиши фразу перед добавлением");return}
  makeProposal(value);
 });
 $("voiceManual").addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();$("voiceTextSubmit").click()}});
 $("voiceSave").addEventListener("click",accept);
 $("voiceEdit").addEventListener("click",()=>{if(!proposal)return;onEdit(proposal);closeDraft();setStatus("Проверь и сохрани событие в форме")});
 $("voiceDiscard").addEventListener("click",()=>{closeDraft();setStatus("Черновик отклонён — ничего не записано")});
 $("voiceCancel").addEventListener("click",()=>{stop(true);closeDraft();setStatus("Запись остановлена без сохранения")});
 $("voiceSpeak").addEventListener("click",()=>{
  if(!speechAvailable){setStatus("Озвучивание браузером недоступно");return}
  if(listening){setStatus("Сначала заверши запись");return}
  speechSynthesis.cancel();
  const u=new SpeechSynthesisUtterance("Я здесь. Расскажи о событии, а затем проверь карточку, прежде чем сохранить его в своей памяти.");
  u.lang="ru-RU";u.rate=.98;
  u.onstart=()=>{speaking=true;setStatus("Говорит синтезированный голос браузера")};
  u.onend=u.onerror=()=>{speaking=false;setStatus("Готова слушать")};
  speechSynthesis.speak(u);
 });
 $("voiceFocus").addEventListener("click",()=>{
  const active=$("voicePanel").classList.toggle("compact");
  $("voiceFocus").textContent=active?"Развернуть разговор":"Свернуть разговор";
 });
 setMicButton();
 if(!supported)setStatus("Голосовое распознавание недоступно в этом браузере. Используй текст.");
 else setStatus("Нажми «Говорить», чтобы включить микрофон");
 window.addEventListener("pagehide",()=>{stop(true);releaseMic();if(speechAvailable)speechSynthesis.cancel()});
 return {
  makeProposal,
  onSaveSuccess(color="#6ee8bd",target=null){
   const origin=userCanvas.getBoundingClientRect();
   const timeline=$("memoryTimeline")?.getBoundingClientRect();
   if(!timeline||origin.width===0)return;
   const dot=document.createElement("div");dot.className="voice-flying-thread";dot.style.background=color;
   const startX=origin.left+origin.width*.68,startY=origin.top+origin.height/2;
   dot.style.left=startX+"px";dot.style.top=startY+"px";document.body.appendChild(dot);
   const endX=target?.x??timeline.left+timeline.width*.5,endY=target?.y??timeline.top+timeline.height*.5;
   if(!window.matchMedia("(prefers-reduced-motion: reduce)").matches&&dot.animate){
    const move=dot.animate([
     {transform:"translate(0,0) scale(1)",opacity:1},
     {transform:"translate("+((endX-startX)*.6)+"px,"+((endY-startY)*.65-24)+"px) scale(.75)",opacity:.95,offset:.65},
     {transform:"translate("+(endX-startX)+"px,"+(endY-startY)+"px) scale(.2)",opacity:0}
    ],{duration:950,easing:"cubic-bezier(.22,.7,.2,1)"});
    move.onfinish=()=>dot.remove();move.oncancel=()=>dot.remove();
   }else dot.remove();
  }
 };
}
