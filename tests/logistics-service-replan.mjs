import { expectedBuild, gameUrl } from './lib/fd-env.mjs';

// Canonical build-agnostic entrypoint. The underlying regression body is kept
// temporarily while Stage 1 removes historical build numbers from filenames.
process.env.FD_EXPECTED_BUILD ||= String(expectedBuild);
process.env.FD_GAME_URL ||= gameUrl();
await import('./logistics211-service-replan.mjs');
