/* Browser-local assessment records; uses the existing classroom transport only. */
const LEARNING_RECORD_KEY='pokemon_learning_records_v1',LEARNING_RECORD_LIMIT=10000;
let learningRecords=[],learningStorageWarning='',learningReviewMode=false,learningReviewIndex=0,learningSoloQuiz=null;
const learningTimers={solo:{key:'',at:Date.now()},raid:{key:'',at:Date.now()},pvp:{key:'',at:Date.now()}};
try{const saved=JSON.parse(localStorage.getItem(LEARNING_RECORD_KEY)||'[]');if(Array.isArray(saved))learningRecords=saved.filter(r=>r&&typeof r.eventId==='string'&&typeof r.correct==='boolean'&&typeof r.courseId==='string').slice(-LEARNING_RECORD_LIMIT);}catch(e){learningStorageWarning='저장된 학습 기록을 불러오지 못했습니다.';}
function learningTimer(mode,key){if(learningTimers[mode].key!==key)learningTimers[mode]={key,at:Date.now()};}
function learningElapsed(mode){return Math.min(86400000,Math.max(0,Date.now()-learningTimers[mode].at));}
function learningIdentity(name){const text=String(name||'').slice(0,100),match=text.match(/^\s*(\d+)\s*(?:번)?\s*[-.:]?\s*(.+)$/);return {number:match?match[1]:'',name:match?match[2].trim():text};}
function learningQuestionInfo(quiz){
 const id=String(quiz.id||'').slice(0,100),section=classroomCourse.sections.find(s=>s.quizzes.some(q=>q.id===id));
 return {questionId:id||'generated:'+String(quiz.stem||quiz.question||'').slice(0,80),section:section?.title||'계산 실습·게임 문제',stem:String(quiz.stem||quiz.question||'').slice(0,1500)};
}
function makeLearningRecord(quiz,choice,correct,mode,eventId,elapsedMs,name){
 const chosen=quiz.kind==='guided'?String(choice):String(quiz.choices?.[choice]??choice??'').slice(0,500);
 return {eventId:String(eventId).slice(0,160),...learningIdentity(name),courseId:classroomCourse.id,subject:classroomCourse.subject,course:classroomCourse.title,...learningQuestionInfo(quiz),choice:chosen,correct:!!correct,mode,elapsedMs:Math.min(86400000,Math.max(0,Number(elapsedMs)||0)),at:new Date().toISOString()};
}
function appendLearningRecord(record){
 if(learningRecords.some(r=>r.eventId===record.eventId))return false;
 learningRecords.push(record);if(learningRecords.length>LEARNING_RECORD_LIMIT){learningRecords.splice(0,learningRecords.length-LEARNING_RECORD_LIMIT);learningStorageWarning='최근 10,000건을 보관합니다. 이전 기록은 CSV로 내보내 주세요.';}
 try{localStorage.setItem(LEARNING_RECORD_KEY,JSON.stringify(learningRecords));}catch(e){learningStorageWarning='기기 저장 공간 문제로 기록이 현재 화면에만 보관됩니다. 닫기 전에 CSV로 내보내 주세요.';}
 if(!document.getElementById('learningRecordsPanel').hidden)renderLearningRecords();return true;
}
function recordHostLearning(studentId,quiz,choice,correct,mode,eventId,elapsedMs){
 const student=connectedStudents.get(studentId);if(!student)return;
 const record=makeLearningRecord(quiz,choice,correct,mode,eventId,elapsedMs,student.name);appendLearningRecord(record);
 sendClassroomMessage(mqttHostClient,'to_student/'+studentId,{type:'LEARNING_RESULT',courseId:classroomCourse.id,eventId,correct,quiz:{id:quiz.id,stem:quiz.stem||quiz.question,choices:quiz.choices,correct:quiz.correct,explanation:quiz.explanation}});
}
function learningProfile(){
 if(!activeStudentProfile)return null;
 const p=activeStudentProfile;if(!Array.isArray(p.learningPending))p.learningPending=[];if(!Array.isArray(p.learningWrong))p.learningWrong=[];if(!Array.isArray(p.learningSeen))p.learningSeen=[];return p;
}
function rememberLearningOutcome(quiz,correct,eventId,courseId=classroomCourse.id){
 const p=learningProfile();if(!p||p.learningSeen.includes(eventId))return;
 p.learningSeen.push(eventId);p.learningSeen=p.learningSeen.slice(-1000);
 p.learningWrong=p.learningWrong.filter(q=>!(q.courseId===courseId&&q.quiz.id===quiz.id));
 if(!correct&&quiz.id&&Array.isArray(quiz.choices))p.learningWrong.push({courseId,quiz:JSON.parse(JSON.stringify(quiz))});
 p.learningWrong=p.learningWrong.slice(-200);saveStudentProfile();updateLearningReviewStatus();
}
function recordSoloLearning(quiz,correct,choice){
 const p=learningProfile();if(!p)return;
 const eventId=crypto.randomUUID();let selected=choice;
 if(quiz.kind==='guided')selected=[...document.querySelectorAll('#studentSoloOptions input')].map(e=>e.value).join(' / ');
 const record=makeLearningRecord(quiz,selected,correct,learningReviewMode?'review':'solo',eventId,learningElapsed('solo'),myStudentName);
 rememberLearningOutcome(quiz,correct,eventId);
 p.learningPending.push({room:hostRoomCode,record});p.learningPending=p.learningPending.slice(-1000);saveStudentProfile();flushLearningPending();
}
function flushLearningPending(){
 if(!studentReady||!mqttStudentClient?.isConnected())return;
 for(const event of learningProfile()?.learningPending||[])if(event.room===hostRoomCode&&event.record.courseId===classroomCourse.id){const {name,number,...record}=event.record;sendClassroomMessage(mqttStudentClient,'to_host',{type:'LEARNING_EVENT',studentId:myStudentId,record});}
}
const learningHostIncoming=handleHostIncomingMessage;
handleHostIncomingMessage=function(data){
 if(data?.type==='LEARNING_EVENT'){
  const student=connectedStudents.get(data.studentId),r=data.record;
  if(!student||!r||r.courseId!==classroomCourse.id||!['solo','review'].includes(r.mode)||typeof r.correct!=='boolean'||typeof r.eventId!=='string'||r.eventId.length>160||typeof r.questionId!=='string'||typeof r.stem!=='string')return;
  const clean={eventId:r.eventId,...learningIdentity(student.name),courseId:classroomCourse.id,subject:classroomCourse.subject,course:classroomCourse.title,questionId:r.questionId.slice(0,100),section:String(r.section||'').slice(0,80),stem:r.stem.slice(0,1500),choice:String(r.choice||'').slice(0,500),correct:r.correct,mode:r.mode,elapsedMs:Math.min(86400000,Math.max(0,Number(r.elapsedMs)||0)),at:typeof r.at==='string'&&!Number.isNaN(Date.parse(r.at))?r.at:new Date().toISOString()};
  appendLearningRecord(clean);sendClassroomMessage(mqttHostClient,'to_student/'+data.studentId,{type:'LEARNING_ACK',eventId:r.eventId});return;
 }
 learningHostIncoming(data);
};
const learningStudentIncoming=handleStudentIncomingData;
handleStudentIncomingData=function(data){
 if(data?.type==='LEARNING_ACK'){const p=learningProfile();if(p){p.learningPending=p.learningPending.filter(e=>e.record.eventId!==data.eventId);saveStudentProfile();}return;}
 if(data?.type==='LEARNING_RESULT'){if(data.courseId===classroomCourse.id)rememberLearningOutcome(data.quiz,data.correct,data.eventId,data.courseId);return;}
 learningStudentIncoming(data);
 if(data?.type==='RAID_START')learningTimer('raid',data.problemId);
 if(data?.type==='PVP_ROUND')learningTimer('pvp',data.matchId+':'+data.round);
 if(data?.type==='JOIN_ACK')flushLearningPending();
};
setInterval(flushLearningPending,5000);
const learningSoloRender=renderStudentSoloGame;
renderStudentSoloGame=function(){learningSoloRender();if(currentSoloQuiz!==learningSoloQuiz){learningSoloQuiz=currentSoloQuiz;learningTimers.solo={key:currentSoloQuiz?.id||'',at:Date.now()};}updateLearningReviewStatus();};
const learningNextSolo=nextSoloQuiz;
nextSoloQuiz=function(stageId){
 if(learningReviewMode){const list=(learningProfile()?.learningWrong||[]).filter(e=>e.courseId===classroomCourse.id);if(list.length)return JSON.parse(JSON.stringify(list[learningReviewIndex++%list.length].quiz));learningReviewMode=false;}
 return learningNextSolo(stageId);
};
function updateLearningReviewStatus(){
 const count=(learningProfile()?.learningWrong||[]).filter(e=>e.courseId===classroomCourse.id).length;
 document.getElementById('studentReviewButton').textContent=learningReviewMode?'일반 학습으로 돌아가기':'오답 복습 ('+count+')';
 document.getElementById('studentReviewStatus').textContent=learningReviewMode?'오답 복습 중 · 정답 보상은 일반 학습과 같아요.':count?'이 단원에서 틀린 '+count+'문항을 다시 풀 수 있어요.':'';
}
function toggleLearningReview(){
 const count=(learningProfile()?.learningWrong||[]).filter(e=>e.courseId===classroomCourse.id).length;
 if(!learningReviewMode&&!count){document.getElementById('studentReviewStatus').textContent='이 단원에 복습할 오답이 없습니다.';return;}
 learningReviewMode=!learningReviewMode;learningReviewIndex=0;currentSoloQuiz=null;soloCaptureBusy=false;renderStudentSoloGame();
}
const learningApplyCourse=applyClassroomCourse;
applyClassroomCourse=function(course){if(course.id!==classroomCourse.id)learningReviewMode=false;learningApplyCourse(course);};
function learningAggregate(records,key){
 const groups=new Map();for(const r of records){const id=key(r);if(!groups.has(id))groups.set(id,{label:id,total:0,right:0,last:r});const group=groups.get(id);group.total++;group.right+=r.correct?1:0;group.last=r;}return [...groups.values()].map(g=>({...g,rate:Math.round(g.right/g.total*100)}));
}
function learningTable(headers,rows){return '<table><thead><tr>'+headers.map(h=>'<th scope="col">'+escapeClassroomText(h)+'</th>').join('')+'</tr></thead><tbody>'+ (rows.length?rows.map(row=>'<tr>'+row.map(cell=>'<td>'+escapeClassroomText(String(cell))+'</td>').join('')+'</tr>').join(''):'<tr><td colspan="'+headers.length+'">아직 학습 기록이 없습니다.</td></tr>')+'</tbody></table>';}
function openLearningRecords(){
 learningRecordsFocus=document.activeElement;const select=document.getElementById('learningRecordCourse'),courses=new Map(readCourses().map(c=>[c.id,c.title]));for(const r of learningRecords)courses.set(r.courseId,r.course);
 select.innerHTML='<option value="">전체 단원</option>'+[...courses].map(([id,title])=>'<option value="'+escapeClassroomText(id)+'">'+escapeClassroomText(title)+'</option>').join('');
 document.getElementById('learningRecordsPanel').hidden=false;renderLearningRecords();select.focus();
}
let learningRecordsFocus=null;
function closeLearningRecords(){document.getElementById('learningRecordsPanel').hidden=true;learningRecordsFocus?.focus?.();}
function filteredLearningRecords(){const id=document.getElementById('learningRecordCourse').value;return learningRecords.filter(r=>!id||r.courseId===id);}
function renderLearningRecords(){
 const records=filteredLearningRecords(),right=records.filter(r=>r.correct).length;
 document.getElementById('learningRecordSummary').textContent=records.length+'회 제출 · '+right+'회 정답 · 정답률 '+(records.length?Math.round(right/records.length*100):0)+'% (재도전 포함)';
 document.getElementById('learningRecordStorageStatus').textContent=learningStorageWarning;
 const courses=learningAggregate(records,r=>r.courseId),students=learningAggregate(records,r=>r.number+' '+r.name),questions=learningAggregate(records,r=>r.courseId+' / '+r.questionId).sort((a,b)=>a.rate-b.rate);
 document.getElementById('learningCourseTable').innerHTML=learningTable(['과목','단원','제출','정답','정답률'],courses.map(g=>[g.last.subject,g.last.course,g.total,g.right,g.rate+'%']));
 document.getElementById('learningStudentTable').innerHTML=learningTable(['번호','이름','제출','정답','오답','정답률','최근 학습'],students.map(g=>[g.last.number,g.last.name,g.total,g.right,g.total-g.right,g.rate+'%',new Date(g.last.at).toLocaleString('ko-KR')]));
 const questionRows=list=>list.map(g=>[g.last.course,g.last.section,g.last.questionId,g.last.stem,g.total,g.rate+'%']);
 for(const [id,list] of [['learningWeakTable',questions.filter(g=>g.rate<60)],['learningQuestionTable',questions]])document.getElementById(id).innerHTML=learningTable(['단원','묶음','문항 ID','문제','제출','정답률'],questionRows(list));
}
function learningCsv(records){
 const escape=value=>{let text=String(value??'');if(/^[\s]*[=+\-@]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';};
 const modes={solo:'개별(기기 판정)',review:'오답 복습(기기 판정)',raid:'레이드',pvp:'친구 대전'};
 const rows=[['번호','이름','과목','단원','묶음','문항 ID','문제','선택','정답 여부','소요 시간(초)','시각','학습 방식'],...records.map(r=>[r.number,r.name,r.subject,r.course,r.section,r.questionId,r.stem,r.choice,r.correct?'정답':'오답',(r.elapsedMs/1000).toFixed(1),r.at,modes[r.mode]||r.mode])];
 return '\uFEFF'+rows.map(row=>row.map(escape).join(',')).join('\r\n');
}
function downloadLearningCsv(){const blob=new Blob([learningCsv(filteredLearningRecords())],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='학습기록-'+new Date().toISOString().slice(0,10)+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
window.addEventListener('keydown',event=>{const panel=document.getElementById('learningRecordsPanel');if(panel.hidden)return;if(event.key==='Escape'){closeLearningRecords();event.preventDefault();}if(event.key==='Tab'){const nodes=[...panel.querySelectorAll('button,select')],first=nodes[0],last=nodes.at(-1);if(event.shiftKey&&document.activeElement===first){last.focus();event.preventDefault();}else if(!event.shiftKey&&document.activeElement===last){first.focus();event.preventDefault();}}});
