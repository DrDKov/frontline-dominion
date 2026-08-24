'use strict';
/* Frontline Dominion v16.4 — authoritative hierarchical mass-simulation Worker. */
importScripts('/frontline-dominion/authoritative-simulation-shim-v172.js?build=213');
importScripts('/frontline-dominion/authoritative-simulation-bundle-v172.js?build=213');
importScripts('/frontline-dominion/gameplay-reliability-v199.js?build=213');
importScripts('/frontline-dominion/engineer-rocket-parity-v191.js?build=213');
importScripts('/frontline-dominion/extractor-placement-v190.js?build=213');
importScripts('/frontline-dominion/mass-simulation-core-v163.js?build=213');
importScripts('/frontline-dominion/hierarchical-army-v164.js?build=213');
importScripts('/frontline-dominion/fire-discipline-v177.js?build=213');
importScripts('/frontline-dominion/combat-scale-core-v166.js?build=213');
importScripts('/frontline-dominion/deep-operations-ai-v182.js?build=213');
importScripts('/frontline-dominion/formation-march-core-v183.js?build=213');
importScripts('/frontline-dominion/formation-obstacle-recovery-v196.js?build=213');
importScripts('/frontline-dominion/formation-target-fidelity-v197.js?build=213');
importScripts('/frontline-dominion/fortress-defense-ai-v183.js?build=213');
importScripts('/frontline-dominion/action-group-core-v184.js?build=213');
importScripts('/frontline-dominion/construction-victory-v184.js?build=213');
importScripts('/frontline-dominion/simulation-resilience-v200.js?build=213');
importScripts('/frontline-dominion/group-movement-v201.js?build=213');
importScripts('/frontline-dominion/command-power-authority-v202.js?build=213');
importScripts('/frontline-dominion/recon-memory-production-v203.js?build=213');
importScripts('/frontline-dominion/logistics-core-v206.js?build=213');
importScripts('/frontline-dominion/economic-buildings-v206.js?build=213');
importScripts('/frontline-dominion/resource-economy-v206.js?build=213');
importScripts('/frontline-dominion/supply-transport-v206.js?build=213');
importScripts('/frontline-dominion/unit-sustainment-v206.js?build=213');
importScripts('/frontline-dominion/air-logistics-v206.js?build=213');
importScripts('/frontline-dominion/production-logistics-v206.js?build=213');
importScripts('/frontline-dominion/authoritative-logistics-v206.js?build=213');
importScripts('/frontline-dominion/ai-logistics-v206.js?build=213');
importScripts('/frontline-dominion/resync-continuity-v206.js?build=213');
importScripts('/frontline-dominion/friendly-extractor-visibility-v213.js?build=213');

const D = self.__FD_DEBUG__;
if (!D?.Game || !D?.Unit || !D?.Building || !D?.ResourceNode || !D?.Projectile) {
  throw new Error('Authoritative engine bundle did not expose the game classes');
}

const BUILD = 213;
const VERSION = '16.9.7';
const SIM_HZ = 25;
const SIM_DT = 1 / SIM_HZ;
const UNIT_FLOAT_STRIDE = 22;
const UNIT_INT_STRIDE = 8;
const BUILDING_FLOAT_STRIDE = 13;
const BUILDING_INT_STRIDE = 5;
const RESOURCE_FLOAT_STRIDE = 5;
const PROJECTILE_FLOAT_STRIDE = 13;
const PROJECTILE_INT_STRIDE = 6;
const COMMAND_CODES = Object.freeze({
  '': 0, move: 1, attack: 2, attackMove: 3, patrol: 4, hold: 5, harvest: 6,
  repair: 7, heal: 8, build: 9, capture: 10, infiltrate: 11, infiltrateBuilding: 12,
  guard: 13, formation: 14, airHangar93: 15, airService: 16, returnToAirfield: 17,
  loadTransport: 18, unloadTransport: 19, mineField: 20, returnPost132: 21, logistics206: 22
});
const TEAM_CODES = Object.freeze({ neutral: 0, player: 1, enemy: 2 });
const SERVICE_CODES = Object.freeze({ '': 0, approach: 1, landing: 2, servicing: 3, launch: 4, hangar: 5, ready: 6 });


// Build 206 deterministic authoritative unit simulation cadence.
// Network physics may not depend on local camera/render visibility. Any unit
// executing a command advances at full fixed-tick rate; inactive cohorts keep
// deterministic simulation LOD for large-army scalability.
const baseUnitSimLod206 = D.Game.prototype.unitSimLodV9;
if (typeof baseUnitSimLod206 === 'function') {
  D.Game.prototype.unitSimLodV9 = function deterministicNetworkLod206(unit) {
    if (!multiplayer.active) return baseUnitSimLod206.call(this, unit);
    if (!unit?.alive || unit.embarkedIn) return 3;
    const command = unit.currentCommand;
    const recentDamage = this.time - (unit.lastDamagedAt || -999) < 2.2;
    const recentShot = this.time - (unit.lastShotAt || -999) < 1.0;
    const hasCombatTarget = Boolean(
      unit.weaponTargetId || command?.combatTargetId || command?.engagedTargetId ||
      (command?.type === 'attack' && command?.targetId)
    );
    if (recentDamage || recentShot || hasCombatTarget || command) return 0;
    if (unit.aiSquadId || unit.air) return 2;
    return 3;
  };
  Object.defineProperty(D.Game.prototype.unitSimLodV9, '__fdDeterministicNetworkLod206', { value: true });
}


