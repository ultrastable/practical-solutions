// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// The charter, read by code (briefs and the model prompt). The unit of output is a SOLUTION: an implementable intervention, practice,
// policy, mechanism or design that someone could adopt against a pressing problem. Places, programs and organizations are the evidence
// a solution works beyond what its setting predicts; they are the medium, never the message.
export const CHARTER = {
  purpose: 'Find practical, implementable solutions to pressing problems, and say what it takes to adopt each one.',
  unit: 'solution',
  evidence: 'Cases that do much better than their context predicts are evidence about which solutions work; they are not the subject.',
  every_brief_states: ['the problem', 'the candidate solution', 'the evidence', 'who could implement it and what it takes', 'the cheapest first test', 'what the data cannot show'],
  not: ['a ranking of countries, clinics or other places', 'a health-only tool', 'a claim of causation from observational data'],
};

export const STANCE = 'You help people decide what to implement. Write for a program officer at a foundation. Name the solution first, then the adoption path.';
