"""Retriever

Use MedRAG corpus for retrieving relevant passages in the medical domain.
"""
import os
import sys
import json
from typing import List, Dict, Any, Tuple, Union
import logging
import subprocess

import tqdm

from .medrag_utils import RetrievalSystem

logger = logging.getLogger(__name__)


class MedRAGRetriever(object):
    def __init__(
        self,
        retriever_name: str = "MedCPT",
        corpus_name: str = "MEDIC",
        db_dir: str = os.environ.get("MEDRAG_CORPUS", "./corpus"),
        HNSW: bool = False,
        cache: bool = False,
        n_returned_docs: int = 5
    ):
        self.retriever = RetrievalSystem(
            retriever_name=retriever_name,
            corpus_name=corpus_name,
            db_dir=db_dir,
            HNSW=HNSW,
            cache=cache
        )
        self.use_cache = cache
        self.n_returned_docs = n_returned_docs
        self.db_dir = db_dir

    def get_passages(self, query: str) -> List[Dict[str, Any]]:
        """
        Wrapper for RetrievalSystem.retrieve
        :param topic:
        :param question:
        :param k: k is ignored. See n_returned_docs in class initialization.
        :return:
        """
        results = self(
            query=[query],
        )
        retrieved = results[0]
        return retrieved

    def __call__(self, query: List[str]) -> List[List[Dict[str, Any]]]:
        """Returns passages for multiple questions."""
        logger.info(f"MedRAGRetriever.__call__ received {len(query)} queries")
        batched_results = self.retriever.retrieve(
            questions=query,
            k=self.n_returned_docs,  # Final # of docs returned based on top scores
            rrf_k=self.n_returned_docs * 5,  # # docs to return from each source
            id_only=True
        )
        logger.info(f"Retriever.retrieve() returned {len(batched_results)} batched results")
        logger.debug(f"Batched results type: {type(batched_results)}, first item: {batched_results[0] if batched_results else 'empty'}")
        
        retrieved = self._format_retrieved(batched_results)
        logger.info(f"_format_retrieved() returned {len(retrieved)} formatted results")
        return retrieved

    def _format_retrieved(self, merge_results: List[Tuple[List[Dict[str, Any]], List[float]]]) -> List[List[Dict[str, Any]]]:
        # Format into {'title': '', 'text': '', 'score': }
        retrieved = []
        logger.info(f"Formatting {len(merge_results)} batches of retrieved documents")
        for batch_idx, (t_batch, s_batch) in enumerate(tqdm.tqdm(merge_results, desc="Formatting retrieved documents", ncols=0)):
            logger.debug(f"Formatting batch {batch_idx}, {len(t_batch)} documents")
            ret = []
            for doc_idx, (t, s) in enumerate(zip(t_batch, s_batch)):
                if not t.get("title"):
                    logger.debug(f"Loading doc {doc_idx} with id {t.get('id')}")
                    t.update(self._load_doc_from_id(t["id"]))
                r = {
                    "id": t["id"],
                    "title": t["title"],
                    "text": t["content"],
                    "score": s
                }
                ret.append(r)
            retrieved.append(ret)
        logger.info(f"Finished formatting {len(retrieved)} batches")
        return retrieved

    def _load_doc_from_id(self, id: str) -> Dict[str, Any]:
        if self.use_cache:
            doc = self.retriever.docExt.extract([id])[0]
        else:
            # Hacky way to load the document
            # Format example: pubmed23n0973_8682
            # TODO: use DocExtractor system self.dict which has id2path?
            id_parts = id.split("_")
            if len(id_parts) > 2:
                index = int(id_parts[-1])
                doc_id = "_".join(id_parts[:-1])
            else:
                doc_id, index = id_parts
                index = int(index)

            if "pubmed" in doc_id:
                corpus_name = "pubmed"
            elif "article-" in doc_id:
                corpus_name = "statpearls"
            elif "wiki" in doc_id:
                corpus_name = "wikipedia"
            else:
                corpus_name = "textbooks"

            doc_path = os.path.join(self.db_dir, corpus_name, "chunk", f"{doc_id}.jsonl")

            # https://stackoverflow.com/questions/6022384/bash-tool-to-get-nth-line-from-a-file
            try:
                logger.debug(f"Loading doc {id} from {doc_path} line {index+1}")
                doc = subprocess.check_output(
                    ["sed", f"{index+1}q;d", doc_path],
                    timeout=5.0  # 5 second timeout
                )
                doc = json.loads(doc)
                logger.debug(f"Successfully loaded doc {id}")
            except subprocess.TimeoutExpired:
                logger.error(f"Timeout loading doc {id} from {doc_path}")
                raise
            except Exception as e:
                logger.error(f"Error loading doc {id}: {e}")
                raise
        return doc