// Multiplayer physics must not depend on asynchronous model-manifest timing.
// Freeze every unit collision/model footprint from the assembled build manifest
// synchronously before the first authoritative simulation tick.
const deterministicUnitGeometry206 = {"aa":{"modelBoundsMeters":[8.5,3.9,4.55],"modelCode":"C-U08","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":3.91,"maxY":1.755,"minX":-3.91,"minY":-1.755},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"armoredTransport":{"modelBoundsMeters":[7.9,3.15,3.05],"modelCode":"C-U19","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":3.6340000000000003,"maxY":1.4175,"minX":-3.6340000000000003,"minY":-1.4175},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"artillery":{"modelBoundsMeters":[9.6,4.1,4.15],"modelCode":"C-U09","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":4.416,"maxY":1.845,"minX":-4.416,"minY":-1.845},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"awacs":{"modelBoundsMeters":[22,25,6.2],"modelCode":"C-U18","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":9.24,"maxY":10,"minX":-9.24,"minY":-10},"modelUnitScale":{"factor":5.2632,"mode":"length","readabilityScale":1.72}},"commando":{"modelBoundsMeters":[1.15,0.82,2.1],"modelCode":"C-U05","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":0.529,"maxY":0.369,"minX":-0.529,"minY":-0.369},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"counterUASVehicle":{"modelBoundsMeters":[7.7,3.25,4.65],"modelCode":"C-U16","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":3.5420000000000003,"maxY":1.4625000000000001,"minX":-3.5420000000000003,"minY":-1.4625000000000001},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"d_aerialArtillery":{"modelBoundsMeters":[17.325,14.58,4.536],"modelCode":"D-U30","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":7.2764999999999995,"maxY":5.6862,"minX":-7.2764999999999995,"minY":-5.6862},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"d_aerialArtillery_assault":{"modelBoundsMeters":[17.325,14.58,4.536],"modelCode":"D-U30","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":7.2764999999999995,"maxY":5.6862,"minX":-7.2764999999999995,"minY":-5.6862},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"d_aerialArtillery_precision":{"modelBoundsMeters":[17.325,14.58,4.536],"modelCode":"D-U30","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":7.2764999999999995,"maxY":5.6862,"minX":-7.2764999999999995,"minY":-5.6862},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"d_aerialArtillery_recon":{"modelBoundsMeters":[17.325,14.58,4.536],"modelCode":"D-U30","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":7.2764999999999995,"maxY":5.6862,"minX":-7.2764999999999995,"minY":-5.6862},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"d_aeroballistic_carrier":{"modelBoundsMeters":[18.06,13.392,4.536],"modelCode":"D-X04","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":8.2173,"maxY":5.89248,"minX":-8.2173,"minY":-5.89248},"modelUnitScale":{"factor":5.2976,"mode":"length","readabilityScale":1.72}},"d_antiairInf":{"modelBoundsMeters":[3.675,2.592,2.484],"modelCode":"D-U05","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":1.6905,"maxY":1.1664,"minX":-1.6905,"minY":-1.1664},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"d_antiairInf_assault":{"modelBoundsMeters":[3.675,2.592,2.484],"modelCode":"D-U05","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":1.6905,"maxY":1.1664,"minX":-1.6905,"minY":-1.1664},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"d_antiairInf_precision":{"modelBoundsMeters":[3.675,2.592,2.484],"modelCode":"D-U05","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":1.6905,"maxY":1.1664,"minX":-1.6905,"minY":-1.1664},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"d_antiairInf_recon":{"modelBoundsMeters":[3.675,2.592,2.484],"modelCode":"D-U05","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":1.6905,"maxY":1.1664,"minX":-1.6905,"minY":-1.1664},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"d_antitank":{"modelBoundsMeters":[3.78,2.592,2.376],"modelCode":"D-U04","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":1.7388,"maxY":1.1664,"minX":-1.7388,"minY":-1.1664},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"d_antitank_assault":{"modelBoundsMeters":[3.78,2.592,2.376],"modelCode":"D-U04","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":1.7388,"maxY":1.1664,"minX":-1.7388,"minY":-1.1664},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"d_antitank_precision":{"modelBoundsMeters":[3.78,2.592,2.376],"modelCode":"D-U04","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":1.7388,"maxY":1.1664,"minX":-1.7388,"minY":-1.1664},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"d_antitank_recon":{"modelBoundsMeters":[3.78,2.592,2.376],"modelCode":"D-U04","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":1.7388,"maxY":1.1664,"minX":-1.7388,"minY":-1.1664},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"d_assault":{"modelBoundsMeters":[3.99,3.24,2.43],"modelCode":"D-U02","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":1.8354000000000001,"maxY":1.4580000000000002,"minX":-1.8354000000000001,"minY":-1.4580000000000002},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"d_assaultCar":{"modelBoundsMeters":[7.56,3.51,3.078],"modelCode":"D-U12","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":3.4776,"maxY":1.5795,"minX":-3.4776,"minY":-1.5795},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"d_assaultCar_assault":{"modelBoundsMeters":[7.56,3.51,3.078],"modelCode":"D-U12","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":3.4776,"maxY":1.5795,"minX":-3.4776,"minY":-1.5795},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"d_assaultCar_precision":{"modelBoundsMeters":[7.56,3.51,3.078],"modelCode":"D-U12","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":3.4776,"maxY":1.5795,"minX":-3.4776,"minY":-1.5795},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"d_assaultCar_recon":{"modelBoundsMeters":[7.56,3.51,3.078],"modelCode":"D-U12","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":3.4776,"maxY":1.5795,"minX":-3.4776,"minY":-1.5795},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"d_assault_assault":{"modelBoundsMeters":[3.99,3.24,2.43],"modelCode":"D-U02","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":1.8354000000000001,"maxY":1.4580000000000002,"minX":-1.8354000000000001,"minY":-1.4580000000000002},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"d_assault_precision":{"modelBoundsMeters":[3.99,3.24,2.43],"modelCode":"D-U02","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":1.8354000000000001,"maxY":1.4580000000000002,"minX":-1.8354000000000001,"minY":-1.4580000000000002},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"d_assault_recon":{"modelBoundsMeters":[3.99,3.24,2.43],"modelCode":"D-U02","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":1.8354000000000001,"maxY":1.4580000000000002,"minX":-1.8354000000000001,"minY":-1.4580000000000002},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"d_bomber":{"modelBoundsMeters":[18.27,14.256,5.022],"modelCode":"D-U26","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":7.673399999999999,"maxY":5.55984,"minX":-7.673399999999999,"minY":-5.55984},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"d_bomber_assault":{"modelBoundsMeters":[18.27,14.256,5.022],"modelCode":"D-U26","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":7.673399999999999,"maxY":5.55984,"minX":-7.673399999999999,"minY":-5.55984},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"d_bomber_precision":{"modelBoundsMeters":[18.27,14.256,5.022],"modelCode":"D-U26","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":7.673399999999999,"maxY":5.55984,"minX":-7.673399999999999,"minY":-5.55984},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"d_bomber_recon":{"modelBoundsMeters":[18.27,14.256,5.022],"modelCode":"D-U26","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":7.673399999999999,"maxY":5.55984,"minX":-7.673399999999999,"minY":-5.55984},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"d_combatMedic":{"modelBoundsMeters":[2.73,2.052,2.354],"modelCode":"D-U06","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":1.2558,"maxY":0.9234,"minX":-1.2558,"minY":-0.9234},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"d_combatMedic_assault":{"modelBoundsMeters":[2.73,2.052,2.354],"modelCode":"D-U06","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":1.2558,"maxY":0.9234,"minX":-1.2558,"minY":-0.9234},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"d_combatMedic_precision":{"modelBoundsMeters":[2.73,2.052,2.354],"modelCode":"D-U06","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":1.2558,"maxY":0.9234,"minX":-1.2558,"minY":-0.9234},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"d_combatMedic_recon":{"modelBoundsMeters":[2.73,2.052,2.354],"modelCode":"D-U06","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":1.2558,"maxY":0.9234,"minX":-1.2558,"minY":-0.9234},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"d_commandVehicle":{"modelBoundsMeters":[8.873,3.834,5.346],"modelCode":"D-U21","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":4.08158,"maxY":1.7253,"minX":-4.08158,"minY":-1.7253},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"d_commandVehicle_assault":{"modelBoundsMeters":[8.873,3.834,5.346],"modelCode":"D-U21","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":4.08158,"maxY":1.7253,"minX":-4.08158,"minY":-1.7253},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"d_commandVehicle_precision":{"modelBoundsMeters":[8.873,3.834,5.346],"modelCode":"D-U21","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":4.08158,"maxY":1.7253,"minX":-4.08158,"minY":-1.7253},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"d_commandVehicle_recon":{"modelBoundsMeters":[8.873,3.834,5.346],"modelCode":"D-U21","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":4.08158,"maxY":1.7253,"minX":-4.08158,"minY":-1.7253},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"d_cruise_tel":{"modelBoundsMeters":[13.755,4.752,4.104],"modelCode":"D-X02","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":6.258525000000001,"maxY":2.09088,"minX":-6.258525000000001,"minY":-2.09088},"modelUnitScale":{"factor":5.291,"mode":"length","readabilityScale":1.85}},"d_drone_launcher":{"modelBoundsMeters":[12.18,5.184,5.724],"modelCode":"D-X03","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":5.5419,"maxY":2.28096,"minX":-5.5419,"minY":-2.28096},"modelUnitScale":{"factor":5.291,"mode":"length","readabilityScale":1.85}},"d_exo":{"modelBoundsMeters":[1.732,1.35,2.862],"modelCode":"D-U09","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":0.79672,"maxY":0.6075,"minX":-0.79672,"minY":-0.6075},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"d_exo_assault":{"modelBoundsMeters":[1.732,1.35,2.862],"modelCode":"D-U09","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":0.79672,"maxY":0.6075,"minX":-0.79672,"minY":-0.6075},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"d_exo_precision":{"modelBoundsMeters":[1.732,1.35,2.862],"modelCode":"D-U09","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":0.79672,"maxY":0.6075,"minX":-0.79672,"minY":-0.6075},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"d_exo_recon":{"modelBoundsMeters":[1.732,1.35,2.862],"modelCode":"D-U09","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":0.79672,"maxY":0.6075,"minX":-0.79672,"minY":-0.6075},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"d_flamer":{"modelBoundsMeters":[1.418,1.08,2.43],"modelCode":"D-U08","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":0.65228,"maxY":0.48600000000000004,"minX":-0.65228,"minY":-0.48600000000000004},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"d_flamer_assault":{"modelBoundsMeters":[1.418,1.08,2.43],"modelCode":"D-U08","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":0.65228,"maxY":0.48600000000000004,"minX":-0.65228,"minY":-0.48600000000000004},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"d_flamer_precision":{"modelBoundsMeters":[1.418,1.08,2.43],"modelCode":"D-U08","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":0.65228,"maxY":0.48600000000000004,"minX":-0.65228,"minY":-0.48600000000000004},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"d_flamer_recon":{"modelBoundsMeters":[1.418,1.08,2.43],"modelCode":"D-U08","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":0.65228,"maxY":0.48600000000000004,"minX":-0.65228,"minY":-0.48600000000000004},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"d_gunshipLight":{"modelBoundsMeters":[13.86,11.34,4.374],"modelCode":"D-U24","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":5.821199999999999,"maxY":4.4226,"minX":-5.821199999999999,"minY":-4.4226},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"d_gunshipLight_assault":{"modelBoundsMeters":[13.86,11.34,4.374],"modelCode":"D-U24","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":5.821199999999999,"maxY":4.4226,"minX":-5.821199999999999,"minY":-4.4226},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"d_gunshipLight_precision":{"modelBoundsMeters":[13.86,11.34,4.374],"modelCode":"D-U24","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":5.821199999999999,"maxY":4.4226,"minX":-5.821199999999999,"minY":-4.4226},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"d_gunshipLight_recon":{"modelBoundsMeters":[13.86,11.34,4.374],"modelCode":"D-U24","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":5.821199999999999,"maxY":4.4226,"minX":-5.821199999999999,"minY":-4.4226},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"d_heavyBomber":{"modelBoundsMeters":[21.21,17.712,5.67],"modelCode":"D-U27","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":8.9082,"maxY":6.90768,"minX":-8.9082,"minY":-6.90768},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"d_heavyBomber_assault":{"modelBoundsMeters":[21.21,17.712,5.67],"modelCode":"D-U27","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":8.9082,"maxY":6.90768,"minX":-8.9082,"minY":-6.90768},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"d_heavyBomber_precision":{"modelBoundsMeters":[21.21,17.712,5.67],"modelCode":"D-U27","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":8.9082,"maxY":6.90768,"minX":-8.9082,"minY":-6.90768},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"d_heavyBomber_recon":{"modelBoundsMeters":[21.21,17.712,5.67],"modelCode":"D-U27","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":8.9082,"maxY":6.90768,"minX":-8.9082,"minY":-6.90768},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"d_hero":{"modelBoundsMeters":[1.418,1.026,2.43],"modelCode":"D-U10","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":0.65228,"maxY":0.4617,"minX":-0.65228,"minY":-0.4617},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"d_hero_assault":{"modelBoundsMeters":[1.418,1.026,2.43],"modelCode":"D-U10","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":0.65228,"maxY":0.4617,"minX":-0.65228,"minY":-0.4617},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"d_hero_precision":{"modelBoundsMeters":[1.418,1.026,2.43],"modelCode":"D-U10","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":0.65228,"maxY":0.4617,"minX":-0.65228,"minY":-0.4617},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"d_hero_recon":{"modelBoundsMeters":[1.418,1.026,2.43],"modelCode":"D-U10","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":0.65228,"maxY":0.4617,"minX":-0.65228,"minY":-0.4617},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"d_howitzer":{"modelBoundsMeters":[9.922,4.536,4.59],"modelCode":"D-U16","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":4.564120000000001,"maxY":2.0412,"minX":-4.564120000000001,"minY":-2.0412},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"d_howitzer_assault":{"modelBoundsMeters":[9.922,4.536,4.59],"modelCode":"D-U16","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":4.564120000000001,"maxY":2.0412,"minX":-4.564120000000001,"minY":-2.0412},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"d_howitzer_precision":{"modelBoundsMeters":[9.922,4.536,4.59],"modelCode":"D-U16","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":4.564120000000001,"maxY":2.0412,"minX":-4.564120000000001,"minY":-2.0412},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"d_howitzer_recon":{"modelBoundsMeters":[9.922,4.536,4.59],"modelCode":"D-U16","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":4.564120000000001,"maxY":2.0412,"minX":-4.564120000000001,"minY":-2.0412},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"d_infiltrator":{"modelBoundsMeters":[1.208,0.886,2.268],"modelCode":"D-U07","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":0.55568,"maxY":0.3987,"minX":-0.55568,"minY":-0.3987},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"d_infiltrator_assault":{"modelBoundsMeters":[1.208,0.886,2.268],"modelCode":"D-U07","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":0.55568,"maxY":0.3987,"minX":-0.55568,"minY":-0.3987},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"d_infiltrator_precision":{"modelBoundsMeters":[1.208,0.886,2.268],"modelCode":"D-U07","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":0.55568,"maxY":0.3987,"minX":-0.55568,"minY":-0.3987},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"d_infiltrator_recon":{"modelBoundsMeters":[1.208,0.886,2.268],"modelCode":"D-U07","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":0.55568,"maxY":0.3987,"minX":-0.55568,"minY":-0.3987},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"d_interceptor":{"modelBoundsMeters":[14.7,11.016,3.942],"modelCode":"D-U23","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":6.1739999999999995,"maxY":4.29624,"minX":-6.1739999999999995,"minY":-4.29624},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"d_interceptor_assault":{"modelBoundsMeters":[14.7,11.016,3.942],"modelCode":"D-U23","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":6.1739999999999995,"maxY":4.29624,"minX":-6.1739999999999995,"minY":-4.29624},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"d_interceptor_precision":{"modelBoundsMeters":[14.7,11.016,3.942],"modelCode":"D-U23","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":6.1739999999999995,"maxY":4.29624,"minX":-6.1739999999999995,"minY":-4.29624},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"d_interceptor_recon":{"modelBoundsMeters":[14.7,11.016,3.942],"modelCode":"D-U23","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":6.1739999999999995,"maxY":4.29624,"minX":-6.1739999999999995,"minY":-4.29624},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"d_line":{"modelBoundsMeters":[4.41,3.456,2.322],"modelCode":"D-U01","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":2.0286,"maxY":1.5552,"minX":-2.0286,"minY":-1.5552},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"d_line_assault":{"modelBoundsMeters":[4.41,3.456,2.322],"modelCode":"D-U01","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":2.0286,"maxY":1.5552,"minX":-2.0286,"minY":-1.5552},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"d_line_precision":{"modelBoundsMeters":[4.41,3.456,2.322],"modelCode":"D-U01","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":2.0286,"maxY":1.5552,"minX":-2.0286,"minY":-1.5552},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"d_line_recon":{"modelBoundsMeters":[4.41,3.456,2.322],"modelCode":"D-U01","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":2.0286,"maxY":1.5552,"minX":-2.0286,"minY":-1.5552},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"d_mbt":{"modelBoundsMeters":[9.66,4.428,2.916],"modelCode":"D-U13","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":4.4436,"maxY":1.9926,"minX":-4.4436,"minY":-1.9926},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"d_mbt_assault":{"modelBoundsMeters":[9.66,4.428,2.916],"modelCode":"D-U13","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":4.4436,"maxY":1.9926,"minX":-4.4436,"minY":-1.9926},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"d_mbt_precision":{"modelBoundsMeters":[9.66,4.428,2.916],"modelCode":"D-U13","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":4.4436,"maxY":1.9926,"minX":-4.4436,"minY":-1.9926},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"d_mbt_recon":{"modelBoundsMeters":[9.66,4.428,2.916],"modelCode":"D-U13","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":4.4436,"maxY":1.9926,"minX":-4.4436,"minY":-1.9926},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"d_mobileAA":{"modelBoundsMeters":[8.768,4.212,5.292],"modelCode":"D-U15","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":4.03328,"maxY":1.8954,"minX":-4.03328,"minY":-1.8954},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"d_mobileAA_assault":{"modelBoundsMeters":[8.768,4.212,5.292],"modelCode":"D-U15","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":4.03328,"maxY":1.8954,"minX":-4.03328,"minY":-1.8954},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"d_mobileAA_precision":{"modelBoundsMeters":[8.768,4.212,5.292],"modelCode":"D-U15","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":4.03328,"maxY":1.8954,"minX":-4.03328,"minY":-1.8954},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"d_mobileAA_recon":{"modelBoundsMeters":[8.768,4.212,5.292],"modelCode":"D-U15","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":4.03328,"maxY":1.8954,"minX":-4.03328,"minY":-1.8954},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"d_multirole":{"modelBoundsMeters":[15.96,12.312,4.266],"modelCode":"D-U25","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":6.7032,"maxY":4.80168,"minX":-6.7032,"minY":-4.80168},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"d_multirole_assault":{"modelBoundsMeters":[15.96,12.312,4.266],"modelCode":"D-U25","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":6.7032,"maxY":4.80168,"minX":-6.7032,"minY":-4.80168},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"d_multirole_precision":{"modelBoundsMeters":[15.96,12.312,4.266],"modelCode":"D-U25","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":6.7032,"maxY":4.80168,"minX":-6.7032,"minY":-4.80168},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"d_multirole_recon":{"modelBoundsMeters":[15.96,12.312,4.266],"modelCode":"D-U25","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":6.7032,"maxY":4.80168,"minX":-6.7032,"minY":-4.80168},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"d_reconCar":{"modelBoundsMeters":[6.09,2.862,3.024],"modelCode":"D-U11","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":2.8014,"maxY":1.2879,"minX":-2.8014,"minY":-1.2879},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"d_reconCar_assault":{"modelBoundsMeters":[6.09,2.862,3.024],"modelCode":"D-U11","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":2.8014,"maxY":1.2879,"minX":-2.8014,"minY":-1.2879},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"d_reconCar_precision":{"modelBoundsMeters":[6.09,2.862,3.024],"modelCode":"D-U11","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":2.8014,"maxY":1.2879,"minX":-2.8014,"minY":-1.2879},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"d_reconCar_recon":{"modelBoundsMeters":[6.09,2.862,3.024],"modelCode":"D-U11","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":2.8014,"maxY":1.2879,"minX":-2.8014,"minY":-1.2879},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"d_reconDrone":{"modelBoundsMeters":[9.24,12.96,2.052],"modelCode":"D-U22","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":3.8808,"maxY":5.0544,"minX":-3.8808,"minY":-5.0544},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"d_reconDrone_assault":{"modelBoundsMeters":[9.24,12.96,2.052],"modelCode":"D-U22","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":3.8808,"maxY":5.0544,"minX":-3.8808,"minY":-5.0544},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"d_reconDrone_precision":{"modelBoundsMeters":[9.24,12.96,2.052],"modelCode":"D-U22","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":3.8808,"maxY":5.0544,"minX":-3.8808,"minY":-5.0544},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"d_reconDrone_recon":{"modelBoundsMeters":[9.24,12.96,2.052],"modelCode":"D-U22","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":3.8808,"maxY":5.0544,"minX":-3.8808,"minY":-5.0544},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"d_repairDroneAdvanced":{"modelBoundsMeters":[6.09,6.264,2.538],"modelCode":"D-U28","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":2.5578,"maxY":2.4429600000000002,"minX":-2.5578,"minY":-2.4429600000000002},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"d_repairDroneAdvanced_assault":{"modelBoundsMeters":[6.09,6.264,2.538],"modelCode":"D-U28","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":2.5578,"maxY":2.4429600000000002,"minX":-2.5578,"minY":-2.4429600000000002},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"d_repairDroneAdvanced_precision":{"modelBoundsMeters":[6.09,6.264,2.538],"modelCode":"D-U28","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":2.5578,"maxY":2.4429600000000002,"minX":-2.5578,"minY":-2.4429600000000002},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"d_repairDroneAdvanced_recon":{"modelBoundsMeters":[6.09,6.264,2.538],"modelCode":"D-U28","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":2.5578,"maxY":2.4429600000000002,"minX":-2.5578,"minY":-2.4429600000000002},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"d_repairVehicle":{"modelBoundsMeters":[9.345,4.266,4.536],"modelCode":"D-U18","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":4.2987,"maxY":1.9197,"minX":-4.2987,"minY":-1.9197},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"d_repairVehicle_assault":{"modelBoundsMeters":[9.345,4.266,4.536],"modelCode":"D-U18","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":4.2987,"maxY":1.9197,"minX":-4.2987,"minY":-1.9197},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"d_repairVehicle_precision":{"modelBoundsMeters":[9.345,4.266,4.536],"modelCode":"D-U18","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":4.2987,"maxY":1.9197,"minX":-4.2987,"minY":-1.9197},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"d_repairVehicle_recon":{"modelBoundsMeters":[9.345,4.266,4.536],"modelCode":"D-U18","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":4.2987,"maxY":1.9197,"minX":-4.2987,"minY":-1.9197},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"d_rocketArtillery":{"modelBoundsMeters":[10.92,4.374,4.914],"modelCode":"D-U17","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":5.0232,"maxY":1.9683,"minX":-5.0232,"minY":-1.9683},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"d_rocketArtillery_assault":{"modelBoundsMeters":[10.92,4.374,4.914],"modelCode":"D-U17","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":5.0232,"maxY":1.9683,"minX":-5.0232,"minY":-1.9683},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"d_rocketArtillery_precision":{"modelBoundsMeters":[10.92,4.374,4.914],"modelCode":"D-U17","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":5.0232,"maxY":1.9683,"minX":-5.0232,"minY":-1.9683},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"d_rocketArtillery_recon":{"modelBoundsMeters":[10.92,4.374,4.914],"modelCode":"D-U17","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":5.0232,"maxY":1.9683,"minX":-5.0232,"minY":-1.9683},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"d_siegeTank":{"modelBoundsMeters":[11.76,5.562,5.13],"modelCode":"D-U19","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":5.4096,"maxY":2.5029000000000003,"minX":-5.4096,"minY":-2.5029000000000003},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"d_siegeTank_assault":{"modelBoundsMeters":[11.76,5.562,5.13],"modelCode":"D-U19","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":5.4096,"maxY":2.5029000000000003,"minX":-5.4096,"minY":-2.5029000000000003},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"d_siegeTank_precision":{"modelBoundsMeters":[11.76,5.562,5.13],"modelCode":"D-U19","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":5.4096,"maxY":2.5029000000000003,"minX":-5.4096,"minY":-2.5029000000000003},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"d_siegeTank_recon":{"modelBoundsMeters":[11.76,5.562,5.13],"modelCode":"D-U19","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":5.4096,"maxY":2.5029000000000003,"minX":-5.4096,"minY":-2.5029000000000003},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"d_sniper":{"modelBoundsMeters":[3.36,2.16,1.566],"modelCode":"D-U03","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":1.5456,"maxY":0.9720000000000001,"minX":-1.5456,"minY":-0.9720000000000001},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"d_sniper_assault":{"modelBoundsMeters":[3.36,2.16,1.566],"modelCode":"D-U03","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":1.5456,"maxY":0.9720000000000001,"minX":-1.5456,"minY":-0.9720000000000001},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"d_sniper_precision":{"modelBoundsMeters":[3.36,2.16,1.566],"modelCode":"D-U03","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":1.5456,"maxY":0.9720000000000001,"minX":-1.5456,"minY":-0.9720000000000001},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"d_sniper_recon":{"modelBoundsMeters":[3.36,2.16,1.566],"modelCode":"D-U03","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":1.5456,"maxY":0.9720000000000001,"minX":-1.5456,"minY":-0.9720000000000001},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"d_stealthStriker":{"modelBoundsMeters":[16.485,13.824,3.618],"modelCode":"D-U29","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":6.923699999999999,"maxY":5.39136,"minX":-6.923699999999999,"minY":-5.39136},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"d_stealthStriker_assault":{"modelBoundsMeters":[16.485,13.824,3.618],"modelCode":"D-U29","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":6.923699999999999,"maxY":5.39136,"minX":-6.923699999999999,"minY":-5.39136},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"d_stealthStriker_precision":{"modelBoundsMeters":[16.485,13.824,3.618],"modelCode":"D-U29","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":6.923699999999999,"maxY":5.39136,"minX":-6.923699999999999,"minY":-5.39136},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"d_stealthStriker_recon":{"modelBoundsMeters":[16.485,13.824,3.618],"modelCode":"D-U29","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":6.923699999999999,"maxY":5.39136,"minX":-6.923699999999999,"minY":-5.39136},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"d_strategic_tel":{"modelBoundsMeters":[15.015,5.616,6.912],"modelCode":"D-X05","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":6.831825,"maxY":2.47104,"minX":-6.831825,"minY":-2.47104},"modelUnitScale":{"factor":5.291,"mode":"length","readabilityScale":1.85}},"d_superHeavy":{"modelBoundsMeters":[13.335,6.804,5.022],"modelCode":"D-U20","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":6.134100000000001,"maxY":3.0618000000000003,"minX":-6.134100000000001,"minY":-3.0618000000000003},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"d_superHeavy_assault":{"modelBoundsMeters":[13.335,6.804,5.022],"modelCode":"D-U20","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":6.134100000000001,"maxY":3.0618000000000003,"minX":-6.134100000000001,"minY":-3.0618000000000003},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"d_superHeavy_precision":{"modelBoundsMeters":[13.335,6.804,5.022],"modelCode":"D-U20","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":6.134100000000001,"maxY":3.0618000000000003,"minX":-6.134100000000001,"minY":-3.0618000000000003},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"d_superHeavy_recon":{"modelBoundsMeters":[13.335,6.804,5.022],"modelCode":"D-U20","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":6.134100000000001,"maxY":3.0618000000000003,"minX":-6.134100000000001,"minY":-3.0618000000000003},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"d_tactical_tel":{"modelBoundsMeters":[12.81,4.644,5.832],"modelCode":"D-X01","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":5.828550000000001,"maxY":2.0433600000000003,"minX":-5.828550000000001,"minY":-2.0433600000000003},"modelUnitScale":{"factor":5.291,"mode":"length","readabilityScale":1.85}},"d_tankHunter":{"modelBoundsMeters":[10.08,4.374,2.97],"modelCode":"D-U14","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":4.6368,"maxY":1.9683,"minX":-4.6368,"minY":-1.9683},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"d_tankHunter_assault":{"modelBoundsMeters":[10.08,4.374,2.97],"modelCode":"D-U14","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":4.6368,"maxY":1.9683,"minX":-4.6368,"minY":-1.9683},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"d_tankHunter_precision":{"modelBoundsMeters":[10.08,4.374,2.97],"modelCode":"D-U14","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":4.6368,"maxY":1.9683,"minX":-4.6368,"minY":-1.9683},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"d_tankHunter_recon":{"modelBoundsMeters":[10.08,4.374,2.97],"modelCode":"D-U14","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":4.6368,"maxY":1.9683,"minX":-4.6368,"minY":-1.9683},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"gunship":{"modelBoundsMeters":[15.8,15,4.9],"modelCode":"C-U11","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":6.636,"maxY":6,"minX":-6.636,"minY":-6},"modelUnitScale":{"factor":5.2632,"mode":"length","readabilityScale":1.72}},"heavyGroundTransport":{"modelBoundsMeters":[13.3,4.2,4.8],"modelCode":"C-U20","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":6.118,"maxY":1.8900000000000001,"minX":-6.118,"minY":-1.8900000000000001},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"helicopter":{"modelBoundsMeters":[14.2,12.8,4.1],"modelCode":"C-U10","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":5.9639999999999995,"maxY":5.120000000000001,"minX":-5.9639999999999995,"minY":-5.120000000000001},"modelUnitScale":{"factor":5.2632,"mode":"length","readabilityScale":1.72}},"juggernaut":{"modelBoundsMeters":[12.2,5.8,4.55],"modelCode":"C-U13","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":5.612,"maxY":2.61,"minX":-5.612,"minY":-2.61},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"longRangeSAM":{"modelBoundsMeters":[10.7,4.05,5.55],"modelCode":"C-U17","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":4.922,"maxY":1.8225,"minX":-4.922,"minY":-1.8225},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"medic":{"modelBoundsMeters":[1.2,0.88,2.15],"modelCode":"C-U04","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":0.552,"maxY":0.396,"minX":-0.552,"minY":-0.396},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"mobileFireGroup":{"modelBoundsMeters":[5.8,2.65,2.85],"modelCode":"C-U15","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":2.668,"maxY":1.1925,"minX":-2.668,"minY":-1.1925},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"repairDrone":{"modelBoundsMeters":[5.8,5.8,2.35],"modelCode":"C-U12","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":2.436,"maxY":2.32,"minX":-2.436,"minY":-2.32},"modelUnitScale":{"factor":5.2632,"mode":"length","readabilityScale":1.72}},"resourceTruck":{"modelBoundsMeters":[9.2,3.25,3.45],"modelCode":"C-U23","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":4.232,"maxY":1.4625000000000001,"minX":-4.232,"minY":-1.4625000000000001},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"rifle":{"modelBoundsMeters":[4.2,3.2,2.15],"modelCode":"C-U02","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":1.9320000000000002,"maxY":1.4400000000000002,"minX":-1.9320000000000002,"minY":-1.4400000000000002},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"rocket":{"modelBoundsMeters":[1.25,0.95,2.2],"modelCode":"C-U03","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":0.5750000000000001,"maxY":0.4275,"minX":-0.5750000000000001,"minY":-0.4275},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"s_aerialArtillery":{"modelBoundsMeters":[16.17,14.04,3.696],"modelCode":"S-U30","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":6.7914,"maxY":5.4756,"minX":-6.7914,"minY":-5.4756},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"s_aerialArtillery_assault":{"modelBoundsMeters":[16.17,14.04,3.696],"modelCode":"S-U30","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":6.7914,"maxY":5.4756,"minX":-6.7914,"minY":-5.4756},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"s_aerialArtillery_precision":{"modelBoundsMeters":[16.17,14.04,3.696],"modelCode":"S-U30","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":6.7914,"maxY":5.4756,"minX":-6.7914,"minY":-5.4756},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"s_aerialArtillery_recon":{"modelBoundsMeters":[16.17,14.04,3.696],"modelCode":"S-U30","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":6.7914,"maxY":5.4756,"minX":-6.7914,"minY":-5.4756},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"s_aeroballistic_carrier":{"modelBoundsMeters":[16.856,12.896,3.696],"modelCode":"S-X04","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":7.669480000000001,"maxY":5.67424,"minX":-7.669480000000001,"minY":-5.67424},"modelUnitScale":{"factor":5.2976,"mode":"length","readabilityScale":1.72}},"s_antiairInf":{"modelBoundsMeters":[3.43,2.496,2.024],"modelCode":"S-U05","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":1.5778,"maxY":1.1232,"minX":-1.5778,"minY":-1.1232},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"s_antiairInf_assault":{"modelBoundsMeters":[3.43,2.496,2.024],"modelCode":"S-U05","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":1.5778,"maxY":1.1232,"minX":-1.5778,"minY":-1.1232},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"s_antiairInf_precision":{"modelBoundsMeters":[3.43,2.496,2.024],"modelCode":"S-U05","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":1.5778,"maxY":1.1232,"minX":-1.5778,"minY":-1.1232},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"s_antiairInf_recon":{"modelBoundsMeters":[3.43,2.496,2.024],"modelCode":"S-U05","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":1.5778,"maxY":1.1232,"minX":-1.5778,"minY":-1.1232},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"s_antitank":{"modelBoundsMeters":[3.528,2.496,1.936],"modelCode":"S-U04","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":1.62288,"maxY":1.1232,"minX":-1.62288,"minY":-1.1232},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"s_antitank_assault":{"modelBoundsMeters":[3.528,2.496,1.936],"modelCode":"S-U04","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":1.62288,"maxY":1.1232,"minX":-1.62288,"minY":-1.1232},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"s_antitank_precision":{"modelBoundsMeters":[3.528,2.496,1.936],"modelCode":"S-U04","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":1.62288,"maxY":1.1232,"minX":-1.62288,"minY":-1.1232},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"s_antitank_recon":{"modelBoundsMeters":[3.528,2.496,1.936],"modelCode":"S-U04","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":1.62288,"maxY":1.1232,"minX":-1.62288,"minY":-1.1232},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"s_assault":{"modelBoundsMeters":[3.724,3.12,1.98],"modelCode":"S-U02","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":1.7130400000000001,"maxY":1.4040000000000001,"minX":-1.7130400000000001,"minY":-1.4040000000000001},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"s_assaultCar":{"modelBoundsMeters":[7.056,3.38,2.508],"modelCode":"S-U12","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":3.24576,"maxY":1.521,"minX":-3.24576,"minY":-1.521},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"s_assaultCar_assault":{"modelBoundsMeters":[7.056,3.38,2.508],"modelCode":"S-U12","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":3.24576,"maxY":1.521,"minX":-3.24576,"minY":-1.521},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"s_assaultCar_precision":{"modelBoundsMeters":[7.056,3.38,2.508],"modelCode":"S-U12","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":3.24576,"maxY":1.521,"minX":-3.24576,"minY":-1.521},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"s_assaultCar_recon":{"modelBoundsMeters":[7.056,3.38,2.508],"modelCode":"S-U12","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":3.24576,"maxY":1.521,"minX":-3.24576,"minY":-1.521},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"s_assault_assault":{"modelBoundsMeters":[3.724,3.12,1.98],"modelCode":"S-U02","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":1.7130400000000001,"maxY":1.4040000000000001,"minX":-1.7130400000000001,"minY":-1.4040000000000001},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"s_assault_precision":{"modelBoundsMeters":[3.724,3.12,1.98],"modelCode":"S-U02","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":1.7130400000000001,"maxY":1.4040000000000001,"minX":-1.7130400000000001,"minY":-1.4040000000000001},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"s_assault_recon":{"modelBoundsMeters":[3.724,3.12,1.98],"modelCode":"S-U02","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":1.7130400000000001,"maxY":1.4040000000000001,"minX":-1.7130400000000001,"minY":-1.4040000000000001},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"s_bomber":{"modelBoundsMeters":[17.052,13.728,4.092],"modelCode":"S-U26","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":7.16184,"maxY":5.3539200000000005,"minX":-7.16184,"minY":-5.3539200000000005},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"s_bomber_assault":{"modelBoundsMeters":[17.052,13.728,4.092],"modelCode":"S-U26","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":7.16184,"maxY":5.3539200000000005,"minX":-7.16184,"minY":-5.3539200000000005},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"s_bomber_precision":{"modelBoundsMeters":[17.052,13.728,4.092],"modelCode":"S-U26","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":7.16184,"maxY":5.3539200000000005,"minX":-7.16184,"minY":-5.3539200000000005},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"s_bomber_recon":{"modelBoundsMeters":[17.052,13.728,4.092],"modelCode":"S-U26","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":7.16184,"maxY":5.3539200000000005,"minX":-7.16184,"minY":-5.3539200000000005},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"s_combatMedic":{"modelBoundsMeters":[2.548,1.976,1.918],"modelCode":"S-U06","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":1.17208,"maxY":0.8892,"minX":-1.17208,"minY":-0.8892},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"s_combatMedic_assault":{"modelBoundsMeters":[2.548,1.976,1.918],"modelCode":"S-U06","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":1.17208,"maxY":0.8892,"minX":-1.17208,"minY":-0.8892},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"s_combatMedic_precision":{"modelBoundsMeters":[2.548,1.976,1.918],"modelCode":"S-U06","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":1.17208,"maxY":0.8892,"minX":-1.17208,"minY":-0.8892},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"s_combatMedic_recon":{"modelBoundsMeters":[2.548,1.976,1.918],"modelCode":"S-U06","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":1.17208,"maxY":0.8892,"minX":-1.17208,"minY":-0.8892},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"s_commandVehicle":{"modelBoundsMeters":[8.281,3.692,4.356],"modelCode":"S-U21","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":3.8092600000000005,"maxY":1.6614000000000002,"minX":-3.8092600000000005,"minY":-1.6614000000000002},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"s_commandVehicle_assault":{"modelBoundsMeters":[8.281,3.692,4.356],"modelCode":"S-U21","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":3.8092600000000005,"maxY":1.6614000000000002,"minX":-3.8092600000000005,"minY":-1.6614000000000002},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"s_commandVehicle_precision":{"modelBoundsMeters":[8.281,3.692,4.356],"modelCode":"S-U21","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":3.8092600000000005,"maxY":1.6614000000000002,"minX":-3.8092600000000005,"minY":-1.6614000000000002},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"s_commandVehicle_recon":{"modelBoundsMeters":[8.281,3.692,4.356],"modelCode":"S-U21","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":3.8092600000000005,"maxY":1.6614000000000002,"minX":-3.8092600000000005,"minY":-1.6614000000000002},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"s_cruise_tel":{"modelBoundsMeters":[12.838,4.576,3.344],"modelCode":"S-X02","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":5.84129,"maxY":2.0134399999999997,"minX":-5.84129,"minY":-2.0134399999999997},"modelUnitScale":{"factor":5.291,"mode":"length","readabilityScale":1.85}},"s_drone_launcher":{"modelBoundsMeters":[11.368,4.992,4.664],"modelCode":"S-X03","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":5.17244,"maxY":2.19648,"minX":-5.17244,"minY":-2.19648},"modelUnitScale":{"factor":5.291,"mode":"length","readabilityScale":1.85}},"s_exo":{"modelBoundsMeters":[1.617,1.3,2.332],"modelCode":"S-U09","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":0.74382,"maxY":0.5850000000000001,"minX":-0.74382,"minY":-0.5850000000000001},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"s_exo_assault":{"modelBoundsMeters":[1.617,1.3,2.332],"modelCode":"S-U09","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":0.74382,"maxY":0.5850000000000001,"minX":-0.74382,"minY":-0.5850000000000001},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"s_exo_precision":{"modelBoundsMeters":[1.617,1.3,2.332],"modelCode":"S-U09","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":0.74382,"maxY":0.5850000000000001,"minX":-0.74382,"minY":-0.5850000000000001},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"s_exo_recon":{"modelBoundsMeters":[1.617,1.3,2.332],"modelCode":"S-U09","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":0.74382,"maxY":0.5850000000000001,"minX":-0.74382,"minY":-0.5850000000000001},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"s_flamer":{"modelBoundsMeters":[1.323,1.04,1.98],"modelCode":"S-U08","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":0.60858,"maxY":0.468,"minX":-0.60858,"minY":-0.468},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"s_flamer_assault":{"modelBoundsMeters":[1.323,1.04,1.98],"modelCode":"S-U08","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":0.60858,"maxY":0.468,"minX":-0.60858,"minY":-0.468},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"s_flamer_precision":{"modelBoundsMeters":[1.323,1.04,1.98],"modelCode":"S-U08","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":0.60858,"maxY":0.468,"minX":-0.60858,"minY":-0.468},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"s_flamer_recon":{"modelBoundsMeters":[1.323,1.04,1.98],"modelCode":"S-U08","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":0.60858,"maxY":0.468,"minX":-0.60858,"minY":-0.468},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"s_gunshipLight":{"modelBoundsMeters":[12.936,10.92,3.564],"modelCode":"S-U24","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":5.43312,"maxY":4.2588,"minX":-5.43312,"minY":-4.2588},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"s_gunshipLight_assault":{"modelBoundsMeters":[12.936,10.92,3.564],"modelCode":"S-U24","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":5.43312,"maxY":4.2588,"minX":-5.43312,"minY":-4.2588},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"s_gunshipLight_precision":{"modelBoundsMeters":[12.936,10.92,3.564],"modelCode":"S-U24","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":5.43312,"maxY":4.2588,"minX":-5.43312,"minY":-4.2588},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"s_gunshipLight_recon":{"modelBoundsMeters":[12.936,10.92,3.564],"modelCode":"S-U24","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":5.43312,"maxY":4.2588,"minX":-5.43312,"minY":-4.2588},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"s_heavyBomber":{"modelBoundsMeters":[19.796,17.056,4.62],"modelCode":"S-U27","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":8.314319999999999,"maxY":6.651840000000001,"minX":-8.314319999999999,"minY":-6.651840000000001},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"s_heavyBomber_assault":{"modelBoundsMeters":[19.796,17.056,4.62],"modelCode":"S-U27","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":8.314319999999999,"maxY":6.651840000000001,"minX":-8.314319999999999,"minY":-6.651840000000001},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"s_heavyBomber_precision":{"modelBoundsMeters":[19.796,17.056,4.62],"modelCode":"S-U27","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":8.314319999999999,"maxY":6.651840000000001,"minX":-8.314319999999999,"minY":-6.651840000000001},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"s_heavyBomber_recon":{"modelBoundsMeters":[19.796,17.056,4.62],"modelCode":"S-U27","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":8.314319999999999,"maxY":6.651840000000001,"minX":-8.314319999999999,"minY":-6.651840000000001},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"s_hero":{"modelBoundsMeters":[1.323,0.988,1.98],"modelCode":"S-U10","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":0.60858,"maxY":0.4446,"minX":-0.60858,"minY":-0.4446},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"s_hero_assault":{"modelBoundsMeters":[1.323,0.988,1.98],"modelCode":"S-U10","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":0.60858,"maxY":0.4446,"minX":-0.60858,"minY":-0.4446},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"s_hero_precision":{"modelBoundsMeters":[1.323,0.988,1.98],"modelCode":"S-U10","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":0.60858,"maxY":0.4446,"minX":-0.60858,"minY":-0.4446},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"s_hero_recon":{"modelBoundsMeters":[1.323,0.988,1.98],"modelCode":"S-U10","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":0.60858,"maxY":0.4446,"minX":-0.60858,"minY":-0.4446},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"s_howitzer":{"modelBoundsMeters":[9.261,4.368,3.74],"modelCode":"S-U16","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":4.26006,"maxY":1.9656000000000002,"minX":-4.26006,"minY":-1.9656000000000002},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"s_howitzer_assault":{"modelBoundsMeters":[9.261,4.368,3.74],"modelCode":"S-U16","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":4.26006,"maxY":1.9656000000000002,"minX":-4.26006,"minY":-1.9656000000000002},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"s_howitzer_precision":{"modelBoundsMeters":[9.261,4.368,3.74],"modelCode":"S-U16","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":4.26006,"maxY":1.9656000000000002,"minX":-4.26006,"minY":-1.9656000000000002},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"s_howitzer_recon":{"modelBoundsMeters":[9.261,4.368,3.74],"modelCode":"S-U16","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":4.26006,"maxY":1.9656000000000002,"minX":-4.26006,"minY":-1.9656000000000002},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"s_infiltrator":{"modelBoundsMeters":[1.127,0.853,1.848],"modelCode":"S-U07","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":0.51842,"maxY":0.38385,"minX":-0.51842,"minY":-0.38385},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"s_infiltrator_assault":{"modelBoundsMeters":[1.127,0.853,1.848],"modelCode":"S-U07","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":0.51842,"maxY":0.38385,"minX":-0.51842,"minY":-0.38385},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"s_infiltrator_precision":{"modelBoundsMeters":[1.127,0.853,1.848],"modelCode":"S-U07","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":0.51842,"maxY":0.38385,"minX":-0.51842,"minY":-0.38385},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"s_infiltrator_recon":{"modelBoundsMeters":[1.127,0.853,1.848],"modelCode":"S-U07","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":0.51842,"maxY":0.38385,"minX":-0.51842,"minY":-0.38385},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"s_interceptor":{"modelBoundsMeters":[13.72,10.608,3.212],"modelCode":"S-U23","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":5.7624,"maxY":4.13712,"minX":-5.7624,"minY":-4.13712},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"s_interceptor_assault":{"modelBoundsMeters":[13.72,10.608,3.212],"modelCode":"S-U23","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":5.7624,"maxY":4.13712,"minX":-5.7624,"minY":-4.13712},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"s_interceptor_precision":{"modelBoundsMeters":[13.72,10.608,3.212],"modelCode":"S-U23","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":5.7624,"maxY":4.13712,"minX":-5.7624,"minY":-4.13712},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"s_interceptor_recon":{"modelBoundsMeters":[13.72,10.608,3.212],"modelCode":"S-U23","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":5.7624,"maxY":4.13712,"minX":-5.7624,"minY":-4.13712},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"s_line":{"modelBoundsMeters":[4.116,3.328,1.892],"modelCode":"S-U01","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":1.89336,"maxY":1.4976,"minX":-1.89336,"minY":-1.4976},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"s_line_assault":{"modelBoundsMeters":[4.116,3.328,1.892],"modelCode":"S-U01","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":1.89336,"maxY":1.4976,"minX":-1.89336,"minY":-1.4976},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"s_line_precision":{"modelBoundsMeters":[4.116,3.328,1.892],"modelCode":"S-U01","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":1.89336,"maxY":1.4976,"minX":-1.89336,"minY":-1.4976},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"s_line_recon":{"modelBoundsMeters":[4.116,3.328,1.892],"modelCode":"S-U01","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":1.89336,"maxY":1.4976,"minX":-1.89336,"minY":-1.4976},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"s_mbt":{"modelBoundsMeters":[9.016,4.264,2.376],"modelCode":"S-U13","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":4.14736,"maxY":1.9188,"minX":-4.14736,"minY":-1.9188},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"s_mbt_assault":{"modelBoundsMeters":[9.016,4.264,2.376],"modelCode":"S-U13","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":4.14736,"maxY":1.9188,"minX":-4.14736,"minY":-1.9188},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"s_mbt_precision":{"modelBoundsMeters":[9.016,4.264,2.376],"modelCode":"S-U13","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":4.14736,"maxY":1.9188,"minX":-4.14736,"minY":-1.9188},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"s_mbt_recon":{"modelBoundsMeters":[9.016,4.264,2.376],"modelCode":"S-U13","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":4.14736,"maxY":1.9188,"minX":-4.14736,"minY":-1.9188},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"s_mobileAA":{"modelBoundsMeters":[8.183,4.056,4.312],"modelCode":"S-U15","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":3.76418,"maxY":1.8252000000000002,"minX":-3.76418,"minY":-1.8252000000000002},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"s_mobileAA_assault":{"modelBoundsMeters":[8.183,4.056,4.312],"modelCode":"S-U15","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":3.76418,"maxY":1.8252000000000002,"minX":-3.76418,"minY":-1.8252000000000002},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"s_mobileAA_precision":{"modelBoundsMeters":[8.183,4.056,4.312],"modelCode":"S-U15","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":3.76418,"maxY":1.8252000000000002,"minX":-3.76418,"minY":-1.8252000000000002},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"s_mobileAA_recon":{"modelBoundsMeters":[8.183,4.056,4.312],"modelCode":"S-U15","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":3.76418,"maxY":1.8252000000000002,"minX":-3.76418,"minY":-1.8252000000000002},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"s_multirole":{"modelBoundsMeters":[14.896,11.856,3.476],"modelCode":"S-U25","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":6.25632,"maxY":4.62384,"minX":-6.25632,"minY":-4.62384},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"s_multirole_assault":{"modelBoundsMeters":[14.896,11.856,3.476],"modelCode":"S-U25","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":6.25632,"maxY":4.62384,"minX":-6.25632,"minY":-4.62384},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"s_multirole_precision":{"modelBoundsMeters":[14.896,11.856,3.476],"modelCode":"S-U25","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":6.25632,"maxY":4.62384,"minX":-6.25632,"minY":-4.62384},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"s_multirole_recon":{"modelBoundsMeters":[14.896,11.856,3.476],"modelCode":"S-U25","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":6.25632,"maxY":4.62384,"minX":-6.25632,"minY":-4.62384},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"s_reconCar":{"modelBoundsMeters":[5.684,2.756,2.464],"modelCode":"S-U11","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":2.61464,"maxY":1.2402,"minX":-2.61464,"minY":-1.2402},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"s_reconCar_assault":{"modelBoundsMeters":[5.684,2.756,2.464],"modelCode":"S-U11","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":2.61464,"maxY":1.2402,"minX":-2.61464,"minY":-1.2402},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"s_reconCar_precision":{"modelBoundsMeters":[5.684,2.756,2.464],"modelCode":"S-U11","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":2.61464,"maxY":1.2402,"minX":-2.61464,"minY":-1.2402},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"s_reconCar_recon":{"modelBoundsMeters":[5.684,2.756,2.464],"modelCode":"S-U11","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":2.61464,"maxY":1.2402,"minX":-2.61464,"minY":-1.2402},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"s_reconDrone":{"modelBoundsMeters":[8.624,12.48,1.672],"modelCode":"S-U22","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":3.62208,"maxY":4.8672,"minX":-3.62208,"minY":-4.8672},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"s_reconDrone_assault":{"modelBoundsMeters":[8.624,12.48,1.672],"modelCode":"S-U22","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":3.62208,"maxY":4.8672,"minX":-3.62208,"minY":-4.8672},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"s_reconDrone_precision":{"modelBoundsMeters":[8.624,12.48,1.672],"modelCode":"S-U22","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":3.62208,"maxY":4.8672,"minX":-3.62208,"minY":-4.8672},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"s_reconDrone_recon":{"modelBoundsMeters":[8.624,12.48,1.672],"modelCode":"S-U22","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":3.62208,"maxY":4.8672,"minX":-3.62208,"minY":-4.8672},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"s_repairDroneAdvanced":{"modelBoundsMeters":[5.684,6.032,2.068],"modelCode":"S-U28","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":2.38728,"maxY":2.35248,"minX":-2.38728,"minY":-2.35248},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"s_repairDroneAdvanced_assault":{"modelBoundsMeters":[5.684,6.032,2.068],"modelCode":"S-U28","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":2.38728,"maxY":2.35248,"minX":-2.38728,"minY":-2.35248},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"s_repairDroneAdvanced_precision":{"modelBoundsMeters":[5.684,6.032,2.068],"modelCode":"S-U28","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":2.38728,"maxY":2.35248,"minX":-2.38728,"minY":-2.35248},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"s_repairDroneAdvanced_recon":{"modelBoundsMeters":[5.684,6.032,2.068],"modelCode":"S-U28","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":2.38728,"maxY":2.35248,"minX":-2.38728,"minY":-2.35248},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"s_repairVehicle":{"modelBoundsMeters":[8.722,4.108,3.696],"modelCode":"S-U18","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":4.01212,"maxY":1.8485999999999998,"minX":-4.01212,"minY":-1.8485999999999998},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"s_repairVehicle_assault":{"modelBoundsMeters":[8.722,4.108,3.696],"modelCode":"S-U18","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":4.01212,"maxY":1.8485999999999998,"minX":-4.01212,"minY":-1.8485999999999998},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"s_repairVehicle_precision":{"modelBoundsMeters":[8.722,4.108,3.696],"modelCode":"S-U18","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":4.01212,"maxY":1.8485999999999998,"minX":-4.01212,"minY":-1.8485999999999998},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"s_repairVehicle_recon":{"modelBoundsMeters":[8.722,4.108,3.696],"modelCode":"S-U18","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":4.01212,"maxY":1.8485999999999998,"minX":-4.01212,"minY":-1.8485999999999998},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"s_rocketArtillery":{"modelBoundsMeters":[10.192,4.212,4.004],"modelCode":"S-U17","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":4.68832,"maxY":1.8954,"minX":-4.68832,"minY":-1.8954},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"s_rocketArtillery_assault":{"modelBoundsMeters":[10.192,4.212,4.004],"modelCode":"S-U17","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":4.68832,"maxY":1.8954,"minX":-4.68832,"minY":-1.8954},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"s_rocketArtillery_precision":{"modelBoundsMeters":[10.192,4.212,4.004],"modelCode":"S-U17","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":4.68832,"maxY":1.8954,"minX":-4.68832,"minY":-1.8954},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"s_rocketArtillery_recon":{"modelBoundsMeters":[10.192,4.212,4.004],"modelCode":"S-U17","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":4.68832,"maxY":1.8954,"minX":-4.68832,"minY":-1.8954},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"s_siegeTank":{"modelBoundsMeters":[10.976,5.356,4.18],"modelCode":"S-U19","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":5.048960000000001,"maxY":2.4102,"minX":-5.048960000000001,"minY":-2.4102},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"s_siegeTank_assault":{"modelBoundsMeters":[10.976,5.356,4.18],"modelCode":"S-U19","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":5.048960000000001,"maxY":2.4102,"minX":-5.048960000000001,"minY":-2.4102},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"s_siegeTank_precision":{"modelBoundsMeters":[10.976,5.356,4.18],"modelCode":"S-U19","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":5.048960000000001,"maxY":2.4102,"minX":-5.048960000000001,"minY":-2.4102},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"s_siegeTank_recon":{"modelBoundsMeters":[10.976,5.356,4.18],"modelCode":"S-U19","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":5.048960000000001,"maxY":2.4102,"minX":-5.048960000000001,"minY":-2.4102},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"s_sniper":{"modelBoundsMeters":[3.136,2.08,1.276],"modelCode":"S-U03","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":1.44256,"maxY":0.936,"minX":-1.44256,"minY":-0.936},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"s_sniper_assault":{"modelBoundsMeters":[3.136,2.08,1.276],"modelCode":"S-U03","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":1.44256,"maxY":0.936,"minX":-1.44256,"minY":-0.936},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"s_sniper_precision":{"modelBoundsMeters":[3.136,2.08,1.276],"modelCode":"S-U03","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":1.44256,"maxY":0.936,"minX":-1.44256,"minY":-0.936},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"s_sniper_recon":{"modelBoundsMeters":[3.136,2.08,1.276],"modelCode":"S-U03","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":1.44256,"maxY":0.936,"minX":-1.44256,"minY":-0.936},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"s_stealthStriker":{"modelBoundsMeters":[15.386,13.312,2.948],"modelCode":"S-U29","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":6.46212,"maxY":5.19168,"minX":-6.46212,"minY":-5.19168},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"s_stealthStriker_assault":{"modelBoundsMeters":[15.386,13.312,2.948],"modelCode":"S-U29","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":6.46212,"maxY":5.19168,"minX":-6.46212,"minY":-5.19168},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"s_stealthStriker_precision":{"modelBoundsMeters":[15.386,13.312,2.948],"modelCode":"S-U29","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":6.46212,"maxY":5.19168,"minX":-6.46212,"minY":-5.19168},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"s_stealthStriker_recon":{"modelBoundsMeters":[15.386,13.312,2.948],"modelCode":"S-U29","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":6.46212,"maxY":5.19168,"minX":-6.46212,"minY":-5.19168},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"s_strategic_tel":{"modelBoundsMeters":[14.014,5.408,5.632],"modelCode":"S-X05","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":6.37637,"maxY":2.3795200000000003,"minX":-6.37637,"minY":-2.3795200000000003},"modelUnitScale":{"factor":5.291,"mode":"length","readabilityScale":1.85}},"s_superHeavy":{"modelBoundsMeters":[12.446,6.552,4.092],"modelCode":"S-U20","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":5.72516,"maxY":2.9484,"minX":-5.72516,"minY":-2.9484},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"s_superHeavy_assault":{"modelBoundsMeters":[12.446,6.552,4.092],"modelCode":"S-U20","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":5.72516,"maxY":2.9484,"minX":-5.72516,"minY":-2.9484},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"s_superHeavy_precision":{"modelBoundsMeters":[12.446,6.552,4.092],"modelCode":"S-U20","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":5.72516,"maxY":2.9484,"minX":-5.72516,"minY":-2.9484},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"s_superHeavy_recon":{"modelBoundsMeters":[12.446,6.552,4.092],"modelCode":"S-U20","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":5.72516,"maxY":2.9484,"minX":-5.72516,"minY":-2.9484},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"s_tactical_tel":{"modelBoundsMeters":[11.956,4.472,4.752],"modelCode":"S-X01","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":5.43998,"maxY":1.96768,"minX":-5.43998,"minY":-1.96768},"modelUnitScale":{"factor":5.291,"mode":"length","readabilityScale":1.85}},"s_tankHunter":{"modelBoundsMeters":[9.408,4.212,2.42],"modelCode":"S-U14","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":4.32768,"maxY":1.8954,"minX":-4.32768,"minY":-1.8954},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"s_tankHunter_assault":{"modelBoundsMeters":[9.408,4.212,2.42],"modelCode":"S-U14","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":4.32768,"maxY":1.8954,"minX":-4.32768,"minY":-1.8954},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"s_tankHunter_precision":{"modelBoundsMeters":[9.408,4.212,2.42],"modelCode":"S-U14","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":4.32768,"maxY":1.8954,"minX":-4.32768,"minY":-1.8954},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"s_tankHunter_recon":{"modelBoundsMeters":[9.408,4.212,2.42],"modelCode":"S-U14","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":4.32768,"maxY":1.8954,"minX":-4.32768,"minY":-1.8954},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"saboteur":{"modelBoundsMeters":[1.15,0.82,2.1],"modelCode":"C-U14","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":0.529,"maxY":0.369,"minX":-0.529,"minY":-0.369},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"scout":{"modelBoundsMeters":[5.1,2.45,2.45],"modelCode":"C-U06","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":2.346,"maxY":1.1025,"minX":-2.346,"minY":-1.1025},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"strategicAirlifter":{"modelBoundsMeters":[27.5,26,7.5],"modelCode":"C-U22","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":11.549999999999999,"maxY":10.4,"minX":-11.549999999999999,"minY":-10.4},"modelUnitScale":{"factor":5.2632,"mode":"length","readabilityScale":1.72}},"tank":{"modelBoundsMeters":[9.1,4.05,2.65],"modelCode":"C-U07","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":4.186,"maxY":1.8225,"minX":-4.186,"minY":-1.8225},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"transportHelicopter":{"modelBoundsMeters":[16.4,15.5,4.8],"modelCode":"C-U21","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":6.887999999999999,"maxY":6.2,"minX":-6.887999999999999,"minY":-6.2},"modelUnitScale":{"factor":5.2632,"mode":"length","readabilityScale":1.72}},"v_aerialArtillery":{"modelBoundsMeters":[16.5,13.23,4.2],"modelCode":"V-U30","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":6.93,"maxY":5.1597,"minX":-6.93,"minY":-5.1597},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"v_aerialArtillery_assault":{"modelBoundsMeters":[16.5,13.23,4.2],"modelCode":"V-U30","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":6.93,"maxY":5.1597,"minX":-6.93,"minY":-5.1597},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"v_aerialArtillery_precision":{"modelBoundsMeters":[16.5,13.23,4.2],"modelCode":"V-U30","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":6.93,"maxY":5.1597,"minX":-6.93,"minY":-5.1597},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"v_aerialArtillery_recon":{"modelBoundsMeters":[16.5,13.23,4.2],"modelCode":"V-U30","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":6.93,"maxY":5.1597,"minX":-6.93,"minY":-5.1597},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"v_aeroballistic_carrier":{"modelBoundsMeters":[17.2,12.152,4.2],"modelCode":"V-X04","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":7.826,"maxY":5.34688,"minX":-7.826,"minY":-5.34688},"modelUnitScale":{"factor":5.2976,"mode":"length","readabilityScale":1.72}},"v_antiairInf":{"modelBoundsMeters":[3.5,2.352,2.3],"modelCode":"V-U05","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":1.61,"maxY":1.0584,"minX":-1.61,"minY":-1.0584},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"v_antiairInf_assault":{"modelBoundsMeters":[3.5,2.352,2.3],"modelCode":"V-U05","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":1.61,"maxY":1.0584,"minX":-1.61,"minY":-1.0584},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"v_antiairInf_precision":{"modelBoundsMeters":[3.5,2.352,2.3],"modelCode":"V-U05","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":1.61,"maxY":1.0584,"minX":-1.61,"minY":-1.0584},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"v_antiairInf_recon":{"modelBoundsMeters":[3.5,2.352,2.3],"modelCode":"V-U05","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":1.61,"maxY":1.0584,"minX":-1.61,"minY":-1.0584},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"v_antitank":{"modelBoundsMeters":[3.6,2.352,2.2],"modelCode":"V-U04","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":1.6560000000000001,"maxY":1.0584,"minX":-1.6560000000000001,"minY":-1.0584},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"v_antitank_assault":{"modelBoundsMeters":[3.6,2.352,2.2],"modelCode":"V-U04","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":1.6560000000000001,"maxY":1.0584,"minX":-1.6560000000000001,"minY":-1.0584},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"v_antitank_precision":{"modelBoundsMeters":[3.6,2.352,2.2],"modelCode":"V-U04","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":1.6560000000000001,"maxY":1.0584,"minX":-1.6560000000000001,"minY":-1.0584},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"v_antitank_recon":{"modelBoundsMeters":[3.6,2.352,2.2],"modelCode":"V-U04","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":1.6560000000000001,"maxY":1.0584,"minX":-1.6560000000000001,"minY":-1.0584},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"v_assault":{"modelBoundsMeters":[3.8,2.94,2.25],"modelCode":"V-U02","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":1.748,"maxY":1.323,"minX":-1.748,"minY":-1.323},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"v_assaultCar":{"modelBoundsMeters":[7.2,3.185,2.85],"modelCode":"V-U12","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":3.3120000000000003,"maxY":1.4332500000000001,"minX":-3.3120000000000003,"minY":-1.4332500000000001},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"v_assaultCar_assault":{"modelBoundsMeters":[7.2,3.185,2.85],"modelCode":"V-U12","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":3.3120000000000003,"maxY":1.4332500000000001,"minX":-3.3120000000000003,"minY":-1.4332500000000001},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"v_assaultCar_precision":{"modelBoundsMeters":[7.2,3.185,2.85],"modelCode":"V-U12","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":3.3120000000000003,"maxY":1.4332500000000001,"minX":-3.3120000000000003,"minY":-1.4332500000000001},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"v_assaultCar_recon":{"modelBoundsMeters":[7.2,3.185,2.85],"modelCode":"V-U12","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":3.3120000000000003,"maxY":1.4332500000000001,"minX":-3.3120000000000003,"minY":-1.4332500000000001},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"v_assault_assault":{"modelBoundsMeters":[3.8,2.94,2.25],"modelCode":"V-U02","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":1.748,"maxY":1.323,"minX":-1.748,"minY":-1.323},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"v_assault_precision":{"modelBoundsMeters":[3.8,2.94,2.25],"modelCode":"V-U02","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":1.748,"maxY":1.323,"minX":-1.748,"minY":-1.323},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"v_assault_recon":{"modelBoundsMeters":[3.8,2.94,2.25],"modelCode":"V-U02","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":1.748,"maxY":1.323,"minX":-1.748,"minY":-1.323},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"v_bomber":{"modelBoundsMeters":[17.4,12.936,4.65],"modelCode":"V-U26","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":7.307999999999999,"maxY":5.04504,"minX":-7.307999999999999,"minY":-5.04504},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"v_bomber_assault":{"modelBoundsMeters":[17.4,12.936,4.65],"modelCode":"V-U26","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":7.307999999999999,"maxY":5.04504,"minX":-7.307999999999999,"minY":-5.04504},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"v_bomber_precision":{"modelBoundsMeters":[17.4,12.936,4.65],"modelCode":"V-U26","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":7.307999999999999,"maxY":5.04504,"minX":-7.307999999999999,"minY":-5.04504},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"v_bomber_recon":{"modelBoundsMeters":[17.4,12.936,4.65],"modelCode":"V-U26","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":7.307999999999999,"maxY":5.04504,"minX":-7.307999999999999,"minY":-5.04504},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"v_combatMedic":{"modelBoundsMeters":[2.6,1.862,2.18],"modelCode":"V-U06","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":1.1960000000000002,"maxY":0.8379000000000001,"minX":-1.1960000000000002,"minY":-0.8379000000000001},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"v_combatMedic_assault":{"modelBoundsMeters":[2.6,1.862,2.18],"modelCode":"V-U06","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":1.1960000000000002,"maxY":0.8379000000000001,"minX":-1.1960000000000002,"minY":-0.8379000000000001},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"v_combatMedic_precision":{"modelBoundsMeters":[2.6,1.862,2.18],"modelCode":"V-U06","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":1.1960000000000002,"maxY":0.8379000000000001,"minX":-1.1960000000000002,"minY":-0.8379000000000001},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"v_combatMedic_recon":{"modelBoundsMeters":[2.6,1.862,2.18],"modelCode":"V-U06","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":1.1960000000000002,"maxY":0.8379000000000001,"minX":-1.1960000000000002,"minY":-0.8379000000000001},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"v_commandVehicle":{"modelBoundsMeters":[8.45,3.479,4.95],"modelCode":"V-U21","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":3.887,"maxY":1.56555,"minX":-3.887,"minY":-1.56555},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"v_commandVehicle_assault":{"modelBoundsMeters":[8.45,3.479,4.95],"modelCode":"V-U21","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":3.887,"maxY":1.56555,"minX":-3.887,"minY":-1.56555},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"v_commandVehicle_precision":{"modelBoundsMeters":[8.45,3.479,4.95],"modelCode":"V-U21","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":3.887,"maxY":1.56555,"minX":-3.887,"minY":-1.56555},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"v_commandVehicle_recon":{"modelBoundsMeters":[8.45,3.479,4.95],"modelCode":"V-U21","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":3.887,"maxY":1.56555,"minX":-3.887,"minY":-1.56555},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"v_cruise_tel":{"modelBoundsMeters":[13.1,4.312,3.8],"modelCode":"V-X02","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":5.9605,"maxY":1.89728,"minX":-5.9605,"minY":-1.89728},"modelUnitScale":{"factor":5.291,"mode":"length","readabilityScale":1.85}},"v_drone_launcher":{"modelBoundsMeters":[11.6,4.704,5.3],"modelCode":"V-X03","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":5.278,"maxY":2.06976,"minX":-5.278,"minY":-2.06976},"modelUnitScale":{"factor":5.291,"mode":"length","readabilityScale":1.85}},"v_exo":{"modelBoundsMeters":[1.65,1.225,2.65],"modelCode":"V-U09","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":0.759,"maxY":0.55125,"minX":-0.759,"minY":-0.55125},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"v_exo_assault":{"modelBoundsMeters":[1.65,1.225,2.65],"modelCode":"V-U09","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":0.759,"maxY":0.55125,"minX":-0.759,"minY":-0.55125},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"v_exo_precision":{"modelBoundsMeters":[1.65,1.225,2.65],"modelCode":"V-U09","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":0.759,"maxY":0.55125,"minX":-0.759,"minY":-0.55125},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"v_exo_recon":{"modelBoundsMeters":[1.65,1.225,2.65],"modelCode":"V-U09","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":0.759,"maxY":0.55125,"minX":-0.759,"minY":-0.55125},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"v_flamer":{"modelBoundsMeters":[1.35,0.98,2.25],"modelCode":"V-U08","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":0.6210000000000001,"maxY":0.441,"minX":-0.6210000000000001,"minY":-0.441},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"v_flamer_assault":{"modelBoundsMeters":[1.35,0.98,2.25],"modelCode":"V-U08","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":0.6210000000000001,"maxY":0.441,"minX":-0.6210000000000001,"minY":-0.441},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"v_flamer_precision":{"modelBoundsMeters":[1.35,0.98,2.25],"modelCode":"V-U08","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":0.6210000000000001,"maxY":0.441,"minX":-0.6210000000000001,"minY":-0.441},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"v_flamer_recon":{"modelBoundsMeters":[1.35,0.98,2.25],"modelCode":"V-U08","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":0.6210000000000001,"maxY":0.441,"minX":-0.6210000000000001,"minY":-0.441},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"v_gunshipLight":{"modelBoundsMeters":[13.2,10.29,4.05],"modelCode":"V-U24","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":5.544,"maxY":4.0131,"minX":-5.544,"minY":-4.0131},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"v_gunshipLight_assault":{"modelBoundsMeters":[13.2,10.29,4.05],"modelCode":"V-U24","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":5.544,"maxY":4.0131,"minX":-5.544,"minY":-4.0131},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"v_gunshipLight_precision":{"modelBoundsMeters":[13.2,10.29,4.05],"modelCode":"V-U24","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":5.544,"maxY":4.0131,"minX":-5.544,"minY":-4.0131},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"v_gunshipLight_recon":{"modelBoundsMeters":[13.2,10.29,4.05],"modelCode":"V-U24","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":5.544,"maxY":4.0131,"minX":-5.544,"minY":-4.0131},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"v_heavyBomber":{"modelBoundsMeters":[20.2,16.072,5.25],"modelCode":"V-U27","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":8.484,"maxY":6.26808,"minX":-8.484,"minY":-6.26808},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"v_heavyBomber_assault":{"modelBoundsMeters":[20.2,16.072,5.25],"modelCode":"V-U27","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":8.484,"maxY":6.26808,"minX":-8.484,"minY":-6.26808},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"v_heavyBomber_precision":{"modelBoundsMeters":[20.2,16.072,5.25],"modelCode":"V-U27","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":8.484,"maxY":6.26808,"minX":-8.484,"minY":-6.26808},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"v_heavyBomber_recon":{"modelBoundsMeters":[20.2,16.072,5.25],"modelCode":"V-U27","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":8.484,"maxY":6.26808,"minX":-8.484,"minY":-6.26808},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"v_hero":{"modelBoundsMeters":[1.35,0.931,2.25],"modelCode":"V-U10","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":0.6210000000000001,"maxY":0.41895000000000004,"minX":-0.6210000000000001,"minY":-0.41895000000000004},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"v_hero_assault":{"modelBoundsMeters":[1.35,0.931,2.25],"modelCode":"V-U10","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":0.6210000000000001,"maxY":0.41895000000000004,"minX":-0.6210000000000001,"minY":-0.41895000000000004},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"v_hero_precision":{"modelBoundsMeters":[1.35,0.931,2.25],"modelCode":"V-U10","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":0.6210000000000001,"maxY":0.41895000000000004,"minX":-0.6210000000000001,"minY":-0.41895000000000004},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"v_hero_recon":{"modelBoundsMeters":[1.35,0.931,2.25],"modelCode":"V-U10","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":0.6210000000000001,"maxY":0.41895000000000004,"minX":-0.6210000000000001,"minY":-0.41895000000000004},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"v_howitzer":{"modelBoundsMeters":[9.45,4.116,4.25],"modelCode":"V-U16","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":4.3469999999999995,"maxY":1.8521999999999998,"minX":-4.3469999999999995,"minY":-1.8521999999999998},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"v_howitzer_assault":{"modelBoundsMeters":[9.45,4.116,4.25],"modelCode":"V-U16","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":4.3469999999999995,"maxY":1.8521999999999998,"minX":-4.3469999999999995,"minY":-1.8521999999999998},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"v_howitzer_precision":{"modelBoundsMeters":[9.45,4.116,4.25],"modelCode":"V-U16","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":4.3469999999999995,"maxY":1.8521999999999998,"minX":-4.3469999999999995,"minY":-1.8521999999999998},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"v_howitzer_recon":{"modelBoundsMeters":[9.45,4.116,4.25],"modelCode":"V-U16","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":4.3469999999999995,"maxY":1.8521999999999998,"minX":-4.3469999999999995,"minY":-1.8521999999999998},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"v_infiltrator":{"modelBoundsMeters":[1.15,0.804,2.1],"modelCode":"V-U07","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":0.529,"maxY":0.3618,"minX":-0.529,"minY":-0.3618},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"v_infiltrator_assault":{"modelBoundsMeters":[1.15,0.804,2.1],"modelCode":"V-U07","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":0.529,"maxY":0.3618,"minX":-0.529,"minY":-0.3618},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"v_infiltrator_precision":{"modelBoundsMeters":[1.15,0.804,2.1],"modelCode":"V-U07","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":0.529,"maxY":0.3618,"minX":-0.529,"minY":-0.3618},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"v_infiltrator_recon":{"modelBoundsMeters":[1.15,0.804,2.1],"modelCode":"V-U07","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":0.529,"maxY":0.3618,"minX":-0.529,"minY":-0.3618},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"v_interceptor":{"modelBoundsMeters":[14,9.996,3.65],"modelCode":"V-U23","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":5.88,"maxY":3.8984400000000003,"minX":-5.88,"minY":-3.8984400000000003},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"v_interceptor_assault":{"modelBoundsMeters":[14,9.996,3.65],"modelCode":"V-U23","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":5.88,"maxY":3.8984400000000003,"minX":-5.88,"minY":-3.8984400000000003},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"v_interceptor_precision":{"modelBoundsMeters":[14,9.996,3.65],"modelCode":"V-U23","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":5.88,"maxY":3.8984400000000003,"minX":-5.88,"minY":-3.8984400000000003},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"v_interceptor_recon":{"modelBoundsMeters":[14,9.996,3.65],"modelCode":"V-U23","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":5.88,"maxY":3.8984400000000003,"minX":-5.88,"minY":-3.8984400000000003},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"v_line":{"modelBoundsMeters":[4.2,3.136,2.15],"modelCode":"V-U01","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":1.9320000000000002,"maxY":1.4112,"minX":-1.9320000000000002,"minY":-1.4112},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"v_line_assault":{"modelBoundsMeters":[4.2,3.136,2.15],"modelCode":"V-U01","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":1.9320000000000002,"maxY":1.4112,"minX":-1.9320000000000002,"minY":-1.4112},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"v_line_precision":{"modelBoundsMeters":[4.2,3.136,2.15],"modelCode":"V-U01","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":1.9320000000000002,"maxY":1.4112,"minX":-1.9320000000000002,"minY":-1.4112},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"v_line_recon":{"modelBoundsMeters":[4.2,3.136,2.15],"modelCode":"V-U01","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":1.9320000000000002,"maxY":1.4112,"minX":-1.9320000000000002,"minY":-1.4112},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"v_mbt":{"modelBoundsMeters":[9.2,4.018,2.7],"modelCode":"V-U13","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":4.232,"maxY":1.8081,"minX":-4.232,"minY":-1.8081},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"v_mbt_assault":{"modelBoundsMeters":[9.2,4.018,2.7],"modelCode":"V-U13","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":4.232,"maxY":1.8081,"minX":-4.232,"minY":-1.8081},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"v_mbt_precision":{"modelBoundsMeters":[9.2,4.018,2.7],"modelCode":"V-U13","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":4.232,"maxY":1.8081,"minX":-4.232,"minY":-1.8081},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"v_mbt_recon":{"modelBoundsMeters":[9.2,4.018,2.7],"modelCode":"V-U13","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":4.232,"maxY":1.8081,"minX":-4.232,"minY":-1.8081},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"v_mobileAA":{"modelBoundsMeters":[8.35,3.822,4.9],"modelCode":"V-U15","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":3.841,"maxY":1.7199,"minX":-3.841,"minY":-1.7199},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"v_mobileAA_assault":{"modelBoundsMeters":[8.35,3.822,4.9],"modelCode":"V-U15","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":3.841,"maxY":1.7199,"minX":-3.841,"minY":-1.7199},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"v_mobileAA_precision":{"modelBoundsMeters":[8.35,3.822,4.9],"modelCode":"V-U15","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":3.841,"maxY":1.7199,"minX":-3.841,"minY":-1.7199},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"v_mobileAA_recon":{"modelBoundsMeters":[8.35,3.822,4.9],"modelCode":"V-U15","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":3.841,"maxY":1.7199,"minX":-3.841,"minY":-1.7199},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"v_multirole":{"modelBoundsMeters":[15.2,11.172,3.95],"modelCode":"V-U25","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":6.3839999999999995,"maxY":4.357080000000001,"minX":-6.3839999999999995,"minY":-4.357080000000001},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"v_multirole_assault":{"modelBoundsMeters":[15.2,11.172,3.95],"modelCode":"V-U25","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":6.3839999999999995,"maxY":4.357080000000001,"minX":-6.3839999999999995,"minY":-4.357080000000001},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"v_multirole_precision":{"modelBoundsMeters":[15.2,11.172,3.95],"modelCode":"V-U25","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":6.3839999999999995,"maxY":4.357080000000001,"minX":-6.3839999999999995,"minY":-4.357080000000001},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"v_multirole_recon":{"modelBoundsMeters":[15.2,11.172,3.95],"modelCode":"V-U25","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":6.3839999999999995,"maxY":4.357080000000001,"minX":-6.3839999999999995,"minY":-4.357080000000001},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"v_reconCar":{"modelBoundsMeters":[5.8,2.597,2.8],"modelCode":"V-U11","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":2.668,"maxY":1.16865,"minX":-2.668,"minY":-1.16865},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"v_reconCar_assault":{"modelBoundsMeters":[5.8,2.597,2.8],"modelCode":"V-U11","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":2.668,"maxY":1.16865,"minX":-2.668,"minY":-1.16865},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"v_reconCar_precision":{"modelBoundsMeters":[5.8,2.597,2.8],"modelCode":"V-U11","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":2.668,"maxY":1.16865,"minX":-2.668,"minY":-1.16865},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"v_reconCar_recon":{"modelBoundsMeters":[5.8,2.597,2.8],"modelCode":"V-U11","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":2.668,"maxY":1.16865,"minX":-2.668,"minY":-1.16865},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"v_reconDrone":{"modelBoundsMeters":[8.8,11.76,1.9],"modelCode":"V-U22","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":3.696,"maxY":4.5864,"minX":-3.696,"minY":-4.5864},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"v_reconDrone_assault":{"modelBoundsMeters":[8.8,11.76,1.9],"modelCode":"V-U22","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":3.696,"maxY":4.5864,"minX":-3.696,"minY":-4.5864},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"v_reconDrone_precision":{"modelBoundsMeters":[8.8,11.76,1.9],"modelCode":"V-U22","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":3.696,"maxY":4.5864,"minX":-3.696,"minY":-4.5864},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"v_reconDrone_recon":{"modelBoundsMeters":[8.8,11.76,1.9],"modelCode":"V-U22","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":3.696,"maxY":4.5864,"minX":-3.696,"minY":-4.5864},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"v_repairDroneAdvanced":{"modelBoundsMeters":[5.8,5.684,2.35],"modelCode":"V-U28","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":2.436,"maxY":2.2167600000000003,"minX":-2.436,"minY":-2.2167600000000003},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"v_repairDroneAdvanced_assault":{"modelBoundsMeters":[5.8,5.684,2.35],"modelCode":"V-U28","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":2.436,"maxY":2.2167600000000003,"minX":-2.436,"minY":-2.2167600000000003},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"v_repairDroneAdvanced_precision":{"modelBoundsMeters":[5.8,5.684,2.35],"modelCode":"V-U28","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":2.436,"maxY":2.2167600000000003,"minX":-2.436,"minY":-2.2167600000000003},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"v_repairDroneAdvanced_recon":{"modelBoundsMeters":[5.8,5.684,2.35],"modelCode":"V-U28","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":2.436,"maxY":2.2167600000000003,"minX":-2.436,"minY":-2.2167600000000003},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"v_repairVehicle":{"modelBoundsMeters":[8.9,3.871,4.2],"modelCode":"V-U18","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":4.094,"maxY":1.74195,"minX":-4.094,"minY":-1.74195},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"v_repairVehicle_assault":{"modelBoundsMeters":[8.9,3.871,4.2],"modelCode":"V-U18","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":4.094,"maxY":1.74195,"minX":-4.094,"minY":-1.74195},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"v_repairVehicle_precision":{"modelBoundsMeters":[8.9,3.871,4.2],"modelCode":"V-U18","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":4.094,"maxY":1.74195,"minX":-4.094,"minY":-1.74195},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"v_repairVehicle_recon":{"modelBoundsMeters":[8.9,3.871,4.2],"modelCode":"V-U18","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":4.094,"maxY":1.74195,"minX":-4.094,"minY":-1.74195},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"v_rocketArtillery":{"modelBoundsMeters":[10.4,3.969,4.55],"modelCode":"V-U17","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":4.784000000000001,"maxY":1.78605,"minX":-4.784000000000001,"minY":-1.78605},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"v_rocketArtillery_assault":{"modelBoundsMeters":[10.4,3.969,4.55],"modelCode":"V-U17","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":4.784000000000001,"maxY":1.78605,"minX":-4.784000000000001,"minY":-1.78605},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"v_rocketArtillery_precision":{"modelBoundsMeters":[10.4,3.969,4.55],"modelCode":"V-U17","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":4.784000000000001,"maxY":1.78605,"minX":-4.784000000000001,"minY":-1.78605},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"v_rocketArtillery_recon":{"modelBoundsMeters":[10.4,3.969,4.55],"modelCode":"V-U17","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":4.784000000000001,"maxY":1.78605,"minX":-4.784000000000001,"minY":-1.78605},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"v_siegeTank":{"modelBoundsMeters":[11.2,5.047,4.75],"modelCode":"V-U19","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":5.152,"maxY":2.27115,"minX":-5.152,"minY":-2.27115},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"v_siegeTank_assault":{"modelBoundsMeters":[11.2,5.047,4.75],"modelCode":"V-U19","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":5.152,"maxY":2.27115,"minX":-5.152,"minY":-2.27115},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"v_siegeTank_precision":{"modelBoundsMeters":[11.2,5.047,4.75],"modelCode":"V-U19","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":5.152,"maxY":2.27115,"minX":-5.152,"minY":-2.27115},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"v_siegeTank_recon":{"modelBoundsMeters":[11.2,5.047,4.75],"modelCode":"V-U19","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":5.152,"maxY":2.27115,"minX":-5.152,"minY":-2.27115},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"v_sniper":{"modelBoundsMeters":[3.2,1.96,1.45],"modelCode":"V-U03","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":1.4720000000000002,"maxY":0.882,"minX":-1.4720000000000002,"minY":-0.882},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"v_sniper_assault":{"modelBoundsMeters":[3.2,1.96,1.45],"modelCode":"V-U03","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":1.4720000000000002,"maxY":0.882,"minX":-1.4720000000000002,"minY":-0.882},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"v_sniper_precision":{"modelBoundsMeters":[3.2,1.96,1.45],"modelCode":"V-U03","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":1.4720000000000002,"maxY":0.882,"minX":-1.4720000000000002,"minY":-0.882},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"v_sniper_recon":{"modelBoundsMeters":[3.2,1.96,1.45],"modelCode":"V-U03","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":1.4720000000000002,"maxY":0.882,"minX":-1.4720000000000002,"minY":-0.882},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}},"v_stealthStriker":{"modelBoundsMeters":[15.7,12.544,3.35],"modelCode":"V-U29","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":6.593999999999999,"maxY":4.8921600000000005,"minX":-6.593999999999999,"minY":-4.8921600000000005},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"v_stealthStriker_assault":{"modelBoundsMeters":[15.7,12.544,3.35],"modelCode":"V-U29","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":6.593999999999999,"maxY":4.8921600000000005,"minX":-6.593999999999999,"minY":-4.8921600000000005},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"v_stealthStriker_precision":{"modelBoundsMeters":[15.7,12.544,3.35],"modelCode":"V-U29","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":6.593999999999999,"maxY":4.8921600000000005,"minX":-6.593999999999999,"minY":-4.8921600000000005},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"v_stealthStriker_recon":{"modelBoundsMeters":[15.7,12.544,3.35],"modelCode":"V-U29","modelCollision":"ellipse","modelCollisionFootprintMeters":{"maxX":6.593999999999999,"maxY":4.8921600000000005,"minX":-6.593999999999999,"minY":-4.8921600000000005},"modelUnitScale":{"factor":5.246,"mode":"length","readabilityScale":1.72}},"v_strategic_tel":{"modelBoundsMeters":[14.3,5.096,6.4],"modelCode":"V-X05","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":6.506500000000001,"maxY":2.2422400000000002,"minX":-6.506500000000001,"minY":-2.2422400000000002},"modelUnitScale":{"factor":5.291,"mode":"length","readabilityScale":1.85}},"v_superHeavy":{"modelBoundsMeters":[12.7,6.174,4.65],"modelCode":"V-U20","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":5.842,"maxY":2.7783,"minX":-5.842,"minY":-2.7783},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"v_superHeavy_assault":{"modelBoundsMeters":[12.7,6.174,4.65],"modelCode":"V-U20","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":5.842,"maxY":2.7783,"minX":-5.842,"minY":-2.7783},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"v_superHeavy_precision":{"modelBoundsMeters":[12.7,6.174,4.65],"modelCode":"V-U20","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":5.842,"maxY":2.7783,"minX":-5.842,"minY":-2.7783},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"v_superHeavy_recon":{"modelBoundsMeters":[12.7,6.174,4.65],"modelCode":"V-U20","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":5.842,"maxY":2.7783,"minX":-5.842,"minY":-2.7783},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"v_tactical_tel":{"modelBoundsMeters":[12.2,4.214,5.4],"modelCode":"V-X01","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":5.551,"maxY":1.8541600000000003,"minX":-5.551,"minY":-1.8541600000000003},"modelUnitScale":{"factor":5.291,"mode":"length","readabilityScale":1.85}},"v_tankHunter":{"modelBoundsMeters":[9.6,3.969,2.75],"modelCode":"V-U14","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":4.416,"maxY":1.78605,"minX":-4.416,"minY":-1.78605},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"v_tankHunter_assault":{"modelBoundsMeters":[9.6,3.969,2.75],"modelCode":"V-U14","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":4.416,"maxY":1.78605,"minX":-4.416,"minY":-1.78605},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"v_tankHunter_precision":{"modelBoundsMeters":[9.6,3.969,2.75],"modelCode":"V-U14","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":4.416,"maxY":1.78605,"minX":-4.416,"minY":-1.78605},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"v_tankHunter_recon":{"modelBoundsMeters":[9.6,3.969,2.75],"modelCode":"V-U14","modelCollision":"box","modelCollisionFootprintMeters":{"maxX":4.416,"maxY":1.78605,"minX":-4.416,"minY":-1.78605},"modelUnitScale":{"factor":5.217,"mode":"length","readabilityScale":1.85}},"worker":{"modelBoundsMeters":[1.25,0.9,2.2],"modelCode":"C-U01","modelCollision":"capsule","modelCollisionFootprintMeters":{"maxX":0.5750000000000001,"maxY":0.405,"minX":-0.5750000000000001,"minY":-0.405},"modelUnitScale":{"factor":2.99,"mode":"height","readabilityScale":2.3}}};
(function installDeterministicUnitGeometry206() {
  const types = D.UNIT_TYPES || {};
  for (const [typeId, geometry] of Object.entries(deterministicUnitGeometry206)) {
    const stats = types[typeId];
    if (!stats) continue;
    Object.assign(stats, {
      modelCode: geometry.modelCode || null,
      modelManifest: '/frontline-dominion/models/pilot/manifest.json?build=213',
      modelBoundsMeters: Array.isArray(geometry.modelBoundsMeters) ? [...geometry.modelBoundsMeters] : null,
      modelCollisionFootprintMeters: geometry.modelCollisionFootprintMeters ? { ...geometry.modelCollisionFootprintMeters } : null,
      modelUnitScale: geometry.modelUnitScale ? { ...geometry.modelUnitScale } : null,
      modelCollision: geometry.modelCollision || null,
    });
  }
  Object.defineProperty(self, '__fdDeterministicUnitGeometry206', { value: true, configurable: false });
})();

