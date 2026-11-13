"""Bright-spot funnel: context-adjusted residual -> FDR -> peer agreement -> persistence -> artefact screen."""
from __future__ import annotations

from dataclasses import dataclass, asdict
from math import erfc, sqrt

import numpy as np

from .data import Dataset
from .model import expected_crossfit


@dataclass(frozen=True)
class Config:
    alpha: float = 0.05        # Benjamini-Hochberg level on the empirical-null p-value
    peer_k: int = 15
    peer_z: float = 1.0        # required robust z against context-matched peers
    persist_z: float = 1.5     # robust z of the mean residual with the best period removed
    folds: int = 5
    consensus: int = 1         # cross-fit repeats averaged into the baseline
    ridge: float = 1.0
    trim: float = 0.1

    def hash(self) -> str:
        import hashlib, json
        return hashlib.sha256(json.dumps(asdict(self), sort_keys=True).encode()).hexdigest()[:12]


def _rz(v):
    med = np.median(v)
    mad = 1.4826 * np.median(np.abs(v - med))
    return (v - med) / (mad + 1e-12)


def bh(p: np.ndarray, q: float) -> np.ndarray:
    n = len(p)
    order = np.argsort(p)
    ok = p[order] <= q * (np.arange(1, n + 1) / n)
    keep = np.zeros(n, bool)
    if ok.any():
        keep[order[: np.max(np.nonzero(ok)[0]) + 1]] = True
    return keep


def screen_artefacts(ds: Dataset) -> np.ndarray:
    """True = clean. Rejects units whose outcome is constant or pinned at the dataset maximum."""
    flat = ds.Y.std(1) < 1e-9
    pinned = (ds.Y >= ds.Y.max() - 1e-9).mean(1) >= 0.5
    return ~(flat | pinned)


def detect(ds: Dataset, cfg: Config = Config(), seed: int = 0) -> dict:
    ybar = ds.Y.mean(1)
    exp = expected_crossfit(ds.X, ybar, cfg.folds, seed, cfg.consensus, cfg.ridge, cfg.trim)
    R = ds.Y - exp[:, None]
    zA = _rz(R.mean(1))
    pA = np.array([0.5 * erfc(z / sqrt(2)) for z in zA])
    # peers: nearest units in standardised context space
    Z = (ds.X - ds.X.mean(0)) / (ds.X.std(0) + 1e-9)
    D = ((Z[:, None, :] - Z[None, :, :]) ** 2).sum(-1)
    np.fill_diagonal(D, np.inf)
    nn = np.argsort(D, axis=1)[:, : cfg.peer_k]
    zB = _rz(ybar - np.median(ybar[nn], axis=1))
    # persistence: drop each unit's single best period; a one-off spike cannot survive that, a sustained edge can
    rest = (R.sum(1) - R.max(1)) / (ds.T - 1) if ds.T >= 3 else R.mean(1)
    persist = _rz(rest)
    s1 = bh(pA, cfg.alpha)
    s2 = s1 & (zB > cfg.peer_z)
    s3 = s2 & (persist > cfg.persist_z)
    s4 = s3 & screen_artefacts(ds)
    return {
        "funnel": {"units": int(ds.n), "fdr": int(s1.sum()), "peer_agree": int(s2.sum()),
                   "persistent": int(s3.sum()), "artefact_clean": int(s4.sum())},
        "survivors": np.nonzero(s4)[0].tolist(),
        "zA": zA, "zB": zB, "persist": persist, "rbar": R.mean(1),
    }
