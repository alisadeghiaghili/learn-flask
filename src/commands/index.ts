/**
 * Sandbox and meta commands (undo, reset, levels, help, request, ...).
 */

import type { FlaskApp, HttpMethod, PipelineTrace, SimRequest } from '../model/types';
import { simulateRequest } from '../sim/requestPipeline';
import { checkLevel, type LevelCheckResult, type LevelSpec } from '../model/levels';
import { allLevels, findLevel } from '../levels/catalog';

export type CommandOutcome =
  | { kind: 'output'; text: string }
  | { kind: 'request'; trace: PipelineTrace }
  | { kind: 'check'; result: LevelCheckResult }
  | { kind: 'load-level'; levelId: string }
  | { kind: 'show-levels' }
  | { kind: 'show-solution' }
  | { kind: 'show-help' }
  | { kind: 'reset' }
  | { kind: 'undo' }
  | { kind: 'clear' }
  | { kind: 'error'; text: string };

export interface CommandContext {
  app: FlaskApp;
  source: string;
  level: LevelSpec | null;
  solvedIds: string[];
  commandCount: number;
  /** Live session store for multi-request challenges. */
  session?: Record<string, string>;
}

/**
 * Parse and execute a single terminal command line.
 *
 * Args:
 *   line: Raw command line from the terminal.
 *   ctx: Current app / level context.
 *
 * Returns:
 *   CommandOutcome describing what the UI should do.
 *
 * Examples:
 *   >>> parseCommand('help').kind
 *   'show-help'
 */
export function parseCommand(line: string, ctx: CommandContext): CommandOutcome {
  const trimmed = line.trim();
  if (!trimmed) return { kind: 'output', text: '' };

  const [cmd, ...rest] = trimmed.split(/\s+/);
  const arg = rest.join(' ');

  switch (cmd.toLowerCase()) {
    case 'help':
    case '?':
      return { kind: 'show-help' };

    case 'levels':
    case 'ls':
      return { kind: 'show-levels' };

    case 'solution':
    case 'show-solution':
      return { kind: 'show-solution' };

    case 'reset':
      return { kind: 'reset' };

    case 'undo':
      return { kind: 'undo' };

    case 'clear':
    case 'cls':
      return { kind: 'clear' };

    case 'check':
    case 'test': {
      if (!ctx.level) {
        return { kind: 'error', text: 'No active level. Type `levels` to pick one.' };
      }
      return { kind: 'check', result: checkLevel(ctx.app, ctx.level) };
    }

    case 'level': {
      const level = findLevel(arg);
      if (!level) {
        return { kind: 'error', text: `Unknown level "${arg}". Type \`levels\`.` };
      }
      return { kind: 'load-level', levelId: level.id };
    }

    case 'routes':
    case 'url_map': {
      if (ctx.app.routes.length === 0) {
        return { kind: 'output', text: '(no routes)' };
      }
      const lines = ctx.app.routes.map((r) => {
        const bp = r.blueprint ? `[${r.blueprint}] ` : '';
        return `${r.methods.join('/').padEnd(10)} ${r.rule.padEnd(24)} → ${bp}${r.endpoint}`;
      });
      return { kind: 'output', text: lines.join('\n') };
    }

    case 'hooks': {
      if (ctx.app.hooks.length === 0) {
        return { kind: 'output', text: '(no hooks)' };
      }
      const lines = ctx.app.hooks.map((h) => {
        const owner = h.owner ? `[${h.owner}] ` : '';
        const code = h.code !== undefined ? `(${h.code})` : '';
        return `${h.kind}${code}  ${owner}${h.name}`;
      });
      return { kind: 'output', text: lines.join('\n') };
    }

    case 'parse': {
      const errors = ctx.app.diagnostics.filter((d) => d.severity === 'error');
      const warnings = ctx.app.diagnostics.filter((d) => d.severity === 'warning');
      const parts = [
        `routes: ${ctx.app.routes.length}`,
        `blueprints: ${ctx.app.blueprints.length}`,
        `hooks: ${ctx.app.hooks.length}`,
        `errors: ${errors.length}`,
        `warnings: ${warnings.length}`,
      ];
      const detail = [...errors, ...warnings]
        .map((d) => `  L${d.line} [${d.severity}] ${d.message}`)
        .join('\n');
      return { kind: 'output', text: parts.join('\n') + (detail ? `\n${detail}` : '') };
    }

    case 'session': {
      const s = ctx.session ?? {};
      const keys = Object.keys(s);
      if (keys.length === 0) return { kind: 'output', text: '(empty session)' };
      return {
        kind: 'output',
        text: keys.map((k) => `${k} = ${JSON.stringify(s[k])}`).join('\n'),
      };
    }

    case 'config': {
      const keys = Object.keys(ctx.app.config);
      if (keys.length === 0) return { kind: 'output', text: '(no config keys)' };
      return {
        kind: 'output',
        text: keys.map((k) => `${k} = ${JSON.stringify(ctx.app.config[k])}`).join('\n'),
      };
    }

    case 'request':
    case 'req':
    case 'get':
    case 'post':
    case 'put':
    case 'patch':
    case 'delete': {
      return executeRequestCommand(cmd, rest, ctx);
    }

    case 'golf':
    case 'score': {
      const n = ctx.commandCount;
      const par = ctx.level?.parCommands;
      return {
        kind: 'output',
        text: par
          ? `commands: ${n} (par ${par})`
          : `commands: ${n}`,
      };
    }

    case 'progress': {
      const levels = allLevels();
      const lines = levels.map((l) => {
        const mark = ctx.solvedIds.includes(l.id) ? '✓' : ' ';
        return `[${mark}] ${l.seriesId}/${l.id} — ${l.title}`;
      });
      const solved = ctx.solvedIds.length;
      return { kind: 'output', text: `solved ${solved}/${levels.length}\n` + lines.join('\n') };
    }

    default:
      // Bare HTTP verb + path shorthand: `GET /foo`
      if (/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/i.test(cmd) && rest.length >= 1) {
        return executeRequestCommand(cmd, rest, ctx);
      }
      return {
        kind: 'error',
        text: `Unknown command "${cmd}". Type \`help\`.`,
      };
  }
}

