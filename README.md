# LearnFlask

Interactive Flask visualization and tutorial — a sandbox, a live request pipeline, and leveled challenges.

Inspired by [LearnGitBranching](https://github.com/pcottle/learnGitBranching): type real-looking code, watch the app graph update, send simulated HTTP requests, and climb through levels.

**Stack:** 100% client-side (Vite + React + TypeScript). No backend. Hostable on GitHub Pages.

## Quick start

```bash
npm install
npm run dev       # http://localhost:5173
npm test          # vitest
npm run build     # static site in ./dist
```

## How to play

1. **Edit `app.py`** in the editor — it re-parses live into an application graph.
2. **Simulate requests** in the terminal:

   ```text
   GET /
   GET /user/ali
   POST /items
   GET /ping header X-Api-Key:secret
   request GET /admin?token=letmein
   ```

3. Watch the **request pipeline** (WSGI → `before_request` → routing → view → `after_request` → response).
4. Open **Levels** and satisfy each goal. `check` verifies routes and example requests.

## Curriculum

Six series, 20 levels. Progress is checked with real route tables and simulated HTTP requests (including multi-step session flows).

| Series | Levels | You learn |
|--------|--------|-----------|
| **Foundations** | 4 | `@app.route`, methods, path params, f-string views |
| **Request Lifecycle** | 4 | `before_request`, `after_request`, `errorhandler`, `abort` |
| **Blueprints** | 3 | `Blueprint`, `url_prefix`, `jsonify`, modular apps |
| **Request Data** | 3 | `request.form`, `request.json`, `request.args` |
| **Sessions & Auth** | 3 | `session`, login/logout, protecting routes |
| **App Structure** | 3 | `app.config`, `create_app()` factory + blueprint |

### Terminal commands

| Command | Meaning |
|--------|---------|
| `help` | command list |
| `levels` / `level <id>` | browse / start a level |
| `check` | verify level assertions |
| `solution` | load official solution into the editor |
| `reset` / `undo` | restore starter / previous edit (reset also clears session) |
| `routes` / `hooks` / `parse` | inspect model |
| `session` / `config` | session store / `app.config` keys |
| `progress` / `golf` | solved set / command count |
| `GET /path` | simulate HTTP |
| `request POST /login form user=ali form pass=secret` | form body |
| `request POST /api body {"name":"ali"}` | JSON body |

## Supported Flask subset

This is a **teaching simulator**, not a Python runtime. The parser accepts a deliberate subset:

```python
from flask import Flask, Blueprint, jsonify, request, session, abort, redirect, url_for, render_template

app = Flask(__name__)
app.config["SECRET_KEY"] = "dev"

@app.route("/")
def index():
    return "Hello, Flask!"

@app.route("/user/<name>")
def user(name):
    return f"Hello, {name}!"

@app.route("/items", methods=["GET", "POST"])
def items():
    if request.method == "POST":
        return "created", 201
    return "list items"

@app.route("/login", methods=["POST"])
def login():
    if request.form.get("user") == "ali" and request.form.get("pass") == "secret":
        session["user"] = "ali"
        return "logged in"
    return "bad credentials", 401

@app.route("/api/echo", methods=["POST"])
def echo():
    return jsonify({"echo": request.json.get("name")})

@app.before_request
def require_api_key():
    if not request.headers.get("X-Api-Key"):
        return "missing api key", 401
    return None

@app.after_request
def tag(response):
    return response.body + " [done]", 200

@app.errorhandler(404)
def not_found(e):
    return "nothing here", 404

api = Blueprint("api", __name__, url_prefix="/api")

@api.route("/ping")
def ping():
    return "api pong"

app.register_blueprint(api)

def create_app():
    app = Flask(__name__)
    @app.route("/")
    def index():
        return "factory ok"
    return app
```

### In scope

- `Flask(__name__)`, `Blueprint(..., url_prefix=...)`, `register_blueprint`
- `@app.route` / `@bp.route` with `methods=[...]` and `<param>` / `<int:param>` rules
- View bodies: `return` string / f-string / `jsonify({...})` / `render_template` / `redirect` / `return body, status` / `abort(code)`
- Flat `if` / `and` / `or` on `request.method`, `request.headers/form/args/json.get(...)`, `session.get(...)`
- `session['key'] = value`, `app.config['KEY'] = value`
- `@app.before_request`, `@app.after_request`, `@app.errorhandler(code)`
- `after_request` may rewrite via `response.body + "..."` (visible teaching model)
- `def create_app():` application factory (nested routes re-parsed)

### Out of scope (by design)

- Full Python (imports graph, classes, comprehensions, multi-level control flow)
- Real WSGI / Werkzeug execution, cookie signing, Flask-SQLAlchemy, Jinja template engine
- Real template inheritance, streaming, async views, Flask extensions

Unknown syntax becomes a parse diagnostic; the simulator never executes arbitrary code.

## Architecture

```text
src/
  model/types.ts        domain types (FlaskApp, routes, hooks, traces)
  parser/flaskParser.ts Flask-subset → app graph
  sim/requestPipeline.ts URL match + lifecycle simulation
  model/levels.ts       victory checks (routes + request assertions)
  levels/catalog.ts     six series: foundations, lifecycle, blueprints, requests, sessions, factory
  commands/index.ts     terminal command layer
  ui/                   App graph, pipeline, editor, terminal, dialogs
  App.tsx               shell state (source ↔ parse ↔ check ↔ localStorage)
tests/                  vitest — parser, pipeline, every level's solution
```

Design notes:

- **No eval.** The parser builds a tiny statement/expr AST; the simulator interprets that AST only.
- **Levels are data.** `solutionCode` is asserted in CI (`tests/levels.test.ts`) so shipped solutions stay honest.
- **State is local.** Source, solved set, and last level persist in `localStorage`.

## Deploy to GitHub Pages

```bash
npm run build
# publish ./dist (or use the included workflow)
```

Push the repo and enable Pages on the `github-pages` branch / Actions artifact produced by `.github/workflows/pages.yml`. Vite `base` is `./` so the app works from a project subpath.

## Development

```bash
npm run typecheck
npm test
npm run build
```

When adding a level: put `starterCode`, `solutionCode`, `expectRoutes` and/or `expectRequests` in `src/levels/catalog.ts`. The test suite will fail if the solution does not pass its own checks.

## License

MIT — see [LICENSE.md](LICENSE.md).
