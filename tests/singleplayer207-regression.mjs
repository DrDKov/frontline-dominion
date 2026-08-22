import { chromium } from 'playwright';

const url=process.env.FD_GAME_URL||'http://127.0.0.1:8765/frontline-dominion/frontline-dominion.html?build=207';
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
const page=await context.newPage();
const errors=[];
page.on('pageerror',e=>errors.push(String(e?.stack||e)));
page.on('console',m=>{if(m.type()==='error'&&!/favicon|404|audio|autoplay|Failed to load resource:.*503/i.test(m.text()))errors.push(`console:${m.text()}`);});

const waitFor=async(fn,arg=undefined,timeout=30000,interval=100)=>{const start=Date.now();let last=null;while(Date.now()-start<timeout){last=await page.evaluate(fn,arg);if(last)return last;await page.waitForTimeout(interval);}throw new Error(`Timed out ${timeout}ms; last=${JSON.stringify(last)}`);};

await page.goto(url,{waitUntil:'load',timeout:60000});
const menu=await waitFor(()=>{const slots=globalThis.__FD_SAVE_SLOTS_207__,shell=globalThis.__FD_RUNTIME_SHELL_207__,button=document.getElementById('start-game');return slots?.state?.ready&&shell?.state?.installed&&globalThis.__FD_SINGLEPLAYER_207__&&globalThis.__FD_LOGISTICS_UI207__&&button&&!button.disabled?{build:slots.build,text:button.textContent,compat:Boolean(globalThis.__FD_RUNTIME_SHELL_206__&&globalThis.__FD_SAVE_SLOTS_206__)}:null;},undefined,30000);
if(menu.build!==207||!menu.compat)throw new Error(`Wrong/incomplete build owners: ${JSON.stringify(menu)}`);
await page.locator('#start-game').click();
const ready=await waitFor(()=>{const game=globalThis.__FD_DEBUG__?.game,bridge=globalThis.__FD_STABLE_STATE165__?.bridge;return game&&bridge?.ready&&!bridge.failed&&Number(bridge.workerTick||0)>12?{tick:bridge.workerTick,units:game.units.length,buildings:game.buildings.length,recoveryAttempts:Number(bridge.recoveryAttempts201||0)}:null;},undefined,45000);

const resourceModel=await page.evaluate(()=>{const D=globalThis.__FD_DEBUG__,game=D.game;const visibleTypes=[...new Set(Object.values(D.BUILD_CATEGORIES||{}).flatMap(c=>Array.isArray(c?.types)?c.types:[]).filter(id=>D.BUILDING_TYPES?.[id]?.logisticsExtractor))];return{visibleTypes,names:visibleTypes.map(id=>D.BUILDING_TYPES[id]?.name),resources:(game.resources||[]).filter(r=>r.alive).map(r=>({variant:r.variant,kind:r.resourceKind207,amount:r.amount,max:r.maxAmount,regen:r.regenRate})),fuelTop:Boolean(document.getElementById('fd-fuel-value207'))};});
if(resourceModel.visibleTypes.length!==2||!resourceModel.visibleTypes.includes('oilPump')||!resourceModel.visibleTypes.includes('gasPump')||!resourceModel.names.includes('Нефтеперерабатывающий комплекс')||!resourceModel.names.includes('Железорудный рудник'))throw new Error(`Extraction catalog is not canonical: ${JSON.stringify(resourceModel)}`);
if(!resourceModel.resources.length||resourceModel.resources.some(r=>!['oil','crystal'].includes(r.variant)||!['fuel','iron'].includes(r.kind)||r.max<2_000_000||r.regen!==0))throw new Error(`Resource deposits are not finite two-type reserves: ${JSON.stringify(resourceModel.resources.slice(0,12))}`);
if(!resourceModel.fuelTop)throw new Error('Global Fuel counter missing from top bar');

