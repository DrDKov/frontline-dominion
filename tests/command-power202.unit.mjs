import assert from 'node:assert/strict';

const POWER_TYPES = {
  scan: { name: 'Разведывательный импульс', rank: 1, cooldown: 42 },
};

class MockGame {
  constructor() {
    this.time = 20;
    this.commandMode = null;
    this.abilityZones = [];
    this.alerts = [];
    this.teams = {
      player: { powerProduced: 165, powerUsed: 75, powerFactor: 1, rank: 1, powers: { scan: 0 } },
    };
    this.buildings = [
      ...Array.from({ length: 3 }, (_, index) => ({
        id: `power-${index}`, alive: true, completed: true, team: 'player', sabotagedUntil: 0,
        stats: { power: 55, powerUse: 0 },
      })),
      { id: 'load', alive: true, completed: true, team: 'player', sabotagedUntil: 0, stats: { power: 0, powerUse: 75 } },
    ];
  }

  alert(message, type) {
    this.alerts.push({ message: String(message), type });
  }

  isPowerGridOnline126() {
    return false;
  }

  activatePower(type) {
    if (!this.isPowerGridOnline126('player')) {
      this.alert('legacy false negative', 'warning');
      return false;
    }
    this.commandMode = `power:${type}`;
    return true;
  }

  executePower(type, x, y) {
    if (!this.isPowerGridOnline126('player')) {
      this.alert('legacy false negative', 'warning');
      return false;
    }
    this.teams.player.powers[type] = POWER_TYPES[type].cooldown;
    this.abilityZones.push({ type, team: 'player', x, y, duration: 12, age: 0 });
    this.commandMode = null;
    return true;
  }
}

globalThis.__FD_DEBUG__ = { Game: MockGame, POWER_TYPES };
await import('../src/v202/command-power-authority-v202.js');

const api = globalThis.__FD_COMMAND_POWER_AUTHORITY_202__;
assert.equal(api?.build, 202);

const online = new MockGame();
assert.deepEqual(
  Object.fromEntries(Object.entries(online.commandPowerStatus202('player')).filter(([key]) => ['produced', 'used', 'reserve', 'online', 'source'].includes(key))),
  { produced: 165, used: 75, reserve: 90, online: true, source: 'live-buildings' },
);
assert.equal(online.activatePower('scan'), true);
assert.equal(online.executePower('scan', 900, 1200), true);
assert.equal(online.abilityZones.length, 1);
assert.equal(online.alerts.length, 0);

const deficit = new MockGame();
deficit.buildings = [
  { id: 'power', alive: true, completed: true, team: 'player', sabotagedUntil: 0, stats: { power: 55 } },
  { id: 'load', alive: true, completed: true, team: 'player', sabotagedUntil: 0, stats: { powerUse: 75 } },
];
deficit.teams.player.powerProduced = 55;
deficit.teams.player.powerUsed = 75;
assert.equal(deficit.executePower('scan', 900, 1200), false);
assert.match(deficit.alerts.at(-1).message, /потребление 75, генерация 55/);

deficit.alerts.length = 0;
deficit._fdCommandPowerIntent202 = {
  team: 'player', produced: 165, used: 75, online: true, reserve: 90, atTime: 20, build: 202,
};
assert.equal(deficit.executePower('scan', 1100, 1400), true);
assert.equal(deficit.abilityZones.length, 1);
assert.equal(deficit.alerts.length, 0);

const intent = online.commandPowerIntent202('player');
assert.deepEqual(
  Object.fromEntries(Object.entries(intent).filter(([key]) => ['team', 'produced', 'used', 'online', 'reserve', 'build'].includes(key))),
  { team: 'player', produced: 165, used: 75, online: true, reserve: 90, build: 202 },
);
assert.ok(api.state.checks >= 6);
assert.ok(api.state.intentAllows >= 1);
assert.ok(api.state.blocks >= 1);

delete globalThis.__FD_DEBUG__;
delete globalThis.__FD_COMMAND_POWER_AUTHORITY_202__;

console.log(JSON.stringify({ ok: true, diagnostics: api.diagnostics() }));