function executeRequestCommand(
  cmd: string,
  rest: string[],
  ctx: CommandContext,
): CommandOutcome {
  let method: HttpMethod;
  let pathPart: string;

  if (cmd.toLowerCase() === 'request' || cmd.toLowerCase() === 'req') {
    // request GET /path [header K:V] [form k=v] [body {...}]
    const m = rest[0]?.toUpperCase();
    if (!m || !isMethod(m)) {
      return {
        kind: 'error',
        text: 'Usage: request GET /path [header Name:value] [form k=v] [body {"a":1}]',
      };
    }
    method = m as HttpMethod;
    pathPart = rest[1] ?? '/';
  } else {
    method = cmd.toUpperCase() as HttpMethod;
    pathPart = rest[0] ?? '/';
  }

  const headers: Record<string, string> = {};
  const form: Record<string, string> = {};
  let body: string | undefined;
  let json: unknown;

  for (let i = 0; i < rest.length; i += 1) {
    const tok = rest[i];
    const next = rest[i + 1];
    if (tok.toLowerCase() === 'header' && next) {
      const idx = next.indexOf(':');
      if (idx > 0) headers[next.slice(0, idx).trim()] = next.slice(idx + 1).trim();
      i += 1;
    } else if (tok.toLowerCase() === 'form' && next) {
      // form user=ali  OR form user=ali form pass=x
      const idx = next.indexOf('=');
      if (idx > 0) form[next.slice(0, idx)] = next.slice(idx + 1);
      i += 1;
    } else if (tok.toLowerCase() === 'body' && next) {
      // body {"a":1} — remaining tokens may split; join rest from i+1
      body = rest.slice(i + 1).join(' ');
      try {
        json = JSON.parse(body);
        headers['Content-Type'] = headers['Content-Type'] ?? 'application/json';
      } catch {
        // keep raw body
      }
      break;
    } else if (tok.toLowerCase() === 'json' && next) {
      body = rest.slice(i + 1).join(' ');
      try {
        json = JSON.parse(body);
        headers['Content-Type'] = 'application/json';
      } catch {
        return { kind: 'error', text: 'Invalid JSON after `body`/`json`' };
      }
      break;
    }
  }

  if (Object.keys(form).length > 0 && !body) {
    body = Object.entries(form)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    headers['Content-Type'] = headers['Content-Type'] ?? 'application/x-www-form-urlencoded';
  }

  let path = pathPart;
  let query = '';
  const qIdx = pathPart.indexOf('?');
  if (qIdx >= 0) {
    path = pathPart.slice(0, qIdx);
    query = pathPart.slice(qIdx + 1);
  }
  if (!path.startsWith('/')) path = `/${path}`;

  const request: SimRequest = {
    method,
    path,
    query,
    headers,
    body,
    form: Object.keys(form).length ? form : undefined,
    json,
  };
  const trace = simulateRequest(ctx.app, request, ctx.session ?? {});
  return { kind: 'request', trace };
}

function isMethod(m: string): boolean {
  return ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(m);
}

/** Static help text for the terminal. */
export function helpText(): string {
  return [
    'LearnFlask commands',
    '───────────────────',
    '  help                 this message',
    '  levels               list levels',
    '  level <id>           start a level',
    '  check                verify level goal',
    '  solution             load level solution into editor',
    '  reset                restore starter code / sandbox',
    '  undo                 restore previous editor snapshot',
    '  clear                clear terminal',
    '  routes               print URL map',
    '  hooks                print before/after/error handlers',
    '  parse                parse diagnostics',
    '  session              show browser session store',
    '  config               print app.config keys',
    '  progress             solved levels',
    '  golf                 command count vs par',
    '',
    '  request GET /path [header K:v]   simulate HTTP',
    '  request POST /login form user=ali form pass=x',
    '  request POST /api body {"name":"ali"}',
    '  GET /path                        shorthand',
    '  GET /user/ali?x=1',
    '',
    'Edit Flask code in the editor; it re-parses as you type.',
  ].join('\n');
}
