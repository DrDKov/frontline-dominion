(() => {
  'use strict';
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  const D = window.__FD_DEBUG__;
  const L = window.__FD_LOGISTICS206__;
  if (!D?.Game || !L) return;
  const Game = D.Game;
  if (Game.prototype.__fdLogisticsUI206Installed) return;
  Object.defineProperty(Game.prototype, '__fdLogisticsUI206Installed', { value: true, configurable: true });

  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  })[ch]);
  const pct = (value, max) => max > 0 ? `${Math.round(Math.max(0, value) / max * 100)}%` : '—';
  const amount = value => Math.round(Number(value) || 0).toLocaleString('ru-RU');
  const missionNames = {
    AUTO:'Автоматический режим', EXTRACT_RESOURCE:'Вывоз добычи', SUPPLY_BUILDING:'Снабжение здания',
    SUPPLY_AREA:'Снабжение области', SUPPLY_GROUP:'Снабжение группы', MANUAL_TRANSFER:'Ручная перевозка',
    RETURN_TO_SOURCE:'Возврат на склад'
  };
  const priorityNames = { LOW:'НИЗКИЙ', NORMAL:'ОБЫЧНЫЙ', HIGH:'ВЫСОКИЙ', CRITICAL:'КРИТИЧЕСКИЙ' };
  const nodeNames = {
    central:'Центральный логистический узел', warehouse:'Склад', pmto:'ПМТО', terminal:'Логистический терминал',
    trade:'Товарная биржа', airfield:'Аэродром', production:'Производственный объект', barracks:'Казармы',
    repair:'Ремонтная база', defense:'Ракетный/оборонный узел'
  };
  const importNames = { OFF:'ВЫКЛ', MAINTAIN_STOCK:'ПОДДЕРЖИВАТЬ ЗАПАС', FIXED_ORDER:'ФИКСИРОВАННЫЙ ЗАКАЗ', EMERGENCY_PURCHASE:'ЭКСТРЕННО' };

  const uiState = { overlay:false, targetMode:null, truckIds:[], sourceEntityId:null };

  const style = document.createElement('style');
  style.id = 'fd-logistics-ui206-style';
  style.textContent = `
    .fd-logistics206{grid-column:1/-1;display:grid;gap:6px;margin-top:7px;padding:8px;border:1px solid rgba(103,193,151,.30);border-radius:7px;background:rgba(4,16,12,.66)}
    .fd-logistics206 h4{margin:0;color:#cce9d7;font:900 10px/1.2 system-ui;letter-spacing:.09em;text-transform:uppercase}
    .fd-logistics206 .fd-grid206{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 10px}.fd-logistics206 .fd-line206{display:flex;justify-content:space-between;gap:8px;color:#92aa9e;font:700 9px/1.35 system-ui}.fd-logistics206 .fd-line206 strong{color:#e1eee7;text-align:right;font-variant-numeric:tabular-nums}.fd-logistics206 .low strong{color:#f1c47d}.fd-logistics206 .critical strong{color:#f19282}
    .fd-logistics-actions206{grid-column:1/-1;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px;margin-top:5px}.fd-logistics-actions206 button{min-height:31px;padding:4px 7px;border:1px solid rgba(110,194,151,.35);border-radius:5px;background:rgba(35,86,61,.20);color:#dbeae1;font:800 8px/1.15 system-ui;letter-spacing:.035em;cursor:pointer}.fd-logistics-actions206 button:hover{border-color:rgba(139,231,183,.75);background:rgba(48,115,79,.30)}
    #fd-logistics-toggle206{position:fixed;z-index:83;right:14px;top:72px;min-height:36px;padding:0 12px;border:1px solid rgba(112,202,158,.48);border-radius:5px;background:rgba(5,20,14,.88);color:#cae7d7;font:900 9px/1 system-ui;letter-spacing:.09em;cursor:pointer;backdrop-filter:blur(7px)}#fd-logistics-toggle206.active{background:rgba(47,111,77,.9);color:#fff}
    #fd-logistics-summary206{position:fixed;z-index:82;right:14px;top:114px;display:none;width:245px;padding:9px;border:1px solid rgba(112,202,158,.33);border-radius:7px;background:rgba(4,14,10,.88);color:#dcebe3;font:700 9px/1.4 system-ui;pointer-events:none;backdrop-filter:blur(8px)}#fd-logistics-summary206.active{display:grid;gap:4px}#fd-logistics-summary206 strong{font-variant-numeric:tabular-nums}
    body.fd-logistics-target206 #game-canvas{cursor:crosshair!important}body.fd-logistics-target206 #fd-logistics-summary206{display:grid}
  `;
  document.head.appendChild(style);

  function selectedOne(game) { return game?.selected?.length === 1 ? game.selected[0] : null; }
  function entityLabel(game, id) {
    const entity = id ? game.getEntity?.(id) : null;
    return entity?.stats?.name || entity?.stats?.canonicalName || entity?.typeId || (id ? `#${id}` : '—');
  }
  function thresholdClass(node, key) {
    if (!node?.stock || !node?.thresholds) return '';
    const value = Number(node.stock[key]) || 0;
    if (value <= Number(node.thresholds.critical?.[key] || 0)) return 'critical';
    if (value <= Number(node.thresholds.low?.[key] || 0)) return 'low';
    return '';
  }
  function line(label, value, cls='') { return `<div class="fd-line206 ${cls}"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`; }

  function groundUnitPanel(game, unit) {
    const s = unit.logistics206 || L.ensureUnit(unit, false);
    if (!s || L.isAir(unit) || L.isTruck(unit)) return '';
    const readiness = L.unitReadiness(unit);
    const rows = [];
    if (s.fuelMax > 0) rows.push(line('Fuel', `${pct(s.fuel,s.fuelMax)} · ${s.fuelState206 || game.fuelState206?.(unit) || 'NORMAL'}`, s.fuel/s.fuelMax <= .1 ? 'critical' : s.fuel/s.fuelMax <= .25 ? 'low' : ''));
    if (s.ammoReadyMax > 0) {
      rows.push(line('Ammo reserve', `${amount(s.ammoReserve)} / ${amount(s.ammoReserveMax)}`, s.ammoReserve <= s.ammoReserveMax*.15 ? 'critical' : s.ammoReserve <= s.ammoReserveMax*.35 ? 'low' : ''));
      rows.push(line('Magazine', `${amount(s.ammoReady)} / ${amount(s.ammoReadyMax)}`));
    }
    if (s.supportMax > 0) rows.push(line('Support', pct(s.support,s.supportMax), s.support <= s.supportMax*.2 ? 'critical' : s.support <= s.supportMax*.4 ? 'low' : ''));
    rows.push(line('Supply', readiness.supply > .28 ? 'AVAILABLE' : 'OUT OF SUPPLY', readiness.supply <= .28 ? 'critical' : ''));
    rows.push(line('Current source', entityLabel(game, s.resupplySourceId)));
    if (s.resupplySourceId) rows.push(line('Resupply progress', `${Math.round((Number(s.resupplyProgress)||0)*100)}%`));
    return `<div class="fd-logistics206" data-logistics206><h4>Тактическое снабжение</h4><div class="fd-grid206">${rows.join('')}</div></div>`;
  }

  function truckPanel(game, truck) {
    const s = truck.logistics206 || L.ensureUnit(truck, false);
    if (!s) return '';
    const rows = [
      line('Fuel cargo', amount(s.cargo?.fuel)), line('Ammo cargo', amount(s.cargo?.ammo)),
      line('Support cargo', amount(s.cargo?.support)), line('Capacity', `${amount(L.manifestTotal(s.cargo))} / ${amount(s.cargoCapacity)}`),
      line('Mission', missionNames[s.missionType] || s.missionType || '—'), line('Status', s.status || '—'),
      line('Source', entityLabel(game,s.sourceNodeId)), line('Destination', entityLabel(game,s.destinationNodeId || s.homeNodeId)),
      line('Route risk', `${Math.round((Number(s.routeRisk)||0)*100)}%`, Number(s.routeRisk)>.7?'critical':Number(s.routeRisk)>.35?'low':''),
      line('Supply radius', amount(s.supplyRadius || 0)),
    ];
    return `<div class="fd-logistics206" data-logistics206><h4>Грузовик снабжения</h4><div class="fd-grid206">${rows.join('')}</div><div class="fd-logistics-actions206">
      <button data-fd-log-action206="area">СНАБЖАТЬ ОБЛАСТЬ</button><button data-fd-log-action206="group">СНАБЖАТЬ ГРУППУ</button>
      <button data-fd-log-action206="building">СНАБЖАТЬ ЗДАНИЕ</button><button data-fd-log-action206="return">ВЕРНУТЬСЯ НА СКЛАД</button>
      <button data-fd-log-action206="auto">АВТОМАТИЧЕСКИЙ РЕЖИМ</button><button data-fd-log-action206="manual">РУЧНОЙ ПЕРЕНОС</button>
    </div></div>`;
  }

  function nodePanel(game, building) {
    const node = building.logistics206 || L.ensureNode(building);
    if (!node) return '';
    const stocks = ['fuel','ammo','support'].map(key => line(
      key === 'fuel' ? 'Fuel stock' : key === 'ammo' ? 'Ammo stock' : 'Support stock',
      `${amount(node.stock?.[key])} / ${amount(node.stock?.[`${key}Max`])}`,
      thresholdClass(node,key)
    )).join('');
    const transportCount = (game.units||[]).filter(u=>u?.alive&&L.isTruck(u)&&u.logistics206?.homeNodeId===building.id).length;
    let extra = line('Узел', nodeNames[node.nodeType] || node.nodeType || '—') +
      line('Priority', priorityNames[node.priority] || node.priority || 'NORMAL') +
      line('Transport', `${transportCount} / ${node.transportSlots || 0}`) +
      line('Supply radius', amount(node.supplyRadius || 0));

    if (node.nodeType === 'airfield') {
      const a = game.getAirfieldAircraftState93?.(building) || { ready:[], service:[], away:[], assigned:[] };
      extra += line('Aircraft', `Ready ${a.ready?.length||0} · Service ${a.service?.length||0} · Away ${a.away?.length||0} · ${(a.assigned?.length||0)}/12`);
      const sortieFuel = Math.max(1,(a.assigned?.length||1)*320), sortieAmmo=Math.max(1,(a.assigned?.length||1)*8);
      extra += line('Sortie endurance', `${Math.floor(Math.min((node.stock?.fuel||0)/sortieFuel,(node.stock?.ammo||0)/sortieAmmo))} полных волн`);
    }
    if (node.nodeType === 'pmto') {
      const local = (game.units||[]).filter(u=>u?.alive&&u.team===building.team&&!L.isAir(u)&&!L.isTruck(u)&&Math.hypot(u.x-building.x,u.y-building.y)<=node.supplyRadius).length;
      extra += line('Units served area', amount(local));
    }
    if (node.nodeType === 'trade') {
      const trade = node.trade || game.ensureTradeState206?.(building) || {};
      extra += line('Import Fuel', `${importNames[trade.fuel?.mode]||'ВЫКЛ'} · ${amount(trade.fuel?.currentPrice)} ₽/ед.`);
      extra += line('Import Ammo', `${importNames[trade.ammo?.mode]||'ВЫКЛ'} · ${amount(trade.ammo?.currentPrice)} ₽/ед.`);
      extra += line('Import buffer', `F ${amount(node.importBuffer?.fuel)} · A ${amount(node.importBuffer?.ammo)}`);
      const next = Math.max(0, Math.ceil(Math.min(trade.fuel?.nextExecution ?? Infinity, trade.ammo?.nextExecution ?? Infinity) - game.time));
      extra += line('Next contract', Number.isFinite(next) ? `${next} с` : '—');
    }
    const tradeActions = node.nodeType === 'trade' ? `
      <button data-fd-log-action206="trade-fuel">AUTO IMPORT FUEL</button><button data-fd-log-action206="trade-ammo">AUTO IMPORT AMMO</button>
      <button data-fd-log-action206="emergency-fuel">EMERGENCY FUEL</button><button data-fd-log-action206="emergency-ammo">EMERGENCY AMMO</button>
      <button data-fd-log-action206="trade-destination">НАЗНАЧИТЬ СКЛАД</button>` : '';
    return `<div class="fd-logistics206" data-logistics206><h4>${esc(nodeNames[node.nodeType] || 'Физическая логистика')}</h4><div class="fd-grid206">${stocks}${extra}</div><div class="fd-logistics-actions206">
      <button data-fd-log-action206="create-transport">СОЗДАТЬ ТРАНСПОРТ</button><button data-fd-log-action206="priority">ПРИОРИТЕТ: ${esc(priorityNames[node.priority]||node.priority)}</button>${tradeActions}
    </div></div>`;
  }

  const baseSelection = Game.prototype.renderSelectionUI;
  Game.prototype.renderSelectionUI = function(...args) {
    const result = baseSelection.apply(this,args);
    const details = document.getElementById('selection-details');
    if (!details) return result;
    details.querySelectorAll('[data-logistics206]').forEach(el=>el.remove());
    const entity = selectedOne(this);
    if (!entity?.alive) return result;
    let html = '';
    if (entity.kind === 'unit') html = L.isTruck(entity) ? truckPanel(this,entity) : groundUnitPanel(this,entity);
    else if (entity.kind === 'building') html = nodePanel(this,entity);
    if (html) details.insertAdjacentHTML('beforeend',html);
    return result;
  };

  function selectedTruckIds(game) { return (game?.selected||[]).filter(u=>u?.alive&&L.isTruck(u)).map(u=>u.id); }
  function beginTarget(game, mode) {
    const ids = selectedTruckIds(game);
    if (!ids.length && mode !== 'trade-destination') return false;
    uiState.targetMode = mode;
    uiState.truckIds = ids;
    uiState.sourceEntityId = selectedOne(game)?.id || null;
    document.body.classList.add('fd-logistics-target206');
    game.alert?.(mode==='area'?'Укажите район снабжения':mode==='group'?'Укажите подразделение группы':mode==='building'?'Укажите снабжаемое здание':'Укажите склад назначения','info');
    return true;
  }
  function clearTarget(){uiState.targetMode=null;uiState.truckIds=[];uiState.sourceEntityId=null;document.body.classList.remove('fd-logistics-target206');}

  function cyclePriority(current){const order=['LOW','NORMAL','HIGH','CRITICAL'];return order[(Math.max(0,order.indexOf(current))+1)%order.length];}
  function toggleTrade(game,building,resource){const trade=game.ensureTradeState206?.(building);if(!trade?.[resource])return;const next=trade[resource].mode==='MAINTAIN_STOCK'?'OFF':'MAINTAIN_STOCK';game.configureTradeContract206?.({buildingId:building.id,resource,mode:next,targetAmount:trade[resource].targetAmount});}

  document.addEventListener('click', event => {
    const button = event.target?.closest?.('[data-fd-log-action206]');
    if (!button) return;
    const game = D.game; const one = selectedOne(game); if(!game||!one)return;
    const action=button.dataset.fdLogAction206;
    if(['area','group','building','trade-destination'].includes(action)){beginTarget(game,action);return;}
    if(action==='return'&&L.isTruck(one)) game.setLogisticsMission206?.({truckIds:selectedTruckIds(game),missionType:'RETURN_TO_SOURCE'});
    else if(action==='auto'&&L.isTruck(one)) game.setLogisticsMission206?.({truckIds:selectedTruckIds(game),missionType:'AUTO'});
    else if(action==='manual'&&L.isTruck(one)) game.setLogisticsMission206?.({truckIds:selectedTruckIds(game),missionType:'MANUAL_TRANSFER'});
    else if(action==='create-transport'&&one.kind==='building') game.createSupplyTransport206?.({buildingId:one.id});
    else if(action==='priority'&&one.kind==='building') game.setSupplyPriority206?.({entityId:one.id,priority:cyclePriority(one.logistics206?.priority||'NORMAL')});
    else if(action==='trade-fuel') toggleTrade(game,one,'fuel');
    else if(action==='trade-ammo') toggleTrade(game,one,'ammo');
    else if(action==='emergency-fuel') game.emergencyPurchase206?.({buildingId:one.id,resource:'fuel',amount:2500});
    else if(action==='emergency-ammo') game.emergencyPurchase206?.({buildingId:one.id,resource:'ammo',amount:1600});
    game.uiDirty=true;
  }, true);

  function installCanvasTargeting(){
    const canvas=document.getElementById('game-canvas');if(!canvas||canvas.__fdLogTarget206)return false;canvas.__fdLogTarget206=true;
    canvas.addEventListener('pointerdown',event=>{
      if(!uiState.targetMode)return;
      const game=D.game;if(!game){clearTarget();return;}
      const rect=canvas.getBoundingClientRect();const sx=event.clientX-rect.left,sy=event.clientY-rect.top;
      const point=game.screenToWorld?.(sx,sy);if(!point){clearTarget();return;}
      event.preventDefault();event.stopImmediatePropagation();
      const mode=uiState.targetMode;
      if(mode==='area')game.setLogisticsMission206?.({truckIds:uiState.truckIds,missionType:'SUPPLY_AREA',targetX:point.x,targetY:point.y,serviceRadius:680});
      else {
        const target=game.hitTestForContext?.(point.x,point.y)||game.hitTest?.(point.x,point.y,false);
        if(mode==='building'&&target?.kind==='building'&&target.team===selectedOne(game)?.team)game.setLogisticsMission206?.({truckIds:uiState.truckIds,missionType:'SUPPLY_BUILDING',destinationNodeId:target.id});
        else if(mode==='group'&&target?.kind==='unit'&&target.team===selectedOne(game)?.team){const groupId=target.currentCommand?.formationGroupId||target.currentCommand?.formationId||target.aiSquadId;if(groupId)game.setLogisticsMission206?.({truckIds:uiState.truckIds,missionType:'SUPPLY_GROUP',targetGroupId:groupId,serviceRadius:620});else game.alert?.('У выбранного подразделения нет группы/формации','warning');}
        else if(mode==='trade-destination'){const source=game.getEntity?.(uiState.sourceEntityId);if(source&&target?.kind==='building'&&target.team===source.team&&L.ensureNode(target)){for(const resource of ['fuel','ammo'])game.configureTradeContract206?.({buildingId:source.id,resource,destinationNodeId:target.id});}}
      }
      clearTarget();game.uiDirty=true;
    },true);return true;
  }
  const canvasTimer=setInterval(()=>{if(installCanvasTargeting())clearInterval(canvasTimer);},100);

  function ensureOverlayControls(){
    if(!document.getElementById('fd-logistics-toggle206')){const b=document.createElement('button');b.id='fd-logistics-toggle206';b.type='button';b.textContent='ЛОГИСТИКА';b.addEventListener('click',()=>{uiState.overlay=!uiState.overlay;b.classList.toggle('active',uiState.overlay);document.getElementById('fd-logistics-summary206')?.classList.toggle('active',uiState.overlay);D.game?.render?.();});document.body.appendChild(b);}
    if(!document.getElementById('fd-logistics-summary206')){const p=document.createElement('div');p.id='fd-logistics-summary206';document.body.appendChild(p);}
  }
  ensureOverlayControls();

  function updateSummary(game){const panel=document.getElementById('fd-logistics-summary206');if(!panel||!uiState.overlay)return;const total=L.totalPhysical(game,'player'),money=Number(game.teams?.player?.credits)||0;const agg=L.aggregateTeam(game,'player');panel.innerHTML=`<strong>ФИЗИЧЕСКАЯ ЛОГИСТИКА</strong><span>Money: ${amount(money)}</span><span>Fuel: ${amount(total.fuel)}</span><span>Ammo: ${amount(total.ammo)}</span><span>Support: ${amount(total.support)}</span><span>Readiness F/A/S: ${Math.round(agg.armyFuelReadiness*100)} / ${Math.round(agg.armyAmmoReadiness*100)} / ${Math.round(agg.armySupportReadiness*100)}%</span>`;}

  const canvas=document.getElementById('game-canvas');const ctx=canvas?.getContext?.('2d')||null;
  function drawOverlay206(game){if(!uiState.overlay||!ctx)return;updateSummary(game);const dpr=game.viewport?.dpr||window.devicePixelRatio||1;ctx.save();ctx.setTransform(dpr,0,0,dpr,0,0);
    const nodes=(game.buildings||[]).filter(b=>b?.alive&&b.team==='player'&&b.logistics206?.stock);
    for(const b of nodes){const n=b.logistics206,c=game.worldToScreen?.(b.x,b.y,0);if(!c)continue;const edge=game.worldToScreen?.(b.x+(n.supplyRadius||0),b.y,0);const rx=edge?Math.max(8,Math.abs(edge.x-c.x)):18;ctx.beginPath();ctx.ellipse(c.x,c.y,rx,Math.max(6,rx*.55),0,0,Math.PI*2);ctx.strokeStyle=n.priority==='CRITICAL'?'rgba(255,140,116,.76)':n.priority==='HIGH'?'rgba(241,196,125,.68)':'rgba(118,220,166,.46)';ctx.lineWidth=1.2;ctx.stroke();ctx.fillStyle='rgba(207,240,222,.88)';ctx.font='800 9px system-ui';ctx.fillText(`${nodeNames[n.nodeType]||n.nodeType} · F${Math.round(L.stockRatio(n.stock,'fuel')*100)} A${Math.round(L.stockRatio(n.stock,'ammo')*100)}`,c.x+7,c.y-8);}
    for(const truck of (game.units||[]).filter(u=>u?.alive&&u.team==='player'&&L.isTruck(u))){const s=truck.logistics206;if(!s)continue;const a=game.worldToScreen?.(truck.x,truck.y,0);const dest=game.getEntity?.(s.destinationNodeId||s.sourceNodeId);const b=dest&&game.worldToScreen?.(dest.x,dest.y,0);if(a&&b){ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.strokeStyle=Number(s.routeRisk)>.7?'rgba(241,116,101,.80)':Number(s.routeRisk)>.35?'rgba(235,189,101,.72)':'rgba(105,206,157,.58)';ctx.lineWidth=Math.max(1,Math.min(4,L.manifestTotal(s.cargo)/1800));ctx.stroke();}}
    ctx.restore();}
  const baseRender=Game.prototype.render;
  if(typeof baseRender==='function')Game.prototype.render=function(...args){const result=baseRender.apply(this,args);drawOverlay206(this);return result;};

  window.__FD_LOGISTICS_UI206__={version:'20.6',state:uiState,toggle(){document.getElementById('fd-logistics-toggle206')?.click();}};
})();
