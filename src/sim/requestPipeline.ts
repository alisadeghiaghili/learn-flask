/**
 * Request lifecycle simulator for a parsed Flask application.
 *
 * Mirrors the real Flask/Werkzeug pipeline at a teaching level:
 * before_request hooks → URL matching → view → after_request hooks → response.
 */

import type {
  Expr,
  FlaskApp,
  HttpMethod,
  PipelineEvent,
  PipelineTrace,
  RouteRule,
  SessionStore,
  SimRequest,
  SimResponse,
  Statement,
} from '../model/types';

interface MatchResult {
  route: RouteRule;
  viewArgs: Record<string, string>;
}

interface ExecResult {
  response: SimResponse | null;
  /** True when abort() or an error path was taken. */
  aborted: boolean;
}

/**
 * Compile a Werkzeug rule like `/user/<name>` into a RegExp.
 *
 * Args:
 *   rule: URL rule with optional `<converter:param>` or `<param>` segments.
 *
 * Returns:
 *   RegExp matching the path and a list of parameter names in order.
 *
 * Examples:
 *   >>> const [re, names] = compileRule('/user/<name>');
 *   >>> names
 *   ['name']
 */
export function compileRule(rule: string): [RegExp, string[]] {
  const names: string[] = [];
  const pattern = rule
    .split('/')
    .map((segment) => {
      if (!segment) return '';
      const m = segment.match(/^<(?:(\w+):)?(\w+)>$/);
      if (m) {
        names.push(m[2]);
        return m[1] === 'int' ? '(\\d+)' : '([^/]+)';
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');

  const normalized = pattern.endsWith('/') && pattern !== '/' ? pattern.slice(0, -1) : pattern;
  const re =
    normalized === '/'
      ? /^\/$/
      : new RegExp(`^${normalized === '' ? '/' : normalized}/?$`);
  return [re, names];
}

/**
 * Match a request path against the application's route table.
 *
 * Args:
 *   app: Parsed Flask application.
 *   path: Request path (no query string).
 *   method: HTTP method.
 *
 * Returns:
 *   Matching route with view args, or null.
 */
export function matchRoute(
  app: FlaskApp,
  path: string,
  method: HttpMethod,
): MatchResult | null {
  const normalized = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;

  for (const route of app.routes) {
    const [re, names] = compileRule(route.rule);
    const m = normalized.match(re);
    if (!m) continue;
    if (!route.methods.includes(method) && !(method === 'HEAD' && route.methods.includes('GET'))) {
      // Method mismatch — keep looking; 405 is raised after full scan.
      continue;
    }
    const viewArgs: Record<string, string> = {};
    names.forEach((n, i) => {
      viewArgs[n] = decodeURIComponent(m[i + 1]);
    });
    return { route, viewArgs };
  }
  return null;
}

/** True when some route matches the path but not the method (→ 405). */
export function methodNotAllowed(app: FlaskApp, path: string): boolean {
  const normalized = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
  return app.routes.some((route) => {
    const [re] = compileRule(route.rule);
    return re.test(normalized);
  });
}

/**
 * Simulate a full HTTP request through the Flask pipeline.
 *
 * Args:
 *   app: Parsed Flask application.
 *   request: Simulated request.
 *   session: Optional mutable session store shared across requests.
 *
 * Returns:
 *   PipelineTrace with stage events and the final response.
 */
export function simulateRequest(
  app: FlaskApp,
  request: SimRequest,
  session: SessionStore = {},
): PipelineTrace {
  const events: PipelineEvent[] = [];
  const args = parseQuery(request.query ?? '');
  const form = request.form ?? parseFormBody(request.body, request.headers);
  const json = request.json ?? parseJsonBody(request.body, request.headers);
  const config: Record<string, string> = { ...app.config };
  const path = request.path.startsWith('/') ? request.path : `/${request.path}`;
  const fullRequest: SimRequest = { ...request, form, json };

  events.push({
    stage: 'client',
    label: 'Client',
    detail: `${request.method} ${path}${request.query ? `?${request.query}` : ''}`,
    status: 'done',
  });
  events.push({
    stage: 'wsgi',
    label: 'WSGI',
    detail: 'Werkzeug receives the request',
    status: 'done',
  });

  // before_request hooks (app-level first, then blueprint-level for matched route)
  const beforeHooks = app.hooks.filter((h) => h.kind === 'before_request' && h.owner === null);
  let viewArgs: Record<string, string> = {};
  let matched: MatchResult | null = null;
  // Pre-match path args for hooks that inspect request.view_args
  matched = matchRoute(app, path, request.method);
  if (matched) viewArgs = matched.viewArgs;

  let response: SimResponse | null = null;
  let shortCircuited = false;

  events.push({
    stage: 'before_request',
    label: 'before_request',
    detail:
      beforeHooks.length === 0
        ? 'No app-level hooks'
        : beforeHooks.map((h) => h.name).join(' → '),
    status: beforeHooks.length ? 'active' : 'skipped',
  });

  for (const hook of beforeHooks) {
    const result = executeBody(hook.body, {
      app,
      request: fullRequest,
      viewArgs,
      args,
      endpoint: matched?.route.endpoint ?? null,
      role: 'before',
      session,
      config,
    });
    if (result.response) {
      response = {
        ...result.response,
        shortCircuited: true,
        endpoint: hook.name,
        blueprint: hook.owner,
      };
      shortCircuited = true;
      events[events.length - 1].status = 'done';
      events.push({
        stage: 'before_request',
        label: 'short-circuit',
        detail: `${hook.name} returned ${response.status}`,
        status: 'done',
      });
      break;
    }
  }

  if (!response) {
    events[events.length - 1].status = 'done';

    if (!matched) {
      events.push({
        stage: 'routing',
        label: 'Routing',
        detail: methodNotAllowed(app, path)
          ? 'Path matched, method not allowed → 405'
          : 'No matching route → 404',
        status: 'error',
      });
      response = errorHandler(app, methodNotAllowed(app, path) ? 405 : 404, fullRequest, undefined, session);
    } else {
      events.push({
        stage: 'routing',
        label: 'Routing',
        detail: `→ ${matched.route.blueprint ? `${matched.route.blueprint}.` : ''}${matched.route.endpoint} ${JSON.stringify(matched.viewArgs)}`,
        status: 'done',
      });

      // Blueprint before_request
      const bpBefore = matched.route.blueprint
        ? app.hooks.filter(
            (h) => h.kind === 'before_request' && h.owner === matched!.route.blueprint,
          )
        : [];

      let blocked = false;
      for (const hook of bpBefore) {
        const result = executeBody(hook.body, {
          app,
          request: fullRequest,
          viewArgs: matched.viewArgs,
          args,
          endpoint: matched.route.endpoint,
          role: 'before',
          session,
          config,
        });
        if (result.response) {
          response = {
            ...result.response,
            shortCircuited: true,
            endpoint: hook.name,
            blueprint: hook.owner,
          };
          shortCircuited = true;
          blocked = true;
          break;
        }
      }

      if (!blocked) {
        events.push({
          stage: 'view',
          label: 'View',
          detail: matched.route.endpoint,
          status: 'active',
        });
        const viewResult = executeBody(matched.route.body, {
          app,
          request: fullRequest,
          viewArgs: matched.viewArgs,
          args,
          endpoint: matched.route.endpoint,
          role: 'view',
          session,
          config,
        });
        if (viewResult.aborted && !viewResult.response) {
          response = errorHandler(app, 500, fullRequest, undefined, session);
          events[events.length - 1].status = 'error';
        } else if (viewResult.aborted && viewResult.response) {
          response = {
            ...viewResult.response,
            shortCircuited: false,
            endpoint: matched.route.endpoint,
            blueprint: matched.route.blueprint,
          };
          events[events.length - 1].status = 'done';
        } else if (viewResult.response) {
          response = {
            ...viewResult.response,
            shortCircuited: false,
            endpoint: matched.route.endpoint,
            blueprint: matched.route.blueprint,
          };
          events[events.length - 1].status = 'done';
        } else {
          // Implicit 200 empty
          response = {
            status: 200,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
            body: '',
            shortCircuited: false,
            endpoint: matched.route.endpoint,
            blueprint: matched.route.blueprint,
          };
          events[events.length - 1].status = 'done';
        }
      }
    }
  }

  // after_request hooks (app-level)
  const afterHooks = app.hooks.filter((h) => h.kind === 'after_request' && h.owner === null);
  events.push({
    stage: 'after_request',
    label: 'after_request',
    detail:
      afterHooks.length === 0
        ? 'No app-level hooks'
        : afterHooks.map((h) => h.name).join(' → '),
    status: afterHooks.length ? 'active' : 'skipped',
  });

  if (response && afterHooks.length) {
    for (const hook of afterHooks) {
      const result = executeBody(hook.body, {
        app,
        request: fullRequest,
        viewArgs,
        args,
        endpoint: response.endpoint,
        role: 'after',
        currentResponse: response,
        session,
        config,
      });
      if (result.response) {
        response = result.response;
      } else if (result.aborted) {
        // hook returned None — keep response
      }
    }
    // after hooks that only mutate via expr are ignored in the subset;
    // returning a response replaces it.
  }
  if (afterHooks.length) {
    events[events.length - 1].status = 'done';
  }

  const finalResponse: SimResponse =
    response ??
    ({
      status: 500,
      headers: {},
      body: 'Internal Server Error',
      shortCircuited,
      endpoint: null,
      blueprint: null,
    } satisfies SimResponse);

  events.push({
    stage: finalResponse.status >= 400 ? 'error' : 'response',
    label: 'Response',
    detail: `${finalResponse.status} ${statusText(finalResponse.status)} · ${finalResponse.body.slice(0, 80)}`,
    status: finalResponse.status >= 400 ? 'error' : 'done',
  });

  return {
    request: fullRequest,
    response: finalResponse,
    events,
    viewArgs,
    args,
  };
}

interface ExecContext {
  app: FlaskApp;
  request: SimRequest;
  viewArgs: Record<string, string>;
  args: Record<string, string>;
  endpoint: string | null;
  role: 'view' | 'before' | 'after' | 'error';
  currentResponse?: SimResponse;
  /** Mutable browser session (persists across requests when provided). */
  session?: SessionStore;
  /** Mutable app.config overlay (session of config writes). */
  config?: Record<string, string>;
}

/**
 * Execute a statement list from a view or hook body.
 *
 * Args:
 *   body: Parsed statements.
 *   ctx: Runtime context (request, view args, current response).
 *
 * Returns:
 *   ExecResult with optional response and abort flag.
 */
function executeBody(body: Statement[], ctx: ExecContext): ExecResult {
  for (const stmt of body) {
    const result = executeStatement(stmt, ctx);
    if (result) return result;
  }
  return { response: null, aborted: false };
}

function executeStatement(stmt: Statement, ctx: ExecContext): ExecResult | null {
  switch (stmt.kind) {
    case 'return': {
      if (stmt.expr.kind === 'name' && stmt.expr.id === 'None') {
        if (ctx.role === 'after' && ctx.currentResponse) {
          return { response: ctx.currentResponse, aborted: false };
        }
        return { response: null, aborted: false };
      }
      if (ctx.role === 'after' && stmt.expr.kind === 'name' && stmt.expr.id === 'response') {
        return { response: ctx.currentResponse ?? null, aborted: false };
      }
      // after_request may return `response.body + " [done]", 200`
      if (ctx.role === 'after' && ctx.currentResponse) {
        const replaced = rewriteResponseExpr(stmt.expr, ctx.currentResponse);
        if (replaced) {
          return { response: exprToResponse(replaced, ctx, ctx.currentResponse.status), aborted: false };
        }
      }
      return { response: exprToResponse(stmt.expr, ctx, 200), aborted: false };
    }
    case 'return_tuple': {
      if (ctx.role === 'after' && ctx.currentResponse) {
        const replaced = rewriteResponseExpr(stmt.body, ctx.currentResponse);
        if (replaced) {
          return { response: exprToResponse(replaced, ctx, stmt.status), aborted: false };
        }
      }
      return {
        response: exprToResponse(stmt.body, ctx, stmt.status),
        aborted: false,
      };
    }
    case 'abort':
      return {
        response: errorHandler(ctx.app, stmt.status, ctx.request, stmt.description),
        aborted: true,
      };
    case 'if': {
      const testResult = evalTest(stmt.test, ctx);
      const branch = testResult ? stmt.body : stmt.orelse;
      const inner = executeBody(branch, ctx);
      if (inner.response || inner.aborted) return inner;
      return null;
    }
    case 'assign_session': {
      if (ctx.session) {
        const v = evaluateExpr(stmt.value, ctx);
        ctx.session[stmt.key] = v;
      }
      return null;
    }
    case 'assign_config': {
      if (ctx.config) {
        ctx.config[stmt.key] = evaluateExpr(stmt.value, ctx);
      }
      return null;
    }
    case 'expr':
      return null;
    default:
      return null;
  }
}

/**
 * Rewrite expressions that concatenate `response.body` for after_request.
 *
 * Args:
 *   expr: Return expression, possibly containing `response.body`.
 *   current: The response being post-processed.
 *
 * Returns:
 *   A rewritten Expr, or null when no response.body reference exists.
 */
function rewriteResponseExpr(
  expr: Expr,
  current: SimResponse,
): Expr | null {
  if (expr.kind === 'raw' && expr.text.includes('response.body')) {
    // Handle: response.body + " [done]"
    const m = expr.text.match(/^response\.body\s*\+\s*(['"])(.*)\1$/);
    if (m) {
      return { kind: 'str', value: current.body + m[2] };
    }
    // Handle: response.body
    if (expr.text.trim() === 'response.body') {
      return { kind: 'str', value: current.body };
    }
  }
  return null;
}

function evalTest(test: string, ctx: ExecContext): boolean {
  const t = test.trim();

  if (t.includes(' and ')) {
    return t.split(' and ').every((part) => evalTest(part, ctx));
  }
  if (t.includes(' or ')) {
    return t.split(' or ').some((part) => evalTest(part, ctx));
  }
  if (t.startsWith('not ') && !t.startsWith('not request.') && !t.startsWith('not session.')) {
    return !evalTest(t.slice(4), ctx);
  }

  const methodEq = t.match(/^request\.method\s*==\s*(['"])(\w+)\1$/);
  if (methodEq) return ctx.request.method === methodEq[2].toUpperCase();
  const methodNe = t.match(/^request\.method\s*!=\s*(['"])(\w+)\1$/);
  if (methodNe) return ctx.request.method !== methodNe[2].toUpperCase();
  if (t === 'True') return true;
  if (t === 'False') return false;

  // not request.headers.get("X-Api-Key")
  const notHeader = t.match(/^not\s+request\.headers\.get\(\s*['"]([\w-]+)['"]\s*\)$/);
  if (notHeader) {
    const v = ctx.request.headers?.[notHeader[1]];
    return !v;
  }
  // request.headers.get("X") == "v" / !=
  const headerCmp = t.match(
    /^request\.headers\.get\(\s*['"]([\w-]+)['"]\s*\)\s*(==|!=)\s*(['"])(.*?)\3$/,
  );
  if (headerCmp) {
    const v = ctx.request.headers?.[headerCmp[1]] ?? '';
    return headerCmp[2] === '==' ? v === headerCmp[4] : v !== headerCmp[4];
  }
  // request.args.get("k") == "v" / !=
  const argCmp = t.match(
    /^request\.args\.get\(\s*['"](\w+)['"]\s*\)\s*(==|!=)\s*(['"])(.*?)\3$/,
  );
  if (argCmp) {
    const v = ctx.args[argCmp[1]] ?? '';
    return argCmp[2] === '==' ? v === argCmp[4] : v !== argCmp[4];
  }
  // not request.args.get("k")
  const notArg = t.match(/^not\s+request\.args\.get\(\s*['"](\w+)['"]\s*\)$/);
  if (notArg) return !ctx.args[notArg[1]];

  // request.form.get("k") == "v" / !=
  const formCmp = t.match(
    /^request\.form\.get\(\s*['"](\w+)['"]\s*\)\s*(==|!=)\s*(['"])(.*?)\3$/,
  );
  if (formCmp) {
    const v = ctx.request.form?.[formCmp[1]] ?? '';
    return formCmp[2] === '==' ? v === formCmp[4] : v !== formCmp[4];
  }
  const notForm = t.match(/^not\s+request\.form\.get\(\s*['"](\w+)['"]\s*\)$/);
  if (notForm) return !ctx.request.form?.[notForm[1]];

  // request.json.get("k") == "v" / !=
  const jsonCmp = t.match(
    /^request\.json\.get\(\s*['"](\w+)['"]\s*\)\s*(==|!=)\s*(['"])(.*?)\3$/,
  );
  if (jsonCmp) {
    const obj = (ctx.request.json ?? {}) as Record<string, unknown>;
    const v = obj[jsonCmp[1]];
    const vs = v === undefined || v === null ? '' : String(v);
    return jsonCmp[2] === '==' ? vs === jsonCmp[4] : vs !== jsonCmp[4];
  }

  // session.get("k") == "v" / !=
  const sessCmp = t.match(
    /^session\.get\(\s*['"](\w+)['"]\s*\)\s*(==|!=)\s*(['"])(.*?)\3$/,
  );
  if (sessCmp) {
    const v = ctx.session?.[sessCmp[1]] ?? '';
    return sessCmp[2] === '==' ? v === sessCmp[4] : v !== sessCmp[4];
  }
  const notSess = t.match(/^not\s+session\.get\(\s*['"](\w+)['"]\s*\)$/);
  if (notSess) return !ctx.session?.[notSess[1]];
  const sessTruthy = t.match(/^session\.get\(\s*['"](\w+)['"]\s*\)$/);
  if (sessTruthy) return Boolean(ctx.session?.[sessTruthy[1]]);

  // not request.json.get("k") / truthy
  const notJson = t.match(/^not\s+request\.json\.get\(\s*['"](\w+)['"]\s*\)$/);
  if (notJson) {
    const obj = (ctx.request.json ?? {}) as Record<string, unknown>;
    return !obj[notJson[1]];
  }

  // Bare name truthiness against viewArgs / args
  if (t in ctx.viewArgs) return Boolean(ctx.viewArgs[t]);
  return Boolean(t);
}

function exprToResponse(expr: Expr, ctx: ExecContext, status: number): SimResponse {
  const body = evaluateExpr(expr, ctx) ?? '';
  const headers: Record<string, string> = { 'Content-Type': contentTypeFor(expr) };
  return {
    status,
    headers,
    body,
    shortCircuited: false,
    endpoint: ctx.endpoint,
    blueprint: null,
  };
}

function contentTypeFor(expr: Expr): string {
  if (expr.kind === 'jsonify') return 'application/json';
  if (expr.kind === 'render_template') return 'text/html; charset=utf-8';
  return 'text/html; charset=utf-8';
}

function evaluateExpr(expr: Expr, ctx: ExecContext): string {
  switch (expr.kind) {
    case 'str':
      return expr.value ?? '';
    case 'fstr':
      return formatFString(expr.template, ctx);
    case 'jsonify': {
      const obj: Record<string, unknown> = {};
      for (const [k, raw] of Object.entries(expr.fields)) {
        obj[k] = evalPyLiteral(raw, ctx);
      }
      return JSON.stringify(obj);
    }
    case 'render_template': {
      const ctxObj: Record<string, unknown> = {};
      for (const [k, raw] of Object.entries(expr.context)) {
        ctxObj[k] = evalPyLiteral(raw, ctx);
      }
      // Represent templates as an HTML shell with visible context — teaching aid.
      const lines = Object.entries(ctxObj)
        .map(([k, v]) => `  <dt>${escapeHtml(k)}</dt><dd>${escapeHtml(String(v))}</dd>`)
        .join('\n');
      return `<!doctype html>\n<title>${escapeHtml(expr.template)}</title>\n<!-- template: ${escapeHtml(expr.template)} -->\n<dl>\n${lines}\n</dl>`;
    }
    case 'redirect':
      if (typeof expr.location === 'string') {
        return `Redirect → ${expr.location}`;
      }
      return `Redirect → url_for('${expr.location.url_for}')`;
    case 'make_response':
      return evaluateExpr(expr.body, ctx);
    case 'name':
      if (expr.id === 'response' && ctx.currentResponse) return ctx.currentResponse.body ?? '';
      if (expr.id === 'None') return '';
      return expr.id;
    case 'raw': {
      const v = evalPyLiteral(expr.text, ctx);
      return v === null || v === undefined ? '' : String(v);
    }
    default:
      return '';
  }
}

function formatFString(template: string, ctx: ExecContext): string {
  return template.replace(/\{([^{}]+)\}/g, (_m, exprSrc: string) => {
    const key = exprSrc.trim();
    if (key.startsWith('request.args.get(')) {
      const arg = key.match(/request\.args\.get\(\s*['"](\w+)['"]/);
      if (arg) return ctx.args[arg[1]] ?? '';
    }
    if (key.startsWith('request.form.get(')) {
      const arg = key.match(/request\.form\.get\(\s*['"](\w+)['"]/);
      if (arg) return ctx.request.form?.[arg[1]] ?? '';
    }
    if (key.startsWith('request.json.get(')) {
      const arg = key.match(/request\.json\.get\(\s*['"](\w+)['"]/);
      if (arg) {
        const obj = (ctx.request.json ?? {}) as Record<string, unknown>;
        const v = obj[arg[1]];
        return v === undefined || v === null ? '' : String(v);
      }
    }
    if (key.startsWith('session.get(')) {
      const arg = key.match(/session\.get\(\s*['"](\w+)['"]/);
      if (arg) return ctx.session?.[arg[1]] ?? '';
    }
    if (key.startsWith('app.config.get(') || key.startsWith('config.get(')) {
      const arg = key.match(/config\.get\(\s*['"]([\w_]+)['"]/);
      if (arg) return ctx.config?.[arg[1]] ?? ctx.app.config[arg[1]] ?? '';
    }
    if (key.startsWith('request.view_args') || key.includes('[')) {
      // e.g. name or request.view_args['name'] — try viewArgs
      const bracket = key.match(/\[\s*['"](\w+)['"]\s*\]/);
      const name = bracket ? bracket[1] : key.replace(/^request\.view_args\[?['"]?|['"]?\]?$/g, '');
      if (name in ctx.viewArgs) return ctx.viewArgs[name];
    }
    if (key in ctx.viewArgs) return ctx.viewArgs[key];
    if (key === 'request.method') return ctx.request.method;
    if (key === 'request.path') return ctx.request.path;
    return '';
  });
}

function evalPyLiteral(raw: string, ctx: ExecContext): unknown {
  const t = raw.trim();
  if (/^['"]/.test(t)) {
    const s = t.match(/^(['"])(.*)\1$/s);
    return s ? s[2] : t;
  }
  if (t === 'True') return true;
  if (t === 'False') return false;
  if (t === 'None') return null;
  if (/^-?\d+$/.test(t)) return Number(t);
  if (/^-?\d+\.\d+$/.test(t)) return Number(t);
  if (t.startsWith('f') && /^f(['"])/.test(t)) {
    const s = t.match(/^f(['"])(.*)\1$/s);
    return s ? formatFString(s[2], ctx) : t;
  }
  // request.json.get("name") / request.form.get / session.get / request.args.get
  const dyn = t.match(
    /^(?:request\.(?:json|form|args)\.get|session\.get|request\.headers\.get)\(\s*['"](\w+)['"]\s*\)$/,
  );
  if (dyn) {
    const key = dyn[1];
    if (t.startsWith('request.json')) {
      const obj = (ctx.request.json ?? {}) as Record<string, unknown>;
      return obj[key];
    }
    if (t.startsWith('request.form')) return ctx.request.form?.[key];
    if (t.startsWith('request.args')) return ctx.args[key];
    if (t.startsWith('request.headers')) return ctx.request.headers?.[key];
    if (t.startsWith('session')) return ctx.session?.[key];
  }
  if (t in ctx.viewArgs) return ctx.viewArgs[t];
  if (t in ctx.args) return ctx.args[t];
  return t;
}

function errorHandler(
  app: FlaskApp,
  code: number,
  request: SimRequest,
  description?: string,
  session: SessionStore = {},
): SimResponse {
  const handlers = app.hooks.filter((h) => h.kind === 'errorhandler' && h.code === code);
  if (handlers.length === 0) {
    return {
      status: code,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      body: description ?? defaultErrorBody(code),
      shortCircuited: false,
      endpoint: null,
      blueprint: null,
    };
  }
  const handler = handlers[0];
  const result = executeBody(handler.body, {
    app,
    request,
    viewArgs: {},
    args: parseQuery(request.query ?? ''),
    endpoint: handler.name,
    role: 'error',
    session,
    config: { ...app.config },
  });
  if (result.response) {
    return { ...result.response, status: result.response.status || code };
  }
  return {
    status: code,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    body: description ?? defaultErrorBody(code),
    shortCircuited: false,
    endpoint: handler.name,
    blueprint: handler.owner,
  };
}

function defaultErrorBody(code: number): string {
  const text = statusText(code);
  return `<!doctype html>\n<title>${code} ${text}</title>\n<h1>${code} ${text}</h1>`;
}

function parseQuery(query: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!query) return out;
  for (const pair of query.split('&')) {
    if (!pair) continue;
    const [k, v = ''] = pair.split('=');
    out[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '));
  }
  return out;
}

function parseFormBody(
  body: string | undefined,
  headers: Record<string, string> | undefined,
): Record<string, string> {
  if (!body) return {};
  const ct = headers?.['Content-Type'] ?? headers?.['content-type'] ?? '';
  if (ct.includes('json')) return {};
  if (body.trim().startsWith('{')) return {};
  return parseQuery(body);
}

function parseJsonBody(
  body: string | undefined,
  headers: Record<string, string> | undefined,
): unknown {
  if (!body) return undefined;
  const ct = headers?.['Content-Type'] ?? headers?.['content-type'] ?? '';
  const looksJson = ct.includes('json') || body.trim().startsWith('{') || body.trim().startsWith('[');
  if (!looksJson) return undefined;
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Map an HTTP status code to its reason phrase.
 *
 * Args:
 *   code: HTTP status code.
 *
 * Returns:
 *   Reason phrase for known codes, otherwise "Unknown".
 */
export function statusText(code: number): string {
  const map: Record<number, string> = {
    200: 'OK',
    201: 'Created',
    204: 'No Content',
    301: 'Moved Permanently',
    302: 'Found',
    304: 'Not Modified',
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    405: 'Method Not Allowed',
    500: 'Internal Server Error',
  };
  return map[code] ?? 'Unknown';
}
