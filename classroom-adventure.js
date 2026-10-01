/* Nickname save slots and captured-Pokemon classroom raids. Plain script, no build step. */
const adventureBase = {
  init: initMultiplayerSystem, join: joinClassroomBattle, incoming: handleStudentIncomingData,
  hostIncoming: handleHostIncomingMessage, stats: updateStudentHeaderStats,
  stage: selectStudentStage, soloRender: renderStudentSoloGame, presence: sendStudentPresence,
  answer: sendStudentRaidAnswer, applyDamage: applyRaidDamage, returnSolo: returnToStudentSoloGame,
  roster: updateConnectedStudentsUI, modal: openMultiplayerModal
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
let adventureBattleLog = [];
const raidFighters = new Map();
const adventureCatalog = new Map(STAGES_DATA.flatMap(stage => stage.pokemons).map(poke => [poke.id, poke]));
for (const boss of RAID_BOSSES) adventureCatalog.set(boss.bossId, {id:boss.bossId,name:boss.name.split(' ')[0],type:boss.type,typeBg:boss.typeBg,cp:3000});
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
  studentCurrentPokeIdx = Math.max(0, Math.min(stage.pokemons.length - 1, Number(activeStudentProfile?.stageProgress[stageId]) || 0));
  renderStudentStageTabs(); renderStudentSoloGame(); saveStudentProfile();
};

