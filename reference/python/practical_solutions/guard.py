"""Negative control: resample pure-noise worlds from the bulk and count what the funnel still flags."""
import numpy as np

from .data import Dataset
from .detect import Config, detect
from .model import expected_crossfit


def null_world(ds: Dataset, cfg: Config, rng, seed: int) -> Dataset:
    ybar = ds.Y.mean(1)
    exp = expected_crossfit(ds.X, ybar, cfg.folds, seed, cfg.consensus, cfg.ridge, cfg.trim)
    R = ds.Y - exp[:, None]
    rbar = R.mean(1)
    med = np.median(rbar)
    mad = 1.4826 * np.median(np.abs(rbar - med))
    bulk = np.nonzero(np.abs(rbar - med) < 2 * mad)[0]          # residual vectors with no signal
    draw = rng.choice(bulk, size=ds.n, replace=True)
    R0 = R[draw].copy()
    # adversary: one-period spikes on 5% of units, sized so the unit mean alone clears the FDR gate
    # (3 robust sds of the mean residual). Only persistence can reject them; any flag here is false by construction.
    rb = R0.mean(1)
    scale = 1.4826 * np.median(np.abs(rb - np.median(rb)))
    for i in rng.choice(ds.n, size=max(1, ds.n // 20), replace=False):
        R0[i, rng.integers(ds.T)] += 3.0 * scale * ds.T
    return Dataset(ds.unit_ids, ds.X, exp[:, None] + R0, ds.ctx_names)


def null_flags(ds: Dataset, cfg: Config, n_null: int = 10, seed: int = 0) -> float:
    rng = np.random.default_rng([seed, 99])
    counts = [len(detect(null_world(ds, cfg, rng, seed + i), cfg, seed + i)["survivors"]) for i in range(n_null)]
    return float(np.mean(counts))
