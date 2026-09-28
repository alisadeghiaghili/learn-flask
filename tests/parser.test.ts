/**
 * Parser unit tests.
 */

import { describe, expect, it } from 'vitest';
import { parseFlaskSource, parseExpr } from '../src/parser/flaskParser';

describe('parseFlaskSource', () => {
  it('parses app construction and a simple route', () => {
    const app = parseFlaskSource(`
from flask import Flask
app = Flask(__name__)

@app.route("/")
def index():
    return "Hello, Flask!"
`);
    expect(app.appName).toBe('app');
    expect(app.routes).toHaveLength(1);
    expect(app.routes[0].rule).toBe('/');
    expect(app.routes[0].methods).toEqual(['GET']);
    expect(app.routes[0].endpoint).toBe('index');
    expect(app.routes[0].body[0]).toEqual({
      kind: 'return',
      expr: { kind: 'str', value: 'Hello, Flask!' },
    });
  });

  it('parses methods and URL params', () => {
    const app = parseFlaskSource(`
app = Flask(__name__)

@app.route("/items", methods=["GET", "POST"])
def items():
    return "ok"

@app.route("/user/<name>")
def user(name):
    return f"Hello, {name}!"
`);
    expect(app.routes[0].methods).toEqual(['GET', 'POST']);
    expect(app.routes[1].rule).toBe('/user/<name>');
    expect(app.routes[1].body[0].kind).toBe('return');
  });

  it('applies blueprint url_prefix to rules', () => {
    const app = parseFlaskSource(`
app = Flask(__name__)
api = Blueprint("api", __name__, url_prefix="/api")

@api.route("/ping")
def ping():
    return "api pong"

app.register_blueprint(api)
`);
    expect(app.blueprints).toHaveLength(1);
    expect(app.routes).toHaveLength(1);
    expect(app.routes[0].rule).toBe('/api/ping');
    expect(app.routes[0].blueprint).toBe('api');
  });

  it('parses before_request and errorhandler hooks', () => {
    const app = parseFlaskSource(`
app = Flask(__name__)

@app.before_request
def require_key():
    return "missing", 401

@app.errorhandler(404)
def not_found(e):
    return "nothing here", 404
`);
    const kinds = app.hooks.map((h) => h.kind).sort();
    expect(kinds).toEqual(['before_request', 'errorhandler']);
    expect(app.hooks.find((h) => h.kind === 'errorhandler')?.code).toBe(404);
  });

  it('records diagnostics for unknown decorators', () => {
    const app = parseFlaskSource(`
app = Flask(__name__)

@app.teardown_request
def x(e):
    return None
`);
    expect(app.diagnostics.some((d) => d.message.includes('teardown_request'))).toBe(true);
  });
});

describe('parseExpr', () => {
  it('parses string and f-string', () => {
    expect(parseExpr('"hi"')).toEqual({ kind: 'str', value: 'hi' });
    expect(parseExpr("f'Hello, {name}!'")).toEqual({
      kind: 'fstr',
      template: 'Hello, {name}!',
    });
  });

  it('parses jsonify', () => {
    const e = parseExpr('jsonify({"name": "ali", "role": "admin"})');
    expect(e.kind).toBe('jsonify');
    if (e.kind === 'jsonify') {
      expect(e.fields.name).toBe('"ali"');
    }
  });
});
