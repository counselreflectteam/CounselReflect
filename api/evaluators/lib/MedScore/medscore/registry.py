"""
Registry

Component builder for MedScore, using the 'registrable' package.

Provenance:
    Adapted from ``medscore/registry.py`` in the MedScore reference implementation
    (https://github.com/Heyuan9/MedScore, upstream commit 9e3a771, MIT License).
    Copyright (c) Heyuan Huang, Alexandra DeLucia, Vijay Murari Tiyyala, Mark Dredze.

    Modifications for CounselReflect:
      - ``build_component`` accepts an optional ``provider`` (a CounselReflect LLMProvider) and
        injects it into the component's constructor arguments.

References:
    Huang, H., DeLucia, A., Tiyyala, V. M., & Dredze, M. (2026). MedScore: Generalizable
    Factuality Evaluation of Open-ended Long-form Medical Answers by Domain-adapted Claim
    Decomposition and Verification. In Findings of the Association for Computational
    Linguistics: ACL 2026. https://aclanthology.org/2026.findings-acl.693/
    (arXiv preprint: https://arxiv.org/abs/2505.18452)

    MedScore reference implementation (MIT License):
    https://github.com/Heyuan9/MedScore
"""

from typing import Any, Optional
from pydantic import BaseModel, SecretStr

from .decomposer import Decomposer
from .verifier import Verifier


def build_component(config: BaseModel, component_type: str, provider=None) -> Any:
    """
    Builds a decomposer or verifier using its Registrable base class.

    Args:
        config: A Pydantic model instance from the config schema.
        component_type: The type of component to build ('decomposer' or 'verifier').
        provider: Optional LLMProvider instance to inject into the component.

    Returns:
        An instantiated component object.
    """
    component_name = config.type

    # Choose the correct base class (Decomposer or Verifier)
    if component_type == "decomposer":
        BaseClass = Decomposer
    elif component_type == "verifier":
        BaseClass = Verifier
    else:
        raise ValueError(f"Unknown component type: {component_type}")

    # Use .by_name() from the registrable package to get the correct subclass
    try:
        ComponentClass = BaseClass.by_name(component_name)
    except KeyError:
        raise ValueError(
            f"'{component_name}' is not a registered {component_type}. "
            f"Available: {BaseClass.list_available()}"
        )

    # Convert the Pydantic model to a dictionary for instantiation.
    # We also need to unwrap the SecretStr for the API key.
    init_params = config.model_dump()
    if 'api_key' in init_params and isinstance(init_params['api_key'], SecretStr):
        init_params['api_key'] = init_params['api_key'].get_secret_value()
    
    # Inject provider if provided
    if provider is not None:
        init_params['provider'] = provider

    return ComponentClass(**init_params)
