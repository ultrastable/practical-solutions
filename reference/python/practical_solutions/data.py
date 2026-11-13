"""Datasets: a panel of units x periods with context covariates, plus a synthetic generator with planted truth."""
from __future__ import annotations

import csv
import hashlib
from dataclasses import dataclass, field

import numpy as np


@dataclass
class Dataset:
    unit_ids: list
    X: np.ndarray          # (n, k) context, fixed per unit
    Y: np.ndarray          # (n, T) outcome per period, higher is better
    ctx_names: list = field(default_factory=list)
    truth: dict | None = None   # synthetic only: {"planted": set, "decoys": set, "artefacts": set}

    def sha256(self) -> str:
        h = hashlib.sha256()
        h.update(np.ascontiguousarray(self.X, dtype=np.float64).tobytes())
        h.update(np.ascontiguousarray(self.Y, dtype=np.float64).tobytes())
        h.update("|".join(map(str, self.unit_ids)).encode())
        return h.hexdigest()

    @property
    def n(self) -> int:
        return self.Y.shape[0]

    @property
    def T(self) -> int:
        return self.Y.shape[1]


def synthetic(n_units=400, n_periods=5, n_ctx=6, n_planted=12, n_decoys=12, n_artefacts=5,
              effect=2.0, noise=1.0, seed=0) -> Dataset:
    """Planted persistent bright spots, one-period decoys, and clipped-outcome artefacts."""
    rng = np.random.default_rng(seed)
    X = rng.normal(size=(n_units, n_ctx))
    beta = rng.normal(size=n_ctx)
    base = X @ beta + 0.5 * X[:, 0] ** 2 + rng.normal(scale=0.5, size=n_units)
    Y = base[:, None] + rng.normal(scale=noise, size=(n_units, n_periods))
    order = rng.permutation(n_units)
    planted = set(order[:n_planted].tolist())
    decoys = set(order[n_planted:n_planted + n_decoys].tolist())
    artefacts = set(order[n_planted + n_decoys:n_planted + n_decoys + n_artefacts].tolist())
    for i in planted:
        Y[i] += effect
    for i in decoys:
        Y[i, rng.integers(n_periods)] += 8 * noise
    ceiling = Y.max()
    for i in artefacts:
        Y[i, :] = ceiling
    return Dataset([f"u{i}" for i in range(n_units)], X, Y, [f"c{j}" for j in range(n_ctx)],
                   {"planted": planted, "decoys": decoys, "artefacts": artefacts})


def load_csv(path, unit, period, outcome, ctx) -> Dataset:
    """Long-format CSV -> balanced panel. Units missing any period are dropped (counted by caller via n)."""
    with open(path, newline="", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
    periods = sorted({r[period] for r in rows})
    by_unit: dict = {}
    for r in rows:
        try:
            y = float(r[outcome])
            c = [float(r[k]) for k in ctx]
        except (ValueError, KeyError):
            continue
        if not (np.isfinite(y) and all(np.isfinite(c))):
            continue
        d = by_unit.setdefault(r[unit], {"c": [], "y": {}})
        d["c"].append(c)
        d["y"][r[period]] = y
    ids, X, Y = [], [], []
    for u, d in by_unit.items():
        if len(d["y"]) == len(periods):
            ids.append(u)
            X.append(np.mean(d["c"], axis=0))
            Y.append([d["y"][p] for p in periods])
    return Dataset(ids, np.array(X), np.array(Y), list(ctx))
