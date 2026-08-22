(() => {
  'use strict';
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  const D=window.__FD_DEBUG__,L=window.__FD_LOGISTICS206__,S=window.__FD_SINGLEPLAYER_207__;
  if(!D?.Game||!L||!S)return;
  const Game=D.Game;
  if(Game.prototype.__fdLogisticsUI207Installed)return;
  Object.defineProperty(Game.prototype,'__fdLogisticsUI207Installed',{value:true,configurable:true});

  const amount=v=>Math.round(Number(v)||0).toLocaleString('ru-RU');
  const pct=(v,m)=>m>0?`${Math.round(Math.max(0,Number(v)||0)/m*100)}%`:'—';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const priorityNames={LOW:'НИЗКИЙ',NORMAL:'ОБЫЧНЫЙ',HIGH:'ВЫСОКИЙ',CRITICAL:'КРИТИЧЕСКИЙ'};
  const priorities=['LOW','NORMAL','HIGH','CRITICAL'];
  const missionNames={AUTO:'Автоматический',EXTRACT_RESOURCE:'Вывоз добычи',SUPPLY_BUILDING:'Снабжение здания',SUPPLY_AREA:'Снабжение области',SUPPLY_GROUP:'Снабжение группы',MANUAL_TRANSFER:'Ручная перевозка',RETURN_TO_SOURCE:'Возврат на склад'};
  const nodeNames={central:'Командный/центральный склад',warehouse:'Склад',pmto:'ПМТО',terminal:'Логистический терминал',trade:'Торговый узел',airfield:'Аэродром',production:'Производственный объект',barracks:'Казармы',repair:'Ремонтная база',defense:'Оборонный узел'};
  const state={entityId:null,layout:null,targetMode:null,truckIds:[],sourceEntityId:null,overlay:false,pendingPriority:new Map(),lastTopUpdate:0};

  const style=document.createElement('style');style.id='fd-logistics-ui207-style';style.textContent=`
    #fd-logistics-panel207{display:none;grid-column:1/-1;gap:7px;margin-top:7px;padding:9px;border:1px solid rgba(103,193,151,.34);border-radius:7px;background:rgba(4,16,12,.76);contain:layout style}
    #fd-logistics-panel207.active{display:grid}#fd-logistics-panel207 h4{margin:0;color:#cce9d7;font:900 10px/1.2 system-ui;letter-spacing:.09em;text-transform:uppercase}
    #fd-logistics-panel207 .fd-grid207{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 11px}#fd-logistics-panel207 .fd-line207{display:flex;justify-content:space-between;gap:8px;color:#92aa9e;font:700 9px/1.35 system-ui}#fd-logistics-panel207 .fd-line207 strong{color:#e1eee7;text-align:right;font-variant-numeric:tabular-nums}
    #fd-logistics-panel207 .fd-actions207{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px}#fd-logistics-panel207 button{min-height:31px;padding:4px 7px;border:1px solid rgba(110,194,151,.38);border-radius:5px;background:rgba(35,86,61,.22);color:#dbeae1;font:800 8px/1.15 system-ui;letter-spacing:.025em;cursor:pointer;touch-action:manipulation}#fd-logistics-panel207 button:hover{border-color:rgba(139,231,183,.82);background:rgba(48,115,79,.36)}#fd-logistics-panel207 button:active{transform:translateY(1px);background:rgba(62,135,94,.46)}
    #fd-logistics-panel207 .fd-priority207{display:grid;grid-template-columns:34px 1fr 34px;gap:5px;align-items:center}.fd-priority207 span{text-align:center;color:#dfeee5;font:900 9px system-ui}
    #fd-fuel-resource207{white-space:nowrap}#fd-logistics-toggle207{position:fixed;z-index:83;right:14px;top:72px;min-height:36px;padding:0 12px;border:1px solid rgba(112,202,158,.48);border-radius:5px;background:rgba(5,20,14,.88);color:#cae7d7;font:900 9px system-ui;cursor:pointer}#fd-logistics-toggle207.active{background:rgba(47,111,77,.9);color:white}
    #fd-logistics-summary207{position:fixed;z-index:82;right:14px;top:114px;display:none;width:260px;padding:9px;border:1px solid rgba(112,202,158,.33);border-radius:7px;background:rgba(4,14,10,.9);color:#dcebe3;font:700 9px/1.45 system-ui;pointer-events:none}#fd-logistics-summary207.active{display:grid;gap:3px}
    body.fd-logistics-target207 #game-canvas{cursor:crosshair!important}
  `;document.head.appendChild(style);

  function selectedOne(game){return game?.selected?.length===1?game.selected[0]:null;}
  function label(game,id){const e=id?game.getEntity?.(id):null;return e?.stats?.name||e?.typeId||(id?`#${id}`:'—');}
  function field(id,labelText){return `<div class="fd-line207"><span>${esc(labelText)}</span><strong data-fd-field207="${id}">—</strong></div>`;}
  function actions(list){return `<div class="fd-actions207">${list.map(([id,text])=>`<button type="button" data-fd-action207="${id}">${esc(text)}</button>`).join('')}</div>`;}
  function layoutFor(entity){
    if(!entity)return null;
    if(entity.kind==='unit'&&L.isTruck(entity))return 'truck';
    if(entity.kind==='unit'&&L.isAir(entity))return 'air';
    if(entity.kind==='unit'&&entity.typeId==='worker')return 'worker';
    if(entity.kind==='unit')return 'unit';
    if(entity.kind==='building'&&L.ensureExtractor(entity))return 'extractor';
    if(entity.kind==='building'&&L.ensureNode(entity))return 'node';
    return null;
  }
  function shell(layout,entity){
    if(layout==='truck')return `<h4>Грузовик снабжения</h4><div class="fd-grid207">${field('tank','Топливо в баке')}${field('cargo','Груз / вместимость')}${field('fuelCargo','Fuel в грузе')}${field('ammoCargo','Ammo в грузе')}${field('supportCargo','Support в грузе')}${field('mission','Задача')}${field('status','Состояние')}${field('source','Источник')}${field('destination','Назначение')}</div>${actions([['area','СНАБЖАТЬ ОБЛАСТЬ'],['group','СНАБЖАТЬ ГРУППУ'],['building','СНАБЖАТЬ ЗДАНИЕ'],['return','ВЕРНУТЬСЯ НА СКЛАД'],['auto','АВТОМАТИЧЕСКИЙ РЕЖИМ'],['manual','РУЧНОЙ ПЕРЕНОС']])}`;
    if(layout==='worker')return `<h4>Инженер · физическая логистика</h4><div class="fd-grid207">${field('cargo','Груз / вместимость')}${field('resourceCargo','Состав груза')}${field('mission','Логистическая задача')}${field('destination','Куда несёт')}</div>`;
    if(layout==='air')return `<h4>Авиационное снабжение</h4><div class="fd-grid207">${field('tank','Топливо')}${field('ammo','Боекомплект')}${field('support','Техобслуживание')}${field('airState','Состояние')}</div>`;
    if(layout==='unit')return `<h4>Тактическое снабжение</h4><div class="fd-grid207">${field('tank','Топливо')}${field('ammo','Боекомплект')}${field('support','Support')}${field('supply','Готовность')}</div>`;
    if(layout==='extractor')return `<h4 data-fd-title207>Добывающее предприятие</h4><div class="fd-grid207">${field('resourceType','Ресурс')}${field('deposit','Остаток месторождения')}${field('buffer','Локальный склад')}${field('rate','Скорость добычи')}${field('haul','Вывоз')}</div>`;
    if(layout==='node')return `<h4 data-fd-title207>Физическая логистика</h4><div class="fd-grid207">${field('fuelStock','Fuel stock')}${field('ammoStock','Ammo stock')}${field('supportStock','Support stock')}${field('transport','Транспорт')}${field('radius','Радиус снабжения')}</div><div class="fd-priority207"><button type="button" data-fd-action207="priority-down">−</button><span data-fd-field207="priority">ОБЫЧНЫЙ</span><button type="button" data-fd-action207="priority-up">+</button></div>${actions([['create-transport','СОЗДАТЬ ТРАНСПОРТ']])}`;
    return '';
  }

  function ensurePanel(){
    let panel=document.getElementById('fd-logistics-panel207');
    if(panel)return panel;
    panel=document.createElement('div');panel.id='fd-logistics-panel207';
    const parent=document.getElementById('selection-panel')||document.getElementById('hud')||document.body;
    const details=document.getElementById('selection-details');
    if(details?.parentNode===parent)parent.insertBefore(panel,details.nextSibling);else parent.appendChild(panel);
    panel.addEventListener('pointerdown',e=>{if(e.target.closest('button'))e.stopPropagation();},true);
    panel.addEventListener('click',handleAction,true);
    return panel;
  }
  function setField(panel,name,value){const el=panel.querySelector(`[data-fd-field207="${name}"]`);if(el&&el.textContent!==String(value))el.textContent=String(value);}
  function updatePanel(game){
    const panel=ensurePanel(),entity=selectedOne(game),layout=layoutFor(entity);
    if(!entity||!layout){panel.classList.remove('active');state.entityId=null;state.layout=null;return;}
    if(state.entityId!==entity.id||state.layout!==layout){panel.innerHTML=shell(layout,entity);state.entityId=entity.id;state.layout=layout;panel.classList.add('active');}
    if(layout==='truck'){
      const s=entity.logistics206||L.ensureUnit(entity,false);if(!s)return;
      setField(panel,'tank',`${amount(s.fuel)} / ${amount(s.fuelMax)} (${pct(s.fuel,s.fuelMax)})`);setField(panel,'cargo',`${amount(L.manifestTotal(s.cargo))} / ${amount(s.cargoCapacity)}`);setField(panel,'fuelCargo',amount(s.cargo?.fuel));setField(panel,'ammoCargo',amount(s.cargo?.ammo));setField(panel,'supportCargo',amount(s.cargo?.support));setField(panel,'mission',missionNames[s.missionType]||s.missionType||'—');setField(panel,'status',s.status||'—');setField(panel,'source',label(game,s.sourceNodeId));setField(panel,'destination',label(game,s.destinationNodeId||s.homeNodeId));
    }else if(layout==='worker'){
      const c=entity.workerCargo207||{fuel:0,ammo:0,support:0},h=entity.workerHaul207;setField(panel,'cargo',`${amount(L.manifestTotal(c))} / ${amount(S.WORKER_CAPACITY||450)}`);setField(panel,'resourceCargo',`Fuel ${amount(c.fuel)} · Ammo ${amount(c.ammo)} · Support ${amount(c.support)}`);setField(panel,'mission',h?`${h.phase==='load'?'загрузка':'разгрузка'} · ${h.resource==='fuel'?'Fuel':'Ammo'}`:'свободен');setField(panel,'destination',label(game,h?.destinationId||h?.sourceId));
    }else if(layout==='air'){
      const s=entity.logistics206||L.ensureUnit(entity,false);setField(panel,'tank',`${amount(s?.fuel)} / ${amount(s?.fuelMax)}`);setField(panel,'ammo',`${amount(s?.ammoReady)} / ${amount(s?.ammoReadyMax)}`);setField(panel,'support',`${amount(s?.support)} / ${amount(s?.supportMax)}`);setField(panel,'airState',entity.airServiceState||'готов');
    }else if(layout==='unit'){
      const s=entity.logistics206||L.ensureUnit(entity,false),r=L.unitReadiness(entity);setField(panel,'tank',s?.fuelMax>0?`${amount(s.fuel)} / ${amount(s.fuelMax)}`:'не требуется');setField(panel,'ammo',`${amount(s?.ammoReady)} + ${amount(s?.ammoReserve)}`);setField(panel,'support',`${amount(s?.support)} / ${amount(s?.supportMax)}`);setField(panel,'supply',`${Math.round((r?.supply||0)*100)}%`);
    }else if(layout==='extractor'){
      const ex=L.ensureExtractor(entity),node=game.getEntity?.(entity.resourceNodeId),resource=ex?.resourceType==='fuel'?'Fuel':'Железо / Ammo';const max=Number(node?.maxAmount207||node?.maxAmount)||0,current=Number(node?.amount)||0,bufferMax=Number(entity.resourceBufferMax206||entity.stats?.bufferCapacity)||0;panel.querySelector('[data-fd-title207]').textContent=entity.stats?.name||'Добывающее предприятие';setField(panel,'resourceType',resource);setField(panel,'deposit',`${amount(current)} / ${amount(max)} (${pct(current,max)})`);setField(panel,'buffer',`${amount(entity.resourceBuffer83)} / ${amount(bufferMax)}`);setField(panel,'rate',`${amount(entity.stats?.extractPerTick||0)} ед./с`);setField(panel,'haul','грузовик или инженер');
    }else if(layout==='node'){
      const n=L.ensureNode(entity),count=(game.units||[]).filter(u=>u?.alive&&L.isTruck(u)&&u.logistics206?.homeNodeId===entity.id).length;const title=panel.querySelector('[data-fd-title207]');if(title)title.textContent=nodeNames[n.nodeType]||'Физическая логистика';setField(panel,'fuelStock',`${amount(n.stock?.fuel)} / ${amount(n.stock?.fuelMax)}`);setField(panel,'ammoStock',`${amount(n.stock?.ammo)} / ${amount(n.stock?.ammoMax)}`);setField(panel,'supportStock',`${amount(n.stock?.support)} / ${amount(n.stock?.supportMax)}`);setField(panel,'transport',`${count} / ${n.transportSlots||0}`);setField(panel,'radius',amount(n.supplyRadius||0));const pending=state.pendingPriority.get(entity.id);if(pending&&n.priority===pending)state.pendingPriority.delete(entity.id);setField(panel,'priority',priorityNames[pending||n.priority]||pending||n.priority||'ОБЫЧНЫЙ');
    }
  }

  function selectedTruckIds(game){return (game?.selected||[]).filter(u=>u?.alive&&L.isTruck(u)).map(u=>u.id);}
  function beginTarget(game,mode){const ids=selectedTruckIds(game);if(!ids.length)return false;state.targetMode=mode;state.truckIds=ids;state.sourceEntityId=selectedOne(game)?.id||null;document.body.classList.add('fd-logistics-target207');game.alert?.(mode==='area'?'Укажите район снабжения':mode==='group'?'Укажите подразделение группы':'Укажите снабжаемое здание','info');return true;}
  function clearTarget(){state.targetMode=null;state.truckIds=[];state.sourceEntityId=null;document.body.classList.remove('fd-logistics-target207');}
  function changePriority(game,building,direction){const node=L.ensureNode(building);if(!node)return;const current=state.pendingPriority.get(building.id)||node.priority||'NORMAL';let index=Math.max(0,priorities.indexOf(current));index=Math.max(0,Math.min(priorities.length-1,index+direction));const next=priorities[index];state.pendingPriority.set(building.id,next);game.setSupplyPriority206?.({entityId:building.id,priority:next});updatePanel(game);}
  function handleAction(event){
    const button=event.target.closest?.('[data-fd-action207]');if(!button)return;event.preventDefault();event.stopPropagation();const game=D.game,one=selectedOne(game);if(!game||!one)return;const action=button.dataset.fdAction207;
    if(['area','group','building'].includes(action)){beginTarget(game,action);return;}
    if(action==='return'&&L.isTruck(one))game.setLogisticsMission206?.({truckIds:selectedTruckIds(game),missionType:'RETURN_TO_SOURCE'});
    else if(action==='auto'&&L.isTruck(one))game.setLogisticsMission206?.({truckIds:selectedTruckIds(game),missionType:'AUTO'});
    else if(action==='manual'&&L.isTruck(one))game.setLogisticsMission206?.({truckIds:selectedTruckIds(game),missionType:'MANUAL_TRANSFER'});
    else if(action==='create-transport'&&one.kind==='building')game.createSupplyTransport206?.({buildingId:one.id});
    else if(action==='priority-up'&&one.kind==='building')changePriority(game,one,1);
    else if(action==='priority-down'&&one.kind==='building')changePriority(game,one,-1);
    game.uiDirty=true;
  }

  function installCanvasTargeting(){const canvas=document.getElementById('game-canvas');if(!canvas||canvas.__fdLogTarget207)return false;canvas.__fdLogTarget207=true;canvas.addEventListener('pointerdown',event=>{if(!state.targetMode)return;const game=D.game;if(!game){clearTarget();return;}const rect=canvas.getBoundingClientRect(),point=game.screenToWorld?.(event.clientX-rect.left,event.clientY-rect.top);if(!point){clearTarget();return;}event.preventDefault();event.stopImmediatePropagation();const mode=state.targetMode;if(mode==='area')game.setLogisticsMission206?.({truckIds:state.truckIds,missionType:'SUPPLY_AREA',targetX:point.x,targetY:point.y,serviceRadius:680});else{const target=game.hitTestForContext?.(point.x,point.y)||game.hitTest?.(point.x,point.y,false);const first=game.getEntity?.(state.truckIds[0]);if(mode==='building'&&target?.kind==='building'&&target.team===first?.team)game.setLogisticsMission206?.({truckIds:state.truckIds,missionType:'SUPPLY_BUILDING',destinationNodeId:target.id});else if(mode==='group'&&target?.kind==='unit'&&target.team===first?.team){const groupId=target.currentCommand?.formationGroupId||target.currentCommand?.formationId||target.aiSquadId;if(groupId)game.setLogisticsMission206?.({truckIds:state.truckIds,missionType:'SUPPLY_GROUP',targetGroupId:groupId,serviceRadius:620});else game.alert?.('У подразделения нет группы/формации','warning');}}clearTarget();game.uiDirty=true;},true);return true;}
  const canvasTimer=setInterval(()=>{if(installCanvasTargeting())clearInterval(canvasTimer);},100);

  function ensureTopFuel(){let el=document.getElementById('fd-fuel-resource207');if(el)return el;const power=document.getElementById('power-value')?.closest('.resource');if(!power?.parentNode)return null;el=document.createElement('div');el.className='resource';el.id='fd-fuel-resource207';el.title='Общий физический запас топлива: склады, техника и транспорт';el.innerHTML='<span>⛽</span><span id="fd-fuel-value207">0</span>';power.parentNode.insertBefore(el,power.nextSibling);return el;}
  function updateTopFuel(game){ensureTopFuel();const value=document.getElementById('fd-fuel-value207');if(value)value.textContent=amount(L.totalPhysical(game,'player').fuel);}

  function ensureOverlay(){if(!document.getElementById('fd-logistics-toggle207')){const b=document.createElement('button');b.id='fd-logistics-toggle207';b.type='button';b.textContent='ЛОГИСТИКА';b.onclick=()=>{state.overlay=!state.overlay;b.classList.toggle('active',state.overlay);document.getElementById('fd-logistics-summary207')?.classList.toggle('active',state.overlay);};document.body.appendChild(b);}if(!document.getElementById('fd-logistics-summary207')){const p=document.createElement('div');p.id='fd-logistics-summary207';document.body.appendChild(p);}}
  function updateOverlay(game){const p=document.getElementById('fd-logistics-summary207');if(!p||!state.overlay)return;const t=L.totalPhysical(game,'player'),a=L.aggregateTeam(game,'player');p.innerHTML=`<strong>ФИЗИЧЕСКАЯ ЛОГИСТИКА</strong><span>Money: ${amount(game.teams?.player?.credits)}</span><span>Fuel: ${amount(t.fuel)}</span><span>Ammo: ${amount(t.ammo)}</span><span>Support: ${amount(t.support)}</span><span>Готовность F/A/S: ${Math.round((a.armyFuelReadiness||0)*100)} / ${Math.round((a.armyAmmoReadiness||0)*100)} / ${Math.round((a.armySupportReadiness||0)*100)}%</span>`;}
  ensureOverlay();ensureTopFuel();

  const baseSelection=Game.prototype.renderSelectionUI;
  Game.prototype.renderSelectionUI=function(...args){const result=baseSelection.apply(this,args);updatePanel(this);updateTopFuel(this);return result;};
  const baseRender=Game.prototype.render;
  if(typeof baseRender==='function')Game.prototype.render=function(...args){const result=baseRender.apply(this,args);updatePanel(this);updateTopFuel(this);updateOverlay(this);return result;};

  window.__FD_LOGISTICS_UI207__={build:207,version:'16.9.1',state,panel:()=>ensurePanel(),update:()=>D.game&&updatePanel(D.game)};
})();
