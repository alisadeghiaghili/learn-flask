/**
 * Level definitions and victory checking for LearnFlask.
 */

import type { FlaskApp, SimRequest } from './types';
import { emptyApp } from './types';
import { simulateRequest } from '../sim/requestPipeline';

export interface ExpectedRoute {
  rule: string;
  methods: string[];
  endpoint?: string;
  blueprint?: string | null;
}

export interface ExpectedRequest {
  request: SimRequest;
  status: number;
  /** Substring expected in the response body (optional). */
  bodyIncludes?: string;
  /** Exact body match (optional). */
  bodyEquals?: string;
  /** Expected endpoint name (optional). */
  endpoint?: string;
  /** Clear session before this request (for auth/login sequences). */
  clearSession?: boolean;
}

export interface LevelSpec {
  id: string;
  seriesId: string;
  title: string;
  /** Short goal shown in the toolbar. */
  goal: string;
  /** Markdown-ish instruction shown in the dialog. */
  instructions: string;
  /** Starter code the learner edits. */
  starterCode: string;
  /** Optional solution for `solution` command. */
  solutionCode?: string;
  /** If set, route table must match. */
  expectRoutes?: ExpectedRoute[];
  /** If set, these requests must satisfy expectations. */
  expectRequests?: ExpectedRequest[];
  /** Command golf target (optional). */
  parCommands?: number;
}

export interface SeriesSpec {
  id: string;
  title: string;
  blurb: string;
  levels: LevelSpec[];
}

export interface LevelCheckResult {
  ok: boolean;
  failures: string[];
}

/**
 * Check whether the current app satisfies a level's victory conditions.
 *
 * Args:
 *   app: Parsed application under test.
 *   level: Level specification with route and/or request expectations.
 *
 * Returns:
 *   LevelCheckResult with ok flag and human-readable failures.
 */
export function checkLevel(app: FlaskApp, level: LevelSpec): LevelCheckResult {
  const failures: string[] = [];

  for (const d of app.diagnostics) {
    if (d.severity === 'error') {
      failures.push(`Parse error (line ${d.line}): ${d.message}`);
    }
  }

  if (level.expectRoutes) {
    failures.push(...checkRoutes(app, level.expectRoutes));
  }

  if (level.expectRequests) {
    failures.push(...checkRequests(app, level.expectRequests));
  }

  return { ok: failures.length === 0, failures };
}

function checkRoutes(app: FlaskApp, expected: ExpectedRoute[]): string[] {
  const failures: string[] = [];
  const actual = app.routes.map((r) => ({
    rule: r.rule,
    methods: [...r.methods].sort().join(','),
    endpoint: r.endpoint,
    blueprint: r.blueprint,
  }));

  for (const exp of expected) {
    const methods = [...exp.methods].sort().join(',');
    const found = actual.find(
      (a) =>
        a.rule === exp.rule &&
        a.methods === methods &&
        (exp.endpoint === undefined || a.endpoint === exp.endpoint) &&
        (exp.blueprint === undefined || a.blueprint === exp.blueprint),
    );
    if (!found) {
      failures.push(
        `Missing route: ${[...exp.methods].join('/')} ${exp.rule}` +
          (exp.blueprint ? ` (blueprint: ${exp.blueprint})` : ''),
      );
    }
  }

  // No extra routes beyond expected (strict when expectRoutes is provided)
  for (const a of actual) {
    const ok = expected.some(
      (exp) =>
        a.rule === exp.rule &&
        a.methods === [...exp.methods].sort().join(',') &&
        (exp.endpoint === undefined || a.endpoint === exp.endpoint) &&
        (exp.blueprint === undefined || a.blueprint === exp.blueprint),
    );
    if (!ok) {
      failures.push(`Unexpected route: ${a.methods.split(',').join('/')} ${a.rule}`);
    }
  }

  return failures;
}

function checkRequests(app: FlaskApp, expected: ExpectedRequest[]): string[] {
  const failures: string[] = [];
  const session: Record<string, string> = {};
  for (const exp of expected) {
    if (exp.clearSession) {
      for (const k of Object.keys(session)) delete session[k];
    }
    const trace = simulateRequest(app, exp.request, session);
    const res = trace.response;
    const label = `${exp.request.method} ${exp.request.path}`;

    if (res.status !== exp.status) {
      failures.push(
        `${label}: expected status ${exp.status}, got ${res.status} (body: ${res.body.slice(0, 60)})`,
      );
      continue;
    }
    if (exp.bodyEquals !== undefined && res.body !== exp.bodyEquals) {
      failures.push(`${label}: body mismatch. Got: ${res.body.slice(0, 80)}`);
    }
    if (exp.bodyIncludes !== undefined && !res.body.includes(exp.bodyIncludes)) {
      failures.push(
        `${label}: body should include "${exp.bodyIncludes}", got: ${res.body.slice(0, 80)}`,
      );
    }
    if (exp.endpoint !== undefined && res.endpoint !== exp.endpoint) {
      failures.push(`${label}: expected endpoint "${exp.endpoint}", got "${res.endpoint}"`);
    }
  }
  return failures;
}

/**
 * Build a blank app with just `app = Flask(__name__)` for sandbox reset.
 *
 * Returns:
 *   Starter sandbox source code.
 */
export function sandboxStarter(): string {
  return [
    'from flask import Flask, request, jsonify, abort, redirect, url_for, render_template',
    '',
    'app = Flask(__name__)',
    '',
    '@app.route("/")',
    'def index():',
    '    return "Hello, Flask!"',
    '',
  ].join('\n');
}

/** Re-export emptyApp for convenience. */
export { emptyApp };
