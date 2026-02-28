"""
Decomposer
"""
import os
from functools import partial
import asyncio
from typing import List, Any, Optional, Dict
import ast
import logging

import jsonlines
from tqdm import tqdm
import backoff
import requests
import nest_asyncio
from registrable import Registrable

try:
    from openai.types.chat import ChatCompletion
except ImportError:
    # For type hints only, fallback to Any if import fails
    ChatCompletion = Any

from .utils import process_claim, parse_sentences, chunker
from .prompts import MEDSCORE_PROMPT, FACTSCORE_PROMPT, DND_PROMPT

logger = logging.getLogger(__name__)

# Don't apply nest_asyncio at module level - it conflicts with uvicorn
# It will be applied only when needed in specific methods


class Decomposer(Registrable):
    """Base class for all decomposers."""

    def __init__(
            self,
            provider=None,  # LLMProvider instance
            model_name: str = "gpt-4o",
            random_state: int = 42,
            batch_size: int = 32,
            # Legacy params for backward compatibility
            server_path: Optional[str] = None,
            api_key: Optional[str] = None,
            **kwargs,  # To allow for extra params from config
    ):
        self.provider = provider
        self.model_name = model_name
        self.random_state = random_state
        self.batch_size = batch_size
        
        # If no provider given, fall back to AsyncOpenAI (for backward compatibility)
        if self.provider is None:
            from openai import AsyncOpenAI
            api_key = api_key or os.environ.get("OPENAI_API_KEY")
            self.client = AsyncOpenAI(
                base_url=server_path or "https://api.openai.com/v1",
                api_key=api_key,
            )
            self.agent = partial(
                self.client.chat.completions.create,
                model=self.model_name,
                seed=self.random_state,
                temperature=0.0,
                top_p=1.0,
                max_tokens=256
            )
            self.use_legacy_client = True
        else:
            self.use_legacy_client = False

    def __call__(self, decomp_input: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        # Prepare prompt and user input
        messages = []
        for d in decomp_input:
            formatted_input = self.format_input(d['context'], d['sentence'])
            system_prompt = self.get_system_prompt()
            if system_prompt:
                messages.append([
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": formatted_input}
                ])
            else:
                messages.append([
                    {"role": "user", "content": formatted_input}
                ])

        # Get completions
        all_completions = []
        n_iter = (len(messages) + self.batch_size - 1) // self.batch_size
        
        if self.use_legacy_client:
            # Use AsyncOpenAI client - need nest_asyncio for nested event loops
            nest_asyncio.apply()
            for batch in tqdm(chunker(messages, self.batch_size), desc="Decompose", total=n_iter, ncols=80):
                completions = asyncio.run(self.batch_response_legacy(batch))
                all_completions.extend(completions)
        else:
            # Use our provider (synchronous)
            for batch in tqdm(chunker(messages, self.batch_size), desc="Decompose", total=n_iter, ncols=80):
                for msg in batch:
                    try:
                        response = self.provider.chat_completion(
                            messages=msg,
                            model=self.model_name,
                            temperature=0.0,
                            max_tokens=256
                        )
                        # Create a mock completion object for compatibility
                        from types import SimpleNamespace
                        completion = SimpleNamespace(
                            choices=[SimpleNamespace(message=SimpleNamespace(content=response))]
                        )
                        all_completions.append(completion)
                    except Exception as e:
                        logger.error(f"Error in decomposer: {e}")
                        # Create empty response
                        completion = SimpleNamespace(
                            choices=[SimpleNamespace(message=SimpleNamespace(content=""))]
                        )
                        all_completions.append(completion)

        # Format claims
        decompositions = self.format_completions(decomp_input, all_completions)
        return decompositions

    def format_completions(self, decomp_input: List[Dict[str, Any]], completions: List[Any]) -> List[Dict[str, Any]]:
        decompositions = []
        for d_input, completion in zip(decomp_input, completions):
            claim_list = completion.choices[0].message.content.split("\n")
            claim_list = process_claim(claim_list)
            for idx, claim in enumerate(claim_list):
                decomp = {k: v for k, v in d_input.items() if k != "context"}
                decomp["claim"] = claim
                decomp["claim_id"] = idx
                decompositions.append(decomp)
            if not claim_list:
                decomp = {k: v for k, v in d_input.items() if k != "context"}
                decomp["claim"] = None
                decompositions.append(decomp)
        return decompositions

    @backoff.on_exception(
        backoff.expo,
        (requests.exceptions.RequestException, asyncio.TimeoutError),
        max_time=60
    )
    async def batch_response_legacy(self, batch: List[List[Dict[str, str]]]) -> List[Any]:
        """Legacy method for AsyncOpenAI client."""
        async_responses = [
            self.agent(messages=x) for x in batch
        ]
        return await asyncio.gather(*async_responses)

    def format_input(self, context: str, sentence: str) -> str:
        raise NotImplementedError

    def get_system_prompt(self) -> Optional[str]:
        return None


@Decomposer.register("medscore")
class MedScoreDecomposer(Decomposer):
    def get_system_prompt(self) -> str:
        return MEDSCORE_PROMPT

    def format_input(self, context: str, sentence: str) -> str:
        return f"Context: {context}\nPlease breakdown the following sentence into independent facts: {sentence}\nFacts:\n"


@Decomposer.register("custom")
class CustomDecomposer(Decomposer):
    def __init__(
            self,
            prompt_path: str,
            *args,
            **kwargs
    ):
        self.prompt_path = prompt_path
        super().__init__(*args, **kwargs)
        with open(prompt_path) as f:
            self._system_prompt = f.read().strip()

    def get_system_prompt(self) -> str:
        return self._system_prompt

    def format_input(self, context: str, sentence: str) -> str:
        return f"Context: {context}\nPlease breakdown the following sentence into independent facts: {sentence}\nFacts:\n"


@Decomposer.register("factscore")
class FActScoreDecomposer(Decomposer):
    def get_system_prompt(self) -> str:
        return FACTSCORE_PROMPT

    def format_input(self, context: str, sentence: str) -> str:
        return f"Please breakdown the following sentence into independent facts: {sentence}"


@Decomposer.register("dndscore")
class DnDScoreDecomposer(Decomposer):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Override self.agent to match settings from DnDScore
        self.agent = partial(
            self.client.chat.completions.create,
            model=self.model_name,
            seed=self.random_state,
            temperature=0.75,
            top_p=1.0,
            max_tokens=2048
        )

    def get_system_prompt(self) -> Optional[str]:
        return None  # DnD prompt is part of the user message

    def format_input(self, context: str, sentence: str) -> str:
        return DND_PROMPT.replace("[paragraph]", context).replace("[sentence]", sentence)

    def format_completions(self, decomp_input: List[Dict[str, Any]], completions: List[ChatCompletion]) -> List[
        Dict[str, Any]]:
        decompositions = []
        for d_input, completion in zip(decomp_input, completions):
            model_output = completion.choices[0].message.content.strip()
            try:
                extra, subclaim_str = [x.strip() for x in model_output.split("##CONTEXT-SUBCLAIM PAIRS##:")]
                subclaim_str = subclaim_str.replace('\n', '').strip()
                subclaim_dict = ast.literal_eval(subclaim_str)
                explanation = extra.split("##EXPLANATION##:")[-1]

                decomp = {k: v for k, v in d_input.items() if k != "context"}

                if not isinstance(subclaim_dict, list):
                    raise ValueError("Parsed subclaims is not a list.")

                for idx, claim_dict in enumerate(subclaim_dict):
                    new_decomp = decomp.copy()
                    new_decomp["claim"] = claim_dict["decontextualized"]
                    new_decomp["claim_id"] = idx
                    new_decomp["claim_meta"] = {
                        "subclaim": claim_dict["subclaim"],
                        "explanation": explanation
                    }
                    decompositions.append(new_decomp)

                if not subclaim_dict:
                    decomp["claim"] = None
                    decompositions.append(decomp)

            except (ValueError, SyntaxError) as e:
                logger.warning(
                    f"Invalid dictionary for {d_input['id']=}, {d_input['sentence_id']=}: {e}\nOutput: {model_output}")
                decomp = {k: v for k, v in d_input.items() if k != "context"}
                decomp["claim"] = None
                decompositions.append(decomp)

        return decompositions
