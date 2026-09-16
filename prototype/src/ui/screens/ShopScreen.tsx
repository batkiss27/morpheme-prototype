import type { RunState } from '../../engine';
import { RunHeader } from '../components';
import { dispatch } from '../store';

/** SHOP placeholder (P2-04): currency and Leave, so rounds chain. Real shop in M3. */
export function ShopScreen({ run }: { run: RunState }) {
  return (
    <div>
      <RunHeader run={run} />
      <div className="panel">
        <h2>Shop</h2>
        <p>
          You have <strong>{run.currency}</strong> currency.
        </p>
        <p className="muted">Card slots, tile actions and rerolls arrive in M3. Nothing to buy yet.</p>
        <button type="button" className="btn--primary" onClick={() => dispatch({ type: 'LEAVE' })}>
          Leave → round {run.round + 1}
        </button>
      </div>
    </div>
  );
}
