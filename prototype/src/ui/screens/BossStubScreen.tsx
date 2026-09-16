import type { RunState } from '../../engine';
import { ChainView, RunHeader } from '../components';
import { dispatch } from '../store';
import { ScoreScreen } from './ScoreScreen';

/**
 * Placeholder for BOSS_INTRO / BOSS_PLAY / BOSS_REWARD until M4–M5. Drives
 * the engine's stub actions so a run can continue past round 4.
 */
export function BossStubScreen({ run }: { run: RunState }) {
  if (run.phase === 'BOSS_END') return <ScoreScreen run={run} />;
  return (
    <div>
      <RunHeader run={run} />
      <div className="panel">
        <h2>Boss {run.boss?.bossNumber} — placeholder</h2>
        <p className="muted">The timed board arrives in M4. Until then the boss auto-resolves.</p>
        <ChainView chain={run.chain} />
        <div className="row" style={{ marginTop: 12 }}>
          {run.phase === 'BOSS_INTRO' && (
            <button type="button" className="btn--primary" onClick={() => dispatch({ type: 'START_BOSS' })}>
              Start boss
            </button>
          )}
          {run.phase === 'BOSS_PLAY' && (
            <>
              <button type="button" className="btn--primary" onClick={() => dispatch({ type: 'END_BOSS' })}>
                Auto-pass (stub)
              </button>
              <button type="button" className="btn--danger" onClick={() => dispatch({ type: 'END_BOSS', wordPoints: 0 })}>
                Fail it (stub)
              </button>
            </>
          )}
          {run.phase === 'BOSS_REWARD' && (
            <button type="button" className="btn--primary" onClick={() => dispatch({ type: 'PICK_MODIFIER' })}>
              Skip reward (M5) → round {run.round + 1}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
