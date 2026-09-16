import { useEffect, useRef, useState } from 'react';
import type { RunState } from '../engine';
import { playCue } from './audio';
import { BossIntroScreen, BossScreen, EndScreen, RewardScreen, RoundScreen, ScoreScreen, ShopScreen, StartScreen } from './screens';
import { DebugPanel } from './components';
import { debugEnabled, endRun, loadDictionary, useStore } from './store';

/** Routes to one screen per run phase (spec §6). */
export function App() {
  const { run } = useStore();
  const [transition, setTransition] = useState(false);
  const prevPhase = useRef<RunState['phase'] | null>(null);

  useEffect(() => {
    void loadDictionary();
  }, []);

  // P4-07: a 1 s "BOSS ROUND" transition when a boss round begins.
  useEffect(() => {
    const phase = run?.phase ?? null;
    if (phase === 'BOSS_INTRO' && prevPhase.current !== 'BOSS_INTRO') {
      setTransition(true);
      playCue('boss_transition', 'relic');
      const t = setTimeout(() => setTransition(false), 1000);
      prevPhase.current = phase;
      return () => clearTimeout(t);
    }
    prevPhase.current = phase;
    return undefined;
  }, [run?.phase]);

  const debug = debugEnabled();
  if (!run) {
    return (
      <div>
        <StartScreen />
        {debug && <DebugPanel />}
      </div>
    );
  }
  return (
    <div>
      {debug && <DebugPanel />}
      {transition && (
        <div className="transition" aria-hidden>
          <div className="transition__text">BOSS ROUND</div>
        </div>
      )}
      <Screen run={run} />
      {run.phase !== 'GAME_OVER' && run.phase !== 'WIN' && (
        <p style={{ marginTop: 24 }}>
          <button type="button" className="btn--small" onClick={endRun}>
            Abandon run
          </button>
        </p>
      )}
    </div>
  );
}

function Screen({ run }: { run: RunState }) {
  switch (run.phase) {
    case 'EXTEND':
      return <RoundScreen run={run} />;
    case 'SCORED':
    case 'BOSS_END':
      return <ScoreScreen run={run} />;
    case 'SHOP':
      return <ShopScreen run={run} />;
    case 'BOSS_INTRO':
      return <BossIntroScreen run={run} />;
    case 'BOSS_PLAY':
      return <BossScreen run={run} />;
    case 'BOSS_REWARD':
      return <RewardScreen run={run} />;
    case 'GAME_OVER':
    case 'WIN':
      return <EndScreen run={run} />;
    case 'ROUND_START':
      return <p>Starting round {run.round}…</p>;
  }
}
