import { useSyncExternalStore } from 'react';
import * as music from '../music';

/** Mute / unmute the soundtrack (persisted). */
export function MusicToggle() {
  const state = useSyncExternalStore(music.subscribe, () => `${music.isMuted()}:${music.nowPlaying() ?? ''}`, () => 'false:');
  const [mutedStr, playing] = state.split(':');
  const muted = mutedStr === 'true';
  return (
    <button type="button" className="btn--small" onClick={() => music.setMuted(!muted)} title={playing ? `playing ${playing}` : 'music'}>
      {muted ? '🔇 music off' : `🔊 ${playing ? playing.replace('-', ' ') : 'music'}`}
    </button>
  );
}
