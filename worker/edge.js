// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// tenant-ps-edge: the front of Practical Solutions on the ultrastable.org zone (FAMILY-1). The zone sits in a different Cloudflare account
// from tenant-ps-web, so this tiny Worker forwards to it. ultrastable.org is the home; www and solutions. redirect to it.
// Prior state (rollback): the same Worker answered solutions.ultrastable.org only, forwarding without redirects; apex and www had no route.
const ORIGIN = 'https://tenant-ps-web.ultrastable.workers.dev', HOME = 'ultrastable.org';
export default {
  async fetch(request) {
    const u = new URL(request.url);
    if (u.hostname !== HOME) return Response.redirect('https://' + HOME + u.pathname + u.search, 301);
    const headers = new Headers(request.headers);
    headers.set('x-forwarded-host', u.host); headers.delete('host');
    return fetch(new Request(new URL(u.pathname + u.search, ORIGIN), { method: request.method, headers, body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body, redirect: 'manual' }));
  },
};
