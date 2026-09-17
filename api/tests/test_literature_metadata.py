import json
from pathlib import Path

from literature.routes import load_rubrics_from_json


LITERATURE_DIR = Path(__file__).parents[1] / "literature"
SHARED_TITLE_MAP = Path(__file__).parents[2] / "shared" / "src" / "data" / "literatureReferenceTitles.json"


def test_every_literature_reference_has_an_aligned_article_title():
    metrics = load_rubrics_from_json()

    assert len(metrics) == 69
    for metric in metrics:
        assert len(metric.references) == len(metric.reference_titles)
        assert all(title.strip() for title in metric.reference_titles)


def test_reference_title_map_exactly_covers_catalogue_urls():
    rubrics = json.loads((LITERATURE_DIR / "literature_rubrics.json").read_text(encoding="utf-8"))
    title_map = json.loads((LITERATURE_DIR / "literature_reference_titles.json").read_text(encoding="utf-8"))
    shared_title_map = json.loads(SHARED_TITLE_MAP.read_text(encoding="utf-8"))
    reference_urls = {url for metric in rubrics for url in metric["references"]}

    assert set(title_map) == reference_urls
    assert shared_title_map == title_map
    assert title_map["https://pmc.ncbi.nlm.nih.gov/articles/PMC10157460/"] == (
        "Evaluating Conversational Agents for Mental Health: "
        "Scoping Review of Outcomes and Outcome Measurement Instruments"
    )
