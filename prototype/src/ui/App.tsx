import { useEffect } from 'react';
import type { RunState } from '../engine';
import { BossStubScreen, EndScreen, RoundScreen, ScoreScreen, ShopScreen, StartScreen } from './screens';
import { endRun, loadDictionary, useStore } from './store';

/** Routes to one screen per run phase (spec §6). */
export function App() {
  const { run } = useStore();

  useEffect(() => {
    void loadDictionary();
  }, []);

  if (!run) return <StartScreen />;
  return (
    <div>
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
      return <ScoreScreen run={run} />;
    case 'SHOP':
      return <ShopScreen run={run} />;
    case 'BOSS_INTRO':
    case 'BOSS_PLAY':
    case 'BOSS_END':
    case 'BOSS_REWARD':
      return <BossStubScreen run={run} />;
    case 'GAME_OVER':
    case 'WIN':
      return <EndScreen run={run} />;
    case 'ROUND_START':
      return <p>Starting round {run.round}…</p>;
  }
}
