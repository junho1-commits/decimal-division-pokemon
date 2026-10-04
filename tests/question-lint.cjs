const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {auditQuestions,report}=require('../scripts/lint-questions.cjs');
const root=path.resolve(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'pokemon-lint-'));
try{
 fs.mkdirSync(path.join(temp,'questions'));for(const f of ['process-quizzes.js','course-library.js'])fs.copyFileSync(path.join(root,f),path.join(temp,f));
 fs.writeFileSync(path.join(temp,'questions/manifest.js'),"module.exports=['fixture.js','missing.js'];");
 const q={id:'duplicate-q',stem:'다음 그림에서 알맞은 것은?',choices:['가','나','다','아주 길고 구체적인 설명을 담은 정답 보기입니다'],correct:3,explanation:'해설',source:''};
 const course={id:'fixture',subject:'시험',title:'시험 단원',sections:[{id:1,title:'묶음',quizzes:[q,{...q,choices:['모두 정답','1번과 3번','다','라'],correct:7}]}]};
 fs.writeFileSync(path.join(temp,'questions/fixture.js'),'SUBJECT_UNITS.push('+JSON.stringify(course)+');');fs.writeFileSync(path.join(temp,'questions/unregistered.js'),'/* empty */');
 const result=auditQuestions(temp),messages=result.issues.map(i=>i.message).join('\n');
 for(const needle of ['등록된 파일이 없음','manifest에 등록되지 않은 파일','문항 ID 중복','보기 길이 편차','순서 의존','화면에 없는 자료','출처 누락','최장'])assert.ok(messages.includes(needle==='최장'?'정답이 가장 긴 보기':needle),needle);
 assert.ok(result.issues.some(i=>i.severity==='오류'&&i.id==='duplicate-q'));assert.ok(report(result).includes('duplicate-q'));assert.equal(fs.readFileSync(path.join(temp,'questions/fixture.js'),'utf8'),'SUBJECT_UNITS.push('+JSON.stringify(course)+');');
 console.log('PASS: invalid answers, duplicate IDs, missing registration/files, length/position/source/reference warnings and read-only audit');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
