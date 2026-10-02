"""Records the teacher+student usage video: real app (iframes) + per-sentence narration timing.

usage: python make_video.py VOICE_DIR OUT_DIR [--dry] [--credit TEXT] [--shift SEC]
Servers expected: game on :8200 (node server.cjs), stage on :8300 (python -m http.server 8300 in this dir).
"""
import asyncio, hashlib, json, os, subprocess, sys, time, wave, glob
from playwright.async_api import async_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
VOICE, OUT = sys.argv[1], sys.argv[2]
DRY = '--dry' in sys.argv
def arg(name, default=''):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default
CREDIT = arg('--credit', '음성: Typecast AI 보이스 (Lala)')
SHIFT = float(arg('--shift', '0'))
ONLY = arg('--only', '')
os.makedirs(OUT, exist_ok=True)
NARR = json.load(open(os.path.join(HERE, 'narration.json'), encoding='utf-8'))
TEACHER = 'http://localhost:8200/index.html?hostIp=127.0.0.1&port=8200'

INJECT = """
(()=>{ if(window.__fx) return;
 const st=document.createElement('style'); st.textContent=`
 #__ring{position:fixed;z-index:2147483646;border:5px solid #facc15;border-radius:14px;box-shadow:0 0 22px 6px #facc15aa;pointer-events:none;transition:all .45s ease;animation:__p .7s ease-in-out infinite alternate}
 @keyframes __p{from{transform:scale(1)}to{transform:scale(1.05)}}
 #__cur{position:fixed;z-index:2147483647;pointer-events:none;transition:left .6s ease,top .6s ease;font-size:44px;line-height:44px;filter:drop-shadow(0 2px 3px #000)}`;
 document.head.appendChild(st);
 const ring=document.createElement('div');ring.id='__ring';ring.style.display='none';document.body.appendChild(ring);
 const cur=document.createElement('div');cur.id='__cur';cur.textContent='👆';cur.style.display='none';document.body.appendChild(cur);
 const vis=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden'};
 window.__fx={
  find(sel,text,idx){
   let list=[...document.querySelectorAll(sel||'*')].filter(vis);
   if(text){list=list.filter(e=>(e.textContent||'').includes(text)).sort((a,b)=>a.textContent.length-b.textContent.length);}
   return list[idx||0]||null;
  },
  show(sel,text,idx,cursor){
   const el=this.find(sel,text,idx); if(!el) return false;
   el.scrollIntoView({block:'nearest',inline:'nearest'});
   const r=el.getBoundingClientRect(), p=6;
   Object.assign(ring.style,{display:'block',left:(r.left-p)+'px',top:(r.top-p)+'px',width:(r.width+2*p)+'px',height:(r.height+2*p)+'px'});
   if(cursor!==false){cur.style.display='block';cur.style.left=(r.left+r.width/2-10)+'px';cur.style.top=(r.top+r.height/2-4)+'px';}
   return true;
  },
  hide(){ring.style.display='none';cur.style.display='none';},
  click(sel,text,idx){const el=this.find(sel,text,idx);if(!el)return false;el.click();return true;}
 };})()
"""

