import type { Rarity } from '../../engine';

interface Props {
  name: string;
  type: 'Sound Shift' | 'Extension' | 'Loanword' | 'Utility';
  rarity: Rarity;
  onClick?: () => void;
}

/** 120×70 box with name, type badge and rarity border (spec §6). */
export function Card({ name, type, rarity, onClick }: Props) {
  return (
    <button type="button" className={`card card--${rarity}`} onClick={onClick}>
      <span className="card__name">{name}</span>
      <span className="card__badge">
        {type} · {rarity}
      </span>
    </button>
  );
}
