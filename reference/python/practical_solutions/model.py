"""Expected performance from context only, cross-fitted so no unit sits in its own baseline."""
import numpy as np


def features(X: np.ndarray) -> np.ndarray:
    Z = (X - X.mean(0)) / (X.std(0) + 1e-9)
    return np.hstack([np.ones((len(Z), 1)), Z, Z ** 2])


def fit(F, y, ridge=1.0, trim=0.1, iters=3):
    """Ridge fit that repeatedly drops the extreme residual tails, so deviants cannot drag the baseline."""
    keep = np.ones(len(y), bool)
    pen = ridge * np.eye(F.shape[1])
    pen[0, 0] = 0.0
    beta = np.zeros(F.shape[1])
    for _ in range(iters):
        A = F[keep]
        beta = np.linalg.solve(A.T @ A + pen, A.T @ y[keep])
        r = y - F @ beta
        lo, hi = np.quantile(r, [trim, 1 - trim])
        keep = (r >= lo) & (r <= hi)
    return beta


def expected_crossfit(X, y, folds=5, seed=0, consensus=1, ridge=1.0, trim=0.1):
    F = features(X)
    n = len(y)
    acc = np.zeros(n)
    for s in range(consensus):
        rng = np.random.default_rng([seed, s])
        idx = rng.permutation(n)
        out = np.empty(n)
        for k in range(folds):
            te = idx[k::folds]
            tr = np.setdiff1d(idx, te)
            out[te] = F[te] @ fit(F[tr], y[tr], ridge, trim)
        acc += out
    return acc / consensus
