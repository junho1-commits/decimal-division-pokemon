// Run locally with TYPECAST_API_KEY in the process or Windows user environment.
// The key is never written to the site, audio files, or console output.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const start = html.indexOf('const STAGES_DATA =');
const end = html.indexOf('class SoundEngine {', start);
if (start < 0 || end < 0) throw new Error('Game voice data could not be located.');
const {STAGES_DATA, RAID_BOSSES, EVOLUTION_CHAINS} = vm.runInNewContext(
  html.slice(start, end) + '\n({STAGES_DATA, RAID_BOSSES, EVOLUTION_CHAINS})'
);

const lines = new Set([
  '가라, 몬스터볼!', '슈퍼볼 투척!', '하이퍼볼 투척!',
  '계산이 맞지 않습니다. 다시 풀어보세요!',
  '앗! 볼에서 빠져나왔다!',
  '작전 시간이 종료되었습니다. 정답 학생 수를 집계하여 합동 에너지를 발사하세요!'
]);
for (const stage of STAGES_DATA) for (const poke of stage.pokemons) {
  lines.add(`야생의 ${poke.name}가 나타났다!`);
  lines.add(`신난다! ${poke.name}을 잡았다!`);
}
for (const boss of RAID_BOSSES) {
  lines.add(`전설의 보스, ${boss.name}와의 레이드 배틀이 시작되었다!`);
  lines.add(`축하합니다! 우리 반 학급 전원의 힘으로 전설의 보스 ${boss.name}를 완벽히 토벌했습니다!`);
}
for (const chain of Object.values(EVOLUTION_CHAINS)) {
  const pairs = [[chain.fromName, chain.nextName]];
  if (chain.finalName) pairs.push([chain.nextName, chain.finalName]);
  for (const [from, to] of pairs) {
    lines.add(`어라...? ${from}의 모습이...!`);
    lines.add(`축하합니다! ${from}가 ${to}로 진화했습니다!`);
  }
}

const manifest = Object.fromEntries([...lines].map(text => [text, crypto.createHash('sha256').update(text).digest('hex').slice(0,16)+'.wav']));
const totalChars = [...lines].reduce((sum, text) => sum + text.length, 0);
if (process.argv.includes('--dry-run')) {
  console.log(`${lines.size} voice lines; ${totalChars} characters. No API request made.`);
  process.exit(0);
}

const apiKey = process.env.TYPECAST_API_KEY || (process.platform === 'win32' ?
  require('node:child_process').execFileSync('powershell', ['-NoProfile','-Command',"[Environment]::GetEnvironmentVariable('TYPECAST_API_KEY','User')"], {encoding:'utf8'}).trim() : '');
if (!apiKey) throw new Error('TYPECAST_API_KEY is not set in the process or Windows user environment.');
const base = 'https://api.typecast.ai';
const auth = {'X-API-KEY':apiKey};
async function chooseVoice() {
  if (process.env.TYPECAST_VOICE_ID) return {id:process.env.TYPECAST_VOICE_ID,name:'선택한 보이스'};
  const url = base + '/v1/voices/recommendations?query=' + encodeURIComponent('초등학교 수학 게임에서 밝고 친근하게 한국어로 안내하는 목소리');
  const response = await fetch(url, {headers:auth});
  if (!response.ok) throw new Error('Typecast voice recommendation failed (HTTP '+response.status+'). Set TYPECAST_VOICE_ID if needed.');
  const payload = await response.json();
  function findVoice(value) {
    if (!value || typeof value !== 'object') return null;
    if (typeof value.voice_id === 'string') return {id:value.voice_id,name:value.name || value.voice_name || value.display_name || '타입캐스트 보이스'};
    for (const child of Object.values(value)) {
      if (Array.isArray(child)) for (const item of child) { const found=findVoice(item); if (found) return found; }
      else { const found=findVoice(child); if (found) return found; }
    }
    return null;
  }
  const voice=findVoice(payload);
  if (!voice) throw new Error('Typecast recommendation returned no voice_id. Set TYPECAST_VOICE_ID.');
  return voice;
}

async function main() {
  const voice = await chooseVoice();
  const dir = path.join(root, 'assets', 'voice');
  fs.mkdirSync(dir, {recursive:true});
  let completed=0;
  for (const [text, file] of Object.entries(manifest)) {
    const target=path.join(dir,file);
    if (!fs.existsSync(target)) {
      const response=await fetch(base+'/v1/text-to-speech', {
        method:'POST', headers:{...auth,'Content-Type':'application/json'},
        body:JSON.stringify({voice_id:voice.id,text,model:'ssfm-v30',prompt:{emotion_type:'smart'},output:{audio_format:'wav'}})
      });
      if (!response.ok) throw new Error('Typecast synthesis failed (HTTP '+response.status+') at line '+(completed+1)+'.');
      const audio=Buffer.from(await response.arrayBuffer());
      if (audio.toString('ascii',0,4)!=='RIFF' || audio.length<1000) throw new Error('Typecast returned an unexpected audio format at line '+(completed+1)+'.');
      fs.writeFileSync(target,audio);
    }
    completed++;
    if (completed%10===0 || completed===lines.size) console.log(`${completed}/${lines.size} audio files ready`);
  }
  fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify({voice,lines:manifest},null,2)+'\n');
  console.log('Voice:',voice.name,'— manifest and audio ready.');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
