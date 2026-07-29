// Browser download helpers and JSON config export/import.

import { hydrate } from '../lib/store.js';

export function download(filename, data, mime) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick so Safari has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportJSON(formState) {
  return JSON.stringify({ ...formState, _format: 'ithaca-builder', _version: 1 }, null, 2);
}

export function jsonFilename(formState) {
  const slug = String(formState.name || 'untitled').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `${slug}-${formState.startDate}.json`;
}

/** Parse an imported config. Throws with a readable message on bad input. */
export function importJSON(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('That file is not a config object.');
  if (parsed._format && parsed._format !== 'ithaca-builder') {
    throw new Error('That JSON was not exported from this builder.');
  }
  if (!parsed.startDate) throw new Error('That config has no start date.');
  // hydrate() fills in anything the saved file predates.
  return hydrate(parsed);
}
