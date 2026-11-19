/*
  The Detection Playground (DEV ONLY, removed from production builds): paste text and see every
  detection the engine finds, highlighted by category group, with live timing.
  Settings (phone country, ID countries, custom terms, actions) live only in memory — nothing
  is stored. Uses the design tokens everywhere; every control has a label and a focus ring.
*/
import { useEffect, useMemo, useState, type ReactNode } from 'react';

import { detect, type Detection, type DetectResult } from '@safeai/detection';
import {
  CATEGORY_GROUP,
  CATEGORY_LABEL,
  CUSTOM_TERM_CATEGORIES,
  DEFAULT_POLICY,
  DETECTOR_CATEGORIES,
  NATIONAL_ID_COUNTRIES,
  type CategoryGroup,
  type CustomTerm,
  type CustomTermCategory,
  type DetectorCategory,
  type NationalIdCountry,
  type Policy,
  type RuleAction,
} from '@safeai/shared';

import { SAMPLES } from './samples';

/* ---------- Settings (in memory only) ---------- */

type Actions = Record<DetectorCategory, RuleAction>;

interface Settings {
  phoneCountry: string;
  idCountries: NationalIdCountry[];
  customTermsText: string;
  actions: Actions;
}

const RULE_ACTIONS: readonly RuleAction[] = ['redact', 'block', 'warn', 'allow'];
const PHONE_COUNTRIES = ['PK', 'US', 'GB', 'AE', 'SA', 'IN', 'CA', 'AU', 'DE'];
const DEBOUNCE_MS = 150;

function defaultSettings(): Settings {
  const actions = Object.fromEntries(
    DETECTOR_CATEGORIES.map((category) => [category, DEFAULT_POLICY.rules[category].action]),
  ) as Actions;
  return {
    phoneCountry: DEFAULT_POLICY.defaultPhoneCountry,
    idCountries: [...DEFAULT_POLICY.nationalIdCountries],
    customTermsText: '',
    actions,
  };
}

/**
 * Reads the custom terms box: one term per line, "term | category" (category optional, default
 * custom_term). Empty lines are skipped; lines with an unknown category are counted as invalid.
 */
function parseCustomTerms(text: string): { terms: CustomTerm[]; invalid: number } {
  const terms: CustomTerm[] = [];
  let invalid = 0;
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    const [rawTerm = '', rawCategory = 'custom_term'] = line.split('|').map((part) => part.trim());
    const category = rawCategory as CustomTermCategory;
    if (rawTerm === '' || !CUSTOM_TERM_CATEGORIES.includes(category)) {
      invalid++;
      continue;
    }
    terms.push({ term: rawTerm, category, wholeWord: true });
  }
  return { terms, invalid };
}

/** Made-up terms ("Test Term 0001 | client_name" …) for performance checks (500 or 5,000). */
function generateTestTerms(count: number): string {
  return Array.from(
    { length: count },
    (_, i) =>
      `Test Term ${String(i + 1).padStart(4, '0')} | ${CUSTOM_TERM_CATEGORIES[i % CUSTOM_TERM_CATEGORIES.length]}`,
  ).join('\n');
}

/** Returns `value`, but only after it has stopped changing for `ms` milliseconds. */
function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

/* ---------- Styling helpers (static class names so Tailwind can find them) ---------- */

const GROUP_STYLE: Record<CategoryGroup, { mark: string; chip: string; dot: string }> = {
  personal: {
    mark: 'bg-personal-subtle text-personal border-personal/50',
    chip: 'bg-personal-subtle text-personal',
    dot: 'bg-personal',
  },
  secrets: {
    mark: 'bg-secrets-subtle text-secrets border-secrets/50',
    chip: 'bg-secrets-subtle text-secrets',
    dot: 'bg-secrets',
  },
  financial: {
    mark: 'bg-financial-subtle text-financial border-financial/50',
    chip: 'bg-financial-subtle text-financial',
    dot: 'bg-financial',
  },
  business: {
    mark: 'bg-business-subtle text-business border-business/50',
    chip: 'bg-business-subtle text-business',
    dot: 'bg-business',
  },
};

