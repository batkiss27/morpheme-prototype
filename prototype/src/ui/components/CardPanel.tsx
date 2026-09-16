import { cards as cardFns } from '../../engine';
import type { CardInstance, CardSpec, CardType, RunState } from '../../engine';
import { content, useStore } from '../store';
import { Card } from './Card';

const QUADRANTS: { type: CardType; label: string }[] = [
  { type: 'sound_shift', label: 'Sound Shift' },
  { type: 'extension', label: 'Extension' },
  { type: 'loanword', label: 'Loanword' },
  { type: 'utility', label: 'Utility' },
];

interface Props {
  run: RunState;
  /** Instance id of the armed card, if any. */
  armed?: string | null;
  onCardClick?: (instance: CardInstance, spec: CardSpec) => void;
  /** Optional hint shown under the panel title. */
  hint?: string;
}

/** Held cards in four quadrants: usable vs blocked in this phase; click to arm/use (P3-06). */
export function CardPanel({ run, armed, onCardClick, hint }: Props) {
  const { balance } = useStore();
  const c = content();
  return (
    <div className="panel">
      <h2>Cards</h2>
      {hint && <p className="muted">{hint}</p>}
      <div className="quadrants">
        {QUADRANTS.map((q) => {
          const held = run.cards
            .map((inst) => ({ inst, spec: cardFns.heldSpec(c, inst) }))
            .filter((x): x is { inst: CardInstance; spec: CardSpec } => !!x.spec && x.spec.type === q.type);
          return (
            <div className="quadrant" key={q.type}>
              <div className="quadrant__title">
                {q.label} <span className="muted">{held.length}/{balance.shop.handLimits[q.type]}</span>
              </div>
              <div className="quadrant__cards">
                {held.length === 0 && <span className="muted">—</span>}
                {held.map(({ inst, spec }) => {
                  const usable = cardFns.usableIn(spec, run.phase);
                  return (
                    <Card
                      key={inst.instanceId}
                      name={spec.name}
                      type={spec.type}
                      rarity={spec.rarity}
                      text={`${spec.text}${usable ? '' : ' (not usable now)'}`}
                      armed={armed === inst.instanceId}
                      blocked={!usable}
                      onClick={onCardClick ? () => onCardClick(inst, spec) : undefined}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
