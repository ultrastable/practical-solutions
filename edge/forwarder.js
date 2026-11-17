// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// Edge forwarder for the public-benefit domain. The ultrastable.org zone lives in a different Cloudflare account from the tenant Worker, and a
// Worker custom domain must be in the zone's account, so this tiny Worker is bound to solutions.ultrastable.org there and forwards plain HTTP
// to the tenant Worker. It holds no bindings, no secrets and no state. The tenant trusts only the one forwarded host named below.
export const ORIGIN = 'https://tenant-ps-web.ultrastable.workers.dev';
export const HOST = 'solutions.ultrastable.org';

export default {
  async fetch(request) {
    const u = new URL(request.url);
    const target = new URL(u.pathname + u.search, ORIGIN);
    const headers = new Headers(request.headers);
    headers.set('x-forwarded-host', u.host);
    headers.delete('host');
    return fetch(new Request(target, { method: request.method, headers, body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body, redirect: 'manual' }));
  },
};