class Run:
    def __init__(self):
        self.events = []      # (offset seconds, wav path)
        self.t0 = None
        self.extras = []
        self.join_url = None
        self.log = []

    def now(self):
        return time.monotonic() - self.t0

    # ---------- narration ----------
    def wav(self, text):
        f = os.path.join(VOICE, hashlib.sha256(text.encode('utf-8')).hexdigest()[:16] + '.wav')
        return f

    def dur(self, text):
        if DRY:
            return 0.6
        w = wave.open(self.wav(text))
        return w.getnframes() / w.getframerate()

    async def line(self, key, i, cue=None, gap=0.35):
        text = NARR[key][i]
        await self.page.evaluate('t=>setCaption(t)', text)
        start = time.monotonic()
        if not DRY:
            self.events.append((self.now(), self.wav(text)))
        task = asyncio.create_task(cue()) if cue else None
        await asyncio.sleep(self.dur(text))
        if task:
            try:
                await task
            except Exception as e:
                await self.page.screenshot(path=os.path.join(OUT, f'ERR_{key}_{i}.png'))
                print('CUE ERROR', key, i, repr(e)[:300])
                raise
        await asyncio.sleep(gap if not DRY else 0.05)

    # ---------- frame helpers ----------
    def fr(self, name):
        return self.page.frame(name=name)

    async def fx(self, who, sel, text=None, idx=0, hold=0.9, cursor=True):
        fr = self.fr(who)
        await fr.evaluate(INJECT)
        ok = await fr.evaluate('([s,t,i,c])=>window.__fx.show(s,t,i,c)', [sel, text, idx, cursor])
        if not ok:
            print('  (fx miss)', who, sel, text)
        await asyncio.sleep(0 if DRY else hold)
        return ok

    async def clk(self, who, sel, text=None, idx=0, pre=0.9, post=0.4):
        ok = await self.fx(who, sel, text, idx, pre)
        fr = self.fr(who)
        got = await fr.evaluate('([s,t,i])=>window.__fx.click(s,t,i)', [sel, text, idx])
        await fr.evaluate('window.__fx&&window.__fx.hide()')
        if not got:
            print('  (click miss)', who, sel, text)
        await asyncio.sleep(0 if DRY else post)

    async def hide(self, who):
        try:
            await self.fr(who).evaluate('window.__fx&&window.__fx.hide()')
        except Exception:
            pass

    async def type_into(self, who, sel, text, delay=120):
        await self.fx(who, sel, hold=0.6)
        loc = self.fr(who).locator(sel)
        await loc.click()
        await loc.press_sequentially(text, delay=0 if DRY else delay)

    async def poll(self, who, expr, timeout=25):
        fr = self.fr(who)
        end = time.monotonic() + timeout
        while time.monotonic() < end:
            try:
                if await fr.evaluate(expr):
                    return True
            except Exception:
                pass
            await asyncio.sleep(0.3)
        print('  (poll timeout)', who, expr[:70])
        return False

    # ---------- student quiz helpers ----------
    async def fill_guided(self, who, prefix, show_each=True):
        fr = self.fr(who)
        quiz = 'currentSoloQuiz' if who == 's' else 'teacherSoloQuiz'
        answers = await fr.evaluate(f'guidedMethod({quiz}).fields.map(f=>f.answer)')
        for i, a in enumerate(answers):
            sel = f'#{prefix}-field-{i}'
            if show_each and i < 6:
                await self.fx(who, sel, hold=0.25)
            await fr.locator(sel).fill(str(a))
            await asyncio.sleep(0 if DRY else 0.18)
        await self.hide(who)

    async def solo_state(self):
        return await self.fr('s').evaluate('currentSoloQuiz?currentSoloQuiz.kind:null')

    async def solve_solo_visible(self, correct=True):
        """Answer the current student solo quiz (guided or reasoning) with visible clicks."""
        kind = await self.solo_state()
        if kind == 'guided':
            if correct:
                await self.fill_guided('s', 'studentSoloOptions')
            else:
                n = await self.fr('s').evaluate('guidedMethod(currentSoloQuiz).fields.length')
                await self.fr('s').locator('#studentSoloOptions-field-0').fill('99')
        else:
            idx = await self.fr('s').evaluate('currentSoloQuiz.correct')
            if not correct:
                idx = (idx + 1) % 4
            await self.clk('s', '#studentSoloOptions button', idx=idx, pre=0.8)
        await self.clk('s', '#studentSoloSubmit', pre=0.7, post=0.8)

    async def next_solo(self):
        await self.clk('s', '#studentSoloSubmit', pre=0.6, post=0.7)

    # ---------- background extras ----------
    async def extra_student(self, browser, name):
        ctx = await browser.new_context(viewport={'width': 1280, 'height': 720})
        page = await ctx.new_page()
        page.on('dialog', lambda d: (print('  DIALOG:', d.message[:80]), asyncio.ensure_future(d.accept())))
        await page.goto(self.join_url)
        await page.fill('#studentJoinName', name)
        await page.click('text=모험 시작하기')
        self.extras.append(page)
        return page

    async def extra_capture(self, page):
        solve = """()=>{const q=currentSoloQuiz;if(!q)return;if(q.kind==='guided'){const m=guidedMethod(q);m.fields.forEach((f,i)=>{document.getElementById('studentSoloOptions-field-'+i).value=f.answer});}else{soloQuizChoice=q.correct;}}"""
        await page.wait_for_function("typeof studentReady!=='undefined'&&studentReady&&!!currentSoloQuiz", timeout=20000)
        for _ in range(2):
            await page.evaluate(solve)
            await page.click('#studentSoloSubmit'); await asyncio.sleep(0.5)
            await page.click('#studentSoloSubmit'); await asyncio.sleep(0.5)

    async def raid_correct(self):
        return await self.fr('t').evaluate('RAID_BOSSES[gameState.currentRaidBossIndex].phases[gameState.currentRaidPhase].correct')

    async def extras_attack(self):
        c = await self.raid_correct()
        for p in self.extras:
            try:
                await p.wait_for_function("isStudentInRaid&&currentRaidQuiz", timeout=15000)
                await p.evaluate(f'()=>{{chooseStudentRaidOption({c});sendStudentRaidAnswer();}}')
            except Exception as e:
                print('  extra attack fail', repr(e)[:100])
            await asyncio.sleep(0.7 if not DRY else 0.1)

    async def main_attack_js(self):
        c = await self.raid_correct()
        await self.fr('s').evaluate(f'()=>{{chooseStudentRaidOption({c});sendStudentRaidAnswer();}}')

    async def shot(self, name):
        if DRY:
            await self.page.screenshot(path=os.path.join(OUT, name + '.png'))

    # ======================= scenes =======================
    async def scene_intro(self):
        await self.page.evaluate("setLayout('TS');setStep('')")
        await self.fr('t').evaluate(f"location.href='{TEACHER}'")
        await asyncio.sleep(2.0 if not DRY else 1)
        await self.line('intro', 0)
        await self.line('intro', 1)
        await self.page.evaluate("setCard(false)")
        await asyncio.sleep(0.8 if not DRY else 0.1)

    async def scene_open(self):
        await self.page.evaluate("setLayout('T');setStep('① 선생님 준비')")
        await asyncio.sleep(0.9 if not DRY else 0.1)
        await self.line('open', 0)
        async def cards():
            for i in range(6):
                await self.fx('t', '.stage-card:not(.raid-card)', idx=i, hold=0.45, cursor=False)
            await self.fx('t', '.raid-card', hold=1.0, cursor=False)
            await self.hide('t')
        await self.line('open', 1, cards)
        await self.shot('open')

    async def scene_qr(self):
        await self.page.evaluate("setStep('② 학생 참여 QR 만들기')")
        await self.line('qr', 0, lambda: self.clk('t', '#btnMultiplayer'))
        await self.line('qr', 1, lambda: self.fx('t', '#qrcodeCanvas', hold=1.8, cursor=False))
        async def room():
            await self.fx('t', '#displayRoomCode', hold=2.2, cursor=False)
            await self.hide('t')
        await self.line('qr', 2, room)
        self.join_url = (await self.fr('t').evaluate("document.getElementById('displayConnectUrl').textContent")).strip()
        await self.shot('qr')

    async def scene_join(self, browser):
        await self.page.evaluate("setLayout('TS');setStep('③ 학생 입장')")
        async def scan():
            await self.page.evaluate("setCover('📷 QR 코드를 스캔하는 중…')")
            await asyncio.sleep(1.8 if not DRY else 0.1)
            await self.fr('s').evaluate(f"location.href='{self.join_url}'")
            await self.poll('s', "!!document.getElementById('studentJoinName')")
            await asyncio.sleep(0.4)
            await self.page.evaluate("setCover('')")
        await self.line('join', 0, scan)
        async def typing():
            await self.fx('s', '#studentJoinRoomCode', hold=1.4, cursor=False)
            await self.type_into('s', '#studentJoinName', '3번 김하늘')
        await self.line('join', 1, typing)
        await self.line('join', 2, lambda: self.clk('s', '.btn-student-primary', '모험 시작하기'))
        async def confirm():
            self.extra_tasks = [asyncio.create_task(self.extra_student(browser, n)) for n in ('7번 박민준', '12번 이서연')]
            await self.poll('s', "document.getElementById('studentConnStatus').textContent.includes('선생님 확인')")
            await self.fx('s', '#studentConnStatus', hold=1.6, cursor=False)
            await self.hide('s')
            await self.fx('t', '#connectedStudentChips', hold=2.6, cursor=False)
            await self.hide('t')
        await self.line('join', 3, confirm)
        async def closemodal():
            await asyncio.gather(*self.extra_tasks)
            await self.clk('t', 'button', '게임 화면으로 돌아가기')
        await self.line('join', 4, closemodal)
        await self.shot('join')

    async def scene_solve(self):
        await self.page.evaluate("setLayout('S');setStep('④ 학생: 문제 풀기')")
        await self.poll('s', "typeof currentSoloQuiz!=='undefined'&&!!currentSoloQuiz")
        await self.line('solve', 0, lambda: self.fx('s', '#studentStageTabs', hold=2.4, cursor=False))
        async def q():
            await self.fx('s', '.student-columns', hold=0.01, cursor=False)
            await self.fx('s', '#studentSoloFormula', hold=2.2, cursor=False)
            await self.hide('s')
        await self.line('solve', 1, q)
        async def methods():
            for i in (1, 2, 0):
                await self.clk('s', '.practice-methods button', idx=i, pre=0.8, post=0.5)
        await self.line('solve', 2, methods)
        async def fill():
            await self.fill_guided('s', 'studentSoloOptions')
            await self.clk('s', '#studentSoloSubmit', pre=0.7, post=0.5)
        await self.line('solve', 3, fill)
        async def fb():
            await self.fx('s', '#studentSoloFeedback', hold=2.4, cursor=False)
            await self.hide('s')
        await self.line('solve', 4, fb)
        await self.shot('solve')

    async def scene_capture(self, browser):
        await self.page.evaluate("setLayout('TS');setStep('⑤ 틀려도 괜찮아요 · 포획')")
        # extras capture in the background (needed for the raid later)
        self.extra_cap = [asyncio.create_task(self.extra_capture(p)) for p in self.extras]
        async def wrong():
            await self.next_solo()
            await self.solve_solo_visible(correct=False)
        await self.line('capture', 0, wrong)
        async def fb():
            await self.fx('s', '#studentSoloFeedback', hold=2.8, cursor=False)
            await self.hide('s')
        await self.line('capture', 1, fb)
        async def second():
            await self.next_solo()
            kind = await self.solo_state()
            if kind == 'guided':
                await self.fill_guided('s', 'studentSoloOptions')
            else:
                idx = await self.fr('s').evaluate('currentSoloQuiz.correct')
                await self.clk('s', '#studentSoloOptions button', idx=idx, pre=0.6)
        await self.line('capture', 2, second)
        async def submit():
            await self.clk('s', '#studentSoloSubmit', pre=0.6, post=1.0)
            await self.poll('t', "document.body.innerText.includes('포획했습니다')", 8)
            await self.fx('t', '*', '포획했습니다', hold=2.6, cursor=False)
            await self.hide('t')
        await self.line('capture', 3, submit)
        async def partners():
            await self.fx('s', 'details.partner-collection', hold=3.2, cursor=False)
            await self.hide('s')
        await self.line('capture', 4, partners)
        await asyncio.gather(*self.extra_cap, return_exceptions=True)
        await self.shot('capture')

    async def draw(self, canvas_rect, strokes, scale, left, top):
        pg = self.page
        for pts in strokes:
            x0, y0 = pts[0]
            await pg.mouse.move(left + (canvas_rect['x'] + x0) * scale, top + (canvas_rect['y'] + y0) * scale)
            await pg.mouse.down()
            for (x, y) in pts[1:]:
                await pg.mouse.move(left + (canvas_rect['x'] + x) * scale, top + (canvas_rect['y'] + y) * scale, steps=4)
            await pg.mouse.up()

    async def scene_memo(self):
        await self.page.evaluate("setLayout('S');setStep('⑥ 계산 메모장 · 도감')")
        async def memo():
            await self.clk('s', 'button', '계산 메모장')
            await asyncio.sleep(0.5)
            r = await self.fr('s').evaluate("(()=>{const b=document.getElementById('studentMemoCanvas').getBoundingClientRect();return {x:b.left,y:b.top,w:b.width,h:b.height}})()")
            ox, oy = 60, 50
            strokes = [
                [(ox, oy + 90), (ox + 20, oy + 60), (ox + 30, oy + 20), (ox + 120, oy + 20)],          # division bracket
                [(ox - 70, oy + 55), (ox - 30, oy + 55)], [(ox - 55, oy + 38), (ox - 45, oy + 72)],   # 3.2 = 32
                [(ox + 50, oy + 70), (ox + 80, oy + 70)], [(ox + 70, oy + 55), (ox + 80, oy + 90)],
                [(ox + 20, oy + 140), (ox + 140, oy + 140)],
                [(ox + 40, oy + 160), (ox + 60, oy + 200), (ox + 90, oy + 160), (ox + 100, oy + 200)],
                [(ox + 20, oy + 230), (ox + 140, oy + 230)],
            ]
            await self.draw(r, strokes, 1.12, 243, 146)
        await self.line('memo', 0, memo)
        await self.line('memo', 1, lambda: self.clk('s', '#studentMemoOverlay button', '닫기', pre=0.8))
        async def dex():
            await self.clk('s', 'button', '내 도감')
            await asyncio.sleep(0.8)
            await self.clk('s', '#studentDexModal [onclick^="showStudentDexDetail"]', pre=0.9, post=2.5)
            await self.fr('s').evaluate('closeStudentDex()')
        await self.line('memo', 2, dex)
        await self.shot('memo')

    async def scene_pvp(self):
        await self.page.evaluate("setLayout('S');setStep('⑦ 친구 대전')")
        await self.line('pvp', 0, lambda: self.fx('s', 'section.pvp-lobby', hold=2.0, cursor=False))
        async def t():
            await self.fx('s', '#studentPvpTarget', hold=1.8)
            await self.hide('s')
        await self.line('pvp', 1, t)
        await self.shot('pvp')

    async def scene_tclass(self):
        await self.page.evaluate("setLayout('T');setStep('⑧ 선생님도 수업 화면으로')")
        await self.line('tclass', 0, lambda: self.clk('t', '.stage-card', idx=0, pre=1.2, post=1.2))
        async def memo():
            await self.fx('t', 'button', '힌트', hold=0.9)
            await self.clk('t', 'button', '계산 메모장 열기', pre=0.9, post=1.8)
            await self.fr('t').evaluate('closeScratchpad()')
            await asyncio.sleep(0.5)
        await self.line('tclass', 1, memo)
        async def solve():
            kind = await self.fr('t').evaluate('teacherSoloQuiz?teacherSoloQuiz.kind:null')
            if kind == 'guided':
                await self.fill_guided('t', 'quizFormulaBox')
                await self.clk('t', 'button', '풀이 과정 확인하기', pre=0.6, post=2.2)
            else:
                idx = await self.fr('t').evaluate('teacherSoloQuiz.correct')
                await self.fr('t').evaluate(f'chooseTeacherSoloOption({idx})')
                await self.clk('t', 'button', '선택한 생각 확인하기', pre=0.6, post=2.2)
        await self.line('tclass', 2, solve)
        await self.shot('tclass')
        await self.fr('t').evaluate('closeCatchSuccessModal(false)')

    async def scene_raidsetup(self):
        await self.page.evaluate("setLayout('T');setStep('⑨ 전설 레이드 시작')")
        async def boss():
            await self.fr('t').evaluate('showMapView()')
            await asyncio.sleep(0.8 if not DRY else 0.1)
            await self.fx('t', '#raidBossChoice', hold=1.2)
            await self.fr('t').evaluate("""()=>{const s=document.getElementById('raidBossChoice');const o=[...s.options].find(o=>o.textContent.includes('레쿠쟈')&&!o.textContent.includes('이로치'));if(o){s.value=o.value;s.dispatchEvent(new Event('change',{bubbles:true}));}}""")
            await asyncio.sleep(1.0 if not DRY else 0.1)
        await self.line('raidsetup', 0, boss)
        await self.line('raidsetup', 1, lambda: self.clk('t', '.raid-btn', pre=1.4, post=0.5))
        await self.shot('raidsetup')

    async def scene_raidstudent(self):
        await self.page.evaluate("setLayout('TS');setStep('⑩ 레이드: 학생 화면')")
        await self.poll('s', "isStudentInRaid&&!!currentRaidQuiz", 20)
        async def banner():
            await self.fx('s', '#studentRaidBox', hold=1.0, cursor=False)
            await self.fx('s', '#studentPartnerImg', hold=2.0, cursor=False)
            await self.hide('s')
        await self.line('raidstudent', 0, banner)
        async def opts():
            await self.fx('s', '#studentRaidOptions', hold=2.6, cursor=False)
            await self.hide('s')
        await self.line('raidstudent', 1, opts)
        async def wrong():
            await self.fx('s', '#studentPartnerImg', hold=1.6, cursor=False)
            await self.fx('s', '#studentRaidTeam', hold=2.2, cursor=False)
            await self.hide('s')
        await self.line('raidstudent', 2, wrong)
        async def right():
            await asyncio.sleep(0.8)
            c = await self.raid_correct()
            await self.clk('s', '#studentRaidOptions button', idx=c, pre=0.8)
            await self.clk('s', '#studentRaidAttackButton', pre=0.7, post=0.5)
            await self.fx('t', '#raidBossHpWrap', hold=2.2, cursor=False)
            await self.hide('t')
        await self.line('raidstudent', 3, right)
        await self.shot('raidstudent')

    async def scene_raidteacher(self):
        await self.page.evaluate("setLayout('T');setStep('⑪ 레이드: 선생님 화면')")
        async def hp():
            await self.extras_attack()
            await self.fx('t', '#raidBossHpWrap', hold=1.2, cursor=False)
            await self.hide('t')
        await self.line('raidteacher', 0, hp)
        async def phase():
            await self.poll('t', 'gameState.currentRaidPhase>=1||raidFinished', 12)
            await asyncio.sleep(1.5 if not DRY else 0.1)
            await self.main_attack_js()
            await self.extras_attack()
        await self.line('raidteacher', 1, phase)
        async def coop():
            await self.fx('t', '#coopRaidConsole', hold=3.2, cursor=False)
            await self.hide('t')
        await self.line('raidteacher', 2, coop)
        await self.shot('raidteacher')

    async def scene_victory(self):
        await self.page.evaluate("setLayout('TS');setStep('⑫ 보스 격파!')")
        async def finish():
            for _ in range(6):
                if await self.fr('t').evaluate('!!raidFinished'):
                    break
                ph = await self.fr('t').evaluate('gameState.currentRaidPhase')
                await asyncio.sleep(1.5 if not DRY else 0.2)
                await self.main_attack_js()
                await self.extras_attack()
                await self.poll('t', '!!raidFinished', 2)
            await self.poll('t', '!!raidFinished', 10)
        await self.line('victory', 0, finish)
        async def st():
            await self.fx('s', '#studentRaidVictoryModal', hold=3.0, cursor=False)
            await self.hide('s')
        await self.line('victory', 1, st)
        await self.shot('victory')

    async def scene_outro(self):
        await self.page.evaluate("setLayout('TS');setStep('')")
        await self.line('outro', 0)
        await self.line('outro', 1)
        await self.line('outro', 2)
        await self.page.evaluate("document.querySelector('#card h1').textContent='즐거운 수학 수업 되세요!';setCard(true)")
        await self.line('outro', 3)
        await asyncio.sleep(2.0 if not DRY else 0.2)


