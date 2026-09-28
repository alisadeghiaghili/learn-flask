/**
 * Built-in level series for LearnFlask.
 *
 * Three tracks mirror the core Flask mental model:
 *   foundations — routes and views
 *   lifecycle   — request hooks and errors
 *   blueprints  — modular apps
 */

import type { LevelSpec, SeriesSpec } from '../model/levels';

const foundations: SeriesSpec = {
  id: 'foundations',
  title: 'Foundations',
  blurb: 'Routes, views, and the shape of a Flask app.',
  levels: [
    {
      id: 'hello-route',
      seriesId: 'foundations',
      title: 'Hello, Route',
      goal: 'GET / returns 200 with body "Hello, Flask!"',
      instructions:
        'Create a Flask app and register a single GET route at `/`.\n' +
        'The view must return the exact string `Hello, Flask!`.\n\n' +
        'Tip: type `request GET /` in the terminal to simulate a request.',
      starterCode: [
        'from flask import Flask',
        '',
        'app = Flask(__name__)',
        '',
        '# Add your route below',
        '',
      ].join('\n'),
      solutionCode: [
        'from flask import Flask',
        '',
        'app = Flask(__name__)',
        '',
        '@app.route("/")',
        'def index():',
        '    return "Hello, Flask!"',
        '',
      ].join('\n'),
      expectRoutes: [{ rule: '/', methods: ['GET'], endpoint: 'index' }],
      expectRequests: [
        {
          request: { method: 'GET', path: '/' },
          status: 200,
          bodyEquals: 'Hello, Flask!',
        },
      ],
    },
    {
      id: 'two-routes',
      seriesId: 'foundations',
      title: 'Two Routes',
      goal: 'GET / and GET /about',
      instructions:
        'Add two routes:\n' +
        '- `GET /` → body `Home`\n' +
        '- `GET /about` → body `About`\n\n' +
        'Each route needs its own view function.',
      starterCode: [
        'from flask import Flask',
        '',
        'app = Flask(__name__)',
        '',
        '@app.route("/")',
        'def index():',
        '    return "Home"',
        '',
        '# Add /about here',
        '',
      ].join('\n'),
      solutionCode: [
        'from flask import Flask',
        '',
        'app = Flask(__name__)',
        '',
        '@app.route("/")',
        'def index():',
        '    return "Home"',
        '',
        '@app.route("/about")',
        'def about():',
        '    return "About"',
        '',
      ].join('\n'),
      expectRoutes: [
        { rule: '/', methods: ['GET'] },
        { rule: '/about', methods: ['GET'] },
      ],
      expectRequests: [
        { request: { method: 'GET', path: '/' }, status: 200, bodyEquals: 'Home' },
        { request: { method: 'GET', path: '/about' }, status: 200, bodyEquals: 'About' },
      ],
    },
    {
      id: 'url-params',
      seriesId: 'foundations',
      title: 'URL Parameters',
      goal: 'GET /user/<name> greets by name',
      instructions:
        'Register `GET /user/<name>`.\n' +
        'Return `Hello, {name}!` using an f-string so the path parameter appears in the body.\n\n' +
        'Try: `request GET /user/ali` → `Hello, ali!`',
      starterCode: [
        'from flask import Flask, request',
        '',
        'app = Flask(__name__)',
        '',
        '# Add /user/<name> here',
        '',
      ].join('\n'),
      solutionCode: [
        'from flask import Flask, request',
        '',
        'app = Flask(__name__)',
        '',
        '@app.route("/user/<name>")',
        'def user(name):',
        '    return f"Hello, {name}!"',
        '',
      ].join('\n'),
      expectRoutes: [{ rule: '/user/<name>', methods: ['GET'], endpoint: 'user' }],
      expectRequests: [
        {
          request: { method: 'GET', path: '/user/ali' },
          status: 200,
          bodyEquals: 'Hello, ali!',
        },
        {
          request: { method: 'GET', path: '/user/flask' },
          status: 200,
          bodyEquals: 'Hello, flask!',
        },
      ],
    },
    {
      id: 'methods',
      seriesId: 'foundations',
      title: 'HTTP Methods',
      goal: 'GET and POST on /items',
      instructions:
        'One route `/items` that accepts **GET** and **POST**.\n' +
        '- GET → body `list items`\n' +
        '- POST → body `created` with status 201\n\n' +
        'Use `methods=["GET", "POST"]` and branch on `request.method`.',
      starterCode: [
        'from flask import Flask, request',
        '',
        'app = Flask(__name__)',
        '',
        '# Add GET+POST /items here',
        '',
      ].join('\n'),
      solutionCode: [
        'from flask import Flask, request',
        '',
        'app = Flask(__name__)',
        '',
        '@app.route("/items", methods=["GET", "POST"])',
        'def items():',
        '    if request.method == "POST":',
        '        return "created", 201',
        '    return "list items"',
        '',
      ].join('\n'),
      expectRoutes: [{ rule: '/items', methods: ['GET', 'POST'], endpoint: 'items' }],
      expectRequests: [
        {
          request: { method: 'GET', path: '/items' },
          status: 200,
          bodyEquals: 'list items',
        },
        {
          request: { method: 'POST', path: '/items' },
          status: 201,
          bodyEquals: 'created',
        },
      ],
    },
  ],
};

