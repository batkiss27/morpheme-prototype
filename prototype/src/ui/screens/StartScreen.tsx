import { useState } from 'react';
import { Card } from '../components';
import { loadRun, parseSeed, randomSeed, startRun, useStore } from '../store';

/** Pre-run screen: seed input and Quick Start with the default loadout (P2-01). */
export function StartScreen() {
  const { dictionary } = useStore();
  const [seedInput, setSeedInput] = useState(() => String(randomSeed()));
  const [json, setJson] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
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
        <summary>Load an exported run</summary>
        <textarea value={json} onChange={(e) => setJson(e.target.value)} rows={4} style={{ width: '100%', marginTop: 8 }} placeholder='paste a run export {"seed": …}' />
        <div className="row">
          <button
            type="button"
            className="btn--small btn--primary"
            disabled={!ready || !json.trim()}
            onClick={() => {
              try {
                loadRun(json);
                setLoadError(null);
              } catch (e) {
                setLoadError(e instanceof Error ? e.message : String(e));
              }
            }}
          >
            Replay and take over
          </button>
          {loadError && <span style={{ color: 'var(--danger)' }}>{loadError}</span>}
        </div>
        <p className="muted">Add <code>?debug=1</code> to the URL for the designer panel (live balance, cheats, export).</p>
      </details>

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
