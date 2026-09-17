import { useState } from 'react';

interface Props {
  label: string;
  confirmLabel?: string;
  className?: string;
  disabled?: boolean;
  onConfirm: () => void;
}

/**
 * Two-click confirmation. `window.confirm` is unavailable in some embedded
 * browsers (it silently returns false), so destructive actions confirm inline.
 */
export function ConfirmButton({ label, confirmLabel = 'Yes, do it', className = 'btn--danger', disabled, onConfirm }: Props) {
  const [arming, setArming] = useState(false);
  if (!arming) {
    return (
      <button type="button" className={className} disabled={disabled} onClick={() => setArming(true)}>
        {label}
      </button>
    );
  }
  return (
    <span className="row">
      <button
        type="button"
        className="btn--danger"
        onClick={() => {
          setArming(false);
          onConfirm();
        }}
      >
        {confirmLabel}
      </button>
      <button type="button" className="btn--small" onClick={() => setArming(false)}>
        Cancel
      </button>
    </span>
  );
}
