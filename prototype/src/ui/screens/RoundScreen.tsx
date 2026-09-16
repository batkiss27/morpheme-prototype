import { useState } from 'react';
import { chain as C, inRunMultiplier, lastError, scoring, tiles as T } from '../../engine';
import type { Letter, RunState, Side, Tile as TileModel } from '../../engine';
import { ChainView, RunHeader, Tile } from '../components';
import { dispatch, useStore } from '../store';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('') as Letter[];

/**
 * EXTEND phase (spec §6): click hand tiles to select them in order, then add
 * them to the front or back. Each click is one step, validated by the engine;
 * a rejected step shows red with the attempted word. Blanks need a letter.
 */
export function RoundScreen({ run }: { run: RunState }) {
  const { balance, dictionary } = useStore();
  const [selected, setSelected] = useState<string[]>([]);
  const [blankLetters, setBlankLetters] = useState<Record<string, Letter>>({});

  // Selection only refers to tiles still in the hand (steps and undo move tiles around).
  const handIds = new Set(run.hand.map((t) => t.id));
  const selectedIds = selected.filter((id) => handIds.has(id));
  const selectedTiles = selectedIds.map((id) => run.hand.find((t) => t.id === id)!);
  const playedAs: Record<string, Letter> = {};
  let blanksMissing = false;
  for (const t of selectedTiles) {
    if (!T.isBlank(t)) continue;
    const l = blankLetters[t.id];
    if (l) playedAs[t.id] = l;
    else blanksMissing = true;
  }
  // Tiles with a chosen letter so previews and candidate words read correctly.
  const previewTiles: TileModel[] = selectedTiles.map((t) => {
    const l = playedAs[t.id];
    return l ? { ...t, playedAs: l } : t;
  });

  const dict = dictionary.state === 'ready' ? dictionary.dictionary : { has: () => false };
  const firstWord = run.chain === null;
  const candidate = (side: Side) => (run.chain ? C.attemptedWord(run.chain, side, previewTiles) : C.lettersOf(previewTiles));
  const canPlay = selectedIds.length > 0 && !blanksMissing;

  const play = (side: Side | 'start') => {
    dispatch({ type: 'PLAY_STEP', side, tileIds: selectedIds, playedAs });
    setSelected([]);
  };
  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const error = lastError(run);
  const lastAction = run.log[run.log.length - 1]?.action;
  const stepError = error && lastAction?.type === 'PLAY_STEP' ? error : undefined;

  const threshold = scoring.threshold(run.round, balance);
  const preview =
    run.chain && run.steps.length > 0
      ? scoring.scoreRegular(
          {
            round: run.round,
            wordPoints: scoring.wordPoints(run.chain),
            morphemes: C.morphemeCount(run.chain),
            strainCount: run.strainThisRound,
            extension: C.morphemesAddedIn(run.chain, run.round),
            inRunMult: inRunMultiplier(run),
          },
          balance,
        )
      : null;

  return (
    <div>
      <RunHeader run={run} />
      <div className="cols">
        <div>
          <div className="panel">
            <h2>The word</h2>
            <ChainView chain={run.chain} />
          </div>

          {stepError && (
            <div className="error" role="alert">
              Rejected: {stepError}
            </div>
          )}

          <div className="panel">
            <h2>Hand</h2>
            <div className="hand">
              {run.hand.map((t) => (
                <Tile key={t.id} tile={t} selected={selectedIds.includes(t.id)} onClick={() => toggle(t.id)} />
              ))}
              {run.hand.length === 0 && <span className="muted">Empty.</span>}
            </div>

            <h3 style={{ marginTop: 12 }}>Selected (in order)</h3>
            <div className="selection">
              {previewTiles.length === 0 && <span className="muted">Click tiles in the hand to select them.</span>}
              {previewTiles.map((t, i) => (
                <span key={t.id} style={{ textAlign: 'center' }}>
                  <Tile tile={t} selected onClick={() => toggle(t.id)} />
                  <div className="selection__order">{i + 1}</div>
                </span>
              ))}
              {selectedTiles.length > 0 && (
                <button type="button" className="btn--small" onClick={() => setSelected([])}>
                  Clear
                </button>
              )}
            </div>

            {selectedTiles.filter(T.isBlank).map((t) => (
              <p key={t.id}>
                Blank <code>{t.id}</code> plays as{' '}
                <select
                  value={blankLetters[t.id] ?? ''}
                  onChange={(e) => setBlankLetters((b) => ({ ...b, [t.id]: e.target.value as Letter }))}
                >
                  <option value="">— pick a letter —</option>
                  {LETTERS.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </p>
            ))}

            <div className="row" style={{ marginTop: 12 }}>
              {firstWord ? (
                <>
                  <button type="button" className="btn--primary" disabled={!canPlay} onClick={() => play('start')}>
                    Play first word
                  </button>
                  {canPlay && <CandidateWord word={candidate('back')} dict={dict} />}
                </>
              ) : (
                <>
                  <button type="button" disabled={!canPlay} onClick={() => play('front')}>
                    ← Add to front
                  </button>
                  {canPlay && <CandidateWord word={candidate('front')} dict={dict} />}
                  <span style={{ flexBasis: '100%' }} />
                  <button type="button" disabled={!canPlay} onClick={() => play('back')}>
                    Add to back →
                  </button>
                  {canPlay && <CandidateWord word={candidate('back')} dict={dict} />}
                </>
              )}
            </div>
          </div>
        </div>

        <div>
          <div className="panel">
            <h2>This round</h2>
            {run.steps.length === 0 ? (
              <p className="muted">No steps yet. Add at least one morpheme to submit.</p>
            ) : (
              <ol className="steps">
                {run.steps.map((s, i) => (
                  <li key={i}>
                    <span className="badge">{s.side}</span> <code>{s.word}</code>
                  </li>
                ))}
              </ol>
            )}
            <div className="row" style={{ marginTop: 8 }}>
              <button type="button" disabled={run.steps.length === 0} onClick={() => dispatch({ type: 'UNDO_STEP' })}>
                Undo last step
              </button>
            </div>
          </div>

          <div className="panel">
            <h2>Preview</h2>
            {preview ? (
              <>
                <p className="preview">
                  <strong>{preview.score.toLocaleString()}</strong> <span className="muted">vs {threshold.toLocaleString()}</span>{' '}
                  {preview.passed ? <span className="badge badge--pass">pass</span> : <span className="badge badge--fail">short</span>}
                </p>
                <p className="muted">
                  {preview.wordPoints} pts × {preview.morphemeMult.toFixed(2)} (m={preview.effectiveMorphemes}) × {preview.extensionBonus} ext ×{' '}
                  {preview.inRunMult} in-run
                </p>
              </>
            ) : (
              <p className="muted">Threshold {threshold.toLocaleString()}.</p>
            )}
            <button
              type="button"
              className="btn--primary"
              disabled={run.steps.length === 0}
              onClick={() => dispatch({ type: 'SUBMIT' })}
              style={{ marginTop: 8 }}
            >
              Submit round
            </button>
          </div>

          <div className="panel">
            <h3>Stuck?</h3>
            <p className="muted">No valid extension in hand? Forfeiting scores 0 and fails the threshold.</p>
            <button
              type="button"
              className="btn--danger"
              onClick={() => {
                if (window.confirm('Forfeit this round? It will score 0 and fail the threshold.')) dispatch({ type: 'FORFEIT' });
              }}
            >
              Forfeit round
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CandidateWord({ word, dict }: { word: string; dict: { has(w: string): boolean } }) {
  const ok = dict.has(word);
  return (
    <span className={`candidate ${ok ? 'candidate--ok' : 'candidate--bad'}`} title={ok ? 'in dictionary' : 'not in dictionary'}>
      {word} {ok ? '✓' : '✗'}
    </span>
  );
}
