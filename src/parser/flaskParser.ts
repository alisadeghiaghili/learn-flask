/**
 * Flask-subset parser.
 *
 * Parses a constrained Python surface that is enough for LearnFlask levels
 * and sandbox: Flask/Blueprint construction, route decorators, hooks,
 * simple view bodies (return / abort / if). This is intentionally not a
 * full Python parser — see README "Supported subset".
 */

import type {
  BlueprintDef,
  Expr,
  FlaskApp,
  HookDef,
  HookKind,
  HttpMethod,
  RouteRule,
  Statement,
  TemplateFilterDef,
} from '../model/types';
import { emptyApp } from '../model/types';

const HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

interface PendingRoute {
  rule: string;
  methods: HttpMethod[];
  owner: string | null;
  line: number;
}

interface RawFunction {
  name: string;
  bodyLines: { text: string; line: number }[];
  line: number;
}

/**
 * Parse Flask-subset source into an application graph.
 *
 * Args:
 *   source: Python-like source code using the supported Flask subset.
 *
 * Returns:
 *   A FlaskApp with routes, blueprints, hooks, and parse diagnostics.
 *
 * Examples:
 *   >>> parseFlaskSource('app = Flask(__name__)\\n@app.route("/")\\ndef index():\\n    return "hi"').routes.length
 *   1
 */
