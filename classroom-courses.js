/* Subject/room layer. Keeps Pokemon profiles shared while choosing a room's curriculum. */
let teacherRoomOpened=false;
const mathStageLabels=STAGES_DATA.map(stage=>({title:stage.title,concept:stage.concept}));
const originalNextSoloQuiz=nextSoloQuiz, originalBattleQuizzes=variedBattleQuizzes;
let classroomCourse=readCourses()[0], classroomRevision=courseRevision(classroomCourse);
function applyClassroomCourse(course){
  validateCourse(course);
  const revision=courseRevision(course);
  if(classroomRevision===revision)return;
  classroomCourse=JSON.parse(JSON.stringify(course));classroomRevision=revision;
  currentSoloQuiz=null;soloQuizQueue={};lastSoloQuizId={};teacherSoloQuiz=null;
  studentCurrentStageId=1;studentCurrentPokeIdx=0;gameState.currentStageIndex=1;
  STAGES_DATA.forEach((stage,index)=>{
    const section=classroomCourse.sections[index%classroomCourse.sections.length];
    stage.title=classroomCourse.nativeMath?mathStageLabels[index].title:section.title;
    stage.concept=classroomCourse.nativeMath?mathStageLabels[index].concept:classroomCourse.subject+' · '+section.title;
  });
  document.title='포켓몬 학습 모험 · '+classroomCourse.subject;
  renderStagePreviews();
}
nextSoloQuiz=function(stageId){
  if(classroomCourse.nativeMath){
    // Teacher-edited math reasoning stays separate from the guided calculation bank.
    classroomCourse.sections.forEach(section=>{PROCESS_QUIZZES[section.id]=section.quizzes;});
    return originalNextSoloQuiz(stageId);
  }
  const section=classroomCourse.sections[(stageId-1)%classroomCourse.sections.length];
  const key=classroomCourse.id+':'+section.id;
  if(!soloQuizQueue[key]?.length)soloQuizQueue[key]=shuffledQuizIndices(section.quizzes.length);
  const quiz=shuffledQuiz(section.quizzes[soloQuizQueue[key].shift()]);
  quiz.source=section.quizzes.find(q=>q.id===quiz.id).source;return quiz;
};
variedBattleQuizzes=function(){
  if(classroomCourse.nativeMath && JSON.stringify(classroomCourse.sections.map(s=>s.quizzes))===JSON.stringify(Object.values(DEFAULT_MATH_QUESTIONS)))return originalBattleQuizzes();
  const sections=classroomCourse.sections,chosen=[],used=new Set();
  for(const index of shuffledQuizIndices(sections.length)){const bank=sections[index].quizzes;const q=bank[shuffledQuizIndices(bank.length)[0]];chosen.push(q);used.add(q.id);if(chosen.length===3)break;}
  const remainder=sections.flatMap(s=>s.quizzes).filter(q=>!used.has(q.id));
  for(const index of shuffledQuizIndices(remainder.length)){if(chosen.length===3)break;chosen.push(remainder[index]);}
  return chosen.map(shuffledQuiz);
};
function generateClassroomCode(){
  const values=new Uint32Array(1);crypto.getRandomValues(values);
  return String(currentHostBrokerIdx+1)+String(values[0]%10000000).padStart(7,'0');
}
function commonStudentUrl(){
  const url=new URL(location.href);url.pathname=url.pathname.replace(/[^/]*$/,'student.html');
  url.search='';url.hash='';
  if(['localhost','127.0.0.1'].includes(url.hostname)){
    const params=new URLSearchParams(location.search);if(params.get('hostIp'))url.hostname=params.get('hostIp');
  }
  return url.href;
}
function renderCourseSelectors(){
  const courses=readCourses(),subject=document.getElementById('classroomSubject');
  const previous=subject.value||classroomCourse.subject;
  subject.innerHTML=[...new Set(courses.map(c=>c.subject))].map(name=>'<option>'+escapeClassroomText(name)+'</option>').join('');
  subject.value=previous; if(!subject.value)subject.selectedIndex=0;
  renderCourseUnits();
}
function renderCourseUnits(){
  const units=readCourses().filter(c=>c.subject===document.getElementById('classroomSubject').value);
  const select=document.getElementById('classroomUnit');
  select.innerHTML=units.map(c=>'<option value="'+c.id+'">'+escapeClassroomText(c.title)+' ('+c.sections.reduce((n,s)=>n+s.quizzes.length,0)+'문제)</option>').join('');
  if(units.some(c=>c.id===classroomCourse.id))select.value=classroomCourse.id;
}
function updateClassroomRoomUi(){
  document.getElementById('displayRoomCode').textContent=hostRoomCode;
  document.getElementById('classroomCurrentCourse').textContent=classroomCourse.subject+' · '+classroomCourse.title;
  document.getElementById('commonStudentUrl').textContent=commonStudentUrl();
  document.getElementById('commonStudentUrl').href=commonStudentUrl();
  document.getElementById('teacherCourseTitle').textContent=classroomCourse.subject+' · '+classroomCourse.title;
  document.getElementById('classroomCourseBadge').textContent=classroomCourse.subject+' · '+classroomCourse.title;
}
async function copyCommonStudentUrl(){
  const field=document.getElementById('displayConnectUrl'),previous=field.textContent;
  field.textContent=commonStudentUrl();
  try{await copyStudentJoinUrl();}finally{field.textContent=previous;}
}
function createSubjectRoom(){
  const course=readCourses().find(c=>c.id===document.getElementById('classroomUnit').value);
  if(!course){alert('과목과 단원을 선택하세요.');return;}
  if(gameState.isRaidMode){broadcastRaidEnd();gameState.isRaidMode=false;}
  for(const match of [...pvpMatches.values()])pvpFinish(match,'',true);
  for(const invite of [...pvpInvites.keys()])pvpCloseInvite(invite,'새 수업 방이 만들어졌어요.');
  sendClassroomMessage(mqttHostClient,'broadcast',{type:'ROOM_CLOSED'});
  clearInterval(classroomPulseTimer);clearTimeout(hostRetryTimer);
  if(mqttHostClient){mqttHostClient.onConnectionLost=()=>{};if(mqttHostClient.isConnected())mqttHostClient.disconnect();}
  hostRoomCode=generateClassroomCode();connectedStudents.clear();raidFighters.clear();acceptedAnswers.clear();answerResults.clear();
  applyClassroomCourse(course);classroomCourse=JSON.parse(JSON.stringify(course));classroomRevision=courseRevision(classroomCourse);
  teacherRoomOpened=true;
  try{sessionStorage.setItem('pokemon_current_room',JSON.stringify({code:hostRoomCode,broker:currentHostBrokerIdx,course:classroomCourse,opened:teacherRoomOpened}));}catch(error){}
  showTeacherWorkspace();initHostMQTT();openMultiplayerModal();showMapView();
}
const coursesInit=initMultiplayerSystem;
initMultiplayerSystem=function(){
  const params=new URLSearchParams(location.search),student=params.get('role')==='student';
  if(!student && !params.get('room')){
    try {
      const saved=JSON.parse(sessionStorage.getItem('pokemon_current_room')||'null');
      if(saved&&/^[1-2][0-9]{7}$/.test(saved.code)&&MQTT_BROKERS[saved.broker]){
        teacherRoomOpened=!!saved.opened;validateCourse(saved.course);hostRoomCode=saved.code;currentHostBrokerIdx=saved.broker;applyClassroomCourse(saved.course);
      }else hostRoomCode=generateClassroomCode();
    }catch(error){hostRoomCode=generateClassroomCode();}
    try{sessionStorage.setItem('pokemon_current_room',JSON.stringify({code:hostRoomCode,broker:currentHostBrokerIdx,course:classroomCourse,opened:teacherRoomOpened}));}catch(error){}
  }
  coursesInit();
  if(student&&!params.get('room'))document.getElementById('studentJoinRoomCode').value='';
  renderCourseSelectors();updateClassroomRoomUi();
  if(student)document.getElementById('classroomCourseBadge').textContent='방에 입장하면 선생님이 선택한 과목·단원이 표시됩니다.';
  else showTeacherHome();
};
const coursesModal=openMultiplayerModal;
openMultiplayerModal=function(){renderCourseSelectors();coursesModal();updateClassroomRoomUi();};
const coursesJoin=joinClassroomBattle;
joinClassroomBattle=function(){
  const input=document.getElementById('studentJoinRoomCode');
  const code=input.value.normalize('NFKC').trim().toUpperCase().replace(/[\s-]/g,'');
  const params=new URLSearchParams(location.search);
  const legacy=params.get('room')===input.value.trim() && /^CLASS-[A-Z0-9]{8}$/.test(input.value.trim());
  if(!/^[1-2][0-9]{7}$/.test(code)&&!legacy){document.getElementById('studentJoinError').textContent='선생님이 알려 준 숫자 8자리 방 코드를 입력하세요.';input.focus();return;}
  if(!document.getElementById('studentJoinName').value.trim()){document.getElementById('studentJoinError').textContent='내 번호와 이름을 입력하세요.';return;}
  document.getElementById('studentJoinError').textContent='선생님 연결을 확인하고 있어요. 입장이 안 되면 방 코드를 확인하세요.';
  if(!legacy)currentStudentBrokerIdx=Number(code[0])-1;
  const room=legacy?input.value.trim():code;
  if(room!==hostRoomCode)myStudentId='';
  hostRoomCode=room;input.value=room;coursesJoin();
};
const coursesSend=sendClassroomMessage;
sendClassroomMessage=function(client,suffix,payload){
  if(payload.type==='JOIN')payload={...payload,courseRevision:classroomRevision};
  if(payload.type==='JOIN_ACK'){
    const id=suffix.split('/').pop();
    payload={...payload,courseId:classroomCourse.id,courseRevision:classroomRevision};
    if(connectedStudents.get(id)?.courseRevision!==classroomRevision)payload.course=classroomCourse;
  }
  return coursesSend(client,suffix,payload);
};
const coursesHostIncoming=handleHostIncomingMessage;
handleHostIncomingMessage=function(data){
  // Preserve the requested revision before JOIN handling sends its acknowledgement.
  if(data?.type==='JOIN' && typeof data.studentId==='string'){
    const previous=connectedStudents.get(data.studentId);
    if(previous)previous.courseRevision=data.courseRevision;
  }
  coursesHostIncoming(data);
  if(data?.type==='JOIN' && connectedStudents.has(data.studentId))connectedStudents.get(data.studentId).courseRevision=data.courseRevision;
};
const coursesStudentIncoming=handleStudentIncomingData;
handleStudentIncomingData=function(data){
  if(data?.type==='ROOM_CLOSED'){
    switchStudentProfile();document.getElementById('studentJoinRoomCode').value='';
    document.getElementById('studentJoinError').textContent='새 수업 방이 만들어졌어요. 선생님의 새 방 코드를 입력하세요.';return;
  }
  if(data?.type==='JOIN_ACK' && data.course){
    try{applyClassroomCourse(data.course);}catch(error){setStudentConnection('문제 정보를 받지 못했어요 · 선생님에게 알려 주세요',false);return;}
  }
  coursesStudentIncoming(data);
  if(data?.type==='JOIN_ACK'){
    document.getElementById('studentJoinError').textContent='';
    document.getElementById('classroomCourseBadge').textContent=classroomCourse.subject+' · '+classroomCourse.title;
  }
};
const coursesStageTabs=renderStudentStageTabs;
renderStudentStageTabs=function(){
  if(classroomCourse.nativeMath){coursesStageTabs();return;}
  document.getElementById('studentStageTabs').innerHTML=classroomCourse.sections.map(s=>'<button class="student-stage-tab '+(s.id===studentCurrentStageId?'active':'')+'" onclick="selectStudentStage('+s.id+')">'+escapeClassroomText(s.title)+'</button>').join('');
};

