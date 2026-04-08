"""
reccon_eval.py
--------------
Standalone evaluation script for the RECCON (Recognizing Emotion Cause in Conversations)
dataset using a fine-tuned SpanBERT question-answering model.

This script evaluates a trained model on the RECCON test set (Subtask 1, Fold 1)
and reports Exact Match, Partial Match (LCS), LCS F1, and SQuAD F1 scores for
positive (causal) samples, an Inverse F1 for negative (non-causal) samples, and
overall LCS F1 / SQuAD F1 across all samples.

Reported results on DailyDialog (without context, fold 1):
    LCS F1 Score  (All Samples) = 74.75%
    SQuAD F1 Score (All Samples) = 74.80%

Usage:
    python reccon_eval.py --model span --fold 1 --dataset dailydialog

Requirements:
    See requirements.txt. A GPU is strongly recommended; training must be
    completed first via train_qa.py before evaluation can be run.

Reference:
    Poria et al. (2021). Recognizing Emotion Cause in Conversations.
    https://arxiv.org/abs/2012.11820
"""

import os

# Suppress TensorFlow/oneDNN noise before any heavy imports
os.environ["TF_ENABLE_ONEDNN_OPTS"] = "0"
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"

import json
import argparse
import numpy as np
from tqdm import tqdm

from evaluate_squad import compute_f1
from simpletransformers.question_answering import QuestionAnsweringModel


# ---------------------------------------------------------------------------
# Utility: Longest Common Substring
# ---------------------------------------------------------------------------

def lcs(S, T):
    """Return the set of all longest common substrings between S and T."""
    m, n = len(S), len(T)
    counter = [[0] * (n + 1) for _ in range(m + 1)]
    longest = 0
    lcs_set = set()
    for i in range(m):
        for j in range(n):
            if S[i] == T[j]:
                c = counter[i][j] + 1
                counter[i + 1][j + 1] = c
                if c > longest:
                    lcs_set = set()
                    longest = c
                    lcs_set.add(S[i - c + 1:i + 1])
                elif c == longest:
                    lcs_set.add(S[i - c + 1:i + 1])
    return lcs_set


# ---------------------------------------------------------------------------
# Evaluation Metrics
# ---------------------------------------------------------------------------

def evaluate_results(text):
    """
    Compute evaluation metrics from the model's prediction dictionary.

    The prediction dict has three keys:
        'correct_text'  – predictions that exactly match the gold answer
        'similar_text'  – predictions that partially match (LCS > 0)
        'incorrect_text'– predictions that do not match at all

    Items whose key contains 'span'       are positive (causal) samples.
    Items whose key contains 'impossible' are negative (non-causal) samples.

    Returns a formatted string summarising all metrics.
    """
    partial_match_scores = []
    lcs_all = []
    impos1, impos2, impos3, impos4 = 0, 0, 0, 0
    pos1, pos2, pos3 = 0, 0, 0
    fscores, squad_fscores = [], []        # positive samples only
    fscores_all, squad_fscores_all = [], [] # all samples

    buckets = ['correct_text', 'similar_text', 'incorrect_text']
    bucket_labels = ['Exact matches', 'Partial matches', 'No matches']

    for i, key in enumerate(buckets):
        for item in tqdm(text[key], desc=f'  Scoring {bucket_labels[i]}', leave=True):

            # ----- Exact match bucket -----
            if i == 0:
                fscores_all.append(1)
                squad_fscores_all.append(1)
                if 'impossible' in item and text[key][item]['predicted'] == '':
                    impos1 += 1
                elif 'span' in item:
                    pos1 += 1
                    fscores.append(1)
                    squad_fscores.append(1)

            # ----- Partial match bucket -----
            elif i == 1:
                if 'impossible' in item:
                    impos2 += 1
                    fscores_all.append(1)
                    squad_fscores_all.append(1)
                elif 'span' in item:
                    z = text[key][item]
                    if z['predicted'] != '':
                        longest_match = list(lcs(z['truth'], z['predicted']))[0]
                        lcs_all.append(longest_match)
                        partial_match_scores.append(
                            round(len(longest_match.split()) / len(z['truth'].split()), 4)
                        )
                        pos2 += 1
                        r = len(longest_match.split()) / len(z['truth'].split())
                        p = len(longest_match.split()) / len(z['predicted'].split())
                        f = 2 * p * r / (p + r)
                        fscores.append(f)
                        squad_fscores.append(compute_f1(z['truth'], z['predicted']))
                        fscores_all.append(f)
                        squad_fscores_all.append(compute_f1(z['truth'], z['predicted']))
                    else:
                        pos3 += 1
                        impos4 += 1
                        fscores.append(0)
                        squad_fscores.append(0)
                        fscores_all.append(0)
                        squad_fscores_all.append(0)

            # ----- No match bucket -----
            elif i == 2:
                fscores_all.append(0)
                squad_fscores_all.append(0)
                if 'impossible' in item:
                    impos3 += 1
                elif 'span' in item:
                    if z['predicted'] == '':
                        impos4 += 1
                    pos3 += 1
                    fscores.append(0)
                    squad_fscores.append(0)

    total_pos = pos1 + pos2 + pos3
    imr = impos2 / (impos2 + impos3)
    imp = impos2 / (impos2 + impos4)
    imf = 2 * imp * imr / (imp + imr)

    lines = [
        'Positive Samples:',
        '  Exact Match:   {}/{} = {}%'.format(pos1,  total_pos, round(100 * pos1  / total_pos, 2)),
        '  Partial Match: {}/{} = {}%'.format(pos2,  total_pos, round(100 * pos2  / total_pos, 2)),
        '  LCS F1 Score   = {}%'.format(round(100 * np.mean(fscores),       2)),
        '  SQuAD F1 Score = {}%'.format(round(100 * np.mean(squad_fscores), 2)),
        '  No Match:      {}/{} = {}%'.format(pos3,  total_pos, round(100 * pos3  / total_pos, 2)),
        '',
        'Negative Samples:',
        '  Inv F1 Score   = {}%'.format(round(100 * imf, 2)),
        '',
        'All Samples:',
        '  LCS F1 Score   = {}%'.format(round(100 * np.mean(fscores_all),       2)),
        '  SQuAD F1 Score = {}%'.format(round(100 * np.mean(squad_fscores_all), 2)),
    ]
    return '\n'.join(lines)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def parse_args():
    parser = argparse.ArgumentParser(
        description='Evaluate a trained RECCON QA model on the RECCON test set.'
    )
    parser.add_argument(
        '--model', default='span', choices=['rob', 'span'],
        help='Model type: "rob" (RoBERTa-base) or "span" (SpanBERT). Default: span'
    )
    parser.add_argument(
        '--fold', type=int, default=1, metavar='F',
        help='Data fold to evaluate on (1 or 2). Default: 1'
    )
    parser.add_argument(
        '--context', action='store_true', default=False,
        help='If set, use the "with context" data variant. Default: without context'
    )
    parser.add_argument(
        '--dataset', default='dailydialog', choices=['dailydialog', 'iemocap'],
        help='Dataset to evaluate on. Default: dailydialog'
    )
    parser.add_argument(
        '--batch-size', type=int, default=16, metavar='BS',
        help='Evaluation batch size. Default: 16'
    )
    parser.add_argument(
        '--cuda', type=int, default=0, metavar='C',
        help='CUDA device index. Default: 0'
    )
    return parser.parse_args()


