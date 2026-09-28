/**
 * LearnFlask application shell: state, commands, panels, dialogs.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parseFlaskSource } from './parser/flaskParser';
import type { FlaskApp, PipelineTrace } from './model/types';
import { checkLevel, sandboxStarter, type LevelCheckResult, type LevelSpec } from './model/levels';
import { allLevels, findLevel } from './levels/catalog';
import { helpText, parseCommand, type CommandOutcome } from './commands';
import { AppGraphView } from './ui/AppGraphView';
import { PipelineView } from './ui/PipelineView';
import { CodeEditor } from './ui/CodeEditor';
import { Terminal, type TerminalLine } from './ui/Terminal';
import { CheckDialog, InstructionsDialog, LevelsDialog } from './ui/Dialogs';

type ModalState =
  | { kind: 'none' }
  | { kind: 'levels' }
  | { kind: 'instructions' }
  | { kind: 'check'; result: LevelCheckResult };

const LS_SOLVED = 'learnflask.solved';
const LS_SOURCE = 'learnflask.source';
const LS_LEVEL = 'learnflask.level';

function loadSolved(): string[] {
  try {
    const raw = localStorage.getItem(LS_SOLVED);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

/**
 * Root application component.
 *
 * Returns:
 *   Full LearnFlask UI.
 */
