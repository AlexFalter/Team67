import { useState, type RefObject } from 'react';

export function BuildingAnswer({ value, length, readOnly, inputRef, onChange }: {
  value: string;
  length: number;
  readOnly: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  onChange: (value: string) => void;
}) {
  const [caret, setCaret] = useState(0);
  const activeSlot = Math.min(caret, value.length, length - 1);
  return <div className="exam-answer-entry">
    <div className="exam-answer-slots" aria-hidden="true">
      {Array.from({ length }, (_, slot) => <span key={slot} className={`exam-answer-slot${slot === activeSlot ? ' current' : ''}`}>{value[slot] ?? '_'}</span>)}
    </div>
    <input id="building-answer" ref={inputRef} aria-label="Building code" aria-describedby="building-answer-hint"
      value={value} maxLength={length} readOnly={readOnly} autoComplete="off" autoCorrect="off" autoCapitalize="characters" spellCheck={false}
      onChange={event => {
        const value = event.currentTarget.value;
        const selection = event.currentTarget.selectionStart ?? value.length;
        setCaret(value.slice(0, selection).toUpperCase().replace(/[^A-Z]/g, '').length);
        onChange(value.toUpperCase().replace(/[^A-Z]/g, ''));
      }}
      onSelect={event => setCaret(event.currentTarget.selectionStart ?? value.length)} />
  </div>;
}
