import { el } from './controls';

export function toast(message: string, kind: 'info' | 'success' | 'error' = 'info', ms = 4200): void {
  let host = document.querySelector<HTMLElement>('.toast-host');
  if (!host) {
    host = el('div', 'toast-host');
    document.body.appendChild(host);
  }
  const t = el('div', `toast ${kind}`);
  t.appendChild(el('div', 'toast-msg', message));
  host.appendChild(t);
  requestAnimationFrame(() => t.classList.add('in'));
  setTimeout(() => {
    t.classList.remove('in');
    setTimeout(() => t.remove(), 350);
  }, ms);
}
