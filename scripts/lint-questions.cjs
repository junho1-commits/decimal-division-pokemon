const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
function auditQuestions(base=root){
 const registered=require(path.join(base,'questions/manifest.js'));
 const files=fs.readdirSync(path.join(base,'questions')).filter(f=>f.endsWith('.js')&&!['manifest.js','load.js'].includes(f)).sort();
 const issues=[],stats=[];let questionCount=0;
 const add=(severity,file,id,message)=>issues.push({severity,file,id,message});
 const ctx=vm.createContext({console,localStorage:{getItem:()=>null},SUBJECT_UNITS:[]});
 vm.runInContext(fs.readFileSync(path.join(base,'process-quizzes.js'),'utf8'),ctx);
 for(const file of files){
  if(!registered.includes(file))add('경고',file,'등록','manifest에 등록되지 않은 파일');
  try{vm.runInContext(fs.readFileSync(path.join(base,'questions',file),'utf8'),ctx,{timeout:3000,filename:file});}catch(e){add('오류',file,'파일',e.message);}
 }
 for(const file of registered)if(!files.includes(file))add('오류',file,'등록','등록된 파일이 없음');
 vm.runInContext(fs.readFileSync(path.join(base,'course-library.js'),'utf8')+'\nglobalThis.auditCourses=builtInCourses();globalThis.checkCourse=validateCourse;',ctx);
 const allIds=new Set(),courseIds=new Set();
 for(const course of ctx.auditCourses){
  const file=course.nativeMath?'process-quizzes.js':files.find(f=>f===course.id+'.js')||course.id;
  if(courseIds.has(course.id))add('오류',file,course.id,'단원 ID 중복');courseIds.add(course.id);
  try{ctx.checkCourse(course);}catch(e){add('오류',file,course.id,e.message);}
  const quizzes=(course.sections||[]).flatMap(s=>s.quizzes||[]),positions=[0,0,0,0];let longest=0;
  const prefixes=new Map();
  for(const section of course.sections||[]){
   const forms=new Map();
   for(const q of section.quizzes||[]){
    questionCount++;const id=q.id||'(ID 없음)';
    try{ctx.checkCourse({id:'lint-check',subject:'검수',title:'검수',sections:[{id:1,title:'검수',quizzes:[q]}]});}catch(e){add('오류',file,id,e.message);}
    if(allIds.has(id))add('오류',file,id,'전체 문제 파일에서 문항 ID 중복');allIds.add(id);
    if(!Array.isArray(q.choices))continue;
    const lengths=q.choices.map(v=>String(v).trim().length);
    if(Number.isInteger(q.correct)&&q.correct>=0&&q.correct<4){positions[q.correct]++;if(lengths[q.correct]===Math.max(...lengths))longest++;}
    if(Math.max(...lengths)>=20&&Math.max(...lengths)>Math.max(1,Math.min(...lengths))*2)add('경고',file,id,'보기 길이 편차가 큼 ('+lengths.join('/')+')');
    if(/위의? 보기|모두 정답|\d\s*번\s*(과|와|및)\s*\d\s*번/.test(q.choices.join(' ')))add('경고',file,id,'순서 의존 또는 모두 정답 표현');
    if(/(위|다음|아래|앞)의?\s*(지도|그림|그래프|표|사진)/.test(q.stem||'')&&!q.image)add('경고',file,id,'화면에 없는 자료를 가리킬 가능성');
    if(typeof q.source!=='string'||!/(?:교과서|수학|사회|국어|과학|영어).*\d+\s*(?:[~～–-]\s*\d+\s*)?쪽/.test(q.source))add('경고',file,id,'교과서 인쇄 쪽수 출처 누락 또는 형식 확인 필요');
    const prefix=(q.stem||'').replace(/\s+/g,' ').slice(0,20);
    if(prefix.length===20){if(prefixes.has(prefix))add('경고',file,id,'질문 첫 20자 반복: '+prefixes.get(prefix));else prefixes.set(prefix,id);}
    const form=(q.stem||'').match(/(알맞은 것은|옳은 것은|옳지 않은 것은|무엇인가요|무엇일까요|어떤 것인가요)/)?.[0];
    if(form){const ids=forms.get(form)||[];ids.push(id);forms.set(form,ids);}
   }
   for(const [form,ids] of forms)if(ids.length>=4)add('경고',file,ids.join(', '),'묶음 안 질문 형식 '+JSON.stringify(form)+' '+ids.length+'회 반복');
  }
  const total=quizzes.length,ratio=total?longest/total:0;
  if(ratio>.3)add('경고',file,course.id,'정답이 가장 긴 보기인 비율 '+(ratio*100).toFixed(1)+'% (동률 포함, 기준 30%)');
  positions.forEach((count,i)=>{if(total&&count/total>.4)add('경고',file,course.id,'정답 위치 '+i+' 비율 '+(count/total*100).toFixed(1)+'% (기준 40%)');});
  stats.push({id:course.id,total,positions,longestRatio:(ratio*100).toFixed(1)+'%'});
 }
 return {issues,stats,questionCount};
}
function report(result){
 const safe=v=>String(v).replace(/\|/g,'\\|').replace(/[\r\n]/g,' ');
 return '# 문제 자동 검수 결과\n\n자동 검수는 문항의 사실·정답·쪽수를 교과서와 대조한 검토를 대신하지 않습니다. 경고는 검토 대상으로만 기록하며 문제를 수정하지 않습니다.\n\n'+
 `${result.stats.length}단원 · ${result.questionCount}문항 · 오류 ${result.issues.filter(i=>i.severity==='오류').length}건 · 경고 ${result.issues.filter(i=>i.severity!=='오류').length}건\n\n`+
 '| 단원 | 문항 수 | 정답 위치 0/1/2/3 | 정답 최장 보기 비율(동률 포함) |\n|---|---:|---|---|\n'+result.stats.map(s=>`| ${s.id} | ${s.total} | ${s.positions.join('/')} | ${s.longestRatio} |`).join('\n')+
 '\n\n## 검토할 항목\n\n| 구분 | 파일 | 문항 ID | 사유 |\n|---|---|---|---|\n'+result.issues.map(i=>'| '+[i.severity,i.file,i.id,i.message].map(safe).join(' | ')+' |').join('\n')+'\n';
}
if(require.main===module){const result=auditQuestions();const out=path.join(root,'검토요청/lint-결과.md');fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,report(result));console.log(`${result.stats.length} units, ${result.questionCount} questions, ${result.issues.filter(i=>i.severity==='오류').length} errors, ${result.issues.filter(i=>i.severity!=='오류').length} warnings; report: ${out}`);if(result.issues.some(i=>i.severity==='오류'))process.exitCode=1;}
module.exports={auditQuestions,report};
