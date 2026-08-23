import { chromium } from 'playwright';

const url=process.env.FD_GAME_URL||'http://127.0.0.1:8765/frontline-dominion/frontline-dominion.html?build=213';
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
const page=await context.newPage();
const errors=[];
page.on('pageerror',error=>errors.push(String(error?.stack||error)));

const waitFor=async(fn,timeout=40000,interval=100)=>{const started=Date.now();let last=null;while(Date.now()-started<timeout){last=await page.evaluate(fn);if(last&&!last.__pending)return last;await page.waitForTimeout(interval);}throw new Error(`Timed out ${timeout} ms last=${JSON.stringify(last)} errors=${JSON.stringify(errors)}`);};

await page.goto(url,{waitUntil:'load',timeout:60000});
const menu=await waitFor(()=>{
  const button=document.getElementById('start-game');
  const shell=globalThis.__FD_RUNTIME_SHELL_213__;
  const slots=globalThis.__FD_SAVE_SLOTS_213__;
  const boot=globalThis.__FD_BOOT_213__;
  const out={button:Boolean(button),disabled:Boolean(button?.disabled),text:button?.textContent||null,shell:Boolean(shell),installed:Boolean(shell?.state?.installed),shellError:shell?.state?.lastError||null,slots:Boolean(slots),slotsReady:Boolean(slots?.state?.ready),boot:Boolean(boot),bootReady:Boolean(boot?.state?.ready),feature:Boolean(globalThis.__FD_EXTRACTOR_VISIBILITY_HAUL_213__)};
  return out.button&&!out.disabled&&out.installed&&out.slotsReady&&out.boot&&out.bootReady&&out.feature?out:{__pending:true,...out};
});

await page.locator('#start-game').click();
const worker=await waitFor(()=>{
  const game=globalThis.__FD_DEBUG__?.game;
  const bridge=globalThis.__FD_STABLE_STATE165__?.bridge;
  const shell=globalThis.__FD_RUNTIME_SHELL_213__;
  const out={game:Boolean(game),ready:Boolean(bridge?.ready),failed:Boolean(bridge?.failed),tick:Number(bridge?.workerTick||0),error:bridge?.lastError||null,shellError:shell?.state?.lastError||null,launching:Boolean(shell?.state?.launching)};
  if(out.failed||out.error||out.shellError)return out;
  return out.game&&out.ready&&!out.failed&&out.tick>12&&!out.launching?out:{__pending:true,...out};
});
if(worker.failed||worker.error||worker.shellError||worker.tick<=12)throw new Error(`Build 213 Worker bootstrap failed ${JSON.stringify(worker)}`);
if(errors.length)throw new Error(`Build 213 page errors ${JSON.stringify(errors)}`);
console.log(JSON.stringify({ok:true,menu,worker}));
await context.close();
await browser.close();
