let managedCourses=readCourses(),managedCourse=null,managedQuestionId='';
const managerElement=id=>document.getElementById(id);
function managerStatus(message){managerElement('managerStatus').textContent=message;}
function saveCourseLibrary(candidate){
  validateCourse(candidate);
  let saved=JSON.parse(localStorage.getItem(COURSE_STORAGE_KEY)||'[]');
  if(!Array.isArray(saved))saved=[];
  saved=saved.filter(c=>c.id!==candidate.id);saved.push(candidate);
  localStorage.setItem(COURSE_STORAGE_KEY,JSON.stringify(saved));
  managedCourses=readCourses();managedCourse=managedCourses.find(c=>c.id===candidate.id);
  managerStatus('저장했습니다. 교사 게임에서 이 단원으로 새 방을 만들어 적용하세요.');
}
function populateManagedCourses(selected){
  const select=managerElement('managerCourse');select.replaceChildren();
  for(const course of managedCourses){const option=document.createElement('option');option.value=course.id;option.textContent=course.subject+' · '+course.title;select.appendChild(option);}
  if(selected)select.value=selected;selectManagedCourse();
}
function selectManagedCourse(){
  managedCourse=managedCourses.find(c=>c.id===managerElement('managerCourse').value);
  managerElement('managerSubject').value=managedCourse.subject;managerElement('managerTitle').value=managedCourse.title;
  const select=managerElement('managerSection');select.replaceChildren();
  for(const section of managedCourse.sections){const option=document.createElement('option');option.value=section.id;option.textContent=section.title+' ('+section.quizzes.length+'문제)';select.appendChild(option);}
  managerElement('managerSearch').value='';renderManagedQuestions();newManagedQuestion();
}
function managedSection(){return managedCourse.sections.find(s=>s.id===Number(managerElement('managerSection').value));}
function renderManagedQuestions(){
  const list=managerElement('managerQuestionList');list.replaceChildren();
  const search=managerElement('managerSearch').value.trim();
  for(const question of managedSection().quizzes.filter(q=>(q.stem+' '+q.explanation).includes(search))){
    const button=document.createElement('button');button.textContent=question.stem;button.setAttribute('aria-pressed',question.id===managedQuestionId);
    button.onclick=()=>editManagedQuestion(question);list.appendChild(button);
  }
}
function editManagedQuestion(question){
  managedQuestionId=question.id;managerElement('editorHeading').textContent='문제 편집';
  managerElement('editorStem').value=question.stem;managerElement('editorExplanation').value=question.explanation;managerElement('editorSource').value=question.source||'';
  question.choices.forEach((choice,i)=>managerElement('editorChoice'+i).value=choice);
  document.querySelector('input[name=correct][value="'+question.correct+'"]').checked=true;renderManagedQuestions();
}
function newManagedQuestion(){
  managedQuestionId='';managerElement('editorHeading').textContent='새 문제 추가';
  ['editorStem','editorExplanation','editorSource',...Array.from({length:4},(_,i)=>'editorChoice'+i)].forEach(id=>managerElement(id).value='');
  document.querySelectorAll('input[name=correct]').forEach(input=>input.checked=false);renderManagedQuestions();
}
function saveManagedQuestion(){
  const radio=document.querySelector('input[name=correct]:checked');if(!radio){managerStatus('정답을 선택하세요.');return;}
  const candidate=JSON.parse(JSON.stringify(managedCourse));
  const section=candidate.sections.find(s=>s.id===managedSection().id);
  const q={id:managedQuestionId||candidate.id+'-'+crypto.randomUUID(),stem:managerElement('editorStem').value.trim(),choices:Array.from({length:4},(_,i)=>managerElement('editorChoice'+i).value.trim()),correct:Number(radio.value),explanation:managerElement('editorExplanation').value.trim(),source:managerElement('editorSource').value.trim(),category:section.title};
  const index=section.quizzes.findIndex(q=>q.id===managedQuestionId);if(index<0)section.quizzes.push(q);else section.quizzes[index]=q;
  try{saveCourseLibrary(candidate);managedQuestionId=q.id;renderManagedQuestions();}catch(error){managerStatus(error.message);}
}
function deleteManagedQuestion(){
  if(!managedQuestionId){managerStatus('삭제할 문제를 선택하세요.');return;}
  const candidate=JSON.parse(JSON.stringify(managedCourse)),section=candidate.sections.find(s=>s.id===managedSection().id);
  section.quizzes=section.quizzes.filter(q=>q.id!==managedQuestionId);
  try{saveCourseLibrary(candidate);newManagedQuestion();}catch(error){managerStatus(error.message);}
}
function saveManagedMetadata(){
  const candidate={...managedCourse,subject:managerElement('managerSubject').value.trim(),title:managerElement('managerTitle').value.trim()};
  try{saveCourseLibrary(candidate);populateManagedCourses(candidate.id);}catch(error){managerStatus(error.message);}
}
function addManagedCourse(){
  const subject=prompt('과목 이름을 입력하세요. 예: 과학');if(!subject)return;
  const title=prompt('단원 이름을 입력하세요.');if(!title)return;
  const course={id:'custom-'+crypto.randomUUID(),subject:subject.trim(),title:title.trim(),sections:[{id:1,title:'기본 퀴즈',quizzes:[{id:'example-'+crypto.randomUUID(),stem:'새 단원의 첫 문제를 입력하세요.',choices:['정답 보기','오답 보기 1','오답 보기 2','오답 보기 3'],correct:0,explanation:'문제를 수정하고 해설을 입력하세요.'}]}]};
  try{saveCourseLibrary(course);populateManagedCourses(course.id);editManagedQuestion(managedCourse.sections[0].quizzes[0]);managerStatus('예시 문제를 실제 문제로 수정한 뒤 방을 만드세요.');}catch(error){managerStatus(error.message);}
}
function addManagedSection(){
  if(managedCourse.sections.length>=6){managerStatus('학습 묶음은 최대 6개입니다.');return;}
  const title=prompt('새 학습 묶음 이름');if(!title)return;
  const candidate=JSON.parse(JSON.stringify(managedCourse));candidate.sections.push({id:candidate.sections.length+1,title,quizzes:[{id:'example-'+crypto.randomUUID(),stem:'새 학습 묶음의 문제를 입력하세요.',choices:['정답 보기','오답 보기 1','오답 보기 2','오답 보기 3'],correct:0,explanation:'이 예시를 실제 문제로 수정하세요.'}]});
  try{saveCourseLibrary(candidate);selectManagedCourse();managerElement('managerSection').value=candidate.sections.length;renderManagedQuestions();editManagedQuestion(managedSection().quizzes[0]);}catch(error){managerStatus(error.message);}
}
function renameManagedSection(){
  const title=prompt('학습 묶음 이름',managedSection().title);if(!title)return;
  const candidate=JSON.parse(JSON.stringify(managedCourse));candidate.sections.find(s=>s.id===managedSection().id).title=title;
  try{saveCourseLibrary(candidate);selectManagedCourse();}catch(error){managerStatus(error.message);}
}
function exportManagedCourse(){
  const blob=new Blob([JSON.stringify(managedCourse,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob);
  const link=document.createElement('a');link.href=url;link.download=managedCourse.id+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function importManagedCourse(file){
  if(!file)return;if(file.size>2000000){managerStatus('2MB 이하의 단원 JSON을 선택하세요.');return;}
  try{const course=JSON.parse(await file.text());validateCourse(course);saveCourseLibrary(course);populateManagedCourses(course.id);}catch(error){managerStatus('가져오기 실패: '+error.message);}
  managerElement('importCourse').value='';
}
populateManagedCourses('social-6-2-1');

function selectManagedSection(){newManagedQuestion();const first=managedSection().quizzes[0];if(first)editManagedQuestion(first);}
