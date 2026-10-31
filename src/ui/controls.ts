/**
 * Tiny declarative control kit. Panels describe what they want; this file
 * makes it real, consistent, and pleasant to touch.
 */

export type Control =
  | {
      kind: 'slider';
      label: string;
      min: number;
      max: number;
      step: number;
      get: () => number;
      set: (v: number) => void;
      format?: (v: number) => string;
      hint?: string;
    }
  | {
      kind: 'toggle';
      label: string;
      get: () => boolean;
      set: (v: boolean) => void;
      hint?: string;
    }
  | {
      kind: 'segmented';
      label: string;
      options: Array<{ value: string; label: string }>;
      get: () => string;
      set: (v: string) => void;
      hint?: string;
    }
  | {
      kind: 'select';
      label: string;
      options: Array<{ value: string; label: string }>;
      get: () => string;
      set: (v: string) => void;
    }
  | {
      kind: 'color';
      label: string;
      get: () => string;
      set: (v: string) => void;
    }
  | {
      kind: 'text';
      label: string;
      placeholder?: string;
      get: () => string;
      set: (v: string) => void;
    }
  | {
      kind: 'file';
      label: string;
      accept: string;
      button: string;
      onFile: (file: File) => void;
      hint?: string;
    }
  | {
      kind: 'button';
      label: string;
      onClick: () => void;
      variant?: 'primary' | 'ghost' | 'danger';
    }
  | {
      kind: 'note';
      html: string;
    };

export function renderControls(container: HTMLElement, defs: Control[], onChange: () => void): void {
  for (const def of defs) {
    switch (def.kind) {
      case 'slider': {
        const row = el('label', 'ctl row slider-row');
        const head = el('div', 'ctl-head');
        head.appendChild(el('span', 'ctl-label', def.label));
        const val = el('span', 'ctl-value', (def.format ?? String)(def.get()));
        head.appendChild(val);
        row.appendChild(head);
        const input = document.createElement('input');
        input.type = 'range';
        input.min = String(def.min);
        input.max = String(def.max);
        input.step = String(def.step);
        input.value = String(def.get());
        const setFill = () => {
          const frac = (parseFloat(input.value) - def.min) / (def.max - def.min || 1);
          input.style.setProperty('--fill', `${Math.round(frac * 100)}%`);
        };
        setFill();
        input.addEventListener('input', () => {
          const v = parseFloat(input.value);
          def.set(v);
          val.textContent = (def.format ?? String)(v);
          setFill();
          onChange();
        });
        row.appendChild(input);
        if (def.hint) row.appendChild(el('div', 'ctl-hint', def.hint));
        container.appendChild(row);
        break;
      }
      case 'toggle': {
        const row = el('label', 'ctl row toggle-row');
        const wrap = el('div', 'ctl-head');
        wrap.appendChild(el('span', 'ctl-label', def.label));
        row.appendChild(wrap);
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = def.get();
        input.className = 'switch';
        input.addEventListener('change', () => {
          def.set(input.checked);
          onChange();
        });
        row.appendChild(input);
        if (def.hint) row.appendChild(el('div', 'ctl-hint', def.hint));
        container.appendChild(row);
        break;
      }
      case 'segmented': {
        const row = el('div', 'ctl row');
        row.appendChild(el('div', 'ctl-label', def.label));
        const seg = el('div', 'segmented');
        for (const opt of def.options) {
          const b = el('button', 'seg-btn', opt.label);
          b.type = 'button';
          if (opt.value === def.get()) b.classList.add('active');
          b.addEventListener('click', () => {
            def.set(opt.value);
            seg.querySelectorAll('.seg-btn').forEach((x) => x.classList.remove('active'));
            b.classList.add('active');
            onChange();
          });
          seg.appendChild(b);
        }
        row.appendChild(seg);
        if (def.hint) row.appendChild(el('div', 'ctl-hint', def.hint));
        container.appendChild(row);
        break;
      }
      case 'select': {
        const row = el('label', 'ctl row');
        row.appendChild(el('span', 'ctl-label', def.label));
        const select = document.createElement('select');
        for (const opt of def.options) {
          const o = document.createElement('option');
          o.value = opt.value;
          o.textContent = opt.label;
          select.appendChild(o);
        }
        select.value = def.get();
        select.addEventListener('change', () => {
          def.set(select.value);
          onChange();
        });
        row.appendChild(select);
        container.appendChild(row);
        break;
      }
      case 'color': {
        const row = el('label', 'ctl row');
        row.appendChild(el('span', 'ctl-label', def.label));
        const input = document.createElement('input');
        input.type = 'color';
        input.value = def.get();
        input.addEventListener('input', () => {
          def.set(input.value);
          onChange();
        });
        row.appendChild(input);
        container.appendChild(row);
        break;
      }
      case 'text': {
        const row = el('label', 'ctl row');
        row.appendChild(el('span', 'ctl-label', def.label));
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'text-input';
        input.placeholder = def.placeholder ?? '';
        input.value = def.get();
        input.addEventListener('input', () => {
          def.set(input.value);
          onChange();
        });
        row.appendChild(input);
        container.appendChild(row);
        break;
      }
      case 'file': {
        const row = el('div', 'ctl row');
        row.appendChild(el('div', 'ctl-label', def.label));
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = def.accept;
        input.className = 'hidden-file';
        input.addEventListener('change', () => {
          const f = input.files?.[0];
          if (f) def.onFile(f);
          input.value = '';
        });
        const b = el('button', 'btn ghost', def.button);
        b.type = 'button';
        b.addEventListener('click', () => input.click());
        row.appendChild(b);
        row.appendChild(input);
        if (def.hint) row.appendChild(el('div', 'ctl-hint', def.hint));
        container.appendChild(row);
        break;
      }
      case 'button': {
        const b = el('button', `btn ${def.variant ?? ''}`.trim(), def.label);
        b.type = 'button';
        b.addEventListener('click', () => def.onClick());
        container.appendChild(b);
        break;
      }
      case 'note': {
        const n = el('div', 'note');
        n.innerHTML = def.html;
        container.appendChild(n);
        break;
      }
    }
  }
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function fmtTime(s: number): string {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const d = Math.floor((s % 1) * 10);
  return `${m}:${String(sec).padStart(2, '0')}.${d}`;
}

export function fmtBytes(n: number): string {
  if (n > 1e9) return `${(n / 1e9).toFixed(2)} GB`;
  if (n > 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  if (n > 1e3) return `${(n / 1e3).toFixed(0)} KB`;
  return `${n} B`;
}
