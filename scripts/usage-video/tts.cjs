// Generates one Typecast wav per narration sentence (cached by text hash). API key from env or Windows user env.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const out=process.argv[2];fs.mkdirSync(out,{recursive:true});
const narration=JSON.parse(fs.readFileSync(path.join(__dirname,'narration.json'),'utf8'));
const voice=JSON.parse(fs.readFileSync(path.join(__dirname,'..','..','assets','voice','manifest.json'),'utf8')).voice;
const key=process.env.TYPECAST_API_KEY||cp.execFileSync('powershell',['-NoProfile','-Command',"[Environment]::GetEnvironmentVariable('TYPECAST_API_KEY','User')"],{encoding:'utf8'}).trim();
if(!key)throw new Error('TYPECAST_API_KEY missing');
const file=t=>path.join(out,crypto.createHash('sha256').update(t).digest('hex').slice(0,16)+'.wav');
(async()=>{
  const texts=Object.values(narration).flat();
  if(process.argv.includes('--dry')){console.log(texts.length+' sentences, '+texts.join('').length+' chars');return;}
  for(const t of texts){
    if(fs.existsSync(file(t)))continue;
    for(let a=0;a<5;a++){
      const r=await fetch('https://api.typecast.ai/v1/text-to-speech',{method:'POST',headers:{'X-API-KEY':key,'Content-Type':'application/json'},
        body:JSON.stringify({voice_id:voice.id,text:t,model:'ssfm-v30',prompt:{emotion_type:'smart'},output:{audio_format:'wav'}}),signal:AbortSignal.timeout(90000)});
      if(r.ok){const b=Buffer.from(await r.arrayBuffer());if(b.toString('ascii',0,4)!=='RIFF')throw new Error('bad audio');fs.writeFileSync(file(t),b);break;}
      if(![429,500,502,503,504].includes(r.status)||a===4)throw new Error('Typecast HTTP '+r.status);
      await new Promise(s=>setTimeout(s,8000*(a+1)));
    }
    console.log('ok',t.slice(0,20));
  }
  console.log('done');
})().catch(e=>{console.error(e.message);process.exit(1)});
