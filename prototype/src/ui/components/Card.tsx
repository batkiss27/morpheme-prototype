import type { Rarity } from '../../engine';

const TYPE_LABEL: Record<string, string> = {
  sound_shift: 'Sound Shift',
  extension: 'Extension',
  loanword: 'Loanword',
  utility: 'Utility',
};

interface Props {
  name: string;
  type: string;
  rarity: Rarity;
  /** Effect text shown as a tooltip. */
  text?: string;
  price?: number;
  armed?: boolean;
  blocked?: boolean;
  onClick?: (() => void) | undefined;
}

/** 120×70 box with name, type badge and rarity border (spec §6). */
export function Card({ name, type, rarity, text, price, armed, blocked, onClick }: Props) {
  const cls = ['card', `card--${rarity}`, armed ? 'card--armed' : '', blocked ? 'card--blocked' : ''].filter(Boolean).join(' ');
  return (
    <button type="button" className={cls} onClick={onClick} title={text} disabled={blocked && !onClick}>
      <span className="card__name">{name}</span>
      <span className="card__badge">
        {TYPE_LABEL[type] ?? type} · {rarity}
        {price !== undefined && <strong className="card__price"> {price}¢</strong>}
      </span>
    </button>
  );
}