importScripts('/frontline-dominion/singleplayer-gameplay-v207.js?build=213');
importScripts('/frontline-dominion/hook-context-v207.js?build=213');
importScripts('/frontline-dominion/gameplay-v208.js?build=213');
importScripts('/frontline-dominion/movement-target-fidelity-v209.js?build=213');

let game = null;
let running = false;
let paused = false;
let manualMode = false;
let timer = 0;
let nextTickAt = 0;
let snapshotSequence = 0;
let actionSequence = 0;
let lastSnapshotTick = -1;
let lastStructureTick = -1;
let lastFogTick = -1;
let lastMiniTick = -1;
let lastDetailsTick = -1;
let mainView = { left: 0, top: 0, right: D.WORLD.width, bottom: D.WORLD.height, zoom: 1, selectedIds: [] };
let knownEntities = new Set();
let knownProjectiles = new Set();
let actionQueue = [];
let effectEvents = [];
let alertEvents = [];
let endEvent = null;
let legacySave = null;
let lastStateHash = 0;
let lastSubsystemHashes = null;
let workerStartedAt = performance.now();
let ticksExecuted = 0;
let maxTickMs = 0;
let totalTickMs = 0;
let lastHashTick = -1;
let lastNetworkHashTick = -1;
let lastNetworkHash = '00000000';
let lastNetworkLogisticsHash206 = 0;
let lastNetworkLogisticsComponents206 = null;
let lastNetworkBaseComponents206 = null;
let initialNetworkHash206 = '00000000';
let initialNetworkLogisticsHash206 = 0;
let initialNetworkLogisticsComponents206 = null;
let initialNetworkBaseComponents206 = null;
let multiplayer = { active: false, role: null, mode: 'coop', perspectiveSwapped: false, hostTick: null, hostTickReceivedAt: 0, appliedSeq: 0 };

