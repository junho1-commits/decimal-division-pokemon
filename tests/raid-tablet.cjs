const assert=require('node:assert/strict');
const path=require('node:path');
const os=require('node:os');
const {chromium}=require(path.join(process.env.CODEX_NODE_MODULES||path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'),'playwright'));
const {createServer}=require('../server.cjs');
(async()=>{
  const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({headless:true,channel:'msedge'});
  try {
    for(const [width,height] of [[600,960],[800,1280],[1280,800],[1024,600],[390,844]]) {
      const page=await browser.newPage({viewport:{width,height},hasTouch:true});
      await page.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1')?route.continue():route.abort());
      await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});
      await page.evaluate(()=>{
        document.getElementById('stage').style.display='none';
        document.getElementById('viewStudentController').style.display='flex';
        document.getElementById('studentJoinBox').style.display='none';
        document.getElementById('studentRaidBox').style.display='flex';
        loadStudentProfile('태블릿검사');
        studentCaughtList=[...adventureCatalog.keys()].slice(0,24);
        selectedStudentPokemon=studentCaughtList[0];renderStudentCollection();
      });
      const geometry=await page.evaluate(()=>{
        const grid=document.getElementById('studentRaidTeam');
        const cards=[...grid.querySelectorAll('button')];
        const failures=cards.filter(card=>{const r=card.getBoundingClientRect();return r.width<110||r.height<144||r.right>innerWidth;}).length;
        grid.scrollTop=grid.scrollHeight;const before=grid.scrollTop;
        renderStudentCollection();
        return {failures,before,after:grid.scrollTop,overflow:document.documentElement.scrollWidth>innerWidth};
      });
      assert.equal(geometry.failures,0);assert.equal(geometry.overflow,false);
      assert.ok(geometry.before>0);assert.equal(geometry.after,geometry.before);
      await page.locator('#studentRaidTeam button').last().tap();
      assert.equal(await page.evaluate(()=>selectedStudentPokemon===studentCaughtList.at(-1)),true);
      assert.equal(await page.locator('#studentRaidTeam button[aria-pressed="true"]').count(),1);
      console.log(`PASS ${width}x${height}: touch selection, card sizes, scroll preservation, no overflow`);
      await page.close();
    }
  } finally {await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
