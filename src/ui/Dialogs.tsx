/**
 * Level browser modal and level instructions modal.
 */

import type { LevelSpec, SeriesSpec } from '../model/levels';
import { SERIES } from '../levels/catalog';

export interface LevelsDialogProps {
  currentId: string | null;
  solvedIds: string[];
  onPick: (levelId: string) => void;
  onClose: () => void;
}

/**
 * Modal listing all series and levels with solved marks.
 *
 * Args:
 *   props: Current level, solved set, pick/close handlers.
 *
 * Returns:
 *   Modal element.
 */
export function LevelsDialog({ currentId, solvedIds, onPick, onClose }: LevelsDialogProps) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>Levels</h2>
          <button className="btn ghost" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="modal-body">
          {SERIES.map((s: SeriesSpec) => (
            <div key={s.id} className="series-block">
              <h3>{s.title}</h3>
              <p>{s.blurb}</p>
              <div className="level-list">
                {s.levels.map((level, i) => {
                  const solved = solvedIds.includes(level.id);
                  const current = level.id === currentId;
                  return (
                    <button
                      key={level.id}
                      className={`level-item${current ? ' current' : ''}`}
                      onClick={() => onPick(level.id)}
                    >
                      <span className="idx">{i + 1}</span>
                      <span className="meta">
                        <div className="name">{level.title}</div>
                        <div className="goal">{level.goal}</div>
                      </span>
                      {solved && <span className="mark">✓</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export interface InstructionsDialogProps {
  level: LevelSpec;
  onClose: () => void;
  onSolution: () => void;
}

/**
 * Modal showing the active level's instructions.
 *
 * Args:
 *   props: Level, close handler, load-solution handler.
 *
 * Returns:
 *   Modal element.
 */
export function InstructionsDialog({ level, onClose, onSolution }: InstructionsDialogProps) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>
            {level.title} — <span style={{ color: 'var(--accent)' }}>{level.goal}</span>
          </h2>
          <button className="btn ghost" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="modal-body">
          <div className="instructions">{level.instructions}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={onSolution}>
              Load solution
            </button>
            <button className="btn primary" onClick={onClose}>
              Start editing
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export interface CheckDialogProps {
  ok: boolean;
  failures: string[];
  onNext?: () => void;
  onClose: () => void;
}

/**
 * Modal showing level check results.
 *
 * Args:
 *   props: Check outcome, optional next-level action, close handler.
 *
 * Returns:
 *   Modal element.
 */
export function CheckDialog({ ok, failures, onNext, onClose }: CheckDialogProps) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>{ok ? 'Level complete' : 'Not yet'}</h2>
          <button className="btn ghost" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="modal-body">
          {ok ? (
            <div className="success-banner">
              All assertions passed. Type `levels` to continue, or use Next.
            </div>
          ) : (
            <pre className="failures">{failures.join('\n')}</pre>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            {ok && onNext && (
              <button className="btn primary" onClick={onNext}>
                Next level
              </button>
            )}
            <button className="btn" onClick={onClose}>
              Back to editor
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
