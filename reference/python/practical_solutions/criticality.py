"""Autonomous criticality, defined operationally.

Edge = the loosest funnel settings at which negative-control false flags stay under a ceiling.
Ultrastable loop = measure essential variables (null flags, stability, yield); when one leaves its
bounds, a second loop changes the system (consensus averaging, re-tuning) and the change is archived.
"""
from __future__ import annotations

from dataclasses import replace

from .data import Dataset
from .detect import Config, detect
from .guard import null_flags

ALPHAS = (0.2, 0.1, 0.05, 0.02, 0.01)
PEER_ZS = (0.5, 1.0, 1.5)
PERSIST_ZS = (1.5, 2.0, 2.5, 3.0)


def jaccard(a, b) -> float:
    a, b = set(a), set(b)
    return 1.0 if not a and not b else len(a & b) / len(a | b)


def tune_to_edge(ds: Dataset, base: Config, null_ceiling: float = 0.5, n_null: int = 8, seed: int = 0):
    """Return (best_config, archive). Archive holds every evaluated setting with its measured outcome."""
    archive, best = [], None
    for a in ALPHAS:
        for pz in PEER_ZS:
            for qz in PERSIST_ZS:
                cfg = replace(base, alpha=a, peer_z=pz, persist_z=qz)
                n_real = len(detect(ds, cfg, seed)["survivors"])
                nf = null_flags(ds, cfg, n_null, seed)
                row = {"config": cfg, "real": n_real, "null": nf, "ok": nf <= null_ceiling}
                archive.append(row)
                if row["ok"] and (best is None or n_real > best["real"]):
                    best = row
    if best is None:  # nothing passes: strictest corner, reported as such
        best = min(archive, key=lambda r: r["null"])
    return best["config"], archive


def essential_variables(ds, cfg, null_ceiling, seed, n_null=8):
    r0 = detect(ds, cfg, seed)
    r1 = detect(ds, cfg, seed + 1)
    return {
        "null_flags": null_flags(ds, cfg, n_null, seed),
        "stability": jaccard(r0["survivors"], r1["survivors"]),
        "yield": len(r0["survivors"]),
        "null_ceiling": null_ceiling,
    }


def second_loop(ds: Dataset, base: Config, null_ceiling=0.5, stability_floor=0.6, seed=0, max_rounds=3):
    """Tune, check essential variables, change the system when they are out of bounds."""
    cfg, archive = tune_to_edge(ds, base, null_ceiling, seed=seed)
    actions = []
    ev = essential_variables(ds, cfg, null_ceiling, seed)
    rounds = 0
    while ev["stability"] < stability_floor and ev["yield"] > 0 and rounds < max_rounds and cfg.consensus < 8:
        cfg = replace(cfg, consensus=cfg.consensus * 2)
        actions.append({"trigger": "stability_below_floor", "set": {"consensus": cfg.consensus}})
        cfg, archive_more = tune_to_edge(ds, cfg, null_ceiling, seed=seed)
        archive += archive_more
        ev = essential_variables(ds, cfg, null_ceiling, seed)
        rounds += 1
    state = ("no_signal" if ev["yield"] == 0 else
             "unstable" if ev["stability"] < stability_floor else
             "over_ceiling" if ev["null_flags"] > null_ceiling else "in_bounds")
    return cfg, ev, actions, state, archive
