/**
 * Request pipeline simulator tests.
 */

import { describe, expect, it } from 'vitest';
import { parseFlaskSource } from '../src/parser/flaskParser';
import {
  compileRule,
  matchRoute,
  simulateRequest,
  statusText,
} from '../src/sim/requestPipeline';

describe('compileRule', () => {
  it('matches literal and param rules', () => {
    const [re, names] = compileRule('/user/<name>');
    expect(names).toEqual(['name']);
    expect('/user/ali'.match(re)?.[1]).toBe('ali');
    expect('/users/ali'.match(re)).toBeNull();
  });
});

describe('simulateRequest', () => {
  it('returns view body for GET /', () => {
    const app = parseFlaskSource(`
app = Flask(__name__)

@app.route("/")
def index():
    return "Hello, Flask!"
`);
    const trace = simulateRequest(app, { method: 'GET', path: '/' });
    expect(trace.response.status).toBe(200);
    expect(trace.response.body).toBe('Hello, Flask!');
    expect(trace.response.endpoint).toBe('index');
  });

  it('fills f-string path params', () => {
    const app = parseFlaskSource(`
app = Flask(__name__)

@app.route("/user/<name>")
def user(name):
    return f"Hello, {name}!"
`);
    const trace = simulateRequest(app, { method: 'GET', path: '/user/ali' });
    expect(trace.response.body).toBe('Hello, ali!');
    expect(trace.viewArgs.name).toBe('ali');
  });

  it('branches on request.method', () => {
    const app = parseFlaskSource(`
app = Flask(__name__)

@app.route("/items", methods=["GET", "POST"])
def items():
    if request.method == "POST":
        return "created", 201
    return "list items"
`);
    expect(simulateRequest(app, { method: 'GET', path: '/items' }).response.body).toBe(
      'list items',
    );
    const post = simulateRequest(app, { method: 'POST', path: '/items' });
    expect(post.response.status).toBe(201);
    expect(post.response.body).toBe('created');
  });

  it('short-circuits on before_request', () => {
    const app = parseFlaskSource(`
app = Flask(__name__)

@app.route("/ping")
def ping():
    return "pong"

@app.before_request
def require_api_key():
    if not request.headers.get("X-Api-Key"):
        return "missing api key", 401
    return None
`);
    const denied = simulateRequest(app, { method: 'GET', path: '/ping' });
    expect(denied.response.status).toBe(401);
    expect(denied.response.body).toBe('missing api key');
    expect(denied.response.shortCircuited).toBe(true);

    const ok = simulateRequest(app, {
      method: 'GET',
      path: '/ping',
      headers: { 'X-Api-Key': 'secret' },
    });
    expect(ok.response.status).toBe(200);
    expect(ok.response.body).toBe('pong');
    expect(ok.response.shortCircuited).toBe(false);
  });

  it('uses custom 404 handler', () => {
    const app = parseFlaskSource(`
app = Flask(__name__)

@app.route("/")
def index():
    return "Home"

@app.errorhandler(404)
def not_found(e):
    return "nothing here", 404
`);
    const trace = simulateRequest(app, { method: 'GET', path: '/nope' });
    expect(trace.response.status).toBe(404);
    expect(trace.response.body).toBe('nothing here');
  });

  it('applies after_request body rewrite', () => {
    const app = parseFlaskSource(`
app = Flask(__name__)

@app.route("/")
def index():
    return "Hello"

@app.after_request
def tag(response):
    return response.body + " [done]", 200
`);
    const trace = simulateRequest(app, { method: 'GET', path: '/' });
    expect(trace.response.body).toBe('Hello [done]');
  });

  it('handles abort(401) with query token', () => {
    const app = parseFlaskSource(`
app = Flask(__name__)

@app.route("/admin")
def admin():
    if request.args.get("token") != "letmein":
        abort(401)
    return "admin ok"
`);
    expect(simulateRequest(app, { method: 'GET', path: '/admin' }).response.status).toBe(401);
    const ok = simulateRequest(app, {
      method: 'GET',
      path: '/admin',
      query: 'token=letmein',
    });
    expect(ok.response.status).toBe(200);
    expect(ok.response.body).toBe('admin ok');
  });

  it('resolves blueprint prefix and jsonify', () => {
    const app = parseFlaskSource(`
app = Flask(__name__)
api = Blueprint("api", __name__, url_prefix="/api")

@api.route("/me")
def me():
    return jsonify({"name": "ali", "role": "admin"})

app.register_blueprint(api)
`);
    expect(matchRoute(app, '/api/me', 'GET')?.route.blueprint).toBe('api');
    const trace = simulateRequest(app, { method: 'GET', path: '/api/me' });
    expect(trace.response.status).toBe(200);
    expect(trace.response.body).toContain('"name":"ali"');
  });
});

describe('statusText', () => {
  it('maps common codes', () => {
    expect(statusText(200)).toBe('OK');
    expect(statusText(404)).toBe('Not Found');
    expect(statusText(418)).toBe('Unknown');
  });
});
