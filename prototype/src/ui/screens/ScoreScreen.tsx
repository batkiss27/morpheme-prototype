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

        {boss && run.boss && (
          <>
            <h3 style={{ marginTop: 12 }}>Words placed ({run.boss.words.length})</h3>
            {run.boss.words.length === 0 ? (
              <p className="muted">None.</p>
            ) : (
              <p>
                {run.boss.words.map((w, i) => (
                  <span key={i}>
                    <code>{w.word}</code> {w.points}
                    {i < run.boss!.words.length - 1 ? ' · ' : ''}
                  </span>
                ))}
              </p>
            )}
            <p className="muted">
              Ended by {run.boss.endReason === 'timer' ? 'the clock' : run.boss.endReason === 'overflow' ? 'rack overflow' : 'you'}
              {run.boss.modifierId ? ` · modifier: ${run.boss.modifierId.replace(/_/g, ' ')}` : ''}
            </p>
          </>
        )}

        {r.notes.length > 0 && (
          <>
            <h3 style={{ marginTop: 12 }}>Modifiers</h3>
            <ul className="muted" style={{ margin: 0 }}>
              {r.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </>
        )}

        <h3 style={{ marginTop: 12 }}>Currency</h3>
        {r.currencySources.length === 0 ? (
          <p className="muted">Nothing earned.</p>
        ) : (
          <table className="breakdown">
            <tbody>
              {r.currencySources.map((c, i) => (
                <tr key={i}>
                  <td>{c.source}</td>
                  <td>+{c.amount}</td>
                </tr>
              ))}
              <tr className="total">
                <td>Earned</td>
                <td>+{r.currencyEarned}</td>
              </tr>
            </tbody>
          </table>
        )}
        {r.criteriaMet.length > 0 && (
          <p style={{ marginTop: 8 }}>
            <span className="badge badge--pass">shop bonus</span> {r.criteriaMet.join(' · ')} — the shop offers an in-run modifier.
          </p>
        )}
        {run.flags.bossJumpPending && <p style={{ color: 'var(--warn)' }}>Secret word! The next round jumps straight to the boss.</p>}

        {r.outcome === 'life_lost' && (
          <p style={{ color: 'var(--warn)' }}>
            A life absorbed the miss. {boss ? 'The boss is replayed with a new modifier.' : 'This round is replayed with a fresh hand; the word is as it was before the round.'} No shop.
          </p>
        )}
        {r.outcome === 'insured' && <p style={{ color: 'var(--warn)' }}>Insurance paid out: no life lost. The round is replayed with a fresh hand; no shop.</p>}
        {r.outcome === 'game_over' && <p style={{ color: 'var(--danger)' }}>No lives left. The run is over.</p>}
      </div>

      <div className="panel">
        <h2>The word</h2>
        <ChainView chain={run.chain} />
      </div>

      <button type="button" className="btn--primary" onClick={() => dispatch({ type: 'CONTINUE' })}>
        {r.outcome === 'pass' ? (boss ? 'Choose reward' : 'To the shop') : r.outcome === 'game_over' ? 'End run' : boss ? 'Retry the boss' : 'Replay the round'}
      </button>
    </div>
  );
}
