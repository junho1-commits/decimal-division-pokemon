const assert=require('node:assert/strict'),path=require('node:path'),os=require('node:os');
const {chromium}=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const {createServer}=require('../server.cjs');
(async()=>{
 const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{for(const [width,height] of [[1280,900],[800,1280],[390,844]]){
  const page=await browser.newPage({viewport:{width,height},hasTouch:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());
  await page.goto(base+'/index.html?hostIp=127.0.0.1');
  assert.equal(await page.locator('#teacherHome').isVisible(),true);assert.equal(await page.locator('#stage').isVisible(),false);
  assert.equal(await page.locator('.home-course-card').count(),4);assert.equal(await page.locator('.learning-home-resume').isVisible(),false);
  assert.equal(await page.title(),'포켓몬 학습 모험 · 과목 선택');
  assert.equal(await page.evaluate(()=>document.getElementById('teacherHome').scrollWidth>innerWidth),false);
  assert.equal(await page.evaluate(()=>document.querySelector('.learning-home-header').getBoundingClientRect().bottom<=document.querySelector('.learning-home-hero').getBoundingClientRect().top),true);
  await page.screenshot({path:`tmp/learning-home-${width}.png`,animations:'disabled'});
  for(const [subject,id] of [['social','social-6-2-1'],['social','social-6-2-2'],['korean','korean-6-2-4'],['math','math-6-2-2']]){
   await page.locator('.home-course-card button').filter({hasText:''}).evaluateAll((buttons,id)=>buttons.find(b=>b.getAttribute('onclick').includes(id)).click(),id);
   assert.equal(await page.evaluate(()=>classroomCourse.id),id);
   assert.equal(await page.locator('#teacherHome').isVisible(),false);
   assert.equal(await page.locator('#stage').isVisible(),true);
   assert.match(await page.locator('#displayRoomCode').textContent(),/^[12][0-9]{7}$/);
   await page.evaluate(()=>closeMultiplayerModal());
   await page.getByRole('button',{name:'📚 과목 선택',exact:true}).tap();
   assert.equal(await page.locator('#teacherHome').isVisible(),true);
   assert.equal(await page.locator('.learning-home-resume').isVisible(),true);
  }
  const code=await page.evaluate(()=>hostRoomCode);await page.reload();
  assert.equal(await page.evaluate(()=>hostRoomCode),code);assert.equal(await page.locator('#teacherHome').isVisible(),true);
  await page.getByRole('button',{name:'현재 수업 화면으로 →',exact:true}).tap();assert.equal(await page.locator('#stage').isVisible(),true);
  await page.goto(base+'/student.html');await page.waitForURL('**/index.html?role=student');assert.equal(await page.locator('#teacherHome').isVisible(),false);
  assert.equal(await page.locator('#studentJoinBox').isVisible(),true);assert.deepEqual(errors,[]);
  console.log(`PASS ${width}x${height}: neutral subject home, all 4 course rooms, return/resume, reload, student entry, no clipping`);await page.close();
 }}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
