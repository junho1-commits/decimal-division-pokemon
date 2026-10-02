const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const html = fs.readFileSync('index.html','utf8');
const script = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n') + '\n' + fs.readFileSync('process-quizzes.js','utf8') + '\n' + fs.readFileSync('guided-practice.js','utf8') + '\n' + fs.readFileSync('classroom-adventure.js','utf8');
const clients=[], queue=[];
let drop=()=>false;
class Client {
  constructor(host) {this.host=host;this.topics=new Set();clients.push(this);}
  connect(options) {this.connected=true;queue.push(()=>options.onSuccess());}
  subscribe(topic,options) {queue.push(()=>{this.topics.add(topic);options?.onSuccess?.();});}
  isConnected(){return this.connected;}
  disconnect(){this.connected=false;}
  send(message){
    for(const c of clients) if(c.connected && c.host===this.host && c.topics.has(message.destinationName) && !drop(c,message)) {
      queue.push(()=>c.connected && c.onMessageArrived({payloadString:message.payloadString}));
    }
  }
}
function flush(){let limit=10000;while(queue.length){assert.ok(--limit>0,'message loop');queue.shift()();}}
function context(url, memory = new Map()){
 const elements=new Map(), intervals=new Map();let timer=0;
 const element=id=>{if(!elements.has(id))elements.set(id,{style:{},textContent:'',innerHTML:'',value:'',hidden:id==='studentDexModal'||id==='studentMemoOverlay',handlers:{},classList:{add(){},remove(){},contains(){return false;}},appendChild(){},remove(){},addEventListener(type,fn){this.handlers[type]=fn;},setAttribute(){},focus(){},querySelector:element,getBoundingClientRect(){return {width:600,height:360,left:0,top:0};},setPointerCapture(){},getContext(){return {setTransform(){},clearRect(){},beginPath(){},moveTo(){},lineTo(){},arc(){},fill(){},stroke(){}};}});return elements.get(id);};
 const storage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k)};
 const c={console,URL,URLSearchParams,Date,Math,crypto:{randomUUID},navigator:{},location:new URL(url),localStorage:storage,sessionStorage:storage,
 document:{getElementById:element,querySelector:element,querySelectorAll:()=>[],createElement:element,addEventListener(){}},
 setTimeout:()=>++timer,clearTimeout(){},setInterval:fn=>{intervals.set(++timer,fn);return timer;},clearInterval:id=>intervals.delete(id),requestAnimationFrame:fn=>fn(),
 addEventListener(){},alert:message=>c.alerts.push(message),alerts:[],Paho:{Client,Message:class{constructor(s){this.payloadString=s;}}}};
 c.window=c;c.innerWidth=1280;c.innerHeight=900;vm.createContext(c);vm.runInContext(script,c);
 c.memory=memory; c.run=code=>vm.runInContext(code,c);c.el=element;c.pulse=()=>[...intervals.values()].forEach(fn=>fn());
 c.run('for (const key of Object.getOwnPropertyNames(SoundEngine.prototype)) if(key !== "constructor") sound[key] = () => {}; voice.speak = () => {}; voice.unlock = async () => {};');
 return c;
}
const host=context('http://localhost:8200/index.html?hostIp=192.168.1.42&port=8200&broker=1');
host.run('initMultiplayerSystem()');flush();assert.equal(host.run('hostReady'),true);
host.run('openMultiplayerModal()');const join=host.el('displayConnectUrl').textContent;
assert.equal(new URL(join).hostname,'192.168.1.42');assert.equal(new URL(join).searchParams.get('broker'),'1');
const students=[];
for(let i=0;i<30;i++){
 const student=context(join);student.run('initMultiplayerSystem()');student.el('studentJoinName').value='test'+i; student.run('loadStudentProfile('+JSON.stringify('test'+i)+'); studentCaughtList=[25]; selectedStudentPokemon=25; saveStudentProfile()');
 student.run('joinClassroomBattle()');assert.equal(student.run('studentReady'),false,'no premature success');students.push(student);
}
flush();assert.equal(host.run('connectedStudents.size'),30);assert.ok(students.every(c=>c.run('studentReady')));
host.run('startRaidBattle()');flush();assert.ok(students.every(c=>c.run('isStudentInRaid')));
assert.ok(host.run('RAID_BOSSES[gameState.currentRaidBossIndex].phases.every(p=>p.choices.length===4 && !Object.hasOwn(p,"ansMain"))'),'raid phases ask for reasoning choices');
const a=students[0];
assert.equal(a.el('studentDexHeaderCount').textContent,'1/54');
a.run('openStudentDex()');assert.equal(a.el('studentDexModal').hidden,false);
assert.match(a.el('studentDexGrid').innerHTML,/피카츄/);
a.run('setStudentDexFilter("caught")');assert.doesNotMatch(a.el('studentDexGrid').innerHTML,/미발견/);
a.run('showStudentDexDetail(25)');assert.match(a.el('studentDexDetail').innerHTML,/당시 맞힌 문제는 저장되어 있지 않아요/);
a.run('activeStudentProfile.captureHistory[25]=[{stem:"왜 두 수에 10을 곱할까요?",answer:"몫이 같기 때문",explanation:"같은 배로 바꾸면 몫은 유지됩니다."}];showStudentDexDetail(25)');
assert.match(a.el('studentDexDetail').innerHTML,/왜 두 수에 10을 곱할까요/);
assert.match(a.el('studentDexDetail').innerHTML,/맞힌 답:.*몫이 같기 때문/);
a.run('closeStudentDex()');assert.equal(a.el('studentDexModal').hidden,true);
a.run('setStudentRaidAnswerInput("2")');assert.equal(a.run('raidQuizChoice'),1);
assert.equal(a.el('studentRaidAnswerInput').value,'2');
function answer(student){const value=host.run('RAID_BOSSES[gameState.currentRaidBossIndex].phases[gameState.currentRaidPhase].correct');student.run('chooseStudentRaidOption('+value+'); sendStudentRaidAnswer()');}
// Lost result: retry must return the same result without applying damage or XP twice.
drop=(client,message)=>JSON.parse(message.payloadString).type==='RESULT';answer(a);const packet=a.run('JSON.stringify(pendingAnswer)');flush();const firstRaidHp=host.run('raidHp');assert.ok(firstRaidHp<2250);assert.equal(a.run('myStudentXP'),0);
assert.equal(a.run('activeStudentProfile.unconfirmedRaidRequests.length'),1,'unfinished answer survives a page reload');
// Presence acknowledgement restores the cached verdict even while RESULT packets are lost.
a.pulse();flush();assert.equal(host.run('raidHp'),firstRaidHp);assert.equal(a.run('myStudentXP'),100);
assert.equal(a.run('pendingAnswer'),null);assert.equal(a.run('unconfirmedRaidRequests.size'),0);
drop=()=>false;a.pulse();flush();assert.equal(a.run('myStudentXP'),100);
host.run('handleHostIncomingMessage('+packet+')');flush();assert.equal(host.run('raidHp'),firstRaidHp);assert.equal(a.run('myStudentXP'),100);
// Different request for an already solved question is also rejected.
host.run('handleHostIncomingMessage({...'+packet+',requestId:"another"})');flush();assert.equal(host.run('raidHp'),firstRaidHp);
// Advance automatically and retain HP. Delayed answer for previous problem is rejected.
for(let i=1;i<30;i++){answer(students[i]);flush();}
assert.equal(host.run('gameState.currentRaidPhase'),1);assert.equal(host.run('raidHp'),1500);
assert.equal(a.el('studentRaidPhaseTag').textContent,'PHASE 2 / 3');
host.run('handleHostIncomingMessage({...'+packet+',requestId:"late"})');flush();assert.equal(host.run('raidHp'),1500);
// A dropped phase broadcast recovers on the next presence acknowledgement.
a.run('chooseStudentRaidOption(1)');a.pulse();flush();assert.equal(a.run('raidQuizChoice'),1,'same-state sync preserves choice');
// A missing verdict from the previous phase must not leave the next attack disabled.
const phaseTwoStudent=students[1], phaseTwoClient=phaseTwoStudent.run('mqttStudentClient');
drop=(client,message)=>client===phaseTwoClient && JSON.parse(message.payloadString).type==='RESULT';
answer(phaseTwoStudent);flush();assert.ok(phaseTwoStudent.run('pendingAnswer'));
const phaseTwoXp=phaseTwoStudent.run('myStudentXP');
a.run('mqttStudentClient.disconnect()');host.run('applyRaidDamage(750)');flush();
assert.equal(phaseTwoStudent.run('pendingAnswer'),null);
assert.equal(phaseTwoStudent.run('studentProblemId'),host.run('currentProblemId()'));
phaseTwoStudent.run('chooseStudentRaidOption(1)');
assert.equal(phaseTwoStudent.el('studentRaidAttackButton').disabled,false);
drop=()=>false;phaseTwoStudent.pulse();flush();
assert.equal(phaseTwoStudent.run('myStudentXP'),phaseTwoXp+100,'late verdict still grants the earned XP');
assert.equal(phaseTwoStudent.run('unconfirmedRaidRequests.size'),0);
a.run('connectStudentMQTT()');flush();assert.equal(a.el('studentRaidPhaseTag').textContent,'PHASE 3 / 3');assert.equal(a.run('studentReady'),true);
// A transport send error releases the button and shows the disconnected state.
phaseTwoStudent.run('mqttStudentClient.originalSend=mqttStudentClient.send;mqttStudentClient.send=()=>{throw Error("send failed")};sendStudentRaidAnswer();mqttStudentClient.send=mqttStudentClient.originalSend');
assert.equal(phaseTwoStudent.run('pendingAnswer'),null);
assert.equal(phaseTwoStudent.run('studentReady'),false);
assert.match(phaseTwoStudent.el('studentRaidAttackButton').textContent,/연결 확인/);
phaseTwoStudent.pulse();flush();assert.equal(phaseTwoStudent.run('studentReady'),true);
// If the submitted ANSWER itself is lost, the next pulse sends the same request again.
const hpBeforeLostAnswer=host.run('raidHp');
drop=(client,message)=>client===host.run('mqttHostClient') && JSON.parse(message.payloadString).type==='ANSWER' && JSON.parse(message.payloadString).studentId===phaseTwoStudent.run('myStudentId');
answer(phaseTwoStudent);flush();assert.equal(host.run('raidHp'),hpBeforeLostAnswer);
assert.ok(phaseTwoStudent.run('pendingAnswer'));
drop=()=>false;phaseTwoStudent.pulse();flush();
assert.ok(host.run('raidHp')<hpBeforeLostAnswer);
assert.equal(phaseTwoStudent.run('pendingAnswer'),null);
// Finish and prove repeated victory/result messages cannot award duplicate rewards.
for(let i=0;i<30;i++){answer(students[i]);flush();}
assert.equal(host.run('raidHp'),0);assert.equal(host.run('raidFinished'),true);const xp=a.run('myStudentXP');
host.run('broadcastRaidVictory("test");handleRaidVictory(RAID_BOSSES[0])');flush();assert.equal(a.run('myStudentXP'),xp);assert.equal(host.run('gameState.xp'),1000);
// Teacher transport disappears: students must stop claiming a teacher connection.
host.run('mqttHostClient.disconnect()');a.run('lastTeacherAck=Date.now()-20000');a.pulse();flush();assert.equal(a.run('studentReady'),false);
host.run('initHostMQTT()');flush();a.pulse();flush();assert.equal(a.run('studentReady'),true);
host.run('showMapView()');flush();assert.equal(a.run('isStudentInRaid'),false);
assert.ok(clients.every(c=>c.host==='broker.hivemq.com'),'all clients stay on QR-selected broker');
// Verify the real bundled library exposes the API used by the game.
const lib={WebSocket:function(){},localStorage:{},setTimeout,clearTimeout};lib.window=lib;vm.createContext(lib);vm.runInContext(fs.readFileSync('vendor/paho-mqtt-1.1.0.min.js','utf8'),lib);
assert.equal(typeof lib.Paho.Client,'function');assert.equal(typeof lib.Paho.Message,'function');
assert.ok(fs.readFileSync('index.html').equals(fs.readFileSync('포켓몬_소수의나눗셈.html')));

