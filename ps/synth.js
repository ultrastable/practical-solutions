// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// Synthetic world with planted truth, used to test that the detector finds what is really there and to drive the loop offline.
// Planted units have a persistent practice effect. Flukes get a one-time lucky draw in epoch 0 only, so a good loop must
// score some of its own early predictions as misses (regression to the mean) and say so.
import { rng, normal } from './linalg.js';

export const CONTEXT = ['income', 'density', 'age'];
export const PRACTICES = ['p_outreach', 'p_training', 'p_supply', 'p_noise'];

export function synthWorld({ n = 80, seed = 11, epoch = 0, planted = 3, flukes = 2, effect = 2.2 } = {}) {
  const r = rng(seed), rEpoch = rng(seed * 1000 + epoch + 1);
  const units = [];
  for (let i = 0; i < n; i++) {
    const context = { income: normal(r), density: normal(r), age: normal(r) };
    const isPlanted = i < planted, isFluke = i >= planted && i < planted + flukes;
    const practices = { p_outreach: normal(r) + (isPlanted ? 2.5 : 0), p_training: normal(r), p_supply: normal(r), p_noise: normal(r) };
    let outcome = 10 + 1.5 * context.income - 0.8 * context.density + 0.5 * context.age + 0.4 * normal(rEpoch);
    if (isPlanted) outcome += effect;
    if (isFluke && epoch === 0) outcome += effect;
    units.push({ id: `u${String(i).padStart(3, '0')}`, name: `Unit ${i}`, outcome, context, practices });
  }
  return { units, contextKeys: CONTEXT, practiceKeys: PRACTICES, higherIsBetter: true, planted: units.slice(0, planted).map(u => u.id), flukes: units.slice(planted, planted + flukes).map(u => u.id) };
}
