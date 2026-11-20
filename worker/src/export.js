// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// FEATURE-EXPORT-1: reuse formats. Citation export (BibTeX, RIS, CSL-JSON), an embeddable card with oEmbed, and an OpenAPI description.
// Pure functions of the catalogue; every endpoint listed in OPENAPI is probed by test/export.test.js, so the description cannot drift from the routes.
import { esc } from './kit/index.js';

const SITE = 'Practical Solutions';
const year = (now = new Date()) => String(now.getUTCFullYear());
const iso = (now = new Date()) => now.toISOString().slice(0, 10);
const bibEsc = s => String(s).replace(/[{}\\]/g, m => '\\' + m).replace(/%/g, '\\%');
const note = e => e.kind === 'solution' ? `Evidence label: ${e.label}. Keep the label and limits when quoting.` : 'Gap to target from public indicator data.';

// e: { kind: 'solution'|'problem', id, title, label?, path } ; o: origin
export const entryOf = (kind, x) => ({ kind, id: x.id, title: x.title, label: x.label, path: (kind === 'solution' ? '/solutions/' : '/problems/') + x.id });

export function bibtex(e, o, now) {
  return `@misc{ps-${e.kind}-${e.id},\n  title = {${bibEsc(e.title)}},\n  author = {{${SITE}}},\n  year = {${year(now)}},\n  url = {${o}${e.path}},\n  urldate = {${iso(now)}},\n  note = {${bibEsc(note(e))}}\n}\n`;
}
export function ris(e, o, now) {
  return ['TY  - ELEC', `TI  - ${e.title}`, `AU  - ${SITE}`, `PY  - ${year(now)}`, `UR  - ${o}${e.path}`, `Y2  - ${iso(now).replace(/-/g, '/')}`, `N1  - ${note(e)}`, 'ER  - ', ''].join('\r\n');
}
export function csl(e, o, now) {
  const d = now || new Date();
  return { id: `ps-${e.kind}-${e.id}`, type: 'webpage', title: e.title, author: [{ literal: SITE }], 'container-title': SITE, URL: o + e.path, issued: { 'date-parts': [[d.getUTCFullYear()]] }, accessed: { 'date-parts': [[d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()]] }, note: note(e) };
}

