import { scoring, thresholdFor } from '../../engine';
import type { RunState } from '../../engine';
import { content, useStore } from '../store';
import { ModifierPanel } from './ModifierPanel';

/** Round, threshold, lives, currency, streak — shown on every in-run screen. */
export function RunHeader({ run }: { run: RunState }) {
  const { balance } = useStore();
  const boss = scoring.isBossRound(run.round, balance);
  return (
    <div className="run-header">
      <span>
        <strong>Round {run.round}</strong> / {balance.rounds.total}
        {boss && <span className="badge badge--warn">Boss {scoring.bossNumber(run.round, balance)}</span>}
      </span>
      <span>
        Threshold <strong>{thresholdFor(run, content()).toLocaleString()}</strong>
      </span>
      <span>Currency <strong>{run.currency}</strong></span>
      <span>Lives <strong>{run.lives}</strong></span>
      <span>Streak <strong>{run.streak}</strong></span>
      <ModifierPanel run={run} />
      <span className="muted">seed {run.seed}</span>
    </div>
  );
}
