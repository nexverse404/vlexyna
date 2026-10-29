/* Vlexyna — expr.js — safe math expression evaluator for automations */
'use strict';
import { VX, U } from './util.js';
(() => {
  const E = VX.expr = {};

  function tokenize(src) {
    const toks = []; let i = 0;
    const isD = c => c >= '0' && c <= '9';
    while (i < src.length) {
      const c = src[i];
      if (c === ' ' || c === '\t' || c === '\n') { i++; continue; }
      if (isD(c) || (c === '.' && isD(src[i + 1]))) {
        let j = i; while (j < src.length && (isD(src[j]) || src[j] === '.')) j++;
        toks.push({ t: 'num', v: parseFloat(src.slice(i, j)) }); i = j; continue;
      }
      if (/[a-zA-Z_]/.test(c)) {
        let j = i; while (j < src.length && /[a-zA-Z0-9_]/.test(src[j])) j++;
        toks.push({ t: 'id', v: src.slice(i, j) }); i = j; continue;
      }
      const two = src.slice(i, i + 2);
      if (['<=', '>=', '==', '!=', '&&', '||'].includes(two)) { toks.push({ t: 'op', v: two }); i += 2; continue; }
      if ('+-*/%()<>?:,^'.includes(c)) { toks.push({ t: 'op', v: c }); i++; continue; }
      throw new Error(`Bad char "${c}"`);
    }
    return toks;
  }

  function parse(toks) {
    let p = 0;
    const peek = () => toks[p], next = () => toks[p++];
    const expect = v => { const t = next(); if (!t || t.v !== v) throw new Error(`Expected "${v}"`); };

    function ternary() {
      let a = orx();
      if (peek() && peek().v === '?') { next(); const b = ternary(); expect(':'); const c = ternary(); return { k: 'if', a, b, c }; }
      return a;
    }
    function orx() { let a = andx(); while (peek() && peek().v === '||') { next(); a = { k: 'or', a, b: andx() }; } return a; }
    function andx() { let a = cmp(); while (peek() && peek().v === '&&') { next(); a = { k: 'and', a, b: cmp() }; } return a; }
    function cmp() {
      let a = add();
      while (peek() && ['<', '>', '<=', '>=', '==', '!='].includes(peek().v)) { const o = next().v; a = { k: 'cmp', o, a, b: add() }; }
      return a;
    }
    function add() { let a = mul(); while (peek() && (peek().v === '+' || peek().v === '-')) { const o = next().v; a = { k: 'bin', o, a, b: mul() }; } return a; }
    function mul() { let a = pow(); while (peek() && ['*', '/', '%'].includes(peek().v)) { const o = next().v; a = { k: 'bin', o, a, b: pow() }; } return a; }
    function pow() { let a = unary(); if (peek() && peek().v === '^') { next(); return { k: 'bin', o: '^', a, b: pow() }; } return a; }
    function unary() {
      const t = peek();
      if (t && t.v === '-') { next(); return { k: 'neg', a: unary() }; }
      if (t && t.v === '+') { next(); return unary(); }
      return atom();
    }
    function atom() {
      const t = next();
      if (!t) throw new Error('Unexpected end');
      if (t.t === 'num') return { k: 'num', v: t.v };
      if (t.t === 'id') {
        if (peek() && peek().v === '(') {
          next();
          const args = [];
          if (peek() && peek().v !== ')') { args.push(ternary()); while (peek() && peek().v === ',') { next(); args.push(ternary()); } }
          expect(')');
          return { k: 'call', f: t.v, args };
        }
        return { k: 'var', n: t.v };
      }
      if (t.v === '(') { const a = ternary(); expect(')'); return a; }
      throw new Error(`Unexpected "${t.v}"`);
    }
    const ast = ternary();
    if (p < toks.length) throw new Error('Trailing input');
    return ast;
  }

  const FN = {
    sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
    abs: Math.abs, sqrt: Math.sqrt, floor: Math.floor, ceil: Math.ceil, round: Math.round,
    exp: Math.exp, log: Math.log, sign: Math.sign, min: Math.min, max: Math.max, pow: Math.pow,
    clamp: (v, a, b) => U.clamp(v, a, b), lerp: (a, b, t) => a + (b - a) * t,
    step: (edge, x) => x < edge ? 0 : 1,
    noise: (x) => { const s = Math.sin(x * 12.9898) * 43758.5453; return (s - Math.floor(s)) * 2 - 1; },
    saw: (x) => (x % 1 + 1) % 1 * 2 - 1,
    tri: (x) => { const p = (x % 1 + 1) % 1; return p < .5 ? p * 4 - 1 : 3 - p * 4; },
    sq: (x) => ((x % 1 + 1) % 1) < .5 ? -1 : 1,
    if: (c, a, b) => c ? a : b,
    /* easing helpers (vizzy-parity via bezier-easing) */
    easeIn: (x) => x * x * x,
    easeOut: (x) => 1 - Math.pow(1 - U.clamp(x, 0, 1), 3),
    easeInOut: (x) => { x = U.clamp(x, 0, 1); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; },
    smoothstep: (x) => { x = U.clamp(x, 0, 1); return x * x * (3 - 2 * x); },
    bounce: (x) => {
      x = U.clamp(x, 0, 1);
      const n = 7.5625, d = 2.75;
      if (x < 1 / d) return n * x * x;
      if (x < 2 / d) return n * (x -= 1.5 / d) * x + .75;
      if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + .9375;
      return n * (x -= 2.625 / d) * x + .984375;
    },
    /* live spectrum access — read the audio engine directly so automations
       and the shader layer share one source of truth */
    freq: (n) => {
      const eng = VX.audio && VX.audio.engine;
      if (!eng || !eng.freq || !eng.freq.length) return 0;
      const i = U.clamp(Math.round((U.clamp(n, 0, 1)) * (eng.freq.length - 1)), 0, eng.freq.length - 1);
      return eng.freq[i] / 255;
    },
    fft: (f0, f1) => {
      const eng = VX.audio && VX.audio.engine;
      if (!eng || !eng.range) return 0;
      return eng.range(f0, f1);
    },
  };

  function evalNode(n, env) {
    switch (n.k) {
      case 'num': return n.v;
      case 'var': { if (n.n in env) return +env[n.n] || 0; if (n.n === 'pi') return Math.PI; if (n.n === 'e') return Math.E; if (n.n === 'true') return 1; if (n.n === 'false') return 0; return 0; }
      case 'neg': return -evalNode(n.a, env);
      case 'if': return evalNode(n.a, env) ? evalNode(n.b, env) : evalNode(n.c, env);
      case 'and': return evalNode(n.a, env) && evalNode(n.b, env) ? 1 : 0;
      case 'or': return evalNode(n.a, env) || evalNode(n.b, env) ? 1 : 0;
      case 'cmp': { const a = evalNode(n.a, env), b = evalNode(n.b, env); return (n.o === '<' ? a < b : n.o === '>' ? a > b : n.o === '<=' ? a <= b : n.o === '>=' ? a >= b : n.o === '==' ? a === b : a !== b) ? 1 : 0; }
      case 'bin': { const a = evalNode(n.a, env), b = evalNode(n.b, env); return n.o === '+' ? a + b : n.o === '-' ? a - b : n.o === '*' ? a * b : n.o === '/' ? (b === 0 ? 0 : a / b) : n.o === '%' ? (b === 0 ? 0 : a % b) : Math.pow(a, b); }
      case 'call': { const f = FN[n.f]; if (!f) throw new Error(`Unknown fn ${n.f}`); return f(...n.args.map(x => evalNode(x, env))); }
    }
    return 0;
  }

  const cache = new Map();
  E.compile = (src) => {
    if (cache.has(src)) return cache.get(src);
    let ast = null, err = null;
    try { ast = parse(tokenize(src)); } catch (e) { err = e; }
    const fn = (env) => {
      if (err) { throw err; }
      return evalNode(ast, env);
    };
    fn.error = err;
    cache.set(src, fn);
    return fn;
  };
  E.check = (src) => { const f = E.compile(src); try { f({ t: 0, dt: 0, bass: 0, mid: 0, treble: 0, level: 0, beat: 0, pi: Math.PI, e: Math.E, v1: 0, v2: 0, v3: 0, v4: 0 }); return null; } catch (e) { return e.message; } };
})();