// Logistics is a first-class third selection tab next to Characteristics and Group Formation.
const hq=await page.evaluate(()=>{const game=globalThis.__FD_DEBUG__.game,L=globalThis.__FD_LOGISTICS206__;const b=game.buildings.find(x=>x?.alive&&x.completed&&x.team==='player'&&L.ensureNode(x)?.nodeType==='central')||game.buildings.find(x=>x?.alive&&x.completed&&x.team==='player'&&L.ensureNode(x));if(!b)return null;game.setSelection([b],false);game.renderSelectionUI();return{id:b.id,priority:b.logistics206?.priority||'NORMAL'};});
if(!hq)throw new Error('No logistics node for UI regression');
const tabs=await waitFor(()=>{const all=[...document.querySelectorAll('#selection-panel .selection-tabs [data-selection-tab]')];const log=document.querySelector('[data-selection-tab="logistics"]');return all.length===3&&all.some(x=>x.dataset.selectionTab==='stats')&&all.some(x=>x.dataset.selectionTab==='formation')&&log&&!log.disabled?{labels:all.map(x=>x.textContent),pane:Boolean(document.getElementById('selection-logistics-pane'))}:null;});
if(!tabs.pane||!tabs.labels.includes('Логистика'))throw new Error(`Logistics tab not integrated: ${JSON.stringify(tabs)}`);
await page.locator('[data-selection-tab="logistics"]').click();
const tabOpened=await waitFor(()=>{const log=document.querySelector('[data-selection-tab="logistics"]'),pane=document.getElementById('selection-logistics-pane'),stats=document.getElementById('selection-stats-pane'),formation=document.getElementById('selection-formation-pane');return log?.classList.contains('active')&&log.getAttribute('aria-selected')==='true'&&pane?.classList.contains('active')&&!stats?.classList.contains('active')&&!formation?.classList.contains('active')?true:null;});

// Stable DOM identity: Worker snapshots may change text, never replace a hovered/pressed logistics button.
const panelReady=await waitFor(()=>{const panel=document.getElementById('fd-logistics-panel207'),up=panel?.querySelector('[data-fd-action207="priority-up"]'),create=panel?.querySelector('[data-fd-action207="create-transport"]');if(!document.getElementById('selection-logistics-pane')?.classList.contains('active')||!up||!create)return null;globalThis.__fdButtonIdentity207={up,create,tab:document.querySelector('[data-selection-tab="logistics"]')};return{priority:panel.querySelector('[data-fd-field207="priority"]')?.textContent};});
await page.waitForTimeout(1400);
const stable=await page.evaluate(()=>({up:globalThis.__fdButtonIdentity207?.up===document.querySelector('[data-fd-action207="priority-up"]'),create:globalThis.__fdButtonIdentity207?.create===document.querySelector('[data-fd-action207="create-transport"]'),tab:globalThis.__fdButtonIdentity207?.tab===document.querySelector('[data-selection-tab="logistics"]'),active:document.getElementById('selection-logistics-pane')?.classList.contains('active')}));
if(!stable.up||!stable.create||!stable.tab||!stable.active)throw new Error(`Logistics controls/tab were recreated or reset during Worker snapshots: ${JSON.stringify(stable)}`);

// Native tabs still work and switching back to Logistics does not rebuild its controls.
await page.locator('[data-selection-tab="stats"]').click();
await waitFor(()=>document.getElementById('selection-stats-pane')?.classList.contains('active')&&!document.getElementById('selection-logistics-pane')?.classList.contains('active')?true:null);
await page.locator('[data-selection-tab="logistics"]').click();
const reopened=await waitFor(()=>document.getElementById('selection-logistics-pane')?.classList.contains('active')?{same:globalThis.__fdButtonIdentity207?.up===document.querySelector('[data-fd-action207="priority-up"]')}:null);
if(!reopened.same)throw new Error('Logistics controls rebuilt after tab switch');

// Priority must work both directions through the authoritative action path.
const normalizePriority=await page.evaluate(({id})=>{const game=globalThis.__FD_DEBUG__.game,bridge=globalThis.__FD_STABLE_STATE165__.bridge,before=Number(bridge.seq||0);game.setSupplyPriority206({entityId:id,priority:'NORMAL'});return Number(bridge.seq||0)>before?Number(bridge.seq):0;},hq);
if(!normalizePriority)throw new Error('Could not normalize node priority');
await waitFor(({id,seq})=>Number(globalThis.__FD_STABLE_STATE165__?.bridge?.lastAck||0)>=seq&&globalThis.__FD_DEBUG__?.game?.getEntity?.(id)?.logistics206?.priority==='NORMAL',{id:hq.id,seq:normalizePriority},15000);
await page.locator('[data-fd-action207="priority-up"]').click();
await waitFor(id=>globalThis.__FD_DEBUG__?.game?.getEntity?.(id)?.logistics206?.priority==='HIGH',hq.id,15000);
await page.locator('[data-fd-action207="priority-down"]').click();
await waitFor(id=>globalThis.__FD_DEBUG__?.game?.getEntity?.(id)?.logistics206?.priority==='NORMAL',hq.id,15000);

// Create transport button must remain clickable and enter the Worker action queue.
const createSeqBefore=await page.evaluate(()=>Number(globalThis.__FD_STABLE_STATE165__.bridge.seq||0));
await page.locator('[data-fd-action207="create-transport"]').click();
const createSeq=await waitFor(before=>{const b=globalThis.__FD_STABLE_STATE165__?.bridge;return Number(b?.seq||0)>before?Number(b.seq):null;},createSeqBefore,5000);
await waitFor(seq=>Number(globalThis.__FD_STABLE_STATE165__?.bridge?.lastAck||0)>=seq,createSeq,15000);

