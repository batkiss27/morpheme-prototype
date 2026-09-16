import { useState } from 'react';
import { modifiers as M } from '../../engine';
import type { InRunModifierSpec, Rarity, RunState } from '../../engine';
import { content } from '../store';

const ORDER: Rarity[] = ['relic', 'exotic', 'uncommon', 'basic'];

/** Button + overlay listing the run's in-run modifiers by rarity (P5-06). */
export function ModifierPanel({ run }: { run: RunState }) {
  const [open, setOpen] = useState(false);
  const c = content();
  const specs = run.inRun.map((id) => M.modifierSpec(c, id)).filter((s): s is InRunModifierSpec => !!s);
  return (
    <>
      <button type="button" className="btn--small" onClick={() => setOpen(true)}>
        Modifiers ({specs.length})
      </button>
      {open && (
        <div className="overlay" onClick={() => setOpen(false)} role="dialog">
          <div className="overlay__box" onClick={(e) => e.stopPropagation()}>
            <h2>In-run modifiers</h2>
            {specs.length === 0 && <p className="muted">None yet — beat a boss to choose one.</p>}
            {ORDER.map((r) => {
              const group = specs.filter((s) => s.rarity === r);
              if (group.length === 0) return null;
              return (
                <div key={r}>
                  <h3 style={{ color: `var(--r-${r})`, textTransform: 'capitalize' }}>{r}</h3>
                  <ul>
                    {group.map((s) => (
                      <li key={s.id}>
                        <strong>{s.name}</strong> — {s.effect}
                        {s.id === 'momentum' && run.modifierState.momentum ? ` (currently +${run.modifierState.momentum.toFixed(2)})` : ''}
                        {s.id === 'chain_lightning' && run.modifierState.chain_lightning ? ` (currently +${run.modifierState.chain_lightning.toFixed(2)})` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
            <button type="button" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
