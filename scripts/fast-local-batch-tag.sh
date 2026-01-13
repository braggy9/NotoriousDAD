#!/bin/bash

# Fast Local Batch Tag - 10-20x faster via local staging + parallel processing

ICLOUD_DIR="$HOME/Library/Mobile Documents/com~apple~CloudDocs/DJ Music/2-MIK-Analyzed"
LOCAL_STAGING="/tmp/mik-batch-staging"
BATCH_SIZE=200
MAX_PARALLEL=8

echo ""
echo "🚀 Fast Local Batch Tag"
echo "========================"
echo "📂 Source: $ICLOUD_DIR"
echo "📦 Staging: $LOCAL_STAGING"
echo "📊 Batch: $BATCH_SIZE files | ⚡ Parallel: $MAX_PARALLEL"
echo ""

mkdir -p "$LOCAL_STAGING"

# Build file list
echo "🔍 Finding files with 'Artist - Title' pattern..."
FILELIST="/tmp/batch-tag-files.txt"
find "$ICLOUD_DIR" -maxdepth 1 -type f \( -name "*.m4a" -o -name "*.mp3" \) -name "* - *" > "$FILELIST"
TOTAL=$(wc -l < "$FILELIST" | tr -d ' ')
echo "  Found: $TOTAL files"
echo ""

# Stats
SUCCESS=0
FAILED=0
PROCESSED=0
START_TIME=$(date +%s)

# Process a single file (called in parallel)
tag_single_file() {
  local icloud_path="$1"
  local local_dir="$2"

  local filename=$(basename "$icloud_path")
  local ext="${filename##*.}"
  local name_no_ext="${filename%.*}"
  local clean_name=$(echo "$name_no_ext" | sed -E 's/^[0-9]+[. -]*//')

  # Extract artist/title
  if [[ "$clean_name" != *" - "* ]]; then
    echo "SKIP"
    return
  fi

  local artist="${clean_name%% - *}"
  local title="${clean_name#* - }"

  # Validate
  [[ -z "$artist" || -z "$title" ]] && { echo "SKIP"; return; }
  local artist_lower=$(echo "$artist" | tr '[:upper:]' '[:lower:]')
  [[ "$artist_lower" == "unknown artist" || "$artist_lower" == "various artists" ]] && { echo "SKIP"; return; }

  local local_in="$local_dir/$filename"
  local local_out="$local_dir/out_$filename"

  # Tag
  if ffmpeg -y -i "$local_in" -c copy -metadata "artist=$artist" -metadata "title=$title" "$local_out" 2>/dev/null; then
    mv "$local_out" "$icloud_path" 2>/dev/null && echo "OK" || echo "FAIL"
  else
    rm -f "$local_out" 2>/dev/null
    echo "FAIL"
  fi
  rm -f "$local_in" 2>/dev/null
}

echo "✏️  Processing in batches of $BATCH_SIZE with $MAX_PARALLEL parallel jobs..."
echo ""

while [ $PROCESSED -lt $TOTAL ]; do
  BATCH_NUM=$((PROCESSED / BATCH_SIZE + 1))
  BATCH_END=$((PROCESSED + BATCH_SIZE))
  [ $BATCH_END -gt $TOTAL ] && BATCH_END=$TOTAL
  BATCH_COUNT=$((BATCH_END - PROCESSED))

  # Get this batch's files
  BATCH_LINES=$(sed -n "$((PROCESSED + 1)),${BATCH_END}p" "$FILELIST")

  # Copy batch to local staging
  echo "  📥 Batch $BATCH_NUM: Copying $BATCH_COUNT files to local staging..."
  echo "$BATCH_LINES" | while IFS= read -r f; do
    [ -n "$f" ] && cp "$f" "$LOCAL_STAGING/" 2>/dev/null
  done

  # Process in parallel using background jobs
  echo "  ⚡ Processing with up to $MAX_PARALLEL parallel jobs..."
  BATCH_OK=0
  BATCH_FAIL=0
  JOB_COUNT=0

  # Create a temp file for results
  RESULTS_FILE="/tmp/batch-results-$$.txt"
  > "$RESULTS_FILE"

  echo "$BATCH_LINES" | while IFS= read -r filepath; do
    [ -z "$filepath" ] && continue

    # Run in background, limit concurrency
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
          local_in="$LOCAL_STAGING/$filename"
          local_out="$LOCAL_STAGING/out_$filename"

          if [ -f "$local_in" ] && ffmpeg -y -i "$local_in" -c copy -metadata "artist=$artist" -metadata "title=$title" "$local_out" 2>/dev/null; then
            if mv "$local_out" "$filepath" 2>/dev/null; then
              echo "OK" >> "$RESULTS_FILE"
            else
              echo "FAIL" >> "$RESULTS_FILE"
            fi
          else
            echo "FAIL" >> "$RESULTS_FILE"
          fi
          rm -f "$local_in" "$local_out" 2>/dev/null
        else
          echo "SKIP" >> "$RESULTS_FILE"
          rm -f "$LOCAL_STAGING/$filename" 2>/dev/null
        fi
      else
        echo "SKIP" >> "$RESULTS_FILE"
        rm -f "$LOCAL_STAGING/$filename" 2>/dev/null
      fi
    ) &

    JOB_COUNT=$((JOB_COUNT + 1))

    # Limit parallel jobs
    if [ $JOB_COUNT -ge $MAX_PARALLEL ]; then
      wait
      JOB_COUNT=0
    fi
  done

  # Wait for remaining jobs
  wait

  # Count results
  BATCH_OK=$(grep -c "^OK$" "$RESULTS_FILE" 2>/dev/null || echo 0)
  BATCH_FAIL=$(grep -c "^FAIL$" "$RESULTS_FILE" 2>/dev/null || echo 0)
  rm -f "$RESULTS_FILE"

  SUCCESS=$((SUCCESS + BATCH_OK))
  FAILED=$((FAILED + BATCH_FAIL))
  PROCESSED=$BATCH_END

  # Clean staging
  rm -f "$LOCAL_STAGING"/* 2>/dev/null

  # Progress
  PCT=$((PROCESSED * 100 / TOTAL))
  ELAPSED=$(($(date +%s) - START_TIME))
  if [ $ELAPSED -gt 0 ] && [ $PROCESSED -gt 0 ]; then
    RATE_PER_MIN=$((PROCESSED * 60 / ELAPSED))
    if [ $RATE_PER_MIN -gt 0 ]; then
      REMAINING_MIN=$(((TOTAL - PROCESSED) / RATE_PER_MIN))
    else
      REMAINING_MIN="?"
    fi
  else
    REMAINING_MIN="calculating..."
  fi

  echo "  📊 $PROCESSED/$TOTAL ($PCT%) | ✓$SUCCESS ✗$FAILED | ~${REMAINING_MIN}min left"
  echo ""
done

# Cleanup
rm -rf "$LOCAL_STAGING"
rm -f "$FILELIST"

TOTAL_MIN=$((($(date +%s) - START_TIME) / 60))

echo "✅ Complete in $TOTAL_MIN minutes!"
echo "  • Success: $SUCCESS"
echo "  • Failed: $FAILED"
echo ""
echo "📋 Next steps:"
echo "  1. Open Mixed In Key → Library → Rescan All"
echo "  2. Run: cd ~/dj-mix-generator && npm run sync-mix-generator"
