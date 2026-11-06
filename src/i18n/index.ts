import { ja } from './ja';
import { en } from './en';
import { zh } from './zh';
import { ko } from './ko';
import { es } from './es';
import { fr } from './fr';
import { de } from './de';

export type Dict = typeof en;
export type Key = keyof Dict;

export const LANGS: Record<string, { name: string; dict: Partial<Dict> }> = {
  ja: { name: '日本語', dict: ja },
  en: { name: 'English', dict: en },
  zh: { name: '简体中文', dict: zh },
  ko: { name: '한국어', dict: ko },
  es: { name: 'Español', dict: es },
  fr: { name: 'Français', dict: fr },
  de: { name: 'Deutsch', dict: de },
};

let current = 'en';
const listeners: (() => void)[] = [];

export function detectLang(): string {
  try {
    const saved = localStorage.getItem('ndm.lang');
    if (saved && LANGS[saved]) return saved;
  } catch { /* storage unavailable */ }
  const nav = (navigator.languages?.[0] ?? navigator.language ?? 'en').toLowerCase();
  const code = nav.split('-')[0];
  return LANGS[code] ? code : 'en';
}

export function setLang(code: string): void {
  if (!LANGS[code]) code = 'en';
  current = code;
  document.documentElement.lang = code;
  try { localStorage.setItem('ndm.lang', code); } catch { /* ignore */ }
  listeners.forEach((f) => f());
}

export const getLang = (): string => current;
export const onLangChange = (f: () => void): void => { listeners.push(f); };

/** Translate with {name} placeholders. Falls back to English, then the key. */
export function t(key: Key, params?: Record<string, string | number>): string {
  let s = (LANGS[current]?.dict[key] ?? en[key] ?? key) as string;
  if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

/** Apply translations to every element with data-i18n / data-i18n-title / data-i18n-placeholder. */
export function translateDom(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n as Key); });
  root.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((el) => {
    const v = t(el.dataset.i18nTitle as Key);
    el.title = v;
    el.setAttribute('aria-label', v);
  });
}
