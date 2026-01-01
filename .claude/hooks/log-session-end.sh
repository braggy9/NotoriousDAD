#!/bin/bash
# Auto-logs session end to claude-progress.txt
# For detailed summaries, ask Claude: "Update progress with what we did"

set -e

# Read JSON input from stdin
INPUT=$(cat)

# Parse fields using simple grep/sed (no jq dependency)
SESSION_ID=$(echo "$INPUT" | grep -o '"session_id":"[^"]*"' | sed 's/"session_id":"//;s/"$//' | head -1)
REASON=$(echo "$INPUT" | grep -o '"reason":"[^"]*"' | sed 's/"reason":"//;s/"$//' | head -1)

# Get timestamp
TIMESTAMP=$(date "+%Y-%m-%d %H:%M")

# Progress file location
PROGRESS_FILE="${CLAUDE_PROJECT_DIR}/claude-progress.txt"

# Append session log entry
cat >> "$PROGRESS_FILE" << EOF

---
### Session Log: $TIMESTAMP
- Session ID: ${SESSION_ID:-unknown}
- Exit reason: ${REASON:-manual}
- (Ask Claude for detailed summary if needed)
EOF

echo "✓ Logged session end to claude-progress.txt"
