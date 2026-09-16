import { useState } from 'react';
import { bossModifiers, cards as cardContent, defaultBalance, inRunModifiers } from '../../content';
import type { Balance, RunState } from '../../engine';
import { RoundTable } from './RoundTable';
import { dispatch, exportCurrentRun, loadRun, setBalance, useStore } from '../store';

/**
 * Collapsible designer overlay (`?debug=1`, P6-01 … P6-03): edit every balance
 * value live, cheats, export / load runs, per-round table, raw state JSON.
 */
export function DebugPanel() {
  const { balance, run } = useStore();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'balance' | 'cheats' | 'runs' | 'state'>('balance');
  if (!open) {
    return (
      <button type="button" className="debug-toggle" onClick={() => setOpen(true)}>
        debug
      </button>
    );
  }
  return (
    <div className="debug">
      <div className="debug__bar">
        <strong>Debug</strong>
        {(['balance', 'cheats', 'runs', 'state'] as const).map((t) => (
          <button type="button" key={t} className={`btn--small ${tab === t ? 'btn--primary' : ''}`} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <button type="button" className="btn--small" onClick={() => setOpen(false)}>
          close
        </button>
      </div>
      <div className="debug__body">
        {tab === 'balance' && <BalanceTab balance={balance} />}
        {tab === 'cheats' && <CheatsTab run={run} />}
        {tab === 'runs' && <RunsTab run={run} />}
        {tab === 'state' && <StateTab run={run} />}
      </div>
    </div>
  );
}

// --- Balance ----------------------------------------------------------------------

type Json = number | string | boolean | Json[] | { [k: string]: Json };

function setAtPath(obj: Json, path: (string | number)[], value: Json): Json {
  if (path.length === 0) return value;
  const [head, ...rest] = path as [string | number, ...(string | number)[]];
  if (Array.isArray(obj)) {
    const copy = obj.slice();
    copy[Number(head)] = setAtPath(copy[Number(head)] as Json, rest, value);
    return copy;
  }
  const o = obj as { [k: string]: Json };
  return { ...o, [head]: setAtPath(o[head] as Json, rest, value) };
}

function BalanceTab({ balance }: { balance: Balance }) {
  const update = (path: (string | number)[], value: Json) => setBalance(setAtPath(balance as unknown as Json, path, value) as unknown as Balance);
  return (
    <div>
      <p className="muted">
        Every value from <code>content/balance.ts</code>. Edits apply to the running engine on its next action and are logged into the run so exports replay exactly.{' '}
        <button type="button" className="btn--small" onClick={() => setBalance(structuredClone(defaultBalance))}>
          Reset to defaults
        </button>
      </p>
      <Editor value={balance as unknown as Json} path={[]} onChange={update} />
    </div>
  );
}

function Editor({ value, path, onChange }: { value: Json; path: (string | number)[]; onChange: (path: (string | number)[], v: Json) => void }) {
  if (typeof value === 'number') {
    return <input type="number" step="any" value={value} onChange={(e) => onChange(path, Number(e.target.value))} style={{ width: 90 }} />;
  }
  if (typeof value === 'boolean') {
    return <input type="checkbox" checked={value} onChange={(e) => onChange(path, e.target.checked)} />;
  }
  if (typeof value === 'string') {
    return <input value={value} onChange={(e) => onChange(path, e.target.value)} style={{ width: 120 }} />;
  }
  if (Array.isArray(value)) {
    if (value.every((v) => typeof v === 'number')) {
      return (
        <input
          value={value.join(', ')}
          onChange={(e) => onChange(path, e.target.value.split(',').map((x) => Number(x.trim())).filter((n) => !Number.isNaN(n)))}
          style={{ width: 220 }}
          title="comma-separated numbers"
        />
      );
    }
    if (value.every((v) => typeof v === 'string')) {
      return <input value={value.join(', ')} onChange={(e) => onChange(path, e.target.value.split(',').map((x) => x.trim()).filter(Boolean))} style={{ width: 220 }} />;
    }
    return (
      <div className="debug__group">
        {value.map((v, i) => (
          <div className="debug__row" key={i}>
            <span className="debug__key">[{i}]</span>
            <Editor value={v} path={[...path, i]} onChange={onChange} />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="debug__group">
      {Object.entries(value).map(([k, v]) => (
        <div className="debug__row" key={k}>
          <span className="debug__key">{k}</span>
          <Editor value={v} path={[...path, k]} onChange={onChange} />
        </div>
      ))}
    </div>
  );
}

// --- Cheats -----------------------------------------------------------------------

function CheatsTab({ run }: { run: RunState | null }) {
  const [amount, setAmount] = useState(10);
  const [lives, setLives] = useState(1);
  const [round, setRound] = useState(5);
  const [cardId, setCardId] = useState(cardContent[0]!.id);
  const [modId, setModId] = useState(inRunModifiers[0]!.id);
  const [bossMod, setBossMod] = useState(bossModifiers[0]!.id);
  if (!run) return <p className="muted">Start a run to use cheats.</p>;
  const row = (label: string, control: React.ReactNode) => (
    <div className="debug__row">
      <span className="debug__key">{label}</span>
      {control}
    </div>
  );
  return (
    <div className="debug__group">
      <p className="muted">Cheats are logged as DEBUG actions, so exported runs still replay.</p>
      {row(
        'currency',
        <>
          <input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} style={{ width: 70 }} />
          <button type="button" className="btn--small" onClick={() => dispatch({ type: 'DEBUG', op: { kind: 'currency', amount } })}>
            add
          </button>
        </>,
      )}
      {row(
        'lives',
        <>
          <input type="number" value={lives} onChange={(e) => setLives(Number(e.target.value))} style={{ width: 70 }} />
          <button type="button" className="btn--small" onClick={() => dispatch({ type: 'DEBUG', op: { kind: 'lives', lives } })}>
            set
          </button>
        </>,
      )}
      {row(
        'card',
        <>
          <select value={cardId} onChange={(e) => setCardId(e.target.value)}>
            {cardContent.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button type="button" className="btn--small" onClick={() => dispatch({ type: 'DEBUG', op: { kind: 'card', cardId } })}>
            grant
          </button>
        </>,
      )}
      {row(
        'modifier',
        <>
          <select value={modId} onChange={(e) => setModId(e.target.value)}>
            {inRunModifiers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <button type="button" className="btn--small" onClick={() => dispatch({ type: 'DEBUG', op: { kind: 'modifier', id: modId } })}>
            grant
          </button>
        </>,
      )}
      {row(
        'skip to round',
        <>
          <input type="number" min={1} max={24} value={round} onChange={(e) => setRound(Number(e.target.value))} style={{ width: 70 }} />
          <button type="button" className="btn--small btn--danger" onClick={() => dispatch({ type: 'DEBUG', op: { kind: 'round', round } })}>
            go
          </button>
        </>,
      )}
      {row(
        'boss modifier',
        <>
          <select value={bossMod} onChange={(e) => setBossMod(e.target.value)}>
            {bossModifiers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <button type="button" className="btn--small" disabled={run.phase !== 'BOSS_INTRO'} onClick={() => dispatch({ type: 'DEBUG', op: { kind: 'boss_modifier', id: bossMod } })}>
            force (at intro)
          </button>
        </>,
      )}
    </div>
  );
}

// --- Runs -------------------------------------------------------------------------

function RunsTab({ run }: { run: RunState | null }) {
  const [json, setJson] = useState('');
  const [error, setError] = useState<string | null>(null);
  const download = () => {
    const blob = new Blob([exportCurrentRun()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `morpheme-run-${run?.seed}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const load = () => {
    try {
      loadRun(json);
      setError(null);
      setJson('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <div>
      <div className="row">
        <button type="button" className="btn--small" disabled={!run} onClick={download}>
          Export run JSON
        </button>
        <button type="button" className="btn--small" disabled={!run} onClick={() => navigator.clipboard?.writeText(exportCurrentRun())}>
          Copy to clipboard
        </button>
      </div>
      <h3 style={{ marginTop: 12 }}>Load run</h3>
      <textarea value={json} onChange={(e) => setJson(e.target.value)} rows={4} style={{ width: '100%' }} placeholder='paste an export {"seed": …}' />
      <div className="row">
        <button type="button" className="btn--small btn--primary" disabled={!json.trim()} onClick={load}>
          Replay and take over
        </button>
        {error && <span style={{ color: 'var(--danger)' }}>{error}</span>}
      </div>
      {run && (
        <>
          <h3 style={{ marginTop: 12 }}>Rounds</h3>
          <RoundTable run={run} />
        </>
      )}
    </div>
  );
}

// --- State ------------------------------------------------------------------------

function StateTab({ run }: { run: RunState | null }) {
  const [withLog, setWithLog] = useState(false);
  if (!run) return <p className="muted">No run.</p>;
  const shown = withLog ? run : { ...run, log: `(${run.log.length} entries hidden)` };
  return (
    <div>
      <label>
        <input type="checkbox" checked={withLog} onChange={(e) => setWithLog(e.target.checked)} /> include log
      </label>
      <pre className="debug__json">{JSON.stringify(shown, null, 2)}</pre>
    </div>
  );
}
