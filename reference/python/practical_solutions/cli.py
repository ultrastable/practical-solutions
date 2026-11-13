import argparse
import json

from .data import load_csv, synthetic
from .loop import run_cycles


def main(argv=None):
    ap = argparse.ArgumentParser(prog="practical-solutions")
    sub = ap.add_subparsers(dest="cmd", required=True)
    d = sub.add_parser("demo", help="synthetic world with planted truth")
    d.add_argument("--cycles", type=int, default=3)
    d.add_argument("--ledger", default="runs/demo.jsonl")
    d.add_argument("--seed", type=int, default=0)
    r = sub.add_parser("run", help="long-format CSV panel")
    r.add_argument("csv")
    r.add_argument("--unit", required=True)
    r.add_argument("--period", required=True)
    r.add_argument("--outcome", required=True)
    r.add_argument("--ctx", required=True, help="comma-separated context columns")
    r.add_argument("--ledger", default="runs/run.jsonl")
    r.add_argument("--cycles", type=int, default=1)
    a = ap.parse_args(argv)
    if a.cmd == "demo":
        recs = run_cycles(lambda s: synthetic(seed=s), a.cycles, a.ledger, a.seed)
    else:
        ds = load_csv(a.csv, a.unit, a.period, a.outcome, a.ctx.split(","))
        recs = run_cycles(lambda s: ds, a.cycles, a.ledger, 0)
    for r_ in recs:
        print(json.dumps({k: r_[k] for k in ("cycle", "state", "funnel", "essential", "actions", "truth")}))
    return 0