// Nickname save slots survive reload without mixing students or losing position/partner.
const memory = new Map();
const profileTab = context(join,memory);
profileTab.run('loadStudentProfile("가람"); studentCaughtList=[25,94]; selectedStudentPokemon=94; myStudentXP=700; studentCurrentStageId=3; studentCurrentPokeIdx=2; saveStudentProfile()');
const profileId=profileTab.run('myStudentId');
profileTab.run('loadStudentProfile("나래")');
assert.equal(profileTab.run('myStudentXP'),0);assert.equal(profileTab.run('studentCaughtList.length'),0);
profileTab.run('studentCaughtList=[1]; selectedStudentPokemon=1; myStudentXP=100; saveStudentProfile()');
const restored=context(join,memory);restored.run('loadStudentProfile("가람")');
assert.equal(restored.run('myStudentXP'),700);assert.equal(restored.run('selectedStudentPokemon'),94);
assert.equal(restored.run('studentCurrentStageId'),3);assert.equal(restored.run('studentCurrentPokeIdx'),2);assert.equal(restored.run('myStudentId'),profileId);
assert.equal(restored.run('savedProfileNames().length'),2);
// Legacy progress belongs only to the last legacy nickname.
const legacy=new Map([['pokemon_student_name','이전학생'],['pokemon_student_xp','400'],['pokemon_student_caught','[25,1]']]);
const migrated=context(join,legacy);migrated.run('loadStudentProfile("이전학생")');assert.equal(migrated.run('myStudentXP'),400);
migrated.run('loadStudentProfile("새학생")');assert.equal(migrated.run('myStudentXP'),0);assert.equal(migrated.run('studentCaughtList.length'),0);
// Failed storage is visible instead of falsely claiming that progress was saved.
restored.run('console={...console,warn:()=>{}};localStorage.setItem=()=>{throw new Error("quota")}');assert.equal(restored.run('saveStudentProfile()'),false);
assert.match(restored.el('studentSaveStatus').textContent,/저장하지 못/);
// Owned Pokemon, boss counterattack, revive, switching, and type effectiveness.
a.run('studentCaughtList=[25,94]; selectedStudentPokemon=25; saveStudentProfile(); sendStudentPresence()');flush();
host.run('startRaidBattle()');flush();
const wrong=host.run('(RAID_BOSSES[gameState.currentRaidBossIndex].phases[gameState.currentRaidPhase].correct+1)%4');
a.run('chooseStudentRaidOption('+wrong+');sendStudentRaidAnswer()');flush();
assert.equal(a.run('studentCaughtList.length'),1,'one random caught Pokemon escapes after a wrong answer');
a.run('studentCaughtList=[25,94];selectedStudentPokemon=25;saveStudentProfile();sendStudentPresence()');flush();
host.run('hostFighter('+JSON.stringify(a.run('myStudentId'))+').hp=0');
host.run('sendAdventureAck('+JSON.stringify(a.run('myStudentId'))+')');flush();
assert.equal(a.run('studentFighter.hp'),0);
const injured=context(join,a.memory);injured.run('loadStudentProfile("test0")');
const snapshot=host.run('JSON.stringify({type:"JOIN_ACK",state:raidSnapshot(),fighter:hostFighter('+JSON.stringify(a.run('myStudentId'))+')})');
injured.run('handleStudentIncomingData('+snapshot+')');assert.equal(injured.run('studentFighter.hp'),0,'injured partner restored on first reconnect snapshot');
a.run('recoverStudentPartner()');flush();assert.equal(a.run('studentFighter.hp'),a.run('studentFighter.maxHp'));
a.run('selectStudentPartner(384)');assert.equal(a.run('selectedStudentPokemon'),25,'cannot choose an unowned Pokemon');
a.run('selectStudentPartner(94)');flush();assert.equal(host.run('hostFighter('+JSON.stringify(a.run('myStudentId'))+').pokemonId'),94);
const beforeAttack=host.run('raidHp');answer(a);flush();
assert.ok(beforeAttack-host.run('raidHp')>25,'owned ghost Pokemon has a stronger super-effective attack');
assert.match(a.el('studentBattleLog').textContent,/섀도볼/);
assert.equal(host.run('savedClassRoster.size'),30);
const hostReload=context('http://localhost:8200/index.html',host.memory);assert.equal(hostReload.run('savedClassRoster.size'),30);
assert.ok(!html.includes('id="btnBgm"')&&!html.includes('id="btnVoice"')&&!html.includes('id="btnAudio"'));
assert.equal(profileTab.run('sound.bgmMuted'),false);assert.equal(profileTab.run('voice.enabled'),true);
// Reasoning bank, shuffled order, nickname progress, capture and strengthening.
assert.ok(profileTab.run('Object.values(PROCESS_QUIZZES).every(bank=>bank.length>=40)'));
assert.equal(profileTab.run('RAID_REASONING_QUIZZES.length'),22);
profileTab.run('renderRaidBossChoices()');
assert.equal((profileTab.el('raidBossChoice').innerHTML.match(/<option /g)||[]).length,12,'six legendary bosses each have normal and shiny choices');
assert.equal(profileTab.run('effectiveness("땅",483)'),1.5);
assert.equal(profileTab.run('new Set(variedBattleQuizzes().map(q=>q.category)).size'),3,'each battle mixes three math question types');
assert.ok(profileTab.run('Object.values(PROCESS_QUIZZES).flat().concat(RAID_REASONING_QUIZZES).every(q=>q.choices.length===4 && q.correct>=0 && q.correct<4 && new Set(q.choices).size===4)'));
const named='가빈 나연 세은 주원 지언 서희 수은 보민 지우 희경 윤정 민수 건 도현 승준 예준 시원 재휘 태언 이찬 지호 수현'.split(' ');
const stems=profileTab.run('Object.values(PROCESS_QUIZZES).flat().concat(RAID_REASONING_QUIZZES).map(q=>q.stem).join(" ")');
assert.ok(named.every(name=>stems.includes(name)));
assert.ok(!stems.includes('김가빈')&&!stems.includes('박세은'));
const order=profileTab.run('Array.from({length:10},()=>nextSoloQuiz(1).id)');
assert.equal(new Set(order).size,10,'stage questions form a shuffled nonrepeating round');
function fillGuided(c,target,quizName,wrong=false) {
 c.run('guidedMethod('+quizName+').fields.forEach((f,i)=>{const value=String(Number(f.answer)'+(wrong?'+(i===0?1:0)':'')+');const cells=guidedFieldInputs('+JSON.stringify(target)+',i);cells.forEach((cell,digit)=>cell.value=cells.length===1?value:value[digit]??"")})');
}
function completeSolo(c) {
 if(c.run('currentSoloQuiz.kind==="guided"'))fillGuided(c,'studentSoloOptions','currentSoloQuiz');
 else c.run('chooseStudentSoloOption(currentSoloQuiz.correct)');
 c.run('sendStudentSoloAnswer();sendStudentSoloAnswer()');
}
const quizTab=context(join,new Map());quizTab.run('loadStudentProfile("퀴즈학생"); renderStudentSoloGame()');
for(let i=0;i<3;i++)completeSolo(quizTab);
assert.equal(quizTab.run('studentCaughtList.length'),1,'two correct explanations capture the first Pokemon');
quizTab.run('openStudentDex();showStudentDexDetail(19)');
assert.match(quizTab.el('studentDexDetail').innerHTML,/맞힌 답:/);
assert.match(quizTab.el('studentDexDetail').innerHTML,/문제 1:/);
assert.equal(quizTab.run('captureCount(19)'),1);
assert.equal(quizTab.run('duplicateCount(19)'),0,'answering alone does not create strengthening material');
quizTab.run('selectStudentEncounter(0)');
for(let i=0;i<4;i++)completeSolo(quizTab);
assert.equal(quizTab.run('captureCount(19)'),3);
assert.equal(quizTab.run('duplicateCount(19)'),2);
const oldQuiz=quizTab.run('currentSoloQuiz.id');
if(quizTab.run('currentSoloQuiz.kind==="guided"'))fillGuided(quizTab,'studentSoloOptions','currentSoloQuiz',true);else quizTab.run('chooseStudentSoloOption((currentSoloQuiz.correct+1)%4)');
quizTab.run('sendStudentSoloAnswer();sendStudentSoloAnswer()');
assert.notEqual(quizTab.run('currentSoloQuiz.id'),oldQuiz,'wrong answers lead to a new problem');
assert.equal(quizTab.run('captureCount(19)'),3,'wrong answers keep the collection');
const lockTab=context(join,new Map());lockTab.run('loadStudentProfile("레벨검증");selectStudentStage(3)');
assert.equal(lockTab.run('STAGES_DATA[2].pokemons[studentCurrentPokeIdx].id'),19);
lockTab.run('selectStudentEncounter(STAGES_DATA[2].pokemons.findIndex(p=>p.id===149))');
assert.equal(lockTab.run('studentCurrentPokeIdx'),0,'low levels cannot select a powerful Pokemon');
lockTab.run('myStudentXP=1200;selectStudentEncounter(STAGES_DATA[2].pokemons.findIndex(p=>p.id===149))');
assert.equal(lockTab.run('STAGES_DATA[2].pokemons[studentCurrentPokeIdx].id'),149,'level 5 unlocks powerful Pokemon');
assert.ok(profileTab.run('Array.from({length:20},()=>variedBattleQuizzes()).every(round=>round.some(q=>q.category==="실생활" && q.id.startsWith("raid-word-")))'),'every raid includes a word problem with distracting information');
quizTab.run('awardDailyStudyCorrect();awardDailyStudyCorrect()');
assert.equal(quizTab.run('activeStudentProfile.pvpTickets'),1,'five correct study quizzes grant one daily battle ticket');
const baseDamage=quizTab.run('pokemonBattleStats(19,myStudentXP,0).damage');
const baseHp=quizTab.run('pokemonBattleStats(19,myStudentXP,0).maxHp');
assert.ok(quizTab.run('pokemonBattleStats(150,myStudentXP,0).damage')>baseDamage,'higher CP yields a stronger attack');
assert.ok(quizTab.run('pokemonBattleStats(150,myStudentXP,0).maxHp')>baseHp,'higher CP yields more HP');
quizTab.run('strengthenStudentPokemon(19)');
assert.equal(quizTab.run('activeStudentProfile.power[19]'),1);
assert.equal(quizTab.run('duplicateCount(19)'),0,'strengthening consumes two duplicates');
assert.equal(quizTab.run('captureCount(19)'),3,'lifetime capture count stays intact');
quizTab.run('strengthenStudentPokemon(19)');
assert.equal(quizTab.run('activeStudentProfile.power[19]'),1,'cannot strengthen without duplicates');
assert.ok(quizTab.run('pokemonBattleStats(19,myStudentXP,activeStudentProfile.power[19]).damage')>baseDamage);
assert.ok(quizTab.run('pokemonBattleStats(19,myStudentXP,activeStudentProfile.power[19]).maxHp')>baseHp);
const quizRestore=context(join,quizTab.memory);quizRestore.run('loadStudentProfile("퀴즈학생")');
assert.equal(quizRestore.run('activeStudentProfile.power[19]'),1,'strengthening persists by nickname');
quizRestore.run('showStudentDexDetail(19)');assert.match(quizRestore.el('studentDexDetail').innerHTML,/맞힌 답:/,'capture question survives reload');
quizTab.run('openStudentMemo()');
assert.equal(quizTab.el('studentMemoOverlay').hidden,false);
assert.ok(quizTab.el('studentMemoProblem').textContent.startsWith(quizTab.run('currentSoloQuiz.stem')));
assert.ok(quizTab.el('studentMemoProblem').textContent.includes('1. ')||quizTab.run('currentSoloQuiz.kind==="guided"'),'memo repeats available answers');
const memoCanvas=quizTab.el('studentMemoCanvas');
memoCanvas.handlers.pointerdown({preventDefault(){},pointerId:1,currentTarget:memoCanvas,clientX:20,clientY:30});
memoCanvas.handlers.pointermove({preventDefault(){},currentTarget:memoCanvas,clientX:80,clientY:100});
memoCanvas.handlers.pointerup();
assert.equal(quizTab.run('studentMemoStrokes.length'),1);
quizTab.run('undoStudentMemo();closeStudentMemo()');
assert.equal(quizTab.run('studentMemoStrokes.length'),0);
assert.equal(quizTab.el('studentMemoOverlay').hidden,true);
// Daily study grants tickets; a host-arbitrated friend battle consumes one and runs three reasoning rounds.
host.run('showMapView()');flush();
const b=students[1];
for(const student of [a,b])student.run('activeStudentProfile.studyDay=studyDayStamp();activeStudentProfile.studyCorrectToday=5;activeStudentProfile.pvpTickets=1;saveStudentProfile();sendStudentPresence()');
flush();
a.el('studentPvpTarget').value=b.run('myStudentId');a.run('requestStudentPvp()');flush();
assert.ok(b.run('studentPvpInvite'));
b.run('replyStudentPvp(true)');flush();
assert.ok(a.run('studentPvpMatch')&&b.run('studentPvpMatch'));
assert.equal(a.run('activeStudentProfile.pvpTickets'),0);
assert.equal(host.run('[...pvpMatches.values()][0].hp[0]'),host.run('[...pvpMatches.values()][0].stats[0].maxHp'),'friend battles start at calculated Pokemon HP');
assert.equal(host.run('new Set([...pvpMatches.values()][0].quizzes.map(q=>q.category)).size'),3);
assert.match(a.el('studentPvpTimer').textContent,/남은 시간/);
for(let round=0;round<3&&a.run('studentPvpMatch');round++){
 const answerIndex=host.run('[...pvpMatches.values()][0].quizzes['+round+'].correct');
 if(round===0)drop=(client,message)=>client===host.run('mqttHostClient')&&JSON.parse(message.payloadString).type==='PVP_ANSWER'&&JSON.parse(message.payloadString).studentId===a.run('myStudentId');
 a.run('chooseStudentPvpOption('+answerIndex+');submitStudentPvpAnswer()');flush();
 if(round===0){assert.equal(host.run('[...pvpMatches.values()][0].answers[0]'),null,'lost answer has not scored');drop=()=>false;a.pulse();flush();assert.equal(host.run('[...pvpMatches.values()][0].answers[0]'),answerIndex,'answer retry reaches host');}
 b.run('chooseStudentPvpOption('+answerIndex+');submitStudentPvpAnswer()');flush();
 if(round===0)assert.equal(host.run('[...pvpMatches.values()][0].hp[0]'),host.run('[...pvpMatches.values()][0].stats[0].maxHp-[...pvpMatches.values()][0].stats[1].damage'),'correct battle answer uses the partner attack stat');
}
assert.equal(a.run('studentPvpMatch'),null);
assert.equal(b.run('studentPvpMatch'),null);
assert.match(a.el('studentPvpLog').textContent,/XP/);
assert.equal(a.el('studentPvpReturn').hidden,false,'exit is visible after a battle');
a.run('returnFromStudentPvp()');assert.equal(a.el('studentSoloBox').style.display,'flex');assert.equal(a.el('studentPvpBox').style.display,'none');
const pvpXp=a.run('myStudentXP');a.run('sendStudentPresence()');flush();
assert.equal(a.run('myStudentXP'),pvpXp,'replayed battle result cannot award XP twice');
for(const student of [a,b])student.run('activeStudentProfile.pvpTickets=1;studentCaughtList=[25,94];selectedStudentPokemon=25;saveStudentProfile();sendStudentPresence()');
flush();a.el('studentPvpTarget').value=b.run('myStudentId');a.run('requestStudentPvp()');flush();b.run('replyStudentPvp(true)');flush();
const matchId=a.run('studentPvpMatch.id');
assert.equal(a.run('activeStudentProfile.pvpActiveMatch'),matchId);
a.run('studentPvpMatch=null;studentPvpRound=null;sendStudentPresence()');flush();
assert.equal(a.run('studentPvpMatch.id'),matchId,'active match returns after reconnect');
assert.equal(a.run('activeStudentProfile.pvpTickets'),0,'reconnect does not consume another ticket');
const wrongPvp=host.run('([ ...pvpMatches.values() ][0].quizzes[0].correct+1)%4');
const rightPvp=host.run('[...pvpMatches.values()][0].quizzes[0].correct');
a.run('chooseStudentPvpOption('+wrongPvp+');submitStudentPvpAnswer()');
b.run('chooseStudentPvpOption('+rightPvp+');submitStudentPvpAnswer()');flush();
assert.equal(a.run('studentCaughtList.length'),2,'a wrong friendly battle answer does not remove a caught Pokemon');
host.el('raidBossChoice').value='2s';host.run('startRaidBattle()');flush();
assert.equal(host.run('RAID_BOSSES[gameState.currentRaidBossIndex].bossId'),249);
assert.equal(host.run('raidShiny'),true);
assert.equal(host.run('new Set(RAID_BOSSES[gameState.currentRaidBossIndex].phases.map(q=>RAID_REASONING_QUIZZES.find(item=>item.id===q.id).category)).size'),3);
assert.match(host.el('battlePokeImg').src,/official-artwork\/shiny\/249\.png$/);
assert.match(a.el('studentRaidBossImg').src,/official-artwork\/shiny\/249\.png$/);
const rejoining=students[2];rejoining.run('goCaptureForRaid()');assert.equal(rejoining.run('isStudentInRaid'),false);
assert.equal(rejoining.el('studentReturnRaid').hidden,false);
rejoining.run('returnToPendingRaid()');flush();assert.equal(rejoining.run('isStudentInRaid'),true,'a student can return to the current raid after catching a partner');
const supportStudent=students[3];
supportStudent.run('studentCaughtList=[];selectedStudentPokemon=0;saveStudentProfile();sendStudentPresence()');flush();
assert.equal(supportStudent.el('studentRaidAttackButton').disabled,true,'a reasoning choice is still required');
const supportChoice=host.run('RAID_BOSSES[gameState.currentRaidBossIndex].phases[gameState.currentRaidPhase].correct');
supportStudent.run('chooseStudentRaidOption('+supportChoice+')');
assert.equal(supportStudent.el('studentRaidAttackButton').disabled,false,'students without Pokemon can solve raid reasoning');
supportStudent.run('sendStudentRaidAnswer()');flush();
assert.ok(supportStudent.run('activeStudentProfile.raidQualified.includes(studentRaidSessionId)'),'a correct support answer earns a boss capture chance');
const priorRaidStats=host.run('JSON.stringify(hostFighter('+JSON.stringify(a.run('myStudentId'))+'))');
a.run('activeStudentProfile.power[selectedStudentPokemon]=(activeStudentProfile.power[selectedStudentPokemon]||0)+1;saveStudentProfile();sendStudentPresence()');flush();
assert.ok(host.run('hostFighter('+JSON.stringify(a.run('myStudentId'))+').maxHp')>JSON.parse(priorRaidStats).maxHp,'strengthening refreshes live raid HP');
assert.ok(host.run('hostFighter('+JSON.stringify(a.run('myStudentId'))+').damage')>JSON.parse(priorRaidStats).damage,'strengthening refreshes live raid damage');
a.run('activeStudentProfile.raidQualified.push("shiny-test");resolveStudentRaidCapture("shiny-test",249,0,true)');
assert.ok(a.run('activeStudentProfile.shinyCaught.includes(249)'));
const shinyRestore=context(join,a.memory);shinyRestore.run('loadStudentProfile("test0")');
assert.ok(shinyRestore.run('activeStudentProfile.shinyCaught.includes(249)'),'shiny capture persists');
const interrupted=context(join,new Map());
interrupted.run('loadStudentProfile("이어하기");activeStudentProfile.pvpTickets=0;activeStudentProfile.pvpSpentMatches=["old-match"];activeStudentProfile.pvpActiveMatch="old-match";saveStudentProfile();handleStudentIncomingData({type:"PVP_SYNC",matchId:null})');
assert.equal(interrupted.run('activeStudentProfile.pvpTickets'),1,'teacher restart returns a ticket after a reload');
assert.equal(interrupted.run('activeStudentProfile.pvpActiveMatch'),'');
const raidCatchTab=context(join,new Map());
raidCatchTab.run('loadStudentProfile("레이드학생");activeStudentProfile.raidQualified=["round-1"];activeStudentProfile.raidAnswered["round-1"]=[{stem:"어떤 풀이가 맞을까요?",answer:"두 수에 함께 10을 곱한다",explanation:"몫이 같아요."}];resolveStudentRaidCapture("round-1",150,0);openStudentDex();showStudentDexDetail(150)');
assert.ok(raidCatchTab.run('studentCaughtList.includes(150)'));
assert.match(raidCatchTab.el('studentDexDetail').innerHTML,/어떤 풀이가 맞을까요/);
assert.match(raidCatchTab.el('studentDexDetail').innerHTML,/두 수에 함께 10을 곱한다/);
raidCatchTab.run('activeStudentProfile.raidQualified.push("round-2")');
assert.match(raidCatchTab.run('resolveStudentRaidCapture("round-2",249,.99)'),/포획 성공/,'first qualified victory guarantees a new boss');
raidCatchTab.run('activeStudentProfile.raidQualified.push("round-3")');
assert.match(raidCatchTab.run('resolveStudentRaidCapture("round-3",249,.99)'),/빠져나왔/,'repeat captures use the stated probability');
assert.equal(raidCatchTab.run('trainerLevel(1000000)'),50);
console.log('PASS: nickname isolation/reload, legacy migration, saved trainer roster, storage failure feedback, owned partners, counterattack/revive, switching, type effectiveness, sound retained');
console.log('PASS: 30 students, teacher ACK, QR/broker routing, dropped-result retry, duplicate answers/rewards, stale answers, phase/HP sync, reconnect, teacher loss, raid end, bundled API, matching HTML copies');

