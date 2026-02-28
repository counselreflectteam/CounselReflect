"""
API Evaluators module.

Import this module to automatically register all evaluators.
"""
from evaluators.base import Evaluator
from evaluators.registry import (
    register_evaluator,
    get_evaluator_class,
    create_evaluator,
    list_available_metrics,
    get_registry
)

from evaluators.impl.talk_type_evaluator import TalkTypeEvaluator
from evaluators.impl.perspective_evaluator import PerspectiveEvaluator
from evaluators.impl.emotion_evaluator import EmotionEvaluator
from evaluators.impl.empathy_ex_evaluator import EmpathyEXEvaluator
from evaluators.impl.empathy_er_evaluator import EmpathyEREvaluator
from evaluators.impl.empathy_ip_evaluator import EmpathyIPEvaluator
try:
    from evaluators.impl.toxicity_evaluator import ToxicityEvaluator
except ImportError as e:
    ToxicityEvaluator = None  # type: ignore[misc, assignment]
    import logging
    logging.getLogger(__name__).debug("ToxicityEvaluator unavailable: %s", e)
from evaluators.impl.pair_evaluator import PAIREvaluator
from evaluators.impl.emotional_support_strategy_evaluator import EmotionalSupportStrategyEvaluator
from evaluators.impl.fact_evaluator import FactEvaluator
from evaluators.impl.medscore_evaluator import MedScoreEvaluator
from evaluators.impl.reccon_evaluator import RecconEvaluator

from evaluators.registry import (
    get_ui_labels,
    get_metrics_by_category,
    get_metric_metadata
)

__all__ = [
    "Evaluator",
    "register_evaluator",
    "get_evaluator_class",
    "create_evaluator",
    "list_available_metrics",
    "get_ui_labels",
    "get_metrics_by_category",
    "get_metric_metadata",
    "get_registry",
]

