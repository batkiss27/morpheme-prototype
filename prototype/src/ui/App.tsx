import { useEffect } from 'react';
import type { Tile as TileModel } from '../engine';
import { letters } from '../content';
import { Card, Tile } from './components';
import { loadDictionary, useStore } from './store';

/** "Hello tiles": boots the app, shows dictionary status and the theme sample. */
export function App() {
  const { dictionary, balance } = useStore();

  useEffect(() => {
    void loadDictionary();
  }, []);

  return (
    <div>
      <h1>Morpheme — prototype</h1>
      <p className="muted">M0 scaffold. Screens arrive in M2.</p>

      <div className="panel">
        <h2>Dictionary</h2>
        {dictionary.state === 'loading' && <p>Loading word lists…</p>}
        {dictionary.state === 'error' && <p style={{ color: 'var(--danger)' }}>Failed: {dictionary.message}</p>}
        {dictionary.state === 'ready' && (
          <p>
            <span style={{ color: 'var(--accent)' }}>Ready</span> — {dictionary.dictionary.size.toLocaleString()} words
            {' · '}
            <code>unbearable</code>: {dictionary.dictionary.has('unbearable') ? 'yes' : 'no'}
          </p>
        )}
      </div>

      <div className="panel">
        <h2>Hello tiles</h2>
        <div className="row">
          {sampleTiles.map((t, i) => (
            <Tile key={t.id} tile={t} committed={i < 4} selected={i === 5} />
          ))}
        </div>
        <p className="muted" style={{ marginTop: 8 }}>
          Committed (mint) · in hand (pale) · selected (blue border) · blank shows “?”
        </p>
      </div>

      <div className="panel">
        <h2>Hello cards</h2>
        <div className="row">
          <Card name="Before & After" type="Extension" rarity="basic" />
          <Card name="Elision" type="Sound Shift" rarity="uncommon" />
          <Card name="Free Morpheme" type="Extension" rarity="exotic" />
          <Card name="Second Wind" type="Utility" rarity="relic" />
        </div>
      </div>

      <div className="panel">
        <h2>Balance</h2>
        <p className="muted">
          base {balance.scoring.multiplierBase} · T1 {balance.scoring.round1Threshold} · growth{' '}
          {balance.scoring.thresholdGrowth} · rounds {balance.rounds.total} · hand {balance.hand.size}
        </p>
      </div>
    </div>
  );
}

const sampleTiles: TileModel[] = (() => {
  const values = Object.fromEntries(letters.map((l) => [l.letter, l.value]));
  const word = 'UNBEAR';
  const tiles: TileModel[] = word.split('').map((ch, i) => ({
    id: `${ch}${i}`,
    letter: ch as TileModel['letter'],
    baseValue: values[ch] ?? 0,
    modifiers: i === 1 ? ['plus1'] : [],
  }));
  tiles.push({ id: '_1', letter: '_', baseValue: 0, modifiers: [] });
  tiles.push({ id: '_2', letter: '_', playedAs: 'Q', baseValue: 0, modifiers: [] });
  return tiles;
})();
