#!/bin/bash

# Batch Tag - Add ID3 tags from filenames
# Usage: ./batch-tag.sh [--dry-run]

MIK_DIR="$HOME/Library/Mobile Documents/com~apple~CloudDocs/DJ Music/2-MIK-Analyzed"

echo ""
echo "🏷️  Batch Tag - ID3 Tags from Filenames"
echo "========================================"
echo ""
echo "📂 Directory: $MIK_DIR"

# Build file list first
FILELIST="/tmp/batch-tag-files.txt"
find "$MIK_DIR" -maxdepth 1 -type f \( -name "*.m4a" -o -name "*.mp3" \) -name "* - *" > "$FILELIST"
TOTAL=$(wc -l < "$FILELIST" | tr -d ' ')

echo "  Parseable files: $TOTAL"
echo ""

if [ "$1" = "--dry-run" ]; then
  echo "🔍 DRY RUN - showing first 10:"
  head -10 "$FILELIST" | while read -r file; do
    echo "  $(basename "$file")"
  done
  rm "$FILELIST"
  exit 0
fi

echo "✏️  Tagging $TOTAL files..."
echo ""

SUCCESS=0
FAILED=0
COUNT=0

while IFS= read -r filepath; do
  filename=$(basename "$filepath")
  ext="${filename##*.}"

  # Remove extension
  name_no_ext="${filename%.*}"

  # Remove leading track number
  clean_name=$(echo "$name_no_ext" | sed -E 's/^[0-9]+[. -]*//')

  # Split on first " - "
  if [[ "$clean_name" == *" - "* ]]; then
    artist="${clean_name%% - *}"
    title="${clean_name#* - }"
  else
    FAILED=$((FAILED + 1))
    COUNT=$((COUNT + 1))
    continue
  fi

  # Skip empty or invalid
  if [ -z "$artist" ] || [ -z "$title" ]; then
    FAILED=$((FAILED + 1))
    COUNT=$((COUNT + 1))
    continue
  fi

  # Skip unwanted artists
  artist_lower=$(echo "$artist" | tr '[:upper:]' '[:lower:]')
  if [ "$artist_lower" = "unknown artist" ] || [ "$artist_lower" = "various artists" ]; then
    FAILED=$((FAILED + 1))
    COUNT=$((COUNT + 1))
    continue
  fi

  # Create temp file WITH proper extension
  tempfile="${filepath%.${ext}}.tagged.${ext}"

  # Run ffmpeg
  if ffmpeg -y -i "$filepath" -c copy -metadata "artist=$artist" -metadata "title=$title" "$tempfile" 2>/dev/null; then
    if [ -f "$tempfile" ]; then
      mv "$tempfile" "$filepath" && SUCCESS=$((SUCCESS + 1)) || { rm -f "$tempfile"; FAILED=$((FAILED + 1)); }
    else
      FAILED=$((FAILED + 1))
    fi
  else
    rm -f "$tempfile" 2>/dev/null
    FAILED=$((FAILED + 1))
  fi

  COUNT=$((COUNT + 1))

  # Progress every 100
  if [ $((COUNT % 100)) -eq 0 ]; then
    PCT=$((COUNT * 100 / TOTAL))
    echo "  📊 $COUNT/$TOTAL ($PCT%) - ✓$SUCCESS ✗$FAILED"
  fi
done < "$FILELIST"

rm "$FILELIST"

echo ""
echo "✅ Complete!"
echo "  • Success: $SUCCESS"
echo "  • Failed: $FAILED"
echo ""
echo "📋 Next steps:"
echo "  1. Open Mixed In Key → Re-scan library"
echo "  2. Run: npm run sync-mix-generator"
