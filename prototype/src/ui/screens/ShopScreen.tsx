import { useState } from 'react';
import { cards as cardFns, lastError, modifiers as M, shop as shopFns } from '../../engine';
import type { Letter, RunState } from '../../engine';
import { Card, CardPanel, RunHeader } from '../components';
import { content, dispatch, useStore } from '../store';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('') as Letter[];

/** SHOP (P3-02): card slots by rarity, a tile action, reroll, sell, leave. */
export function ShopScreen({ run }: { run: RunState }) {
  const { balance } = useStore();
  const c = content();
  const shop = run.shop;
  const [letter, setLetter] = useState<Letter>('E');
  const [removeLetter, setRemoveLetter] = useState<Letter>('E');
  if (!shop) return <p>No shop.</p>;

  const counts = cardFns.countByType(run.cards, c);
  const error = lastError(run);
  const poolCounts = new Map<string, number>();
  for (const t of run.pool) poolCounts.set(t.letter, (poolCounts.get(t.letter) ?? 0) + 1);
  const removeTarget = run.pool.find((t) => t.letter === removeLetter);

  return (
    <div>
      <RunHeader run={run} />
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}

      <div className="panel">
        <h2>
          Shop <span className="muted">— {run.currency} currency</span>
        </h2>
        <div className="shop-grid">
          {shop.offers.map((offer, slot) => {
            const spec = cardFns.cardSpec(c, offer.cardId);
            if (!spec) return null;
            const atLimit = counts[spec.type] >= balance.shop.handLimits[spec.type];
            const canBuy = !offer.sold && run.currency >= offer.price && !atLimit;
            return (
              <div className="shop-slot" key={slot}>
                <Card name={spec.name} type={spec.type} rarity={spec.rarity} price={offer.price} text={spec.text} blocked={offer.sold} />
                <span className="shop-slot__text">{spec.text}</span>
                <button type="button" className={canBuy ? 'btn--primary btn--small' : 'btn--small'} disabled={!canBuy} onClick={() => dispatch({ type: 'BUY_CARD', slot })}>
                  {offer.sold ? 'Sold' : atLimit ? 'Hand full' : `Buy for ${offer.price}`}
                </button>
              </div>
            );
          })}
        </div>

        <h3 style={{ marginTop: 16 }}>Tile action</h3>
        {shop.tileAction.kind === 'add_tile' ? (
          <div className="row">
            <span>Add a tile of</span>
            <select value={letter} onChange={(e) => setLetter(e.target.value as Letter)} disabled={shop.tileAction.sold}>
              {LETTERS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn--small"
              disabled={shop.tileAction.sold || run.currency < shop.tileAction.price}
              onClick={() => dispatch({ type: 'BUY_TILE_ACTION', target: { letter } })}
            >
              {shop.tileAction.sold ? 'Done' : `Add for ${shop.tileAction.price}`}
            </button>
          </div>
        ) : (
          <div className="row">
            <span>Remove one tile of</span>
            <select value={removeLetter} onChange={(e) => setRemoveLetter(e.target.value as Letter)} disabled={shop.tileAction.sold}>
              {[...poolCounts.entries()].sort().map(([l, n]) => (
                <option key={l} value={l}>
                  {l === '_' ? 'blank' : l} ({n} in pool)
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn--small"
              disabled={shop.tileAction.sold || !removeTarget || run.currency < shop.tileAction.price}
              onClick={() => removeTarget && dispatch({ type: 'BUY_TILE_ACTION', target: { tileId: removeTarget.id } })}
            >
              {shop.tileAction.sold ? 'Done' : `Remove for ${shop.tileAction.price}`}
            </button>
          </div>
        )}

        {shop.inRunOffer && (
          <>
            <h3 style={{ marginTop: 16 }}>
              In-run modifier <span className="badge badge--pass">{shop.inRunOffer.criterion}</span>
            </h3>
            {(() => {
              const spec = M.modifierSpec(c, shop.inRunOffer.modifierId);
              if (!spec) return null;
              const o = shop.inRunOffer;
              return (
                <div className="row">
                  <div className={`offer offer--${spec.rarity} offer--static`}>
                    <span className="offer__name">{spec.name}</span>
                    <span className="offer__meta">
                      {spec.rarity} · {spec.category}
                    </span>
                    <span className="offer__text">{spec.effect}</span>
                  </div>
                  <button type="button" className={!o.sold && run.currency >= o.price ? 'btn--primary btn--small' : 'btn--small'} disabled={o.sold || run.currency < o.price} onClick={() => dispatch({ type: 'BUY_IN_RUN' })}>
                    {o.sold ? 'Taken' : `Buy for ${o.price}`}
                  </button>
                </div>
              );
            })()}
          </>
        )}

        <div className="row" style={{ marginTop: 16 }}>
          <button type="button" disabled={run.currency < shop.rerollPrice} onClick={() => dispatch({ type: 'REROLL' })}>
            Reroll cards for {shop.rerollPrice}
          </button>
          <button type="button" className="btn--primary" onClick={() => dispatch({ type: 'LEAVE' })}>
            Leave → round {run.round + 1}
          </button>
        </div>
      </div>

      <div className="panel">
        <h2>Sell</h2>
        {run.cards.length === 0 ? (
          <p className="muted">You hold no cards.</p>
        ) : (
          <div className="row">
            {run.cards.map((inst) => {
              const spec = cardFns.heldSpec(c, inst);
              if (!spec) return null;
              return (
                <div className="shop-slot" key={inst.instanceId}>
                  <Card name={spec.name} type={spec.type} rarity={spec.rarity} text={spec.text} />
                  <button type="button" className="btn--small" onClick={() => dispatch({ type: 'SELL', instanceId: inst.instanceId })}>
                    Sell for {shopFns.sellPrice(spec, balance)}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <CardPanel run={run} hint="Held cards by type. Loanword-type cards can also be used here in a later milestone." />
    </div>
  );
}