def main():
    args = parse_args()
    print(args)

    # ------------------------------------------------------------------
    # Model / path configuration
    # ------------------------------------------------------------------
    model_family = {'rob': 'roberta', 'span': 'bert'}
    model_id     = {'rob': 'roberta-base', 'span': 'spanbert-squad'}

    fold    = str(args.fold)
    context = args.context
    variant = 'with_context' if context else 'without_context'

    # Paths are relative to the RECCON project root
    data_dir = os.path.join('data', 'subtask1', f'fold{fold}')
    save_dir = os.path.join(
        'outputs',
        f'{model_id[args.model]}-dailydialog-qa-{variant.replace("_", "-")}-fold{fold}'
    )
    best_model_dir = os.path.join(save_dir, 'best_model')
    results_dir    = 'results'
    os.makedirs(results_dir, exist_ok=True)

    # ------------------------------------------------------------------
    # Load test data
    # ------------------------------------------------------------------
    test_file = os.path.join(
        data_dir, f'{args.dataset}_qa_test_{variant}.json'
    )
    print(f'\nLoading test data from: {test_file}')
    with open(test_file, 'r') as f:
        x_test = json.load(f)
    print(f'Test examples loaded: {sum(len(p["qas"]) for p in x_test):,}')

    # ------------------------------------------------------------------
    # Sequence length configuration (matches training settings)
    # ------------------------------------------------------------------
    if not context:
        max_q_length, max_c_length, max_a_length = 400, 400, 160
    else:
        max_q_length, max_c_length, max_a_length = 512, 512, 200

    eval_args = {
        'fp16':                     False,
        'overwrite_output_dir':     False,
        'doc_stride':               512,
        'max_query_length':         max_q_length,
        'max_answer_length':        max_a_length,
        'max_seq_length':           max_c_length,
        'n_best_size':              20,
        'null_score_diff_threshold': 0.0,
        'sliding_window':           False,
        'eval_batch_size':          args.batch_size,
    }

    # ------------------------------------------------------------------
    # Load trained model and run evaluation
    # ------------------------------------------------------------------
    print(f'\nLoading trained model from: {best_model_dir}')
    qa_model = QuestionAnsweringModel(
        model_family[args.model],
        best_model_dir,
        args=eval_args,
        cuda_device=args.cuda
    )

    print('\nRunning evaluation...')
    _, text = qa_model.eval_model(x_test)

    # ------------------------------------------------------------------
    # Compute and display metrics
    # ------------------------------------------------------------------
    report = evaluate_results(text)
    print('\n' + '=' * 40)
    print(report)
    print('=' * 40)

    # ------------------------------------------------------------------
    # Save results to disk
    # ------------------------------------------------------------------
    result_file = os.path.join(
        results_dir, f'evaluation_{args.dataset}_qa_{variant}.txt'
    )
    with open(result_file, 'a') as rf:
        rf.write(str(args) + '\n\n')
        rf.write(report + '\n' + '-' * 40 + '\n')

    print(f'\nResults saved to: {result_file}')


if __name__ == '__main__':
    main()
