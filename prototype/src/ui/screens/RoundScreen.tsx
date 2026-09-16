import { useState } from 'react';
import { cards as cardFns, chain as C, lastError, scoring, scoringInputs, tiles as T } from '../../engine';
import type { CardInstance, CardSpec, Dictionary, Letter, RunState, Side, Tile as TileModel } from '../../engine';
import { BossPreview, CardPanel, ChainView, RunHeader, Tile } from '../components';
import { content, dispatch, useStore } from '../store';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('') as Letter[];
const VOWELS = new Set(['A', 'E', 'I', 'O', 'U']);

/** Instant effects that need the player to pick something after arming. */
const NEEDS_TILE = new Set(['vowel_shift', 'glide', 'elision', 'metathesis']);
const NEEDS_LETTER = new Set(['loanword']);
const NEEDS_CARD = new Set(['echo']);

/**
 * EXTEND phase (spec §6): click hand tiles to select them in order, then add
 * them to the front or back. Each click is one step, validated by the engine;
 * a rejected step shows red with the attempted word. Blanks need a letter.
 * Cards are armed from the panel: Extension cards change what the next
 * back step means; Sound Shifts target a letter in the word.
 */
export function RoundScreen({ run }: { run: RunState }) {
  const { balance, dictionary } = useStore();
  const [selected, setSelected] = useState<string[]>([]);
  const [blankLetters, setBlankLetters] = useState<Record<string, Letter>>({});
  const [armed, setArmed] = useState<string | null>(null);
  const [loanLetter, setLoanLetter] = useState<Letter>('E');

  const engineContent = content();
  const dict: Dictionary = dictionary.state === 'ready' ? dictionary.dictionary : { has: () => false, size: 0 };

  // --- selection --------------------------------------------------------------
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
  const previewTiles: TileModel[] = selectedTiles.map((t) => {
    const l = playedAs[t.id];
    return l ? { ...t, playedAs: l } : t;
  });
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  // --- cards ----------------------------------------------------------------------
  const armedInst = armed ? run.cards.find((c) => c.instanceId === armed) : undefined;
  const armedSpec = armedInst ? cardFns.heldSpec(engineContent, armedInst) : undefined;
  const armedKind = !armedSpec
    ? null
    : cardFns.usage(armedSpec) === 'step'
      ? 'step'
      : NEEDS_TILE.has(armedSpec.effectId)
        ? 'tile'
        : NEEDS_LETTER.has(armedSpec.effectId)
          ? 'letter'
          : NEEDS_CARD.has(armedSpec.effectId)
            ? 'card'
            : null;

  const onCardClick = (inst: CardInstance, spec: CardSpec) => {
    if (armed === inst.instanceId) return setArmed(null);
    if (armedKind === 'card' && armedInst) {
      dispatch({ type: 'USE_CARD', instanceId: armedInst.instanceId, target: { instanceId: inst.instanceId } });
      return setArmed(null);
    }
    if (!cardFns.usableIn(spec, run.phase)) return;
    const needsChoice = cardFns.usage(spec) === 'step' || NEEDS_TILE.has(spec.effectId) || NEEDS_LETTER.has(spec.effectId) || NEEDS_CARD.has(spec.effectId);
    if (needsChoice) setArmed(inst.instanceId);
    else dispatch({ type: 'USE_CARD', instanceId: inst.instanceId });
  };

  const onChainTileClick = (tile: TileModel) => {
    if (armedKind !== 'tile' || !armedInst) return;
    dispatch({ type: 'USE_CARD', instanceId: armedInst.instanceId, target: { tileId: tile.id } });
    setArmed(null);
  };
  const targetable = (tile: TileModel) => {
    if (!armedSpec) return false;
    const letter = T.tileLetter(tile);
    if (armedSpec.effectId === 'vowel_shift' || armedSpec.effectId === 'glide') return VOWELS.has(letter);
    if (armedSpec.effectId === 'metathesis') return run.chain?.tiles.at(-1)?.id !== tile.id;
    return true;
  };

  // --- steps -----------------------------------------------------------------------
  const firstWord = run.chain === null;
  const canPlay = selectedIds.length > 0 && !blanksMissing;
  const stepCard = armedKind === 'step' ? armedSpec : undefined;

  const naturalCandidate = (side: Side) => (run.chain ? C.attemptedWord(run.chain, side, previewTiles) : C.lettersOf(previewTiles));
  const cardPreview = (() => {
    if (!stepCard || !run.chain || previewTiles.length === 0) return null;
    const effect = cardFns.stepEffects[stepCard.effectId as keyof typeof cardFns.stepEffects];
    const r = effect(run.chain, previewTiles, dict, run.round, stepCard);
    return r.ok ? { ok: true as const, word: C.tailText(r.value), error: '' } : { ok: false as const, word: r.word ?? '', error: r.error };
  })();

  const play = (side: Side | 'start') => {
    const action = { type: 'PLAY_STEP' as const, side, tileIds: selectedIds, playedAs };
    dispatch(stepCard && armedInst && side === 'back' ? { ...action, viaCard: armedInst.instanceId } : action);
    setSelected([]);
    setArmed(null);
  };

  const error = lastError(run);
  const lastAction = run.log[run.log.length - 1]?.action;
  const stepError = error && (lastAction?.type === 'PLAY_STEP' || lastAction?.type === 'USE_CARD' || lastAction?.type === 'SUBMIT') ? error : undefined;

  const threshold = scoring.threshold(run.round, balance);
  const inputs = run.chain && run.steps.length > 0 ? scoringInputs(run, engineContent) : null;
  const preview =
    inputs && run.chain
      ? scoring.scoreRegular(
          {
            round: run.round,
            wordPoints: inputs.wordPoints,
            morphemes: C.morphemeCount(run.chain),
            strainCount: run.strainThisRound,
            extension: inputs.shape,
            inRunMult: inputs.inRunMult,
            multiplierBase: inputs.base,
            extensionBonusMult: inputs.extensionBonusMult,
          },
          balance,
        )
      : null;
  const dirtyWords = run.chainDirty && run.chain ? C.activeWordsValid(run.chain, dict) : { ok: true as const };
  const effectsActive = run.roundEffects.bank || run.roundEffects.insurance || run.roundEffects.lexicographer;

  return (
    <div>
      <RunHeader run={run} />
      <div className="cols">
        <div>
          <div className="panel">
            <h2>The word</h2>
            <ChainView chain={run.chain} onTileClick={armedKind === 'tile' ? onChainTileClick : undefined} targetable={targetable} />
            {run.chainDirty && (
              <p style={{ color: dirtyWords.ok ? 'var(--accent)' : 'var(--warn)' }}>
                {dirtyWords.ok ? 'Sound shifted — the word is valid again.' : `Sound shifted — "${dirtyWords.word}" is not a word yet; your next step must fix it.`}
              </p>
            )}
            {effectsActive && (
              <p className="muted">
                Active this round:
                {run.roundEffects.bank && <span className="badge">Bank ×2 currency</span>}
                {run.roundEffects.insurance && <span className="badge">Insurance</span>}
                {run.roundEffects.lexicographer && (
                  <span className="badge">Lexicographer: next threshold {scoring.threshold(run.round + 1, balance).toLocaleString()}</span>
                )}
              </p>
            )}
          </div>

          {armedSpec && armedInst && (
            <div className="armed-note">
              <strong>{armedSpec.name}</strong> armed —{' '}
              {armedKind === 'step' && 'select tiles and add them to the back.'}
              {armedKind === 'tile' && 'click a letter in the word.'}
              {armedKind === 'card' && 'click another card to copy it.'}
              {armedKind === 'letter' && (
                <>
                  add a tile of{' '}
                  <select value={loanLetter} onChange={(e) => setLoanLetter(e.target.value as Letter)}>
                    {LETTERS.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>{' '}
                  <button
                    type="button"
                    className="btn--small btn--primary"
                    onClick={() => {
                      dispatch({ type: 'USE_CARD', instanceId: armedInst.instanceId, target: { letter: loanLetter } });
                      setArmed(null);
                    }}
                  >
                    Add to pool
                  </button>
                </>
              )}{' '}
              <button type="button" className="btn--small" onClick={() => setArmed(null)}>
                Cancel
              </button>
            </div>
          )}

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
                <select value={blankLetters[t.id] ?? ''} onChange={(e) => setBlankLetters((b) => ({ ...b, [t.id]: e.target.value as Letter }))}>
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
                  {canPlay && <CandidateWord word={naturalCandidate('back')} ok={dict.has(naturalCandidate('back'))} />}
                </>
              ) : stepCard ? (
                <>
                  <button type="button" className="btn--primary" disabled={!canPlay} onClick={() => play('back')}>
                    Add to back via {stepCard.name} →
                  </button>
                  {cardPreview && <CandidateWord word={cardPreview.word} ok={cardPreview.ok} title={cardPreview.ok ? 'valid' : cardPreview.error} />}
                </>
              ) : (
                <>
                  <button type="button" disabled={!canPlay} onClick={() => play('front')}>
                    ← Add to front
                  </button>
                  {canPlay && <CandidateWord word={naturalCandidate('front')} ok={dict.has(naturalCandidate('front'))} />}
                  <span style={{ flexBasis: '100%' }} />
                  <button type="button" disabled={!canPlay} onClick={() => play('back')}>
                    Add to back →
                  </button>
                  {canPlay && <CandidateWord word={naturalCandidate('back')} ok={dict.has(naturalCandidate('back'))} />}
                </>
              )}
            </div>
          </div>

          <CardPanel run={run} armed={armed} onCardClick={onCardClick} hint="Click a card to use it. Extension cards apply to your next back step." />
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
                    {s.viaCard && <span className="badge badge--warn">{s.viaCard}</span>}
                  </li>
                ))}
              </ol>
            )}
            {run.strainThisRound > 0 && (
              <p className="muted">
                Strain {run.strainThisRound}: the multiplier counts {run.strainThisRound} fewer morpheme{run.strainThisRound === 1 ? '' : 's'} this round; the streak resets.
              </p>
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
                  {preview.wordPoints} pts × {preview.morphemeMult.toFixed(2)} (m={preview.effectiveMorphemes}) × {preview.extensionBonus} ext × {preview.inRunMult} in-run
                </p>
                {inputs && inputs.notes.length > 0 && <p className="muted">{inputs.notes.join(' · ')}</p>}
              </>
            ) : (
              <p className="muted">Threshold {threshold.toLocaleString()}.</p>
            )}
            <button type="button" className="btn--primary" disabled={run.steps.length === 0} onClick={() => dispatch({ type: 'SUBMIT' })} style={{ marginTop: 8 }}>
              Submit round
            </button>
          </div>

          <BossPreview run={run} />

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

function CandidateWord({ word, ok, title }: { word: string; ok: boolean; title?: string }) {
  return (
    <span className={`candidate ${ok ? 'candidate--ok' : 'candidate--bad'}`} title={title ?? (ok ? 'in dictionary' : 'not in dictionary')}>
      {word} {ok ? '✓' : '✗'}
    </span>
  );
}
