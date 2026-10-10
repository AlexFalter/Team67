export function ExamDebugButton({ enabled, onTeleport }: { enabled: boolean; onTeleport: (enterPortal: boolean) => void }) {
  if (!import.meta.env.DEV) return null;
  return <button className="exam-debug-button" onClick={event => onTeleport(event.shiftKey)} disabled={!enabled} title={enabled ? 'Teleport just outside the exam portal. Shift-click to enter it directly.' : 'Create/join a room and ready up first'}>DEBUG · Teleport to Polyterrasse ↗</button>;
}
