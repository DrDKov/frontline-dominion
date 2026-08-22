from pathlib import Path

WORKER = Path('dist/authoritative-simulation-worker-v174.js')
if not WORKER.exists():
    raise RuntimeError('build 208 transport diagnostic Worker missing')
text = WORKER.read_text('utf-8')
old = "  const debug208 = event.action === 'logisticsMission' ? (() => { const ids=(payload.truckIds||payload.unitIds||[payload.truckId]).filter(Boolean); return { payload:plainClone(payload), trucks:ids.map(id=>{const unit=game.getEntity?.(id),s=unit?.logistics206;return {id:String(id),alive:Boolean(unit?.alive),team:unit?.team||null,missionType:s?.missionType||null,targetGroupId:s?.targetGroupId||null,phase206:s?.phase206||null,status:s?.status||null};}) }; })() : null;"
new = "  const debug208 = event.action === 'logisticsMission' ? (() => { const ids=(payload.truckIds||payload.unitIds||[payload.truckId]).filter(Boolean); return { payload:plainClone(payload), trucks:ids.map(id=>{const unit=game.getEntity?.(id),s=unit?.logistics206;return {id:String(id),alive:Boolean(unit?.alive),team:unit?.team||null,missionType:s?.missionType||null,targetGroupId:s?.targetGroupId||null,phase206:s?.phase206||null,status:s?.status||null};}) }; })() : event.action === 'logisticsCreateTransport' ? (() => { const id=payload.buildingId||payload.homeNodeId;const building=game.getEntity?.(id),node=self.__FD_LOGISTICS206__?.ensureNode?.(building),pkg=game.productionMaterialPackage206?.(building,'resourceTruck')||null;return {payload:plainClone(payload),building:{id:String(id||''),alive:Boolean(building?.alive),completed:Boolean(building?.completed),construction:Number(building?.construction),queue:(building?.queue||[]).map(item=>({id:item.id,kind:item.kind,remaining:Number(item.remaining),total:Number(item.total)})),stock:node?.stock?plainClone(node.stock):null,package:pkg?plainClone(pkg):null,blocked:Boolean(node?.productionBlocked206||building?.logistics206?.productionBlocked206),priority:node?.priority||null,powerFactor:Number(game.teams?.[building?.team]?.powerFactor||0),pending:[...(building?._fdPendingTruckHome206||[])]}}; })() : null;"
if text.count(old) != 1:
    raise RuntimeError(f'build 208 transport ACK diagnostic anchor count={text.count(old)}')
WORKER.write_text(text.replace(old, new, 1), 'utf-8')
print('Build 208 transport ACK diagnostics installed')