export function App() {
  const [source, setSource] = useState(() => localStorage.getItem(LS_SOURCE) ?? sandboxStarter());
  const [levelId, setLevelId] = useState<string | null>(() => localStorage.getItem(LS_LEVEL));
  const [solvedIds, setSolvedIds] = useState<string[]>(loadSolved);
  const [lines, setLines] = useState<TerminalLine[]>([
    {
      kind: 'info',
      text: 'LearnFlask — interactive Flask visualization. Type `help` or `levels`.',
    },
  ]);
  const [trace, setTrace] = useState<PipelineTrace | null>(null);
  const [modal, setModal] = useState<ModalState>({ kind: 'none' });
  const [commandCount, setCommandCount] = useState(0);
  const undoStack = useRef<string[]>([]);
  const sessionRef = useRef<Record<string, string>>({});

  const level: LevelSpec | null = levelId ? findLevel(levelId) : null;
  const app: FlaskApp = useMemo(() => parseFlaskSource(source), [source]);

  useEffect(() => {
    localStorage.setItem(LS_SOURCE, source);
  }, [source]);

  useEffect(() => {
    if (levelId) localStorage.setItem(LS_LEVEL, levelId);
    else localStorage.removeItem(LS_LEVEL);
  }, [levelId]);

  useEffect(() => {
    localStorage.setItem(LS_SOLVED, JSON.stringify(solvedIds));
  }, [solvedIds]);

  // Auto-check when level is active and code may have become valid
  useEffect(() => {
    if (!level) return;
    const result = checkLevel(app, level);
    if (result.ok && !solvedIds.includes(level.id)) {
      setSolvedIds((prev) => [...prev, level.id]);
      pushLines([
        { kind: 'ok', text: `✓ Level complete: ${level.title}` },
        { kind: 'out', text: 'Type `levels` for the next one, or use the toolbar.' },
      ]);
    }
    // Intentionally depend on app/level identity only — not solvedIds to avoid loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app, level]);

  const pushLines = useCallback((next: TerminalLine[]) => {
    setLines((prev) => [...prev, ...next]);
  }, []);

  const setEditorSource = useCallback(
    (next: string, recordUndo = true) => {
      if (recordUndo) {
        undoStack.current = [...undoStack.current.slice(-30), source];
      }
      setSource(next);
    },
    [source],
  );

  const loadLevel = useCallback(
    (id: string) => {
      const lv = findLevel(id);
      if (!lv) return;
      undoStack.current = [...undoStack.current.slice(-30), source];
      sessionRef.current = {};
      setLevelId(id);
      setSource(lv.starterCode);
      setTrace(null);
      setModal({ kind: 'instructions' });
      pushLines([{ kind: 'info', text: `Loaded level: ${lv.title} — ${lv.goal}` }]);
    },
    [source, pushLines],
  );

  const runCommand = useCallback(
    (raw: string) => {
      pushLines([{ kind: 'cmd', text: raw }]);
      setCommandCount((c) => c + 1);

      const outcome: CommandOutcome = parseCommand(raw, {
        app,
        source,
        level,
        solvedIds,
        commandCount: commandCount + 1,
        session: sessionRef.current,
      });

      switch (outcome.kind) {
        case 'output':
          if (outcome.text) pushLines([{ kind: 'out', text: outcome.text }]);
          break;
        case 'error':
          pushLines([{ kind: 'err', text: outcome.text }]);
          break;
        case 'request': {
          setTrace(outcome.trace);
          const r = outcome.trace.response;
          pushLines([
            {
              kind: r.status >= 400 ? 'err' : 'out',
              text: `${r.status} ${r.endpoint ? `(${r.endpoint}) ` : ''}${r.body.slice(0, 120)}`,
            },
          ]);
          break;
        }
        case 'check': {
          setModal({ kind: 'check', result: outcome.result });
          if (outcome.result.ok) {
            if (level && !solvedIds.includes(level.id)) {
              setSolvedIds((prev) => [...prev, level.id]);
            }
            pushLines([{ kind: 'ok', text: '✓ All assertions passed.' }]);
          } else {
            pushLines([
              { kind: 'err', text: `${outcome.result.failures.length} assertion(s) failed.` },
            ]);
          }
          break;
        }
        case 'load-level':
          loadLevel(outcome.levelId);
          break;
        case 'show-levels':
          setModal({ kind: 'levels' });
          break;
        case 'show-solution':
          if (level?.solutionCode) {
            setEditorSource(level.solutionCode);
            pushLines([{ kind: 'info', text: 'Solution loaded into the editor.' }]);
          } else {
            pushLines([{ kind: 'err', text: 'No solution for this mode. Start a level first.' }]);
          }
          break;
        case 'show-help':
          pushLines([{ kind: 'out', text: helpText() }]);
          break;
        case 'reset':
          sessionRef.current = {};
          if (level) {
            setEditorSource(level.starterCode);
            pushLines([{ kind: 'info', text: 'Level starter restored (session cleared).' }]);
          } else {
            setEditorSource(sandboxStarter());
            pushLines([{ kind: 'info', text: 'Sandbox restored (session cleared).' }]);
          }
          setTrace(null);
          break;
        case 'undo': {
          const prev = undoStack.current.pop();
          if (prev === undefined) {
            pushLines([{ kind: 'err', text: 'Nothing to undo.' }]);
          } else {
            setSource(prev);
            pushLines([{ kind: 'info', text: 'Undid last edit.' }]);
          }
          break;
        }
        case 'clear':
          setLines([
            { kind: 'info', text: 'LearnFlask — interactive Flask visualization. Type `help`.' },
          ]);
          break;
        default:
          break;
      }
    },
    [app, source, level, solvedIds, commandCount, pushLines, loadLevel, setEditorSource],
  );

  const errors = app.diagnostics.filter((d) => d.severity === 'error');
  const parseLabel = errors.length
    ? `${errors.length} parse error(s)`
    : `${app.routes.length} route(s) · ${app.hooks.length} hook(s)`;

  const nextLevel = useMemo(() => {
    if (!level) return null;
    const all = allLevels();
    const idx = all.findIndex((l) => l.id === level.id);
    return idx >= 0 && idx < all.length - 1 ? all[idx + 1] : null;
  }, [level]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">LearnFlask</span>
          <span className="brand-sub">visual tutorial</span>
        </div>
        <div className="level-meta">
          <div className="level-title">
            {level ? `${level.seriesId} / ${level.title}` : 'Sandbox — free play'}
          </div>
          <div className="level-goal">
            {level ? level.goal : 'Edit code, then simulate requests from the terminal.'}
          </div>
        </div>
        <span
          className={`level-badge${level && solvedIds.includes(level.id) ? ' solved' : ''}`}
          title="Level status"
        >
          {level
            ? solvedIds.includes(level.id)
              ? 'solved'
              : 'in progress'
            : 'sandbox'}
          {level ? ` · ${commandCount} cmd` : ''}
        </span>
        <div className="toolbar">
          <button className="btn" onClick={() => setModal({ kind: 'levels' })}>
            Levels
          </button>
          {level && (
            <button className="btn" onClick={() => setModal({ kind: 'instructions' })}>
              Goal
            </button>
          )}
          <button
            className="btn"
            onClick={() => {
              if (level?.solutionCode) setEditorSource(level.solutionCode);
              else runCommand('solution');
            }}
          >
            Solution
          </button>
          <button className="btn" onClick={() => runCommand('reset')}>
            Reset
          </button>
          <button className="btn primary" onClick={() => runCommand('check')}>
            Check
          </button>
        </div>
      </header>

      <main className="workspace">
        <section className="panel app-graph">
          <div className="panel-header">
            <span className="panel-title">App graph</span>
            <span className={`parse-status${errors.length ? ' err' : ' ok'}`}>{parseLabel}</span>
          </div>
          <div className="panel-body">
            <AppGraphView app={app} />
          </div>
        </section>

        <section className="panel pipeline">
          <div className="panel-header">
            <span className="panel-title">Request pipeline</span>
            <span className="parse-status">
              {trace
                ? `${trace.request.method} ${trace.request.path}`
                : 'idle — try GET /'}
            </span>
          </div>
          <div className="panel-body">
            <PipelineView trace={trace} />
          </div>
        </section>

        <section className="panel editor-panel">
          <div className="panel-header">
            <span className="panel-title">app.py</span>
            <span className="parse-status">live parse</span>
          </div>
          <CodeEditor value={source} onChange={(v) => setEditorSource(v)} />
        </section>

        <section className="panel terminal-panel">
          <div className="panel-header">
            <span className="panel-title">Terminal</span>
            <span className="parse-status">flask&gt; · ↑ history</span>
          </div>
          <Terminal lines={lines} onSubmit={runCommand} />
        </section>
      </main>

      {modal.kind === 'levels' && (
        <LevelsDialog
          currentId={levelId}
          solvedIds={solvedIds}
          onPick={(id) => {
            setModal({ kind: 'none' });
            loadLevel(id);
          }}
          onClose={() => setModal({ kind: 'none' })}
        />
      )}

      {modal.kind === 'instructions' && level && (
        <InstructionsDialog
          level={level}
          onClose={() => setModal({ kind: 'none' })}
          onSolution={() => {
            if (level.solutionCode) setEditorSource(level.solutionCode);
            setModal({ kind: 'none' });
          }}
        />
      )}

      {modal.kind === 'check' && (
        <CheckDialog
          ok={modal.result.ok}
          failures={modal.result.failures}
          onClose={() => setModal({ kind: 'none' })}
          onNext={
            nextLevel
              ? () => {
                  setModal({ kind: 'none' });
                  loadLevel(nextLevel.id);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
