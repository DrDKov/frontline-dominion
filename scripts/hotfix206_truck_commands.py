from pathlib import Path

path = Path('dist/supply-transport-v206.js')
if not path.exists():
    raise RuntimeError('build 206 supply transport runtime missing')
text = path.read_text('utf-8')

old = "      truck.commandQueue=[{type:'logistics206',missionType:mission}];truck.invalidateNavigation?.();changed+=1;\n"
new = "      const command206={type:'logistics206',missionType:mission};\n      if(typeof truck.setCommand==='function')truck.setCommand(command206,false);\n      else{truck.commandQueue=[command206];try{truck.currentCommand=command206;}catch(_){}}\n      truck.invalidateNavigation?.();changed+=1;\n"
if text.count(old) != 1:
    raise RuntimeError(f'build 206 mission command anchor count={text.count(old)}')
text = text.replace(old, new, 1)

old_spawn = "s.homeNodeId=homeId;s.missionType='SUPPLY_BUILDING';s.destinationNodeId=homeId;s.phase206='PLAN';spawned.commandQueue=[{type:'logistics206',missionType:'SUPPLY_BUILDING'}];}"
new_spawn = "s.homeNodeId=homeId;s.missionType='SUPPLY_BUILDING';s.destinationNodeId=homeId;s.phase206='PLAN';const command206={type:'logistics206',missionType:'SUPPLY_BUILDING'};if(typeof spawned.setCommand==='function')spawned.setCommand(command206,false);else{spawned.commandQueue=[command206];try{spawned.currentCommand=command206;}catch(_){}}}"
if text.count(old_spawn) != 1:
    raise RuntimeError(f'build 206 spawned truck command anchor count={text.count(old_spawn)}')
text = text.replace(old_spawn, new_spawn, 1)

legacy_compat = r'''

(() => {
  'use strict';
  const root = typeof window !== 'undefined' ? window : self;
  const D = root.__FD_DEBUG__;
  const L = root.__FD_LOGISTICS206__;
  const Unit = D?.Unit;
  if (!Unit?.prototype || !L || Unit.prototype.__fdLegacyHarvest206Migrated) return;
  Object.defineProperty(Unit.prototype, '__fdLegacyHarvest206Migrated', { value: true, configurable: true });

  const sourceFor206 = (unit, command) => {
    let source = unit.game?.getEntity?.(command?.resourceId || command?.sourceNodeId || command?.sourceId);
    if (source?.kind === 'resource') source = unit.game?.getEntity?.(source.extractorBuildingId) || null;
    return source?.alive ? source : null;
  };

  const restoreWorkerCargo206 = (unit, source, amount) => {
    let left = Math.max(0, Number(amount) || 0);
    if (left <= 1e-6) return 0;
    if (source?.kind === 'building' && source.stats?.logisticsExtractor) {
      const max = Math.max(0, Number(source.resourceBufferMax206 || source.stats?.bufferCapacity || 0));
      const current = Math.max(0, Number(source.resourceBuffer83) || 0);
      const room = Math.max(0, max - current);
      const returned = Math.min(left, room);
      source.resourceBuffer83 = L.round(current + returned);
      left -= returned;
    }
    if (left > 1e-6) {
      const state = L.ensureGame(unit.game);
      state.telemetry.legacyCargoLost206 = L.round(Number(state.telemetry.legacyCargoLost206 || 0) + left);
    }
    return left;
  };

  Unit.prototype.processHarvest = function migrateLegacyHarvest206(command, _dt) {
    const source = sourceFor206(this, command);
    const legacyCargo = Math.max(0, Number(this.cargo) || 0);
    const isTruck = this.typeId === 'resourceTruck' || this.stats?.resourceHauler;

    if (!isTruck) {
      // Build 206 forbids workers/infantry from physically hauling strategic
      // resources. Existing pre-206 worker cargo is returned to its extractor
      // where possible; it is never converted to Money.
      restoreWorkerCargo206(this, source, legacyCargo);
      this.cargo = 0;
      this.finishCommand?.();
      return false;
    }

    const state = L.ensureUnit(this, false);
    if (!state) { this.finishCommand?.(); return false; }
    if (legacyCargo > 1e-6) {
      const key = L.extractorResourceType(source) || 'ammo';
      const carried = L.manifestTotal(state.cargo);
      const room = Math.max(0, Number(state.cargoCapacity) - carried);
      const moved = Math.min(legacyCargo, room);
      state.cargo[key] = L.round(Number(state.cargo[key] || 0) + moved);
      this.cargo = L.round(legacyCargo - moved);
      if (this.cargo > 1e-6) {
        const gameState = L.ensureGame(this.game);
        gameState.telemetry.legacyCargoLost206 = L.round(Number(gameState.telemetry.legacyCargoLost206 || 0) + this.cargo);
        this.cargo = 0;
      }
    } else this.cargo = 0;

    state.missionType = 'EXTRACT_RESOURCE';
    state.sourceNodeId = source?.id || state.sourceNodeId || null;
    state.phase206 = 'PLAN';
    state.status = 'MIGRATED_LEGACY_HARVEST';
    const next = { type: 'logistics206', missionType: 'EXTRACT_RESOURCE' };
    if (typeof this.setCommand === 'function') this.setCommand(next, false);
    else { this.commandQueue = [next]; try { this.currentCommand = next; } catch (_) {} }
    this.invalidateNavigation?.();
    return true;
  };
})();
'''
if '__fdLegacyHarvest206Migrated' not in text:
    text += legacy_compat