for(const stage of [1,2,3,4]) {
 const rows=profileTab.run('PROCESS_QUIZZES['+stage+'].slice(10).filter(q=>q.id.startsWith("stage-"))');
 for(const quiz of rows) {
   const match=quiz.stem.match(/([\d.]+) ÷ ([\d.]+)/);
   if(match) assert.ok(Math.abs(Number(match[1])/Number(match[2])-Number(quiz.choices[quiz.correct]))<1e-8,quiz.stem);
 }
}
console.log('PASS: level unlocks, duplicate capture/consumption/save, changed questions after errors, generated arithmetic, raid word problems');

for(let stage=1;stage<=6;stage++) {
 const c=context(join,new Map());c.run('loadStudentProfile("풀이검증'+stage+'");selectStudentStage('+stage+')');
 for(let index=0;index<c.run('GUIDED_QUIZZES['+stage+'].length');index++) {
  c.run('currentSoloQuiz={...GUIDED_QUIZZES['+stage+']['+index+']}');
  for(let method=0;method<c.run('currentSoloQuiz.methods.length');method++) {
   c.run('currentSoloQuiz.methodIndex='+method+';renderGuidedPractice("studentSoloOptions",currentSoloQuiz)');
   fillGuided(c,'studentSoloOptions','currentSoloQuiz');
   assert.equal(c.run('assessGuidedPractice("studentSoloOptions",currentSoloQuiz)'),true,'all method fields score');
   fillGuided(c,'studentSoloOptions','currentSoloQuiz',true);
   assert.equal(c.run('assessGuidedPractice("studentSoloOptions",currentSoloQuiz)'),false,'wrong intermediate step cannot earn a capture');
   c.el('studentSoloOptions-field-0').value='';
   assert.equal(c.run('assessGuidedPractice("studentSoloOptions",currentSoloQuiz)'),null,'blank intermediate step cannot earn a capture');
  }
 }
}
assert.equal(profileTab.run('Object.values(GUIDED_QUIZZES).flat().length'),64);
assert.ok(profileTab.run('Object.values(GUIDED_QUIZZES).flat().every(q=>!q.stem.includes("나머지"))'));
console.log('PASS: 64 guide-aligned activities, all fraction/natural/long-division/rounding/subtraction methods, wrong and blank intermediate steps');

const methods=profileTab.run('Object.values(GUIDED_QUIZZES).flat().flatMap(q=>q.methods).filter(m=>m.type==="division")');
for(const m of methods)for(const row of m.rows){
 const digit=Number(m.fields[row.offset].answer), product=Number(m.fields[row.offset+1].answer), remain=Number(m.fields[row.offset+2].answer);
 assert.equal(m.divisor*digit,product);assert.equal(row.partial-product,remain);assert.ok(remain>=0 && remain<m.divisor);
}
const cycle=context(join,new Map());cycle.run('loadStudentProfile("출제순환")');
const seen=cycle.run('Array.from({length:PROCESS_QUIZZES[1].length*2},()=>nextSoloQuiz(1)).filter(q=>q.kind!=="guided").map(q=>q.id)');
assert.equal(new Set(seen).size,seen.length,'all reasoning questions rotate before repeating');
