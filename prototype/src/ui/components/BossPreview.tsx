import { boss as B, tiles as T, scoring } from '../../engine';
import type { RunState } from '../../engine';
import { useStore } from '../store';

/** Small "next boss feed" readout for regular rounds (P6-04). */
export function BossPreview({ run }: { run: RunState }) {
  const { balance } = useStore();
  if (!run.chain) return null;
  const nextBossRound = Math.ceil(run.round / balance.rounds.bossEvery) * balance.rounds.bossEvery;
  const bossNumber = scoring.bossNumber(nextBossRound, balance);
  const letters = run.chain.tiles.map((t) => T.tileLetter(t)).sort();
  const starter = B.starterTiles(run.chain, bossNumber, balance).map((t) => T.tileLetter(t)).join('').toLowerCase();
  return (
    <div className="panel">
      <h3>
        Next boss <span className="muted">(round {nextBossRound}, boss {bossNumber})</span>
      </h3>
      <p className="feed-letters">
        {letters.map((l, i) => (
          <span key={i} className="feed-letter">
            {l}
          </span>
        ))}
      </p>
      <p className="muted">
        Feed: {letters.length} tiles · starter <code>{starter}</code> · threshold {scoring.threshold(nextBossRound, balance).toLocaleString()}
      </p>
    </div>
  );
}
