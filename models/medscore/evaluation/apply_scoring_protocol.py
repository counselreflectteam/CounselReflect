"""
Apply MedScore paper scoring protocol for Table 4 reproduction.

Exclude 0-claim responses before averaging.
factuality_pct = 100 * mean(response_scores) over responses where n_claims > 0
"""
from typing import List, Dict, Any


def verifications_to_by_id(verifications: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    """Group verifications by response id."""
    by_id: Dict[str, List[Dict[str, Any]]] = {}
    for v in verifications:
        vid = v.get("id")
        if vid is not None:
            if vid not in by_id:
                by_id[vid] = []
            by_id[vid].append(v)
    return by_id


def compute_factuality(verifications_by_id: Dict[str, List[Dict[str, Any]]]) -> float:
    """
    Compute factuality percentage per paper protocol.
    Excludes responses with 0 claims.
    """
    response_scores = []
    for vid, claims in verifications_by_id.items():
        scores = [c.get("score") for c in claims if "score" in c and c["score"] is not None]
        if not scores:
            continue
        try:
            avg = sum(float(s) for s in scores) / len(scores)
            response_scores.append(avg)
        except (TypeError, ValueError):
            continue
    if not response_scores:
        return 0.0
    return 100.0 * (sum(response_scores) / len(response_scores))