let shared165 = null;
let sharedFallbacks165 = 0;
let buildingStateSequence165 = 0;
let minimapStateSequence165 = 0;
let lastBuildingStateTick165 = -1;
let lastMinimapStateTick165 = -1;
let buildingStateCache165 = new Map();
let buildingDetailCache165 = new Map();

function attachShared165(desc) {
  shared165 = null;
  if (!desc || typeof SharedArrayBuffer === 'undefined' || typeof Atomics === 'undefined') return;
  try {
    shared165 = {
      ...desc,
      header: new Int32Array(desc.headerBuffer), unitIds: new Uint32Array(desc.unitIdsBuffer),
      unitFloats: new Float32Array(desc.unitFloatsBuffer), unitInts: new Int32Array(desc.unitIntsBuffer),
      projectileIds: new Uint32Array(desc.projectileIdsBuffer), projectileFloats: new Float32Array(desc.projectileFloatsBuffer),
      projectileInts: new Int32Array(desc.projectileIntsBuffer), renderIds: new Uint32Array(desc.renderIdsBuffer)
    };
  } catch (error) {
    shared165 = null;
  }
}

function reserveSharedSlot165(unitCount, projectileCount, renderCount) {
  if (!shared165 || unitCount > shared165.maxUnits || projectileCount > shared165.maxProjectiles || renderCount > shared165.maxRenderIds) {
    if (shared165) sharedFallbacks165 += 1;
    return -1;
  }
  for (let slot = 0; slot < shared165.slots; slot += 1) {
    const base = slot * shared165.metaStride;
    if (Atomics.compareExchange(shared165.header, base + 5, 0, 1) === 0) return slot;
  }
  sharedFallbacks165 += 1;
  return -1;
}