// Keep teacher map labels and evolution challenges on the selected subject too.
const originalCourseMap=renderStagePreviews;
const defaultCourseCards=[...document.querySelectorAll('.stage-card:not(.raid-card)')].map(card=>({title:card.querySelector('h3').textContent,concept:card.querySelector('.concept').textContent,desc:card.querySelector('.desc').textContent,badge:card.querySelector('.stage-badge').textContent}));
renderStagePreviews=function(){
  originalCourseMap();
  document.querySelectorAll('.stage-card:not(.raid-card)').forEach((card,index)=>{
    const section=classroomCourse.sections[index];
    card.style.display=section?'':'none';if(!section)return;
    const labels=defaultCourseCards[index];
    card.querySelector('h3').textContent=classroomCourse.nativeMath?labels.title:section.title;
    card.querySelector('.concept').textContent=classroomCourse.nativeMath?labels.concept:classroomCourse.subject+' · '+section.title;
    card.querySelector('.desc').textContent=classroomCourse.nativeMath?labels.desc:section.quizzes.length+'문제 · 개념과 사례를 연결해 보세요';
    card.querySelector('.stage-badge').textContent=classroomCourse.nativeMath?labels.badge:'학습 묶음 '+section.id;
  });
  const raidConcept=document.querySelector('.raid-card .concept');
  if(raidConcept)raidConcept.textContent=classroomCourse.subject+' 학습 퀴즈로 전설의 보스에 도전';
  document.querySelectorAll('.quick-pill:not(.raid)').forEach((button,index)=>{
    const section=classroomCourse.sections[index];button.hidden=!section;
    if(section)button.textContent=classroomCourse.nativeMath?section.id+'차시':section.title;
  });
};
const courseEvolutionOpen=openEvolutionQuizFromDex,courseEvolutionSubmit=submitEvolutionQuiz;
let courseEvolutionQuestion=null;
openEvolutionQuizFromDex=function(){
  courseEvolutionQuestion=null;courseEvolutionOpen();
  document.getElementById('evoQuizInput').parentElement.style.display='';
  if(classroomCourse.nativeMath||!activeEvoChallenge)return;
  courseEvolutionQuestion=nextSoloQuiz(1);
  document.getElementById('evoQuizQuestion').textContent=courseEvolutionQuestion.stem;
  document.getElementById('evoQuizFormula').innerHTML=courseEvolutionQuestion.choices.map((choice,index)=>'<button type="button" class="teacher-reason-choice" onclick="chooseCourseEvolution('+index+')">'+(index+1)+'. '+escapeClassroomText(choice)+'</button>').join('');
  document.getElementById('evoQuizInput').parentElement.style.display='none';
};
submitEvolutionQuiz=function(){
  if(!courseEvolutionQuestion){courseEvolutionSubmit();return;}
  const choice=Number(document.getElementById('evoQuizInput').value)-1;
  if(choice!==courseEvolutionQuestion.correct){alert(courseEvolutionQuestion.explanation);return;}
  const evolution=activeEvoChallenge;closeEvolutionQuiz();courseEvolutionQuestion=null;triggerEvolutionCutscene(evolution);
};

