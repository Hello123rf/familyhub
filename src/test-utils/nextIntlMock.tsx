/**
 * Jest mock for `next-intl` (mapped in jest.config.js).
 *
 * next-intl ships ESM that ts-jest doesn't transpile, and unit tests don't need
 * the real i18n runtime. This resolves keys against the English catalog so
 * text-asserting tests still see real copy, does naive {placeholder} substitution,
 * and provides a pass-through provider. ICU plural/select strings are returned
 * raw (no test currently renders one).
 */
import * as React from 'react';
import en from '@/i18n/messages/en.json';

type Dict = Record<string, unknown>;

/** Walk a dotted path ("calendar.views" / "week1") through the catalogue. */
function resolve(path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (node, segment) =>
        node && typeof node === 'object' ? (node as Dict)[segment] : undefined,
      en,
    );
}

function lookup(namespace: string | undefined, key: string): string {
  const path = namespace ? `${namespace}.${key}` : key;
  const value = resolve(path);
  return typeof value === 'string' ? value : path;
}

export function NextIntlClientProvider({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}

export function useTranslations(namespace?: string) {
  const substitute = (key: string, values?: Record<string, unknown>) => {
    let out = lookup(namespace, key);
    if (values) {
      for (const [k, v] of Object.entries(values)) {
        if (typeof v === 'function') continue; // rich-text tag handler, not a value
        out = out.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      }
    }
    return out;
  };

  const t = (key: string, values?: Record<string, unknown>) => substitute(key, values);
  // t.rich renders tags via handlers in the real runtime; tests only need the
  // text, so strip the markup and return a plain string.
  t.rich = (key: string, values?: Record<string, unknown>) =>
    substitute(key, values).replace(/<\/?[a-zA-Z][^>]*>/g, '');
  t.raw = (key: string) => lookup(namespace, key);
  return t;
}

export function useLocale() {
  return 'en';
}

export function useFormatter() {
  return {} as Record<string, unknown>;
}
