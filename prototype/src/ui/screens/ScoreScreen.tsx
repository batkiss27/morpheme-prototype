import type { RunState } from '../../engine';
import { ChainView, RunHeader } from '../components';
import { dispatch } from '../store';

/** SCORED / BOSS_END: every term of the formula, pass/fail vs threshold (P2-03). */
export function ScoreScreen({ run }: { run: RunState }) {
  const r = run.lastResult;
  if (!r) return <p>No result.</p>;
  const boss = r.kind === 'boss';
  return (
    <div>
      <RunHeader run={run} />
      <div className="panel">
        <h2>
          Round {r.round} {boss ? '— boss ' : ''}
          {r.passed ? <span className="badge badge--pass">pass</span> : <span className="badge badge--fail">fail</span>}
        </h2>
        <p className="big">
          {r.score.toLocaleString()} <span className="muted" style={{ fontSize: 16 }}>vs threshold {r.threshold.toLocaleString()}</span>
        </p>
        <table className="breakdown">
          <tbody>
            <tr>
              <td>{boss ? 'Boss word points (sum of words placed)' : 'Word points (whole chain)'}</td>
              <td>{r.wordPoints}</td>
            </tr>
            <tr>
              <td>
                × Morpheme multiplier — {r.morphemes} morpheme{r.morphemes === 1 ? '' : 's'}
                {r.effectiveMorphemes !== r.morphemes && `, effective ${r.effectiveMorphemes} (strain)`}
              </td>
              <td>{r.morphemeMult.toFixed(3)}</td>
            </tr>
            {!boss && (
              <tr>
                <td>× Extension bonus</td>
                <td>{r.extensionBonus}</td>
              </tr>
            )}
            <tr>
              <td>× In-run modifiers</td>
              <td>{r.inRunMult}</td>
            </tr>
            <tr>
              <td>+ Flat bonuses</td>
              <td>{r.flatBonus}</td>
            </tr>
            <tr className="total">
              <td>Score</td>
              <td>{r.score.toLocaleString()}</td>
            </tr>
            <tr>
              <td>Threshold</td>
              <td>{r.threshold.toLocaleString()}</td>
            </tr>
            <tr>
              <td>Margin</td>
              <td style={{ color: r.passed ? 'var(--accent)' : 'var(--danger)' }}>
                {r.passed ? '+' : ''}
                {(r.score - r.threshold).toLocaleString()}
              </td>
            </tr>
          </tbody>
        </table>

        <h3 style={{ marginTop: 12 }}>Currency</h3>
        <p>
          {r.currencyEarned > 0 ? (
            <>
              +{r.currencyEarned} {boss ? 'boss clear' : 'round clear'}{' '}
              <span className="muted">(margin, streak and dividend payouts arrive in M5)</span>
            </>
          ) : (
            <span className="muted">Nothing earned.</span>
          )}
        </p>

        {r.outcome === 'life_lost' && (
          <p style={{ color: 'var(--warn)' }}>A life absorbed the miss. No shop this round; the word keeps its extension.</p>
        )}
        {r.outcome === 'game_over' && <p style={{ color: 'var(--danger)' }}>No lives left. The run is over.</p>}
      </div>

      <div className="panel">
        <h2>The word</h2>
        <ChainView chain={run.chain} />
      </div>

      <button type="button" className="btn--primary" onClick={() => dispatch({ type: 'CONTINUE' })}>
        {r.outcome === 'pass' ? (boss ? 'Choose reward' : 'To the shop') : r.outcome === 'life_lost' ? 'Next round' : 'End run'}
      </button>
    </div>
  );
}
