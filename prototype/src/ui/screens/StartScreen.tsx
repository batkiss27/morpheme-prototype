import { useState } from 'react';
import { Card } from '../components';
import { parseSeed, randomSeed, startRun, useStore } from '../store';

/** Pre-run screen: seed input and Quick Start with the default loadout (P2-01). */
export function StartScreen() {
  const { dictionary } = useStore();
  const [seedInput, setSeedInput] = useState(() => String(randomSeed()));
  const ready = dictionary.state === 'ready';

  return (
    <div>
      <h1>Morpheme</h1>
      <p className="muted">One word, 24 rounds. Prototype — quick start with the default loadout.</p>

      <div className="panel">
        <h2>Dictionary</h2>
        {dictionary.state === 'loading' && <p>Loading word lists…</p>}
        {dictionary.state === 'error' && <p style={{ color: 'var(--danger)' }}>Failed: {dictionary.message}</p>}
        {dictionary.state === 'ready' && (
          <p>
            <span style={{ color: 'var(--accent)' }}>Ready</span> — {dictionary.dictionary.size.toLocaleString()} words
          </p>
        )}
      </div>

      <div className="panel">
        <h2>New run</h2>
        <div className="row">
          <label>
            Seed{' '}
            <input value={seedInput} onChange={(e) => setSeedInput(e.target.value)} size={14} placeholder="number or any text" />
          </label>
          <button type="button" onClick={() => setSeedInput(String(randomSeed()))}>
            Random
          </button>
          <button type="button" className="btn--primary" disabled={!ready} onClick={() => startRun(parseSeed(seedInput))}>
            Quick Start
          </button>
        </div>
        <p className="muted" style={{ marginTop: 8 }}>
          Same seed → same tiles. Text seeds are hashed. Loadouts arrive with the Lexicon screen (M7).
        </p>
      </div>

      <details className="panel">
        <summary>Theme sample</summary>
        <div className="row" style={{ marginTop: 8 }}>
          <Card name="Before & After" type="Extension" rarity="basic" />
          <Card name="Elision" type="Sound Shift" rarity="uncommon" />
          <Card name="Free Morpheme" type="Extension" rarity="exotic" />
          <Card name="Second Wind" type="Utility" rarity="relic" />
        </div>
      </details>
    </div>
  );
}
