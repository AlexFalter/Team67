import {gameConfig} from '../../config/game-config.js';
import {createMoodleEvent} from './moodle-event.js';
const questions=gameConfig.moodle.questions;
const resultLabel=status=>({passed:'Correct!',failed:'Incorrect.',unsubmitted:'Unsubmitted',cancelled:'Event disabled'}[status]);
export function createPhoneQuizzes({notify,changed,onResult=()=>{},onSubmit}){
 let quizzes=[],selected=null,current=null,renderRoot=null;
 let remote={active:false,remaining:0,sequence:0};
 const localEvent=createMoodleEvent({onStart:id=>{const template=questions[Math.floor(Math.random()*questions.length)];current={...template,id,read:false,answer:null,draft:null,status:'active'};quizzes.push(current);notify(`ETH Moodle · ${current.course} · ${gameConfig.moodle.deadlineSeconds}s to answer`,()=>show(id));changed();},onResolve:passed=>{if(!current)return;current.status=passed?'passed':current.answer===null?'unsubmitted':'failed';current.read=true;onResult(passed,current.course,current.id);changed();}});
 const event=onSubmit?{update(){},state:()=>remote,reset(){remote={active:false,remaining:0,sequence:0};},answer(){onSubmit(current.id,current.answer);}}:localEvent;
 const node=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls;n.textContent=text;return n;};
 function show(id){selected=id;const q=quizzes.find(q=>q.id===id);if(q)q.read=true;changed();}
 return {sync(data){
 if(!data.enabled){if(current?.status==='active'){current.status='cancelled';current.read=true;changed();}remote.active=false;return;}
 if(data.id&&data.deadline>data.now&&remote.sequence!==data.id){remote={active:true,remaining:(data.deadline-data.now)/1000,sequence:data.id};current={...questions[data.question],id:data.id,read:false,answer:null,draft:null,status:'active'};quizzes.push(current);notify(`⚠ ETH Moodle · ${current.course} · 30s to answer`,()=>show(data.id));changed();}
 remote.remaining=Math.max(0,(data.deadline-data.now)/1000);remote.active=current?.status==='active'&&remote.remaining>0;
 },resolve(data){if(!current||current.id!==data.id||current.status!=='active')return;current.status=data.passed?'passed':data.submitted===false||(data.submitted===undefined&&current.answer===null)?'unsubmitted':'failed';current.read=true;remote.active=false;onResult(data.passed,current.course,current.id);changed();},unread:()=>quizzes.filter(q=>!q.read).length,back:()=>{selected=null;},selected:()=>selected!==null,
 update(dt,options){event.update(dt,options);if(options?.enabled===false&&current?.status==='active'){current.status='cancelled';current.read=true;changed();}const countdown=renderRoot?.querySelector('.moodle-countdown'),shown=quizzes.find(q=>q.id===selected);if(countdown&&shown)countdown.textContent=shown.status==='active'?`${Math.ceil(event.state().remaining)}s remaining` : resultLabel(shown.status);},
 eventState:()=>event.state(),

 render(content,notifications=false){renderRoot=content;
  const q=quizzes.find(q=>q.id===selected);
  if(q){const panel=node('div',`moodle-quiz${q.status==='active'?' moodle-urgent':''}`,'');if(q.status==='active'){panel.append(node('b','moodle-danger-label','ANSWER FOR A SPEED BOOST'));}panel.append(node('small','moodle-course-label',q.course),node('p','moodle-countdown',q.status==='active'?`${Math.ceil(event.state().remaining)}s remaining`:resultLabel(q.status)),node('h3','','Timed quiz'),node('p','moodle-question',q.question));const form=document.createElement('form');for(const [i,text] of q.options.entries()){const label=node('label','moodle-option',''),input=document.createElement('input');input.type='radio';input.name='answer';input.value=i;input.checked=q.draft===i;input.disabled=q.status!=='active';input.onchange=()=>{q.draft=i;submit.disabled=false;};label.append(input,document.createTextNode(text));form.append(label);}const submit=node('button','moodle-submit','Submit answer');submit.type='submit';submit.disabled=q.status!=='active'||q.draft===null;form.append(submit);form.onsubmit=e=>{e.preventDefault();if(q.status!=='active'||q.draft===null)return;if(q.answer!==null)return;q.answer=q.draft;submit.disabled=true;submit.textContent='Checking…';event.answer(q.answer===q.correct);content.querySelector('.moodle-feedback')?.scrollIntoView({block:'nearest'});};panel.append(form);
   if(q.status==='passed'||q.status==='failed'||q.status==='unsubmitted'){const feedback=node('div',`moodle-feedback ${q.status==='passed'?'correct':q.status==='unsubmitted'?'unsubmitted':'incorrect'}`,q.status==='unsubmitted'?resultLabel(q.status):`${resultLabel(q.status)} ${q.explanation}`);feedback.setAttribute('role','status');panel.append(feedback);}content.append(panel);return;
  }
  content.append(node('h3','moodle-section-title',notifications?'Notifications':'My courses'));
  if(!notifications){const summary=node('p','moodle-summary',`Random quizzes · ${gameConfig.moodle.deadlineSeconds} seconds · Correct answer: +50% speed for ${gameConfig.moodle.boostSeconds}s`);content.append(summary);}
  if(!quizzes.length)content.append(node('p','phone-empty','Your lecturer’s quiz questions will appear here.'));
  for(const q of quizzes){const button=node('button',`moodle-course-card${q.status==='active'?' moodle-urgent-card':''}`,''),icon=node('span','moodle-course-icon',notifications?'♧':'▱'),copy=node('span','',q.course);copy.append(node('small','',resultLabel(q.status)||'Timed quiz · Answer now'));const badge=node('b','moodle-card-badge',q.status==='passed'?'✓':q.status==='failed'?'×':q.status==='unsubmitted'?'—':q.read?'›':'●');button.append(icon,copy,badge);button.onclick=()=>{show(q.id);};content.append(button);}
 },reset(){event.reset();quizzes=[];current=null;selected=null;},state:()=>quizzes.map(q=>({id:q.id,status:q.status,course:q.course,read:q.read,answer:q.answer,correct:q.answer===null?null:q.answer===q.correct}))};
}
