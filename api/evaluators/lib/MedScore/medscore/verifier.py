"""Verifier"""

import os
from functools import partial
import asyncio
from typing import List, Dict, Any, Optional
import string
import logging
import json

import jsonlines
from tqdm import tqdm
import backoff
import requests
import nest_asyncio
from registrable import Registrable

from .utils import chunker
from .prompts import INTERNAL_KNOWLEDGE_PROMPT
from .retriever import MedRAGRetriever

logger = logging.getLogger(__name__)
# Don't apply nest_asyncio at module level - it conflicts with uvicorn
# It will be applied only when needed in specific methods


class Verifier(Registrable):
    """Base class for all verifiers."""
    def __init__(
            self,
            provider=None,  # LLMProvider instance
            model_name: str = "gpt-4o",
            random_state: int = 42,
            batch_size: int = 32,
            # Legacy params for backward compatibility
            server_path: Optional[str] = None,
            api_key: Optional[str] = None,
            **kwargs, # To allow for extra params from config
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

    def __call__(self, decompositions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        # Prepare user input
        verifier_input = self.prepare_verification_input(decompositions)
        messages = self.prepare_messages(verifier_input)

        # Get completions
        all_completions = []
        n_iter = (len(messages) + self.batch_size - 1) // self.batch_size
        
        
        if self.use_legacy_client:
            # Use AsyncOpenAI client - need nest_asyncio for nested event loops
            nest_asyncio.apply()
            for batch in tqdm(chunker(messages, self.batch_size), desc="Verify", total=n_iter, ncols=80):
                completions = asyncio.run(self.batch_response_legacy(batch))
                all_completions.extend(completions)
        else:
            # Use our provider (synchronous)
            for batch in tqdm(chunker(messages, self.batch_size), desc="Verify", total=n_iter, ncols=80):
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
                        logger.error(f"Error in verifier: {e}")
                        # Create empty response
                        completion = SimpleNamespace(
                            choices=[SimpleNamespace(message=SimpleNamespace(content=""))]
                        )
                        all_completions.append(completion)

        # Format model output
        verification_output = []
        for v_input, completion in zip(verifier_input, all_completions):
            raw_output = completion.choices[0].message.content.strip() if completion.choices else ""
            is_supported = self.parse_verification_output(raw_output)
            output = {k: v for k, v in v_input.items()}
            output["raw"] = raw_output
            output["score"] = is_supported
            verification_output.append(output)
        return verification_output

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

    def parse_verification_output(self, completion_message: str) -> float:
        generated_answer = completion_message.strip().lower()
        is_supported = 0.0

        if "true" in generated_answer or "false" in generated_answer:
            if "true" in generated_answer and "false" not in generated_answer:
                is_supported = 1.0
            elif "false" in generated_answer and "true" not in generated_answer:
                is_supported = 0.0
            else:
                try:
                    # If 'true' appears after 'false', it's likely the final answer.
                    is_supported = float(generated_answer.rindex("true") > generated_answer.rindex("false"))
                except ValueError:
                    is_supported = 0.0 # One of the words wasn't found
        else:
            generated_answer_tokens = generated_answer.translate(str.maketrans("", "", string.punctuation)).split()
            is_supported = float(all(
                [keyword not in generated_answer_tokens for keyword in ["not", "cannot", "unknown", "information"]]))
        return is_supported

    def prepare_verification_input(self, decompositions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        raise NotImplementedError

    def format_input(self, evidence: str, claim: str) -> str:
        raise NotImplementedError

    def prepare_messages(self, verification_input: List[Dict[str, Any]]) -> List[List[Dict[str, Any]]]:
        raise NotImplementedError


@Verifier.register("internal")
class InternalVerifier(Verifier):
    """Verify claims against internal model knowledge"""
    def prepare_verification_input(self, decompositions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        for d in decompositions:
            d["evidence"] = None
        return decompositions

    def format_input(self, evidence: Optional[str], claim: str) -> str:
        return f"""Using your own knowledge, answer the question.\n\nInput: {claim} True or False?\n\nOutput:"""

    def prepare_messages(self, verification_input: List[Dict[str, Any]]) -> List[List[Dict[str, Any]]]:
        messages = []
        for d in verification_input:
            formatted_input = self.format_input(d.get('evidence'), d['claim'])
            messages.append([
                {"role": "system", "content": INTERNAL_KNOWLEDGE_PROMPT},
                {"role": "user", "content": formatted_input}
            ])
        return messages


@Verifier.register("provided")
class ProvidedEvidenceVerifier(Verifier):
    """Verify claims against a pre-provided `evidence` key"""
    def __init__(
            self,
            provided_evidence_path: str,
            *args,
            **kwargs
    ):
        super().__init__(*args, **kwargs)
        self.provided_evidence_path = provided_evidence_path
        with open(provided_evidence_path) as f:
            self.id_to_evidence = json.load(f)

    def prepare_verification_input(self, decompositions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        for d in decompositions:
            d["evidence"] = self.id_to_evidence.get(d['id'])
            if d["evidence"] is None:
                logger.warning(f"No evidence found for id: {d['id']}")
        return decompositions

    def format_input(self, evidence: Optional[str], claim: str) -> str:
        return f"""Answer the question based on the given context.\n\n{evidence}\n\nInput: {claim} True or False?\nOutput:"""

    def prepare_messages(self, verification_input: List[Dict[str, Any]]) -> List[List[Dict[str, Any]]]:
        messages = []
        for d in verification_input:
            formatted_input = self.format_input(d.get('evidence'), d['claim'])
            messages.append([
                {"role": "user", "content": formatted_input}
            ])
        return messages


@Verifier.register("medrag")
class MedRAGVerifier(Verifier):
    def __init__(
        self,
        retriever_name: str = "MedCPT",
        corpus_name: str = "StatPearls",
        db_dir: Optional[str] = None,
        HNSW: bool = False,
        cache: bool = False,
        n_returned_docs: int = 5,
        *args,
        **kwargs
    ):
        super().__init__(*args, **kwargs)
        if db_dir is None:
            db_dir = os.environ.get("MEDRAG_CORPUS", "./corpus")
        self.retriever = MedRAGRetriever(
            retriever_name=retriever_name,
            corpus_name=corpus_name,
            db_dir=db_dir,
            HNSW=HNSW,
            cache=cache,
            n_returned_docs=n_returned_docs
        )

    def prepare_verification_input(self, decompositions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        verification_input = []
        n_iter = (len(decompositions) + self.batch_size - 1) // self.batch_size
        logger.info(f"prepare_verification_input: processing {len(decompositions)} decompositions in {n_iter} batches")
        
        for batch_idx, batch in enumerate(tqdm(chunker(decompositions, self.batch_size), desc="Retrieving MedRAG", total=n_iter, ncols=80)):
            claims = [d['claim'] for d in batch]
            logger.info(f"Batch {batch_idx}: calling retriever with {len(claims)} claims")
            
            retrieved_all = self.retriever(query=claims)
            
            logger.info(f"Batch {batch_idx}: retriever returned {len(retrieved_all)} results")
            logger.debug(f"Batch {batch_idx}: first result type={type(retrieved_all[0])}, len={len(retrieved_all[0]) if retrieved_all else 0}")
            
            for decomp, retrieved in zip(batch, retrieved_all):
                v_input = {k: v for k, v in decomp.items()}
                v_input["evidence"] = retrieved
                verification_input.append(v_input)
        
        logger.info(f"prepare_verification_input: completed, returning {len(verification_input)} inputs")
        return verification_input

    def format_input(self, evidence: str, claim: str) -> str:
        return f"""Answer the question based on the given context.\n\n{evidence}\n\nInput: {claim} True or False?\nOutput:"""

    def prepare_messages(self, verification_input: List[Dict[str, Any]]) -> List[List[Dict[str, Any]]]:
        messages = []
        for d in verification_input:
            evidence_str = "\n\n".join([
                f"Title: {passage['title']} Text: {passage['text']}" for passage in d.get('evidence', [])
            ])
            formatted_input = self.format_input(evidence_str, d['claim'])
            messages.append([
                {"role": "user", "content": formatted_input}
            ])
        return messages
