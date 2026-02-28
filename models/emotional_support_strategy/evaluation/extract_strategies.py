import json

strategies = set()
with open('../data/train.jsonl', 'r') as f:
    for line in f:
        data = json.loads(line)
        for turn in data['dialog']:
            if turn['speaker'] == 'sys' and 'strategy' in turn:
                strategies.add(turn['strategy'])

print(sorted(list(strategies)))
