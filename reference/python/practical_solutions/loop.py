"""Continuous cycles: run, measure, correct, append to an auditable ledger."""
from __future__ import annotations

import json
import time
from pathlib import Path

from .criticality import second_loop
from .data import Dataset
from .detect import Config, detect


def truth_metrics(ds: Dataset, survivors) -> dict | None:
    if not ds.truth:
        return None
    s = set(survivors)
    p = ds.truth["planted"]
    tp = len(s & p)
    return {"planted": len(p), "found": tp,
            "recall": tp / len(p) if p else None,
            "precision": tp / len(s) if s else None,
            "decoys_flagged": len(s & ds.truth["decoys"]),
            "artefacts_flagged": len(s & ds.truth["artefacts"])}


def run_cycle(ds: Dataset, cycle: int, seed: int, base: Config = Config(), null_ceiling=0.5) -> dict:
    cfg, ev, actions, state, archive = second_loop(ds, base, null_ceiling, seed=seed)
    res = detect(ds, cfg, seed)
    return {
        "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "cycle": cycle, "seed": seed,
        "data_sha256": ds.sha256(), "config_hash": cfg.hash(),
        "config": cfg.__dict__, "state": state, "essential": ev, "actions": actions,
        "settings_evaluated": len(archive), "funnel": res["funnel"],
        "survivors": [{"unit": ds.unit_ids[i], "rbar": float(res["rbar"][i]), "zA": float(res["zA"][i]),
                       "zB": float(res["zB"][i]), "persist": float(res["persist"][i])} for i in res["survivors"]],
        "truth": truth_metrics(ds, res["survivors"]),
    }


def run_cycles(make_dataset, cycles: int, ledger: str | Path, seed: int = 0, **kw) -> list[dict]:
    path = Path(ledger)
    path.parent.mkdir(parents=True, exist_ok=True)
    out = []
    with path.open("a", encoding="utf-8") as f:
        for c in range(cycles):
            rec = run_cycle(make_dataset(seed + c), c, seed + c, **kw)
            f.write(json.dumps(rec) + "\n")
            f.flush()
            out.append(rec)
    return out
