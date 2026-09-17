import { useState } from 'react';
import { meta as M } from '../../engine';
import type { ChallengeId, Letter, PreRunCategoryId, PreRunLoadout, RiskId, TileModifierId } from '../../engine';
import { Card, ConfirmButton, MusicToggle } from '../components';
import { content, debugEnabled, loadRun, parseSeed, randomSeed, resetMeta, setDebugEnabled, setLoadout, setMeta, startRun, useStore } from '../store';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('') as Letter[];

/**
 * Pre-run screen (P7-03, P7-04, P7-06, P7-07): spend Lexicon points on letter and
 * category levels, build a loadout inside the budget, opt into risks and
 * challenges, then start a run. Quick Start uses an empty loadout.
 */
export function LexiconScreen() {
  const { dictionary, meta, balance } = useStore();
  const [seedInput, setSeedInput] = useState(() => String(randomSeed()));
  const [json, setJson] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const ready = dictionary.state === 'ready';
  const c = ready ? content() : null;
  const loadout = meta.loadout;

  const update = (patch: Partial<PreRunLoadout>) => setLoadout({ ...loadout, ...patch });
  const errors = c ? M.validateLoadout(meta, loadout, c) : [];
  const cost = c ? M.loadoutCost(loadout, c) : 0;
  const points = c ? M.loadoutPoints(meta, loadout, c) : 0;

  const buyLetter = (l: Letter) => {
    const r = M.buyLetterLevel(meta, l, balance);
    if (r.ok) setMeta(r.value);
  };
  const buyCategory = (id: PreRunCategoryId) => {
    const r = M.buyCategoryLevel(meta, id, balance);
    if (r.ok) setMeta(r.value);
  };
  const setTileModifier = (letter: Letter, modifier: string) => {
    const rest = loadout.tileModifiers.filter((m) => m.letter !== letter);
    update({ tileModifiers: modifier ? [...rest, { letter, modifier: modifier as TileModifierId }] : rest });
  };
  const setCategory = (id: PreRunCategoryId, level: number) => update({ categories: { ...loadout.categories, [id]: level } });
  const setRisk = (id: RiskId, level: number) => update({ risks: { ...loadout.risks, [id]: level } });
  const toggleChallenge = (id: ChallengeId) => {
    const cur = loadout.challenges ?? [];
    update({ challenges: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] });
  };

  return (
    <div>
      <h1>Morpheme — Lexicon</h1>
      <p className="muted">One word, 24 rounds. Spend Lexicon points between runs, set a loadout, then start.</p>

      <div className="panel row" style={{ gap: 24 }}>
        <span>
          Lexicon points <strong>{meta.lexiconPoints}</strong>
        </span>
        <span title={`Each boss beaten adds ${balance.meta.bossBudget.perBoss} up to ${balance.meta.bossBudget.caps.join(' / ')} (B1–B6); achievements add more, up to ${balance.meta.loadoutBudgetCap}.`}>
          Loadout budget <strong>{Math.min(meta.loadoutBudget, balance.meta.loadoutBudgetCap)}</strong>
          <span className="muted"> / cap {balance.meta.loadoutBudgetCap} · grows per boss beaten</span>
        </span>
        <span>
          Achievements <strong>{meta.achievements.length}</strong> / {c?.achievements.length ?? '…'}
        </span>
        <span className="muted">
          runs {meta.runs} · wins {meta.wins}
        </span>
        <MusicToggle />
        {dictionary.state === 'loading' && <span className="muted">Loading dictionary…</span>}
        {dictionary.state === 'error' && <span style={{ color: 'var(--danger)' }}>Dictionary failed: {dictionary.message}</span>}
      </div>

      <div className="panel">
        <h2>
          New run <span className="muted">— loadout {cost} / {points} points</span>
        </h2>
        <div className="row">
          <label>
            Seed <input value={seedInput} onChange={(e) => setSeedInput(e.target.value)} size={14} placeholder="number or any text" />
          </label>
          <button type="button" onClick={() => setSeedInput(String(randomSeed()))}>
            Random
          </button>
          <button type="button" className="btn--primary" disabled={!ready || errors.length > 0} onClick={() => startRun(parseSeed(seedInput), loadout)}>
            Start run with loadout
          </button>
          <button type="button" disabled={!ready} onClick={() => startRun(parseSeed(seedInput), M.emptyLoadout)}>
            Quick Start (no loadout)
          </button>
        </div>
        {errors.length > 0 && (
          <ul style={{ color: 'var(--danger)', margin: '8px 0 0' }}>
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="cols">
        <div>
          <div className="panel">
            <h2>Letters</h2>
            <p className="muted">
              Levels cost {balance.meta.levelCosts.join(' / ')} Lexicon points and gate which tile modifier a letter may carry (one tile of that letter, cost = modifier level). Up to{' '}
              {balance.meta.modifiedLettersCap} modified letters.
            </p>
            <table className="breakdown letters">
              <tbody>
                {LETTERS.map((l) => {
                  const level = meta.letterLevels[l] ?? 0;
                  const next = M.nextLevelCost(level, balance);
                  const chosen = loadout.tileModifiers.find((m) => m.letter === l)?.modifier ?? '';
                  const options = (c?.tileModifiers ?? []).filter((m) => m.level <= level);
                  return (
                    <tr key={l}>
                      <td>
                        <strong>{l}</strong>
                      </td>
                      <td>
                        L{level}
                        {next !== undefined && (
                          <button type="button" className="btn--small" disabled={meta.lexiconPoints < next} onClick={() => buyLetter(l)} style={{ marginLeft: 6 }}>
                            +1 for {next}
                          </button>
                        )}
                      </td>
                      <td>
                        {level > 0 ? (
                          <select value={chosen} onChange={(e) => setTileModifier(l, e.target.value)}>
                            <option value="">— no modifier —</option>
                            {options.map((m) => (
                              <option key={m.id} value={m.id} disabled={!m.implemented}>
                                {m.name} (L{m.level}){m.implemented ? '' : ' — not in prototype'}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="muted">level up to unlock modifiers</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <div className="panel">
            <h2>Pre-run categories</h2>
            {(c?.preRun.categories ?? []).map((cat) => {
              const unlocked = meta.categoryLevels[cat.id] ?? 0;
              const active = loadout.categories[cat.id] ?? 0;
              const next = M.nextLevelCost(unlocked, balance);
              return (
                <div key={cat.id} style={{ marginBottom: 10 }}>
                  <div className="row">
                    <strong>{cat.name}</strong>
                    <span className="muted">unlocked L{unlocked}</span>
                    {next !== undefined && (
                      <button type="button" className="btn--small" disabled={meta.lexiconPoints < next} onClick={() => buyCategory(cat.id)}>
                        unlock L{unlocked + 1} for {next}
                      </button>
                    )}
                    <select value={active} onChange={(e) => setCategory(cat.id, Number(e.target.value))} disabled={unlocked === 0}>
                      {Array.from({ length: unlocked + 1 }, (_, i) => (
                        <option key={i} value={i}>
                          {i === 0 ? 'off' : `L${i} (${i} pt)`}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {cat.levels.map((t, i) => (
                      <span key={i} style={{ opacity: i < unlocked ? 1 : 0.5, marginRight: 8 }}>
                        L{i + 1}: {t}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="panel">
            <h2>Risk</h2>
            {(c?.preRun.risks ?? []).map((r) => {
              const level = loadout.risks?.[r.id] ?? 0;
              return (
                <div key={r.id} className="row">
                  <strong>{r.name}</strong>
                  <select value={level} onChange={(e) => setRisk(r.id, Number(e.target.value))}>
                    <option value={0}>off</option>
                    {r.levels.map((t, i) => (
                      <option key={i} value={i + 1}>
                        L{i + 1}: {t} → +{r.points[i]} pt
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>

          <div className="panel">
            <h2>Challenges</h2>
            {!meta.challengesUnlocked ? (
              <p className="muted">Unlock by winning a run.</p>
            ) : (
              (c?.preRun.challenges ?? []).map((ch) => (
                <label key={ch.id} style={{ display: 'block' }}>
                  <input type="checkbox" checked={loadout.challenges?.includes(ch.id) ?? false} onChange={() => toggleChallenge(ch.id)} /> <strong>{ch.name}</strong> — {ch.effect}{' '}
                  <span className="muted">+{ch.points} pt</span>
                </label>
              ))
            )}
          </div>

          <div className="panel">
            <h2>Achievements</h2>
            {meta.achievements.length === 0 ? (
              <p className="muted">None yet.</p>
            ) : (
              <p>{meta.achievements.map((id) => c?.achievements.find((a) => a.id === id)?.name ?? id).join(' · ')}</p>
            )}
            <ConfirmButton label="Reset progression" confirmLabel="Reset everything" className="btn--danger btn--small" onConfirm={resetMeta} />
          </div>
        </div>
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
        <p className="muted">
          Designer panel (live balance, cheats, export): {debugEnabled() ? 'on' : 'off'} —{' '}
          <button type="button" className="btn--small" onClick={() => setDebugEnabled(!debugEnabled())}>
            turn {debugEnabled() ? 'off' : 'on'}
          </button>{' '}
          (also <code>?debug=1</code> / <code>?debug=0</code> in the URL; the setting is remembered).
        </p>
      </details>

      <details className="panel">
        <summary>Theme sample</summary>
        <div className="row" style={{ marginTop: 8 }}>
          <Card name="Before & After" type="extension" rarity="basic" />
          <Card name="Elision" type="sound_shift" rarity="uncommon" />
          <Card name="Free Morpheme" type="extension" rarity="exotic" />
          <Card name="Second Wind" type="utility" rarity="relic" />
        </div>
      </details>
    </div>
  );
}
