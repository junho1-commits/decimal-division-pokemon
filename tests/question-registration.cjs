const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const {chromium}=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
(async()=>{
 const root=path.resolve(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'pokemon-registration-'));
 let browser,server;
 try{
  for(const f of ['index.html','포켓몬_소수의나눗셈.html','process-quizzes.js','guided-practice.js','classroom-adventure.js','classroom-courses.js','learning-records.js','course-library.js','adventure.css','question-manager.html','question-manager.js','question-manager.css','student.html','server.cjs'])fs.copyFileSync(path.join(root,f),path.join(temp,f));
  fs.cpSync(path.join(root,'questions'),path.join(temp,'questions'),{recursive:true});
  fs.cpSync(path.join(root,'vendor'),path.join(temp,'vendor'),{recursive:true});
  const course={id:'science-test',subject:'과학',title:'6-2 · 등록 시험 단원',sections:[{id:1,title:'시험 묶음',quizzes:[{id:'science-test-q',stem:'등록 시험 질문',choices:['가','나','다','라'],correct:1,explanation:'검증용 해설',source:'교과서 10쪽'}]}]};
  fs.writeFileSync(path.join(temp,'questions/science-test.js'),'globalThis.SUBJECT_UNITS=globalThis.SUBJECT_UNITS||[];SUBJECT_UNITS.push('+JSON.stringify(course)+');');
  const manifest=path.join(temp,'questions/manifest.js');fs.writeFileSync(manifest,fs.readFileSync(manifest,'utf8').replace('const files=[',"const files=[\n 'science-test.js',"));
  server=require(path.join(temp,'server.cjs')).createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+server.address().port;
  assert.equal((await fetch(base+'/questions/science-test.js')).status,200);assert.equal((await fetch(base+'/questions/not-registered.js')).status,404);
  browser=await chromium.launch({headless:true,channel:'msedge'});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());
  await page.goto(base+'/index.html');await page.locator('#homeSubjectTabs button').filter({hasText:'과학'}).click();await page.locator('.home-course-card button').click();assert.equal(await page.evaluate(()=>classroomCourse.id),'science-test');
  await page.goto(base+'/question-manager.html');await page.locator('#managerCourse').selectOption('science-test');assert.equal(await page.locator('#managerQuestionList button').textContent(),'등록 시험 질문');assert.deepEqual(errors,[]);
  fs.mkdirSync(path.join(temp,'tests'));fs.writeFileSync(path.join(temp,'tests/multiplayer.cjs'),fs.readFileSync(path.join(root,'tests/multiplayer.cjs'),'utf8')+`
const fixtureHost=context('http://localhost/index.html');fixtureHost.run('initMultiplayerSystem();applyClassroomCourse(readCourses().find(c=>c.id==="science-test"))');flush();
const fixtureStudent=context(fixtureHost.el('displayConnectUrl').textContent||'http://localhost/index.html?role=student&room='+fixtureHost.run('hostRoomCode'));fixtureStudent.run('initMultiplayerSystem()');fixtureStudent.el('studentRoomCode').value=fixtureHost.run('hostRoomCode');fixtureStudent.el('studentJoinName').value='등록시험';fixtureStudent.run('joinClassroomBattle()');flush();assert.equal(fixtureStudent.run('classroomCourse.id'),'science-test');assert.equal(fixtureStudent.run('nextSoloQuiz(1).stem'),'등록 시험 질문');
`);
  execFileSync(process.execPath,['tests/multiplayer.cjs'],{cwd:temp,stdio:'pipe'});
  console.log('PASS: new file + one manifest entry reaches teacher, manager, server and student room; unregistered paths blocked');
 }finally{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
