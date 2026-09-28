/**
 * Terminal panel: scrollback log + command input with history.
 */

import { useEffect, useRef, useState } from 'react';

export interface TerminalLine {
  kind: 'cmd' | 'out' | 'err' | 'ok' | 'info';
  text: string;
}

export interface TerminalProps {
  lines: TerminalLine[];
  onSubmit: (line: string) => void;
}

/**
 * Interactive command terminal.
 *
 * Args:
 *   props: Scrollback lines and submit callback.
 *
 * Returns:
 *   Terminal panel body with history and prompt.
 */
export function Terminal({ lines, onSubmit }: TerminalProps) {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  function submit() {
    const line = input.trim();
    if (!line) return;
    setHistory((h) => [...h, line]);
    setHistIdx(-1);
    setInput('');
    onSubmit(line);
  }

  return (
    <div className="terminal-body">
      <div className="terminal-scroll" ref={scrollRef} onClick={() => inputRef.current?.focus()}>
        {lines.map((l, i) => (
          <div key={i} className={`term-line ${l.kind}`}>
            {l.kind === 'cmd' ? `$ ${l.text}` : l.text}
          </div>
        ))}
      </div>
      <div className="term-input-row">
        <span className="term-prompt">flask&gt;</span>
        <input
          ref={inputRef}
          className="term-input"
          value={input}
          spellCheck={false}
          placeholder="help · levels · GET / · check"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              if (history.length === 0) return;
              const next = histIdx < 0 ? history.length - 1 : Math.max(0, histIdx - 1);
              setHistIdx(next);
              setInput(history[next] ?? '');
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              if (histIdx < 0) return;
              const next = histIdx + 1;
              if (next >= history.length) {
                setHistIdx(-1);
                setInput('');
              } else {
                setHistIdx(next);
                setInput(history[next] ?? '');
              }
            }
          }}
          aria-label="Terminal command input"
        />
      </div>
    </div>
  );
}
