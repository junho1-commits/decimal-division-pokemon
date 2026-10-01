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

const voiceDir = path.join(root,'assets','voice');
const savedManifest = JSON.parse(fs.readFileSync(path.join(voiceDir,'manifest.json'),'utf8'));
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

for(const name of ['꼬렛','구구']) { lines.add(`야생의 ${name}${name === '꼬렛' ? '이' : '가'} 나타났다!`);lines.add(`신난다! ${name}${name === '구구' ? '를' : '을'} 잡았다!`); }

const manifest = Object.fromEntries([...lines].map(text => [text, crypto.createHash('sha256').update(text).digest('hex').slice(0,16)+'.wav']));
const totalChars = [...lines].reduce((sum, text) => sum + text.length, 0);
if (process.argv.includes('--dry-run')) {
  const missing=Object.values(manifest).filter(file=>!fs.existsSync(path.join(voiceDir,file)));
  const newChars=[...lines].filter(text=>!fs.existsSync(path.join(voiceDir,manifest[text]))).reduce((sum,text)=>sum+text.length,0);
  console.log(JSON.stringify({voice:savedManifest.voice,totalLines:lines.size,missingFiles:missing.length,newCharacters:newChars,totalCharacters:totalChars,apiRequests:0}));
  process.exit(0);
}

if(process.argv.includes('--sync-manifest')) {
  const readyLines=Object.fromEntries(Object.entries(manifest).filter(([,file])=>fs.existsSync(path.join(voiceDir,file))));
  const temporary=path.join(voiceDir,'manifest.pending.json');
  fs.writeFileSync(temporary,JSON.stringify({voice:savedManifest.voice,lines:readyLines},null,2)+'\n');
  fs.renameSync(temporary,path.join(voiceDir,'manifest.json'));
  console.log(Object.keys(readyLines).length+' recorded lines indexed. No API request made.');
  process.exit(0);
}

const apiKey = process.env.TYPECAST_API_KEY || (process.platform === 'win32' ?
  require('node:child_process').execFileSync('powershell', ['-NoProfile','-Command',"[Environment]::GetEnvironmentVariable('TYPECAST_API_KEY','User')"], {encoding:'utf8'}).trim() : '');
if (!apiKey) throw new Error('TYPECAST_API_KEY is not set in the process or Windows user environment.');
const base = 'https://api.typecast.ai';
const auth = {'X-API-KEY':apiKey,'User-Agent':'typecast-direct/1 node-fetch typecast-integration/1 (source=api-docs; generated_by=codex)'};
async function chooseVoice() {
  // Reuse the exact recorded character; never select a fresh recommendation on reruns.
  if (savedManifest.voice?.id) return savedManifest.voice;
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

function speechText(text) {
  return text.replace(/(\d+)\/(\d+)/g,(_,n,d)=>`${d}분의 ${n}`).replace(/÷/g,' 나누기 ').replace(/×/g,' 곱하기 ').replace(/≈/g,' 약 ').replace(/=/g,' 는 ').replace(/㎡/g,'제곱미터').replace(/kg/g,'킬로그램').replace(/km/g,'킬로미터').replace(/cm/g,'센티미터').replace(/(\d)L/g,'$1리터').replace(/(\d)m/g,'$1미터').replace(/→/g,' 다음으로 ');
}

async function main() {
  const voice = await chooseVoice();
  if (process.argv.includes('--voice-check')) {
    console.log('Recommended voice:',voice.name,'('+voice.id+'). No audio generated.');
    return;
  }
  const dir = path.join(root, 'assets', 'voice');
  fs.mkdirSync(dir, {recursive:true});
  const entries=Object.entries(manifest);
  let completed=0, next=0, failed=false;
  let checkpointQueue=Promise.resolve();
  function checkpoint() {
    checkpointQueue=checkpointQueue.catch(()=>{}).then(async()=>{
      const target=path.join(dir,'manifest.json'),temporary=path.join(dir,'manifest.pending.json');
      const content=JSON.stringify({voice,lines:Object.fromEntries(entries.filter(([,file])=>fs.existsSync(path.join(dir,file))))},null,2)+'\n';
      for(let attempt=0;attempt<6;attempt++) {
        try {await fs.promises.writeFile(temporary,content);await fs.promises.rename(temporary,target);return;}
        catch(error){if(attempt===5)throw error;await new Promise(resolve=>setTimeout(resolve,1000));}
      }
    });
    return checkpointQueue;
  }
  async function worker() {
    while(!failed && next<entries.length) {
      const [text,file]=entries[next++],target=path.join(dir,file);
      try {
        if(!fs.existsSync(target)) {
          let response;
          for(let attempt=0;attempt<5;attempt++) {
            response=await fetch(base+'/v1/text-to-speech', {
              method:'POST',headers:{...auth,'Content-Type':'application/json'},
              body:JSON.stringify({voice_id:voice.id,text:speechText(text),model:'ssfm-v30',prompt:{emotion_type:'smart'},output:{audio_format:'wav'}}),signal:AbortSignal.timeout(90000)
            });
            if(response.ok)break;
            if(![429,500,502,503,504].includes(response.status) || attempt===4)throw new Error('Typecast synthesis failed (HTTP '+response.status+'). Completed files are saved for resume.');
            await new Promise(resolve=>setTimeout(resolve,Math.min(60000,10000*(attempt+1))));
          }
          const audio=Buffer.from(await response.arrayBuffer());
          if(audio.toString('ascii',0,4)!=='RIFF' || audio.length<1000)throw new Error('Unexpected audio format. Completed files are saved for resume.');
          fs.writeFileSync(target,audio);
        }
        completed++;
        if(completed%10===0 || completed===entries.length){await checkpoint();console.log(`${completed}/${entries.length} audio files ready`);}
      } catch(error){failed=true;await checkpoint();throw error;}
    }
  }
  const results=await Promise.allSettled(Array.from({length:3},()=>worker()));
  const error=results.find(result=>result.status==='rejected');
  if(error){await checkpoint();throw error.reason;}
  await checkpoint();
  console.log('Voice:',voice.name,'— manifest and audio ready.');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