const truck=await waitFor(()=>{const game=globalThis.__FD_DEBUG__?.game,u=(game?.units||[]).find(x=>x?.alive&&x.team==='player'&&x.typeId==='resourceTruck');if(!u)return null;game.setSelection([u],false);game.renderSelectionUI();globalThis.__FD_LOGISTICS_UI207__?.open?.();return{id:u.id,fuel:u.logistics206?.fuel,fuelMax:u.logistics206?.fuelMax,capacity:u.logistics206?.cargoCapacity};},undefined,45000);
if(!(truck.fuelMax>0)||!(truck.capacity>=6000))throw new Error(`Truck tank/capacity missing: ${JSON.stringify(truck)}`);
const truckUi=await waitFor(()=>{const text=document.getElementById('fd-logistics-panel207')?.textContent||'';return document.getElementById('selection-logistics-pane')?.classList.contains('active')&&/Топливо в баке/.test(text)&&/Груз \/ вместимость/.test(text)?text:null;});

// Extractor details expose finite reserve, local buffer and extraction rate in the same Logistics tab.
const extractorUi=await page.evaluate(()=>{const game=globalThis.__FD_DEBUG__.game,L=globalThis.__FD_LOGISTICS206__,b=game.buildings.find(x=>x?.alive&&x.team==='player'&&L.ensureExtractor(x));if(!b)return{present:false};game.setSelection([b],false);game.renderSelectionUI();globalThis.__FD_LOGISTICS_UI207__?.open?.();return{present:true,id:b.id,name:b.stats?.name};});
if(extractorUi.present){const text=await waitFor(()=>{const t=document.getElementById('fd-logistics-panel207')?.textContent||'';return document.getElementById('selection-logistics-pane')?.classList.contains('active')&&/Остаток месторождения/.test(t)&&/Локальный склад/.test(t)&&/Скорость добычи/.test(t)?t:null;});if(!text)throw new Error('Extractor capacity details missing');}

// Aircraft control regression: a normal user command must not crash/recover Worker or collapse the unit mirror.
const airFixture=await page.evaluate(()=>{const game=globalThis.__FD_DEBUG__.game,bridge=globalThis.__FD_STABLE_STATE165__.bridge;const air=(game.units||[]).find(u=>u?.alive&&u.team==='player'&&(u.air||u.stats?.air));if(!air)return{present:false,units:game.units.length};game.setSelection([air],false);game.renderSelectionUI();globalThis.__FD_LOGISTICS_UI207__?.open?.();const beforeSeq=Number(bridge.seq||0),beforeTick=Number(bridge.workerTick||0),recoveries=Number(bridge.recoveryAttempts201||0),units=game.units.filter(u=>u?.alive).length;const issued=game.issueMove(air.x+420,air.y+180,false);return{present:true,id:air.id,issued,beforeSeq,sent:Number(bridge.seq||0),beforeTick,recoveries,units};});
if(airFixture.present){if(!airFixture.issued||airFixture.sent<=airFixture.beforeSeq)throw new Error(`Aircraft move did not enter Worker: ${JSON.stringify(airFixture)}`);await waitFor(seq=>Number(globalThis.__FD_STABLE_STATE165__?.bridge?.lastAck||0)>=seq,airFixture.sent,15000);await page.waitForTimeout(3500);const after=await page.evaluate(f=>{const game=globalThis.__FD_DEBUG__.game,b=globalThis.__FD_STABLE_STATE165__.bridge;return{ready:b.ready,failed:b.failed,tick:Number(b.workerTick||0),recoveries:Number(b.recoveryAttempts201||0),units:game.units.filter(u=>u?.alive).length,airAlive:Boolean(game.getEntity(f.id)?.alive),lastError:b.lastError||null,lastRecoveryReason:b.lastRecoveryReason201||null,logisticsTab:document.querySelector('[data-selection-tab="logistics"]')?.textContent};},airFixture);if(!after.ready||after.failed||after.tick<=airFixture.beforeTick||after.recoveries!==airFixture.recoveries||after.units<Math.max(1,airFixture.units-2)||!after.airAlive)throw new Error(`Aircraft command destabilized Worker/world: ${JSON.stringify({airFixture,after})}`);}

if(errors.length)throw new Error(`Browser errors: ${JSON.stringify(errors)}`);
console.log(JSON.stringify({ok:true,menu,ready,resourceModel:{visibleTypes:resourceModel.visibleTypes,names:resourceModel.names,resourceCount:resourceModel.resources.length},tabs,tabOpened,panelReady,stable,reopened,priorityRoundTrip:true,createSeq,truck,truckUi:true,extractorUi,airFixture}));
await context.close();await browser.close();