const lifecycle: SeriesSpec = {
  id: 'lifecycle',
  title: 'Request Lifecycle',
  blurb: 'Hooks, short-circuits, and error handlers.',
  levels: [
    {
      id: 'before-request',
      seriesId: 'lifecycle',
      title: 'before_request',
      goal: 'Require X-Api-Key header or 401',
      instructions:
        'Add `@app.before_request`.\n' +
        'If the request has no `X-Api-Key` header, return body `missing api key` with status 401.\n' +
        'Otherwise the request continues to the view.\n\n' +
        'The route `/ping` is provided. Simulate:\n' +
        '`request GET /ping` → 401\n' +
        '`request GET /ping header X-Api-Key:secret` → 200 `pong`',
      starterCode: [
        'from flask import Flask, request',
        '',
        'app = Flask(__name__)',
        '',
        '@app.route("/ping")',
        'def ping():',
        '    return "pong"',
        '',
        '# Add before_request here',
        '',
      ].join('\n'),
      solutionCode: [
        'from flask import Flask, request',
        '',
        'app = Flask(__name__)',
        '',
        '@app.route("/ping")',
        'def ping():',
        '    return "pong"',
        '',
        '@app.before_request',
        'def require_api_key():',
        '    if not request.headers.get("X-Api-Key"):',
        '        return "missing api key", 401',
        '    return None',
        '',
      ].join('\n'),
      expectRoutes: [{ rule: '/ping', methods: ['GET'], endpoint: 'ping' }],
      expectRequests: [
        {
          request: { method: 'GET', path: '/ping' },
          status: 401,
          bodyEquals: 'missing api key',
        },
        {
          request: {
            method: 'GET',
            path: '/ping',
            headers: { 'X-Api-Key': 'secret' },
          },
          status: 200,
          bodyEquals: 'pong',
        },
      ],
    },
    {
      id: 'error-404',
      seriesId: 'lifecycle',
      title: 'Custom 404',
      goal: 'errorhandler(404) returns "nothing here"',
      instructions:
        'Register `@app.errorhandler(404)`.\n' +
        'Unknown paths must return status 404 with body `nothing here`.\n\n' +
        'Try `request GET /nope` after you implement it.',
      starterCode: [
        'from flask import Flask, request',
        '',
        'app = Flask(__name__)',
        '',
        '@app.route("/")',
        'def index():',
        '    return "Home"',
        '',
        '# Add errorhandler(404) here',
        '',
      ].join('\n'),
      solutionCode: [
        'from flask import Flask, request',
        '',
        'app = Flask(__name__)',
        '',
        '@app.route("/")',
        'def index():',
        '    return "Home"',
        '',
        '@app.errorhandler(404)',
        'def not_found(e):',
        '    return "nothing here", 404',
        '',
      ].join('\n'),
      expectRoutes: [{ rule: '/', methods: ['GET'] }],
      expectRequests: [
        { request: { method: 'GET', path: '/' }, status: 200, bodyEquals: 'Home' },
        {
          request: { method: 'GET', path: '/nope' },
          status: 404,
          bodyEquals: 'nothing here',
        },
      ],
    },
    {
      id: 'after-request',
      seriesId: 'lifecycle',
      title: 'after_request',
      goal: 'Tag every response body with [done]',
      instructions:
        'Add `@app.after_request` that **returns a response** whose body is the original body plus the suffix ` [done]`.\n\n' +
        'In this simulator, write:\n' +
        '```\n' +
        '@app.after_request\n' +
        'def tag(response):\n' +
        '    return response.body + " [done]", 200\n' +
        '```\n' +
        'A cleaner real-Flask version mutates `response`; here we model the visible result.',
      starterCode: [
        'from flask import Flask, request',
        '',
        'app = Flask(__name__)',
        '',
        '@app.route("/")',
        'def index():',
        '    return "Hello"',
        '',
        '# Add after_request here',
        '',
      ].join('\n'),
      solutionCode: [
        'from flask import Flask, request',
        '',
        'app = Flask(__name__)',
        '',
        '@app.route("/")',
        'def index():',
        '    return "Hello"',
        '',
        '@app.after_request',
        'def tag(response):',
        '    return response.body + " [done]", 200',
        '',
      ].join('\n'),
      expectRequests: [
        {
          request: { method: 'GET', path: '/' },
          status: 200,
          bodyEquals: 'Hello [done]',
        },
      ],
    },
    {
      id: 'abort-401',
      seriesId: 'lifecycle',
      title: 'abort()',
      goal: 'Protect /admin with abort(401)',
      instructions:
        'Add `GET /admin`.\n' +
        'If `request.args.get("token")` is not `letmein`, call `abort(401)`.\n' +
        'Otherwise return body `admin ok`.\n\n' +
        'Try:\n' +
        '`request GET /admin` → 401\n' +
        '`request GET /admin?token=letmein` → 200 `admin ok`',
      starterCode: [
        'from flask import Flask, request, abort',
        '',
        'app = Flask(__name__)',
        '',
        '# Add /admin here',
        '',
      ].join('\n'),
      solutionCode: [
        'from flask import Flask, request, abort',
        '',
        'app = Flask(__name__)',
        '',
        '@app.route("/admin")',
        'def admin():',
        '    if request.args.get("token") != "letmein":',
        '        abort(401)',
        '    return "admin ok"',
        '',
      ].join('\n'),
      expectRoutes: [{ rule: '/admin', methods: ['GET'] }],
      expectRequests: [
        {
          request: { method: 'GET', path: '/admin' },
          status: 401,
        },
        {
          request: { method: 'GET', path: '/admin', query: 'token=letmein' },
          status: 200,
          bodyEquals: 'admin ok',
        },
      ],
    },
  ],
};

