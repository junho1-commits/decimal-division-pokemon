/* Shared by the classroom and the independent question manager. */
const COURSE_STORAGE_KEY='pokemon_subject_units_v1';
const DEFAULT_MATH_QUESTIONS=JSON.parse(JSON.stringify(PROCESS_QUIZZES));
function builtInCourses(){
  return [{id:'math-6-2-2',subject:'수학',title:'6-2 · 2단원 소수의 나눗셈',nativeMath:true,
    sections:Object.entries(DEFAULT_MATH_QUESTIONS).map(([id,quizzes])=>({id:Number(id),title:['나눗셈의 원리','자릿수가 다른 나눗셈','자연수 ÷ 소수','몫의 소수점','몫의 반올림','나머지 활용'][Number(id)-1],quizzes}))},...SUBJECT_UNITS];
}
function validateCourse(course){
  const text=(value,max)=>typeof value==='string' && value.trim().length>0 && value.length<=max;
  if(!course || !/^[a-z0-9-]{1,60}$/.test(course.id)||!text(course.subject,30)||!text(course.title,120))throw Error('과목·단원 이름과 영문 단원 ID를 확인하세요.');
  if(!Array.isArray(course.sections)||!course.sections.length||course.sections.length>6)throw Error('학습 묶음은 1~6개로 구성하세요.');
  if(course.nativeMath && (course.id!=='math-6-2-2'||course.sections.length!==6))throw Error('수학 실습 단원은 기존 6개 학습 묶음을 유지하세요.');
  const ids=new Set();let count=0;
  course.sections.forEach((section,index)=>{
    if(section.id!==index+1 || !text(section.title,80)||!Array.isArray(section.quizzes)||!section.quizzes.length)throw Error('각 학습 묶음에는 이름과 문제가 필요합니다.');
    for(const q of section.quizzes){
      if(!text(q.id,100)||ids.has(q.id)||!text(q.stem,1500)||!Array.isArray(q.choices)||q.choices.length!==4||q.choices.some(c=>!text(c,500))||new Set(q.choices).size!==4||!Number.isInteger(q.correct)||q.correct<0||q.correct>3||!text(q.explanation,2000))throw Error('문제·서로 다른 보기 4개·정답·해설을 확인하세요.');
      ids.add(q.id);count++;
    }
  });
  if(count>(course.nativeMath?1000:300))throw Error(course.nativeMath?'기존 수학 단원은 최대 1000문제를 저장할 수 있습니다.':'한 단원에 최대 300문제를 저장할 수 있습니다.');
  return course;
}
function readCourses(){
  const courses=builtInCourses().map(c=>JSON.parse(JSON.stringify(c)));
  try {
    const saved=JSON.parse(localStorage.getItem(COURSE_STORAGE_KEY)||'[]');
    if(Array.isArray(saved))for(const course of saved){
      try{validateCourse(course);const index=courses.findIndex(c=>c.id===course.id);if(index>=0)courses[index]=course;else courses.push(course);}catch(error){console.warn('Invalid saved course',error);}
    }
  }catch(error){console.warn('Question library could not be loaded',error);}
  return courses;
}
function courseRevision(course){
  const str=JSON.stringify(course);let hash=2166136261;
  for(let i=0;i<str.length;i++)hash=Math.imul(hash^str.charCodeAt(i),16777619);
  return course.id+':'+(hash>>>0).toString(36);
}
