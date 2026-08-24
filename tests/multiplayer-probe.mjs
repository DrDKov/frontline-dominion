import { baseUrl, expectedBuild } from './lib/fd-env.mjs';

process.env.FD_EXPECTED_BUILD ||= String(expectedBuild);
process.env.FD_MULTIPLAYER_URL ||= `${baseUrl()}/multiplayer.html?build=${expectedBuild}`;
// Existing physical WebRTC soak is stronger than the Stage-1 acceptance target:
// it requires >=30 fresh checksum pairs, zero mismatches and zero automatic
// recovery/resync while alternating real commands between two browser peers.
await import('./multiplayer205-soak.mjs');