const blueprints: SeriesSpec = {
  id: 'blueprints',
  title: 'Blueprints',
  blurb: 'Split an app into reusable modules.',
  levels: [
    {
      id: 'first-blueprint',
      seriesId: 'blueprints',
      title: 'First Blueprint',
      goal: 'Blueprint `api` with GET /api/ping',
      instructions:
        'Create a `Blueprint("api", __name__, url_prefix="/api")`.\n' +
        'Register `GET /ping` on the blueprint (full path becomes `/api/ping`).\n' +
        'Register the blueprint on the app.\n' +
        'Return body `api pong`.',
      starterCode: [
        'from flask import Flask, Blueprint',
        '',
        'app = Flask(__name__)',
        '',
        '# Create blueprint, route, and register here',
        '',
      ].join('\n'),
      solutionCode: [
        'from flask import Flask, Blueprint',
        '',
        'app = Flask(__name__)',
        '',
        'api = Blueprint("api", __name__, url_prefix="/api")',
        '',
        '@api.route("/ping")',
        'def ping():',
        '    return "api pong"',
        '',
        'app.register_blueprint(api)',
        '',
      ].join('\n'),
      expectRoutes: [
        {
          rule: '/api/ping',
          methods: ['GET'],
          endpoint: 'ping',
          blueprint: 'api',
        },
      ],
      expectRequests: [
        {
          request: { method: 'GET', path: '/api/ping' },
          status: 200,
          bodyEquals: 'api pong',
          endpoint: 'ping',
        },
      ],
    },
    {
      id: 'mixed-app',
      seriesId: 'blueprints',
      title: 'App + Blueprint',
      goal: 'Keep / on the app, put /api/v1/items on a blueprint',
      instructions:
        '- App route `GET /` → `root`\n' +
        '- Blueprint `v1` with `url_prefix="/api/v1"` and route `/items` → `items list`\n' +
        '  (full path `/api/v1/items`)\n' +
        '- Register the blueprint.',
      starterCode: [
        'from flask import Flask, Blueprint',
        '',
        'app = Flask(__name__)',
        '',
        '@app.route("/")',
        'def index():',
        '    return "root"',
        '',
        '# Add blueprint v1 here',
        '',
      ].join('\n'),
      solutionCode: [
        'from flask import Flask, Blueprint',
        '',
        'app = Flask(__name__)',
        '',
        '@app.route("/")',
        'def index():',
        '    return "root"',
        '',
        'v1 = Blueprint("v1", __name__, url_prefix="/api/v1")',
        '',
        '@v1.route("/items")',
        'def items():',
        '    return "items list"',
        '',
        'app.register_blueprint(v1)',
        '',
      ].join('\n'),
      expectRoutes: [
        { rule: '/', methods: ['GET'], endpoint: 'index', blueprint: null },
        {
          rule: '/api/v1/items',
          methods: ['GET'],
          endpoint: 'items',
          blueprint: 'v1',
        },
      ],
      expectRequests: [
        { request: { method: 'GET', path: '/' }, status: 200, bodyEquals: 'root' },
        {
          request: { method: 'GET', path: '/api/v1/items' },
          status: 200,
          bodyEquals: 'items list',
        },
      ],
    },
    {
      id: 'jsonify',
      seriesId: 'blueprints',
      title: 'JSON APIs',
      goal: 'GET /api/me returns JSON',
      instructions:
        'On a blueprint (or the app), register `GET /api/me`.\n' +
        'Return `jsonify({"name": "ali", "role": "admin"})`.\n\n' +
        'The response body must be JSON with those two keys.',
      starterCode: [
        'from flask import Flask, jsonify',
        '',
        'app = Flask(__name__)',
        '',
        '# Add GET /api/me returning jsonify(...)',
        '',
      ].join('\n'),
      solutionCode: [
        'from flask import Flask, jsonify',
        '',
        'app = Flask(__name__)',
        '',
        '@app.route("/api/me")',
        'def me():',
        '    return jsonify({"name": "ali", "role": "admin"})',
        '',
      ].join('\n'),
      expectRoutes: [{ rule: '/api/me', methods: ['GET'] }],
      expectRequests: [
        {
          request: { method: 'GET', path: '/api/me' },
          status: 200,
          bodyIncludes: '"name":"ali"',
        },
        {
          request: { method: 'GET', path: '/api/me' },
          status: 200,
          bodyIncludes: '"role":"admin"',
        },
      ],
    },
  ],
};

