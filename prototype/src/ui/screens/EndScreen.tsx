import { chain as C } from '../../engine';
import { RoundTable } from '../components';
import type { RunState } from '../../engine';
import { ChainView } from '../components';
import { endRun, exportCurrentRun, randomSeed, startRun } from '../store';

/** GAME_OVER / WIN (P2-05): summary, restart with the same or a new seed, export. */
export function EndScreen({ run }: { run: RunState }) {
  const won = run.phase === 'WIN';
  const r = run.lastResult;
  const roundsCleared = won ? run.round : Math.max(0, run.round - 1);

  const download = () => {
    const blob = new Blob([exportCurrentRun()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `morpheme-run-${run.seed}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <h1 style={{ color: won ? 'var(--accent)' : 'var(--danger)' }}>{won ? 'You win' : 'Run over'}</h1>
      <div className="panel">
        <p>
          {won ? `Beat all ${run.round} rounds.` : `Reached round ${run.round}; cleared ${roundsCleared}.`}{' '}
          {r && (
            <>
              Last round scored <strong>{r.score.toLocaleString()}</strong> vs {r.threshold.toLocaleString()}.
            </>
          )}
        </p>
        <p>
          Currency {run.currency} · streak {run.streak} · seed <code>{run.seed}</code> · {run.log.length} actions
        </p>
        {run.chain && (
          <p>
            Final word: <code>{C.text(run.chain)}</code> ({C.morphemeCount(run.chain)} morphemes)
          </p>
        )}
        <ChainView chain={run.chain} />
      </div>
      <div className="panel">
        <h2>Rounds</h2>
        <RoundTable run={run} />
      </div>
      <div className="row">
        <button type="button" className="btn--primary" onClick={() => startRun(run.seed)}>
          Restart same seed
        </button>
        <button type="button" onClick={() => startRun(randomSeed())}>
          New seed
        </button>
        <button type="button" onClick={download}>
          Export run JSON
        </button>
        <button type="button" onClick={endRun}>
          Back to start
        </button>
      </div>
    </div>
  );
}
