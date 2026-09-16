import { useMemo } from 'react';
import { exportRun, replayWithHistory } from '../../engine';
import type { RunState } from '../../engine';
import { content, useStore } from '../store';

/** Per-round table (P6-03): score, threshold, margin, cards used — from a replay of the log. */
export function RoundTable({ run }: { run: RunState }) {
  const { runBalance } = useStore();
  const history = useMemo(() => replayWithHistory(exportRun(run, runBalance ?? undefined), content()).history, [run.log.length, runBalance]); // eslint-disable-line react-hooks/exhaustive-deps
  if (history.length === 0) return <p className="muted">No rounds scored yet.</p>;
  return (
    <table className="breakdown rounds">
      <thead>
        <tr>
          <th>#</th>
          <th>Word</th>
          <th>m</th>
          <th>Score</th>
          <th>Threshold</th>
          <th>Margin</th>
          <th>¢</th>
          <th>Cards</th>
        </tr>
      </thead>
      <tbody>
        {history.map((h) => (
          <tr key={`${h.round}-${h.outcome}-${h.score}`} className={h.passed ? '' : 'rounds__fail'}>
            <td>
              {h.round}
              {h.kind === 'boss' ? ' B' : ''}
            </td>
            <td>
              <code>{h.kind === 'boss' ? '—' : h.chain}</code>
            </td>
            <td>{h.morphemes}</td>
            <td>{h.score.toLocaleString()}</td>
            <td>{h.threshold.toLocaleString()}</td>
            <td style={{ color: h.passed ? 'var(--accent)' : 'var(--danger)' }}>
              {h.margin >= 0 ? '+' : ''}
              {h.margin.toLocaleString()}
            </td>
            <td>+{h.currencyEarned}</td>
            <td className="muted">{h.cardsUsed.join(', ')}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
