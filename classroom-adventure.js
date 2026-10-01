/* Nickname save slots and captured-Pokemon classroom raids. Plain script, no build step. */
const adventureBase = {
  init: initMultiplayerSystem, join: joinClassroomBattle, incoming: handleStudentIncomingData,
  hostIncoming: handleHostIncomingMessage, stats: updateStudentHeaderStats,
  stage: selectStudentStage, soloRender: renderStudentSoloGame, presence: sendStudentPresence,
  answer: sendStudentRaidAnswer, applyDamage: applyRaidDamage, returnSolo: returnToStudentSoloGame,
  roster: updateConnectedStudentsUI, modal: openMultiplayerModal,
  raidLoad: loadCurrentRaidBattle, raidSnapshot: raidSnapshot, soloLoad: loadCurrentBattle, map: showMapView
};
const PROFILE_PREFIX = 'pokemon_student_profile_v2:';
const PROFILE_INDEX = 'pokemon_student_names_v2';
const CLASS_ROSTER_KEY = 'pokemon_class_roster_v1';
let activeStudentProfile = null;
let selectedStudentPokemon = 0;
let studentFighter = null;
let studentTrainingRaidId = '';
let studentClosedRaidId = '';
let soloCaptureTimer = null;
let soloCaptureBusy = false;
let currentSoloQuiz = null;
let soloQuizChoice = -1;
let soloQuizQueue = {};
let lastSoloQuizId = {};
let currentRaidQuiz = null;
let raidQuizChoice = -1;
let teacherSoloQuiz = null;
let teacherSoloChoice = -1;
let adventureBattleLog = [];
const raidFighters = new Map();
const adventureCatalog = new Map(STAGES_DATA.flatMap(stage => stage.pokemons).map(poke => [poke.id, poke]));
for (const boss of RAID_BOSSES) adventureCatalog.set(boss.bossId, {id:boss.bossId,name:boss.name.split(' ')[0],type:boss.type,typeBg:boss.typeBg,cp:3000});
const studentDexEntries = STAGES_DATA.flatMap(stage => stage.pokemons.map(poke => ({...poke,stageId:stage.stageId,stageTitle:stage.title})));
let studentDexFilter = 'all';
const savedClassRoster = new Map();
try {
  const saved = JSON.parse(localStorage.getItem(CLASS_ROSTER_KEY) || '[]');
  if (Array.isArray(saved)) for (const row of saved) if (row && typeof row.name === 'string') savedClassRoster.set(row.name, row);
} catch (error) { console.warn('Class roster could not be restored', error); }
// Legacy saves are imported only into the matching legacy nickname on first use.
myStudentXP = 0;
studentCaughtList = [];

