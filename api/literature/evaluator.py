"""
Literature-based evaluator using GPT and research-derived rubrics.

This module provides GPT-powered evaluation of therapeutic conversations
using rubrics generated from research literature.
"""

import json
import logging
from pathlib import Path
from typing import List, Dict, Optional
from providers.registry import ProviderRegistry
import concurrent.futures

from schemas import Utterance, EvaluationResult, MetricScore
from utils.evaluation_helpers import create_utterance_result, create_numerical_score, create_categorical_score

logger = logging.getLogger(__name__)


class LiteratureEvaluator:
    """Evaluates conversations using LLM providers and literature-based rubrics."""
    
    def __init__(self, api_key: str, provider: str = "openai", model: str = "gpt-4o"):
        """
        Initialize the evaluator.
        
        Args:
            api_key: API key for the LLM provider
            provider: LLM provider name ('openai', 'gemini', 'claude', 'ollama')
            model: Model to use (default: gpt-4o)
        """
        self.provider = ProviderRegistry.get_provider(provider, api_key)
        self.model = model
        self.rubrics_cache = {}
        self._load_rubrics()
    
    def _load_rubrics(self):
        """Load all rubrics from literature_rubrics.json into cache."""
        try:
            json_path = Path(__file__).parent / "literature_rubrics.json"
            
            if not json_path.exists():
                logger.warning(f"Rubrics file not found at {json_path}")
                return
            
            with open(json_path, 'r', encoding='utf-8') as f:
                rubrics_data = json.load(f)
            
            # Index by metric name for fast lookup
            for metric in rubrics_data:
                self.rubrics_cache[metric['metric_name']] = metric
            
            logger.info(f"Loaded {len(self.rubrics_cache)} rubrics")
        
        except Exception as e:
            logger.error(f"Error loading rubrics: {str(e)}", exc_info=True)
    
    def get_rubric(self, metric_name: str) -> Optional[Dict]:
        """
        Get rubric for a specific metric.
        
        Args:
            metric_name: Name of the metric
            
        Returns:
            Metric dict with rubric, or None if not found
        """
        return self.rubrics_cache.get(metric_name)
    
    def evaluate_utterance(
        self,
        utterance: str,
        metric_name: str,
        rubric: str,
        level_1_description: str,
        level_3_description: str,
        level_5_description: str,
        context: List[str],
        definition: str,
        need_highlight: bool = False
    ) -> Dict[str, any]:
        """
        Evaluate a single therapist utterance using GPT.
        
        Args:
            utterance: The therapist's utterance to evaluate
            metric_name: Name of the metric
            rubric: The formatted rubric string
            context: Previous conversation context (for understanding)
            definition: Brief definition of the metric
            
        Returns:
            {
                "score": float or str,
                "rationale": str,
                "label": Optional[str],
                "scale_type": "numerical"
            }
        """
        try:
            # Build context string
            context_str = "\n".join([
                f"- {msg}" for msg in context[-5:]  # Last 5 messages for context
            ]) if context else "No prior context"
            
            # Build highlight instruction if needed
            highlight_instruction = ""
            if need_highlight:
                highlight_instruction = """\n\n**IMPORTANT - Highlighting Requirements**:
If the score is 4 or 5, you MUST also extract the exact original sentence(s) or phrase(s) from the therapist's utterance that led to this high score. Include this in the "highlighted_text" field. This should be a direct quote from the utterance.
"""

            # Create prompt
            prompt = f"""Evaluate the following therapist utterance using the provided rubric.

**Metric**: {metric_name}

**Definition**: {definition}

**Rubric**:
1: {level_1_description}
2: Between 1 and 3.
3: {level_3_description}
4: Between 3 and 5.
5: {level_5_description}

**Conversation Context** (previous messages):
{context_str}

**Therapist Utterance to Evaluate**:
"{utterance}
{highlight_instruction}

**Task**:

STEP 1 — Applicability Determination  
Before assigning a score, determine whether the clinical construct measured by this metric is contextually relevant and evaluable in this conversation segment.

Use the following decision rule:

• If the construct is NOT activated, required, thematically present, or reasonably expected in this segment — AND the therapist utterance does not attempt to engage it — return -1 (Not Applicable).

STEP 2 — Scoring  
If applicable, assign a score from 1-5 in accordance with the rubric.

Return a JSON object with:
{{
  "score": <number if numerical (or -1 if not applicable)>,
  "rationale": "<brief, evidence-based explanation referencing specific rubric criteria and elements of the utterance>",
  "highlighted_text": "<REQUIRED if score is in the top performance range (e.g., 4 or 5) AND highlighting is enabled: exact quoted text from utterance>"
}}

Be precise, structured, and rubric-grounded in your reasoning."""

            # Call LLM provider
            messages = [
                {
                    "role": "system",
                    "content": "You are an expert psychotherapy evaluator. Provide scores according to the given rubric."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ]
            response_content = self.provider.chat_completion(
                messages=messages,
                model=self.model,
                # temperature=0.3,
                json_mode=True
            )
            # Log raw response for debugging
            
            logger.info(f"Raw LLM response for {metric_name}: {response_content}")
            # Check if response is empty
            if not response_content or not response_content.strip():
                logger.error(f"Empty response from LLM provider for {metric_name}")
                raise ValueError(f"LLM provider returned empty response for {metric_name}")
            
            # Parse response
            try:
                result = json.loads(response_content)
                logger.info(f"GPT evaluation for {metric_name}: {result['score']}")
            except json.JSONDecodeError as je:
                logger.error(f"Failed to parse JSON response for {metric_name}. Response content: {response_content}")
                raise ValueError(f"Invalid JSON response from LLM: {str(je)}. Response: {response_content[:200]}")
            
            logger.debug(f"GPT evaluation for {metric_name}: {result}")
            
            return result
            
        except Exception as e:
            logger.error(f"Error evaluating utterance for {metric_name}: {str(e)}", exc_info=True)
            raise
    
    def _should_evaluate_utterance(self, speaker: str, target: str) -> bool:
        """
        Determine if an utterance should be evaluated based on speaker and target.
        
        Args:
            speaker: The speaker of the utterance (e.g., 'therapist', 'patient')
            target: The target audience for the metric ('therapist', 'patient', or 'both')
            
        Returns:
            True if the utterance should be evaluated
        """
        speaker_lower = speaker.lower()
        therapist_roles = ['therapist', 'assistant', 'counselor', 'helper', 'provider']
        patient_roles = ['patient', 'client', 'seeker', 'user']
        
        is_therapist = any(role in speaker_lower for role in therapist_roles)
        is_patient = any(role in speaker_lower for role in patient_roles)
        
        if target == 'therapist':
            return is_therapist
        elif target == 'patient':
            return is_patient
        elif target == 'both':
            return is_therapist or is_patient
        else:
            # Default to therapist for unknown target values
            return is_therapist

    def evaluate_conversation(
        self,
        conversation: List[Utterance],
        metric_name: str
    ) -> EvaluationResult:
        """
        Evaluate entire conversation for one metric.
        
        Args:
            conversation: List of utterances (parsed conversation)
            metric_name: Name of the metric to evaluate
            
        Returns:
            EvaluationResult with utterance-level scores
        """

        try:
            # Get rubric
            metric_data = self.get_rubric(metric_name)
            if not metric_data:
                raise ValueError(f"Rubric not found for metric: {metric_name}")
            
            rubric = metric_data['rubric']
            level_1_description = metric_data['level_1_description']
            level_3_description = metric_data['level_3_description']
            level_5_description = metric_data['level_5_description']
            definition = metric_data['definition']
            need_highlight = metric_data.get('need_highlight', False)
            target = metric_data.get('target', 'therapist')  # Default to therapist for backward compatibility
            
            # Prepare tasks
            tasks = []
            context: List[str] = []
            
            # Identify which utterances need evaluation and prepare their contexts
            for i, utt in enumerate(conversation):
                # Check target
                if self._should_evaluate_utterance(utt['speaker'], target):
                    # Store task info: (index, utterance_text, context_copy)
                    tasks.append({
                        'index': i,
                        'text': utt['text'],
                        'context': list(context)
                    })
                
                # Update context for next utterance
                context.append(f"{utt['speaker']}: {utt['text']}")

            # Function to be executed in parallel
            def process_utterance(task):
                try:
                    gpt_result = self.evaluate_utterance(
                        utterance=task['text'],
                        metric_name=metric_name,
                        rubric=rubric,
                        level_1_description=level_1_description,
                        level_3_description=level_3_description,
                        level_5_description=level_5_description,
                        context=task['context'],
                        definition=definition,
                        need_highlight=need_highlight
                    )
                    return task['index'], gpt_result
                except Exception as e:
                    logger.error(f"Error evaluating utterance {task['index']}: {e}")
                    raise

            # Execute tasks in parallel
            scores_map = {}
            with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
                future_to_task = {executor.submit(process_utterance, task): task for task in tasks}
                for future in concurrent.futures.as_completed(future_to_task):
                    try:
                        idx, result = future.result()
                        scores_map[idx] = result
                    except Exception as e:
                        logger.error(f"Task failed: {e}")
                        # We might want to continue or raise. Current behavior suggests failing if something goes wrong.
                        raise

            # Assemble results in order
            scores_per_utterance: List[Dict[str, MetricScore]] = []
            reasoning_per_utterance: List[Dict[str, str]] = []
            
            for i in range(len(conversation)):
                if i in scores_map:
                    gpt_result = scores_map[i]
                    
                    # Determine direction from rubric
                    direction = "higher_is_better"
                    if "lower is better" in rubric.lower() or "lower score is better" in rubric.lower():
                        direction = "lower_is_better"

                    metric_score = create_numerical_score(
                        value=float(gpt_result['score']),
                        max_value=5.0,
                        direction=direction,
                        highlighted_text=gpt_result.get('highlighted_text')
                    )
                    
                    scores_per_utterance.append({
                        metric_name: metric_score
                    })
                    
                    # Collect rationale from LLM response
                    rationale = gpt_result.get('rationale', '')
                    reasoning_per_utterance.append(
                        {metric_name: rationale} if rationale else {}
                    )
                else:
                    # Not evaluated (didn't match target)
                    scores_per_utterance.append({})
                    reasoning_per_utterance.append({})
            
            # Create utterance-level result
            result = create_utterance_result(conversation, scores_per_utterance, reasoning_per_utterance)
            
            logger.info(f"Successfully evaluated {metric_name} (target={target}) for conversation with {len(conversation)} utterances")
            
            return result
            
        except Exception as e:
            logger.error(f"Error evaluating conversation for {metric_name}: {str(e)}", exc_info=True)
            raise