const requests: SeriesSpec = {
  id: 'requests',
  title: 'Request Data',
  blurb: 'Form fields, JSON bodies, and query parameters.',
  levels: [
    {
      id: 'form-login',
      seriesId: 'requests',
      title: 'Form Input',
      goal: 'POST /login reads form fields',
      instructions:
        'Register `POST /login`.\n' +
        'Read `request.form.get("user")` and `request.form.get("pass")`.\n' +
        '- If both match `ali` / `secret`, return body `welcome ali`.\n' +
        '- Otherwise return body `invalid` with status 401.\n\n' +
        'Terminal:\n' +
        '`request POST /login form user=ali form pass=secret`\n' +
        '`request POST /login form user=ali form pass=nope`',
      starterCode: [
        'from flask import Flask, request',
        '',
        'app = Flask(__name__)',
        '',
        '# Add POST /login here',
        '',
      ].join('\n'),
      solutionCode: [
        'from flask import Flask, request',
        '',
        'app = Flask(__name__)',
        '',
        '@app.route("/login", methods=["POST"])',
        'def login():',
        '    if request.form.get("user") == "ali" and request.form.get("pass") == "secret":',
        '        return "welcome ali"',
        '    return "invalid", 401',
        '',
      ].join('\n'),
      expectRoutes: [{ rule: '/login', methods: ['POST'], endpoint: 'login' }],
      expectRequests: [
        {
          request: {
            method: 'POST',
            path: '/login',
            form: { user: 'ali', pass: 'secret' },
            body: 'user=ali&pass=secret',
          },
          status: 200,
          bodyEquals: 'welcome ali',
        },
        {
          request: {
            method: 'POST',
            path: '/login',
            form: { user: 'ali', pass: 'nope' },
            body: 'user=ali&pass=nope',
          },
          status: 401,
          bodyEquals: 'invalid',
        },
      ],
    },
    {
      id: 'json-api',
      seriesId: 'requests',
      title: 'JSON Body',
      goal: 'POST /api/echo returns the JSON name field',
      instructions:
        'Register `POST /api/echo`.\n' +
        'Return `jsonify({"echo": <name from request.json>})`.\n' +
        'Use `request.json.get("name")`.\n\n' +
        'Terminal:\n' +
        '`request POST /api/echo body {"name":"ali"}`\n' +
        '→ body contains `"echo":"ali"`',
      starterCode: [
        'from flask import Flask, request, jsonify',
        '',
        'app = Flask(__name__)',
        '',
        '# Add POST /api/echo here',
        '',
      ].join('\n'),
      solutionCode: [
        'from flask import Flask, request, jsonify',
        '',
        'app = Flask(__name__)',
        '',
        '@app.route("/api/echo", methods=["POST"])',
        'def echo():',
        '    return jsonify({"echo": request.json.get("name")})',
        '',
      ].join('\n'),
      expectRoutes: [{ rule: '/api/echo', methods: ['POST'], endpoint: 'echo' }],
      expectRequests: [
        {
          request: {
            method: 'POST',
            path: '/api/echo',
            body: '{"name":"ali"}',
            json: { name: 'ali' },
            headers: { 'Content-Type': 'application/json' },
          },
          status: 200,
          bodyIncludes: '"echo":"ali"',
        },
      ],
    },
    {
      id: 'query-filter',
      seriesId: 'requests',
      title: 'Query Strings',
      goal: 'GET /search?term=flask greets with the term',
      instructions:
        'Register `GET /search`.\n' +
        'Return an f-string: `results for {request.args.get("term")}`\n' +
        'When `term` is missing, return `results for ` (empty).\n\n' +
        '`GET /search?term=flask` → `results for flask`',
      starterCode: [
        'from flask import Flask, request',
        '',
        'app = Flask(__name__)',
        '',
        '# Add GET /search here',
        '',
      ].join('\n'),
      solutionCode: [
        'from flask import Flask, request',
        '',
        'app = Flask(__name__)',
        '',
        '@app.route("/search")',
        'def search():',
        '    return f"results for {request.args.get(\'term\')}"',
        '',
      ].join('\n'),
      expectRoutes: [{ rule: '/search', methods: ['GET'], endpoint: 'search' }],
      expectRequests: [
        {
          request: { method: 'GET', path: '/search', query: 'term=flask' },
          status: 200,
          bodyEquals: 'results for flask',
        },
      ],
    },
  ],
};

