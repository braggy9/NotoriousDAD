#!/bin/bash

# Smart Tag - Only process files that still need metadata
# Skips files that already have artist tags

MIK_DIR="$HOME/Library/Mobile Documents/com~apple~CloudDocs/DJ Music/2-MIK-Analyzed"
MAX_JOBS=12

echo ""
echo "🧠 Smart Tag - Only Files Missing Metadata"
echo "==========================================="
echo "📂 Directory: $MIK_DIR"
echo ""

RESULTS_FILE="/tmp/smart-tag-results-$$.txt"
> "$RESULTS_FILE"

START_TIME=$(date +%s)

echo "🔍 Scanning files that need tagging..."
NEEDS_TAG="/tmp/needs-tagging-$$.txt"
> "$NEEDS_TAG"

# Find files with "Artist - Title" pattern and check if they need tagging
cd "$MIK_DIR"
total_checked=0
needs_count=0

for f in *.m4a *.mp3; do
  [ -f "$f" ] || continue

  # Only check files with " - " pattern
  if [[ "$f" == *" - "* ]]; then
    total_checked=$((total_checked + 1))

    # Check if file already has artist metadata
    artist=$(ffprobe -v quiet -show_entries format_tags=artist -of default=noprint_wrappers=1:nokey=1 "$f" 2>/dev/null | head -1)

    if [ -z "$artist" ] || [ "$artist" = "Unknown Artist" ] || [ "$artist" = "Various Artists" ]; then
      echo "$MIK_DIR/$f" >> "$NEEDS_TAG"
      needs_count=$((needs_count + 1))
    fi

    # Progress every 1000 files
    if [ $((total_checked % 1000)) -eq 0 ]; then
      echo "  Checked $total_checked files, found $needs_count needing tags..."
    fi
  fi
done

echo "  ✓ Checked $total_checked files"
echo "  📋 Found $needs_count files needing metadata"
echo ""

if [ $needs_count -eq 0 ]; then
  echo "✅ All files already have metadata!"
  rm -f "$NEEDS_TAG" "$RESULTS_FILE"
  exit 0
fi

echo "✏️  Processing $needs_count files with $MAX_JOBS parallel jobs..."
echo ""

LAUNCHED=0

while IFS= read -r filepath; do
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

  # Throttle
  if [ $((LAUNCHED % MAX_JOBS)) -eq 0 ]; then
    wait
  fi

  # Progress every 200 files
  if [ $((LAUNCHED % 200)) -eq 0 ]; then
    sleep 1
    DONE=$(wc -l < "$RESULTS_FILE" 2>/dev/null | tr -d ' ')
    OK=$(grep -c "^OK$" "$RESULTS_FILE" 2>/dev/null || echo 0)
    FAIL=$(grep -c "^FAIL$" "$RESULTS_FILE" 2>/dev/null || echo 0)
    PCT=$((DONE * 100 / needs_count))
    echo "  📊 $DONE/$needs_count ($PCT%) | ✓$OK ✗$FAIL"
  fi
done < "$NEEDS_TAG"

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

rm -f "$RESULTS_FILE" "$NEEDS_TAG"

echo ""
echo "📋 Next steps:"
echo "  1. Open Mixed In Key → Library → Rescan All"
echo "  2. Run: cd ~/dj-mix-generator && npm run sync-mix-generator"
