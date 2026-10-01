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
const PVP_STUDY_PER_TICKET = 5;
const RAID_CAPTURE_CHANCE = 0.35;
let activeStudentProfile = null;
function studentArtworkUrl(id){return getPokemonArtworkUrl(id,!!activeStudentProfile?.shinyCaught?.includes(id));}
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
let lastStudentSpokenQuiz = '';
let currentRaidQuiz = null;
let raidQuizChoice = -1;
let teacherSoloQuiz = null;
let teacherSoloChoice = -1;
let adventureBattleLog = [];
const raidFighters = new Map();
// Every lesson starts with common encounters, independent of its math difficulty.
for (const stage of STAGES_DATA) {
  for (const poke of [{id:19,name:'꼬렛',type:'노말',typeBg:'#a78bfa',cp:180},{id:16,name:'구구',type:'노말/비행',typeBg:'#a16207',cp:240}]) {
    if (!stage.pokemons.some(p=>p.id===poke.id)) stage.pokemons.push({...poke,question:'차시에 맞는 문제를 풀어 포획하세요.',formula:'',ansMain:''});
  }
  stage.pokemons.sort((a,b)=>a.cp-b.cp);
}
function encounterLevel(poke) {
  if ([1,4,7,25,37,39].includes(poke.id)) return 2;
  if (poke.id===133) return 3;
  return poke.cp<800?1:poke.cp<1500?2:poke.cp<2400?3:poke.cp<2900?4:5;
}
function captureCount(id) { return Math.max(studentCaughtList.includes(id)?1:0,safeXP(activeStudentProfile?.captureCounts?.[id])); }
function duplicateCount(id) { return safeXP(activeStudentProfile?.duplicates?.[id]); }
function recordPokemonCapture(id) {
  activeStudentProfile.captureCounts[id]=captureCount(id)+1;
  if(studentCaughtList.includes(id)) activeStudentProfile.duplicates[id]=duplicateCount(id)+1;
  else studentCaughtList.push(id);
}
function selectStudentEncounter(index) {
  if(soloCaptureBusy) return;
  const stage=STAGES_DATA.find(s=>s.stageId===studentCurrentStageId), poke=stage?.pokemons[index];
  if(!poke || encounterLevel(poke)>trainerLevel(myStudentXP))return;
  studentCurrentPokeIdx=index; currentSoloQuiz=null; renderStudentSoloGame(); saveStudentProfile();
}
const adventureCatalog = new Map(STAGES_DATA.flatMap(stage => stage.pokemons).map(poke => [poke.id, poke]));
for (const boss of RAID_BOSSES) adventureCatalog.set(boss.bossId, {id:boss.bossId,name:boss.name.split(' ')[0],type:boss.type,typeBg:boss.typeBg,cp:3000});
const studentDexEntries = [...new Map(STAGES_DATA.flatMap(stage => stage.pokemons.map(poke => ({...poke,stageId:stage.stageId,stageTitle:stage.title})))
  .concat(RAID_BOSSES.map(boss => ({id:boss.bossId,name:boss.name.split(' ')[0],type:boss.type,stageId:'RAID',stageTitle:'전설 레이드'}))).map(p=>[p.id,p])).values()];
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
function trainerLevel(xp) { return Math.min(50, 1 + Math.floor(safeXP(xp) / 300)); }
function studyDayStamp() { return new Date(Date.now()+9*60*60*1000).toISOString().slice(0,10); }
function refreshDailyStudy(profile=activeStudentProfile) {
  if (!profile) return;
  if (profile.studyDay !== studyDayStamp()) {
    profile.studyDay=studyDayStamp(); profile.studyCorrectToday=0; profile.pvpTickets=0;
  }
  profile.studyCorrectToday=safeXP(profile.studyCorrectToday);
  profile.pvpTickets=Math.min(100,safeXP(profile.pvpTickets));
}
function awardDailyStudyCorrect() {
  if (!activeStudentProfile) return '';
  refreshDailyStudy();
  const before=activeStudentProfile.studyCorrectToday++;
  const earned=Math.floor(activeStudentProfile.studyCorrectToday/PVP_STUDY_PER_TICKET)-Math.floor(before/PVP_STUDY_PER_TICKET);
  if (earned) activeStudentProfile.pvpTickets=Math.min(100,activeStudentProfile.pvpTickets+earned);
  saveStudentProfile();
  if (typeof renderStudentPvpStatus === 'function') renderStudentPvpStatus();
  return earned ? ' 🎟️ 오늘의 공부로 대전권 1장을 얻었어요!' : '';
}
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
  saved.captureCounts = saved.captureCounts && typeof saved.captureCounts === 'object' ? saved.captureCounts : Object.fromEntries(validCaught(saved.caught).map(id=>[id,1]));
  saved.duplicates = saved.duplicates && typeof saved.duplicates === 'object' ? saved.duplicates : {};
  saved.training = saved.training && typeof saved.training === 'object' ? saved.training : {};
  saved.power = saved.power && typeof saved.power === 'object' ? saved.power : {};
  saved.captureSteps = saved.captureSteps && typeof saved.captureSteps === 'object' ? saved.captureSteps : {};
  saved.captureEvidence = saved.captureEvidence && typeof saved.captureEvidence === 'object' ? saved.captureEvidence : {};
  saved.captureHistory = saved.captureHistory && typeof saved.captureHistory === 'object' ? saved.captureHistory : {};
  saved.shinyCaught = Array.isArray(saved.shinyCaught) ? saved.shinyCaught.filter(id=>RAID_BOSSES.some(boss=>boss.bossId===id)) : [];
  saved.raidAnswered = saved.raidAnswered && typeof saved.raidAnswered === 'object' ? saved.raidAnswered : {};
  saved.raidQualified = Array.isArray(saved.raidQualified) ? saved.raidQualified.filter(id=>typeof id==='string').slice(-100) : [];
  saved.pvpSpentMatches = Array.isArray(saved.pvpSpentMatches) ? saved.pvpSpentMatches.filter(id=>typeof id==='string').slice(-100) : [];
  saved.pvpRewardedMatches = Array.isArray(saved.pvpRewardedMatches) ? saved.pvpRewardedMatches.filter(id=>typeof id==='string').slice(-100) : [];
  saved.pvpActiveMatch = typeof saved.pvpActiveMatch==='string' ? saved.pvpActiveMatch : '';
  refreshDailyStudy(saved);
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
  currentSoloQuiz = null; soloQuizChoice = -1; soloQuizQueue = {}; lastSoloQuizId = {}; lastStudentSpokenQuiz='';
  saveStudentProfile();
}
function loseRandomStudentPokemon() {
  if (!activeStudentProfile || !studentCaughtList.length) return '';
  const index=Math.floor(Math.random()*studentCaughtList.length);
  const id=studentCaughtList.splice(index,1)[0];
  const name=adventureCatalog.get(id)?.name || '포켓몬';
  delete activeStudentProfile.power[id];
  delete activeStudentProfile.training[id];
  delete activeStudentProfile.captureSteps[id];
  delete activeStudentProfile.captureEvidence[id];
  delete activeStudentProfile.captureHistory[id];
  if (selectedStudentPokemon===id) { selectedStudentPokemon=studentCaughtList[0]||0; studentFighter=null; }
  saveStudentProfile(); updateStudentHeaderStats(); sendStudentPresence();
  return ' ⚠ '+name+'이(가) 달아났어요!';
}
function resolveStudentRaidCapture(raidId,bossId,roll=Math.random(),shiny=false) {
  if (!activeStudentProfile?.raidQualified?.includes(raidId)) return '정답 공격에 참여하지 않아 이번에는 포획 기회가 없어요.';
  if (!RAID_BOSSES.some(boss=>boss.bossId===bossId)) return '보스 정보를 확인할 수 없어 포획할 수 없었어요.';
  const name=adventureCatalog.get(bossId).name;
  if (studentCaughtList.includes(bossId)) {
    if (roll>=RAID_CAPTURE_CHANCE) return name+'이(가) 몬스터볼에서 빠져나왔어요.';
    if(shiny && !activeStudentProfile.shinyCaught.includes(bossId)) activeStudentProfile.shinyCaught.push(bossId);
    recordPokemonCapture(bossId); saveStudentProfile(); renderStudentCollection();
    return name+' 추가 포획! 누적 '+captureCount(bossId)+'마리 · 강화용 중복 '+duplicateCount(bossId)+'마리';
  }
  if (roll>=RAID_CAPTURE_CHANCE) return name+'이(가) 몬스터볼에서 빠져나왔어요. 다음 레이드에서 다시 도전하세요!';
  recordPokemonCapture(bossId);
  if(shiny && !activeStudentProfile.shinyCaught.includes(bossId))activeStudentProfile.shinyCaught.push(bossId);
  if (!selectedStudentPokemon) selectedStudentPokemon=bossId;
  activeStudentProfile.captureHistory[bossId]=[...(activeStudentProfile.raidAnswered[raidId]||[])];
  saveStudentProfile(); updateStudentHeaderStats(); sendStudentPresence();
  return '🎉 '+(shiny?'✨ 이로치 ':'')+name+' 포획 성공! 이제 레이드 파트너로 출전할 수 있어요.';
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
  if(studentPvpMatch||activeStudentProfile?.pvpActiveMatch){pvpNotice('대전이 끝난 뒤 닉네임을 바꿀 수 있어요.');return;}
  studentMemoStrokes=[];studentMemoCurrent=null;
  document.getElementById('studentMemoOverlay').hidden=true;
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
  voice.unlock();
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
  const guidedKey='guided-'+stageId, reasonKey='reason-'+stageId, turnKey='turn-'+stageId;
  const guided=(soloQuizQueue[turnKey]||0)%2===0;
  const key=guided?guidedKey:reasonKey, bank=guided?GUIDED_QUIZZES[stageId]:PROCESS_QUIZZES[stageId];
  if(!soloQuizQueue[key]?.length)soloQuizQueue[key]=shuffledQuizIndices(bank.length);
  const source=bank[soloQuizQueue[key].shift()];
  soloQuizQueue[turnKey]=(soloQuizQueue[turnKey]||0)+1;
  const quiz=guided?{...source,methodIndex:Math.floor((soloQuizQueue[turnKey]-1)/2)%source.methods.length}:shuffledQuiz(source);
  lastSoloQuizId[stageId]=quiz.id;
  return quiz;
}
function renderReasonOptions(target,quiz,choice,selectFunction,locked=false) {
  if(quiz.kind==='guided'){renderGuidedPractice(target,quiz,locked);return;}
  const el=document.getElementById(target);
  el.innerHTML=quiz.choices.map((label,index)=>'<button type="button" class="reason-option" aria-pressed="'+(choice===index)+'" onclick="'+selectFunction+'('+index+')" '+(locked?'disabled':'')+'><b>'+(index+1)+'.</b> '+escapeClassroomText(label)+'</button>').join('');
}
renderStudentSoloGame = function () {
  const stage=STAGES_DATA.find(s=>s.stageId===studentCurrentStageId);
  if(!stage)return;
  if(!stage.pokemons[studentCurrentPokeIdx] || encounterLevel(stage.pokemons[studentCurrentPokeIdx])>trainerLevel(myStudentXP)) studentCurrentPokeIdx=0;
  adventureBase.soloRender();
  document.getElementById('studentEncounterChoices').innerHTML=stage.pokemons.map((p,index)=>'<button type="button" class="adventure-button" onclick="selectStudentEncounter('+index+')" '+(encounterLevel(p)>trainerLevel(myStudentXP)?'disabled':'')+' aria-pressed="'+(index===studentCurrentPokeIdx)+'">'+escapeClassroomText(p.name)+' · Lv.'+encounterLevel(p)+' · 누적 '+captureCount(p.id)+'마리'+(encounterLevel(p)>trainerLevel(myStudentXP)?' 🔒':'')+'</button>').join('');
  const poke=stage.pokemons[studentCurrentPokeIdx];
  if(!currentSoloQuiz) currentSoloQuiz=nextSoloQuiz(stage.stageId);
  soloQuizChoice=-1; soloCaptureBusy=false;
  document.getElementById('studentSoloFormula').textContent=currentSoloQuiz.kind==='guided'?currentSoloQuiz.formula:'어떤 생각이 맞을까요?';
  document.getElementById('studentSoloQuestion').textContent=currentSoloQuiz.stem;
  document.getElementById('studentTrainingProgress').textContent='🔴 '+poke.name+' 포획: '+(activeStudentProfile?.captureSteps[poke.id]||0)+'/2개 정답 · 누적 '+captureCount(poke.id)+'마리 · 트레이너 Lv.'+trainerLevel(myStudentXP);
  document.getElementById('studentSoloSubmit').textContent=currentSoloQuiz.kind==='guided'?'풀이 과정 확인하기':'선택한 생각 확인하기';
  renderReasonOptions('studentSoloOptions',currentSoloQuiz,-1,'chooseStudentSoloOption');
  document.getElementById('studentExplanationVoice').disabled=true;
  if(studentReady && lastStudentSpokenQuiz!==currentSoloQuiz.id){lastStudentSpokenQuiz=currentSoloQuiz.id;voice.speak(currentSoloQuiz.stem);}
};
async function listenStudentMath(mode='question') {
  await voice.unlock();
  if(isStudentInRaid){voice.speak(document.getElementById('studentRaidQuestion').textContent);return;}
  if(!currentSoloQuiz)return;
  const text=mode==='instruction'?(currentSoloQuiz.kind==='guided'?guidedMethod(currentSoloQuiz).instruction:'정답을 하나 고른 뒤 풀이 이유를 확인하세요.'):mode==='explanation'?(soloCaptureBusy?(currentSoloQuiz.kind==='guided'?guidedMethod(currentSoloQuiz).explanation:currentSoloQuiz.explanation):''):currentSoloQuiz.stem;
  if(text)voice.speak(text);
}
function chooseStudentSoloOption(index) {
  if(soloCaptureBusy || !currentSoloQuiz || currentSoloQuiz.kind==='guided' || index<0 || index>=currentSoloQuiz.choices.length)return;
  soloQuizChoice=index;
  renderReasonOptions('studentSoloOptions',currentSoloQuiz,index,'chooseStudentSoloOption');
}

