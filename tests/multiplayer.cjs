const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const html = fs.readFileSync('index.html','utf8');
const script = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
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
function context(url){
 const elements=new Map(), intervals=new Map();let timer=0;
 const element=id=>{if(!elements.has(id))elements.set(id,{style:{},textContent:'',innerHTML:'',value:'',classList:{add(){},remove(){},contains(){return false;}},appendChild(){},remove(){},addEventListener(){},getContext(){return {};}});return elements.get(id);};
 const memory=new Map();const storage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k)};
 const c={console,URL,URLSearchParams,Date,Math,crypto:{randomUUID},navigator:{},location:new URL(url),localStorage:storage,sessionStorage:storage,
 document:{getElementById:element,querySelector:element,querySelectorAll:()=>[],createElement:element,addEventListener(){}},
 setTimeout:()=>++timer,clearTimeout(){},setInterval:fn=>{intervals.set(++timer,fn);return timer;},clearInterval:id=>intervals.delete(id),
 addEventListener(){},alert:message=>c.alerts.push(message),alerts:[],Paho:{Client,Message:class{constructor(s){this.payloadString=s;}}}};
 c.window=c;c.innerWidth=1280;c.innerHeight=900;vm.createContext(c);vm.runInContext(script,c);
 c.run=code=>vm.runInContext(code,c);c.el=element;c.pulse=()=>[...intervals.values()].forEach(fn=>fn());
 c.run('for (const key of Object.getOwnPropertyNames(SoundEngine.prototype)) if(key !== "constructor") sound[key] = () => {}; voice.speak = () => {};');
 return c;
}
const host=context('http://localhost:8200/index.html?hostIp=192.168.1.42&port=8200&broker=1');
host.run('initMultiplayerSystem()');flush();assert.equal(host.run('hostReady'),true);
host.run('openMultiplayerModal()');const join=host.el('displayConnectUrl').textContent;
assert.equal(new URL(join).hostname,'192.168.1.42');assert.equal(new URL(join).searchParams.get('broker'),'1');
const students=[];
for(let i=0;i<30;i++){
 const student=context(join);student.run('initMultiplayerSystem()');student.el('studentJoinName').value='test'+i;
 student.run('joinClassroomBattle()');assert.equal(student.run('studentReady'),false,'no premature success');students.push(student);
}
flush();assert.equal(host.run('connectedStudents.size'),30);assert.ok(students.every(c=>c.run('studentReady')));
host.run('startRaidBattle()');flush();assert.ok(students.every(c=>c.run('isStudentInRaid')));
const a=students[0];
function answer(student){const value=host.run('RAID_BOSSES[gameState.currentRaidBossIndex].phases[gameState.currentRaidPhase].ansMain');student.run('studentRaidInputVal='+JSON.stringify(value)+'; sendStudentRaidAnswer()');}
// Lost result: retry must return the same result without applying damage or XP twice.
drop=(client,message)=>JSON.parse(message.payloadString).type==='RESULT';answer(a);const packet=a.run('JSON.stringify(pendingAnswer)');flush();assert.equal(host.run('raidHp'),275);assert.equal(a.run('myStudentXP'),0);
drop=()=>false;a.pulse();flush();assert.equal(host.run('raidHp'),275);assert.equal(a.run('myStudentXP'),100);
host.run('handleHostIncomingMessage('+packet+')');flush();assert.equal(host.run('raidHp'),275);assert.equal(a.run('myStudentXP'),100);
// Different request for an already solved question is also rejected.
host.run('handleHostIncomingMessage({...'+packet+',requestId:"another"})');flush();assert.equal(host.run('raidHp'),275);
// Advance automatically and retain HP. Delayed answer for previous problem is rejected.
for(let i=1;i<4;i++){answer(students[i]);flush();}
assert.equal(host.run('gameState.currentRaidPhase'),1);assert.equal(host.run('raidHp'),200);
assert.equal(a.el('studentRaidPhaseTag').textContent,'PHASE 2 / 3');
host.run('handleHostIncomingMessage({...'+packet+',requestId:"late"})');flush();assert.equal(host.run('raidHp'),200);
// A dropped phase broadcast recovers on the next presence acknowledgement.
a.run('studentRaidInputVal="123"');a.pulse();flush();assert.equal(a.run('studentRaidInputVal'),'123','same-state sync preserves input');
a.run('mqttStudentClient.disconnect()');host.run('applyRaidDamage(100)');flush();
a.run('connectStudentMQTT()');flush();assert.equal(a.el('studentRaidPhaseTag').textContent,'PHASE 3 / 3');assert.equal(a.run('studentReady'),true);
// Finish and prove repeated victory/result messages cannot award duplicate rewards.
for(let i=0;i<4;i++){answer(students[i]);flush();}
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
console.log('PASS: 30 students, teacher ACK, QR/broker routing, dropped-result retry, duplicate answers/rewards, stale answers, phase/HP sync, reconnect, teacher loss, raid end, bundled API, matching HTML copies');
