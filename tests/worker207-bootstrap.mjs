import { chromium } from 'playwright';

const url=process.env.FD_GAME_URL||'http://127.0.0.1:8765/frontline-dominion/frontline-dominion.html?build=207';
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
const page=await context.newPage();
const errors=[];
const consoleErrors=[];
page.on('pageerror',error=>errors.push(String(error?.stack||error)));
page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});

await page.goto(url,{waitUntil:'load',timeout:60000});
let menu=null;
for(let i=0;i<300;i+=1){
  menu=await page.evaluate(()=>{const button=document.getElementById('start-game'),shell=globalThis.__FD_RUNTIME_SHELL_207__,slots=globalThis.__FD_SAVE_SLOTS_207__;return{
    button:Boolean(button),disabled:Boolean(button?.disabled),text:button?.textContent||null,
    boot206:Boolean(globalThis.__FD_BOOT_206__),boot207:Boolean(globalThis.__FD_BOOT_207__),
    shell206:Boolean(globalThis.__FD_RUNTIME_SHELL_206__),shell207:Boolean(shell),shellInstalled:Boolean(shell?.state?.installed),shellError:shell?.state?.lastError||null,
    slots206:Boolean(globalThis.__FD_SAVE_SLOTS_206__),slots207:Boolean(slots),slotsInstalled:Boolean(slots?.state?.installed),slotsReady:Boolean(slots?.state?.ready),slotsError:slots?.state?.lastError||null,
    gameplay207:Boolean(globalThis.__FD_SINGLEPLAYER_207__),ui207:Boolean(globalThis.__FD_LOGISTICS_UI207__),runtimeUi207:Boolean(globalThis.__FD_RUNTIME_UI_207__),debug:Boolean(globalThis.__FD_DEBUG__)
  };});
  if(menu.button&&!menu.disabled&&menu.shellInstalled&&menu.slotsReady&&menu.gameplay207&&menu.ui207)break;
  await page.waitForTimeout(100);
}
console.log('BOOT207_MENU',JSON.stringify(menu));
if(!menu?.button||menu.disabled||!menu.shellInstalled||!menu.slotsReady||!menu.gameplay207||!menu.ui207){
  throw new Error(`Build 207 menu did not become ready: ${JSON.stringify({menu,errors,consoleErrors})}`);
}

await page.locator('#start-game').click();
let state=null;
for(let i=0;i<300;i+=1){
  state=await page.evaluate(()=>{const game=globalThis.__FD_DEBUG__?.game,b=globalThis.__FD_STABLE_STATE165__?.bridge,shell=globalThis.__FD_RUNTIME_SHELL_207__;return{
    game:Boolean(game),simTick:Number(game?.simTick||0),units:Number(game?.units?.length||0),buildings:Number(game?.buildings?.length||0),resources:Number(game?.resources?.length||0),
    bridge:Boolean(b),ready:Boolean(b?.ready),failed:Boolean(b?.failed),workerTick:Number(b?.workerTick||0),lastAck:Number(b?.lastAck||0),seq:Number(b?.seq||0),
    lastError:b?.lastError||null,recoveryAttempts:Number(b?.recoveryAttempts201||0),lastRecoveryReason:b?.lastRecoveryReason201||null,
    workerError:b?.workerError||b?.workerLastError||b?.lastWorkerError||null,
    shellLaunching:Boolean(shell?.state?.launching),shellError:shell?.state?.lastError||null,
    workerDiagnostics:globalThis.__FD_DEBUG__?.game?.authoritativeWorkerDiagnostics172?.()||null
  };});
  if(state.bridge&&state.ready&&!state.failed&&state.workerTick>12)break;
  if(state.failed||state.lastError||state.workerError||state.shellError)break;
  await page.waitForTimeout(100);
}
console.log('BOOT207_WORKER',JSON.stringify(state));
if(!state?.bridge||!state.ready||state.failed||state.workerTick<=12){
  throw new Error(`Build 207 Worker did not become authoritative: ${JSON.stringify({state,errors,consoleErrors})}`);
}
if(errors.length)throw new Error(`Build 207 page errors during bootstrap: ${JSON.stringify(errors)}`);
console.log(JSON.stringify({ok:true,menu,state:{ready:state.ready,workerTick:state.workerTick,units:state.units,buildings:state.buildings,resources:state.resources}}));
await context.close();
await browser.close();