async def main():
    run = Run()
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
        ctx = await browser.new_context(viewport={'width': 1920, 'height': 1080},
                                        record_video_dir=None if DRY else os.path.join(OUT, 'rec'),
                                        record_video_size={'width': 1920, 'height': 1080})
        run.page = page = await ctx.new_page()
        page.on('dialog', lambda d: (print('  DIALOG:', d.message[:80]), asyncio.ensure_future(d.accept())))
        run.t0 = time.monotonic()
        await page.goto('http://localhost:8300/stage.html?credit=' + CREDIT)
        await page.evaluate("setLayout('TS')")
        # student iframe starts on a placeholder
        order = ['intro', 'open', 'qr', 'join', 'solve', 'capture', 'memo', 'pvp', 'tclass', 'raidsetup', 'raidstudent', 'raidteacher', 'victory', 'outro']
        for name in order:
            fn = getattr(run, 'scene_' + name)
            print('scene', name, f'{run.now():.1f}s', flush=True)
            if name in ('join', 'capture'):
                await fn(browser)
            else:
                await fn()
        total = run.now()
        await page.close()
        await ctx.close()
        await browser.close()
    json.dump({'events': run.events, 'total': total}, open(os.path.join(OUT, 'timeline.json'), 'w'))
    print('timeline saved, total', round(total, 1))

asyncio.run(main())