path.write_text(text, 'utf-8')

core_path = Path('dist/logistics-core-v206.js')
if not core_path.exists():
    raise RuntimeError('build 206 logistics core missing')
core = core_path.read_text('utf-8')
trade_anchor = "    logisticsCommercialTerminal: 'terminal', financialTradeCenter: 'trade', commodityExchange: 'trade',\n"
trade_replacement = "    logisticsCommercialTerminal: 'terminal', financialTradeCenter: 'trade', commodityExchange: 'trade', creditExchange: 'trade',\n"
if "creditExchange: 'trade'" not in core:
    if core.count(trade_anchor) != 1:
        raise RuntimeError(f'build 206 legacy trade-node anchor count={core.count(trade_anchor)}')
    core = core.replace(trade_anchor, trade_replacement, 1)
core_path.write_text(core, 'utf-8')

economy_path = Path('dist/resource-economy-v206.js')
if not economy_path.exists():
    raise RuntimeError('build 206 resource economy missing')
economy = economy_path.read_text('utf-8')
import_anchor = "    for (const building of (game.buildings || []).filter(b => b?.alive && b.completed && b.typeId === 'financialTradeCenter')) {\n"
import_replacement = "    for (const building of (game.buildings || []).filter(b => b?.alive && b.completed && L.ensureNode(b)?.nodeType === 'trade')) {\n"
if import_replacement not in economy:
    if economy.count(import_anchor) != 1:
        raise RuntimeError(f'build 206 trade import-cycle anchor count={economy.count(import_anchor)}')
    economy = economy.replace(import_anchor, import_replacement, 1)

income_anchor = "        ['financialCenter','financialTradeCenter','industrialCommercialCenter','logisticsCommercialTerminal'].includes(b.typeId));\n"
income_replacement = "        ['financialCenter','financialTradeCenter','creditExchange','commodityExchange','industrialCommercialCenter','logisticsCommercialTerminal'].includes(b.typeId));\n"
if income_replacement not in economy:
    if economy.count(income_anchor) != 1:
        raise RuntimeError(f'build 206 legacy financial-center anchor count={economy.count(income_anchor)}')
    economy = economy.replace(income_anchor, income_replacement, 1)
economy_path.write_text(economy, 'utf-8')

print('Build 206 truck missions use Unit.setCommand; legacy harvest-to-credits is migrated and legacy exchanges are physical trade nodes')