function normalizeStudentName(name) { return String(name || '').normalize('NFKC').trim().replace(/\s+/g, ' ').slice(0, 30); }
function profileStorageKey(name) { return PROFILE_PREFIX + encodeURIComponent(normalizeStudentName(name)); }
function validCaught(ids) { return Array.isArray(ids) ? [...new Set(ids.filter(id => Number.isInteger(id) && adventureCatalog.has(id)))] : []; }
function safeXP(value) { return Number.isFinite(Number(value)) ? Math.max(0, Math.min(1000000, Math.floor(Number(value)))) : 0; }
function trainerLevel(xp) { return Math.min(30, 1 + Math.floor(safeXP(xp) / 300)); }
function savedProfileNames() {
  try { const names = JSON.parse(localStorage.getItem(PROFILE_INDEX) || '[]'); return Array.isArray(names) ? [...new Set(names.filter(n => typeof n === 'string').map(normalizeStudentName))] : []; }
  catch { return []; }
}
function saveStudentProfile() {
  if (!activeStudentProfile) return false;
  Object.assign(activeStudentProfile, {xp:myStudentXP,caught:validCaught(studentCaughtList),activePokemon:selectedStudentPokemon,
    stageId:studentCurrentStageId,pokeIdx:studentCurrentPokeIdx,updatedAt:Date.now(),
    rewardedRaids:[...rewardedRaids].slice(-100),receivedResults:[...receivedResults].slice(-500)});
  activeStudentProfile.stageProgress[studentCurrentStageId] = studentCurrentPokeIdx;
  const status = document.getElementById('studentSaveStatus');
  try {
    localStorage.setItem(profileStorageKey(activeStudentProfile.name), JSON.stringify(activeStudentProfile));
    const names = savedProfileNames();
    if (!names.includes(activeStudentProfile.name)) localStorage.setItem(PROFILE_INDEX, JSON.stringify([...names,activeStudentProfile.name]));
    localStorage.setItem('pokemon_student_name', activeStudentProfile.name);
    if (status) status.textContent = '✓ ' + activeStudentProfile.name + ' · 이 기기에 저장됨';
    return true;
  } catch (error) {
    if (status) status.textContent = '⚠ 저장하지 못했어요. 브라우저 저장 공간·설정을 확인하세요.';
    console.warn('Student profile save failed', error);
    return false;
  }
}
function loadStudentProfile(name) {
  name = normalizeStudentName(name);
  if (!name) return;
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(profileStorageKey(name)) || 'null'); } catch (e) {}
  if (!saved || saved.version !== 2) {
    saved = {version:2,name,id:'stu_' + Math.random().toString(36).slice(2),xp:0,caught:[],activePokemon:0,stageId:1,pokeIdx:0,stageProgress:{},raidWins:0};
    try {
      if (normalizeStudentName(localStorage.getItem('pokemon_student_name')) === name) {
        saved.xp = safeXP(localStorage.getItem('pokemon_student_xp'));
        saved.caught = validCaught(JSON.parse(localStorage.getItem('pokemon_student_caught') || '[]'));
      }
    } catch (e) {}
  }
  saved.name = name;
  if (!/^stu_[a-z0-9_]+$/i.test(saved.id)) saved.id = 'stu_' + Math.random().toString(36).slice(2);
  saved.stageProgress = saved.stageProgress && typeof saved.stageProgress === 'object' ? saved.stageProgress : {};
  saved.raidWins = safeXP(saved.raidWins);
  saved.training = saved.training && typeof saved.training === 'object' ? saved.training : {};
  saved.power = saved.power && typeof saved.power === 'object' ? saved.power : {};
  saved.captureSteps = saved.captureSteps && typeof saved.captureSteps === 'object' ? saved.captureSteps : {};
  activeStudentProfile = saved;
  myStudentName = name;
  myStudentId = saved.id;
  myStudentXP = safeXP(saved.xp);
  studentCaughtList = validCaught(saved.caught);
  selectedStudentPokemon = studentCaughtList.includes(saved.activePokemon) ? saved.activePokemon : studentCaughtList[0] || 0;
  const stage = STAGES_DATA.find(stage => stage.stageId === saved.stageId) || STAGES_DATA[0];
  studentCurrentStageId = stage.stageId;
  studentCurrentPokeIdx = Math.max(0, Math.min(stage.pokemons.length - 1, Number.isInteger(saved.pokeIdx) ? saved.pokeIdx : 0));
  receivedResults.clear(); rewardedRaids.clear();
  for (const id of Array.isArray(saved.receivedResults) ? saved.receivedResults : []) receivedResults.add(id);
  for (const id of Array.isArray(saved.rewardedRaids) ? saved.rewardedRaids : []) rewardedRaids.add(id);
  pendingAnswer = null; studentFighter = null;
  currentSoloQuiz = null; soloQuizChoice = -1; soloQuizQueue = {}; lastSoloQuizId = {};
  saveStudentProfile();
}
function renderSavedStudentProfiles() {
  const names = savedProfileNames();
  document.getElementById('savedStudentNames').innerHTML = names.map(name => '<option value="' + escapeClassroomText(name) + '"></option>').join('');
  const container = document.getElementById('savedStudentProfiles');
  container.innerHTML = '';
  for (const name of names) {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = '🎒 ' + name;
    button.addEventListener('click', () => { document.getElementById('studentJoinName').value = name; });
    container.appendChild(button);
  }
}
function switchStudentProfile() {
  closeStudentDex();
  saveStudentProfile();
  clearInterval(classroomPulseTimer); clearTimeout(studentRetryTimer); clearTimeout(soloCaptureTimer);
  if (mqttStudentClient) { mqttStudentClient.onConnectionLost = () => {}; if (mqttStudentClient.isConnected()) mqttStudentClient.disconnect(); }
  mqttStudentClient = null; studentReady = false; pendingAnswer = null; soloCaptureBusy = false;
  isStudentInRaid = false; studentTrainingRaidId = ''; studentClosedRaidId = ''; activeStudentProfile = null;
  document.getElementById('studentSoloBox').style.display = 'none';
  document.getElementById('studentRaidBox').style.display = 'none';
  document.getElementById('studentRaidVictoryModal').style.display = 'none';
  document.getElementById('studentJoinBox').style.display = 'flex';
  document.getElementById('studentJoinName').value = '';
  setStudentConnection('닉네임을 선택하거나 새로 입력하세요', false);
  renderSavedStudentProfiles();
}
initMultiplayerSystem = function () { adventureBase.init(); renderSavedStudentProfiles(); renderSavedClassRoster(); };
joinClassroomBattle = function () {
  const input = document.getElementById('studentJoinName');
  input.value = normalizeStudentName(input.value);
  if (!input.value) { alert('닉네임을 입력해주세요!'); return; }
  if (activeStudentProfile && activeStudentProfile.name !== input.value) saveStudentProfile();
  loadStudentProfile(input.value);
  adventureBase.join();
};
initStudentSoloGame = function () { renderStudentStageTabs(); renderStudentSoloGame(); updateStudentHeaderStats(); };
selectStudentStage = function (stageId) {
  const stage = STAGES_DATA.find(stage => stage.stageId === stageId);
  if (!stage) return;
  clearTimeout(soloCaptureTimer); soloCaptureBusy = false;
  studentCurrentStageId = stageId;
  currentSoloQuiz = null; soloQuizChoice = -1;
  studentCurrentPokeIdx = Math.max(0, Math.min(stage.pokemons.length - 1, Number(activeStudentProfile?.stageProgress[stageId]) || 0));
  renderStudentStageTabs(); renderStudentSoloGame(); saveStudentProfile();
};

function nextSoloQuiz(stageId) {
  const bank = PROCESS_QUIZZES[stageId];
  if (!soloQuizQueue[stageId]?.length) {
    soloQuizQueue[stageId] = shuffledQuizIndices(bank.length);
    if (bank.length > 1 && bank[soloQuizQueue[stageId][0]].id === lastSoloQuizId[stageId]) {
      [soloQuizQueue[stageId][0],soloQuizQueue[stageId][1]] = [soloQuizQueue[stageId][1],soloQuizQueue[stageId][0]];
    }
  }
  const quiz = shuffledQuiz(bank[soloQuizQueue[stageId].shift()]);
  lastSoloQuizId[stageId] = quiz.id;
  return quiz;
}
function renderReasonOptions(target,quiz,choice,selectFunction,locked=false) {
  const el=document.getElementById(target);
  el.innerHTML=quiz.choices.map((label,index)=>'<button type="button" class="reason-option" aria-pressed="'+(choice===index)+'" onclick="'+selectFunction+'('+index+')" '+(locked?'disabled':'')+'><b>'+(index+1)+'.</b> '+escapeClassroomText(label)+'</button>').join('');
}
renderStudentSoloGame = function () {
  adventureBase.soloRender();
  const stage=STAGES_DATA.find(s=>s.stageId===studentCurrentStageId);
  if(!stage)return;
  const poke=stage.pokemons[studentCurrentPokeIdx];
  if(!currentSoloQuiz) currentSoloQuiz=nextSoloQuiz(stage.stageId);
  soloQuizChoice=-1; soloCaptureBusy=false;
  document.getElementById('studentSoloFormula').textContent='어떤 생각이 맞을까요?';
  document.getElementById('studentSoloQuestion').textContent=currentSoloQuiz.stem;
  document.getElementById('studentTrainingProgress').textContent='🔴 '+poke.name+' 포획: '+(activeStudentProfile?.captureSteps[poke.id]||0)+'/2개 이해 · 정답마다 훈련 에너지 +1';
  document.getElementById('studentSoloSubmit').textContent='선택한 생각 확인하기';
  renderReasonOptions('studentSoloOptions',currentSoloQuiz,-1,'chooseStudentSoloOption');
};
function chooseStudentSoloOption(index) {
  if(soloCaptureBusy || !currentSoloQuiz || index<0 || index>=currentSoloQuiz.choices.length)return;
  soloQuizChoice=index;
  renderReasonOptions('studentSoloOptions',currentSoloQuiz,index,'chooseStudentSoloOption');
}

