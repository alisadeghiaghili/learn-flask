/**
 * Core domain types for the LearnFlask application model and request simulation.
 */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export type HookKind = 'before_request' | 'after_request' | 'before_request_funcs' | 'errorhandler';

export type Statement =
  | { kind: 'return'; expr: Expr }
  | { kind: 'return_tuple'; body: Expr; status: number }
  | { kind: 'abort'; status: number; description?: string }
  | { kind: 'if'; test: string; body: Statement[]; orelse: Statement[] }
  | { kind: 'assign_session'; key: string; value: Expr }
  | { kind: 'assign_config'; key: string; value: Expr }
  | { kind: 'expr'; text: string };

export type Expr =
  | { kind: 'str'; value: string }
  | { kind: 'fstr'; template: string }
  | { kind: 'jsonify'; fields: Record<string, string> }
  | { kind: 'render_template'; template: string; context: Record<string, string> }
  | { kind: 'redirect'; location: string | { url_for: string; kwargs?: Record<string, string> } }
  | { kind: 'make_response'; body: Expr; status?: number }
  | { kind: 'name'; id: string }
  | { kind: 'raw'; text: string };

export interface RouteRule {
  /** Werkzeug-style rule, e.g. `/user/<name>`. */
  rule: string;
  methods: HttpMethod[];
  /** View function name (endpoint by default). */
  endpoint: string;
  /** Blueprint name, or null for the app. */
  blueprint: string | null;
  /** Function body statements (subset). */
  body: Statement[];
  /** Line in source for editor highlighting. */
  line: number;
}

export interface HookDef {
  kind: HookKind;
  /** Registered on app or a blueprint. */
  owner: string | null;
  /** Function name. */
  name: string;
  /** For errorhandler: the HTTP status code. */
  code?: number;
  body: Statement[];
  line: number;
}

export interface BlueprintDef {
  name: string;
  importName: string;
  urlPrefix: string | null;
  line: number;
}

export interface TemplateFilterDef {
  name: string;
  owner: string | null;
  body: Statement[];
  line: number;
}

/** Parsed Flask application graph. */
export interface FlaskApp {
  /** App variable name, usually `app`. */
  appName: string | null;
  /** Name of `create_app()` when an application factory is present. */
  factoryName: string | null;
  /** app.config['KEY'] = 'value' assignments found in source. */
  config: Record<string, string>;
  blueprints: BlueprintDef[];
  routes: RouteRule[];
  hooks: HookDef[];
  templateFilters: TemplateFilterDef[];
  /** Parse diagnostics (warnings / errors). */
  diagnostics: ParseDiagnostic[];
}

export interface ParseDiagnostic {
  severity: 'error' | 'warning';
  message: string;
  line: number;
}

export interface SimRequest {
  method: HttpMethod;
  path: string;
  /** Raw query string without `?`. */
  query?: string;
  headers?: Record<string, string>;
  /** Raw body (form-urlencoded or JSON text). */
  body?: string;
  /** Parsed application/x-www-form-urlencoded fields. */
  form?: Record<string, string>;
  /** Parsed JSON body (object/array/scalar), when Content-Type is JSON. */
  json?: unknown;
}

/** Browser session store shared across simulated requests. */
export type SessionStore = Record<string, string>;

export interface SimResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
  /** True when a `before_request` hook short-circuited. */
  shortCircuited: boolean;
  /** Endpoint that handled the request, if any. */
  endpoint: string | null;
  blueprint: string | null;
}

export type PipelineStageId =
  | 'client'
  | 'wsgi'
  | 'before_request'
  | 'routing'
  | 'view'
  | 'after_request'
  | 'response'
  | 'error';

export interface PipelineEvent {
  stage: PipelineStageId;
  label: string;
  detail: string;
  status: 'idle' | 'active' | 'done' | 'error' | 'skipped';
}

export interface PipelineTrace {
  request: SimRequest;
  response: SimResponse;
  events: PipelineEvent[];
  /** Captured path args from URL matching. */
  viewArgs: Record<string, string>;
  /** Query params. */
  args: Record<string, string>;
}

export function emptyApp(): FlaskApp {
  return {
    appName: null,
    factoryName: null,
    config: {},
    blueprints: [],
    routes: [],
    hooks: [],
    templateFilters: [],
    diagnostics: [],
  };
}