function pokemonBattleStats(id, xp, power = 0) {
  const pokemon = adventureCatalog.get(id);
  if (!pokemon) return null;
  const type = pokemon.type.split('/')[0], level = trainerLevel(xp);
  const moves = {전기:'10만볼트',불꽃:'화염방사',물:'물대포',풀:'덩굴채찍',얼음:'냉동빔',드래곤:'용의파동',에스퍼:'사이코키네시스',고스트:'섀도볼',격투:'파동탄',벌레:'시저크로스',비행:'에어슬래시',땅:'대지의힘',바위:'스톤에지',독:'독침',강철:'아이언헤드',악:'악의파동',페어리:'문포스',노말:'몸통박치기'};
  power = Math.max(0,Math.min(20,Math.floor(Number(power)||0)));
  const cp=Math.round((pokemon.cp || 500) * (0.55 + level * 0.03) * (1 + power * 0.05));
  return {pokemonId:id,name:pokemon.name,type,move:moves[type] || '몸통박치기',level,power,cp,
    damage:25 + Math.floor((pokemon.cp || 500) / 800) * 5 + (level - 1) * 2 + power * 4,maxHp:60 + level * 4 + power * 6};
}
function effectiveness(type, bossId) {
  if (bossId === 150 && ['고스트','악','벌레'].includes(type)) return 1.5;
  if (bossId === 384 && ['얼음','드래곤','페어리','바위'].includes(type)) return 1.5;
  if (bossId === 249 && ['전기','얼음','바위','고스트','악'].includes(type)) return 1.5;
  if (bossId === 250 && ['바위','물','전기'].includes(type)) return 1.5;
  if (bossId === 483 && ['격투','땅'].includes(type)) return 1.5;
  if (bossId === 484 && ['드래곤','페어리'].includes(type)) return 1.5;
  return 1;
}
function renderStudentCollection() {
  const cards = studentCaughtList.map(id => {
    const power = Math.max(0,Math.floor(Number(activeStudentProfile?.power[id])||0));
    const energy = duplicateCount(id);
    const poke = pokemonBattleStats(id,myStudentXP,power), selected = id === selectedStudentPokemon;
    return '<div class="partner-choice" aria-pressed="' + selected + '"><button type="button" class="partner-select" onclick="selectStudentPartner(' + id + ')">' +
      '<img src="' + studentArtworkUrl(id) + '" alt="' + escapeClassroomText(poke.name) + '" loading="lazy"><strong>' + (activeStudentProfile?.shinyCaught?.includes(id)?'✨ ':'')+escapeClassroomText(poke.name) +
      '</strong><small>CP ' + poke.cp + ' · 강화 +' + power + ' · 누적 '+captureCount(id)+'마리 · ' + escapeClassroomText(poke.type) + '</small><span class="selected-label">' + (selected ? '✓ 출전 파트너' : '출전 선택') + '</span></button>' +
      '<button type="button" class="strengthen-button" onclick="strengthenStudentPokemon(' + id + ')" ' + (energy < 2 || power >= 20 ? 'disabled' : '') + '>⚡ 중복 ' + energy + '마리 / 2마리로 강화</button></div>';
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
  if (stats) { img.src = studentArtworkUrl(stats.pokemonId); img.alt = stats.name; }
  document.getElementById('studentPartnerName').textContent = stats ? (activeStudentProfile?.shinyCaught?.includes(stats.pokemonId)?'✨ 이로치 ':'')+stats.name : '먼저 포켓몬을 잡아주세요';
  document.getElementById('studentPartnerLevel').textContent = stats ? 'Lv.' + stats.level + ' · CP ' + stats.cp + ' · 강화 +' + (stats.power||0) : '';
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
  const energy = duplicateCount(id);
  const power = Math.max(0,Math.floor(Number(activeStudentProfile.power[id])||0));
  if (energy < 2 || power >= 20) return;
  activeStudentProfile.duplicates[id] = energy - 2;
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
  const level='⭐ Lv.'+trainerLevel(myStudentXP)+'/50 · '+myStudentXP+' XP';
  document.getElementById('studentMyXP').textContent=level;
  document.getElementById('studentRaidMyXP').textContent=level;
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
      '<span class="dex-number">No. '+String(p.id).padStart(3,'0')+'</span><img src="'+studentArtworkUrl(p.id)+'" alt="" loading="lazy"><strong>'+(caught?(activeStudentProfile?.shinyCaught?.includes(p.id)?'✨ ':'')+escapeClassroomText(p.name):'???')+'</strong><small>'+(caught?'✓ 포획':'미발견')+'</small></button>';
  }).join('')||'<p class="student-dex-empty">아직 잡은 포켓몬이 없어요. 퀴즈를 풀어 첫 포켓몬을 만나 보세요!</p>';
}
function showStudentDexDetail(id) {
  const p=studentDexEntries.find(p=>p.id===id);
  if(!p)return;
  const caught=studentCaughtList.includes(id), detail=document.getElementById('studentDexDetail');
  if(!caught){ detail.innerHTML='<strong>No. '+String(id).padStart(3,'0')+' · 미발견</strong><span>'+(p.stageId==='RAID'?'전설 레이드에 참여하면 만날 수 있어요.':p.stageId+'차시 '+escapeClassroomText(p.stageTitle)+'에서 만날 수 있어요. 퀴즈를 풀어 포획해 보세요.')+'</span>'; return; }
  const power=Math.max(0,Math.floor(Number(activeStudentProfile?.power[id])||0));
  const energy=duplicateCount(id);
  const stats=pokemonBattleStats(id,myStudentXP,power);
  const history=Array.isArray(activeStudentProfile?.captureHistory[id])?activeStudentProfile.captureHistory[id]:[];
  const questions=history.length ? history.map((item,index)=>'<li><strong>문제 '+(index+1)+':</strong> '+escapeClassroomText(item.stem)+(item.answer?'<br><b>맞힌 답:</b> '+escapeClassroomText(item.answer):'')+'<br><small>'+escapeClassroomText(item.explanation||'')+'</small></li>').join('') : '<li>기록 기능을 추가하기 전에 포획한 포켓몬이라 당시 맞힌 문제는 저장되어 있지 않아요.</li>';
  detail.innerHTML='<img src="'+studentArtworkUrl(id)+'" alt="'+escapeClassroomText(p.name)+'"><div><strong>No. '+String(id).padStart(3,'0')+' · '+(activeStudentProfile?.shinyCaught?.includes(id)?'✨ 이로치 ':'')+escapeClassroomText(p.name)+'</strong><span>'+escapeClassroomText(p.type)+' · '+(p.stageId==='RAID'?'전설 레이드':p.stageId+'차시')+' · Lv.'+stats.level+' · CP '+stats.cp+'</span><span>강화 +'+power+' · 누적 '+captureCount(id)+'마리 · 강화용 중복 '+energy+'마리 / 2 · '+(selectedStudentPokemon===id?'현재 출전 파트너':'보유 중')+'</span><button type="button" class="adventure-button" onclick="selectStudentPartner('+id+');showStudentDexDetail('+id+')">'+(selectedStudentPokemon===id?'✓ 출전 중':'레이드 파트너로 선택')+'</button><section class="student-dex-questions"><b>📘 포획할 때 맞힌 문제</b><ol>'+questions+'</ol></section></div>';
}
window.addEventListener('keydown',event=>{if(event.key==='Escape'&&!document.getElementById('studentDexModal').hidden)closeStudentDex();});
sendStudentPresence = function () {
  refreshDailyStudy();
  sendClassroomMessage(mqttStudentClient,'to_host',{type:'JOIN',studentId:myStudentId,name:myStudentName,
    caught:studentCaughtList,selectedPokemon:selectedStudentPokemon,xp:myStudentXP,power:activeStudentProfile?.power[selectedStudentPokemon]||0,
    shinySelected:!!activeStudentProfile?.shinyCaught?.includes(selectedStudentPokemon),
    studyDay:activeStudentProfile?.studyDay,studyCorrectToday:activeStudentProfile?.studyCorrectToday||0,pvpTickets:activeStudentProfile?.pvpTickets||0});
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
      selectedPokemon:caught.includes(data.selectedPokemon) ? data.selectedPokemon : caught[0] || 0,xp:safeXP(data.xp),power:Math.max(0,Math.min(20,Math.floor(Number(data.power)||0))),
      shinySelected:!!data.shinySelected && caught.includes(data.selectedPokemon) && RAID_BOSSES.some(boss=>boss.bossId===data.selectedPokemon)};
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
  const bossChoice=String(document.getElementById('raidBossChoice').value||'0');
  const bossIndex=Number.parseInt(bossChoice,10);
  gameState.currentRaidBossIndex=Number.isInteger(bossIndex)&&bossIndex>=0&&bossIndex<RAID_BOSSES.length?bossIndex:0;
  raidShiny=bossChoice.endsWith('s');
  gameState.currentRaidPhase = 0;
  beginRaidSession(); loadCurrentRaidBattle(); showBattleView(); renderStagePreviews(); broadcastRaidStart();
  for (const id of connectedStudents.keys()) sendAdventureAck(id);
};
beginRaidSession = function () {
  raidSessionId = globalThis.crypto?.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
  const participants = [...connectedStudents.values()].filter(s => s.caught?.length).length;
  const boss = RAID_BOSSES[gameState.currentRaidBossIndex];
  boss.phases = variedBattleQuizzes().map(quiz => {
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
  document.getElementById('quizDifficultyTag').textContent='🧠 '+stage.concept+(teacherSoloQuiz.kind==='guided'?' · 풀이 실습':' · 생각 퀴즈');
  document.getElementById('quizQuestionText').textContent=teacherSoloQuiz.stem;
  renderTeacherSoloChoices();
  document.getElementById('answerInputsContainer').style.display='none';
  document.querySelector('.touch-keypad').style.display='none';
};
function renderTeacherSoloChoices() {
  if(teacherSoloQuiz.kind==='guided'){renderGuidedPractice('quizFormulaBox',teacherSoloQuiz);document.getElementById('quizFormulaBox').innerHTML+='<button class="teacher-check-choice" onclick="checkTeacherSoloOption()">풀이 과정 확인하기</button>';return;}
  document.getElementById('quizFormulaBox').innerHTML=teacherSoloQuiz.choices.map((choice,index)=>
    '<button type="button" class="teacher-reason-choice" aria-pressed="'+(teacherSoloChoice===index)+'" onclick="chooseTeacherSoloOption('+index+')">'+(index+1)+'. '+escapeClassroomText(choice)+'</button>').join('')+
    '<button type="button" class="teacher-check-choice" onclick="checkTeacherSoloOption()">선택한 생각 확인하기</button>';
}
function chooseTeacherSoloOption(index) { teacherSoloChoice=index; renderTeacherSoloChoices(); }
function checkTeacherSoloOption() {
  const guidedResult=teacherSoloQuiz.kind==='guided'?assessGuidedPractice('quizFormulaBox',teacherSoloQuiz):undefined;
  if(guidedResult===null)return;
  if(teacherSoloQuiz.kind!=='guided' && teacherSoloChoice<0){showNoticeBanner('💡','풀이 방법을 하나 골라주세요.');return;}
  if(guidedResult===false || (teacherSoloQuiz.kind!=='guided' && teacherSoloChoice!==teacherSoloQuiz.correct)){sound.playError();showNoticeBanner('💡',escapeClassroomText(teacherSoloQuiz.explanation));teacherSoloQuiz=nextSoloQuiz(gameState.currentStageIndex);teacherSoloChoice=-1;document.getElementById('quizQuestionText').textContent=teacherSoloQuiz.stem;renderTeacherSoloChoices();return;}
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
  const result = {type:'RESULT',requestId:data.requestId,problemId:data.problemId,isCorrect:correct,isWrongAnswer:!!(active&&!duplicate&&eligible&&!correct),earnedXP:correct ? 100 : 0,
    pokemonId:data.pokemonId,damage,move:fighter?.move,multiplier,fighter:fighter ? {...fighter} : null,
    message:!active ? '문제가 바뀌었거나 레이드가 끝났습니다.' : duplicate ? '이미 공격했어요. 다음 문제를 기다리세요.' : !eligible ? '잡은 포켓몬을 선택하고 체력을 확인해주세요.' : counter ? '보스의 반격! HP −' + counter + (fighter.hp === 0 ? ' · 응원받고 회복하거나 포켓몬을 교체하세요.' : ' · 풀이 이유를 다시 살펴보세요.') : '',
    explanation:active ? phase.explanation : '',correctChoice:active ? phase.correct : -1};
  answerResults.set(cacheKey,result);
  if (answerResults.size > 3000) answerResults.delete(answerResults.keys().next().value);
  if (correct) acceptedAnswers.add(key);
  sendClassroomMessage(mqttHostClient,'to_student/' + data.studentId,result);
  if (correct) {
    const attack = {type:'RAID_ATTACK',raidId:raidSessionId,studentId:data.studentId,name:student.name,pokemonId:fighter.pokemonId,shiny:student.shinySelected,move:fighter.move,damage,multiplier};
    sendClassroomMessage(mqttHostClient,'broadcast',attack);
    showAttackToast('<img src="' + getPokemonArtworkUrl(fighter.pokemonId,student.shinySelected) + '" alt="" style="width:40px;height:40px;vertical-align:middle"> <b>' + escapeClassroomText(student.name) + '</b>의 ' + escapeClassroomText(fighter.name) + ' · ' + fighter.move + '! −' + damage + ' HP','#67e8f9');
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
function playStudentRaidHit(){
  const flash=document.getElementById('studentRaidHitFlash');
  if(!flash)return;
  flash.classList.remove('active');void flash.offsetWidth;flash.classList.add('active');
  setTimeout(()=>flash.classList.remove('active'),550);
}
handleStudentIncomingData = function (data) {
  if (!data) return;
  if (data.type === 'RAID_TEAM_BONUS' && data.raidId === studentRaidSessionId) { addStudentBattleLog('🤝 전원 정답! 협동 보너스 −' + data.damage + ' HP · 다음 단계로!'); return; }
  if (data.type === 'RAID_ATTACK') {
    if (data.raidId !== studentRaidSessionId || !isStudentInRaid) return;
    const name = adventureCatalog.get(data.pokemonId)?.name || '포켓몬';
    addStudentBattleLog(data.name + '의 ' + (data.shiny?'✨ 이로치 ':'') + name + '! ' + data.move + ' −' + data.damage + ' HP' + (data.multiplier > 1 ? ' · 효과가 굉장했다!' : ''));
    animateBattleSprite('studentRaidBossImg','hit');
    playStudentRaidHit();
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
      voice.speak(document.getElementById('studentRaidQuestion').textContent);
    }
    renderStudentCollection(); return;
  }
  if (data.type === 'RESULT') {
    const duplicate = receivedResults.has(data.requestId);
    adventureBase.incoming(data);
    if (!duplicate) {
      if (data.isCorrect && data.problemId===studentProblemId && activeStudentProfile) {
        const evidence=activeStudentProfile.raidAnswered[studentRaidSessionId]||[];
        evidence.push({stem:document.getElementById('studentRaidQuestion').textContent,answer:currentRaidQuiz?.choices?.[Number(data.correctChoice)]||'',explanation:data.explanation||''});
        activeStudentProfile.raidAnswered[studentRaidSessionId]=evidence.slice(-3);
        if(!activeStudentProfile.raidQualified.includes(studentRaidSessionId)) activeStudentProfile.raidQualified.push(studentRaidSessionId);
        activeStudentProfile.raidQualified=activeStudentProfile.raidQualified.slice(-100);
      }
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
      if (data.isWrongAnswer && data.problemId===studentProblemId) {
        document.getElementById('studentRaidFeedback').textContent += loseRandomStudentPokemon();
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
      document.getElementById('studentRaidCaptureResult').textContent=resolveStudentRaidCapture(data.raidId,data.bossId,Math.random(),!!data.shiny);
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
  if (currentSoloQuiz.kind!=='guided' && soloQuizChoice<0) { alert('풀이 생각을 하나 골라주세요!'); return; }
  const stage=STAGES_DATA.find(s=>s.stageId===studentCurrentStageId);
  const poke=stage.pokemons[studentCurrentPokeIdx];
  if(encounterLevel(poke)>trainerLevel(myStudentXP)){currentSoloQuiz=null;renderStudentSoloGame();return;}
  const correct=currentSoloQuiz.kind==='guided'?assessGuidedPractice('studentSoloOptions',currentSoloQuiz):soloQuizChoice===currentSoloQuiz.correct;
  if(correct===null)return;
  const fb=document.getElementById('studentSoloFeedback'); fb.style.display='block';
  fb.style.background=correct?'#143c2b':'#451d29'; fb.style.color=correct?'#86efac':'#fecaca';
  let reward='';
  if(correct){
    sound.playCatchSuccess(); myStudentXP+=30;
    const steps=(Number(activeStudentProfile.captureSteps[poke.id])||0)+1;
    const evidence=Array.isArray(activeStudentProfile.captureEvidence[poke.id])?activeStudentProfile.captureEvidence[poke.id]:[];
    evidence.push({stem:currentSoloQuiz.stem,answer:currentSoloQuiz.completedAnswer||currentSoloQuiz.choices[currentSoloQuiz.correct],explanation:currentSoloQuiz.explanation});
    activeStudentProfile.captureEvidence[poke.id]=evidence.slice(-2);
    if(steps>=2){
      activeStudentProfile.captureSteps[poke.id]=0;
      const first=!studentCaughtList.includes(poke.id);
      recordPokemonCapture(poke.id); myStudentXP+=100;
      activeStudentProfile.captureHistory[poke.id]=[...activeStudentProfile.captureEvidence[poke.id]];
      activeStudentProfile.captureEvidence[poke.id]=[];
      if(!selectedStudentPokemon) selectedStudentPokemon=poke.id;
      voice.speak('신난다! '+poke.name+'을 잡았다!');
      reward=' 🎉 '+poke.name+' 포획! +100 XP · 누적 '+captureCount(poke.id)+'마리 · 강화용 중복 '+duplicateCount(poke.id)+'마리';
      const next=studentCurrentPokeIdx+1;
      if(first && stage.pokemons[next] && encounterLevel(stage.pokemons[next])<=trainerLevel(myStudentXP)) studentCurrentPokeIdx=next;
      if(first)sendClassroomMessage(mqttStudentClient,'to_host',{type:'POKE_CAUGHT',studentId:myStudentId,name:myStudentName,pokeName:poke.name,stageId:stage.stageId});
    }else activeStudentProfile.captureSteps[poke.id]=steps;
    reward+=awardDailyStudyCorrect();
    saveStudentProfile(); updateStudentHeaderStats(); sendStudentPresence();
  }else { sound.playError(); voice.speak('계산이 맞지 않습니다. 다시 풀어보세요!'); }
  fb.textContent=(correct?'✓ 이해했어요! +30 XP.':'다시 생각해 봐요.')+' '+currentSoloQuiz.explanation+reward;
  soloCaptureBusy=true;
  document.getElementById('studentExplanationVoice').disabled=false;
  renderReasonOptions('studentSoloOptions',currentSoloQuiz,soloQuizChoice,'chooseStudentSoloOption',true);
  if(currentSoloQuiz.kind!=='guided') [...(document.getElementById('studentSoloOptions').children||[])].forEach((button,index)=>button.classList.add(index===currentSoloQuiz.correct?'correct':index===soloQuizChoice?'incorrect':''));
  document.getElementById('studentSoloSubmit').textContent='다음 생각 문제 →';
  document.getElementById('studentTrainingProgress').textContent='정답 2개마다 포획 · 같은 포켓몬 중복 2마리로 강화 · 오답 뒤에도 새 문제에 도전하세요';
};
// Keep audio and the keyboard shortcut working after removing the toolbar buttons.
toggleAudio = function () { sound.sfxMuted = !sound.sfxMuted; };
toggleBGM = function () { sound.init(); sound.setBgmMute(!sound.bgmMuted); };
toggleVoice = function () { voice.enabled = !voice.enabled; };
// Intercept student shortcuts before the legacy numeric keypad handler.
window.addEventListener('keydown',event=>{
  if(event.target?.classList?.contains('practice-input')){if(event.key==='Enter'){event.preventDefault();event.stopImmediatePropagation();if(new URLSearchParams(location.search).get('role')==='student')sendStudentSoloAnswer();else checkTeacherSoloOption();}return;}
  if(new URLSearchParams(location.search).get('role')!=='student' || !studentReady || event.target?.closest?.('input, textarea, [contenteditable=true]'))return;
  if(!document.getElementById('studentMemoOverlay').hidden){if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();closeStudentMemo();}return;}
  if(event.key.toLowerCase()==='n'){event.preventDefault();event.stopImmediatePropagation();openStudentMemo();return;}
  if(/^[1-4]$/.test(event.key)){
    event.preventDefault();event.stopImmediatePropagation();
    if(studentPvpMatch)chooseStudentPvpOption(Number(event.key)-1);else if(isStudentInRaid)chooseStudentRaidOption(Number(event.key)-1);else chooseStudentSoloOption(Number(event.key)-1);
  }else if(event.key==='Enter'){
    event.preventDefault();event.stopImmediatePropagation();
    if(studentPvpMatch)submitStudentPvpAnswer();else if(isStudentInRaid)sendStudentRaidAnswer();else sendStudentSoloAnswer();
  }
},true);

// The teacher's existing MQTT room arbitrates friend battles.
const pvpInvites = new Map();
const pvpMatches = new Map();
const pvpBusy = new Map();
const pvpRecentEnds = new Map();
let pvpRoster = [];
let studentPvpMatch = null;
let studentPvpInvite = null;
let studentPvpChoice = -1;
let studentPvpRound = null;
let studentPvpSettledRounds = new Set();
let studentPvpRetryTimer = null;
let studentPvpCountdownTimer = null;
let studentPvpPendingAnswer = null;
function pvpSend(studentId, payload) { sendClassroomMessage(mqttHostClient,'to_student/'+studentId,payload); }
function pvpValidStudent(id) {
  const s=connectedStudents.get(id);
  return s && Date.now()-s.lastSeen<20000 && s.studyDay===studyDayStamp() && s.pvpTickets>0 && s.caught?.includes(s.selectedPokemon) && !pvpBusy.has(id);
}
let lastPvpRosterSignature='';
function pvpBroadcastRoster(joiningId='') {
  const roster=[...connectedStudents.entries()].filter(([,s])=>Date.now()-s.lastSeen<20000).map(([id,s])=>({id,name:s.name,eligible:!!pvpValidStudent(id)}));
  const packet={type:'PVP_ROSTER',roster}, signature=JSON.stringify(roster);
  if(joiningId)pvpSend(joiningId,packet);
  if(signature!==lastPvpRosterSignature){lastPvpRosterSignature=signature;sendClassroomMessage(mqttHostClient,'broadcast',packet);}
}
function pvpCloseInvite(inviteId, reason) {
  const invite=pvpInvites.get(inviteId); if(!invite)return;
  pvpInvites.delete(inviteId);
  pvpSend(invite.from,{type:'PVP_NOTICE',message:reason});
  pvpSend(invite.to,{type:'PVP_NOTICE',message:reason});
}
function pvpRoundPacket(match) {
  const quiz=match.quizzes[match.round];
  match.deadline=Date.now()+60000;
  for(const id of match.ids) pvpSendRound(match,id);
  match.timer=setTimeout(()=>pvpResolveRound(match),60000);
}
function pvpSendRound(match,id){
  const quiz=match.quizzes[match.round],seat=match.ids.indexOf(id);
  pvpSend(id,{type:'PVP_ROUND',matchId:match.id,round:match.round+1,total:match.quizzes.length,stem:quiz.stem,choices:quiz.choices,
    hp:match.hp,players:match.players,answered:match.answers[seat]!==null,remainingMs:Math.max(0,match.deadline-Date.now())});
}
function pvpFinish(match, reason='', refund=false) {
  if(!pvpMatches.has(match.id))return;
  clearTimeout(match.timer); pvpMatches.delete(match.id);
  for(const id of match.ids) pvpBusy.delete(id);
  const winner=match.hp[0]===match.hp[1] ? -1 : match.hp[0]>match.hp[1]?0:1;
  for(let i=0;i<2;i++) {
    if(refund && connectedStudents.has(match.ids[i])) connectedStudents.get(match.ids[i]).pvpTickets++;
    const packet={type:'PVP_END',matchId:match.id,winner,seat:i,players:match.players,refund,reason,
      xp:refund?0:winner===i?120:winner<0?60:40,hp:match.hp};
    pvpRecentEnds.set(match.ids[i],{packet,time:Date.now()});pvpSend(match.ids[i],packet);
  }
  pvpBroadcastRoster();
}
function pvpResolveRound(match) {
  if(!pvpMatches.has(match.id))return;
  clearTimeout(match.timer);
  const quiz=match.quizzes[match.round], hit=match.answers.map(answer=>answer===quiz.correct), damage=hit.map(correct=>correct?35:0);
  match.hp[0]=Math.max(0,match.hp[0]-damage[1]);match.hp[1]=Math.max(0,match.hp[1]-damage[0]);
  for(let i=0;i<2;i++) pvpSend(match.ids[i],{type:'PVP_RESULT',matchId:match.id,round:match.round+1,correct:hit[i],
    answered:match.answers[i]!==null,correctChoice:quiz.correct,correctAnswer:quiz.choices[quiz.correct],explanation:quiz.explanation,ownDamage:damage[i],opponentDamage:damage[1-i],hp:match.hp});
  if(match.hp.some(h=>h===0)||match.round===match.quizzes.length-1){pvpFinish(match);return;}
  match.round++;match.answers=[null,null];pvpRoundPacket(match);
}
function pvpHostMessage(data) {
  const sender=connectedStudents.get(data.studentId);
  if(!sender || Date.now()-sender.lastSeen>20000)return;
  if(data.type==='PVP_REQUEST') {
    const target=data.targetId;
    if(gameState.isRaidMode || target===data.studentId || !pvpValidStudent(data.studentId) || !pvpValidStudent(target)) {
      pvpSend(data.studentId,{type:'PVP_NOTICE',message:'두 학생 모두 오늘 공부로 대전권을 얻고 포켓몬을 선택해야 해요.'});return;
    }
    if([...pvpInvites.values()].some(x=>x.from===data.studentId||x.to===data.studentId||x.from===target||x.to===target)) {
      pvpSend(data.studentId,{type:'PVP_NOTICE',message:'이미 대전 신청을 기다리는 친구가 있어요.'});return;
    }
    const id=crypto.randomUUID(),invite={id,from:data.studentId,to:target};pvpInvites.set(id,invite);
    pvpSend(target,{type:'PVP_INVITE',inviteId:id,fromId:data.studentId,fromName:sender.name});
    pvpSend(data.studentId,{type:'PVP_NOTICE',message:connectedStudents.get(target).name+'에게 대전을 신청했어요.'});
    setTimeout(()=>pvpCloseInvite(id,'대전 신청 시간이 지나 취소됐어요.'),45000);
    return;
  }
  if(data.type==='PVP_REPLY') {
    const invite=pvpInvites.get(data.inviteId);
    if(!invite||invite.to!==data.studentId)return;
    pvpInvites.delete(invite.id);
    if(!data.accept){pvpSend(invite.from,{type:'PVP_NOTICE',message:sender.name+'이(가) 대전을 거절했어요.'});return;}
    if(gameState.isRaidMode||!pvpValidStudent(invite.from)||!pvpValidStudent(invite.to)){
      pvpSend(invite.from,{type:'PVP_NOTICE',message:'대전 조건이 바뀌어 시작하지 못했어요.'});
      pvpSend(invite.to,{type:'PVP_NOTICE',message:'대전 조건이 바뀌어 시작하지 못했어요.'});return;
    }
    const ids=[invite.from,invite.to], students=ids.map(id=>connectedStudents.get(id));
    const stats=students.map(s=>pokemonBattleStats(s.selectedPokemon,s.xp,s.power));
    const match={id:crypto.randomUUID(),ids,players:students.map((s,i)=>({name:s.name,pokemonId:s.selectedPokemon,cp:stats[i].cp,shiny:s.shinySelected})),
      stats,hp:[100,100],round:0,answers:[null,null],quizzes:variedBattleQuizzes()};
    ids.forEach(id=>pvpRecentEnds.delete(id));
    pvpMatches.set(match.id,match);
    ids.forEach((id,i)=>{pvpBusy.set(id,match.id);students[i].pvpTickets--;pvpSend(id,{type:'PVP_START',matchId:match.id,players:match.players,seat:i,hp:match.hp});});
    pvpBroadcastRoster();pvpRoundPacket(match);return;
  }
  if(data.type==='PVP_ANSWER') {
    const match=pvpMatches.get(data.matchId),seat=match?.ids.indexOf(data.studentId);
    if(!match||seat<0||data.round!==match.round+1||!Number.isInteger(data.choice)||data.choice<0||data.choice>3)return;
    if(match.answers[seat]!==null){pvpSend(data.studentId,{type:'PVP_ANSWER_ACK',matchId:match.id,round:data.round});return;}
    match.answers[seat]=data.choice;
    pvpSend(data.studentId,{type:'PVP_ANSWER_ACK',matchId:match.id,round:data.round});
    if(match.answers.every(answer=>answer!==null))pvpResolveRound(match);
  }
}
const adventureHostPvp=handleHostIncomingMessage;
handleHostIncomingMessage=function(data){
  if(!data)return;
  if(data.type==='JOIN'){
    adventureHostPvp(data);
    const student=connectedStudents.get(data.studentId);
    if(student){
      student.studyDay=data.studyDay===studyDayStamp()?data.studyDay:'';
      if(!pvpBusy.has(data.studentId))student.pvpTickets=student.studyDay?safeXP(data.pvpTickets):0;
      pvpBroadcastRoster(data.studentId);
      const match=pvpMatches.get(pvpBusy.get(data.studentId));
      if(match){
        pvpSend(data.studentId,{type:'PVP_START',matchId:match.id,players:match.players,seat:match.ids.indexOf(data.studentId),hp:match.hp,resumed:true});
        pvpSendRound(match,data.studentId);
      }else{
        const recent=pvpRecentEnds.get(data.studentId);
        if(recent&&Date.now()-recent.time<120000)pvpSend(data.studentId,recent.packet);
        else pvpSend(data.studentId,{type:'PVP_SYNC',matchId:null});
      }
    }
    return;
  }
  if(data.type?.startsWith('PVP_')){pvpHostMessage(data);return;}
  adventureHostPvp(data);
};
function renderStudentPvpStatus(){
  if(!activeStudentProfile)return;
  refreshDailyStudy();
  document.getElementById('studentPvpProgress').textContent='오늘 생각 퀴즈 '+activeStudentProfile.studyCorrectToday+'개 정답 · 대전권 '+activeStudentProfile.pvpTickets+'장 (정답 5개마다 1장)';
  const select=document.getElementById('studentPvpTarget'),current=select.value;
  select.innerHTML='<option value="">친구 선택</option>'+pvpRoster.filter(p=>p.id!==myStudentId).map(p=>'<option value="'+escapeClassroomText(p.id)+'"'+(p.id===current?' selected':'')+(p.eligible?'':' disabled')+'>'+escapeClassroomText(p.name)+(p.eligible?' · 대전 가능':' · 준비 중')+'</option>').join('');
}
function pvpNotice(message){document.getElementById('studentPvpNotice').textContent=message;document.getElementById('studentPvpLog').textContent=message;}
function pvpClearPending(){clearInterval(studentPvpRetryTimer);studentPvpRetryTimer=null;studentPvpPendingAnswer=null;}
function pvpStopClock(){clearInterval(studentPvpCountdownTimer);studentPvpCountdownTimer=null;}
function pvpStartClock(remainingMs){
  pvpStopClock();
  const end=Date.now()+remainingMs,display=document.getElementById('studentPvpTimer');
  const render=()=>{display.textContent='⏱️ 남은 시간 '+Math.max(0,Math.ceil((end-Date.now())/1000))+'초';};
  render();studentPvpCountdownTimer=setInterval(render,1000);
}
function pvpRenderScore(players,hp,seat){
  document.getElementById('studentPvpScore').innerHTML=players.map((player,index)=>
    '<div class="pvp-fighter"><img src="'+getPokemonArtworkUrl(player.pokemonId,player.shiny)+'" alt=""><div><strong>'+
    escapeClassroomText(player.name)+' · '+(player.shiny?'✨ 이로치 ':'')+escapeClassroomText(adventureCatalog.get(player.pokemonId)?.name||'포켓몬')+'</strong><small>HP '+hp[index]+' / 100</small><div class="pvp-hp-track"><span style="width:'+hp[index]+'%"></span></div></div></div>'
  ).join('<span class="pvp-versus">VS</span>');
}
function pvpMarkTicketSpent(matchId){
  if(!activeStudentProfile||activeStudentProfile.pvpSpentMatches.includes(matchId))return;
  activeStudentProfile.pvpSpentMatches.push(matchId);activeStudentProfile.pvpSpentMatches=activeStudentProfile.pvpSpentMatches.slice(-100);
  activeStudentProfile.pvpTickets=Math.max(0,activeStudentProfile.pvpTickets-1);saveStudentProfile();sendStudentPresence();renderStudentPvpStatus();
}
function requestStudentPvp(){
  refreshDailyStudy();
  if(!studentReady||isStudentInRaid||studentPvpMatch){pvpNotice('지금은 대전을 신청할 수 없어요.');return;}
  if(!activeStudentProfile.pvpTickets||!studentCaughtList.includes(selectedStudentPokemon)){pvpNotice('오늘 생각 퀴즈 5개를 맞히고 포켓몬을 선택해 주세요.');return;}
  const targetId=document.getElementById('studentPvpTarget').value;
  if(!targetId){pvpNotice('접속한 친구를 선택해 주세요.');return;}
  sendStudentPresence();sendClassroomMessage(mqttStudentClient,'to_host',{type:'PVP_REQUEST',studentId:myStudentId,targetId});
}
function replyStudentPvp(accept){
  if(!studentPvpInvite)return;
  const inviteId=studentPvpInvite;studentPvpInvite=null;document.getElementById('studentPvpInvite').hidden=true;
  sendStudentPresence();sendClassroomMessage(mqttStudentClient,'to_host',{type:'PVP_REPLY',studentId:myStudentId,inviteId,accept});
}
function chooseStudentPvpOption(index){
  if(!studentPvpRound||studentPvpRound.sent)return;
  studentPvpChoice=index;renderReasonOptions('studentPvpOptions',studentPvpRound,index,'chooseStudentPvpOption');
}
function submitStudentPvpAnswer(){
  if(!studentPvpMatch||!studentPvpRound||studentPvpRound.sent)return;
  if(studentPvpChoice<0){pvpNotice('풀이 생각을 하나 골라주세요.');return;}
  studentPvpRound.sent=true;document.getElementById('studentPvpSubmit').disabled=true;
  pvpNotice('친구의 답을 기다리는 중이에요.');
  studentPvpPendingAnswer={type:'PVP_ANSWER',studentId:myStudentId,matchId:studentPvpMatch.id,round:studentPvpRound.round,choice:studentPvpChoice};
  sendClassroomMessage(mqttStudentClient,'to_host',studentPvpPendingAnswer);
  clearInterval(studentPvpRetryTimer);
  studentPvpRetryTimer=setInterval(()=>{if(studentReady&&studentPvpPendingAnswer)sendClassroomMessage(mqttStudentClient,'to_host',studentPvpPendingAnswer);},3000);
}
function returnFromStudentPvp(){
  if(studentPvpMatch)return;
  document.getElementById('studentPvpBox').style.display='none';document.getElementById('studentSoloBox').style.display='flex';
  document.getElementById('studentPvpReturn').hidden=true;renderStudentPvpStatus();
}
function studentPvpIncoming(data){
  if(data.type==='PVP_ROSTER'){pvpRoster=Array.isArray(data.roster)?data.roster:[];renderStudentPvpStatus();return;}
  if(data.type==='PVP_SYNC'){
    const oldId=studentPvpMatch?.id||activeStudentProfile?.pvpActiveMatch;
    if(oldId&&!data.matchId){
      pvpClearPending();pvpStopClock();studentPvpMatch=null;studentPvpRound=null;activeStudentProfile.pvpActiveMatch='';
      if(!activeStudentProfile.pvpRewardedMatches.includes(oldId)){
        activeStudentProfile.pvpRewardedMatches.push(oldId);activeStudentProfile.pvpTickets++;
        saveStudentProfile();sendStudentPresence();
      }
      document.getElementById('studentPvpReturn').hidden=false;pvpNotice('교사 화면이 다시 연결되어 대전이 종료됐어요. 대전권을 돌려드렸어요.');
    }
    return;
  }
  if(data.type==='PVP_NOTICE'){pvpNotice(data.message);studentPvpInvite=null;document.getElementById('studentPvpInvite').hidden=true;return;}
  if(data.type==='PVP_INVITE'){
    studentPvpInvite=data.inviteId;
    const box=document.getElementById('studentPvpInvite');box.hidden=false;
    box.innerHTML='<strong>'+escapeClassroomText(data.fromName)+'의 대전 신청</strong><button type="button" onclick="replyStudentPvp(true)">수락</button><button type="button" onclick="replyStudentPvp(false)">거절</button>';
    return;
  }
  if(data.type==='PVP_START'){
    if(activeStudentProfile?.pvpRewardedMatches.includes(data.matchId))return;
    if(studentPvpMatch?.id===data.matchId)return;
    studentPvpMatch={id:data.matchId,seat:data.seat,players:data.players};studentPvpSettledRounds.clear();studentPvpInvite=null;
    document.getElementById('studentPvpInvite').hidden=true;
    refreshDailyStudy();pvpMarkTicketSpent(data.matchId);activeStudentProfile.pvpActiveMatch=data.matchId;saveStudentProfile();
    document.getElementById('studentSoloBox').style.display='none';document.getElementById('studentPvpBox').style.display='flex';
    document.getElementById('studentPvpReturn').hidden=true;pvpNotice('대전 시작! 세 문제를 풀어요. 두 선수 모두 HP 100, 정답 공격은 35 대미지입니다.');return;
  }
  if(data.type==='PVP_ROUND'){
    if(!studentPvpMatch||studentPvpMatch.id!==data.matchId)return;
    if(studentPvpSettledRounds.has(data.round)||studentPvpRound&&data.round<studentPvpRound.round)return;
    if(studentPvpRound?.round===data.round){
      if(data.answered){studentPvpRound.sent=true;pvpClearPending();document.getElementById('studentPvpSubmit').disabled=true;}
      pvpStartClock(data.remainingMs);return;
    }
    pvpClearPending();studentPvpRound={round:data.round,stem:data.stem,choices:data.choices,sent:!!data.answered};studentPvpChoice=-1;
    const seat=studentPvpMatch.seat;
    pvpRenderScore(data.players,data.hp,seat);pvpStartClock(data.remainingMs);
    document.getElementById('studentPvpQuestion').textContent='문제 '+data.round+'/'+data.total+' · '+data.stem;
    renderReasonOptions('studentPvpOptions',studentPvpRound,-1,'chooseStudentPvpOption');
    document.getElementById('studentPvpSubmit').disabled=!!data.answered;return;
  }
  if(data.type==='PVP_ANSWER_ACK'){
    if(studentPvpMatch?.id===data.matchId&&studentPvpRound?.round===data.round)pvpClearPending();
    return;
  }
  if(data.type==='PVP_RESULT'){
    if(!studentPvpMatch||studentPvpMatch.id!==data.matchId||studentPvpSettledRounds.has(data.round))return;
    studentPvpSettledRounds.add(data.round);pvpClearPending();pvpStopClock();
    const seat=studentPvpMatch.seat;
    pvpRenderScore(studentPvpMatch.players,data.hp,seat);
    document.getElementById('studentPvpTimer').textContent='이번 문제 종료';
    pvpNotice((data.correct?'정답! 상대에게 '+data.ownDamage+' 대미지.':data.answered?'아쉬워요. 정답은 '+data.correctAnswer+'입니다.':'시간 안에 답하지 못했어요.')+' '+data.explanation);
    return;
  }
  if(data.type==='PVP_END'){
    if(!activeStudentProfile||activeStudentProfile.pvpRewardedMatches.includes(data.matchId))return;
    pvpMarkTicketSpent(data.matchId);
    activeStudentProfile.pvpRewardedMatches.push(data.matchId);activeStudentProfile.pvpRewardedMatches=activeStudentProfile.pvpRewardedMatches.slice(-100);
    if(activeStudentProfile.pvpActiveMatch===data.matchId)activeStudentProfile.pvpActiveMatch='';
    if(data.refund){activeStudentProfile.pvpTickets++;pvpNotice('레이드가 시작되어 대전이 중단됐어요. 대전권을 돌려드렸어요.');}
    else{myStudentXP+=data.xp;pvpNotice((data.winner<0?'무승부':data.winner===data.seat?'승리!':'패배!')+' +'+data.xp+' XP. '+(data.reason||''));}
    saveStudentProfile();sendStudentPresence();updateStudentHeaderStats();renderStudentPvpStatus();
    if(studentPvpMatch?.id===data.matchId){
      studentPvpMatch=null;studentPvpRound=null;pvpClearPending();pvpStopClock();
      document.getElementById('studentPvpTimer').textContent='대전 종료';
      document.getElementById('studentPvpSubmit').disabled=true;document.getElementById('studentPvpReturn').hidden=false;
    }
    return;
  }
}
const adventureStudentPvp=handleStudentIncomingData;
handleStudentIncomingData=function(data){
  if(!data)return;
  if(data.type?.startsWith('PVP_')){studentPvpIncoming(data);return;}
  adventureStudentPvp(data);
  if(data.type==='RAID_START'&&isStudentInRaid)document.getElementById('studentPvpBox').style.display='none';
  if(data.type==='JOIN_ACK')renderStudentPvpStatus();
};
const adventureStartRaidPvp=startRaidBattle;
startRaidBattle=function(){
  for(const invite of [...pvpInvites.keys()])pvpCloseInvite(invite,'레이드가 시작되어 대전 신청이 취소됐어요.');
  for(const match of [...pvpMatches.values()])pvpFinish(match,'',true);
  adventureStartRaidPvp();
};

// A separate student canvas keeps handwritten work on the student's device.
let studentMemoStrokes=[];
let studentMemoCurrent=null;
let studentMemoTool='pen';
let studentMemoInitialized=false;
function studentMemoResize(){
  const canvas=document.getElementById('studentMemoCanvas');
  const rect=canvas.getBoundingClientRect();
  if(!rect.width||!rect.height)return;
  const scale=Math.min(window.devicePixelRatio||1,2);
  canvas.width=Math.round(rect.width*scale);canvas.height=Math.round(rect.height*scale);
  const ctx=canvas.getContext('2d');ctx.setTransform(scale,0,0,scale,0,0);
  studentMemoDraw();
}
function studentMemoDraw(){
  const canvas=document.getElementById('studentMemoCanvas'),ctx=canvas.getContext('2d');
  const rect=canvas.getBoundingClientRect();
  if(!rect.width||!rect.height)return;
  ctx.clearRect(0,0,rect.width,rect.height);
  for(const stroke of studentMemoStrokes.concat(studentMemoCurrent?[studentMemoCurrent]:[])){
    if(!stroke.points.length)continue;
    ctx.globalCompositeOperation=stroke.tool==='eraser'?'destination-out':'source-over';
    ctx.strokeStyle=stroke.tool==='eraser'?'#000':'#facc15';
    ctx.fillStyle=ctx.strokeStyle;ctx.lineWidth=stroke.tool==='eraser'?25:4;
    ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();
    const first=stroke.points[0];ctx.moveTo(first.x*rect.width,first.y*rect.height);
    for(const point of stroke.points.slice(1))ctx.lineTo(point.x*rect.width,point.y*rect.height);
    if(stroke.points.length===1){ctx.beginPath();ctx.arc(first.x*rect.width,first.y*rect.height,ctx.lineWidth/2,0,Math.PI*2);ctx.fill();}
    else ctx.stroke();
  }
  ctx.globalCompositeOperation='source-over';
}
function studentMemoPoint(event){
  const rect=event.currentTarget.getBoundingClientRect();
  return {x:Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)),y:Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height))};
}
function initStudentMemo(){
  if(studentMemoInitialized)return;
  studentMemoInitialized=true;
  const canvas=document.getElementById('studentMemoCanvas');
  canvas.addEventListener('pointerdown',event=>{event.preventDefault();canvas.setPointerCapture(event.pointerId);studentMemoCurrent={tool:studentMemoTool,points:[studentMemoPoint(event)]};studentMemoDraw();});
  canvas.addEventListener('pointermove',event=>{if(!studentMemoCurrent)return;event.preventDefault();studentMemoCurrent.points.push(studentMemoPoint(event));studentMemoDraw();});
  const finish=()=>{if(studentMemoCurrent){studentMemoStrokes.push(studentMemoCurrent);studentMemoCurrent=null;}};
  canvas.addEventListener('pointerup',finish);canvas.addEventListener('pointercancel',finish);
  window.addEventListener('resize',()=>{if(!document.getElementById('studentMemoOverlay').hidden)studentMemoResize();});
}
function openStudentMemo(){
  const prompt=studentPvpMatch&&studentPvpRound?.stem ? studentPvpRound.stem : isStudentInRaid ? document.getElementById('studentRaidQuestion').textContent : currentSoloQuiz?.stem;
  document.getElementById('studentMemoProblem').textContent=prompt||'모눈에 세로셈과 소수점 위치를 적어 보세요.';
  document.getElementById('studentMemoOverlay').hidden=false;
  initStudentMemo();requestAnimationFrame(studentMemoResize);
}
function closeStudentMemo(){document.getElementById('studentMemoOverlay').hidden=true;}
function setStudentMemoTool(tool){
  studentMemoTool=tool==='eraser'?'eraser':'pen';
  document.getElementById('studentMemoPen').setAttribute('aria-pressed',String(studentMemoTool==='pen'));
  document.getElementById('studentMemoEraser').setAttribute('aria-pressed',String(studentMemoTool==='eraser'));
}
function undoStudentMemo(){studentMemoStrokes.pop();studentMemoDraw();}
function clearStudentMemo(){studentMemoStrokes=[];studentMemoCurrent=null;studentMemoDraw();}

window.addEventListener('pointerdown',()=>{
  if(new URLSearchParams(location.search).get('role')==='student')sound.init();
},{passive:true});