function pokemonBattleStats(id, xp, power = 0) {
  const pokemon = adventureCatalog.get(id);
  if (!pokemon) return null;
  const type = pokemon.type.split('/')[0], level = trainerLevel(xp);
  const moves = {전기:'10만볼트',불꽃:'화염방사',물:'물대포',풀:'덩굴채찍',얼음:'냉동빔',드래곤:'용의파동',에스퍼:'사이코키네시스',고스트:'섀도볼',격투:'파동탄',벌레:'시저크로스',비행:'에어슬래시',땅:'대지의힘',바위:'스톤에지',독:'독침',강철:'아이언헤드',악:'악의파동',페어리:'문포스',노말:'몸통박치기'};
  power = Math.max(0,Math.min(20,Math.floor(Number(power)||0)));
  return {pokemonId:id,name:pokemon.name,type,move:moves[type] || '몸통박치기',level,power,
    damage:25 + Math.floor((pokemon.cp || 500) / 800) * 5 + (level - 1) * 2 + power * 4,maxHp:60 + level * 4 + power * 6};
}
function effectiveness(type, bossId) {
  if (bossId === 150 && ['고스트','악','벌레'].includes(type)) return 1.5;
  if (bossId === 384 && ['얼음','드래곤','페어리','바위'].includes(type)) return 1.5;
  return 1;
}
function renderStudentCollection() {
  const cards = studentCaughtList.map(id => {
    const power = Math.max(0,Math.floor(Number(activeStudentProfile?.power[id])||0));
    const energy = Math.max(0,Math.floor(Number(activeStudentProfile?.training[id])||0));
    const poke = pokemonBattleStats(id,myStudentXP,power), selected = id === selectedStudentPokemon;
    return '<div class="partner-choice" aria-pressed="' + selected + '"><button type="button" class="partner-select" onclick="selectStudentPartner(' + id + ')">' +
      '<img src="' + getPokemonArtworkUrl(id) + '" alt="' + escapeClassroomText(poke.name) + '" loading="lazy"><strong>' + escapeClassroomText(poke.name) +
      '</strong><small>훈련 +' + power + ' · ' + escapeClassroomText(poke.type) + '</small><span class="selected-label">' + (selected ? '✓ 출전 파트너' : '출전 선택') + '</span></button>' +
      '<button type="button" class="strengthen-button" onclick="strengthenStudentPokemon(' + id + ')" ' + (energy < 3 || power >= 20 ? 'disabled' : '') + '>⚡ 강화 ' + energy + '/3</button></div>';
  }).join('');
  for (const id of ['studentCollection','studentRaidTeam']) {
    const el = document.getElementById(id);
    el.innerHTML = cards || '<p class="adventure-note">아직 잡은 포켓몬이 없어요. 차시 문제를 풀어 첫 파트너를 만나세요!</p>';
  }
  renderStudentPartner();
}
function renderStudentPartner() {
  const stats = studentFighter?.pokemonId === selectedStudentPokemon ? studentFighter : pokemonBattleStats(selectedStudentPokemon,myStudentXP,activeStudentProfile?.power[selectedStudentPokemon]);
  const img = document.getElementById('studentPartnerImg');
  img.hidden = !stats;
  if (stats) { img.src = getPokemonArtworkUrl(stats.pokemonId); img.alt = stats.name; }
  document.getElementById('studentPartnerName').textContent = stats?.name || '먼저 포켓몬을 잡아주세요';
  document.getElementById('studentPartnerLevel').textContent = stats ? 'Lv.' + stats.level + ' · 강화 +' + (stats.power||0) : '';
  const fighter = studentFighter?.pokemonId === selectedStudentPokemon ? studentFighter : null;
  const hp = fighter ? fighter.hp : stats?.maxHp || 0, maxHp = fighter?.maxHp || stats?.maxHp || 1;
  document.getElementById('studentPartnerHpBar').style.width = hp / maxHp * 100 + '%';
  document.getElementById('studentPartnerHpText').textContent = stats ? 'HP ' + hp + ' / ' + maxHp : '';
  document.getElementById('studentPartnerMove').textContent = stats ? stats.move + ' · 기본 위력 ' + stats.damage + ' · 유리한 상성 ×1.5' : '내 도감의 포켓몬으로만 출전할 수 있어요.';
  document.getElementById('studentPartnerRecover').hidden = !stats || !fighter || hp > 0;
  document.getElementById('studentGoCapture').hidden = !!stats;
  const attack = document.getElementById('studentRaidAttackButton');
  attack.disabled = !stats || hp <= 0 || studentSolved || !!pendingAnswer || !studentReady || raidQuizChoice<0;
  attack.textContent = !stats ? '🌿 먼저 포켓몬을 잡아주세요' : studentSolved ? '✓ 공격 완료 · 다음 문제 대기' : pendingAnswer ? '공격 확인 중…' : raidQuizChoice<0 ? '✏️ 답을 고르거나 입력하세요' : '⚡ ' + stats.move + ' 사용!';
}
function selectStudentPartner(id) {
  if (!studentCaughtList.includes(id) || pendingAnswer) return;
  selectedStudentPokemon = id;
  studentFighter = null;
  saveStudentProfile(); renderStudentCollection(); sendStudentPresence();
}
function strengthenStudentPokemon(id) {
  if (!activeStudentProfile || !studentCaughtList.includes(id)) return;
  const energy = Math.max(0,Math.floor(Number(activeStudentProfile.training[id])||0));
  const power = Math.max(0,Math.floor(Number(activeStudentProfile.power[id])||0));
  if (energy < 3 || power >= 20) return;
  activeStudentProfile.training[id] = energy - 3;
  activeStudentProfile.power[id] = power + 1;
  if (studentFighter?.pokemonId === id) studentFighter = null;
  saveStudentProfile(); renderStudentCollection(); sendStudentPresence();
}
function goCaptureForRaid() {
  studentTrainingRaidId = studentRaidSessionId;
  adventureBase.returnSolo();
}
function recoverStudentPartner() {
  if (!studentReady || !studentFighter || studentFighter.hp > 0) return;
  sendClassroomMessage(mqttStudentClient,'to_host',{type:'RECOVER',studentId:myStudentId,raidId:studentRaidSessionId,pokemonId:selectedStudentPokemon});
}
updateStudentHeaderStats = function () {
  adventureBase.stats(); renderStudentCollection();
  document.getElementById('studentMyCaught').textContent = '🔴 도감 ' + studentCaughtList.length + '/' + studentDexEntries.length;
  renderStudentDex();
};
function openStudentDex() {
  const modal=document.getElementById('studentDexModal');
  modal.hidden=false;
  renderStudentDex();
  modal.querySelector('.student-dex-heading button').focus();
}
function closeStudentDex() {
  const modal=document.getElementById('studentDexModal');
  if (!modal || modal.hidden) return;
  modal.hidden=true;
  document.querySelector('.student-dex-open')?.focus();
}
function setStudentDexFilter(filter) {
  studentDexFilter=filter==='caught'?'caught':'all';
  renderStudentDex();
}
function renderStudentDex() {
  const count=studentCaughtList.filter(id=>studentDexEntries.some(p=>p.id===id)).length;
  document.getElementById('studentDexHeaderCount').textContent=count+'/'+studentDexEntries.length;
  if(document.getElementById('studentDexModal').hidden)return;
  document.getElementById('studentDexProgress').textContent=count+' / '+studentDexEntries.length+'마리 발견 · '+(activeStudentProfile?.name||'닉네임을 입력하면 기록을 볼 수 있어요');
  document.getElementById('studentDexAllButton').setAttribute('aria-pressed',String(studentDexFilter==='all'));
  document.getElementById('studentDexCaughtButton').setAttribute('aria-pressed',String(studentDexFilter==='caught'));
  const entries=studentDexEntries.filter(p=>studentDexFilter==='all'||studentCaughtList.includes(p.id));
  document.getElementById('studentDexGrid').innerHTML=entries.map(p=>{
    const caught=studentCaughtList.includes(p.id);
    return '<button type="button" class="student-dex-card'+(caught?' caught':' locked')+'" onclick="showStudentDexDetail('+p.id+')" aria-label="No. '+String(p.id).padStart(3,'0')+' '+(caught?escapeClassroomText(p.name):'미발견 포켓몬')+'">'+
      '<span class="dex-number">No. '+String(p.id).padStart(3,'0')+'</span><img src="'+getPokemonArtworkUrl(p.id)+'" alt="" loading="lazy"><strong>'+(caught?escapeClassroomText(p.name):'???')+'</strong><small>'+(caught?'✓ 포획':'미발견')+'</small></button>';
  }).join('')||'<p class="student-dex-empty">아직 잡은 포켓몬이 없어요. 퀴즈를 풀어 첫 포켓몬을 만나 보세요!</p>';
}
function showStudentDexDetail(id) {
  const p=studentDexEntries.find(p=>p.id===id);
  if(!p)return;
  const caught=studentCaughtList.includes(id), detail=document.getElementById('studentDexDetail');
  if(!caught){ detail.innerHTML='<strong>No. '+String(id).padStart(3,'0')+' · 미발견</strong><span>'+p.stageId+'차시 '+escapeClassroomText(p.stageTitle)+'에서 만날 수 있어요. 퀴즈를 풀어 포획해 보세요.</span>'; return; }
  const power=Math.max(0,Math.floor(Number(activeStudentProfile?.power[id])||0));
  const energy=Math.max(0,Math.floor(Number(activeStudentProfile?.training[id])||0));
  detail.innerHTML='<img src="'+getPokemonArtworkUrl(id)+'" alt="'+escapeClassroomText(p.name)+'"><div><strong>No. '+String(id).padStart(3,'0')+' · '+escapeClassroomText(p.name)+'</strong><span>'+escapeClassroomText(p.type)+' · '+p.stageId+'차시 · 훈련 +'+power+' · 에너지 '+energy+'/3</span><span>'+(selectedStudentPokemon===id?'현재 레이드 출전 파트너':'내가 잡은 포켓몬')+'</span><button type="button" class="adventure-button" onclick="selectStudentPartner('+id+');showStudentDexDetail('+id+')">'+(selectedStudentPokemon===id?'✓ 출전 중':'레이드 파트너로 선택')+'</button></div>';
}
window.addEventListener('keydown',event=>{if(event.key==='Escape'&&!document.getElementById('studentDexModal').hidden)closeStudentDex();});
sendStudentPresence = function () {
  sendClassroomMessage(mqttStudentClient,'to_host',{type:'JOIN',studentId:myStudentId,name:myStudentName,
    caught:studentCaughtList,selectedPokemon:selectedStudentPokemon,xp:myStudentXP,power:activeStudentProfile?.power[selectedStudentPokemon]||0});
};
function renderSavedClassRoster() {
  const target = document.getElementById('savedClassRoster');
  target.innerHTML = [...savedClassRoster.values()].sort((a,b) => b.lastSeen - a.lastSeen).map(row =>
    '<span class="roster-entry">' + escapeClassroomText(row.name) + ' · 도감 ' + (Number(row.caughtCount) || 0) + '마리 · ' + safeXP(row.xp) + ' XP</span>').join('') || '아직 저장된 닉네임이 없습니다.';
}
function rememberClassStudent(student) {
  const old = savedClassRoster.get(student.name);
  if (old && old.xp === student.xp && old.caughtCount === student.caught.length && Date.now()-old.lastSeen < 60000) return;
  savedClassRoster.set(student.name,{name:student.name,xp:student.xp,caughtCount:student.caught.length,lastSeen:Date.now()});
  try { localStorage.setItem(CLASS_ROSTER_KEY,JSON.stringify([...savedClassRoster.values()])); } catch (e) { console.warn('Roster save failed',e); }
  renderSavedClassRoster();
}
function hostFighter(studentId) {
  const student = connectedStudents.get(studentId);
  if (!student || !student.caught?.includes(student.selectedPokemon)) return null;
  const key = studentId + ':' + student.selectedPokemon;
  if (!raidFighters.has(key)) {
    const stats = pokemonBattleStats(student.selectedPokemon,student.xp,student.power);
    if (!stats) return null;
    raidFighters.set(key,{...stats,hp:stats.maxHp});
  }
  return raidFighters.get(key);
}
function sendAdventureAck(studentId) {
  sendClassroomMessage(mqttHostClient,'to_student/' + studentId,{type:'JOIN_ACK',state:raidSnapshot(),
    solved:acceptedAnswers.has(studentId + ':' + currentProblemId()),fighter:gameState.isRaidMode ? hostFighter(studentId) : null});
}
handleHostIncomingMessage = function (data) {
  if (!data || typeof data.studentId !== 'string' || !/^stu_[a-z0-9_]+$/i.test(data.studentId)) return;
  if (data.type === 'JOIN') {
    const previous = connectedStudents.get(data.studentId), caught = validCaught(data.caught);
    const student = {name:normalizeStudentName(data.name)||'학생',score:previous?.score||0,lastSeen:Date.now(),caught,
      selectedPokemon:caught.includes(data.selectedPokemon) ? data.selectedPokemon : caught[0] || 0,xp:safeXP(data.xp),power:Math.max(0,Math.min(20,Math.floor(Number(data.power)||0)))};
    connectedStudents.set(data.studentId,student); updateConnectedStudentsUI(); rememberClassStudent(student);
    if (!previous) showAttackToast('👋 <b>' + escapeClassroomText(student.name) + '</b> · ' + (adventureCatalog.get(student.selectedPokemon)?.name || '첫 포켓몬 준비 중'),'#38bdf8');
    sendAdventureAck(data.studentId);
  } else if (data.type === 'RECOVER' && data.raidId === raidSessionId && !raidFinished) {
    const fighter = hostFighter(data.studentId);
    if (fighter && fighter.pokemonId === data.pokemonId && fighter.hp === 0) fighter.hp = fighter.maxHp;
    sendAdventureAck(data.studentId);
  } else adventureBase.hostIncoming(data);
};
updateConnectedStudentsUI = function () {
  adventureBase.roster();
  const el = document.getElementById('connectedStudentChips');
  if (connectedStudents.size) el.innerHTML = [...connectedStudents.values()].map(s => '<div class="student-chip">🟢 ' + escapeClassroomText(s.name) + ' · ' + escapeClassroomText(adventureCatalog.get(s.selectedPokemon)?.name || '포획 준비') + '</div>').join('');
};
openMultiplayerModal = function () { adventureBase.modal(); renderSavedClassRoster(); };

