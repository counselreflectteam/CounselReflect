# PAIR Model Deployment

This directory contains files for deploying the PAIR reflection quality scorer to **HuggingFace Inference Endpoints**.

## Files

| File | Purpose |
|------|---------|
| `handler.py` | Custom inference handler for HF endpoints |
| `cross_scorer_model.py` | PyTorch model architecture definition |
| `config.json` | Endpoint configuration |
| `requirements.txt` | Python dependencies for deployment |
| `test_handler_local.py` | Test handler locally before deployment |
| `test_endpoint.py` | Test deployed endpoint |

---

## Deployment to HuggingFace Endpoint

### Prerequisites

1. HuggingFace account with Inference Endpoints access
2. Model weights (`reflection_scorer_weight.pt`) - see `../models/README.md`
3. HuggingFace CLI: `pip install huggingface-hub`

### Step 1: Prepare Model Files

```bash
# Ensure model weights are downloaded
cd ../models/
# Download reflection_scorer_weight.pt (475MB)
# See models/README.md for instructions

# Verify files
ls -lh reflection_scorer_weight.pt
```

### Step 2: Create Model Repository on HuggingFace

```bash
# Login to HuggingFace
huggingface-cli login

# Create repository
huggingface-cli repo create pair-reflection-scorer --type model

# Clone repository
git clone https://huggingface.co/YOUR_USERNAME/pair-reflection-scorer
cd pair-reflection-scorer
```

### Step 3: Copy Deployment Files

```bash
# Copy all deployment files
cp /path/to/deployment/handler.py .
cp /path/to/deployment/cross_scorer_model.py .
cp /path/to/deployment/config.json .
cp /path/to/deployment/requirements.txt .

# Copy model weights
cp /path/to/models/reflection_scorer_weight.pt .

# Verify structure
ls -lh
# Should see: handler.py, cross_scorer_model.py, config.json,
#             requirements.txt, reflection_scorer_weight.pt
```

### Step 4: Push to HuggingFace

```bash
git add .
git commit -m "Add PAIR reflection scorer model"
git push
```

### Step 5: Create Inference Endpoint

1. Go to https://huggingface.co/YOUR_USERNAME/pair-reflection-scorer
2. Click **"Deploy" → "Inference Endpoints"**
3. Configure endpoint:
   - **Name**: `pair-reflection-scorer`
   - **Cloud**: AWS (us-east-1) or Azure
   - **Instance Type**: GPU (nvidia-tesla-t4 or better)
   - **Min Replicas**: 1
   - **Max Replicas**: 3 (for auto-scaling)
4. Click **"Create Endpoint"**
5. Wait ~5-10 minutes for deployment

### Step 6: Get Endpoint URL

Once deployed, copy the endpoint URL from the dashboard:
```
https://ohl86sbu1q76u30x.us-east-1.aws.endpoints.huggingface.cloud
```

---

## Local Testing

Test the handler locally before deployment to catch errors early.

### Test Handler Locally

```bash
# Install dependencies
pip install -r requirements.txt

# Ensure model weights are available
ls ../models/reflection_scorer_weight.pt

# Run local test
python test_handler_local.py
```

**Expected Output**:
```
Testing PAIR Handler Locally
========================================

Test 1: Single Pair
  Prompt: I've been feeling really stressed at work lately.
  Response: It sounds like work has been overwhelming for you.
  Score: 0.673
  Quality: Simple Reflection

Test 2: Batch Processing
  Pair 1: 0.782 (Complex Reflection)
  Pair 2: 0.615 (Simple Reflection)
  Pair 3: 0.234 (Non-Reflection)

All tests passed!
```

### Test Deployed Endpoint

After deployment, test the live endpoint:

```bash
# Set environment variables
export PAIR_ENDPOINT_URL="https://YOUR-ENDPOINT.cloud"
export HF_TOKEN="hf_your_token_here"

# Run endpoint test
python test_endpoint.py
```

**Expected Output**:
```
Testing PAIR Endpoint
========================================

Endpoint: https://ohl86sbu1q76u30x.us-east-1.aws.endpoints.huggingface.cloud
Status: ✅ Endpoint is healthy

Test 1: Single Pair
  Score: 0.673
  Quality: Simple Reflection
  ✅ Pass

Test 2: Batch Processing
  Processed 3 pairs successfully
  ✅ Pass

All endpoint tests passed!
```

---

## Handler API

### Input Format

**Single Pair**:
```json
{
  "inputs": {
    "prompt": "Patient utterance here",
    "response": "Therapist response here"
  }
}
```

**Batch (Multiple Pairs)**:
```json
{
  "inputs": [
    {
      "prompt": "Patient utterance 1",
      "response": "Therapist response 1"
    },
    {
      "prompt": "Patient utterance 2",
      "response": "Therapist response 2"
    }
  ]
}
```

