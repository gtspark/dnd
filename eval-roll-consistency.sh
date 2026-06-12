#!/bin/bash
# Consistency eval: does the DM grant advantage for Dax's four arms on the ladder climb?
# Each trial resets the sandbox campaign to an identical baseline.
set -u
N=${1:-8}
ACTION=${2:-'dax heads to the ladder and uses all his arms for extra balance on the way down'}
CHARACTER=${3:-Dax}
OUT=/tmp/dax-eval-results.jsonl
: > "$OUT"

for i in $(seq 1 "$N"); do
  echo "=== trial $i/$N ==="
  cp /tmp/dax-eval-baseline/campaign-state.json /opt/dnd/campaigns/dax-eval/campaign-state.json
  cp /tmp/dax-eval-baseline/conversation-history.json /opt/dnd/campaigns/dax-eval/conversation-history.json
  cp /tmp/dax-eval-baseline/combat-state.json /opt/dnd/campaigns/dax-eval/combat-state.json
  pm2 reload dnd >/dev/null 2>&1
  sleep 6
  RESP=$(curl -s -X POST localhost:3003/api/dnd/action -H 'Content-Type: application/json' \
    -d "{\"campaignId\":\"dax-eval\",\"action\":\"$ACTION\",\"character\":\"$CHARACTER\",\"mode\":\"ic\"}" --max-time 170)
  echo "$RESP" | python3 -c "
import json, sys, re
trial = $i
try:
    d = json.load(sys.stdin)
except Exception as e:
    print(json.dumps({'trial': trial, 'error': 'bad json'})); raise SystemExit
narr = (d.get('narrative') or '')
rq = d.get('rollQueueEntry')
participant = (rq.get('participants') or [{}])[0] if rq else {}
result = {
    'trial': trial,
    'roll_requested': bool(rq),
    'reason': (rq or {}).get('reason'),
    'dc': (rq or {}).get('dc'),
    'queue_advantage': participant.get('advantage'),
    'narr_advantage': bool(re.search(r'\badvantage\b', narr, re.I)),
    'narr_no_roll_needed': bool(re.search(r'no roll (is )?(needed|required)|without (needing|requiring) a roll|automatic', narr, re.I)),
    'narr_mentions_arms': bool(re.search(r'\b(four|all four|extra|lower|upper) (arms|hands)|four-armed', narr, re.I)),
    'narr_tail': narr[-200:].replace(chr(10),' ')
}
print(json.dumps(result))
" | tee -a "$OUT"
done
echo "DONE — results in $OUT"