startRaidBattle = function () {
  sound.init(); sound.startBGM();
  gameState.isRaidMode = true;
  gameState.currentRaidBossIndex = Number(document.getElementById('raidBossChoice').value) === 1 ? 1 : 0;
  gameState.currentRaidPhase = 0;
  beginRaidSession(); loadCurrentRaidBattle(); showBattleView(); renderStagePreviews(); broadcastRaidStart();
  for (const id of connectedStudents.keys()) sendAdventureAck(id);
};
beginRaidSession = function () {
  raidSessionId = globalThis.crypto?.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
  const participants = [...connectedStudents.values()].filter(s => s.caught?.length).length;
  const boss = RAID_BOSSES[gameState.currentRaidBossIndex];
  boss.phases = shuffledQuizIndices(RAID_REASONING_QUIZZES.length).slice(0,3).map(i => {
    const quiz = shuffledQuiz(RAID_REASONING_QUIZZES[i]);
    return {id:quiz.id,question:quiz.stem,formula:'풀이 과정을 고르세요',choices:quiz.choices,correct:quiz.correct,explanation:quiz.explanation};
  });
  boss.maxHp = Math.max(100,participants * 25) * boss.phases.length;
  raidHp = boss.maxHp; raidFinished = false;
  acceptedAnswers.clear(); answerResults.clear(); raidFighters.clear();
};
raidSnapshot = function () {
  const state=adventureBase.raidSnapshot();
  if(state.type==='RAID_START') state.choices=[...RAID_BOSSES[gameState.currentRaidBossIndex].phases[gameState.currentRaidPhase].choices];
  return state;
};
loadCurrentRaidBattle = function () {
  adventureBase.raidLoad();
  const phase=RAID_BOSSES[gameState.currentRaidBossIndex].phases[gameState.currentRaidPhase];
  document.getElementById('quizDifficultyTag').textContent='🧠 풀이 과정과 오류 찾기';
  document.getElementById('quizQuestionText').textContent=phase.question;
  document.getElementById('quizFormulaBox').innerHTML=phase.choices.map((choice,index)=>'<div class="teacher-reason-choice">'+(index+1)+'. '+escapeClassroomText(choice)+'</div>').join('');
  document.getElementById('answerInputsContainer').style.display='none';
  document.querySelector('.touch-keypad').style.display='none';
};
loadCurrentBattle = function () {
  document.getElementById('answerInputsContainer').style.display='';
  document.querySelector('.touch-keypad').style.display='';
  adventureBase.soloLoad();
  const stage=STAGES_DATA.find(s=>s.stageId===gameState.currentStageIndex);
  teacherSoloQuiz=nextSoloQuiz(stage.stageId); teacherSoloChoice=-1;
  document.getElementById('quizDifficultyTag').textContent='🧠 '+stage.concept+' · 생각 퀴즈';
  document.getElementById('quizQuestionText').textContent=teacherSoloQuiz.stem;
  renderTeacherSoloChoices();
  document.getElementById('answerInputsContainer').style.display='none';
  document.querySelector('.touch-keypad').style.display='none';
};
function renderTeacherSoloChoices() {
  document.getElementById('quizFormulaBox').innerHTML=teacherSoloQuiz.choices.map((choice,index)=>
    '<button type="button" class="teacher-reason-choice" aria-pressed="'+(teacherSoloChoice===index)+'" onclick="chooseTeacherSoloOption('+index+')">'+(index+1)+'. '+escapeClassroomText(choice)+'</button>').join('')+
    '<button type="button" class="teacher-check-choice" onclick="checkTeacherSoloOption()">선택한 생각 확인하기</button>';
}
function chooseTeacherSoloOption(index) { teacherSoloChoice=index; renderTeacherSoloChoices(); }
function checkTeacherSoloOption() {
  if(teacherSoloChoice<0){showNoticeBanner('💡','풀이 방법을 하나 골라주세요.');return;}
  if(teacherSoloChoice!==teacherSoloQuiz.correct){sound.playError();showNoticeBanner('💡',escapeClassroomText(teacherSoloQuiz.explanation));return;}
  const stage=STAGES_DATA.find(s=>s.stageId===gameState.currentStageIndex);
  const poke=stage.pokemons[gameState.currentPokeIndex];
  handleCaptureSuccess(poke.id,poke.name,teacherSoloQuiz.explanation);
  document.getElementById('catchSuccessDesc').innerHTML='풀이 원리를 설명했습니다! 도감 등록 완료!';
}
showMapView = function () {
  document.getElementById('answerInputsContainer').style.display='';
  document.querySelector('.touch-keypad').style.display='';
  adventureBase.map();
};
handleStudentAnswerSubmit = function (data) {
  if (typeof data.requestId !== 'string' || data.requestId.length > 100) return;
  const cacheKey = data.studentId + ':' + data.requestId;
  if (answerResults.has(cacheKey)) { sendClassroomMessage(mqttHostClient,'to_student/' + data.studentId,answerResults.get(cacheKey)); return; }
  const key = data.studentId + ':' + currentProblemId();
  const active = gameState.isRaidMode && !raidFinished && data.problemId === currentProblemId();
  const duplicate = acceptedAnswers.has(key);
  const student = connectedStudents.get(data.studentId), fighter = hostFighter(data.studentId);
  const eligible = fighter && fighter.pokemonId === data.pokemonId && fighter.hp > 0;
  const boss = RAID_BOSSES[gameState.currentRaidBossIndex];
  const phase = boss.phases[gameState.currentRaidPhase];
  const value = String(data.answer ?? '').trim();
  const correct = !!(active && !duplicate && eligible && value === String(phase.correct));
  const multiplier = fighter ? effectiveness(fighter.type,boss.bossId) : 1;
  const damage = correct ? Math.round(fighter.damage * multiplier) : 0;
  const counter = active && !duplicate && eligible && !correct ? Math.min(12,fighter.hp) : 0;
  if (counter) fighter.hp -= counter;
  const result = {type:'RESULT',requestId:data.requestId,problemId:data.problemId,isCorrect:correct,earnedXP:correct ? 100 : 0,
    pokemonId:data.pokemonId,damage,move:fighter?.move,multiplier,fighter:fighter ? {...fighter} : null,
    message:!active ? '문제가 바뀌었거나 레이드가 끝났습니다.' : duplicate ? '이미 공격했어요. 다음 문제를 기다리세요.' : !eligible ? '잡은 포켓몬을 선택하고 체력을 확인해주세요.' : counter ? '보스의 반격! HP −' + counter + (fighter.hp === 0 ? ' · 응원받고 회복하거나 포켓몬을 교체하세요.' : ' · 풀이 이유를 다시 살펴보세요.') : '',
    explanation:active ? phase.explanation : '',correctChoice:active ? phase.correct : -1};
  answerResults.set(cacheKey,result);
  if (answerResults.size > 3000) answerResults.delete(answerResults.keys().next().value);
  if (correct) acceptedAnswers.add(key);
  sendClassroomMessage(mqttHostClient,'to_student/' + data.studentId,result);
  if (correct) {
    const attack = {type:'RAID_ATTACK',raidId:raidSessionId,studentId:data.studentId,name:student.name,pokemonId:fighter.pokemonId,move:fighter.move,damage,multiplier};
    sendClassroomMessage(mqttHostClient,'broadcast',attack);
    showAttackToast('<img src="' + getPokemonArtworkUrl(fighter.pokemonId) + '" alt="" style="width:40px;height:40px;vertical-align:middle"> <b>' + escapeClassroomText(student.name) + '</b>의 ' + escapeClassroomText(fighter.name) + ' · ' + fighter.move + '! −' + damage + ' HP','#67e8f9');
    sound.playCatchSuccess();
    const before = gameState.currentRaidPhase;
    applyRaidDamage(damage);
    // A small class can advance after every participating trainer solves the problem.
    const participants = [...connectedStudents.entries()].filter(([,s]) => s.caught?.length && Date.now()-s.lastSeen < 20000);
    if (!raidFinished && before === gameState.currentRaidPhase && participants.length && participants.every(([id]) => acceptedAnswers.has(id + ':' + currentProblemId()))) {
      const floor = Math.round(boss.maxHp * (1 - (gameState.currentRaidPhase + 1) / boss.phases.length));
      sendClassroomMessage(mqttHostClient,'broadcast',{type:'RAID_TEAM_BONUS',raidId:raidSessionId,damage:raidHp-floor});
      applyRaidDamage(boss.maxHp / boss.phases.length);
    }
  }
};
function addStudentBattleLog(message) {
  adventureBattleLog.unshift(message); adventureBattleLog = adventureBattleLog.slice(0,3);
  document.getElementById('studentBattleLog').textContent = adventureBattleLog.join(' / ');
}
function animateBattleSprite(id, kind) {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const el = document.getElementById(id);
  const frames = kind === 'attack' ? [{transform:'translateX(0)'},{transform:'translateX(26px) scale(1.12)'},{transform:'translateX(0)'}] : [{filter:'brightness(1)',transform:'translateX(0)'},{filter:'brightness(2)',transform:'translateX(-9px)'},{transform:'translateX(9px)'},{filter:'brightness(1)',transform:'translateX(0)'}];
  el?.animate?.(frames,{duration:500,easing:'ease-out'});
}
handleStudentIncomingData = function (data) {
  if (!data) return;
  if (data.type === 'RAID_TEAM_BONUS' && data.raidId === studentRaidSessionId) { addStudentBattleLog('🤝 전원 정답! 협동 보너스 −' + data.damage + ' HP · 다음 단계로!'); return; }
  if (data.type === 'RAID_ATTACK') {
    if (data.raidId !== studentRaidSessionId || !isStudentInRaid) return;
    const name = adventureCatalog.get(data.pokemonId)?.name || '포켓몬';
    addStudentBattleLog(data.name + '의 ' + name + '! ' + data.move + ' −' + data.damage + ' HP' + (data.multiplier > 1 ? ' · 효과가 굉장했다!' : ''));
    animateBattleSprite('studentRaidBossImg','hit');
    if (data.studentId === myStudentId) animateBattleSprite('studentPartnerImg','attack');
    return;
  }
  if (data.type === 'JOIN_ACK') {
    adventureBase.incoming(data);
    studentFighter = data.fighter || null;
    renderStudentPartner();
    return;
  }
  if (data.type === 'RAID_START') {
    if (data.finished && rewardedRaids.has(data.raidId)) { studentClosedRaidId = data.raidId; if (isStudentInRaid) adventureBase.returnSolo(); return; }
    if (data.raidId === studentTrainingRaidId || data.raidId === studentClosedRaidId) return;
    if (studentRaidSessionId !== data.raidId) { studentFighter = null; adventureBattleLog = []; addStudentBattleLog('내 파트너와 함께 출전!'); }
    const previous=studentProblemId;
    adventureBase.incoming(data);
    if(previous!==data.problemId || !currentRaidQuiz){
      currentRaidQuiz={choices:Array.isArray(data.choices)?data.choices:[]}; raidQuizChoice=-1;
      const answerInput=document.getElementById('studentRaidAnswerInput');
      answerInput.value=''; answerInput.disabled=false;
      renderReasonOptions('studentRaidOptions',currentRaidQuiz,-1,'chooseStudentRaidOption');
      document.getElementById('studentRaidFormula').textContent='어떤 풀이가 맞을까요?';
    }
    renderStudentCollection(); return;
  }
  if (data.type === 'RESULT') {
    const duplicate = receivedResults.has(data.requestId);
    adventureBase.incoming(data);
    if (!duplicate) {
      if (data.problemId === studentProblemId && data.fighter?.pokemonId === selectedStudentPokemon) studentFighter = data.fighter;
      if (data.isCorrect && data.problemId === studentProblemId) document.getElementById('studentRaidFeedback').textContent = '✨ ' + (data.move || '공격') + '! 보스에게 ' + data.damage + ' 대미지 · +100 XP';
      else if (data.fighter && data.problemId === studentProblemId) animateBattleSprite('studentPartnerImg','hit');
      if(data.problemId===studentProblemId && data.explanation){
        const feedback=document.getElementById('studentRaidFeedback');
        feedback.textContent += ' '+data.explanation;
        if(!data.isCorrect){
          raidQuizChoice=-1;
          document.getElementById('studentRaidAnswerInput').value='';
          renderReasonOptions('studentRaidOptions',currentRaidQuiz,-1,'chooseStudentRaidOption');
        }else{
          document.getElementById('studentRaidAnswerInput').disabled=true;
          renderReasonOptions('studentRaidOptions',currentRaidQuiz,Number(data.correctChoice),'chooseStudentRaidOption',true);
          document.getElementById('studentRaidOptions').children?.[Number(data.correctChoice)]?.classList.add('correct');
        }
      }
      saveStudentProfile(); renderStudentCollection();
    }
    return;
  }
  if (data.type === 'RAID_VICTORY') {
    const first = data.raidId === studentRaidSessionId && !rewardedRaids.has(data.raidId);
    adventureBase.incoming(data);
    if (first && activeStudentProfile) {
      activeStudentProfile.raidWins++;
      saveStudentProfile(); renderStudentCollection();
    }
    return;
  }
  adventureBase.incoming(data);
};
sendStudentRaidAnswer = function () {
  if (!studentCaughtList.includes(selectedStudentPokemon)) { alert('차시 문제를 풀어 포켓몬을 잡고 출전해주세요!'); return; }
  if (studentFighter?.pokemonId === selectedStudentPokemon && studentFighter.hp <= 0) { alert('응원을 받고 회복하거나 다른 포켓몬으로 교체해주세요.'); return; }
  if (!studentReady || Date.now()-lastTeacherAck>15000 || !mqttStudentClient?.isConnected()) { alert('선생님 연결을 확인해주세요.'); return; }
  if (!isStudentInRaid || studentSolved || pendingAnswer) return;
  if (raidQuizChoice<0) { alert('풀이 생각을 하나 골라주세요!'); return; }
  // Update the host before sending the attack on the same ordered MQTT connection.
  sendStudentPresence();
  pendingAnswer={type:'ANSWER',studentId:myStudentId,name:myStudentName,answer:String(raidQuizChoice),problemId:studentProblemId,
    pokemonId:selectedStudentPokemon,requestId:Date.now().toString(36)+Math.random().toString(36).slice(2)};
  sendClassroomMessage(mqttStudentClient,'to_host',pendingAnswer);
  renderStudentPartner();
};
function chooseStudentRaidOption(index) {
  if(!currentRaidQuiz || studentSolved || pendingAnswer || index<0 || index>=currentRaidQuiz.choices.length)return;
  raidQuizChoice=index;
  document.getElementById('studentRaidAnswerInput').value=String(index+1);
  renderReasonOptions('studentRaidOptions',currentRaidQuiz,index,'chooseStudentRaidOption');
  renderStudentPartner();
}
function setStudentRaidAnswerInput(value) {
  const input=document.getElementById('studentRaidAnswerInput');
  const digit=String(value).replace(/[^1-4]/g,'').slice(0,1);
  input.value=digit;
  if(digit) chooseStudentRaidOption(Number(digit)-1);
  else { raidQuizChoice=-1; if(currentRaidQuiz) renderReasonOptions('studentRaidOptions',currentRaidQuiz,-1,'chooseStudentRaidOption'); renderStudentPartner(); }
}
returnToStudentSoloGame = function () {
  if (rewardedRaids.has(studentRaidSessionId)) studentClosedRaidId = studentRaidSessionId;
  adventureBase.returnSolo(); saveStudentProfile();
};

