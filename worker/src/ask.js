// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// ASK-1 (tenant side): the /ask page and /api/ask. Retrieval, answer checking, rate limit and budget are core/ask; this file supplies the index, the
// model port (Workers AI when the Worker has the AI binding, none otherwise) and the page. Script-free: a plain GET form works with no JavaScript.
import * as ui from './kit/index.js';
import { answer, chatPort, allow, callerId } from '../../vendor/ultrastable/core/ask/index.js';
import { ASK_INDEX } from './ask-index.gen.js';
import { SHELL, SITE } from './pages.js';

const { esc } = ui;
export const ASK_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
export const LIMITS = { perMinute: 6, perDay: 150 };   // model calls per caller per minute, and per day for the whole site (free-tier budget)
export const EXAMPLES = ['Which solutions cut child deaths and what do they cost?', 'What works against malaria?', 'Which problems are getting worse and have no solution yet?', 'How do I start a clean water project in a village?'];
export const generatorFor = env => (env && env.AI && env.AI.run ? chatPort(env.AI, env.ASK_MODEL || ASK_MODEL) : undefined);

export async function run(question, { env, request, lang = 'en', index = ASK_INDEX, generate = generatorFor(env), limits = LIMITS }) {
  // SMOKE-LIVE-1: production /api/ask answered with a bare 500 when the budget store or the model threw. Retrieval is local and always works, so a failing
  // store or model degrades to the cited sources without a written answer instead of failing the request.
  let gate;
  try { gate = await allow(env && env.STATE, { caller: await callerId(request), ...limits }); } catch { gate = { ok: true, model: false }; }
  if (!gate.ok) return { ok: false, error: 'rate_limited' };
  try { return await answer(question, { index, generate: gate.model ? generate : undefined, lang, defaultLang: 'en' }); }
  catch { return answer(question, { index, generate: undefined, lang, defaultLang: 'en' }); }
}

const cite = (text, n) => esc(text).replace(/\[(\d{1,2})\]/g, (m, i) => Number(i) <= n ? `<a href="#src-${i}">[${i}]</a>` : m);
export function askPage(q, r, o, lang = 'en') {
  const form = `<form class="facets" action="/ask" method="get" role="search" aria-label="Ask"><div><label for="ask-q">Your question</label><input id="ask-q" type="search" name="q" value="${esc(q)}" maxlength="300" autocomplete="off"></div><button type="submit">Ask</button></form>`;
  let result = '';
  if (r && r.ok === false) result = ui.callout({ tone: 'warn', title: 'Too many questions', body: '<p>Please wait a minute and ask again. You can also <a href="/search">search the site</a>.</p>' });
  else if (r && r.mode === 'none') result = ui.callout({ tone: 'warn', title: 'Not found on this site', body: '<p>No page here answers that, so no answer is given. Try other words, <a href="/search">search</a>, or <a href="/catalogue">browse the problem catalogue</a>. If it is a real gap, it is a problem we have not covered yet.</p>' });
  else if (r) {
    const src = ui.list(r.sources.map(s => `<span id="src-${s.n}">[${s.n}] <a href="${esc(s.url)}">${esc(s.title)}</a> ${ui.badge(s.type)}</span>`));
    result = r.mode === 'generated'
      ? `<section id="answer" aria-labelledby="answer-h" role="status"><h2 id="answer-h">Answer</h2><p>${cite(r.answer, r.sources.length)}</p>${ui.callout({ tone: 'info', body: '<p>Written by an AI model from the pages listed below only. Sentences it could not tie to a page, or whose numbers are not on that page, are removed. It can still be wrong: check the sources.</p>' })}</section><section id="sources" aria-labelledby="sources-h"><h2 id="sources-h">Sources</h2>${src}</section>`
      : `<section id="answer" aria-labelledby="answer-h" role="status"><h2 id="answer-h">Closest pages</h2><p class="m">No answer was written for this question, so here are the passages that match it best.</p>${ui.list(r.passages.map(p => `<a href="${esc(p.url)}">${esc(p.title)}</a><br><span class="m">${esc(p.quote)}</span>`))}</section><section id="sources" aria-labelledby="sources-h"><h2 id="sources-h">All matches</h2>${src}</section>`;
  }
  const hints = q ? '' : `<section id="examples" aria-labelledby="examples-h"><h2 id="examples-h">Try asking</h2>${ui.list(EXAMPLES.map(e => `<a href="/ask?q=${encodeURIComponent(e)}">${esc(e)}</a>`))}</section>`;
  const body = `${ui.breadcrumbs([{ label: 'Home', href: '/' }, { label: 'Ask' }])}<h1>Ask a question</h1><p class="lede">Ask in your own words, in any language. The answer comes only from this site's pages, with links to them. Nothing is guessed: if the site does not cover it, it says so.</p>${form}${result}${hints}`;
  return ui.renderPage(SHELL, { path: '/ask' + (q ? '?q=' + encodeURIComponent(q) : ''), title: `${q ? 'Ask: ' + q : 'Ask a question'} | ${SITE}`, description: 'Ask a question in plain language and get an answer drawn only from this site, with sources.', body, noindex: !!q, hideSearch: false, current: '/ask' }, o);
}

// Returns a Response for /ask and /api/ask, or null.
export async function askRoute(r, u, env, ctx, { origin, lang = 'en', headers }) {
  if (u.pathname !== '/ask' && u.pathname !== '/api/ask') return null;
  const q = (u.searchParams.get('q') || '').slice(0, 300);
  if (u.pathname === '/api/ask') {
    if (!q) return Response.json({ ok: false, error: 'q is required', usage: origin + '/api/ask?q=what+works+against+malaria&lang=en' }, { status: 400, headers: { 'access-control-allow-origin': '*' } });
    const res = await run(q, { env, request: r, lang: u.searchParams.get('lang') || lang });
    return Response.json(res, { status: res.ok === false ? 429 : 200, headers: { 'cache-control': 'no-store', 'access-control-allow-origin': '*' } });
  }
  if (!q) return new Response(askPage('', null, origin, lang), { headers });
  const edge = typeof caches !== 'undefined' ? caches.default : null, ckey = edge && new Request(origin + '/ask?q=' + encodeURIComponent(q) + '&l=' + lang);
  if (edge) { const hit = await edge.match(ckey); if (hit) return hit; }
  const res = await run(q, { env, request: r, lang });
  const resp = new Response(askPage(q, res, origin, lang), { status: res.ok === false ? 429 : 200, headers: { ...headers, 'cache-control': res.ok === false ? 'no-store' : 'public, max-age=3600' } });
  if (edge && res.ok !== false && ctx && ctx.waitUntil) ctx.waitUntil(edge.put(ckey, resp.clone()).catch(() => {}));
  return resp;
}
