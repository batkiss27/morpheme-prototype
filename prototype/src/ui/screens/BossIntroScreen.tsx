import { scoring, tiles as T } from '../../engine';
import type { RunState } from '../../engine';
import { CardPanel, ChainView, RunHeader } from '../components';
import { content, dispatch, useStore } from '../store';

/** BOSS_INTRO (spec §6): boss number, modifier, feed letters, threshold, card use, start. */
export function BossIntroScreen({ run }: { run: RunState }) {
  const { balance } = useStore();
  const c = content();
  const b = run.boss;
  if (!b) return <p>No boss.</p>;
  const mod = c.bossModifiers.find((m) => m.id === b.modifierId);
  const letters = (run.chain?.tiles ?? []).map((t) => T.tileLetter(t)).sort();
  const feed = balance.boss.feedIntervalMs[b.bossNumber - 1] ?? 0;
  return (
    <div>
      <RunHeader run={run} />
      <div className="panel boss-intro">
        <h2>
          Boss {b.bossNumber} <span className="badge badge--warn">timed round</span>
        </h2>
        <p>
          Beat <strong>{scoring.threshold(run.round, balance).toLocaleString()}</strong> by placing words on the board with your word's
          letters. {Math.round(balance.boss.timerMs / 1000)} s on the clock; a new tile every {(feed / 1000).toFixed(1)} s
          {b.bossNumber === 1 ? ' (before modifiers)' : ''}.
        </p>
        <h3>Modifier</h3>
        {mod ? (
          <p>
            <strong style={{ color: 'var(--danger)' }}>{mod.name}</strong> — {mod.effect}
            {b.rerolls > 0 && <span className="badge">rerolled ×{b.rerolls}</span>}
          </p>
        ) : (
          <p className="muted">None.</p>
        )}
        <h3>Letters that feed the round</h3>
        <p className="feed-letters">
          {letters.length === 0 ? <span className="muted">You have no word — nothing will feed the board.</span> : letters.map((l, i) => <span key={i} className="feed-letter">{l}</span>)}
        </p>
        <h3>Your word</h3>
        <ChainView chain={run.chain} />
        <p className="muted">
          Starter on the board: {b.bossNumber === 1 ? 'the whole word' : `the last ${balance.boss.starterMorphemes[b.bossNumber - 1] ?? 1} morpheme(s)`}.
        </p>
        <button type="button" className="btn--primary" onClick={() => dispatch({ type: 'START_BOSS' })} style={{ marginTop: 8 }}>
          Start boss round
        </button>
      </div>
      <CardPanel run={run} hint="Cards usable now: Amendment rerolls the modifier." onCardClick={(inst) => dispatch({ type: 'USE_CARD', instanceId: inst.instanceId })} />
    </div>
  );
}