### Output Format

**Single Pair Response**:
```json
{
  "score": 0.673,
  "quality_label": "Simple Reflection",
  "confidence": 0.89
}
```

**Batch Response**:
```json
[
  {
    "score": 0.782,
    "quality_label": "Complex Reflection",
    "confidence": 0.92
  },
  {
    "score": 0.615,
    "quality_label": "Simple Reflection",
    "confidence": 0.85
  }
]
```

### Quality Label Mapping

| Score Range | Label | Description |
|-------------|-------|-------------|
| > 0.7 | Complex Reflection | Deep understanding, adds meaning |
| 0.4 - 0.7 | Simple Reflection | Accurate rephrasing |
| < 0.4 | Non-Reflection | Poor reflection or closed question |

---

## Configuration

### config.json

```json
{
  "framework": "pytorch",
  "task": "text-classification",
  "model_name": "roberta-base",
  "handler": "handler.py",
  "requirements": "requirements.txt"
}
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PAIR_ENDPOINT_URL` | Yes | Full endpoint URL |
| `HF_TOKEN` | Yes | HuggingFace API token |
| `MODEL_PATH` | No | Path to model weights (default: `./reflection_scorer_weight.pt`) |

---

## Troubleshooting

### Common Issues

**Issue**: `FileNotFoundError: reflection_scorer_weight.pt`
- **Solution**: Ensure model weights are in the repository root or update `MODEL_PATH` in handler

**Issue**: `RuntimeError: CUDA out of memory`
- **Solution**: Use smaller batch sizes or upgrade to larger GPU instance

**Issue**: `ModuleNotFoundError: No module named 'transformers'`
- **Solution**: Verify `requirements.txt` is present and correctly formatted

**Issue**: Endpoint returns 500 error
- **Solution**: Check logs in HF dashboard, test handler locally first

**Issue**: Slow cold start (>30 seconds)
- **Solution**: Expected for first request; subsequent requests are faster (~50-100ms)

### Debugging

**Enable verbose logging** in `handler.py`:
```python
import logging
logging.basicConfig(level=logging.DEBUG)
```

**Test with minimal example**:
```bash
curl -X POST $PAIR_ENDPOINT_URL \
  -H "Authorization: Bearer $HF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"inputs": {"prompt": "I am stressed.", "response": "You feel stressed."}}'
```

---

## Performance Optimization

### Batch Processing

**Always prefer batch processing** for multiple pairs:
```python
# ❌ Inefficient: Multiple requests
for pair in pairs:
    response = requests.post(url, json={"inputs": pair})

# ✅ Efficient: Single batch request
response = requests.post(url, json={"inputs": pairs})
```

**Throughput Improvement**: ~10x faster for 10 pairs

### GPU Selection

| Instance | VRAM | Latency (Single) | Cost |
|----------|------|------------------|------|
| nvidia-tesla-t4 | 16GB | ~80ms | $ |
| nvidia-tesla-v100 | 16GB | ~50ms | $$ |
| nvidia-a10g | 24GB | ~40ms | $$$ |

**Recommendation**: T4 for most use cases (good balance of cost/performance)

### Auto-Scaling

Configure auto-scaling for variable load:
- **Min Replicas**: 1 (always available)
- **Max Replicas**: 3-5 (handle traffic spikes)
- **Scale-up Threshold**: 70% GPU utilization
- **Scale-down Delay**: 5 minutes

---

## Cost Estimation

**HuggingFace Endpoint Pricing** (approximate):
- **GPU (T4)**: $0.60-0.80/hour
- **Minimum**: ~$18-24/month (1 replica always running)
- **Per-request**: Included in hourly rate (no per-request charges)

**Alternative**: Use serverless (pay-per-request) if traffic is sporadic

---

## Deployment Checklist

Before deploying to production:

- [ ] Model weights downloaded and tested locally
- [ ] `test_handler_local.py` passes all tests
- [ ] `requirements.txt` includes all dependencies
- [ ] `config.json` properly configured
- [ ] HuggingFace repository created
- [ ] All files pushed to HF Hub
- [ ] Endpoint created and healthy
- [ ] `test_endpoint.py` passes all tests
- [ ] Endpoint URL and token stored securely
- [ ] Auto-scaling configured appropriately
- [ ] Monitoring/alerts set up in HF dashboard

---

## Support

- **Deployment Issues**: Check HuggingFace Endpoints documentation
- **Model Issues**: See [`../MODEL_REPORT.md`](../MODEL_REPORT.md)
- **API Integration**: See [`../docs/API_INTEGRATION.md`](../docs/API_INTEGRATION.md)

---

**Last Updated**: Based on EMNLP 2022 model release