const sessions: SeriesSpec = {
  id: 'sessions',
  title: 'Sessions & Auth',
  blurb: 'Login, session state, and protecting routes.',
  levels: [
    {
      id: 'session-login',
      seriesId: 'sessions',
      title: 'Session Login',
      goal: 'Login writes session["user"], /me reads it',
      instructions:
        '1. `POST /login` with form `user`/`pass` (`ali`/`secret`):\n' +
        '   - success → `session["user"] = "ali"` and body `logged in`\n' +
        '   - failure → 401 `bad credentials`\n' +
        '2. `GET /me`:\n' +
        '   - if `session.get("user")` → body `hello {user}`\n' +
        '   - else → 401 `login required`\n\n' +
        'The simulator keeps one session across requests.\n' +
        'Command: `session` shows the store.',
      starterCode: [
        'from flask import Flask, request, session',
        '',
        'app = Flask(__name__)',
        'app.config["SECRET_KEY"] = "dev"',
        '',
        '# Add /login and /me here',
        '',
      ].join('\n'),
      solutionCode: [
        'from flask import Flask, request, session',
        '',
        'app = Flask(__name__)',
        'app.config["SECRET_KEY"] = "dev"',
        '',
        '@app.route("/login", methods=["POST"])',
        'def login():',
        '    if request.form.get("user") == "ali" and request.form.get("pass") == "secret":',
        '        session["user"] = "ali"',
        '        return "logged in"',
        '    return "bad credentials", 401',
        '',
        '@app.route("/me")',
        'def me():',
        '    if not session.get("user"):',
        '        return "login required", 401',
        '    return f"hello {session.get(\'user\')}"',
        '',
      ].join('\n'),
      expectRoutes: [
        { rule: '/login', methods: ['POST'] },
        { rule: '/me', methods: ['GET'] },
      ],
      expectRequests: [
        {
          request: { method: 'GET', path: '/me' },
          status: 401,
          bodyEquals: 'login required',
          clearSession: true,
        },
        {
          request: {
            method: 'POST',
            path: '/login',
            form: { user: 'ali', pass: 'secret' },
            body: 'user=ali&pass=secret',
          },
          status: 200,
          bodyEquals: 'logged in',
        },
        {
          request: { method: 'GET', path: '/me' },
          status: 200,
          bodyEquals: 'hello ali',
        },
      ],
    },
    {
      id: 'require-login',
      seriesId: 'sessions',
      title: 'Guard a Route',
      goal: 'GET /admin requires session["user"]',
      instructions:
        'Reuse login from the previous level.\n' +
        '`GET /admin` returns 401 `login required` unless session has a user.\n' +
        'When logged in → body `admin panel`.',
      starterCode: [
        'from flask import Flask, request, session',
        '',
        'app = Flask(__name__)',
        'app.config["SECRET_KEY"] = "dev"',
        '',
        '@app.route("/login", methods=["POST"])',
        'def login():',
        '    if request.form.get("user") == "ali" and request.form.get("pass") == "secret":',
        '        session["user"] = "ali"',
        '        return "logged in"',
        '    return "bad credentials", 401',
        '',
        '# Add GET /admin here',
        '',
      ].join('\n'),
      solutionCode: [
        'from flask import Flask, request, session',
        '',
        'app = Flask(__name__)',
        'app.config["SECRET_KEY"] = "dev"',
        '',
        '@app.route("/login", methods=["POST"])',
        'def login():',
        '    if request.form.get("user") == "ali" and request.form.get("pass") == "secret":',
        '        session["user"] = "ali"',
        '        return "logged in"',
        '    return "bad credentials", 401',
        '',
        '@app.route("/admin")',
        'def admin():',
        '    if not session.get("user"):',
        '        return "login required", 401',
        '    return "admin panel"',
        '',
      ].join('\n'),
      expectRequests: [
        {
          request: { method: 'GET', path: '/admin' },
          status: 401,
          bodyEquals: 'login required',
          clearSession: true,
        },
        {
          request: {
            method: 'POST',
            path: '/login',
            form: { user: 'ali', pass: 'secret' },
            body: 'user=ali&pass=secret',
          },
          status: 200,
        },
        {
          request: { method: 'GET', path: '/admin' },
          status: 200,
          bodyEquals: 'admin panel',
        },
      ],
    },
    {
      id: 'logout',
      seriesId: 'sessions',
      title: 'Logout',
      goal: 'POST /logout clears the session',
      instructions:
        'Add `POST /logout` that sets `session["user"] = ""` (or leaves it empty) and returns `bye`.\n' +
        'After logout, `GET /me` must 401 again.',
      starterCode: [
        'from flask import Flask, request, session',
        '',
        'app = Flask(__name__)',
        'app.config["SECRET_KEY"] = "dev"',
        '',
        '@app.route("/login", methods=["POST"])',
        'def login():',
        '    if request.form.get("user") == "ali" and request.form.get("pass") == "secret":',
        '        session["user"] = "ali"',
        '        return "logged in"',
        '    return "bad credentials", 401',
        '',
        '@app.route("/me")',
        'def me():',
        '    if not session.get("user"):',
        '        return "login required", 401',
        '    return f"hello {session.get(\'user\')}"',
        '',
        '# Add POST /logout here',
        '',
      ].join('\n'),
      solutionCode: [
        'from flask import Flask, request, session',
        '',
        'app = Flask(__name__)',
        'app.config["SECRET_KEY"] = "dev"',
        '',
        '@app.route("/login", methods=["POST"])',
        'def login():',
        '    if request.form.get("user") == "ali" and request.form.get("pass") == "secret":',
        '        session["user"] = "ali"',
        '        return "logged in"',
        '    return "bad credentials", 401',
        '',
        '@app.route("/me")',
        'def me():',
        '    if not session.get("user"):',
        '        return "login required", 401',
        '    return f"hello {session.get(\'user\')}"',
        '',
        '@app.route("/logout", methods=["POST"])',
        'def logout():',
        '    session["user"] = ""',
        '    return "bye"',
        '',
      ].join('\n'),
      expectRequests: [
        {
          request: {
            method: 'POST',
            path: '/login',
            form: { user: 'ali', pass: 'secret' },
            body: 'user=ali&pass=secret',
          },
          status: 200,
          clearSession: true,
        },
        {
          request: { method: 'POST', path: '/logout' },
          status: 200,
          bodyEquals: 'bye',
        },
        {
          request: { method: 'GET', path: '/me' },
          status: 401,
          bodyEquals: 'login required',
        },
      ],
    },
  ],
};

