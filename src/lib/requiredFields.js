// Fehlende Pflichtangaben: schwebende Info, Sprung zum obersten Feld und Cursor hinein.
// Die Anzeige selbst liegt in FloatingNotice.svelte (einmal im Hauptlayout).
import { writable } from 'svelte/store';

export const NOTICE_SECONDS = 5;
const MAX_NAMED_FIELDS = 4;

export const floatingNotice = writable(null);   // { id, text }

let timer;
let nextId = 0;

// Lange genug sichtbar, dass man sie auch noch sieht, während die Seite nach oben fährt
export function showNotice(text) {
    clearTimeout(timer);
    floatingNotice.set({ id: ++nextId, text });
    timer = setTimeout(closeNotice, NOTICE_SECONDS * 1000);
}

export function closeNotice() {
    clearTimeout(timer);
    floatingNotice.set(null);
}

// "Artikelbezeichnung *" -> "Artikelbezeichnung"; bei mehrzeiligen Beschriftungen zählt die erste Zeile
export function cleanFieldLabel(text) {
    return String(text ?? '').split('\n')[0].replace(/\*/g, '').replace(/(\.\.\.|…|:)\s*$/, '').trim().slice(0, 40);
}

export function missingFieldsMessage(labels) {
    const names = [...new Set(labels.filter(Boolean))];
    if (names.length === 0) return 'Bitte alle Pflichtfelder ausfüllen.';
    const shown = names.slice(0, MAX_NAMED_FIELDS);
    const others = names.length - shown.length;
    if (others > 0) return `Bitte noch ausfüllen: ${shown.join(', ')} und ${others} ${others === 1 ? 'weiteres Feld' : 'weitere Felder'}`;
    if (shown.length === 1) return `Bitte noch ausfüllen: ${shown[0]}`;
    return `Bitte noch ausfüllen: ${shown.slice(0, -1).join(', ')} und ${shown[shown.length - 1]}`;
}

// Das Eingabefeld selbst: el oder das Feld in einem Rahmen (z.B. um ein Auswahlfeld)
const controlOf = (el) => (el.matches('input, select, textarea') ? el : el.querySelector('input, select, textarea'));

function fieldLabel(el) {
    const control = controlOf(el);
    const placeholder = control?.placeholder && !/^z\.\s?b\./i.test(control.placeholder) ? control.placeholder : '';
    return cleanFieldLabel(el.dataset.label || control?.labels?.[0]?.innerText || control?.getAttribute('aria-label') || placeholder);
}

function goToField(el) {
    const target = controlOf(el) || el;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
    target.focus({ preventScroll: true });
}

// fields: die fehlenden Felder in der Reihenfolge des Formulars
export function reportMissingFields(fields) {
    if (fields.length === 0) return;
    showNotice(missingFieldsMessage(fields.map(fieldLabel)));
    goToField(fields[0]);
}
