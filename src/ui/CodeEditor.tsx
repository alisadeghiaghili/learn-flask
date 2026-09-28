/**
 * Minimal code editor with line numbers and Tab-to-spaces.
 */

import { useMemo, useRef } from 'react';

export interface CodeEditorProps {
  value: string;
  onChange: (next: string) => void;
  readOnly?: boolean;
}

/**
 * Render a plain-text Flask source editor.
 *
 * Args:
 *   props: Controlled value and change handler.
 *
 * Returns:
 *   Editor panel body with gutter and textarea.
 */
export function CodeEditor({ value, onChange, readOnly }: CodeEditorProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const lines = useMemo(() => value.split('\n').length, [value]);

  return (
    <div className="editor-wrap">
      <div className="editor-gutter" aria-hidden>
        {Array.from({ length: lines }, (_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
      </div>
      <textarea
        ref={ref}
        className="code-editor"
        value={value}
        readOnly={readOnly}
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Tab') {
            e.preventDefault();
            const el = e.currentTarget;
            const start = el.selectionStart;
            const end = el.selectionEnd;
            const next = `${value.slice(0, start)}    ${value.slice(end)}`;
            onChange(next);
            requestAnimationFrame(() => {
              el.selectionStart = el.selectionEnd = start + 4;
            });
          }
        }}
        aria-label="Flask source editor"
      />
    </div>
  );
}
