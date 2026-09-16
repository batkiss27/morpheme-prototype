import { modifiers as M } from '../../engine';
import type { RunState } from '../../engine';
import { ChainView, RunHeader } from '../components';
import { content, dispatch } from '../store';

/** BOSS_REWARD (P5-02): pick 1 of 3 in-run modifiers (2 of 4 with Polyglot). */
export function RewardScreen({ run }: { run: RunState }) {
  const c = content();
  const reward = run.boss?.reward;
  const offers = reward?.offers ?? [];
  return (
    <div>
      <RunHeader run={run} />
      <div className="panel">
        <h2>Boss {run.boss?.bossNumber} beaten</h2>
        {offers.length === 0 ? (
          <>
            <p className="muted">You already hold every modifier on offer.</p>
            <button type="button" className="btn--primary" onClick={() => dispatch({ type: 'PICK_MODIFIER' })}>
              Continue → round {run.round + 1}
            </button>
          </>
        ) : (
          <>
            <p>
              Choose {reward!.picksLeft} in-run modifier{reward!.picksLeft === 1 ? '' : 's'}. They last for the rest of the run.
            </p>
            <div className="offers">
              {offers.map((id) => {
                const spec = M.modifierSpec(c, id);
                if (!spec) return null;
                return (
                  <button type="button" key={id} className={`offer offer--${spec.rarity}`} onClick={() => dispatch({ type: 'PICK_MODIFIER', id })}>
                    <span className="offer__name">{spec.name}</span>
                    <span className="offer__meta">
                      {spec.rarity} · {spec.category}
                    </span>
                    <span className="offer__text">{spec.effect}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
      <div className="panel">
        <h3>Your word</h3>
        <ChainView chain={run.chain} />
      </div>
    </div>
  );
}