function pokemonBattleStats(id, xp) {
  const pokemon = adventureCatalog.get(id);
  if (!pokemon) return null;
  const type = pokemon.type.split('/')[0], level = trainerLevel(xp);
  const moves = {전기:'10만볼트',불꽃:'화염방사',물:'물대포',풀:'덩굴채찍',얼음:'냉동빔',드래곤:'용의파동',에스퍼:'사이코키네시스',고스트:'섀도볼',격투:'파동탄',벌레:'시저크로스',비행:'에어슬래시',땅:'대지의힘',바위:'스톤에지',독:'독침',강철:'아이언헤드',악:'악의파동',페어리:'문포스',노말:'몸통박치기'};
  return {pokemonId:id,name:pokemon.name,type,move:moves[type] || '몸통박치기',level,
    damage:25 + Math.floor((pokemon.cp || 500) / 800) * 5 + (level - 1) * 2,maxHp:60 + level * 4};
}
function effectiveness(type, bossId) {
  if (bossId === 150 && ['고스트','악','벌레'].includes(type)) return 1.5;
  if (bossId === 384 && ['얼음','드래곤','페어리','바위'].includes(type)) return 1.5;
  return 1;
}
function renderStudentCollection() {
  const cards = studentCaughtList.map(id => {
    const poke = pokemonBattleStats(id,myStudentXP), selected = id === selectedStudentPokemon;
    return '<button type="button" class="partner-choice" aria-pressed="' + selected + '" onclick="selectStudentPartner(' + id + ')">' +
      '<img src="' + getPokemonArtworkUrl(id) + '" alt="' + escapeClassroomText(poke.name) + '" loading="lazy"><strong>' + escapeClassroomText(poke.name) +
      '</strong><small>Lv.' + poke.level + ' · ' + escapeClassroomText(poke.type) + '</small><span class="selected-label">' + (selected ? '✓ 출전 파트너' : '출전 선택') + '</span></button>';
  }).join('');
  for (const id of ['studentCollection','studentRaidTeam']) {
    const el = document.getElementById(id);
    el.innerHTML = cards || '<p class="adventure-note">아직 잡은 포켓몬이 없어요. 차시 문제를 풀어 첫 파트너를 만나세요!</p>';
  }
  renderStudentPartner();
}
function renderStudentPartner() {
  const stats = studentFighter?.pokemonId === selectedStudentPokemon ? studentFighter : pokemonBattleStats(selectedStudentPokemon,myStudentXP);
  const img = document.getElementById('studentPartnerImg');
  img.hidden = !stats;
  if (stats) { img.src = getPokemonArtworkUrl(stats.pokemonId); img.alt = stats.name; }
  document.getElementById('studentPartnerName').textContent = stats?.name || '먼저 포켓몬을 잡아주세요';
  document.getElementById('studentPartnerLevel').textContent = stats ? 'Lv.' + stats.level : '';
  const fighter = studentFighter?.pokemonId === selectedStudentPokemon ? studentFighter : null;
  const hp = fighter ? fighter.hp : stats?.maxHp || 0, maxHp = fighter?.maxHp || stats?.maxHp || 1;
  document.getElementById('studentPartnerHpBar').style.width = hp / maxHp * 100 + '%';
  document.getElementById('studentPartnerHpText').textContent = stats ? 'HP ' + hp + ' / ' + maxHp : '';
  document.getElementById('studentPartnerMove').textContent = stats ? stats.move + ' · 기본 위력 ' + stats.damage + ' · 유리한 상성 ×1.5' : '내 도감의 포켓몬으로만 출전할 수 있어요.';
  document.getElementById('studentPartnerRecover').hidden = !stats || !fighter || hp > 0;
  document.getElementById('studentGoCapture').hidden = !!stats;
  const attack = document.getElementById('studentRaidAttackButton');
  attack.disabled = !stats || hp <= 0 || studentSolved || !!pendingAnswer || !studentReady;
  attack.textContent = !stats ? '🌿 먼저 포켓몬을 잡아주세요' : studentSolved ? '✓ 공격 완료 · 다음 문제 대기' : pendingAnswer ? '공격 확인 중…' : '⚡ ' + stats.move + ' 사용!';
}
function selectStudentPartner(id) {
  if (!studentCaughtList.includes(id) || pendingAnswer) return;
  selectedStudentPokemon = id;
  studentFighter = null;
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
  document.getElementById('studentMyCaught').textContent = '🔴 도감 ' + studentCaughtList.length + '마리';
};
sendStudentPresence = function () {
  sendClassroomMessage(mqttStudentClient,'to_host',{type:'JOIN',studentId:myStudentId,name:myStudentName,
    caught:studentCaughtList,selectedPokemon:selectedStudentPokemon,xp:myStudentXP});
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
    const stats = pokemonBattleStats(student.selectedPokemon,student.xp);
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
      selectedPokemon:caught.includes(data.selectedPokemon) ? data.selectedPokemon : caught[0] || 0,xp:safeXP(data.xp)};
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
  boss.maxHp = Math.max(100,participants * 25) * boss.phases.length;
  raidHp = boss.maxHp; raidFinished = false;
  acceptedAnswers.clear(); answerResults.clear(); raidFighters.clear();
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
  const value = String(data.answer ?? '').trim();
  const correct = !!(active && !duplicate && eligible && /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) && Math.abs(Number(value)-Number(boss.phases[gameState.currentRaidPhase].ansMain)) < 0.001);
  const multiplier = fighter ? effectiveness(fighter.type,boss.bossId) : 1;
  const damage = correct ? Math.round(fighter.damage * multiplier) : 0;
  const counter = active && !duplicate && eligible && !correct ? Math.min(12,fighter.hp) : 0;
  if (counter) fighter.hp -= counter;
  const result = {type:'RESULT',requestId:data.requestId,problemId:data.problemId,isCorrect:correct,earnedXP:correct ? 100 : 0,
    pokemonId:data.pokemonId,damage,move:fighter?.move,multiplier,fighter:fighter ? {...fighter} : null,
    message:!active ? '문제가 바뀌었거나 레이드가 끝났습니다.' : duplicate ? '이미 공격했어요. 다음 문제를 기다리세요.' : !eligible ? '잡은 포켓몬을 선택하고 체력을 확인해주세요.' : counter ? '보스의 반격! HP −' + counter + (fighter.hp === 0 ? ' · 응원받고 회복하거나 포켓몬을 교체하세요.' : ' · 다시 계산해보세요!') : ''};
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
    adventureBase.incoming(data); renderStudentCollection(); return;
  }
  if (data.type === 'RESULT') {
    const duplicate = receivedResults.has(data.requestId);
    adventureBase.incoming(data);
    if (!duplicate) {
      if (data.problemId === studentProblemId && data.fighter?.pokemonId === selectedStudentPokemon) studentFighter = data.fighter;
      if (data.isCorrect && data.problemId === studentProblemId) document.getElementById('studentRaidFeedback').textContent = '✨ ' + (data.move || '공격') + '! 보스에게 ' + data.damage + ' 대미지 · +100 XP';
      else if (data.fighter && data.problemId === studentProblemId) animateBattleSprite('studentPartnerImg','hit');
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
  // Update the host before sending the attack on the same ordered MQTT connection.
  sendStudentPresence();
  adventureBase.answer();
  renderStudentPartner();
};
returnToStudentSoloGame = function () {
  if (rewardedRaids.has(studentRaidSessionId)) studentClosedRaidId = studentRaidSessionId;
  adventureBase.returnSolo(); saveStudentProfile();
};

sendStudentSoloAnswer = function () {
  if (!activeStudentProfile || soloCaptureBusy) return;
  if (!studentSoloInputVal) { alert('계산 정답을 입력해주세요!'); return; }
  const stage = STAGES_DATA.find(s => s.stageId === studentCurrentStageId);
  const index = studentCurrentPokeIdx, poke = stage.pokemons[index];
  const correct = /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(studentSoloInputVal) && Math.abs(Number(studentSoloInputVal)-Number(poke.ansMain)) < 0.001;
  const fb = document.getElementById('studentSoloFeedback'); fb.style.display = 'block';
  if (!correct) {
    sound.playError(); fb.style.background = '#451d29'; fb.style.color = '#fecaca';
    fb.textContent = '다시 계산해보세요! ' + poke.hint.replace(/<[^>]*>/g,' '); return;
  }
  soloCaptureBusy = true;
  const first = !studentCaughtList.includes(poke.id);
  if (first) { studentCaughtList.push(poke.id); myStudentXP += 100; }
  if (!selectedStudentPokemon) selectedStudentPokemon = poke.id;
  sound.playCatchSuccess();
  fb.style.background = '#143c2b'; fb.style.color = '#86efac';
  fb.textContent = first ? '🎉 ' + poke.name + ' 포획! +100 XP · 레이드 파트너로 선택할 수 있어요!' : '✓ 정답! 이미 도감에 있는 포켓몬이에요.';
  const profile = activeStudentProfile;
  // Persist the next problem immediately; a refresh during the animation keeps progress.
  studentCurrentPokeIdx = Math.min(index + 1,stage.pokemons.length - 1);
  saveStudentProfile(); updateStudentHeaderStats();
  sendStudentPresence();
  sendClassroomMessage(mqttStudentClient,'to_host',{type:'POKE_CAUGHT',studentId:myStudentId,name:myStudentName,pokeName:poke.name,stageId:stage.stageId});
  soloCaptureTimer = setTimeout(() => {
    soloCaptureBusy = false;
    if (activeStudentProfile !== profile || studentCurrentStageId !== stage.stageId) return;
    if (index < stage.pokemons.length-1) renderStudentSoloGame();
    else fb.textContent = '👑 이 차시의 모험 완료! 다른 차시에서 새 포켓몬을 만나세요.';
    if (studentTrainingRaidId) { studentTrainingRaidId = ''; sendStudentPresence(); }
  },1400);
};
// Keep audio and the keyboard shortcut working after removing the toolbar buttons.
toggleAudio = function () { sound.sfxMuted = !sound.sfxMuted; };
toggleBGM = function () { sound.init(); sound.setBgmMute(!sound.bgmMuted); };
toggleVoice = function () { voice.enabled = !voice.enabled; };
