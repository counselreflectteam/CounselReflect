#!/usr/bin/env python3
"""
Script to convert Metrics CSV to JSON rubrics format.
Uses low/mid/high anchors to create detailed rubric prompts.
"""

import csv
import json
from pathlib import Path


def create_rubric_prompt(metric_name, definition, low_anchor, mid_anchor, high_anchor):
    """
    Create a detailed rubric prompt based on the anchors.
    
    Args:
        metric_name: Name of the metric
        definition: Definition of the metric
        low_anchor: Description for level 1 (low performance)
        mid_anchor: Description for level 3 (mid performance)
        high_anchor: Description for level 5 (high performance)
    
    Returns:
        Formatted rubric string
    """
    rubric = f"""Guidance:
You are an experienced evaluator of counseling interactions. Using the definition and scoring rubric for {metric_name}, assess the quality of the response.

Definition: 
{definition}

Scale: 1-5

Scale Type: numerical

Scoring Criteria:
  level_1 (Score 1): {low_anchor}
  level_2 (Score 2): Between level 1 and level 3.
  level_3 (Score 3): {mid_anchor}
  level_4 (Score 4): Between level 3 and level 5.
  level_5 (Score 5): {high_anchor}

Key Indicators:
  - Accuracy and depth of application
  - Appropriateness to client context
  - Consistency with therapeutic best practices

Common Pitfalls:
  - Confusing this metric with related but distinct skills
  - Overlooking subtle but important nuances in client communication
  - Applying techniques mechanically without attunement to context"""
    
    return rubric


def convert_csv_to_json(csv_path, output_path):
    """
    Convert the metrics CSV file to JSON rubrics format.
    
    Args:
        csv_path: Path to input CSV file
        output_path: Path to output JSON file
    """
    rubrics = []
    
    with open(csv_path, 'r', encoding='utf-8') as f:
        # Read CSV with csv.DictReader for easier column access
        reader = csv.DictReader(f)
        
        for row in reader:
            # Extract references (Reference 1 through Reference 5)
            references = []
            for i in range(1, 6):
                ref_key = f'Reference {i}'
                if ref_key in row and row[ref_key].strip():
                    references.append(row[ref_key].strip())
            
            # Create rubric using the anchors
            rubric_prompt = create_rubric_prompt(
                metric_name=row['Metric Name'].strip(),
                definition=row['Definition'].strip(),
                low_anchor=row['Low (1) Anchor'].strip(),
                mid_anchor=row['Mid (3) Anchor'].strip(),
                high_anchor=row['High (5) Anchor'].strip()
            )
            
            # Parse need_highlight field (TRUE/FALSE string to boolean)
            need_highlight_str = row.get('Need highlight', 'FALSE').strip().upper()
            need_highlight = need_highlight_str == 'TRUE'
            
            # Build the rubric object
            rubric_obj = {
                "metric_name": row['Metric Name'].strip(),
                "definition": row['Definition'].strip(),
                "why_this_matters": row['Why this matters'].strip(),
                "references": references,
                "rubric": rubric_prompt,
                "need_highlight": need_highlight
            }
            
            rubrics.append(rubric_obj)
    
    # Write to JSON file with proper formatting
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(rubrics, f, indent=2, ensure_ascii=False)
    
    print(f"✓ Converted {len(rubrics)} metrics from CSV to JSON")
    print(f"✓ Output saved to: {output_path}")


def main():
    """Main execution function."""
    # Define paths
    script_dir = Path(__file__).parent
    csv_path = script_dir / "Metrics - Merged V2.csv"
    output_path = script_dir / "literature_rubrics_full.json"
    
    # Check if input file exists
    if not csv_path.exists():
        print(f"Error: CSV file not found at {csv_path}")
        return
    
    # Convert CSV to JSON
    print(f"Converting {csv_path} to JSON...")
    convert_csv_to_json(csv_path, output_path)
    
    # Print sample of first rubric
    with open(output_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
        if data:
            print("\n" + "="*80)
            print("Sample of first metric:")
            print("="*80)
            print(f"Metric: {data[0]['metric_name']}")
            print(f"\nRubric (first 500 chars):\n{data[0]['rubric'][:500]}...")


if __name__ == "__main__":
    main()
