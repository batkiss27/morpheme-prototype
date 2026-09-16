import { tiles as tileFns } from '../../engine';
import type { Tile as TileModel } from '../../engine';

interface Props {
  tile: TileModel;
  committed?: boolean;
  selected?: boolean;
  onClick?: () => void;
}

/** 44×44 box with the letter and a small value subscript (spec §6). */
export function Tile({ tile, committed, selected, onClick }: Props) {
  const letter = tileFns.tileLetter(tile);
  const blank = tileFns.isBlank(tile);
  const cls = [
    'tile',
    committed ? 'tile--committed' : '',
    selected ? 'tile--selected' : '',
    blank && !tile.playedAs ? 'tile--blank' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button type="button" className={cls} onClick={onClick} title={tile.id}>
      {letter === '_' ? '?' : letter}
      {tile.modifiers.length > 0 && <span className="tile__mod">{tile.modifiers[0]}</span>}
      <span className="tile__value">{tileFns.tileValue(tile)}</span>
    </button>
  );
}
