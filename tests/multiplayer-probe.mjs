import { expectedBuild, multiplayerUrl } from './lib/fd-env.mjs';

process.env.FD_EXPECTED_BUILD ||= String(expectedBuild);
process.env.FD_MULTIPLAYER_URL ||= multiplayerUrl();
// Build-agnostic physical WebRTC acceptance probe. It discovers the active
// multiplayer lobby capability instead of depending on a historical build
// global, then requires >=30 fresh checksum pairs, zero mismatches, zero
// recovery/resync and real alternating commands applied by both Workers.
await import('./multiplayer-current-soak.mjs');
