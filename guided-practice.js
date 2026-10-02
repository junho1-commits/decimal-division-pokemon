/* Teacher guide pp.210,218–221,224–246: meaning, methods, place value and context. */
const GUIDED_QUIZZES = {1:[],2:[],3:[],4:[],5:[],6:[]};
function practiceNumber(n) { return Number(n.toFixed(8)).toString(); }
function practiceField(label, answer, hint) { return {label,answer:String(answer),hint}; }
function divisionMethod(a,b,factor,decimalPlaces=0,roundPlaces=null,wholeOnly=false) {
  const dividend=practiceNumber(a*factor), divisor=Math.round(b*factor);
  const originalDigits=dividend.replace('.',''), point=dividend.includes('.')?dividend.indexOf('.'):dividend.length;
  let digits=originalDigits, carry=0, rows=[], fields=[];
  const max=wholeOnly?point:Math.max(digits.length,point+(roundPlaces===null?decimalPlaces:roundPlaces+1));
  digits=digits.padEnd(max,'0');
  for(let i=0;i<max;i++) {
    const partial=carry*10+Number(digits[i]), digit=Math.floor(partial/divisor), product=digit*divisor;
    carry=partial-product;
    if(!rows.length && digit===0 && i<point-1)continue;
    const offset=fields.length;
    fields.push(practiceField('몫의 '+(i<point?'자연수 자리':'소수 '+(i-point+1)+'째 자리'),digit,'내려온 수를 나누는 수로 나누어 이 자리에 쓸 숫자를 구해요.'));
    fields.push(practiceField('곱해서 빼는 수',product,'나누는 수 × 이 자리의 몫을 계산해요.'));
    fields.push(practiceField('빼고 남은 수',carry,'내려온 수에서 곱한 수를 빼요. 이 수가 나누는 수보다 작은지 확인해요.'));
    rows.push({partial,end:i,offset});
    if(!wholeOnly && roundPlaces===null && i>=originalDigits.length-1 && carry===0)break;
  }
  if(roundPlaces===null && !wholeOnly)digits=digits.slice(0,rows[rows.length-1].end+1);
  const quotient=wholeOnly?Math.floor(a/b):roundPlaces===null?practiceNumber(a/b):(Math.round((a/b)*10**roundPlaces+1e-9)/10**roundPlaces).toFixed(roundPlaces);
  fields.push(practiceField(wholeOnly?'가득 채우는 통 수':roundPlaces===null?'완성한 몫':'반올림한 몫',quotient,wholeOnly?'통 수는 자연수 부분까지만 구해요.':'몫의 소수점은 바꾼 나누어지는 수의 소수점 위에 맞춰요.'));
  if(wholeOnly)fields.push(practiceField('원래 단위로 남는 양',practiceNumber(a-b*Math.floor(a/b)),'바꾼 식에서 남은 수는 '+factor+'배 된 양이에요. 원래 양으로 되돌리거나 전체 − 한 통의 양 × 통 수를 계산해요.'));
  if(roundPlaces!==null)fields.push(practiceField('반올림 판단에 쓴 숫자',Math.floor((a/b)*10**(roundPlaces+1)+1e-8)%10,'남길 자리 바로 다음 자리 숫자를 봐요.'));
  return {name:'세로셈',type:'division',dividend,divisor,point,digits,rows,fields,
    instruction:wholeOnly?'통 수는 자연수 부분까지만 계산합니다. 곱하고 빼는 과정을 채운 뒤 원래 단위의 남는 양을 구하세요.':roundPlaces!==null?'표시할 자리의 다음 자리까지 계산한 뒤 반올림하세요.':'두 수를 함께 '+factor+'배 한 세로셈입니다. 위의 몫과 아래의 곱·뺄셈을 직접 채우세요.',
    explanation:wholeOnly?'몫은 가득 찬 통 수입니다. '+practiceNumber(b)+' × '+quotient+' + '+practiceNumber(a-b*Number(quotient))+' = '+practiceNumber(a)+'로 검산합니다.':'두 수를 함께 '+factor+'배 해도 몫은 같습니다. '+dividend+' ÷ '+divisor+'의 몫의 소수점 위치를 확인합니다.'};
}
function methodQuiz(stage,a,b,index) {
  const common=stage===1?10:stage===2||stage===3?100:(String(b).split('.')[1]?.length===2?100:10);
  const n=Math.round(a*common),d=Math.round(b*common),q=practiceNumber(a/b);
  const natural={name:'자연수로',type:'fields',instruction:'10과 100 중 두 수를 모두 자연수로 만드는 더 작은 수를 각각 곱하세요. 몫과 검산도 완성하세요.',fields:[
    practiceField('두 수에 각각 곱할 수',common,'두 수가 모두 자연수가 되려면 '+common+'배가 필요합니다.'),
    practiceField('바꾼 나누어지는 수',n,'나누어지는 수도 같은 배로 바꿔야 몫이 같아요.'),
    practiceField('바꾼 나누는 수',d,'나누는 수도 같은 배로 바꿔요.'),
    practiceField('몫',q,'자연수끼리 나누어도 몫이 소수일 수 있어요.'),
    practiceField('검산: 원래 나누는 수 × 몫',practiceNumber(a),'원래 나누는 수 × 몫이 원래 나누어지는 수와 같은지 확인해요.')],explanation:`두 수에 같은 수 ${common}을 곱해 ${n} ÷ ${d}로 바꾸어도 몫은 ${q}입니다. ${b} × ${q} = ${a}로 검산합니다.`};
  const fraction={name:'분수로',type:'fraction',instruction:'두 소수를 같은 분모의 분수로 나타내세요. 같은 크기의 단위가 각각 몇 개 있는지 생각하며 분자끼리 나눕니다.',fields:[
    practiceField('공통 분모',common,'두 수를 분모 '+common+'인 분수로 나타낼 수 있어요.'),
    practiceField('나누어지는 수의 분자',n,'분모가 '+common+'이면 '+a+'는 '+n+'/'+common+'입니다.'),
    practiceField('나누는 수의 분자',d,'서로 다른 소수 자릿수도 같은 분모에 맞춰요.'),
    practiceField('분자끼리 나눈 몫',q,'같은 분모의 분수는 분자끼리 나누어 몫을 구할 수 있어요.'),practiceField('나누는 수의 분모',common,'두 분수의 분모를 같게 맞춰요.')],explanation:`${a} ÷ ${b} = ${n}/${common} ÷ ${d}/${common} = ${n} ÷ ${d} = ${q}. 같은 분모는 같은 크기의 단위를 뜻합니다.`};
  const vertical=divisionMethod(a,b,stage===3?10:common,2);
  const methods=[natural,fraction,vertical];
  if(stage===3){ const both=divisionMethod(a,b,100,2);both.name='세로셈 · 둘 다 자연수';methods.push(both); }
  return {id:'guide-'+stage+'-'+index,kind:'guided',stem:`${a} ÷ ${b}를 계산하고 풀이 과정을 완성하세요.`,formula:`${a} ÷ ${b}`,preferredMethod:index%methods.length,methods,choices:['두 수에 0이 아닌 같은 수를 곱하면 몫은 같다','나누는 수만 바꾼다','몫을 언제나 자연수로 쓴다','소수점을 무조건 지운다'],correct:0,explanation:natural.explanation,source:'지도서 '+({1:'224~227',2:'228~231',3:'232~235',4:'236~239'}[stage])+'쪽'};
}
const METHOD_EXAMPLES={
  1:[[3.6,.9],[4.8,.6],[2.4,.6],[5.6,.7],[7.2,.8],[6.3,.7],[8.4,1.2],[9.6,.8],[14.4,1.6],[21.7,.7],[3.2,.8],[5.4,.9]],
  2:[[3.75,1.25],[1.44,.12],[2.01,.67],[5.92,.74],[4.32,.54],[.84,.07],[7.56,.63],[6.25,1.25],[2.4,.15],[1.26,.09],[7.35,.35],[9.36,.78]],
  3:[[5.89,3.1],[5.92,.8],[7.54,1.3],[7.36,3.2],[8.82,4.2],[7.56,1.4],[5.76,1.2],[8.84,2.6],[8.28,1.8],[6.24,1.2],[3.24,2.4],[9.45,2.1]],
  4:[[3,.75],[10,2.5],[12,1.5],[15,2.5],[6,.8],[9,.6],[54,.36],[21,.84],[30,1.25],[7,.25],[5,.2],[63,1.8]]
};
for(const [stage,examples] of Object.entries(METHOD_EXAMPLES)) GUIDED_QUIZZES[stage]=examples.map(([a,b],i)=>methodQuiz(Number(stage),a,b,i));
for(const [i,[a,b]] of [[7,3],[1.2,.7],[8.2,6],[6.1,.9],[1.58,10.2],[10,4.7],[1.54,1.3],[7,1.3]].entries()) {
  const methods=[0,1,2].map(places=>{const m=divisionMethod(a,b,b===Math.floor(b)?1:(String(b).split('.')[1]?.length===2?100:10),0,places);m.name=['일의 자리까지','소수 첫째 자리까지','소수 둘째 자리까지'][places];return m;});
  GUIDED_QUIZZES[5].push({id:'guide-5-'+i,kind:'guided',stem:`${a} ÷ ${b}의 몫을 세로셈하고, 지정된 자리까지 반올림하세요.`,formula:`${a} ÷ ${b}`,preferredMethod:i%3,methods,choices:['남길 자리 바로 다음 자리로 판단한다','맨 앞 숫자를 본다','무조건 올린다','항상 소수 첫째 자리만 본다'],correct:0,explanation:'몇째 자리까지 나타낼지 먼저 정하고 바로 다음 자리 숫자로 판단합니다.',source:'지도서 240~243쪽'});
}
for(const [i,[a,b]] of [[6.3,2],[12.4,1.5],[24.65,3.8],[23.8,4.5],[14.3,2.5],[9.1,2],[17.8,3.2],[13.7,2.5]].entries()) {
  const count=Math.floor(a/b),remain=practiceNumber(a-count*b),fields=[];
  for(let j=1;j<=count;j++)fields.push(practiceField(j+'통을 채운 뒤 남은 양 (L)',practiceNumber(a-j*b),'한 통의 양 '+b+'L를 한 번씩 빼세요.'));
  fields.push(practiceField('가득 채운 통 수',count,'남은 양이 '+b+'L보다 작으면 더는 가득 채울 수 없어요.'),practiceField('검산: 한 통의 양 × 통 수 + 남는 양',a,'단위를 바꾸지 않고 전체 양으로 되돌아오는지 확인해요.'));
  const subtraction={name:'같은 양씩 빼기',type:'fields',instruction:'물 '+a+'L를 '+b+'L씩 통에 담습니다. 가득 채운 통 수와 남는 물의 양을 구하세요.',fields,explanation:`${b}L씩 ${count}번 빼면 ${remain}L가 남습니다. ${b} × ${count} + ${remain} = ${a}입니다.`};
  const vertical=divisionMethod(a,b,b===Math.floor(b)?1:10,0,null,true);
  GUIDED_QUIZZES[6].push({id:'guide-6-'+i,kind:'guided',stem:`물 ${a}L를 ${b}L씩 담을 때 가득 찬 통 수와 남는 양을 구하세요.`,formula:`${a} ÷ ${b}`,preferredMethod:i%2,methods:[subtraction,vertical],choices:['가득 찬 통 수는 자연수로 나타낸다','소수 통 수로 나타낸다','남는 양을 반올림해 없앤다','변환한 양을 그대로 L로 쓴다'],correct:0,explanation:subtraction.explanation,source:'지도서 244~247쪽'});
}
function guidedMethod(quiz) { return quiz.methods[quiz.methodIndex??quiz.preferredMethod??0]; }
function guidedInputId(target,index) { return target+'-field-'+index; }
function guidedFieldInputs(target,index) {
  const field=document.getElementById(guidedInputId(target,index));
  return 'value' in field?[field]:[...field.querySelectorAll('input')];
}
function bindDivisionDigitInputs(target) {
  document.querySelectorAll('#'+target+' .division-cell-input').forEach(cell=>{
    cell.addEventListener('focus',()=>cell.select());
    cell.addEventListener('input',()=>{
      cell.value=cell.value.replace(/\D/g,'').slice(-1);
      if(cell.value)cell.nextElementSibling?.focus();
    });
    cell.addEventListener('keydown',event=>{
      if(event.key==='Backspace'&&!cell.value)cell.previousElementSibling?.focus();
    });
    cell.addEventListener('paste',event=>{
      const digits=event.clipboardData.getData('text').replace(/\D/g,'');
      if(!digits)return;
      event.preventDefault();
      let current=cell;
      for(const digit of digits){
        current.value=digit;
        if(!current.nextElementSibling)break;
        current=current.nextElementSibling;
      }
      current.focus();
    });
  });
}
function renderGuidedPractice(target,quiz,locked=false) {
  const m=guidedMethod(quiz), escape=escapeClassroomText;
  const input=(index,small=false)=>'<input class="practice-input '+(small?'digit-input':'')+'" id="'+guidedInputId(target,index)+'" inputmode="decimal" autocomplete="off" aria-label="'+escape(m.fields[index].label)+'" '+(locked?'disabled value="'+escape(m.fields[index].answer)+'"':'')+'>';
  let body='';
  if(m.type==='fraction') body='<div class="fraction-work"><span>'+escape(quiz.formula)+' = </span><span class="practice-fraction">'+input(1)+input(0)+'</span><b> ÷ </b><span class="practice-fraction">'+input(2)+input(4)+'</span></div><label class="practice-row">'+escape(m.fields[3].label)+input(3)+'</label>';
  else if(m.type==='division') {
    const cols=m.digits.length;
    const grid='style="--division-cols:'+cols+'"';
    const pointClass=i=>i===m.point-1 && m.digits.length>m.point?'quotient-point':'';
    const numberInput=(index,end)=>{
      const field=m.fields[index], length=field.answer.length;
      const cells=Array.from({length},(_,digit)=>'<input class="practice-input division-cell-input" inputmode="numeric" autocomplete="off" maxlength="1" aria-label="'+escape(field.label)+' '+(digit+1)+'번째 숫자" '+(locked?'disabled value="'+escape(field.answer[digit])+'"':'')+'>').join('');
      return '<span class="division-value" id="'+guidedInputId(target,index)+'" style="grid-column:'+(end+3-length)+' / '+(end+3)+'">'+cells+'</span>';
    };
    body='<div class="division-work" '+grid+'><div class="division-quotient division-grid">'+m.rows.map(r=>'<span class="'+pointClass(r.end)+'" style="grid-column:'+(r.end+2)+'">'+input(r.offset,true)+'</span>').join('')+'</div><div class="division-header division-grid"><span class="division-divisor">'+m.divisor+' ⟌</span>'+m.digits.split('').map((digit,index)=>'<span class="division-digit '+pointClass(index)+'" style="grid-column:'+(index+2)+'">'+digit+'</span>').join('')+'</div>'+m.rows.map((r,i)=>'<div class="division-step"><small>단계 '+(i+1)+' · 내려온 수 '+r.partial+' · '+m.divisor+' × 이 자리 몫</small><div class="division-product division-grid"><span class="division-minus">−</span>'+numberInput(r.offset+1,r.end)+'</div><div class="division-difference division-grid">'+numberInput(r.offset+2,r.end)+'</div><small>빼고 남은 수'+(i<m.rows.length-1?' → 다음 숫자 내리기':'')+'</small></div>').join('')+'</div>'+m.fields.slice(m.rows.length*3).map((field,j)=>'<label class="practice-row">'+escape(field.label)+input(m.rows.length*3+j)+'</label>').join('');
  } else body=m.fields.map((field,i)=>'<label class="practice-row">'+escape(field.label)+input(i)+'</label>').join('');
  document.getElementById(target).innerHTML='<div class="guided-practice"><div class="practice-method-label">이번 풀이: '+escape(m.name)+'</div><p>'+escape(m.instruction)+'</p><p class="practice-hint">풀이가 길면 이 영역 안을 아래로 스크롤하세요.</p>'+body+'<p class="practice-hint">각 칸에 직접 입력하세요. Enter로 확인 · 계산 메모장도 사용할 수 있어요.</p><div id="'+target+'-feedback" aria-live="polite"></div></div>';
  if(m.type==='division'&&!locked)bindDivisionDigitInputs(target);
}
function choosePracticeMethod(target,index) {
  const quiz=target==='quizFormulaBox'?teacherSoloQuiz:currentSoloQuiz;
  if(target==='studentSoloOptions' || !quiz?.methods[index] || (target==='studentSoloOptions' && soloCaptureBusy))return;
  quiz.methodIndex=index;renderGuidedPractice(target,quiz);
  if(target==='quizFormulaBox')document.getElementById(target).innerHTML+='<button class="teacher-check-choice" onclick="checkTeacherSoloOption()">풀이 과정 확인하기</button>';
}
function assessGuidedPractice(target,quiz) {
  const method=guidedMethod(quiz), inputs=method.fields.map((_,i)=>guidedFieldInputs(target,i));
  const values=inputs.map(cells=>cells.map(cell=>String(cell.value??'').trim()).join(''));
  if(inputs.some(cells=>cells.some(cell=>!cell.value.trim()))) {document.getElementById(target+'-feedback').textContent='아직 빈칸이 있어요. 풀이 과정을 모두 채워 주세요.';return null;}
  const wrong=[];
  values.forEach((value,i)=>{
    const ok=/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) && Math.abs(Number(value)-Number(method.fields[i].answer))<1e-8;
    inputs[i].forEach(cell=>cell.setAttribute('aria-invalid',String(!ok)));
    if(!ok)wrong.push(method.fields[i].label+': '+method.fields[i].hint);
  });
  quiz.explanation=wrong.length?wrong.slice(0,3).join(' / '):method.explanation;
  quiz.completedAnswer=method.name+' · '+method.fields.map((field,i)=>field.label+' = '+values[i]).join(', ');
  return wrong.length===0;
}
