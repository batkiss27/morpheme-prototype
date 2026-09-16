import { useEffect, useState } from 'react';
import { boss as B, inRunMultiplier, lastError, scoring, tiles as T, chain as C } from '../../engine';
import type { Dir, RunState } from '../../engine';
import { Tile } from '../components';
import { dispatch, getState, useStore } from '../store';

interface Cursor {
  row: number;
  col: number;
  dir: Dir;
  letters: string;
}

/**
 * BOSS_PLAY (spec §6): grid, rack, upcoming queue, timer bar, running score.
 * Click a cell, type letters (consumed from the rack), Space toggles the
 * direction, Enter places, Escape clears. rAF drives BOSS_TICK.
 */
export function BossScreen({ run }: { run: RunState }) {
  const { balance } = useStore();
  const [cursor, setCursor] = useState<Cursor | null>(null);
  // Kept locally: the run log's last entry is overwritten by ticks within 100 ms.
  const [placeError, setPlaceError] = useState<string | null>(null);
  const b = run.boss;
  const rules = b?.rules;

  // --- time: the only place the engine's clock is driven -----------------------
  useEffect(() => {
    if (run.phase !== 'BOSS_PLAY') return;
    const tickMs = balance.boss.tickMs;
    let last = performance.now();
    let acc = 0;
    let raf = 0;
    const loop = (now: number) => {
      acc += now - last;
      last = now;
      if (acc >= tickMs && getState().run?.phase === 'BOSS_PLAY') {
        const ms = Math.floor(acc / tickMs) * tickMs;
        acc -= ms;
        dispatch({ type: 'BOSS_TICK', ms });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.phase]);

  // --- keyboard ---------------------------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!cursor) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.key === 'Escape') return setCursor(null);
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        return setCursor({ ...cursor, dir: cursor.dir === 'H' ? 'V' : 'H' });
      }
      if (e.key === 'Backspace') {
        e.preventDefault();
        return setCursor({ ...cursor, letters: cursor.letters.slice(0, -1) });
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        return place();
      }
      if (/^[a-zA-Z]$/.test(e.key)) {
        e.preventDefault();
        setCursor({ ...cursor, letters: cursor.letters + e.key.toUpperCase() });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!b || !rules) return <p>No boss.</p>;

  const place = () => {
    if (!cursor || cursor.letters.length === 0) return;
    dispatch({ type: 'PLACE_WORD', row: cursor.row, col: cursor.col, dir: cursor.dir, letters: cursor.letters });
    const err = lastError(getState().run ?? run);
    setPlaceError(err ?? null);
    if (!err) setCursor(null);
  };

  // pending letters → cells, and which rack tiles they would consume
  const pendingCells = cursor ? B.typingCells(b.board, cursor.row, cursor.col, cursor.dir, cursor.letters.length) : [];
  const pendingByIndex = new Map(pendingCells.map(([r, c], k) => [B.index(b.board, r, c), cursor!.letters[k]!]));
  const resolved = cursor && cursor.letters ? B.resolveRack(b.rack, cursor.letters) : null;
  const usedIds = new Set(resolved?.ok ? resolved.value.used.map((t) => t.id) : []);
  const offBoard = cursor ? pendingCells.length < cursor.letters.length : false;

  const threshold = scoring.threshold(run.round, balance);
  const running = scoring.scoreBoss(
    { round: run.round, bossWordPoints: b.wordPoints, morphemes: run.chain ? C.morphemeCount(run.chain) : 1, inRunMult: inRunMultiplier(run) },
    balance,
  );
  const timePct = Math.max(0, Math.min(100, (100 * b.timeLeftMs) / rules.timerMs));
  const seconds = Math.ceil(b.timeLeftMs / 1000);

  return (
    <div className="boss">
      <div className="boss__top">
        <span>
          <strong>Boss {b.bossNumber}</strong>
          {b.modifierId && <span className="badge badge--fail">{b.modifierId.replace(/_/g, ' ')}</span>}
        </span>
        <span className="boss__score">
          <strong>{running.score.toLocaleString()}</strong> <span className="muted">/ {threshold.toLocaleString()}</span>{' '}
          {running.passed ? <span className="badge badge--pass">pass</span> : <span className="badge badge--fail">short</span>}
        </span>
        <span className={`boss__clock ${seconds <= 10 ? 'boss__clock--low' : ''}`}>{seconds}s</span>
      </div>
      <div className="timer-bar">
        <div className="timer-bar__fill" style={{ width: `${timePct}%` }} />
      </div>

      <div className="boss__cols">
        <div>
          <div className="board" style={{ gridTemplateColumns: `repeat(${b.board.size}, var(--cell))` }}>
            {b.board.cells.map((tile, i) => {
              const [r, c] = B.rowCol(b.board, i);
              const pending = pendingByIndex.get(i);
              const isCursor = cursor && cursor.row === r && cursor.col === c;
              const cls = ['cell', tile ? 'cell--tile' : '', b.board.starter.includes(i) ? 'cell--starter' : '', pending ? 'cell--pending' : '', isCursor ? 'cell--cursor' : '']
                .filter(Boolean)
                .join(' ');
              return (
                <button
                  type="button"
                  key={i}
                  className={cls}
                  disabled={!!tile}
                  onClick={(e) => {
                    // Drop focus so Space / Enter go to the typing handler, not the button.
                    e.currentTarget.blur();
                    if (tile) return;
                    setPlaceError(null);
                    if (cursor && cursor.row === r && cursor.col === c) setCursor({ ...cursor, dir: cursor.dir === 'H' ? 'V' : 'H' });
                    else setCursor({ row: r, col: c, dir: cursor?.dir ?? 'H', letters: '' });
                  }}
                  title={`${r},${c}`}
                >
                  {tile ? T.tileLetter(tile) : pending ?? (isCursor ? (cursor!.dir === 'H' ? '→' : '↓') : '')}
                  {tile && <span className="cell__value">{T.tileValue(tile)}</span>}
                </button>
              );
            })}
          </div>
          <p className="muted">
            Click a cell, type letters, <kbd>Space</kbd> flips direction, <kbd>Enter</kbd> places, <kbd>Esc</kbd> clears. Typing skips over tiles already on the board.
          </p>
        </div>

        <div className="boss__side">
          <div className="panel">
            <h3>
              Rack <span className="muted">{b.rack.length}/{rules.rackCap}</span>
            </h3>
            <div className="hand">
              {b.rack.map((t) => (
                <span key={t.id} className={usedIds.has(t.id) ? 'tile--dim' : ''}>
                  <Tile tile={t} />
                </span>
              ))}
              {b.rack.length === 0 && <span className="muted">Empty — wait for the feed.</span>}
            </div>
            {rules.overflowEnds ? <p className="muted">Overload: a full rack ends the round!</p> : <p className="muted">A full rack drops its oldest tile.</p>}
          </div>

          <div className="panel">
            <h3>Next {balance.boss.queuePreview}</h3>
            {rules.hideQueue ? (
              <p className="muted">Fog — hidden.</p>
            ) : (
              <div className="hand">
                {b.queue.slice(0, balance.boss.queuePreview).map((t) => (
                  <span key={t.id} style={{ opacity: 0.75 }}>
                    <Tile tile={t} />
                  </span>
                ))}
                {b.queue.length === 0 && <span className="muted">Reshuffling…</span>}
              </div>
            )}
            <p className="muted">Next tile in {(Math.max(0, b.feedTimerMs) / 1000).toFixed(1)} s.</p>
          </div>

          <div className="panel">
            <h3>Placing</h3>
            {cursor ? (
              <>
                <p>
                  At ({cursor.row}, {cursor.col}) {cursor.dir === 'H' ? 'across' : 'down'}: <code>{cursor.letters || '…'}</code>
                </p>
                {resolved && !resolved.ok && <p style={{ color: 'var(--danger)' }}>{resolved.error}</p>}
                {offBoard && <p style={{ color: 'var(--danger)' }}>Runs off the board.</p>}
                <div className="row">
                  <button type="button" className="btn--primary btn--small" disabled={!cursor.letters || !resolved?.ok || offBoard} onClick={place}>
                    Place (Enter)
                  </button>
                  <button type="button" className="btn--small" onClick={() => setCursor({ ...cursor, dir: cursor.dir === 'H' ? 'V' : 'H' })}>
                    {cursor.dir === 'H' ? '→ across' : '↓ down'}
                  </button>
                  <button type="button" className="btn--small" onClick={() => { setCursor(null); setPlaceError(null); }}>
                    Clear
                  </button>
                </div>
              </>
            ) : (
              <p className="muted">Click an empty cell to start a word.</p>
            )}
            {placeError && (
              <div className="error" role="alert" style={{ marginTop: 8 }}>
                {placeError}
              </div>
            )}
          </div>

          <div className="panel">
            <h3>Words ({b.words.length})</h3>
            {b.words.length === 0 ? (
              <p className="muted">None yet.</p>
            ) : (
              <ol className="steps">
                {b.words.map((w, i) => (
                  <li key={i}>
                    <code>{w.word}</code>
                    {w.crossWords.length > 0 && <span className="muted"> + {w.crossWords.join(', ')}</span>} <span className="muted">{w.points} pts</span>
                  </li>
                ))}
              </ol>
            )}
            <p className="muted">
              {b.wordPoints} word points × {running.morphemeMult.toFixed(2)} × {running.inRunMult}
            </p>
          </div>

          <button type="button" className="btn--danger btn--small" onClick={() => dispatch({ type: 'END_BOSS' })}>
            End round now
          </button>
        </div>
      </div>
    </div>
  );
}
