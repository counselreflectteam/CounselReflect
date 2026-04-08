#!/bin/bash

BASE_URL="http://localhost:8000"
TEST_FILE="$(dirname "$0")/test_input.json"

echo "=========================================="
echo "API Test Script"
echo "=========================================="
echo ""


# Health check
echo "1. Testing health check endpoint (GET /)..."
echo "-------------------------------------------"
HEALTH_RESPONSE=$(curl -s -w "\nHTTP Status: %{http_code}" "${BASE_URL}/")
HEALTH_STATUS=$(echo "$HEALTH_RESPONSE" | tail -n1)
HEALTH_BODY=$(echo "$HEALTH_RESPONSE" | sed '$d')

if echo "$HEALTH_STATUS" | grep -q "200"; then
  echo "✓ Health check passed"
  echo ""
  echo "Response:"
  echo "$HEALTH_BODY" | jq '.' 2>/dev/null || echo "$HEALTH_BODY"
  echo ""
  echo "$HEALTH_STATUS"
else
  echo "✗ Health check failed: $HEALTH_STATUS"
  echo ""
  echo "Response:"
  echo "$HEALTH_BODY"
  echo ""
  echo "Error: Server may not be running. Please start the server first."
  exit 1
fi

echo ""
echo ""

# Test /metrics endpoint
echo "2. Testing /metrics endpoint (GET /metrics)..."
echo "-------------------------------------------"
METRICS_RESPONSE=$(curl -s -w "\nHTTP Status: %{http_code}" "${BASE_URL}/metrics")
METRICS_STATUS=$(echo "$METRICS_RESPONSE" | tail -n1)
METRICS_BODY=$(echo "$METRICS_RESPONSE" | sed '$d')

if echo "$METRICS_STATUS" | grep -q "200"; then
  echo "✓ Metrics endpoint successful"
  echo ""
  echo "Response:"
  echo "$METRICS_BODY" | jq '.' 2>/dev/null || echo "$METRICS_BODY"
  echo ""
  echo "$METRICS_STATUS"
else
  echo "✗ Metrics endpoint failed: $METRICS_STATUS"
  echo ""
  echo "Response:"
  echo "$METRICS_BODY"
  echo ""
fi

echo ""
echo ""

# Test /evaluate endpoint
echo "3. Testing /evaluate endpoint (POST /evaluate)..."
echo "-------------------------------------------"
echo "Using test file: $TEST_FILE"
echo ""

EVAL_RESPONSE=$(curl -X POST "${BASE_URL}/evaluate" \
  -H "Content-Type: application/json" \
  -d @"${TEST_FILE}" \
  -w "\nHTTP Status: %{http_code}" \
  -s)

EVAL_STATUS=$(echo "$EVAL_RESPONSE" | tail -n1)
EVAL_BODY=$(echo "$EVAL_RESPONSE" | sed '$d')

if echo "$EVAL_STATUS" | grep -q "200"; then
  echo "✓ Evaluation request successful"
else
  echo "✗ Evaluation request failed: $EVAL_STATUS"
fi

echo ""
echo "Response:"
echo "$EVAL_BODY" | jq '.' 2>/dev/null || echo "$EVAL_BODY"
echo ""
echo "$EVAL_STATUS"

echo ""
echo "=========================================="
echo "Done!"
echo "=========================================="