function publishSharedSlot165(slot, sequence, tick, unitCount, projectileCount, renderCount) {
  if (slot < 0 || !shared165) return;
  const base = slot * shared165.metaStride;
  Atomics.store(shared165.header, base, sequence | 0);
  Atomics.store(shared165.header, base + 1, tick | 0);
  Atomics.store(shared165.header, base + 2, unitCount | 0);
  Atomics.store(shared165.header, base + 3, projectileCount | 0);
  Atomics.store(shared165.header, base + 4, renderCount | 0);
  Atomics.store(shared165.header, base + 5, 2);
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const idNumber = (id) => {
  const value = Number.parseInt(String(id || '').replace(/^\D+/, ''), 10);
  return Number.isFinite(value) ? value >>> 0 : 0;
};
const entityId = (number) => number ? `e${number >>> 0}` : null;
const projectileId = (number) => number ? `p${number >>> 0}` : null;
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const plainClone = (value, depth = 0) => {
  if (value == null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (depth > 5) return null;
  if (Array.isArray(value)) return value.slice(0, 256).map(item => plainClone(item, depth + 1));
  if (value instanceof Set) return [...value].map(item => plainClone(item, depth + 1));
  if (value instanceof Map) return [...value.entries()].map(([key, item]) => [key, plainClone(item, depth + 1)]);
  if (typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      if (key === 'game' || key === 'stats' || key === 'source' || key === 'target' || typeof item === 'function') continue;
      out[key] = plainClone(item, depth + 1);
    }
    return out;
  }
  return null;
};

function serializeProjectile(projectile) {
  return {
    id: projectile.id,
    sourceId: projectile.sourceId,
    sourceTypeId: projectile.sourceTypeId || null,
    team: projectile.team,
    x: projectile.x,
    y: projectile.y,
    targetId: projectile.targetId,
    targetX: projectile.targetX,
    targetY: projectile.targetY,
    speed: projectile.speed,
    damage: projectile.damage,
    splash: projectile.splash,
    weapon: plainClone(projectile.weapon),
    profile: projectile.profile,
    trajectory: projectile.trajectory,
    ballistic: projectile.ballistic,
    interceptability: projectile.interceptability,
    maxHp: projectile.maxHp,
    hp: projectile.hp,
    signature: projectile.signature,
    evasion: projectile.evasion,
    turnRate: projectile.turnRate,
    weave: projectile.weave,
    arcHeight: projectile.arcHeight,
    visualSize: projectile.visualSize,
    color: projectile.color,
    trailColor: projectile.trailColor,
    trailLength: projectile.trailLength,
    accuracy: projectile.accuracy,
    defenseClass: projectile.defenseClass,
    ttl: projectile.ttl,
    age: projectile.age,
    phase: projectile.phase,
    angle: projectile.angle,
    altitude: projectile.altitude,
    launchAltitude: projectile.launchAltitude,
    guidanceLost: projectile.guidanceLost,
    preserveAim: true
  };
}

function serializeEntity(entity) {
  const data = entity.serialize ? entity.serialize() : plainClone(entity);
  if (entity.kind === 'unit') {
    Object.assign(data, {
      visualSpeed: finite(entity.visualSpeed),
      flightAltitude: finite(entity.flightAltitude ?? entity.altitude),
      airBank: finite(entity.airBank),
      airPitch: finite(entity.airPitch),
      embarkedIn: entity.embarkedIn || null,
      cargoUnits: Array.isArray(entity.cargoUnits) ? [...entity.cargoUnits] : undefined,
      transportReserved: finite(entity.transportReserved),
      airOrbitCenter: plainClone(entity.airOrbitCenter),
      airOrbitAngle: finite(entity.airOrbitAngle),
      airServiceState: entity.airServiceState || null,
      airServiceTargetId: entity.airServiceTargetId || null,
      airAmmo: Number.isFinite(entity.airAmmo) ? entity.airAmmo : null,
      airAmmoMax: Number.isFinite(entity.airAmmoMax) ? entity.airAmmoMax : null,
      sortieFuel: Number.isFinite(entity.sortieFuel) ? entity.sortieFuel : null,
      sortieFuelMax: Number.isFinite(entity.sortieFuelMax) ? entity.sortieFuelMax : null,
      suppression160: finite(entity.suppression160), cohesion160: finite(entity.cohesion160, 1),
      supply160: finite(entity.supply160, 1), morale160: finite(entity.morale160, 1),
      functionalDamage160: plainClone(entity.functionalDamage160),
      v160Retreating: Boolean(entity._v160Retreating)
    });
  } else if (entity.kind === 'building') {
    Object.assign(data, {
      buildProgress: finite(entity.buildProgress ?? entity.construction, 1),
      queue: plainClone(entity.queue), rallyPoint: plainClone(entity.rallyPoint),
      recoil: finite(entity.recoil), weaponRotation: finite(entity.weaponRotation),
      desiredWeaponRotation: finite(entity.desiredWeaponRotation)
    });
  }
  return data;
}

function captureSaveData() {
  if (!game || !legacySave) return null;
  const previous = D.storageGet(D.SAVE_KEY);
  let data = null;
  try {
    legacySave.call(game, false);
    const raw = D.storageGet(D.SAVE_KEY);
    data = raw ? JSON.parse(raw) : null;
  } finally {
    if (previous == null) localStorage.removeItem(D.SAVE_KEY);
    else D.storageSet(D.SAVE_KEY, previous);
  }
  if (!data) return null;
  data.authoritative172 = {
    version: VERSION,
    build: BUILD,
    simTick: game.simTick || Math.round(game.time * SIM_HZ),
    rngSeed: game.rng?.seed ?? game.seed,
    projectiles: game.projectiles.filter(projectile => projectile.alive).map(serializeProjectile),
    paused: false,
    idCounter: game.idCounter,
    projectileCounter: game.projectileCounter,
    formationCounter: game.formationCounter,
    stateHash: stateHash()
  };
  data.logistics206 = game.exportLogistics206?.() || null;
  data.workerTransient206 = game.exportWorkerTransient206?.() || null;
  if (data.authoritative172) data.authoritative172.networkAppliedSeq206 = Number(multiplayer.appliedSeq || 0);
  data.savedAt = Date.now();
  return data;
}

function canonicalTeamCode(team) {
  const local = TEAM_CODES[team] || 0;
  if (!multiplayer.perspectiveSwapped || local === 0) return local;
  return local === 1 ? 2 : 1;
}

function computeSubsystemHashes(force = false) {
  const tick = game?.simTick || 0;
  if (!force && lastSubsystemHashes && tick - lastHashTick < 25) return lastSubsystemHashes;
  lastSubsystemHashes = game?.operationalCore160?.subsystemHashes?.() || { units: 0, buildings: 0, projectiles: 0, economy: 0, operations: 0, sectors: 0 };
  let hash = 2166136261 >>> 0;
  for (const key of ['units','buildings','projectiles','economy','operations','sectors','logistics206']) {
    hash ^= lastSubsystemHashes[key] >>> 0;
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  lastStateHash = hash >>> 0;
  lastHashTick = tick;
  return lastSubsystemHashes;
}

function stateHash(force = false) {
  computeSubsystemHashes(force);
  return lastStateHash >>> 0;
}



const baseAIUpdateCreditTrace206 = D.TacticalAI?.prototype?.update;
if (typeof baseAIUpdateCreditTrace206 === 'function' && !baseAIUpdateCreditTrace206.__fdCreditTrace206) {
  const wrappedAIUpdateCreditTrace206 = function(dt) {
    const game206 = this.game;
    const before206 = Number(game206?.teams?.enemy?.credits) || 0;
    const result206 = baseAIUpdateCreditTrace206.call(this, dt);
    const after206 = Number(game206?.teams?.enemy?.credits) || 0;
    const current206 = game206?.creditTraceCurrent206;
    if (current206) current206.enemyAIDelta = after206 - before206;
    return result206;
  };
  Object.defineProperty(wrappedAIUpdateCreditTrace206, '__fdCreditTrace206', { value: true });
  D.TacticalAI.prototype.update = wrappedAIUpdateCreditTrace206;
}

const baseSimulateCreditTrace206 = D.Game.prototype.simulateFixed;
if (typeof baseSimulateCreditTrace206 === 'function' && !baseSimulateCreditTrace206.__fdCreditTrace206) {
  const wrappedSimulateCreditTrace206 = function(dt) {
    const logistics206 = this.logistics206 || null;
    const beforePlayer206 = Number(this.teams?.player?.credits) || 0;
    const beforeEnemy206 = Number(this.teams?.enemy?.credits) || 0;
    const record206 = {
      tick: (Number(this.simTick) || 0) + 1,
      dt1e6: Math.round((Number(dt) || 0) * 1000000),
      playerBefore1e3: Math.round(beforePlayer206 * 1000),
      enemyBefore1e3: Math.round(beforeEnemy206 * 1000),
      enemyAIDelta: 0,
      incomeAccBefore1e6: Math.round((Number(logistics206?._incomeAccumulator206) || 0) * 1000000),
      importAccBefore1e6: Math.round((Number(logistics206?._importAccumulator206) || 0) * 1000000),
      supportSpentEnemyBefore1e3: Math.round((Number(logistics206?.team?.enemy?.supportSpent) || 0) * 1000),
      importSpentEnemyBefore1e3: Math.round((Number(logistics206?.team?.enemy?.importSpent) || 0) * 1000),
    };
    this.creditTraceCurrent206 = record206;
    try {
      return baseSimulateCreditTrace206.call(this, dt);
    } finally {
      const afterLogistics206 = this.logistics206 || null;
      const afterPlayer206 = Number(this.teams?.player?.credits) || 0;
      const afterEnemy206 = Number(this.teams?.enemy?.credits) || 0;
      record206.tick = Number(this.simTick) || record206.tick;
      record206.playerAfter1e3 = Math.round(afterPlayer206 * 1000);
      record206.enemyAfter1e3 = Math.round(afterEnemy206 * 1000);
      record206.playerDelta1e3 = Math.round((afterPlayer206 - beforePlayer206) * 1000);
      record206.enemyDelta1e3 = Math.round((afterEnemy206 - beforeEnemy206) * 1000);
      record206.enemyAIDelta1e3 = Math.round((Number(record206.enemyAIDelta) || 0) * 1000);
      record206.enemyOtherDelta1e3 = Math.round(((afterEnemy206 - beforeEnemy206) - (Number(record206.enemyAIDelta) || 0)) * 1000);
      record206.incomeAccAfter1e6 = Math.round((Number(afterLogistics206?._incomeAccumulator206) || 0) * 1000000);
      record206.importAccAfter1e6 = Math.round((Number(afterLogistics206?._importAccumulator206) || 0) * 1000000);
      record206.supportSpentEnemyAfter1e3 = Math.round((Number(afterLogistics206?.team?.enemy?.supportSpent) || 0) * 1000);
      record206.importSpentEnemyAfter1e3 = Math.round((Number(afterLogistics206?.team?.enemy?.importSpent) || 0) * 1000);
      delete this.creditTraceCurrent206;
      this.creditTrace206 ||= [];
      this.creditTrace206.push(record206);
      if (this.creditTrace206.length > 20) this.creditTrace206.splice(0, this.creditTrace206.length - 20);
    }
  };
  Object.defineProperty(wrappedSimulateCreditTrace206, '__fdCreditTrace206', { value: true });
  D.Game.prototype.simulateFixed = wrappedSimulateCreditTrace206;
}

function networkBaseComponents206() {
  if (!game) return null;
  const fold = (hash, value) => { hash ^= value >>> 0; return Math.imul(hash, 16777619) >>> 0; };
  const fp = item => {
    const c = item.currentCommand || {};
    const p = c.target || c.point || c.destination || c.position || {};
    const firstNumber = (...values) => {
      for (const value of values) if (Number.isFinite(Number(value))) return Number(value);
      return null;
    };
    const cx = firstNumber(c.x, c.targetX, c.buildX, c.destinationX, p.x);
    const cy = firstNumber(c.y, c.targetY, c.buildY, c.destinationY, p.y);
    const commandDetail = {
      type: c.type || '',
      x1000: cx == null ? null : Math.round(cx * 1000),
      y1000: cy == null ? null : Math.round(cy * 1000),
      targetId: String(c.targetId ?? c.entityId ?? c.target?.id ?? ''),
      buildType: String(c.buildingType ?? c.structureType ?? c.buildType ?? c.typeId ?? c.payload?.typeId ?? ''),
      phase: String(c.phase ?? c.state ?? ''),
    };
    return {
      id: String(item.id), team: canonicalTeamCode(item.team),
      x: Math.round((Number(item.x) || 0) * 4), y: Math.round((Number(item.y) || 0) * 4),
      hp: Math.round((Number(item.hp) || 0) * 10), command: c.type || '', commandDetail,
      supply160: Math.round((Number(item.supply160) || 0) * 1000000),
      speed1000: Math.round((Number(item.speedCurrent) || 0) * 1000),
      velocityX1000: Math.round((Number(item.velocityX) || 0) * 1000),
      velocityY1000: Math.round((Number(item.velocityY) || 0) * 1000),
    };
  };
  const hashList = list => {
    let hash = 2166136261 >>> 0;
    for (const item of list) {
      const value = fp(item);
      hash = fold(hash, idNumber(item.id)); hash = fold(hash, value.team); hash = fold(hash, value.x); hash = fold(hash, value.y); hash = fold(hash, value.hp);
      for (let i = 0; i < value.command.length; i += 1) hash = fold(hash, value.command.charCodeAt(i));
    }
    return hash >>> 0;
  };
  const aliveUnits = (game.units || []).filter(item => item?.alive);
  const aliveBuildings = (game.buildings || []).filter(item => item?.alive);
  const aliveProjectiles = (game.projectiles || []).filter(item => item?.alive);
  const byId = list => [...list].sort((a, b) => String(a.id).localeCompare(String(b.id), 'en'));
  let projectileHash = 2166136261 >>> 0;
  for (const item of aliveProjectiles) {
    projectileHash = fold(projectileHash, idNumber(item.id)); projectileHash = fold(projectileHash, canonicalTeamCode(item.team));
    projectileHash = fold(projectileHash, Math.round((Number(item.x) || 0) * 4)); projectileHash = fold(projectileHash, Math.round((Number(item.y) || 0) * 4));
    projectileHash = fold(projectileHash, Math.round((Number(item.altitude) || 0) * 4));
  }
  const canonicalPlayer = multiplayer.perspectiveSwapped ? game.teams?.enemy : game.teams?.player;
  const canonicalEnemy = multiplayer.perspectiveSwapped ? game.teams?.player : game.teams?.enemy;
  return {
    tick: Number(game.simTick) || 0,
    simTimeTick: Math.round((Number(game.time) || 0) * SIM_HZ),
    rngSeed: Number(game.rng?.seed || 0) >>> 0,
    playerCredits10: Math.round((Number(canonicalPlayer?.credits) || 0) * 10),
    enemyCredits10: Math.round((Number(canonicalEnemy?.credits) || 0) * 10),
    unitsOrderHash: hashList(aliveUnits), unitsSortedHash: hashList(byId(aliveUnits)),
    buildingsOrderHash: hashList(aliveBuildings), buildingsSortedHash: hashList(byId(aliveBuildings)),
    projectilesOrderHash: projectileHash >>> 0,
    unitOrder: aliveUnits.map(item => String(item.id)), buildingOrder: aliveBuildings.map(item => String(item.id)),
    units: byId(aliveUnits).map(fp), buildings: byId(aliveBuildings).map(fp),
    aiLogisticsTrace206: game.__aiLogisticsTrace206 || null,
    creditTrace206: Array.isArray(game.creditTrace206) ? game.creditTrace206.slice(-20) : [],
    logisticsPrivate206: game.logistics206 ? {
      incomeAccumulator1e6: Math.round((Number(game.logistics206._incomeAccumulator206) || 0) * 1000000),
      importAccumulator1e6: Math.round((Number(game.logistics206._importAccumulator206) || 0) * 1000000),
      enemySupportSpent1e3: Math.round((Number(game.logistics206.team?.enemy?.supportSpent) || 0) * 1000),
      enemyImportSpent1e3: Math.round((Number(game.logistics206.team?.enemy?.importSpent) || 0) * 1000),
    } : null,
  };
}

function networkStateHash(force = false) {
  if (!game) return '00000000';
  const tick = game.simTick || 0;
  const interval = game.units.length >= 50000 ? 50 : game.units.length >= 8000 ? 25 : 5;
  if (!force && tick % interval !== 0) return lastNetworkHash;
  if (!force && lastNetworkHashTick === tick) return lastNetworkHash;
  let hash = 2166136261 >>> 0;
  const mix = value => { hash ^= value >>> 0; hash = Math.imul(hash, 16777619) >>> 0; };
  mix(tick); mix(Math.round(game.time * SIM_HZ)); mix(game.rng?.seed || 0);
  const canonicalPlayer = multiplayer.perspectiveSwapped ? game.teams?.enemy : game.teams?.player;
  const canonicalEnemy = multiplayer.perspectiveSwapped ? game.teams?.player : game.teams?.enemy;
  mix(Math.round((canonicalPlayer?.credits || 0) * 10));
  mix(Math.round((canonicalEnemy?.credits || 0) * 10));
  lastNetworkLogisticsHash206 = Number(game.networkLogisticsHash206?.(multiplayer.perspectiveSwapped) || 0) >>> 0;
  lastNetworkLogisticsComponents206 = game.networkLogisticsComponents206?.(multiplayer.perspectiveSwapped) || null;
  mix(lastNetworkLogisticsHash206);
  const entities = [...game.units, ...game.buildings];
  for (const item of entities) {
    if (!item?.alive) continue;
    mix(idNumber(item.id)); mix(canonicalTeamCode(item.team));
    mix(Math.round(item.x * 4)); mix(Math.round(item.y * 4)); mix(Math.round(item.hp * 10));
    const command = item.currentCommand?.type || '';
    for (let i = 0; i < command.length; i += 1) mix(command.charCodeAt(i));
  }
  for (const projectile of game.projectiles) {
    if (!projectile?.alive) continue;
    mix(idNumber(projectile.id)); mix(canonicalTeamCode(projectile.team));
    mix(Math.round(projectile.x * 4)); mix(Math.round(projectile.y * 4)); mix(Math.round((projectile.altitude || 0) * 4));
  }
  lastNetworkBaseComponents206 = networkBaseComponents206();
  lastNetworkHash = (hash >>> 0).toString(16).padStart(8, '0');
  lastNetworkHashTick = tick;
  return lastNetworkHash;
}

function subsystemHashes(force = false) {
  return computeSubsystemHashes(force);
}

function swapPerspective() {
  [game.teams.player, game.teams.enemy] = [game.teams.enemy, game.teams.player];
  [game.playerBase, game.enemyBase] = [game.enemyBase, game.playerBase];
  if (game._v9SensorCache) [game._v9SensorCache.player, game._v9SensorCache.enemy] = [game._v9SensorCache.enemy, game._v9SensorCache.player];
  if (game._teamAirFleetState93) [game._teamAirFleetState93.player, game._teamAirFleetState93.enemy] = [game._teamAirFleetState93.enemy, game._teamAirFleetState93.player];
  if (game._v94MiniCells) {
    for (const cell of game._v94MiniCells.values()) [cell.p, cell.e] = [cell.e, cell.p];
    game._v94MiniDirty = true;
  }
  for (const group of game.formations?.values?.() || []) if ('team' in group) group.team = group.team === 'player' ? 'enemy' : group.team === 'enemy' ? 'player' : group.team;
  for (const collection of [game.units, game.buildings, game.projectiles, game.abilityZones, game.spyCells]) {
    for (const item of collection || []) {
      if ('team' in item) item.team = item.team === 'player' ? 'enemy' : item.team === 'enemy' ? 'player' : item.team;
      if ('ownerTeam' in item) item.ownerTeam = item.ownerTeam === 'player' ? 'enemy' : item.ownerTeam === 'enemy' ? 'player' : item.ownerTeam;
    }
  }
}

function withEventPerspective(event, operation) {
  if (!multiplayer.active || multiplayer.mode !== 'versus') return operation();
  const canonicalEnemy = event?.team === 'enemy';
  const needsSwap = canonicalEnemy !== Boolean(multiplayer.perspectiveSwapped);
  if (!needsSwap) return operation();
  swapPerspective();
  try { return operation(); }
  finally { swapPerspective(); }
}

function installHeadlessRuntime(instance) {
  instance.resize = () => {};
  instance.showHud = () => {};
  instance.hideHud = () => {};
  instance.updateUI = () => {};
  instance.render = () => {};
  instance.renderMinimap = () => {};
  instance.renderSelectionUI = () => {};
  instance.renderActionUI = () => {};
  instance.renderPowersUI = () => {};
  instance.updateCamera = () => {};
  instance.centerCamera = (x, y) => { instance.camera.x = x; instance.camera.y = y; };
  instance.sound = { ensure(){}, click(){}, build(){}, alert(){}, shot(){}, explosion(){} };
  const originalAddEffect = instance.addEffect.bind(instance);
  instance.addEffect = effect => {
    originalAddEffect(effect);
    const copy = plainClone(effect);
    if (copy) effectEvents.push(copy);
  };
  instance.alert = (message, type = 'info', x = null, y = null) => {
    alertEvents.push({ message: String(message), alertType: type, x: finite(x, null), y: finite(y, null), at: instance.time });
    if (alertEvents.length > 96) alertEvents.splice(0, 32);
    return true;
  };
  instance.endGame = victory => {
    if (instance.ended) return false;
    instance.ended = true;
    instance.paused = true;
    endEvent = { victory: Boolean(victory), time: instance.time, stats: plainClone(instance.stats) };
    return true;
  };
  legacySave = instance.save;
  instance.save = (notify = true) => {
    const data = captureSaveData();
    if (data) postMessage({ type: 'saveData', data, notify: Boolean(notify), autosave: !notify });
    return Boolean(data);
  };
  const oldCoreWorker = instance.operationalCore160?.worker;
  try { oldCoreWorker?.terminate?.(); } catch (_) {}
  if (instance.operationalCore160) {
    instance.operationalCore160.worker = null;
    instance.operationalCore160.workerReady = false;
    instance.operationalCore160.sendWorker = () => {};
  }
}

function restoreProjectiles(items) {
  game.projectiles.length = 0;
  for (const data of items || []) {
    try {
      const projectile = new D.Projectile(game, { ...data, preserveAim: true });
      projectile.age = finite(data.age);
      projectile.ttl = finite(data.ttl, projectile.ttl);
      projectile.altitude = finite(data.altitude, projectile.altitude);
      projectile.angle = finite(data.angle, projectile.angle);
      projectile.hp = finite(data.hp, projectile.hp);
      projectile.alive = data.alive !== false;
      projectile.intercepted = Boolean(data.intercepted);
      projectile.guidanceLost = Boolean(data.guidanceLost);
      game.projectiles.push(projectile);
    } catch (error) {
      console.warn('[v16.3 worker] projectile restore failed', error);
    }
  }
}

function canonicalFreshNetworkLogistics206(saveData, multiplayerState) {
  if (!saveData || !multiplayerState?.active || saveData.__mp) return saveData;

  // The lobby creates host and guest games independently before their
  // authoritative Workers launch.  Build-206 modules may have had a few local
  // presentation/startup ticks in that interval.  Persisting those locally
  // accumulated logistics fields would make otherwise identical Workers start
  // with different Fuel/Ammo/Support, sampling coordinates or support costs.
  // A fresh network match therefore derives logistics from canonical entity
  // definitions inside the Worker.  Resync snapshots carry __mp and are never
  // normalized here: their physical stocks/cargo are already authoritative.
  const rootLogistics = saveData.logistics206;
  if (rootLogistics?.team && saveData.teams) {
    // Reverse only build-206 pre-Worker expenditures.  Scheduled imports cannot
    // occur during normal lobby startup, but including them makes the reset
    // mathematically complete.  Financial income is second-gated and does not
    // execute before the initial Worker handoff.
    for (const teamKey of ['player', 'enemy']) {
      const team = saveData.teams?.[teamKey];
      const ledger = rootLogistics.team?.[teamKey];
      if (!team || !ledger) continue;
      const spent = Math.max(0, Number(ledger.supportSpent) || 0) + Math.max(0, Number(ledger.importSpent) || 0);
      if (spent > 0) team.credits = (Number(team.credits) || 0) + spent;
    }
  }
  delete saveData.logistics206;

  const visited = new Set();
  for (const collection of [saveData.entities, saveData.units, saveData.buildings]) {
    if (!Array.isArray(collection)) continue;
    for (const raw of collection) {
      if (!raw || typeof raw !== 'object' || visited.has(raw)) continue;
      visited.add(raw);
      delete raw.logistics206;
      delete raw.resourceType206;
      delete raw.resourceBufferMax206;
      // resourceBuffer83 is a physical extractor output buffer.  A fresh
      // network match starts it from the canonical empty state; production
      // after Worker tick zero remains fully physical and deterministic.
      if (Number.isFinite(raw.resourceBuffer83)) raw.resourceBuffer83 = 0;
    }
  }
  return saveData;
}

function initGame(message) {
  const saveData = canonicalFreshNetworkLogistics206(message.saveData || null, message.multiplayer || {});
  attachShared165(message.shared165 || null);
  multiplayer = { ...multiplayer, ...(message.multiplayer || {}), hostTickReceivedAt: performance.now(), appliedSeq: Number(message.multiplayer?.appliedSeq) || 0 };
  /* Constructor UI methods are replaced before instantiation. */
  for (const method of ['resize','showHud','hideHud','updateUI','render','renderMinimap','renderSelectionUI','renderActionUI','renderPowersUI']) {
    D.Game.prototype[method] = function noopHeadless() {};
  }
  const options = saveData ? {
    loadData: saveData,
    faction: saveData.teams?.player?.faction,
    enemyFaction: saveData.teams?.enemy?.faction,
    difficulty: saveData.difficultyKey,
    seed: saveData.seed
  } : {
    faction: message.faction || 'vanguard',
    enemyFaction: message.enemyFaction || 'dominion',
    difficulty: message.difficulty || 'normal',
    seed: Number(message.seed) || 123456
  };
  game = new D.Game(options);
  installHeadlessRuntime(game);
  if (multiplayer.active && multiplayer.mode === 'versus') {
    if (game.ai) game.ai.update = () => undefined;
    game.updateEnemyStrategicArsenal = () => undefined;
  }
  const extension = message.authoritative || saveData?.authoritative172 || {};
  if (Number.isFinite(extension.rngSeed) && game.rng) game.rng.seed = extension.rngSeed >>> 0;
  game.simTick = Number.isFinite(extension.simTick) ? extension.simTick : Math.round(game.time * SIM_HZ);
  game.idCounter = Math.max(game.idCounter || 1, extension.idCounter || 1);
  game.projectileCounter = Math.max(game.projectileCounter || 1, extension.projectileCounter || 1);
  game.formationCounter = Math.max(game.formationCounter || 1, extension.formationCounter || 1);
  restoreProjectiles(message.projectiles || extension.projectiles || []);
  game.paused = false;
  paused = Boolean(message.paused);
  manualMode = Boolean(message.manual);
  knownEntities = new Set();
  knownProjectiles = new Set();
  actionQueue = [];
  effectEvents = [];
  alertEvents = [];
  endEvent = null;
  lastSnapshotTick = -1;
  lastStructureTick = -1;
  lastFogTick = -1;
  lastMiniTick = -1;
  lastDetailsTick = -1;
  lastBuildingStateTick165 = -1;
  lastMinimapStateTick165 = -1;
  buildingStateSequence165 = 0;
  minimapStateSequence165 = 0;
  buildingStateCache165 = new Map();
  buildingDetailCache165 = new Map();
  sharedFallbacks165 = 0;
  ticksExecuted = 0;
  totalTickMs = 0;
  maxTickMs = 0;
  lastHashTick = -1; lastNetworkHashTick = -1; lastNetworkHash = '00000000'; lastNetworkLogisticsHash206 = 0; lastNetworkLogisticsComponents206 = null; lastNetworkBaseComponents206 = null; initialNetworkHash206 = '00000000'; initialNetworkLogisticsHash206 = 0; initialNetworkLogisticsComponents206 = null; initialNetworkBaseComponents206 = null;
  initialNetworkHash206 = networkStateHash(true);
  initialNetworkLogisticsHash206 = lastNetworkLogisticsHash206;
  initialNetworkLogisticsComponents206 = lastNetworkLogisticsComponents206 ? plainClone(lastNetworkLogisticsComponents206) : null;
  initialNetworkBaseComponents206 = lastNetworkBaseComponents206 ? plainClone(lastNetworkBaseComponents206) : null;
  running = true;
  workerStartedAt = performance.now();
  makeSnapshot(true);
  postMessage({
    type: 'ready', version: VERSION, build: BUILD, simHz: SIM_HZ,
    tick: game.simTick, time: game.time, stateHash: stateHash(),
    counts: { units: game.units.length, buildings: game.buildings.length, resources: game.resources.length, projectiles: game.projectiles.length }
  });
  if (!manualMode) startClock();
}

let hotSetRefreshTick173 = -1;
function deterministicHotSet() {
  if (!game?.renderSnapshot) return;
  const units = game.units;
  const count = units.length;
  const cadence = count >= 50000 ? 5 : count >= 20000 ? 4 : count >= 8000 ? 2 : 1;
  if (hotSetRefreshTick173 >= 0 && (game.simTick - hotSetRefreshTick173) < cadence) return;
  hotSetRefreshTick173 = game.simTick;
  const cap = count >= 50000 ? 128 : count >= 20000 ? 160 : count >= 8000 ? 300 : count >= 3000 ? 720 : Math.min(2200, count);
  const out = game.renderSnapshot.units || (game.renderSnapshot.units = []);
  out.length = 0;
  const stamp = (game.simTick || 0) + 1;
  const add = unit => {
    if (!unit?.alive || unit.embarkedIn || unit._fdHotStamp173 === stamp || out.length >= cap) return;
    unit._fdHotStamp173 = stamp; out.push(unit);
  };
  /* Camera and selection never participate. Combat, air missions and specialist tasks do. */
  for (let i = 0; i < count && out.length < cap; i += 1) {
    const unit = units[i];
    const recent = game.time - Math.max(unit.lastDamagedAt || -999, unit.lastShotAt || -999) < 3;
    const command = unit.currentCommand?.type || '';
    if (recent || unit.air || /repair|build|harvest|capture|infiltrate|air|transport|mine/i.test(command)) add(unit);
  }
  const start = count ? ((game.simTick * Math.max(1, cap)) % count) : 0;
  for (let offset = 0; offset < count && out.length < cap; offset += 1) add(units[(start + offset) % count]);
  game.selected.length = 0;
}

function applyAction(event) {
  if (!game || !event) return false;
  const payload = event.payload || {};
  const selected = (event.selectedIds || []).map(id => game.getEntity(id)).filter(entity => entity?.alive);
  const previous = game.selected;
  game.selected = selected;
  for (const entity of selected) entity.selected = true;
  const target = payload.targetId ? game.getEntity(payload.targetId) : null;
  let result = false;
  try {
    result = withEventPerspective(event, () => {
    if (payload.formationSettings && typeof payload.formationSettings === 'object') {
      game.formationSettings = plainClone(payload.formationSettings);
    }
    switch (event.action) {
      case 'move': {
        result = game.issueMove(payload.x, payload.y, payload.append);
        if (result !== false) {
          const tagged197 = self.__FD_FORMATION_TARGET_FIDELITY_197__?.tagIssuedOrder?.(
            game,
            event.selectedIds || [],
            { x: payload.x, y: payload.y },
            payload.append
          ) || 0;
          if (!tagged197) throw new Error('Build 197 move target was not attached to authoritative commands');
        }
        break;
      }
      case 'attack': result = target ? game.issueAttack(target, payload.append) : false; break;
      case 'attackMove': {
        result = game.issueAttackMove(payload.x, payload.y, payload.append);
        if (result !== false) {
          const tagged197 = self.__FD_FORMATION_TARGET_FIDELITY_197__?.tagIssuedOrder?.(
            game,
            event.selectedIds || [],
            { x: payload.x, y: payload.y },
            payload.append
          ) || 0;
          if (!tagged197) throw new Error('Build 197 attack-move target was not attached to authoritative commands');
        }
        break;
      }
      case 'patrol': result = game.issuePatrol(payload.x, payload.y, payload.append); break;
      case 'stop': result = game.issueStop(); break;
      case 'hold': result = game.issueHold(); break;
      case 'fireDiscipline177': result = game.issueFireDiscipline177?.(payload.mode); break;
      case 'orientedMove': result = game.issueOrientedMove78?.(payload.x, payload.y, payload.angle, payload.append); break;
      case 'context': {
        if (!target) {
          result = game.issueMove(payload.x, payload.y, payload.append);
          if (result !== false) {
            const tagged197 = self.__FD_FORMATION_TARGET_FIDELITY_197__?.tagIssuedOrder?.(
              game,
              event.selectedIds || [],
              { x: payload.x, y: payload.y },
              payload.append
            ) || 0;
            if (!tagged197) throw new Error('Build 197 context move target was not attached to authoritative commands');
          }
        } else {
          const previousContext = game.hitTestForContext;
          const previousHit = game.hitTest;
          game.hitTestForContext = () => target;
          game.hitTest = (_x, _y, selectableOnly = true) => selectableOnly ? previousHit.call(game, _x, _y, selectableOnly) : target;
          try { result = game.issueContext(payload.x, payload.y, payload.append); }
          finally { game.hitTestForContext = previousContext; game.hitTest = previousHit; }
        }
        break;
      }
      case 'covert': {
        const agents = (payload.unitIds || []).map(id => game.getEntity(id)).filter(Boolean);
        result = target ? game.issueCovertMission(target, payload.mission, payload.append, agents) : false;
        break;
      }
      case 'buildResourceExtractor': {
        const node = game.getEntity(payload.resourceId);
        const requestedWorkerIds = [...(payload.workerIds || [])];
        const workers = requestedWorkerIds
          .map(id => game.getEntity(id))
          .filter(unit => unit?.alive && unit.team === 'player' && unit.typeId === 'worker' && !unit.embarkedIn);
        if (!node?.alive || node.kind !== 'resource' || !workers.length || workers.length !== requestedWorkerIds.length) {
          result = false;
          break;
        }
        if (payload.resourceKnown !== true) {
          result = false;
          break;
        }
        const beforeUnits = new Map(game.units.filter(unit => unit?.alive).map(unit => [unit.id, unit]));
        const beforeBuildings = new Map(game.buildings.filter(building => building?.alive).map(building => [building.id, building]));
        const originalVisibleAt = game.isVisibleAt;
        const originalExploredAt = game.isExploredAt;
        const resourceKnownRadius = Math.max(160, Number(node.radius || 42) + 110);
        const knownPoint = (x, y) => Math.hypot(Number(x || 0) - node.x, Number(y || 0) - node.y) <= resourceKnownRadius;
        if (payload.resourceKnown) {
          if (typeof originalVisibleAt === 'function') {
            game.isVisibleAt = function(x, y, ...rest) {
              if (knownPoint(x, y)) return true;
              return originalVisibleAt.call(this, x, y, ...rest);
            };
          }
          if (typeof originalExploredAt === 'function') {
            game.isExploredAt = function(x, y, ...rest) {
              if (knownPoint(x, y)) return true;
              return originalExploredAt.call(this, x, y, ...rest);
            };
          }
        }
        try {
          result = game.buildExtractorFromResource83?.(node) ?? false;
        } finally {
          if (typeof originalVisibleAt === 'function') game.isVisibleAt = originalVisibleAt;
          if (typeof originalExploredAt === 'function') game.isExploredAt = originalExploredAt;
        }
        if (result !== false) {
          const missingUnits = [...beforeUnits.keys()].filter(id => !game.getEntity(id)?.alive);
          const missingBuildings = [...beforeBuildings.keys()].filter(id => !game.getEntity(id)?.alive);
          if (missingUnits.length || missingBuildings.length) {
            throw new Error(`Resource extractor build removed unrelated entities: units=${missingUnits.join(',')} buildings=${missingBuildings.join(',')}`);
          }
        }
        break;
      }
      case 'build': {
        const workers = (payload.workerIds || []).map(id => game.getEntity(id)).filter(unit => unit?.alive && unit.typeId === 'worker');
        game.buildMode = { typeId: payload.typeId, workerIds: workers.map(unit => unit.id), rotation: payload.rotation || 0 };
        result = game.placeBuilding(payload.x, payload.y, payload.append, payload.rotation);
        break;
      }
      case 'produce': {
        const building = game.getEntity(payload.buildingId);
        result = building ? game.queueProduction(building, payload.itemId, payload.kind || 'unit', false) : false;
        break;
      }
      case 'cancelProduction': {
        const building = game.getEntity(payload.buildingId);
        result = building ? game.cancelQueueItem(building, payload.index) : false;
        break;
      }
      case 'sell': result = game.sellSelectedBuilding(); break;
      case 'power': {
        const previousPowerIntent202 = game._fdCommandPowerIntent202;
        game._fdCommandPowerIntent202 = plainClone(payload.powerState);
        try { result = game.executePower(payload.power, payload.x, payload.y); }
        finally {
          if (previousPowerIntent202 === undefined) delete game._fdCommandPowerIntent202;
          else game._fdCommandPowerIntent202 = previousPowerIntent202;
        }
        break;
      }
      case 'strategic': result = game.launchStrategicWeapon(payload.weapon, payload.x, payload.y, payload.team || 'player', payload.launcherId || null); break;
      case 'rally': {
        const building = game.getEntity(payload.buildingId);
        result = building ? game.setRallyPoint91?.(building, payload.x, payload.y) : false;
        break;
      }
      case 'modify': {
        const unit = game.getEntity(payload.unitId);
        result = unit ? game.applyUnitModification?.(unit, payload.variant, false) : false;
        break;
      }
      case 'modifyBatch': result = game.applyUnitModificationBatch132?.(payload.unitIds || [], payload.variant, false); break;
      case 'loadTransport': {
        const transport = game.getEntity(payload.transportId);
        const units = (payload.unitIds || []).map(id => game.getEntity(id)).filter(Boolean);
        result = transport ? game.issueLoadTransport95?.(transport, units, payload.append) : false;
        break;
      }
      case 'unload': result = game.unloadSelectedTransports78?.(); break;
      case 'airReturn': result = game.issueAirReturn93?.(); break;
      case 'logisticsMission': result = game.setLogisticsMission206?.(plainClone(payload)) ?? false; break;
      case 'logisticsPriority': result = game.setSupplyPriority206?.(plainClone(payload)) ?? false; break;
      case 'logisticsThreshold': result = game.setSupplyThreshold206?.(plainClone(payload)) ?? false; break;
      case 'logisticsTrade': result = game.configureTradeContract206?.(plainClone(payload)) ?? false; break;
      case 'logisticsEmergencyImport': result = game.emergencyPurchase206?.(plainClone(payload)) ?? false; break;
      case 'logisticsCreateTransport': result = game.createSupplyTransport206?.(plainClone(payload)) ?? false; break;
      case 'unitCommand': {
        const unit = game.getEntity(payload.unitId);
        result = unit?.setCommand?.(plainClone(payload.command), Boolean(payload.append));
        break;
      }
      case 'unitStop': {
        const unit = game.getEntity(payload.unitId);
        result = unit?.stop?.();
        break;
      }
      default: result = false;
    }
    return result;
    });
  } finally {
    for (const entity of selected) entity.selected = false;
    game.selected = previous || [];
  }
  if (event.networkSeq) multiplayer.appliedSeq = Math.max(multiplayer.appliedSeq || 0, Number(event.networkSeq) || 0);
  const debug208 = event.action === 'logisticsMission' ? (() => { const ids=(payload.truckIds||payload.unitIds||[payload.truckId]).filter(Boolean); return { payload:plainClone(payload), trucks:ids.map(id=>{const unit=game.getEntity?.(id),s=unit?.logistics206;return {id:String(id),alive:Boolean(unit?.alive),team:unit?.team||null,missionType:s?.missionType||null,targetGroupId:s?.targetGroupId||null,phase206:s?.phase206||null,status:s?.status||null};}) }; })() : null;
  postMessage({ type: 'actionAck', seq: event.seq, networkSeq: event.networkSeq || 0, tick: game.simTick, ok: result !== false, action: event.action, debug208 });
  return result !== false;
}

function drainActions() {
  if (!actionQueue.length) return;
  actionQueue.sort((a, b) => (a.atTick - b.atTick) || (a.seq - b.seq));
  while (actionQueue.length && actionQueue[0].atTick <= game.simTick + 1) applyAction(actionQueue.shift());
}

function runTick() {
  if (!game || paused || game.ended) return 0;
  const started = performance.now();
  drainActions();
  deterministicHotSet();
  game.simulateFixed(SIM_DT);
  const core = game.operationalCore160;
  if (core?.update) {
    if (multiplayer.active && multiplayer.mode === 'versus') {
      const updateAI = core.updateAI, updateOperations = core.updateOperations;
      core.updateAI = () => {}; core.updateOperations = () => {};
      try { core.update(SIM_DT); } finally { core.updateAI = updateAI; core.updateOperations = updateOperations; }
    } else core.update(SIM_DT);
  }
  ticksExecuted += 1;
  const elapsed = performance.now() - started;
  totalTickMs += elapsed;
  maxTickMs = Math.max(maxTickMs, elapsed);
  const count = game.units.length;
  const snapshotEvery = count >= 80000 ? 8 : count >= 40000 ? 6 : count >= 12000 ? 4 : count >= 2500 ? 2 : 1;
  if ((game.simTick - lastSnapshotTick) >= snapshotEvery) makeSnapshot(false, elapsed);
  return elapsed;
}

function startClock() {
  if (timer) clearTimeout(timer);
  nextTickAt = performance.now();
  const pump = () => {
    timer = 0;
    if (!running || manualMode) return;
    const now = performance.now();
    let steps = 0;
    let guestTarget = Infinity;
    if (multiplayer.active && multiplayer.role === 'guest') {
      const age = now - (multiplayer.hostTickReceivedAt || 0);
      const fresh = Number.isFinite(multiplayer.hostTick) && age < 2400;
      guestTarget = fresh ? Math.max(0, Number(multiplayer.hostTick) + Math.floor(Math.max(0, age) / 40) - 6) : -1;
    }
    while (!paused && !game?.ended && now + 0.25 >= nextTickAt && steps < 4) {
      if (guestTarget >= 0 && (game.simTick || 0) >= guestTarget) break;
      if (guestTarget < 0) break;
      try {
        runTick();
      } catch (error) {
        running = false;
        postMessage({
          type: 'fatal',
          stage: 'tick',
          message: String(error?.message || error || 'unknown tick failure'),
          stack: String(error?.stack || ''),
          tick: Number(game?.simTick || 0),
        });
        return;
      }
      nextTickAt += 1000 / SIM_HZ;
      steps += 1;
    }
    if (paused || game?.ended || guestTarget < 0 || (guestTarget !== Infinity && (game?.simTick || 0) >= guestTarget)) nextTickAt = performance.now() + 1000 / SIM_HZ;
    if (performance.now() - nextTickAt > 200) nextTickAt = performance.now() + 1000 / SIM_HZ;
    const delay = clamp(nextTickAt - performance.now(), 0, 20);
    timer = setTimeout(pump, delay);
  };
  timer = setTimeout(pump, 0);
}

function makeMiniCells() {
  const result = [];
  for (const [key, cell] of game._v94MiniCells || []) {
    result.push({
      key, p: cell.p || 0, e: cell.e || 0, n: cell.n || 0,
      bands: (cell.bands || []).map(band => ({
        count: band.count || 0, x: band.x || 0, y: band.y || 0,
        dirX: band.dirX || 0, dirY: band.dirY || 0, typeId: band.typeId || null
      }))
    });
  }
  return result;
}

function renderPayload() {
  const bounds = mainView || { left: 0, top: 0, right: D.WORLD.width, bottom: D.WORLD.height, zoom: 1, selectedIds: [] };
  const margin = 360;
  const total = game.units.length;
  const strategic = total >= 16000 && finite(bounds.zoom, 1) < 0.66;
  const detailLimit = strategic ? 260 : total >= 40000 ? 700 : total >= 12000 ? 1200 : 2600;
  const selectedSet = new Set(bounds.selectedIds || []);
  const ids = [];
  const seen = new Set();
  const add = unit => {
    if (!unit?.alive || unit.embarkedIn || seen.has(unit.id) || ids.length >= detailLimit) return;
    if (unit.team === 'enemy' && (!game.isVisibleAt(unit.x, unit.y) || (game.isTargetableBy && !game.isTargetableBy(unit, 'player')))) return;
    seen.add(unit.id); ids.push(idNumber(unit.id));
  };
  for (const id of selectedSet) add(game.getEntity(id));
  if (!strategic) {
    for (const unit of game.units) {
      if (unit.x < bounds.left - margin || unit.x > bounds.right + margin || unit.y < bounds.top - margin || unit.y > bounds.bottom + margin) continue;
      add(unit);
      if (ids.length >= detailLimit) break;
    }
  }
  const clusters = [];
  if (strategic) {
    for (const [key, cell] of game._v94MiniCells || []) {
      const cx = key & 255, cy = key >> 8;
      const centerX = (cx + 0.5) * 360, centerY = (cy + 0.5) * 360;
      if (centerX < bounds.left - 360 || centerX > bounds.right + 360 || centerY < bounds.top - 360 || centerY > bounds.bottom + 360) continue;
      for (let bandIndex = 0; bandIndex < (cell.bands || []).length; bandIndex += 1) {
        const band = cell.bands[bandIndex];
        if (!band?.count) continue;
        const team = bandIndex < 2 ? 'player' : bandIndex < 4 ? 'enemy' : 'neutral';
        const air = (bandIndex % 2) === 1;
        const x = (band.x || centerX * band.count) / band.count;
        const y = (band.y || centerY * band.count) / band.count;
        if (team === 'enemy' && !game.isVisibleAt(x, y)) continue;
        clusters.push({ team, air, typeId: band.typeId, x, y, count: band.count, hp: 1, rotation: Math.atan2(band.dirY || 0, band.dirX || (team === 'enemy' ? -1 : 1)) });
      }
    }
  }
  return { unitIds: new Uint32Array(ids), clusters };
}

function dynamicDetails(force = false) {
  const selected = new Set(mainView.selectedIds || []);
  const bounds = mainView;
  const margin = 420;
  const records = [];
  const max = game.units.length >= 16000 ? 1000 : 3000;
  for (const unit of game.units) {
    if (!unit.alive) continue;
    const inView = bounds && unit.x >= bounds.left - margin && unit.x <= bounds.right + margin && unit.y >= bounds.top - margin && unit.y <= bounds.bottom + margin;
    const logisticsCritical208 = Boolean(
      unit.currentCommand?.type === 'logistics206' ||
      self.__FD_LOGISTICS206__?.isTruck?.(unit) ||
      (Number(unit._fdLogisticsDetailUntil208) || 0) >= (Number(game.time) || 0)
    );
    if (!force && !selected.has(unit.id) && !inView && !logisticsCritical208) continue;
    records.push(serializeEntity(unit));
    if (records.length >= max) break;
  }
  return records;
}


function buildingStateSignature165(building) {
  return [
    Math.round(finite(building.x) * 8), Math.round(finite(building.y) * 8), Math.round(finite(building.rotation) * 4096),
    Math.round(finite(building.hp) * 10), Math.round(finite(building.maxHp, 1) * 10), Math.round(finite(building.construction, 1) * 1000),
    Math.round(finite(building.weaponRotation) * 4096), Math.round(finite(building.desiredWeaponRotation) * 4096),
    Math.round(finite(building.weaponCooldown) * 100), Math.round(finite(building.recoil) * 100),
    Math.round(finite(building.captureProgress) * 1000), Math.round(finite(building.sabotagedUntil) * 10), Math.round(finite(building.compromisedUntil) * 10),
    TEAM_CODES[building.team] || 0, idNumber(building.weaponTargetId), building.queue?.length || 0, building.completed ? 1 : 0
  ].join(',');
}

function buildingDetailSignature165(building) {
  const authority203 = self.__FD_RECON_MEMORY_QUEUE_203__;
  if (!authority203?.queueSignature) throw new Error('Build 203 production queue authority is unavailable');
  const logistics = building.logistics206 || null;
  const stock = logistics?.stock || null;
  const imported = logistics?.importBuffer || null;
  return [
    authority203.queueSignature(building), logistics?.priority || '', logistics?.nodeType || '',
    Math.round((stock?.fuel || 0) * 10), Math.round((stock?.ammo || 0) * 10), Math.round((stock?.support || 0) * 10),
    Math.round((imported?.fuel || 0) * 10), Math.round((imported?.ammo || 0) * 10),
    Math.round((building.resourceBuffer83 || 0) * 10), building.resourceType206 || ''
  ].join('|');
}

function sendBuildingState165(force = false) {
  if (!game) return;
  const tick = game.simTick || 0;
  if (!force && tick - lastBuildingStateTick165 < 5) return;
  lastBuildingStateTick165 = tick;
  const alive = game.buildings.filter(building => building.alive);
  const changed = [];
  const details = [];
  const aliveIds = new Set();
  for (const building of alive) {
    aliveIds.add(building.id);
    const sig = buildingStateSignature165(building);
    if (force || buildingStateCache165.get(building.id) !== sig) {
      buildingStateCache165.set(building.id, sig);
      changed.push(building);
    }
    const detailSig = buildingDetailSignature165(building);
    if (force || buildingDetailCache165.get(building.id) !== detailSig) {
      buildingDetailCache165.set(building.id, detailSig);
      details.push(serializeEntity(building));
    }
  }
  for (const id of [...buildingStateCache165.keys()]) if (!aliveIds.has(id)) buildingStateCache165.delete(id);
  for (const id of [...buildingDetailCache165.keys()]) if (!aliveIds.has(id)) buildingDetailCache165.delete(id);
  if (!force && !changed.length && !details.length) return;
  const ids = new Uint32Array(changed.length);
  const floats = new Float32Array(changed.length * BUILDING_FLOAT_STRIDE);
  const ints = new Int32Array(changed.length * BUILDING_INT_STRIDE);
  for (let index = 0; index < changed.length; index += 1) {
    const building = changed[index], f = index * BUILDING_FLOAT_STRIDE, n = index * BUILDING_INT_STRIDE;
    ids[index] = idNumber(building.id);
    floats[f] = finite(building.x); floats[f+1] = finite(building.y); floats[f+2] = finite(building.rotation);
    floats[f+3] = finite(building.hp); floats[f+4] = finite(building.maxHp, 1); floats[f+5] = finite(building.construction, 1);
    floats[f+6] = finite(building.weaponRotation); floats[f+7] = finite(building.desiredWeaponRotation); floats[f+8] = finite(building.weaponCooldown);
    floats[f+9] = finite(building.recoil); floats[f+10] = finite(building.captureProgress); floats[f+11] = finite(building.sabotagedUntil); floats[f+12] = finite(building.compromisedUntil);
    ints[n] = TEAM_CODES[building.team] || 0; ints[n+1] = 1; ints[n+2] = idNumber(building.weaponTargetId);
    ints[n+3] = building.queue?.length || 0; ints[n+4] = building.completed ? 1 : 0;
  }
  const bytes165 = ids.byteLength + floats.byteLength + ints.byteLength;
  postMessage({ type: 'buildingState165', sequence: ++buildingStateSequence165, tick, buildingIds: ids, buildingFloats: floats, buildingInts: ints, details, bytes165 }, [ids.buffer, floats.buffer, ints.buffer]);
}

function sendMinimapState165(force = false) {
  if (!game) return;
  const tick = game.simTick || 0;
  if (!force && tick - lastMinimapStateTick165 < 5) return;
  lastMinimapStateTick165 = tick;
  const visible = game.visible.slice();
  const explored = game.explored.slice();
  const miniCells = makeMiniCells();
  const bytes165 = visible.byteLength + explored.byteLength + miniCells.length * 40;
  postMessage({ type: 'minimapState165', sequence: ++minimapStateSequence165, tick, visible, explored, miniCells, bytes165 }, [visible.buffer, explored.buffer]);
}

function makeSnapshot(force = false, simMs = 0) {
  if (!game) return;
  const tick = game.simTick || Math.round(game.time * SIM_HZ);
  const aliveEntities = new Set();
  const createdEntities = [];
  for (const entity of [...game.units, ...game.buildings, ...game.resources]) {
    if (!entity.alive) continue;
    aliveEntities.add(entity.id);
    if (!knownEntities.has(entity.id)) createdEntities.push(serializeEntity(entity));
  }
  const removedEntities = [...knownEntities].filter(id => !aliveEntities.has(id));
  knownEntities = aliveEntities;

  const aliveProjectiles = new Set();
  const createdProjectiles = [];
  for (const projectile of game.projectiles) {
    if (!projectile.alive) continue;
    aliveProjectiles.add(projectile.id);
    if (!knownProjectiles.has(projectile.id)) createdProjectiles.push(serializeProjectile(projectile));
  }
  const removedProjectiles = [...knownProjectiles].filter(id => !aliveProjectiles.has(id));
  knownProjectiles = aliveProjectiles;

  const render = renderPayload();
  const renderNumbers = new Set(render.unitIds);
  const selectedNumbers = new Set((mainView.selectedIds || []).map(idNumber));
  const allAliveUnits = game.units.filter(unit => unit.alive);
  let units;
  if (multiplayer.active || force || allAliveUnits.length < 3000) units = allAliveUnits;
  else {
    const cap = allAliveUnits.length >= 40000 ? 1400 : allAliveUnits.length >= 12000 ? 1900 : 2600;
    const chosen = [], seen = new Set();
    const add = unit => { if (!unit?.alive || seen.has(unit.id) || chosen.length >= cap) return; seen.add(unit.id); chosen.push(unit); };
    for (const unit of allAliveUnits) {
      const number = idNumber(unit.id);
      const recent = game.time - Math.max(unit.lastDamagedAt || -999, unit.lastShotAt || -999) < 3;
      if (renderNumbers.has(number) || selectedNumbers.has(number) || recent || unit.airServiceState) add(unit);
    }
    const cold = allAliveUnits.length >= 40000 ? 420 : allAliveUnits.length >= 12000 ? 650 : 900;
    const offset = allAliveUnits.length ? ((tick * cold) % allAliveUnits.length) : 0;
    for (let i = 0; i < allAliveUnits.length && i < cold * 2 && chosen.length < cap; i += 1) add(allAliveUnits[(offset + i) % allAliveUnits.length]);
    units = chosen;
  }
  const aliveProjectiles165 = game.projectiles.filter(projectile => projectile.alive);
  const sharedSlot165 = reserveSharedSlot165(units.length, aliveProjectiles165.length, render.unitIds.length);
  const unitBase165 = sharedSlot165 >= 0 ? sharedSlot165 * shared165.maxUnits : 0;
  const unitIds = sharedSlot165 >= 0 ? shared165.unitIds.subarray(unitBase165, unitBase165 + units.length) : new Uint32Array(units.length);
  const unitFloats = sharedSlot165 >= 0 ? shared165.unitFloats.subarray(unitBase165 * UNIT_FLOAT_STRIDE, (unitBase165 + units.length) * UNIT_FLOAT_STRIDE) : new Float32Array(units.length * UNIT_FLOAT_STRIDE);
  const unitInts = sharedSlot165 >= 0 ? shared165.unitInts.subarray(unitBase165 * UNIT_INT_STRIDE, (unitBase165 + units.length) * UNIT_INT_STRIDE) : new Int32Array(units.length * UNIT_INT_STRIDE);
  for (let index = 0; index < units.length; index += 1) {
    const unit = units[index], f = index * UNIT_FLOAT_STRIDE, n = index * UNIT_INT_STRIDE;
    unitIds[index] = idNumber(unit.id);
    unitFloats[f] = finite(unit.x); unitFloats[f+1] = finite(unit.y); unitFloats[f+2] = finite(unit.rotation);
    unitFloats[f+3] = finite(unit.hp); unitFloats[f+4] = finite(unit.maxHp, 1); unitFloats[f+5] = finite(unit.weaponCooldown);
    unitFloats[f+6] = finite(unit.visualSpeed); unitFloats[f+7] = finite(unit.flightAltitude ?? unit.altitude);
    unitFloats[f+8] = finite(unit.airBank); unitFloats[f+9] = finite(unit.airPitch);
    unitFloats[f+10] = Number.isFinite(unit.airAmmo) ? unit.airAmmo : -1; unitFloats[f+11] = Number.isFinite(unit.airAmmoMax) ? unit.airAmmoMax : -1;
    unitFloats[f+12] = Number.isFinite(unit.sortieFuel) ? unit.sortieFuel : -1; unitFloats[f+13] = Number.isFinite(unit.sortieFuelMax) ? unit.sortieFuelMax : -1;
    unitFloats[f+14] = finite(unit.suppression160); unitFloats[f+15] = finite(unit.cohesion160, 1);
    unitFloats[f+16] = finite(unit.supply160, 1); unitFloats[f+17] = finite(unit.morale160, 1);
    unitFloats[f+18] = finite(unit.coverIntegrity, 1); unitFloats[f+19] = finite(unit.revealTimer);
    unitFloats[f+20] = finite(unit.lastDamagedAt, -999); unitFloats[f+21] = finite(unit.lastShotAt, -999);
    let flags = 1;
    if (unit.air) flags |= 2; if (unit.embarkedIn) flags |= 4; if (unit.cloaked) flags |= 8; if (unit.undercover) flags |= 16;
    if (unit.vehicle) flags |= 32; if (unit.infantry) flags |= 64; if (unit._v160Retreating) flags |= 128;
    unitInts[n] = TEAM_CODES[unit.team] || 0; unitInts[n+1] = flags; unitInts[n+2] = unit.rank || 1; unitInts[n+3] = Math.round(finite(unit.cargo));
    unitInts[n+4] = COMMAND_CODES[unit.currentCommand?.type || ''] || 0;
    unitInts[n+5] = idNumber(unit.currentCommand?.targetId || unit.currentCommand?.buildingId || unit.currentCommand?.resourceId);
    unitInts[n+6] = SERVICE_CODES[unit.airServiceState || ''] || 0; unitInts[n+7] = idNumber(unit.embarkedIn);
  }

  const buildings = game.buildings.filter(building => building.alive);

  const resources = game.resources.filter(resource => resource.alive);
  const resourceIds = new Uint32Array(resources.length);
  const resourceFloats = new Float32Array(resources.length * RESOURCE_FLOAT_STRIDE);
  for (let index = 0; index < resources.length; index += 1) {
    const resource = resources[index], f = index * RESOURCE_FLOAT_STRIDE;
    resourceIds[index] = idNumber(resource.id); resourceFloats[f] = finite(resource.x); resourceFloats[f+1] = finite(resource.y);
    resourceFloats[f+2] = finite(resource.amount); resourceFloats[f+3] = finite(resource.maxAmount); resourceFloats[f+4] = finite(resource.regenTimer);
  }

  const projectiles = aliveProjectiles165;
  const projectileBase165 = sharedSlot165 >= 0 ? sharedSlot165 * shared165.maxProjectiles : 0;
  const projectileIds = sharedSlot165 >= 0 ? shared165.projectileIds.subarray(projectileBase165, projectileBase165 + projectiles.length) : new Uint32Array(projectiles.length);
  const projectileFloats = sharedSlot165 >= 0 ? shared165.projectileFloats.subarray(projectileBase165 * PROJECTILE_FLOAT_STRIDE, (projectileBase165 + projectiles.length) * PROJECTILE_FLOAT_STRIDE) : new Float32Array(projectiles.length * PROJECTILE_FLOAT_STRIDE);
  const projectileInts = sharedSlot165 >= 0 ? shared165.projectileInts.subarray(projectileBase165 * PROJECTILE_INT_STRIDE, (projectileBase165 + projectiles.length) * PROJECTILE_INT_STRIDE) : new Int32Array(projectiles.length * PROJECTILE_INT_STRIDE);
  for (let index = 0; index < projectiles.length; index += 1) {
    const projectile = projectiles[index], f = index * PROJECTILE_FLOAT_STRIDE, n = index * PROJECTILE_INT_STRIDE;
    projectileIds[index] = idNumber(projectile.id);
    projectileFloats[f] = finite(projectile.x); projectileFloats[f+1] = finite(projectile.y); projectileFloats[f+2] = finite(projectile.angle);
    projectileFloats[f+3] = finite(projectile.altitude); projectileFloats[f+4] = finite(projectile.hp); projectileFloats[f+5] = finite(projectile.maxHp);
    projectileFloats[f+6] = finite(projectile.targetX); projectileFloats[f+7] = finite(projectile.targetY);
    projectileFloats[f+8] = finite(projectile.age); projectileFloats[f+9] = finite(projectile.ttl);
    projectileFloats[f+10] = finite(projectile.visualSize, 3); projectileFloats[f+11] = finite(projectile.launchAltitude); projectileFloats[f+12] = finite(projectile.distanceTravelled);
    let flags = 1; if (projectile.ballistic) flags |= 2; if (projectile.intercepted) flags |= 4; if (projectile.guidanceLost) flags |= 8;
    projectileInts[n] = TEAM_CODES[projectile.team] || 0; projectileInts[n+1] = flags; projectileInts[n+2] = idNumber(projectile.targetId);
    projectileInts[n+3] = projectile.defenseClass === 'hypersonic' ? 3 : projectile.defenseClass === 'high' ? 2 : projectile.defenseClass === 'medium' ? 1 : 0;
    projectileInts[n+4] = idNumber(projectile.sourceId); projectileInts[n+5] = 0;
  }

  const detailsDue = force || tick - lastDetailsTick >= (game.units.length >= 16000 ? 10 : 5);
  const structureDue = force || createdEntities.length || removedEntities.length || createdProjectiles.length || removedProjectiles.length || tick - lastStructureTick >= 25;
  if (detailsDue) lastDetailsTick = tick;
  if (structureDue) lastStructureTick = tick;

  lastStateHash = stateHash(force);
  lastSubsystemHashes = subsystemHashes(force);
  const networkHash = networkStateHash(force);
  const sequence165 = ++snapshotSequence;
  if (sharedSlot165 >= 0) {
    const renderBase165 = sharedSlot165 * shared165.maxRenderIds;
    shared165.renderIds.subarray(renderBase165, renderBase165 + render.unitIds.length).set(render.unitIds);
    publishSharedSlot165(sharedSlot165, sequence165, tick, units.length, projectiles.length, render.unitIds.length);
  }
  const message = {
    type: 'snapshot', version: VERSION, build: BUILD, sequence: sequence165, wallClock165: Date.now(),
    tick, time: game.time, simMs, stateHash: lastStateHash, subsystemHashes: lastSubsystemHashes, networkHash, networkHashTick: lastNetworkHashTick, networkLogisticsHash206: lastNetworkLogisticsHash206, networkLogisticsComponents206: lastNetworkLogisticsComponents206, networkBaseComponents206: lastNetworkBaseComponents206, initialNetworkHash206, initialNetworkLogisticsHash206, initialNetworkLogisticsComponents206, initialNetworkBaseComponents206, appliedSeq: multiplayer.appliedSeq || 0, rngSeed: game.rng?.seed || game.seed,
    counts: { units: allAliveUnits.length, buildings: buildings.length, resources: resources.length, projectiles: projectiles.length },
    counters: { idCounter: game.idCounter, projectileCounter: game.projectileCounter, formationCounter: game.formationCounter },
    unitIds: sharedSlot165 >= 0 ? null : unitIds, unitFloats: sharedSlot165 >= 0 ? null : unitFloats, unitInts: sharedSlot165 >= 0 ? null : unitInts,
    buildingIds: null, buildingFloats: null, buildingInts: null, resourceIds, resourceFloats,
    projectileIds: sharedSlot165 >= 0 ? null : projectileIds, projectileFloats: sharedSlot165 >= 0 ? null : projectileFloats, projectileInts: sharedSlot165 >= 0 ? null : projectileInts,
    renderUnitIds: sharedSlot165 >= 0 ? null : render.unitIds, sharedSlot165, sharedFallbacks165, clusters: render.clusters,
    createdEntities: structureDue ? createdEntities : [], removedEntities: structureDue ? removedEntities : [],
    createdProjectiles: structureDue ? createdProjectiles : [], removedProjectiles: structureDue ? removedProjectiles : [],
    details: detailsDue ? dynamicDetails(force) : [],
    visible: null, explored: null, miniCells: null,
    teams: {
      player: game.serializeTeam(game.teams.player), enemy: game.serializeTeam(game.teams.enemy)
    },
    stats: plainClone(game.stats), objective: game.objective,
    formations: (force || tick % 8 === 0) ? [...(game.formations || new Map()).values()].map(group => plainClone(group)) : null,
    operationalCore160: (force || tick % 25 === 0) ? (() => { const data = game.operationalCore160?.serialize?.() || null; if (data) { data.commandLog = (data.commandLog || []).slice(-128); data.hashHistory = (data.hashHistory || []).slice(-32); } return data; })() : null,
    logistics206: (force || tick % 25 === 0) ? (game.exportLogistics206?.() || null) : null,
    abilityZones: (force || tick % 8 === 0) ? game.abilityZones.filter(zone => zone.alive).map(zone => zone.serialize?.() || plainClone(zone)) : null,
    spyCells: (force || tick % 12 === 0) ? plainClone(game.spyCells) : null,
    minefields141: (force || tick % 8 === 0) ? plainClone(game.minefields141 || game.mineFields141 || []) : null,
    effects: effectEvents.splice(0), alerts: alertEvents.splice(0), endEvent: endEvent ? { ...endEvent } : null,
    performance: {
      ticksExecuted, averageTickMs: ticksExecuted ? totalTickMs / ticksExecuted : 0,
      maxTickMs, uptimeMs: performance.now() - workerStartedAt, actionQueue: actionQueue.length,
      snapshotBytes: (sharedSlot165 >= 0 ? 0 : unitIds.byteLength + unitFloats.byteLength + unitInts.byteLength + projectileIds.byteLength + projectileFloats.byteLength + projectileInts.byteLength + render.unitIds.byteLength) + resourceIds.byteLength + resourceFloats.byteLength, transport165: sharedSlot165 >= 0 ? 'shared-triple' : 'transfer-fallback', combat166: game.combatScaleDiagnostics166?.() || null, deep182: game.deepOperationsDiagnostics182?.() || null, formation183: game.formationMarchDiagnostics183?.() || null, fortress183: game.fortressDefenseDiagnostics183?.() || null, action184: game.actionGroupDiagnostics184?.() || null, objective184: game.constructionVictoryDiagnostics184?.() || null
    }
  };
  const transfers = [resourceIds.buffer, resourceFloats.buffer];
  if (sharedSlot165 < 0) transfers.push(unitIds.buffer, unitFloats.buffer, unitInts.buffer, projectileIds.buffer, projectileFloats.buffer, projectileInts.buffer, render.unitIds.buffer);
  postMessage(message, transfers);
  sendBuildingState165(force);
  sendMinimapState165(force);
  lastSnapshotTick = tick;
}

self.onmessage = event => {
  const message = event.data || {};
  try {
    switch (message.type) {
      case 'init': initGame(message); break;
      case 'action': {
        if (message.resumeIfMainRunning && paused && !game?.ended) {
          paused = false;
          if (game) game.paused = false;
          nextTickAt = performance.now();
        }
        actionSequence = Math.max(actionSequence, message.seq || 0);
        actionQueue.push({ ...message, seq: message.seq || ++actionSequence, atTick: Number.isFinite(message.atTick) ? message.atTick : (game?.simTick || 0) + 1 });
        break;
      }
      case 'view': mainView = { ...mainView, ...(message.view || {}) }; break;
      case 'clockSync': multiplayer.hostTick = Number(message.tick) || 0; multiplayer.hostTickReceivedAt = performance.now(); break;
      case 'multiplayer': {
        multiplayer = { ...multiplayer, ...(message.multiplayer || {}) };
        if (game && multiplayer.active && multiplayer.mode === 'versus') {
          if (game.ai) game.ai.update = () => undefined;
          game.updateEnemyStrategicArsenal = () => undefined;
        }
        break;
      }
      case 'pause': paused = Boolean(message.paused); if (game) game.paused = false; nextTickAt = performance.now() + 1000 / SIM_HZ; break;
      case 'step': {
        const count = clamp(Number(message.count) || 1, 1, 5000);
        for (let index = 0; index < count; index += 1) runTick();
        makeSnapshot(Boolean(message.force));
        break;
      }
      case 'saveRequest': {
        const data = captureSaveData();
        postMessage({ type: 'saveData', requestId: message.requestId, data, notify: Boolean(message.notify) });
        break;
      }
      case 'snapshotRequest': makeSnapshot(true); break;
      case 'diagnosticsRequest': postMessage({
        type: 'diagnostics', requestId: message.requestId, version: VERSION, build: BUILD,
        authoritative: true, tick: game?.simTick || 0, time: game?.time || 0,
        paused, running, manualMode, stateHash: stateHash(true), subsystemHashes: subsystemHashes(true), networkHash: networkStateHash(true), multiplayer: { ...multiplayer },
        aiEnabled: !(multiplayer.active && multiplayer.mode === 'versus'),
        counts: game ? { units: game.units.length, buildings: game.buildings.length, resources: game.resources.length, projectiles: game.projectiles.length } : null,
        hierarchical164: game?.hierarchicalDiagnostics164?.() || null,
        mass163: game?.massDiagnostics163?.() || null,
        groupMovement201: self.__FD_GROUP_MOVEMENT_201__?.diagnostics?.() || null,
        commandPower202: self.__FD_COMMAND_POWER_AUTHORITY_202__?.diagnostics?.() || null,
        reconMemoryQueue203: self.__FD_RECON_MEMORY_QUEUE_203__?.diagnostics?.() || null,
        performance: { ticksExecuted, averageTickMs: ticksExecuted ? totalTickMs / ticksExecuted : 0, maxTickMs, actionQueue: actionQueue.length, combat166: game?.combatScaleDiagnostics166?.() || null }
      }); break;
      case 'shutdown': running = false; if (timer) clearTimeout(timer); timer = 0; close(); break;
      default: break;
    }
  } catch (error) {
    postMessage({ type: 'fatal', stage: message.type || 'message', message: error.message, stack: error.stack, tick: game?.simTick || 0 });
  }
};

postMessage({ type: 'bundleReady', version: VERSION, build: BUILD, classes: true });
