#!/bin/bash
# Test script to verify non-blocking FFmpeg execution
# This tests that the server can respond to HTTP requests while mixing

SERVER="https://mixmaster.mixtape.run"

echo "🧪 Testing Mix Generation with Non-Blocking FFmpeg"
echo "=================================================="
echo ""

# Test 1: Health check before mix
echo "1️⃣ Testing health endpoint (should respond instantly)..."
HEALTH=$(curl -s -w "\nTime: %{time_total}s\n" -m 5 "$SERVER/api/health")
echo "$HEALTH"
echo ""

# Test 2: Start a mix
echo "2️⃣ Starting mix generation..."
RESPONSE=$(curl -s -X POST "$SERVER/api/generate-mix" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "upbeat house and disco for a summer beach party, 118-126 BPM", "trackCount": 12}')

JOB_ID=$(echo "$RESPONSE" | grep -o '"jobId":"[^"]*"' | cut -d'"' -f4)

if [ -z "$JOB_ID" ]; then
  echo "❌ Failed to start mix"
  echo "Response: $RESPONSE"
  exit 1
fi

echo "✅ Mix started with jobId: $JOB_ID"
echo ""

# Test 3: Poll status while mixing (this is the critical test)
echo "3️⃣ Testing status polling while FFmpeg runs..."
echo "   (This should NOT timeout - proves non-blocking fix works)"
echo ""

for i in {1..5}; do
  echo "   Poll $i:"
  STATUS=$(curl -s -w "\n   Time: %{time_total}s\n" -m 60 "$SERVER/api/mix-status/$JOB_ID")
  echo "   $STATUS"

  # Check if complete
  if echo "$STATUS" | grep -q '"status":"complete"'; then
    echo ""
    echo "✅ Mix completed successfully!"
    break
  fi

  # Wait before next poll
  sleep 10
done

echo ""
echo "4️⃣ Testing health endpoint while mix is running..."
HEALTH2=$(curl -s -w "\nTime: %{time_total}s\n" -m 5 "$SERVER/api/health")
echo "$HEALTH2"

if echo "$HEALTH2" | grep -q '"status":"ok"'; then
  echo ""
  echo "✅ SUCCESS: Server responded to health check while mixing!"
  echo "   Non-blocking FFmpeg execution is working correctly."
else
  echo ""
  echo "❌ FAILED: Server did not respond during mix generation"
  echo "   FFmpeg is still blocking the event loop"
fi

echo ""
echo "=================================================="
echo "Test complete"
