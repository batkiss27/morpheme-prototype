import { useState } from 'react';
import { cards as cardFns, chain as C, lastError, scoring, scoringInputs, thresholdFor, tiles as T } from '../../engine';
import type { CardInstance, CardSpec, Dictionary, Letter, RunState, Side, Tile as TileModel } from '../../engine';
import { BossPreview, CardPanel, ChainView, RunHeader, Tile } from '../components';
import { content, dispatch, useStore } from '../store';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('') as Letter[];
const VOWELS = new Set(['A', 'E', 'I', 'O', 'U']);

/** Instant effects that need the player to pick something after arming. */
const NEEDS_TILE = new Set(['vowel_shift', 'glide', 'elision', 'metathesis', 'lenition', 'fortition', 'weight_swap', 'gemination', 'ablaut']);
const NEEDS_LETTER = new Set(['loanword', 'purism']);
const NEEDS_CARD = new Set(['echo']);
const NEEDS_HAND_TILE = new Set(['tile_smith', 'dialect']);
const NEEDS_TEXT = new Set(['anagram']);
const CONSONANT_TARGET = new Set(['lenition', 'fortition']);
const VOWEL_TARGET = new Set(['vowel_shift', 'glide', 'ablaut']);
const VOWEL_LETTERS: Letter[] = ['A', 'E', 'I', 'O', 'U'];

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
  const [ablautVowel, setAblautVowel] = useState<Letter>('A');
  const [textTarget, setTextTarget] = useState('');
  const [smithModifier, setSmithModifier] = useState<string>('plus1');
  const [insertAfter, setInsertAfter] = useState(0);

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
  const kindOf = (spec: CardSpec | undefined) =>
    !spec
      ? null
      : cardFns.usage(spec) === 'step'
        ? 'step'
        : NEEDS_TILE.has(spec.effectId)
          ? 'tile'
          : NEEDS_LETTER.has(spec.effectId)
            ? 'letter'
            : NEEDS_CARD.has(spec.effectId)
              ? 'card'
              : NEEDS_HAND_TILE.has(spec.effectId)
                ? 'hand'
                : NEEDS_TEXT.has(spec.effectId)
                  ? 'text'
                  : null;
  const armedKind = kindOf(armedSpec);

  const onCardClick = (inst: CardInstance, spec: CardSpec) => {
    if (armed === inst.instanceId) return setArmed(null);
    if (armedKind === 'card' && armedInst) {
      dispatch({ type: 'USE_CARD', instanceId: armedInst.instanceId, target: { instanceId: inst.instanceId } });
      return setArmed(null);
    }
    if (!cardFns.usableIn(spec, run.phase)) return;
    if (kindOf(spec) !== null) setArmed(inst.instanceId);
    else dispatch({ type: 'USE_CARD', instanceId: inst.instanceId });
  };

  const onChainTileClick = (tile: TileModel) => {
    if (armedKind !== 'tile' || !armedInst) return;
    const target = armedSpec?.effectId === 'ablaut' ? { tileId: tile.id, letter: ablautVowel } : { tileId: tile.id };
    dispatch({ type: 'USE_CARD', instanceId: armedInst.instanceId, target });
    setArmed(null);
  };
  const onHandTileForCard = (tile: TileModel) => {
    if (armedKind !== 'hand' || !armedInst || !armedSpec) return;
    const target = armedSpec.effectId === 'tile_smith' ? { tileId: tile.id, modifier: smithModifier as TileModel['modifiers'][number] } : { tileId: tile.id };
    dispatch({ type: 'USE_CARD', instanceId: armedInst.instanceId, target });
    setArmed(null);
  };
  const targetable = (tile: TileModel) => {
    if (!armedSpec) return false;
    const letter = T.tileLetter(tile);
    if (VOWEL_TARGET.has(armedSpec.effectId)) return VOWELS.has(letter);
    if (CONSONANT_TARGET.has(armedSpec.effectId)) return !VOWELS.has(letter) && letter !== '_';
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
    const specForPreview = stepCard.effectId === 'infix' ? { ...stepCard, params: { ...stepCard.params, insertAfter } } : stepCard;
    const r = effect(run.chain, previewTiles, dict, run.round, specForPreview);
    return r.ok ? { ok: true as const, word: C.tailText(r.value), error: '' } : { ok: false as const, word: r.word ?? '', error: r.error };
  })();

  const isInfix = stepCard?.effectId === 'infix';
  const play = (side: Side | 'start' | 'insert') => {
    const action = { type: 'PLAY_STEP' as const, side, tileIds: selectedIds, playedAs };
    if (stepCard && armedInst && side === 'insert') dispatch({ ...action, viaCard: armedInst.instanceId, insertAfter });
    else dispatch(stepCard && armedInst && side === 'back' ? { ...action, viaCard: armedInst.instanceId } : action);
    setSelected([]);
    setArmed(null);
  };

  const error = lastError(run);
  const lastAction = run.log[run.log.length - 1]?.action;
  const stepError = error && (lastAction?.type === 'PLAY_STEP' || lastAction?.type === 'USE_CARD' || lastAction?.type === 'SUBMIT') ? error : undefined;

  const threshold = thresholdFor(run, content());
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
                  <span className="badge">Lexicographer: next threshold {thresholdFor(run, content(), run.round + 1).toLocaleString()}</span>
                )}
              </p>
            )}
          </div>

          {armedSpec && armedInst && (
            <div className="armed-note">
              <strong>{armedSpec.name}</strong> armed —{' '}
              {armedKind === 'step' && !isInfix && 'select tiles and add them to the back.'}
              {armedKind === 'step' && isInfix && run.chain && (
                <>
                  select tiles, then insert after{' '}
                  <select value={insertAfter} onChange={(e) => setInsertAfter(Number(e.target.value))}>
                    {run.chain.morphemes.slice(0, -1).map((m, i) => (
                      <option key={m.id} value={i}>
                        "{C.morphemeText(run.chain!, m)}" (#{i + 1})
                      </option>
                    ))}
                  </select>
                </>
              )}
              {armedKind === 'tile' && armedSpec.effectId === 'ablaut' && (
                <>
                  turn a vowel into{' '}
                  <select value={ablautVowel} onChange={(e) => setAblautVowel(e.target.value as Letter)}>
                    {VOWEL_LETTERS.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>{' '}
                  — click it in the word.
                </>
              )}
              {armedKind === 'tile' && armedSpec.effectId !== 'ablaut' && 'click a letter in the word.'}
              {armedKind === 'card' && 'click another card to copy it.'}
              {armedKind === 'hand' && (
                <>
                  {armedSpec.effectId === 'tile_smith' && (
                    <>
                      apply{' '}
                      <select value={smithModifier} onChange={(e) => setSmithModifier(e.target.value)}>
                        {engineContent.tileModifiers.filter((m) => m.level <= 2 && m.implemented).map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>{' '}
                      to
                    </>
                  )}{' '}
                  a tile in your hand — click it.
                </>
              )}
              {armedKind === 'text' && (
                <>
                  rearrange "{run.chain ? C.morphemeText(run.chain, C.lastMorpheme(run.chain)) : ''}" into{' '}
                  <input value={textTarget} onChange={(e) => setTextTarget(e.target.value)} size={10} />{' '}
                  <button
                    type="button"
                    className="btn--small btn--primary"
                    disabled={!textTarget.trim()}
                    onClick={() => {
                      dispatch({ type: 'USE_CARD', instanceId: armedInst.instanceId, target: { letters: textTarget.trim() } });
                      setArmed(null);
                      setTextTarget('');
                    }}
                  >
                    Apply
                  </button>
                </>
              )}
              {armedKind === 'letter' && (
                <>
                  {armedSpec.effectId === 'purism' ? 'remove every pool tile of' : 'add a tile of'}{' '}
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
                    {armedSpec.effectId === 'purism' ? 'Remove from pool' : 'Add to pool'}
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
            <h2>
              Hand{' '}
              {run.freeRedraws > 0 && (
                <button type="button" className="btn--small" disabled={run.steps.length > 0} onClick={() => dispatch({ type: 'REDRAW' })} title="Substrate: one free redraw per round, before any step">
                  Free redraw ({run.freeRedraws})
                </button>
              )}
            </h2>
            <div className="hand">
              {run.hand.map((t) => (
                <Tile key={t.id} tile={t} selected={selectedIds.includes(t.id)} onClick={() => (armedKind === 'hand' ? onHandTileForCard(t) : toggle(t.id))} />
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
                  <button type="button" className="btn--primary" disabled={!canPlay} onClick={() => play(isInfix ? 'insert' : 'back')}>
                    {isInfix ? 'Insert via Infix' : `Add to back via ${stepCard.name} →`}
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
