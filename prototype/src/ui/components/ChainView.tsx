import { chain as C } from '../../engine';
import type { Chain, Tile as TileModel } from '../../engine';
import { Tile } from './Tile';

interface Props {
  chain: Chain | null;
  /** When set, chain tiles become clickable (Sound Shift targeting). */
  onTileClick?: ((tile: TileModel) => void) | undefined;
  /** Which tiles are valid targets while `onTileClick` is set. */
  targetable?: (tile: TileModel) => boolean;
}

/**
 * The chain as tile boxes: morpheme boundaries are gaps, the head word is
 * underlined blue and the tail word green (one green underline when natural).
 */
export function ChainView({ chain, onTileClick, targetable }: Props) {
  if (!chain) return <p className="muted">No word yet — play your first word from the hand.</p>;
  const byId = new Map(chain.tiles.map((t, i) => [t.id, { tile: t, index: i }]));
  const [h0, h1] = chain.headSpan;
  const [t0, t1] = chain.tailSpan;
  return (
    <div>
      <div className={`chain ${onTileClick ? 'chain--targeting' : ''}`}>
        {chain.morphemes.map((m) => (
          <div className="chain__morpheme" key={m.id} title={`${m.side} · round ${m.round}${m.viaCard ? ` · ${m.viaCard}` : ''}`}>
            {m.tileIds.map((id) => {
              const entry = byId.get(id);
              if (!entry) return null;
              const i = entry.index;
              const inHead = i >= h0 && i < h1;
              const inTail = i >= t0 && i < t1;
              const cls = chain.natural ? 'chain__tile--natural' : inHead && inTail ? 'chain__tile--both' : inHead ? 'chain__tile--head' : inTail ? 'chain__tile--tail' : '';
              const canTarget = onTileClick && (!targetable || targetable(entry.tile));
              return (
                <span key={id} className={`chain__tile ${cls} ${onTileClick && !canTarget ? 'chain__tile--dim' : ''}`}>
                  <Tile tile={entry.tile} committed onClick={canTarget ? () => onTileClick(entry.tile) : undefined} />
                </span>
              );
            })}
          </div>
        ))}
      </div>
      <p className="muted chain__caption">
        <code>{C.text(chain)}</code> · {C.morphemeCount(chain)} morpheme{C.morphemeCount(chain) === 1 ? '' : 's'} ·{' '}
        {chain.natural ? 'natural word' : <>head <code>{C.headText(chain)}</code> · tail <code>{C.tailText(chain)}</code></>}
      </p>
    </div>
  );
}