sendStudentSoloAnswer = function () {
  if (!activeStudentProfile || !currentSoloQuiz) return;
  if (soloCaptureBusy) { currentSoloQuiz=null; renderStudentSoloGame(); return; }
  if (soloQuizChoice<0) { alert('풀이 생각을 하나 골라주세요!'); return; }
  const stage=STAGES_DATA.find(s=>s.stageId===studentCurrentStageId);
  const poke=stage.pokemons[studentCurrentPokeIdx];
  const correct=soloQuizChoice===currentSoloQuiz.correct;
  const fb=document.getElementById('studentSoloFeedback'); fb.style.display='block';
  fb.style.background=correct?'#143c2b':'#451d29'; fb.style.color=correct?'#86efac':'#fecaca';
  let reward='';
  if(correct){
    sound.playCatchSuccess(); myStudentXP+=30;
    const trainingId=selectedStudentPokemon||poke.id;
    activeStudentProfile.training[trainingId]=(Number(activeStudentProfile.training[trainingId])||0)+1;
    const steps=(Number(activeStudentProfile.captureSteps[poke.id])||0)+1;
    if(steps>=2){
      activeStudentProfile.captureSteps[poke.id]=0;
      const first=!studentCaughtList.includes(poke.id);
      if(first){studentCaughtList.push(poke.id);myStudentXP+=100;}
      if(!selectedStudentPokemon) selectedStudentPokemon=poke.id;
      reward=first?' 🎉 '+poke.name+' 포획! +100 XP. 이제 레이드에 출전할 수 있어요.':' '+poke.name+' 훈련 완료!';
      studentCurrentPokeIdx=Math.min(studentCurrentPokeIdx+1,stage.pokemons.length-1);
      if(first)sendClassroomMessage(mqttStudentClient,'to_host',{type:'POKE_CAUGHT',studentId:myStudentId,name:myStudentName,pokeName:poke.name,stageId:stage.stageId});
    }else activeStudentProfile.captureSteps[poke.id]=steps;
    saveStudentProfile(); updateStudentHeaderStats(); sendStudentPresence();
  }else sound.playError();
  fb.textContent=(correct?'✓ 이해했어요! +30 XP · 훈련 에너지 +1.':'다시 생각해 봐요.')+' '+currentSoloQuiz.explanation+reward;
  soloCaptureBusy=true;
  renderReasonOptions('studentSoloOptions',currentSoloQuiz,soloQuizChoice,'chooseStudentSoloOption',true);
  [...(document.getElementById('studentSoloOptions').children||[])].forEach((button,index)=>button.classList.add(index===currentSoloQuiz.correct?'correct':index===soloQuizChoice?'incorrect':''));
  document.getElementById('studentSoloSubmit').textContent='다음 생각 문제 →';
  document.getElementById('studentTrainingProgress').textContent='정답 2개마다 새 포켓몬 포획 · 훈련 에너지 3개로 강화 가능';
};
// Keep audio and the keyboard shortcut working after removing the toolbar buttons.
toggleAudio = function () { sound.sfxMuted = !sound.sfxMuted; };
toggleBGM = function () { sound.init(); sound.setBgmMute(!sound.bgmMuted); };
toggleVoice = function () { voice.enabled = !voice.enabled; };
// Intercept student shortcuts before the legacy numeric keypad handler.
window.addEventListener('keydown',event=>{
  if(new URLSearchParams(location.search).get('role')!=='student' || !studentReady || event.target?.closest?.('input, textarea, [contenteditable=true]'))return;
  if(/^[1-4]$/.test(event.key)){
    event.preventDefault();event.stopImmediatePropagation();
    if(isStudentInRaid)chooseStudentRaidOption(Number(event.key)-1);else chooseStudentSoloOption(Number(event.key)-1);
  }else if(event.key==='Enter'){
    event.preventDefault();event.stopImmediatePropagation();
    if(isStudentInRaid)sendStudentRaidAnswer();else sendStudentSoloAnswer();
  }
},true);
