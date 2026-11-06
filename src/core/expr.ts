/**
 * Small, safe math-expression parser (no eval).
 *
 * Grammar:  expr  := term (('+' | '-') term)*
 *           term  := unary (('*' | '/' | '%') unary)*   (also implicit: 2pi, 3(x+1), 2x)
 *           unary := ('-' | '+') unary | power
 *           power := atom ('^' unary)?                    (right-associative)
 *           atom  := number | name | name '(' args ')' | '(' expr ')'
 */

export type Env = Record<string, number>;
export type Compiled = (env: Env) => number;

export class ExprError extends Error {
  constructor(
    readonly code: 'char' | 'unexpected' | 'paren' | 'name' | 'func' | 'args' | 'empty',
    readonly detail: string,
  ) {
    super(`${code}: ${detail}`);
  }
}

const CONSTS: Env = { pi: Math.PI, tau: 2 * Math.PI, e: Math.E, phi: (1 + Math.sqrt(5)) / 2 };

const F1: Record<string, (x: number) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, exp: Math.exp, ln: Math.log, log: Math.log10,
  log2: Math.log2, sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, floor: Math.floor, ceil: Math.ceil,
  round: Math.round, sign: Math.sign, sec: (x) => 1 / Math.cos(x), csc: (x) => 1 / Math.sin(x), cot: (x) => 1 / Math.tan(x),
};
const F2: Record<string, (a: number, b: number) => number> = {
  atan2: Math.atan2, pow: Math.pow, mod: (a, b) => ((a % b) + b) % b, hypot: Math.hypot,
};
const FN: Record<string, (...a: number[]) => number> = { min: Math.min, max: Math.max };

export const FUNCTIONS = [...Object.keys(F1), ...Object.keys(F2), ...Object.keys(FN)];

type Tok = { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      const m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(src.slice(i));
      if (!m) throw new ExprError('char', c);
      out.push({ t: 'num', v: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_π]/.test(c)) {
      const m = /^[A-Za-z_π][A-Za-z_0-9]*/.exec(src.slice(i))!;
      out.push({ t: 'id', v: m[0] === 'π' ? 'pi' : m[0] });
      i += m[0].length;
      continue;
    }
    if ('+-*/^(),%'.includes(c)) { out.push({ t: 'op', v: c }); i++; continue; }
    if (c === '×' || c === '·') { out.push({ t: 'op', v: '*' }); i++; continue; }
    if (c === '−') { out.push({ t: 'op', v: '-' }); i++; continue; }
    throw new ExprError('char', c);
  }
  return out;
}

/** Compile an expression. `names` collects every variable it reads (for dependency checks). */
export function compile(src: string, names: Set<string> = new Set()): Compiled {
  const toks = tokenize(src);
  if (toks.length === 0) throw new ExprError('empty', src);
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => peek()?.t === 'op' && peek()!.v === v;
  const startsAtom = () => { const k = peek(); return !!k && (k.t === 'num' || k.t === 'id' || (k.t === 'op' && k.v === '(')); };

  const expr = (): Compiled => {
    let l = term();
    while (isOp('+') || isOp('-')) {
      const op = toks[p++].v;
      const a = l, b = term();
      l = op === '+' ? (e) => a(e) + b(e) : (e) => a(e) - b(e);
    }
    return l;
  };
  const term = (): Compiled => {
    let l = unary();
    for (;;) {
      if (isOp('*') || isOp('/') || isOp('%')) {
        const op = toks[p++].v;
        const a = l, b = unary();
        l = op === '*' ? (e) => a(e) * b(e) : op === '/' ? (e) => a(e) / b(e) : (e) => a(e) % b(e);
      } else if (startsAtom()) {
        // implicit multiplication: 2pi, 2(x+1), (a)(b), 2x
        const a = l, b = power();
        l = (e) => a(e) * b(e);
      } else return l;
    }
  };
  const unary = (): Compiled => {
    if (isOp('-')) { p++; const a = unary(); return (e) => -a(e); }
    if (isOp('+')) { p++; return unary(); }
    return power();
  };
  const power = (): Compiled => {
    const base = atom();
    if (isOp('^')) {
      p++;
      const ex = unary();
      return (e) => Math.pow(base(e), ex(e));
    }
    return base;
  };
  const atom = (): Compiled => {
    const k = toks[p++];
    if (!k) throw new ExprError('unexpected', 'end');
    if (k.t === 'num') { const v = k.v; return () => v; }
    if (k.t === 'op' && k.v === '(') {
      const inner = expr();
      if (!isOp(')')) throw new ExprError('paren', ')');
      p++;
      return inner;
    }
    if (k.t === 'id') {
      const name = k.v;
      if (isOp('(')) {
        p++;
        const args: Compiled[] = [];
        if (!isOp(')')) {
          args.push(expr());
          while (isOp(',')) { p++; args.push(expr()); }
        }
        if (!isOp(')')) throw new ExprError('paren', ')');
        p++;
        const lname = name.toLowerCase();
        if (F1[lname]) {
          if (args.length !== 1) throw new ExprError('args', name);
          const f = F1[lname], a = args[0];
          return (e) => f(a(e));
        }
        if (F2[lname]) {
          if (args.length !== 2) throw new ExprError('args', name);
          const f = F2[lname], a = args[0], b = args[1];
          return (e) => f(a(e), b(e));
        }
        if (FN[lname]) {
          if (args.length === 0) throw new ExprError('args', name);
          const f = FN[lname];
          return (e) => f(...args.map((a) => a(e)));
        }
        // not a function: treat "name(…)" as name × (…)
        if (args.length !== 1) throw new ExprError('func', name);
        names.add(name);
        const a = args[0];
        return (e) => variable(e, name) * a(e);
      }
      if (name in CONSTS) { const v = CONSTS[name]; return () => v; }
      names.add(name);
      return (e) => variable(e, name);
    }
    throw new ExprError('unexpected', k.v);
  };
  const variable = (e: Env, name: string): number => {
    const v = e[name];
    if (v === undefined) throw new ExprError('name', name);
    return v;
  };

  const f = expr();
  if (p < toks.length) {
    const k = toks[p];
    throw new ExprError(k.t === 'op' && k.v === ')' ? 'paren' : 'unexpected', String(k.v));
  }
  return f;
}