// Embeddable card: one self-contained page for an iframe. The label and the main limit always travel with the claim.
export const EMBED_CSP = "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors *; base-uri 'none'";
export function embedPage(s, o) {
  const url = o + '/solutions/' + s.id;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><meta name="color-scheme" content="light dark"><title>${esc(s.title)} | ${SITE}</title>
<style>body{margin:0;padding:1rem;font:16px/1.5 system-ui,sans-serif;background:Canvas;color:CanvasText}h1{font-size:1.1rem;margin:0 0 .5rem}.b{display:inline-block;border:1px solid currentColor;border-radius:99px;padding:.1rem .6rem;font-size:.875rem;margin:0 .5rem .5rem 0}p{margin:.5rem 0}.m{font-size:.875rem;opacity:.85}a{color:LinkText;min-height:44px;display:inline-block;padding:.5rem 0}</style></head><body>
<h1>${esc(s.title)}</h1><span class="b">${esc(s.label)}</span>${s.impl ? `<span class="b">${esc(s.impl.band)}</span>` : ''}
<p>${esc(s.claim)}</p><p class="m"><b>Main limit:</b> ${esc(s.limits)}</p><a href="${esc(url)}" target="_top" rel="noopener">Read the full entry with its sources</a><p class="m">From ${SITE}, an evidence-based encyclopedia. Reuse keeps the label and the limit.</p></body></html>`;
}
export const embedSnippet = (s, o) => `<iframe src="${o}/embed/solutions/${s.id}" title="${esc(s.title)}" width="480" height="340" loading="lazy" style="border:1px solid #ccc;max-width:100%"></iframe>`;

export function oembed(s, o) {
  return { version: '1.0', type: 'rich', provider_name: SITE, provider_url: o, title: s.title, width: 480, height: 340, html: embedSnippet(s, o), cache_age: 86400 };
}

// OpenAPI 3.1: every path below is requested against the real router in test/export.test.js.
const idParam = (n, d) => ({ name: n, in: 'path', required: true, description: d, schema: { type: 'string' } });
const ok = (d, type = 'application/json') => ({ '200': { description: d, content: { [type]: {} } }, '404': { description: 'Not found' } });
export const OPENAPI_PATHS = {
  '/index.json': { get: { operationId: 'getCatalogue', summary: 'The whole catalogue', responses: ok('Problems, solutions, labels, sources') } },
  '/solutions.csv': { get: { operationId: 'getSolutionsCsv', summary: 'One row per solution', responses: ok('CSV', 'text/csv') } },
  '/problems.csv': { get: { operationId: 'getProblemsCsv', summary: 'One row per problem', responses: ok('CSV', 'text/csv') } },
  '/catalogue.csv': { get: { operationId: 'getCatalogueCsv', summary: 'One row per catalogued indicator', responses: ok('CSV', 'text/csv') } },
  '/solutions/{id}.json': { get: { operationId: 'getSolution', summary: 'One solution', parameters: [idParam('id', 'Solution id')], responses: ok('Solution with sources') } },
  '/solutions/{id}.bib': { get: { operationId: 'getSolutionBibtex', summary: 'BibTeX citation', parameters: [idParam('id', 'Solution id')], responses: ok('BibTeX', 'application/x-bibtex') } },
  '/solutions/{id}.ris': { get: { operationId: 'getSolutionRis', summary: 'RIS citation', parameters: [idParam('id', 'Solution id')], responses: ok('RIS', 'application/x-research-info-systems') } },
  '/solutions/{id}.csl.json': { get: { operationId: 'getSolutionCsl', summary: 'CSL-JSON citation', parameters: [idParam('id', 'Solution id')], responses: ok('CSL-JSON') } },
  '/problems/{id}.json': { get: { operationId: 'getProblem', summary: 'One problem', parameters: [idParam('id', 'Problem id')], responses: ok('Problem with gap and solutions') } },
  '/problems/{id}.bib': { get: { operationId: 'getProblemBibtex', summary: 'BibTeX citation', parameters: [idParam('id', 'Problem id')], responses: ok('BibTeX', 'application/x-bibtex') } },
  '/problems/{id}.ris': { get: { operationId: 'getProblemRis', summary: 'RIS citation', parameters: [idParam('id', 'Problem id')], responses: ok('RIS', 'application/x-research-info-systems') } },
  '/embed/solutions/{id}': { get: { operationId: 'embedSolution', summary: 'Embeddable card for an iframe', parameters: [idParam('id', 'Solution id')], responses: ok('HTML', 'text/html') } },
  '/oembed': { get: { operationId: 'oembed', summary: 'oEmbed for a solution URL', parameters: [{ name: 'url', in: 'query', required: true, schema: { type: 'string' } }], responses: ok('oEmbed rich') } },
  '/search.json': { get: { operationId: 'search', summary: 'Search', parameters: [{ name: 'q', in: 'query', schema: { type: 'string' } }], responses: ok('Results') } },
  '/catalogue.json': { get: { operationId: 'getCatalogueIndicators', summary: 'Catalogued indicators', responses: ok('Indicators') } },
  '/datapackage.json': { get: { operationId: 'getDatapackage', summary: 'Frictionless data package for the CSV files', responses: ok('Data package') } },
  '/releases.json': { get: { operationId: 'getReleases', summary: 'Dated releases', responses: ok('Releases') } },
};
export const openapi = o => ({ openapi: '3.1.0', info: { title: SITE + ' data', version: '1', description: 'Read-only, no key. Keep each solution\'s label and limits when reusing a claim.' }, servers: [{ url: o }], paths: OPENAPI_PATHS });

export function datasetLd(o) {
  const d = (path, type) => ({ '@type': 'DataDownload', encodingFormat: type, contentUrl: o + path });
  return { '@context': 'https://schema.org', '@type': 'Dataset', name: SITE + ' catalogue', description: 'Practical solutions to pressing problems, each with an evidence label, sources, implementability and limits.', url: o + '/api', isAccessibleForFree: true, license: o + '/about', distribution: [d('/index.json', 'application/json'), d('/solutions.csv', 'text/csv'), d('/problems.csv', 'text/csv'), d('/catalogue.csv', 'text/csv')] };
}
