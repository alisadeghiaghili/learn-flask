/**
 * Request lifecycle pipeline visualization and last-response card.
 */

import type { PipelineTrace } from '../model/types';
import { statusText } from '../sim/requestPipeline';

export interface PipelineViewProps {
  trace: PipelineTrace | null;
}

/**
 * Render the request pipeline stages and response summary.
 *
 * Args:
 *   props: Latest pipeline trace, or null when idle.
 *
 * Returns:
 *   React element for the pipeline panel body.
 */
export function PipelineView({ trace }: PipelineViewProps) {
  if (!trace) {
    return (
      <div className="pipeline-idle">
        No request in flight.
        <br />
        <br />
        Type a request in the terminal:
        <br />
        <code>GET /</code>
        <br />
        <code>GET /user/ali</code>
        <br />
        <code>POST /items</code>
        <br />
        <code>GET /ping header X-Api-Key:secret</code>
      </div>
    );
  }

  const { events, response } = trace;
  const statusClass =
    response.status >= 400
      ? 'status-err'
      : response.status >= 300
        ? 'status-redirect'
        : 'status-ok';

  return (
    <div>
      <div className="pipeline-track">
        {events.map((e, i) => (
          <div key={`${e.stage}-${i}`} className={`stage ${e.status}`}>
            <div className="stage-dot" />
            <div className="stage-label">{e.label}</div>
            <div className="stage-detail">{e.detail}</div>
          </div>
        ))}
      </div>

      <div className="response-card">
        <header>
          <span className={statusClass}>
            {response.status} {statusText(response.status)}
          </span>
          <span style={{ color: 'var(--ink-dim)' }}>
            {response.headers['Content-Type'] ?? ''}
          </span>
          {response.shortCircuited && (
            <span style={{ color: 'var(--violet)', marginLeft: 'auto' }}>short-circuit</span>
          )}
        </header>
        <div className="response-body">{response.body || '(empty body)'}</div>
      </div>
    </div>
  );
}
