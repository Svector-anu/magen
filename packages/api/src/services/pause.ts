let _paused = process.env.EXECUTION_PAUSED === "true";
let _pausedAt: string | null = _paused ? new Date().toISOString() : null;
let _resumedAt: string | null = null;

export function isPaused(): boolean {
  // Re-check env var each call so a process restart with the var set is respected
  return _paused || process.env.EXECUTION_PAUSED === "true";
}

export function pause(): void {
  _paused = true;
  _pausedAt = new Date().toISOString();
  _resumedAt = null;
}

export function resume(): void {
  _paused = false;
  _resumedAt = new Date().toISOString();
}

export function pauseStatus(): { paused: boolean; pausedAt: string | null; resumedAt: string | null } {
  return { paused: isPaused(), pausedAt: _pausedAt, resumedAt: _resumedAt };
}
