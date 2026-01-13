#!/bin/bash

# Direct Parallel Tag - Process files in-place
# Compatible with bash 3.2 (macOS default)

MIK_DIR="$HOME/Library/Mobile Documents/com~apple~CloudDocs/DJ Music/2-MIK-Analyzed"
MAX_JOBS=12

echo ""
echo "⚡ Direct Parallel Tag - In-Place Processing"
echo "============================================="
echo "📂 Directory: $MIK_DIR"
echo "🔧 Parallel jobs: $MAX_JOBS"
echo ""

# Results file
RESULTS_FILE="/tmp/tag-results-$$.txt"
> "$RESULTS_FILE"

START_TIME=$(date +%s)

echo "🔍 Building file list..."
FILELIST="/tmp/tag-filelist-$$.txt"
find "$MIK_DIR" -maxdepth 1 -type f \( -name "*.m4a" -o -name "*.mp3" \) -name "* - *" > "$FILELIST"
TOTAL=$(wc -l < "$FILELIST" | tr -d ' ')
echo "  Found: $TOTAL files"
echo ""

echo "✏️  Processing with $MAX_JOBS parallel jobs..."
echo ""

# Counter
LAUNCHED=0
ACTIVE=0

# Process each file
while IFS= read -r filepath; do
  # Launch job in background
  (
    filename=$(basename "$filepath")
    ext="${filename##*.}"
    name_no_ext="${filename%.*}"
    clean_name=$(echo "$name_no_ext" | sed -E 's/^[0-9]+[. -]*//')

    if [[ "$clean_name" == *" - "* ]]; then
      artist="${clean_name%% - *}"
      title="${clean_name#* - }"
      artist_lower=$(echo "$artist" | tr '[:upper:]' '[:lower:]')

      if [[ -n "$artist" && -n "$title" && "$artist_lower" != "unknown artist" && "$artist_lower" != "various artists" ]]; then
        tempfile="${filepath%.${ext}}.tagged.${ext}"

        if ffmpeg -y -i "$filepath" -c copy -metadata "artist=$artist" -metadata "title=$title" "$tempfile" 2>/dev/null && [ -f "$tempfile" ]; then
          mv "$tempfile" "$filepath" 2>/dev/null && echo "OK" >> "$RESULTS_FILE" || echo "FAIL" >> "$RESULTS_FILE"
        else
          rm -f "$tempfile" 2>/dev/null
          echo "FAIL" >> "$RESULTS_FILE"
        fi
      else
        echo "SKIP" >> "$RESULTS_FILE"
      fi
    else
      echo "SKIP" >> "$RESULTS_FILE"
    fi
  ) &

  LAUNCHED=$((LAUNCHED + 1))

  # Throttle: wait when we hit max jobs
  if [ $((LAUNCHED % MAX_JOBS)) -eq 0 ]; then
    wait
  fi

  # Progress every 500 files
  if [ $((LAUNCHED % 500)) -eq 0 ]; then
    # Give jobs time to write results
    sleep 1
    DONE=$(wc -l < "$RESULTS_FILE" 2>/dev/null | tr -d ' ')
    OK=$(grep -c "^OK$" "$RESULTS_FILE" 2>/dev/null || echo 0)
    FAIL=$(grep -c "^FAIL$" "$RESULTS_FILE" 2>/dev/null || echo 0)
    PCT=$((DONE * 100 / TOTAL))

    ELAPSED=$(($(date +%s) - START_TIME))
    if [ $ELAPSED -gt 0 ] && [ $DONE -gt 0 ]; then
      RATE=$((DONE * 60 / ELAPSED))
      [ $RATE -gt 0 ] && REMAINING=$(((TOTAL - DONE) / RATE)) || REMAINING="?"
    else
      REMAINING="calc..."
    fi

    echo "  📊 $DONE/$TOTAL ($PCT%) | ✓$OK ✗$FAIL | ~${REMAINING}min"
  fi
done < "$FILELIST"

# Wait for remaining jobs
echo "  ⏳ Waiting for final jobs..."
wait

# Final stats
OK=$(grep -c "^OK$" "$RESULTS_FILE" 2>/dev/null || echo 0)
FAIL=$(grep -c "^FAIL$" "$RESULTS_FILE" 2>/dev/null || echo 0)
SKIP=$(grep -c "^SKIP$" "$RESULTS_FILE" 2>/dev/null || echo 0)
TOTAL_MIN=$((($(date +%s) - START_TIME) / 60))

echo ""
echo "✅ Complete in $TOTAL_MIN minutes!"
echo "  • Success: $OK"
echo "  • Failed: $FAIL"
echo "  • Skipped: $SKIP"

rm -f "$RESULTS_FILE" "$FILELIST"

echo ""
echo "📋 Next steps:"
echo "  1. Open Mixed In Key → Library → Rescan All"
echo "  2. Run: cd ~/dj-mix-generator && npm run sync-mix-generator"