function chooseCourseEvolution(index){document.getElementById('evoQuizInput').value=String(index+1);submitEvolutionQuiz();}

let homeSelectedSubject='',homeCoursePage=1;
const HOME_PAGE_SIZE=8;
function homeCourseMeta(course){
  const match=course.title.match(/([1-6])\s*[-–]\s*([12])/);
  return {grade:match?match[1]:'',term:match?match[2]:''};
}
function renderTeacherHome(){
  const courses=readCourses(),subjects=[...new Set(courses.map(c=>c.subject))];
  if(!subjects.includes(homeSelectedSubject))homeSelectedSubject=subjects[0]||'';
  document.getElementById('homeSubjectCount').textContent=subjects.length+'과목 · '+courses.length+'단원';
  const icons={'수학':'🔢','사회':'🌏','국어':'📖','과학':'🔬','영어':'💬'};
  document.getElementById('homeSubjectTabs').innerHTML=subjects.map((subject,index)=>'<button type="button" aria-pressed="'+(subject===homeSelectedSubject)+'" onclick="selectHomeSubject('+index+')"><span>'+ (icons[subject]||'📚')+' '+escapeClassroomText(subject)+'</span><small>'+courses.filter(c=>c.subject===subject).length+'단원</small></button>').join('');
  for(const [id,key,label] of [['homeGradeFilter','grade','학년'],['homeTermFilter','term','학기']]){
    const select=document.getElementById(id),value=select.value;
    const values=[...new Set(courses.map(c=>homeCourseMeta(c)[key]).filter(Boolean))].sort();
    select.innerHTML='<option value="">전체 '+label+'</option>'+values.map(v=>'<option value="'+v+'">'+v+label+'</option>').join('');
    select.value=values.includes(value)?value:'';
  }
  renderHomeUnits();
  document.getElementById('homeCurrentCourse').parentElement.hidden=!teacherRoomOpened;
  document.getElementById('homeCurrentCourse').textContent='현재 수업: '+classroomCourse.subject+' · '+classroomCourse.title;
}
function selectHomeSubject(index){homeSelectedSubject=[...new Set(readCourses().map(c=>c.subject))][index]||'';homeCoursePage=1;renderTeacherHome();}
function filterHomeCourses(){homeCoursePage=1;renderHomeUnits();}
function resetHomeFilters(){for(const id of ['homeUnitSearch','homeGradeFilter','homeTermFilter'])document.getElementById(id).value='';filterHomeCourses();}
function changeHomePage(delta){homeCoursePage+=delta;renderHomeUnits();}
function renderHomeUnits(){
  const query=document.getElementById('homeUnitSearch').value.trim().toLocaleLowerCase();
  const grade=document.getElementById('homeGradeFilter').value,term=document.getElementById('homeTermFilter').value;
  const courses=readCourses().filter(c=>{const meta=homeCourseMeta(c);return c.subject===homeSelectedSubject&&(!grade||meta.grade===grade)&&(!term||meta.term===term)&&(!query||(c.title+' '+c.sections.map(s=>s.title).join(' ')).toLocaleLowerCase().includes(query));});
  const pages=Math.max(1,Math.ceil(courses.length/HOME_PAGE_SIZE));homeCoursePage=Math.max(1,Math.min(homeCoursePage,pages));
  document.getElementById('homeUnitsTitle').textContent=homeSelectedSubject+' 단원 선택';
  document.getElementById('homeResultsCount').textContent=courses.length+'개 단원';
  document.getElementById('homeCourseCards').innerHTML=courses.slice((homeCoursePage-1)*HOME_PAGE_SIZE,homeCoursePage*HOME_PAGE_SIZE).map(course=>{
    const count=course.sections.reduce((n,s)=>n+s.quizzes.length,0);
    const color=course.subject==='수학'?'math':course.subject==='사회'?'social':course.subject==='국어'?'korean':'other';
    return '<article class="home-course-card '+color+'"><h3>'+escapeClassroomText(course.title)+'</h3><p>'+course.sections.length+'개 학습 묶음 · '+count+'문제'+(course.nativeMath?' + 계산 실습':'')+'</p><button type="button" onclick="startHomeCourse(&quot;'+course.id+'&quot;)">수업 방 만들기 <span aria-hidden="true">→</span></button></article>';
  }).join('');
  document.getElementById('homeEmpty').hidden=courses.length!==0;
  document.getElementById('homePagination').innerHTML=pages>1?'<button type="button" onclick="changeHomePage(-1)" '+(homeCoursePage===1?'disabled':'')+'>← 이전</button><span>'+homeCoursePage+' / '+pages+'</span><button type="button" onclick="changeHomePage(1)" '+(homeCoursePage===pages?'disabled':'')+'>다음 →</button>':'';
}
function showTeacherHome(){
  if(new URLSearchParams(location.search).get('role')==='student')return;
  renderTeacherHome();document.getElementById('teacherHome').hidden=false;
  document.getElementById('stage').style.display='none';
  document.title='포켓몬 학습 모험 · 과목 선택';
}
function showTeacherWorkspace(){
  document.getElementById('teacherHome').hidden=true;
  document.getElementById('stage').style.display='';resizeViewport();
  document.title='포켓몬 학습 모험 · '+classroomCourse.subject;
}
function resumeTeacherWorkspace(){showTeacherWorkspace();}
function startHomeCourse(courseId){
  const course=readCourses().find(c=>c.id===courseId);if(!course)return;
  renderCourseSelectors();document.getElementById('classroomSubject').value=course.subject;renderCourseUnits();
  document.getElementById('classroomUnit').value=courseId;createSubjectRoom();
}