const FIELD =
  'w-full rounded-md border border-neutral-300 bg-neutral-0 px-3 py-2 text-sm text-neutral-900 shadow-sm transition-colors duration-(--duration-fast) ease-out hover:border-neutral-400 focus-visible:border-primary-600 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary-600 motion-reduce:transition-none';
const BUTTON_SECONDARY =
  'inline-flex items-center rounded-md border border-neutral-300 bg-neutral-0 px-3 py-1.5 text-sm font-medium text-neutral-800 shadow-sm transition-colors duration-(--duration-fast) ease-out hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 motion-reduce:transition-none';

/** A white rounded section with a heading. */
function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section
      aria-label={title}
      className="rounded-lg border border-neutral-200 bg-neutral-0 p-4 shadow-sm"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-md font-semibold text-neutral-900">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/* ---------- Input ---------- */

function InputPanel({ text, onText }: { text: string; onText: (text: string) => void }) {
  const loadSample = (
    <label className="flex items-center gap-2 text-sm text-neutral-600">
      <span className="sr-only">Load sample</span>
      <select
        className={`${FIELD} w-auto`}
        value=""
        onChange={(event) => {
          const sample = SAMPLES[Number(event.target.value)];
          if (sample) onText(sample.text);
        }}
      >
        <option value="" disabled>
          Load sample…
        </option>
        {SAMPLES.map((sample, index) => (
          <option key={sample.label} value={index}>
            {sample.label}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <Panel title="Input" action={loadSample}>
      <label htmlFor="playground-text" className="sr-only">
        Text to check
      </label>
      <textarea
        id="playground-text"
        value={text}
        onChange={(event) => onText(event.target.value)}
        rows={16}
        spellCheck={false}
        placeholder="Paste or type text here…"
        className={`${FIELD} min-h-80 resize-y font-mono`}
      />
      <p className="mt-2 text-right text-xs text-neutral-500 tabular-nums">
        {text.length.toLocaleString()} characters
      </p>
    </Panel>
  );
}

/* ---------- Settings ---------- */

function SettingsPanel({
  settings,
  onChange,
  invalidTerms,
  termCount,
}: {
  settings: Settings;
  onChange: (settings: Settings) => void;
  invalidTerms: number;
  termCount: number;
}) {
  const set = (patch: Partial<Settings>) => onChange({ ...settings, ...patch });

  const reset = (
    <button type="button" className={BUTTON_SECONDARY} onClick={() => onChange(defaultSettings())}>
      Reset to default
    </button>
  );

  return (
    <Panel title="Settings" action={reset}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-medium text-neutral-700">
          Default phone country
          <select
            className={FIELD}
            value={settings.phoneCountry}
            onChange={(event) => set({ phoneCountry: event.target.value })}
          >
            {PHONE_COUNTRIES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-sm font-medium text-neutral-700">National IDs</legend>
          <div className="flex flex-wrap gap-3">
            {NATIONAL_ID_COUNTRIES.map((country) => (
              <label key={country} className="flex items-center gap-1.5 text-sm text-neutral-800">
                <input
                  type="checkbox"
                  className="size-4 accent-primary-600"
                  checked={settings.idCountries.includes(country)}
                  onChange={(event) =>
                    set({
                      idCountries: event.target.checked
                        ? [...settings.idCountries, country]
                        : settings.idCountries.filter((c) => c !== country),
                    })
                  }
                />
                {country}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between gap-2">
          <label htmlFor="playground-terms" className="text-sm font-medium text-neutral-700">
            Custom terms <span className="font-normal text-neutral-500">(term | category)</span>
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              className={BUTTON_SECONDARY}
              onClick={() => set({ customTermsText: generateTestTerms(500) })}
            >
              Generate 500
            </button>
            <button
              type="button"
              className={BUTTON_SECONDARY}
              onClick={() => set({ customTermsText: generateTestTerms(5_000) })}
            >
              Generate 5,000 test terms
            </button>
          </div>
        </div>
        <textarea
          id="playground-terms"
          value={settings.customTermsText}
          onChange={(event) => set({ customTermsText: event.target.value })}
          rows={4}
          spellCheck={false}
          placeholder={'ABC Corp | client_name\nProject Apollo | project_name'}
          className={`${FIELD} font-mono`}
        />
        <p className="mt-1 text-xs text-neutral-500">
          {termCount.toLocaleString()} terms
          {invalidTerms > 0 && (
            <span className="text-warning">
              {' '}
              · {invalidTerms} invalid line{invalidTerms === 1 ? '' : 's'} (categories:{' '}
              {CUSTOM_TERM_CATEGORIES.join(', ')})
            </span>
          )}
        </p>
      </div>

      <fieldset className="mt-4">
        <legend className="mb-2 text-sm font-medium text-neutral-700">Action per category</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
          {DETECTOR_CATEGORIES.map((category) => (
            <label key={category} className="flex flex-col gap-1 text-xs text-neutral-600">
              <span className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className={`size-2 rounded-full ${GROUP_STYLE[CATEGORY_GROUP[category]].dot}`}
                />
                {CATEGORY_LABEL[category]}
              </span>
              <select
                className={`${FIELD} py-1 text-xs`}
                value={settings.actions[category]}
                onChange={(event) =>
                  set({
                    actions: { ...settings.actions, [category]: event.target.value as RuleAction },
                  })
                }
              >
                {RULE_ACTIONS.map((action) => (
                  <option key={action} value={action}>
                    {action}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </fieldset>
    </Panel>
  );
}

/* ---------- Results ---------- */

/** The 5 detectors that took longest, e.g. "phone 4.2 ms · person_name 1.1 ms", to find slow spots. */
function SlowestDetectors({ timingsMs }: { timingsMs: Record<string, number> }) {
  const slowest = Object.entries(timingsMs)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  if (slowest.length === 0) return null;
  return (
    <p className="font-mono text-xs text-neutral-500">
      <span className="font-sans">Slowest detectors: </span>
      {slowest.map(([id, ms]) => `${id} ${ms.toFixed(1)} ms`).join(' · ')}
    </p>
  );
}

function SummaryBar({ result }: { result: DetectResult }) {
  return (
    <div className="mb-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-neutral-700">
        <span>
          <strong className="text-neutral-900 tabular-nums">{result.detections.length}</strong>{' '}
          found
        </span>
        <span className="tabular-nums">{result.durationMs.toFixed(1)} ms</span>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            result.complete ? 'bg-success-subtle text-success' : 'bg-danger-subtle text-danger'
          }`}
        >
          {result.complete ? '✓ complete' : '✗ incomplete'}
        </span>
        {result.failedDetectors.length > 0 && (
          <span className="text-xs text-danger">failed: {result.failedDetectors.join(', ')}</span>
        )}
      </div>
      <SlowestDetectors timingsMs={result.timingsMs} />
      {result.detections.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Counts per category">
          {Object.entries(result.countsByCategory).map(([category, count]) => {
            const c = category as DetectorCategory;
            return (
              <li
                key={c}
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${GROUP_STYLE[CATEGORY_GROUP[c]].chip}`}
              >
                {CATEGORY_LABEL[c]} {count}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** The text with each detection highlighted (detections never overlap after the engine). */
function HighlightedText({ text, detections }: { text: string; detections: Detection[] }) {
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const d of detections) {
    if (d.start > cursor) parts.push(text.slice(cursor, d.start));
    const style = GROUP_STYLE[CATEGORY_GROUP[d.category]];
    const border = d.confidence === 'low' ? 'border-dashed' : 'border-solid';
    const description = `${CATEGORY_LABEL[d.category]} · ${d.confidence} confidence · ${d.ruleId} · ${d.action}`;
    parts.push(
      <mark
        key={d.id}
        title={description}
        className={`rounded-sm border px-0.5 ${border} ${style.mark}`}
      >
        {d.value}
      </mark>,
    );
    cursor = d.end;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));

  return (
    <div className="max-h-[480px] overflow-auto rounded-md border border-neutral-200 bg-neutral-25 p-3 font-mono text-sm leading-6 break-words whitespace-pre-wrap text-neutral-800">
      {parts}
    </div>
  );
}

function DetectionsTable({ detections }: { detections: Detection[] }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-md border border-neutral-200">
      <table className="w-full text-left text-xs">
        <caption className="sr-only">Detections</caption>
        <thead className="bg-neutral-50 text-neutral-600">
          <tr>
            {['Value', 'Category', 'Confidence', 'Action', 'Rule', 'Position'].map((heading) => (
              <th key={heading} scope="col" className="px-3 py-2 font-medium">
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {detections.map((d) => (
            <tr key={d.id} className="text-neutral-800">
              <td className="max-w-48 truncate px-3 py-2 font-mono" title={d.value}>
                {d.value}
              </td>
              <td className="px-3 py-2">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className={`size-2 rounded-full ${GROUP_STYLE[CATEGORY_GROUP[d.category]].dot}`}
                  />
                  {CATEGORY_LABEL[d.category]}
                </span>
              </td>
              <td className="px-3 py-2">{d.confidence}</td>
              <td className="px-3 py-2">{d.action}</td>
              <td className="px-3 py-2 font-mono text-neutral-600">{d.ruleId}</td>
              <td className="px-3 py-2 font-mono text-neutral-600 tabular-nums">
                {d.start}–{d.end}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ResultsPanel({ text, result }: { text: string; result: DetectResult }) {
  return (
    <Panel title="Results">
      <div aria-live="polite">
        <SummaryBar result={result} />
      </div>
      {result.detections.length === 0 ? (
        <div className="rounded-md border border-dashed border-neutral-300 px-4 py-10 text-center">
          <p className="text-sm font-medium text-neutral-700">No sensitive data found</p>
          <p className="text-xs text-neutral-500">
            Paste some text, or pick a sample from “Load sample…”.
          </p>
        </div>
      ) : (
        <>
          <HighlightedText text={text} detections={result.detections} />
          <DetectionsTable detections={result.detections} />
        </>
      )}
    </Panel>
  );
}

/* ---------- Page ---------- */

/** The whole Playground page. */
export function App() {
  const [text, setText] = useState('');
  const [settings, setSettings] = useState<Settings>(defaultSettings);

  // Parse custom terms only when that box changes (not on every keystroke in the main text).
  const parsedTerms = useMemo(
    () => parseCustomTerms(settings.customTermsText),
    [settings.customTermsText],
  );

  // A new policy object only when a setting changes; the engine caches its preparation per policy.
  const policy = useMemo<Policy>(
    () => ({
      version: 1,
      rules: Object.fromEntries(
        DETECTOR_CATEGORIES.map((category) => [
          category,
          { action: settings.actions[category], allowUserOverride: true },
        ]),
      ) as Policy['rules'],
      customTerms: parsedTerms.terms,
      nationalIdCountries: settings.idCountries,
      defaultPhoneCountry: settings.phoneCountry,
    }),
    [settings.actions, settings.idCountries, settings.phoneCountry, parsedTerms.terms],
  );

  // Results update live as you type, 150 ms after you stop.
  const debouncedText = useDebounced(text, DEBOUNCE_MS);
  const result = useMemo(() => detect(debouncedText, policy), [debouncedText, policy]);

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6">
      <header className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-neutral-900">
          SafeAI · Detection Playground
        </h1>
        <span className="rounded-full bg-warning-subtle px-2 py-0.5 text-xs font-medium text-warning">
          Dev only · nothing is stored
        </span>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <InputPanel text={text} onText={setText} />
          <SettingsPanel
            settings={settings}
            onChange={setSettings}
            invalidTerms={parsedTerms.invalid}
            termCount={parsedTerms.terms.length}
          />
        </div>
        <ResultsPanel text={debouncedText} result={result} />
      </div>
    </div>
  );
}