const factory: SeriesSpec = {
  id: 'factory',
  title: 'App Structure',
  blurb: 'Config, application factory, and testable layout.',
  levels: [
    {
      id: 'config-keys',
      seriesId: 'factory',
      title: 'Configuration',
      goal: 'Set SECRET_KEY and expose it on /whoami',
      instructions:
        'Set `app.config["SECRET_KEY"] = "dev-key"`.\n' +
        'Register `GET /whoami` that returns body `key: dev-key`.\n' +
        'Read the key from config if you want: `app.config.get("SECRET_KEY")` is not required — the checker only needs the visible body.\n' +
        'Command: `config` prints config keys.',
      starterCode: [
        'from flask import Flask',
        '',
        'app = Flask(__name__)',
        '',
        '# Set SECRET_KEY and add GET /whoami',
        '',
      ].join('\n'),
      solutionCode: [
        'from flask import Flask',
        '',
        'app = Flask(__name__)',
        'app.config["SECRET_KEY"] = "dev-key"',
        '',
        '@app.route("/whoami")',
        'def whoami():',
        '    return "key: dev-key"',
        '',
      ].join('\n'),
      expectRoutes: [{ rule: '/whoami', methods: ['GET'] }],
      expectRequests: [
        {
          request: { method: 'GET', path: '/whoami' },
          status: 200,
          bodyEquals: 'key: dev-key',
        },
      ],
    },
    {
      id: 'app-factory',
      seriesId: 'factory',
      title: 'Application Factory',
      goal: 'create_app() returns an app with GET /',
      instructions:
        'Write the factory pattern:\n' +
        '```\n' +
        'def create_app():\n' +
        '    app = Flask(__name__)\n' +
        '    @app.route("/")\n' +
        '    def index():\n' +
        '        return "factory ok"\n' +
        '    return app\n' +
        '```\n' +
        'The parser recognizes `create_app` and the routes defined inside it.\n' +
        'Real Flask apps use factories for tests and multiple configs.',
      starterCode: [
        'from flask import Flask',
        '',
        'def create_app():',
        '    app = Flask(__name__)',
        '    # register routes here',
        '    return app',
        '',
      ].join('\n'),
      solutionCode: [
        'from flask import Flask',
        '',
        'def create_app():',
        '    app = Flask(__name__)',
        '    @app.route("/")',
        '    def index():',
        '        return "factory ok"',
        '    return app',
        '',
      ].join('\n'),
      expectRoutes: [{ rule: '/', methods: ['GET'], endpoint: 'index' }],
      expectRequests: [
        {
          request: { method: 'GET', path: '/' },
          status: 200,
          bodyEquals: 'factory ok',
        },
      ],
    },
    {
      id: 'factory-blueprint',
      seriesId: 'factory',
      title: 'Factory + Blueprint',
      goal: 'create_app registers a blueprint with /api/ping',
      instructions:
        'Inside `create_app()`:\n' +
        '- create `Blueprint("api", __name__, url_prefix="/api")`\n' +
        '- add `GET /ping` on it returning `factory pong`\n' +
        '- `app.register_blueprint(api)`\n' +
        '- return the app\n\n' +
        'This is the layout Flask docs recommend for real projects.',
      starterCode: [
        'from flask import Flask, Blueprint',
        '',
        'def create_app():',
        '    app = Flask(__name__)',
        '    # blueprint + route + register',
        '    return app',
        '',
      ].join('\n'),
      solutionCode: [
        'from flask import Flask, Blueprint',
        '',
        'def create_app():',
        '    app = Flask(__name__)',
        '    api = Blueprint("api", __name__, url_prefix="/api")',
        '    @api.route("/ping")',
        '    def ping():',
        '        return "factory pong"',
        '    app.register_blueprint(api)',
        '    return app',
        '',
      ].join('\n'),
      expectRoutes: [
        {
          rule: '/api/ping',
          methods: ['GET'],
          endpoint: 'ping',
          blueprint: 'api',
        },
      ],
      expectRequests: [
        {
          request: { method: 'GET', path: '/api/ping' },
          status: 200,
          bodyEquals: 'factory pong',
        },
      ],
    },
  ],
};

/** All built-in series in curriculum order. */
export const SERIES: SeriesSpec[] = [foundations, lifecycle, blueprints, requests, sessions, factory];

/**
 * Look up a level by id.
 *
 * Args:
 *   id: Level identifier, e.g. `hello-route`.
 *
 * Returns:
 *   The level spec, or null when missing.
 */
export function findLevel(id: string): LevelSpec | null {
  for (const s of SERIES) {
    for (const l of s.levels) {
      if (l.id === id) return l;
    }
  }
  return null;
}

/** Flat list of all levels in order. */
export function allLevels(): LevelSpec[] {
  return SERIES.flatMap((s) => s.levels);
}
