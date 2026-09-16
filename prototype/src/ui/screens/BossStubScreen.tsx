import type { RunState } from '../../engine';
import { ChainView, RunHeader } from '../components';
import { dispatch } from '../store';

/** BOSS_REWARD placeholder until in-run modifiers exist (M5). */
export function BossRewardStubScreen({ run }: { run: RunState }) {
  return (
    <div>
      <RunHeader run={run} />
      <div className="panel">
        <h2>Boss {run.boss?.bossNumber} beaten</h2>
        <p className="muted">The in-run modifier reward arrives in M5. For now, carry on.</p>
        <ChainView chain={run.chain} />
        <button type="button" className="btn--primary" onClick={() => dispatch({ type: 'PICK_MODIFIER' })} style={{ marginTop: 12 }}>
          Skip reward (M5) → round {run.round + 1}
        </button>
      </div>
    </div>
  );
}