export function parseFlaskSource(source: string): FlaskApp {
  const app = emptyApp();
  const lines = source.split(/\r?\n/);
  const pendingRoutes: PendingRoute[] = [];
  const pendingHooks: { kind: HookKind; owner: string | null; code?: number; line: number }[] = [];
  const pendingFilters: { name: string; owner: string | null; line: number }[] = [];
  let pendingDecoratorError: string | null = null;

  const varToApp = new Map<string, string>();
  const varToBlueprint = new Map<string, BlueprintDef>();

  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const lineNo = i + 1;
    const trimmed = raw.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      i += 1;
      continue;
    }

    // Decorator lines
    if (trimmed.startsWith('@')) {
      const dec = trimmed.slice(1).trim();
      const routeMatch = dec.match(
        /^(\w+)\.route\s*\(\s*(['"])(.*?)\2\s*(?:,\s*(.*))?\s*\)$/,
      );
      if (routeMatch) {
        const ownerVar = routeMatch[1];
        const rule = routeMatch[3];
        const rest = routeMatch[4] ?? '';
        const methods = parseMethods(rest) ?? ['GET'];
        pendingRoutes.push({
          rule,
          methods,
          owner: ownerVar,
          line: lineNo,
        });
        i += 1;
        continue;
      }

      const hookMatch = dec.match(/^(\w+)\.(before_request|after_request)\s*(\(\s*\))?$/);
      if (hookMatch) {
        pendingHooks.push({
          kind: hookMatch[2] as HookKind,
          owner: hookMatch[1],
          line: lineNo,
        });
        i += 1;
        continue;
      }

      const errMatch = dec.match(/^(\w+)\.errorhandler\s*\(\s*(\d{3})\s*\)$/);
      if (errMatch) {
        pendingHooks.push({
          kind: 'errorhandler',
          owner: errMatch[1],
          code: Number(errMatch[2]),
          line: lineNo,
        });
        i += 1;
        continue;
      }

      const filterMatch = dec.match(/^(\w+)\.template_filter\s*\(\s*(['"])(.*?)\2\s*\)$/);
      if (filterMatch) {
        pendingFilters.push({
          name: filterMatch[3],
          owner: filterMatch[1],
          line: lineNo,
        });
        i += 1;
        continue;
      }

      pendingDecoratorError = `Unsupported decorator: @${dec}`;
      app.diagnostics.push({
        severity: 'warning',
        message: pendingDecoratorError,
        line: lineNo,
      });
      i += 1;
      continue;
    }

    // Assignments: app / blueprint / app.config
    const assignMatch = trimmed.match(/^(\w+)\s*=\s*(.+)$/);
    if (assignMatch) {
      const varName = assignMatch[1];
      const rhs = assignMatch[2].trim();

      const flaskCtor = rhs.match(/^Flask\s*\(\s*__name__\s*(?:,.*)?\)$/);
      if (flaskCtor) {
        app.appName = varName;
        varToApp.set(varName, varName);
        i += 1;
        continue;
      }

      const bpCtor = rhs.match(
        /^Blueprint\s*\(\s*(['"])(.*?)\1\s*,\s*__name__\s*(?:,\s*(.*))?\s*\)$/,
      );
      if (bpCtor) {
        const name = bpCtor[2];
        const rest = bpCtor[3] ?? '';
        const prefixMatch = rest.match(/url_prefix\s*=\s*(['"])(.*?)\1/);
        const bp: BlueprintDef = {
          name,
          importName: '__name__',
          urlPrefix: prefixMatch ? prefixMatch[2] : null,
          line: lineNo,
        };
        app.blueprints.push(bp);
        varToBlueprint.set(varName, bp);
        i += 1;
        continue;
      }

      i += 1;
      continue;
    }

    // app.config['KEY'] = 'value'  /  app.config["KEY"] = "value"
    const cfgMatch = trimmed.match(
      /^(\w+)\.config\s*\[\s*(['"])(.*?)\2\s*\]\s*=\s*(.+)$/,
    );
    if (cfgMatch) {
      const key = cfgMatch[3];
      const rawVal = cfgMatch[4].trim();
      const lit = rawVal.match(/^(['"])(.*)\1$/);
      app.config[key] = lit ? lit[2] : rawVal;
      i += 1;
      continue;
    }

    // register_blueprint
    const regMatch = trimmed.match(/^(\w+)\.register_blueprint\s*\(\s*(\w+)\s*(?:,.*)?\)$/);
    if (regMatch) {
      // Registration is implicit in the graph; URL prefix already on the blueprint.
      // Keep a warning if the blueprint is unknown.
      if (!varToBlueprint.has(regMatch[2])) {
        app.diagnostics.push({
          severity: 'warning',
          message: `register_blueprint(${regMatch[2]}) references unknown blueprint variable`,
          line: lineNo,
        });
      }
      i += 1;
      continue;
    }

    // Function definition
    const defMatch = trimmed.match(/^def\s+(\w+)\s*\(([^)]*)\)\s*:\s*$/);
    if (defMatch) {
      const fnName = defMatch[1];
      const bodyStart = i + 1;
      let j = bodyStart;
      const bodyLines: { text: string; line: number }[] = [];
      while (j < lines.length) {
        const bodyRaw = lines[j];
        if (!bodyRaw.trim()) {
          j += 1;
          continue;
        }
        if (!/^\s+/.test(bodyRaw) && bodyRaw.trim() !== '') {
          break;
        }
        bodyLines.push({ text: bodyRaw, line: j + 1 });
        j += 1;
      }

      // Application factory: re-parse the indented body as a nested module
      // so routes/hooks defined inside create_app() are registered.
      if (fnName === 'create_app') {
        app.factoryName = 'create_app';
        const nestedSource = dedentLines(bodyLines.map((b) => b.text));
        const nested = parseFlaskSource(nestedSource);
        if (nested.appName) app.appName = app.appName ?? nested.appName;
        Object.assign(app.config, nested.config);
        for (const bp of nested.blueprints) {
          if (!app.blueprints.some((b) => b.name === bp.name)) app.blueprints.push(bp);
        }
        for (const r of nested.routes) {
          if (!app.routes.some((x) => x.endpoint === r.endpoint && x.rule === r.rule)) {
            app.routes.push(r);
          }
        }
        for (const h of nested.hooks) app.hooks.push(h);
        for (const d of nested.diagnostics) {
          if (d.severity === 'error') app.diagnostics.push(d);
        }
        for (const pf of nested.templateFilters) app.templateFilters.push(pf);
        i = j;
        pendingRoutes.length = 0;
        pendingHooks.length = 0;
        pendingFilters.length = 0;
        continue;
      }

      const fn: RawFunction = { name: fnName, bodyLines, line: lineNo };
      consumeFunction(
        app,
        fn,
        pendingRoutes,
        pendingHooks,
        pendingFilters,
        varToApp,
        varToBlueprint,
      );
      pendingRoutes.length = 0;
      pendingHooks.length = 0;
      pendingFilters.length = 0;
      pendingDecoratorError = null;
      i = j;
      continue;
    }

    // import lines — ignored
    if (/^(from|import)\s+/.test(trimmed)) {
      i += 1;
      continue;
    }

    app.diagnostics.push({
      severity: 'warning',
      message: `Unrecognized statement: ${trimmed.slice(0, 60)}`,
      line: lineNo,
    });
    i += 1;
  }

  if (pendingRoutes.length || pendingHooks.length || pendingFilters.length) {
    app.diagnostics.push({
      severity: 'error',
      message: 'Decorators found without a following function definition',
      line: pendingRoutes[0]?.line ?? pendingHooks[0]?.line ?? pendingFilters[0]?.line ?? 1,
    });
  }

  return app;
}

function parseMethods(rest: string): HttpMethod[] | null {
  if (!rest) return null;
  const methodsMatch = rest.match(/methods\s*=\s*\[([^\]]*)\]/);
  if (!methodsMatch) return null;
  const parts = methodsMatch[1]
    .split(',')
    .map((p) => p.trim().replace(/^['"]|['"]$/g, '').toUpperCase())
    .filter((p) => p.length > 0);
  const methods = parts.filter((p): p is HttpMethod =>
    (HTTP_METHODS as string[]).includes(p),
  );
  return methods.length ? methods : null;
}

function consumeFunction(
  app: FlaskApp,
  fn: RawFunction,
  pendingRoutes: PendingRoute[],
  pendingHooks: { kind: HookKind; owner: string | null; code?: number; line: number }[],
  pendingFilters: { name: string; owner: string | null; line: number }[],
  varToApp: Map<string, string>,
  varToBlueprint: Map<string, BlueprintDef>,
): void {
  const body = parseBody(fn.bodyLines);

  for (const pr of pendingRoutes) {
    let blueprint: string | null = null;
    if (pr.owner && varToBlueprint.has(pr.owner)) {
      blueprint = varToBlueprint.get(pr.owner)!.name;
    } else if (pr.owner && !varToApp.has(pr.owner) && !varToBlueprint.has(pr.owner)) {
      app.diagnostics.push({
        severity: 'warning',
        message: `Route decorator on unknown object '${pr.owner}'`,
        line: pr.line,
      });
    }

    let rule = pr.rule;
    const bp = blueprint ? app.blueprints.find((b) => b.name === blueprint) : null;
    if (bp?.urlPrefix) {
      const prefix = bp.urlPrefix.endsWith('/')
        ? bp.urlPrefix.slice(0, -1)
        : bp.urlPrefix;
      if (!rule.startsWith(prefix)) {
        rule = joinUrl(prefix, rule);
      }
    }

    const route: RouteRule = {
      rule,
      methods: [...pr.methods],
      endpoint: fn.name,
      blueprint,
      body,
      line: pr.line,
    };
    app.routes.push(route);
  }

  for (const ph of pendingHooks) {
    let owner: string | null = null;
    if (ph.owner && varToBlueprint.has(ph.owner)) {
      owner = varToBlueprint.get(ph.owner)!.name;
    }
    const hook: HookDef = {
      kind: ph.kind,
      owner,
      name: fn.name,
      code: ph.code,
      body,
      line: ph.line,
    };
    app.hooks.push(hook);
  }

  for (const pf of pendingFilters) {
    let owner: string | null = null;
    if (pf.owner && varToBlueprint.has(pf.owner)) {
      owner = varToBlueprint.get(pf.owner)!.name;
    }
    const filterDef: TemplateFilterDef = {
      name: pf.name,
      owner,
      body,
      line: pf.line,
    };
    app.templateFilters.push(filterDef);
  }
}

function joinUrl(prefix: string, rule: string): string {
  if (rule === '/') return prefix || '/';
  if (prefix === '') return rule;
  return `${prefix}${rule.startsWith('/') ? rule : `/${rule}`}`;
}

/**
 * Parse an indented function body into a small statement AST.
 *
 * Args:
 *   bodyLines: Physical source lines of the body (with original indent).
 *
 * Returns:
 *   Parsed statements. Unknown lines become `{ kind: 'expr' }`.
 */
export function parseBody(bodyLines: { text: string; line: number }[]): Statement[] {
  const statements: Statement[] = [];
  let idx = 0;

  while (idx < bodyLines.length) {
    const { text, line } = bodyLines[idx];
    const trimmed = text.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      idx += 1;
      continue;
    }

    // if / else blocks (single-level, flat)
    const ifMatch = trimmed.match(/^if\s+(.+?)\s*:$/);
    if (ifMatch) {
      const test = ifMatch[1];
      const indent = indentOf(text);
      idx += 1;
      const body: Statement[] = [];
      const orelse: Statement[] = [];
      let inElse = false;
      while (idx < bodyLines.length) {
        const cur = bodyLines[idx];
        const curTrim = cur.text.trim();
        if (!curTrim) {
          idx += 1;
          continue;
        }
        const curIndent = indentOf(cur.text);
        if (curIndent <= indent) break;
        if (curTrim === 'else:' && curIndent === indent) {
          inElse = true;
          idx += 1;
          continue;
        }
        if (inElse) {
          orelse.push(...parseSimple(curTrim, cur.line));
        } else {
          body.push(...parseSimple(curTrim, cur.line));
        }
        idx += 1;
      }
      statements.push({ kind: 'if', test, body, orelse });
      continue;
    }

    statements.push(...parseSimple(trimmed, line));
    idx += 1;
  }

  return statements;
}

function indentOf(text: string): number {
  const m = text.match(/^[ \t]*/);
  return m ? m[0].length : 0;
}

/** Remove the common leading indent from a block of lines (factory body). */
function dedentLines(lines: string[]): string {
  const nonEmpty = lines.filter((l) => l.trim());
  if (nonEmpty.length === 0) return '';
  let min = Infinity;
  for (const l of nonEmpty) {
    min = Math.min(min, indentOf(l));
  }
  return lines.map((l) => (l.length >= min ? l.slice(min) : l.trimStart())).join('\n');
}

function parseSimple(trimmed: string, line: number): Statement[] {
  void line;

  if (trimmed === 'return' || trimmed === 'return None') {
    return [{ kind: 'return', expr: { kind: 'name', id: 'None' } }];
  }

  // session['user'] = 'ali'
  const sessAssign = trimmed.match(
    /^session\s*\[\s*(['"])(.*?)\1\s*\]\s*=\s*(.+)$/,
  );
  if (sessAssign) {
    return [
      {
        kind: 'assign_session',
        key: sessAssign[2],
        value: parseExpr(sessAssign[3]),
      },
    ];
  }

  // app.config['KEY'] = 'value' inside a factory / view
  const cfgAssign = trimmed.match(
    /^app\.config\s*\[\s*(['"])(.*?)\1\s*\]\s*=\s*(.+)$/,
  );
  if (cfgAssign) {
    return [
      {
        kind: 'assign_config',
        key: cfgAssign[2],
        value: parseExpr(cfgAssign[3]),
      },
    ];
  }

  const retTuple = trimmed.match(/^return\s+(.+),\s*(\d{3})$/);
  if (retTuple) {
    return [{ kind: 'return_tuple', body: parseExpr(retTuple[1]), status: Number(retTuple[2]) }];
  }

  if (trimmed.startsWith('return ')) {
    return [{ kind: 'return', expr: parseExpr(trimmed.slice(7).trim()) }];
  }

  const abortMatch = trimmed.match(/^abort\s*\(\s*(\d{3})\s*(?:,\s*(.+))?\s*\)$/);
  if (abortMatch) {
    const desc = abortMatch[2]?.trim().replace(/^['"]|['"]$/g, '');
    return [{ kind: 'abort', status: Number(abortMatch[1]), description: desc }];
  }

  return [{ kind: 'expr', text: trimmed }];
}

/**
 * Parse a limited expression surface used in view return values.
 *
 * Args:
 *   text: Expression source.
 *
 * Returns:
 *   Expr AST node. Unrecognized forms become `{ kind: 'raw' }`.
 */
export function parseExpr(text: string): Expr {
  const t = text.trim();

  const str = t.match(/^(['"])(.*)\1$/s);
  if (str) {
    return { kind: 'str', value: str[2] };
  }

  const fstr = t.match(/^f(['"])(.*)\1$/s);
  if (fstr) {
    return { kind: 'fstr', template: fstr[2] };
  }

  const jsonMatch = t.match(/^jsonify\s*\(\s*\{(.*)\}\s*\)$/s);
  if (jsonMatch) {
    return { kind: 'jsonify', fields: parseDictBody(jsonMatch[1]) };
  }

  const renderMatch = t.match(/^render_template\s*\(\s*(['"])(.*?)\1\s*(?:,\s*(.*))?\s*\)$/s);
  if (renderMatch) {
    const ctx = renderMatch[3] ? parseKwargs(renderMatch[3]) : {};
    return { kind: 'render_template', template: renderMatch[2], context: ctx };
  }

  const redirectMatch = t.match(/^redirect\s*\((.+)\)$/s);
  if (redirectMatch) {
    const arg = redirectMatch[1].trim();
    const urlFor = arg.match(/^url_for\s*\(\s*(['"])(.*?)\1\s*(?:,\s*(.*))?\s*\)$/);
    if (urlFor) {
      const kwargs = urlFor[3] ? parseKwargs(urlFor[3]) : undefined;
      return { kind: 'redirect', location: { url_for: urlFor[2], kwargs } };
    }
    const s = arg.match(/^(['"])(.*)\1$/s);
    if (s) return { kind: 'redirect', location: s[2] };
    return { kind: 'redirect', location: arg };
  }

  const makeResponse = t.match(/^make_response\s*\((.+)\)$/s);
  if (makeResponse) {
    return { kind: 'make_response', body: parseExpr(makeResponse[1]) };
  }

  return { kind: 'raw', text: t };
}

function parseDictBody(inner: string): Record<string, string> {
  const fields: Record<string, string> = {};
  // Split on commas not inside quotes — simple approach for subset
  const parts = splitTopLevel(inner, ',');
  for (const part of parts) {
    const m = part.trim().match(/^(['"])(.*?)\1\s*:\s*(.+)$/s);
    if (m) {
      fields[m[2]] = m[3].trim();
    }
  }
  return fields;
}

function parseKwargs(inner: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const parts = splitTopLevel(inner, ',');
  for (const part of parts) {
    const m = part.trim().match(/^(\w+)\s*=\s*(.+)$/s);
    if (m) {
      fields[m[1]] = m[2].trim();
    }
  }
  return fields;
}

function splitTopLevel(text: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = '';
  let quote: string | null = null;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      current += ch;
      if (ch === quote && text[i - 1] !== '\\') quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') depth += 1;
    if (ch === ')' || ch === ']' || ch === '}') depth -= 1;
    if (ch === sep && depth === 0) {
      out.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) out.push(current);
  return out;
}
