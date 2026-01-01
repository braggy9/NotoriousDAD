#!/bin/bash
# Auto-logs before compaction to claude-progress.txt
# Fires on both manual /compact and automatic compaction

set -e

# Read JSON input from stdin
INPUT=$(cat)

# Parse compaction type
COMPACT_TYPE=$(echo "$INPUT" | grep -o '"type":"[^"]*"' | sed 's/"type":"//;s/"$//' | head -1)

# Get timestamp
TIMESTAMP=$(date "+%Y-%m-%d %H:%M")

# Progress file location
PROGRESS_FILE="${CLAUDE_PROJECT_DIR}/claude-progress.txt"

# Append compaction log entry
cat >> "$PROGRESS_FILE" << EOF

---
### Compaction: $TIMESTAMP
- Type: ${COMPACT_TYPE:-unknown} (manual or auto)
- Context was compressed - ask Claude for summary if needed
EOF

echo "✓ Logged pre-compaction to claude-progress.txt"
