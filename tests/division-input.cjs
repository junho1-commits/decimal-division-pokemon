const assert=require('node:assert/strict');
const path=require('node:path');
const os=require('node:os');
const {chromium}=require(path.join(process.env.CODEX_NODE_MODULES||path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'),'playwright'));
const {createServer}=require('../server.cjs');

(async()=>{
  const server=createServer();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({headless:true,channel:'msedge'});
  try {
    for(const width of [390,768,1024]) {
      const page=await browser.newPage({viewport:{width,height:900}});
      await page.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1')?route.continue():route.abort());
      await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});
      const result=await page.evaluate(()=>{
        document.getElementById('stage').style.display='none';
        document.getElementById('viewStudentController').style.display='flex';
        document.getElementById('studentJoinBox').style.display='none';
        document.getElementById('studentSoloBox').style.display='flex';
        const failures=[];
        for(const quiz of Object.values(GUIDED_QUIZZES).flat())for(let index=0;index<quiz.methods.length;index++){
          const method=quiz.methods[index];
          if(method.type!=='division')continue;
          const current={...quiz,methodIndex:index};
          renderGuidedPractice('studentSoloOptions',current);
          const digits=[...document.querySelectorAll('#studentSoloOptions .division-digit')];
          for(const row of method.rows)for(const offset of [1,2]){
            const fieldIndex=row.offset+offset;
            const cells=guidedFieldInputs('studentSoloOptions',fieldIndex);
            const length=method.fields[fieldIndex].answer.length;
            if(cells.length!==length)failures.push(quiz.id+': cell count');
            cells.forEach((cell,digit)=>{
              const actual=cell.getBoundingClientRect(), expected=digits[row.end-length+digit+1].getBoundingClientRect();
              if(Math.abs(actual.x-expected.x)>1||Math.abs(actual.width-expected.width)>1)failures.push(quiz.id+': shifted digit');
            });
          }
          method.fields.forEach((field,fieldIndex)=>{
            const cells=guidedFieldInputs('studentSoloOptions',fieldIndex);
            cells.forEach((cell,digit)=>cell.value=cells.length===1?field.answer:field.answer[digit]);
          });
          if(assessGuidedPractice('studentSoloOptions',current)!==true)failures.push(quiz.id+': correct answer rejected');
        }
        const quiz=GUIDED_QUIZZES[2].find(item=>item.methods.some(method=>method.type==='division'&&method.fields.some(field=>field.answer.length>1)));
        const current={...quiz,methodIndex:quiz.methods.findIndex(method=>method.type==='division')};
        renderGuidedPractice('studentSoloOptions',current);
        const fieldIndex=guidedMethod(current).fields.findIndex(field=>field.answer.length>1);
        const cells=guidedFieldInputs('studentSoloOptions',fieldIndex);
        cells[0].focus();cells[0].value='3';cells[0].dispatchEvent(new Event('input',{bubbles:true}));
        if(document.activeElement!==cells[1])failures.push('typing did not advance to next digit');
        cells[1].value='';cells[1].dispatchEvent(new KeyboardEvent('keydown',{key:'Backspace',bubbles:true}));
        if(document.activeElement!==cells[0])failures.push('backspace did not return to previous digit');
        return failures;
      });
      assert.deepEqual(result,[],width+'px division input');
      console.log('PASS '+width+'px: fixed digit columns, correct answers, typing and backspace');
      await page.close();
    }
  } finally {await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
