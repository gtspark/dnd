#!/bin/bash
###############################################################################
# Update Game Assets - Auto-update game.html with new Svelte build hashes
# Usage: ./update-game-assets.sh
#
# This script:
# 1. Finds the latest Svelte build assets (index-*.js and index-*.css)
# 2. Updates game.html with the new hashes
# 3. Creates a backup before making changes
# 4. Displays Cloudflare cache purge instructions
###############################################################################

set -e  # Exit on error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GAME_HTML="$SCRIPT_DIR/game.html"
ASSETS_DIR="$SCRIPT_DIR/campaigns/test-silverpeak/svelte-dist/assets"

echo "🔧 Updating Svelte assets in game.html..."
echo ""

# Check if game.html exists
if [ ! -f "$GAME_HTML" ]; then
    echo "❌ game.html not found at: $GAME_HTML"
    exit 1
fi

# Check if assets directory exists
if [ ! -d "$ASSETS_DIR" ]; then
    echo "❌ Assets directory not found at: $ASSETS_DIR"
    echo "   Run 'npm run ui:build' first to create the Svelte build"
    exit 1
fi

# Find current asset files
CSS_FILE=$(ls "$ASSETS_DIR"/index-*.css 2>/dev/null | head -1 | xargs basename)
JS_FILE=$(ls "$ASSETS_DIR"/index-*.js 2>/dev/null | head -1 | xargs basename)

if [ -z "$CSS_FILE" ] || [ -z "$JS_FILE" ]; then
    echo "❌ Could not find index-*.css or index-*.js in assets directory"
    echo "   Run 'npm run ui:build' first to create the Svelte build"
    exit 1
fi

echo "📦 Found build assets:"
echo "   CSS: $CSS_FILE"
echo "   JS:  $JS_FILE"
echo ""

# Extract hashes from filenames (e.g., "index-ChVkGqD-.css" -> "ChVkGqD-")
CSS_HASH=$(echo "$CSS_FILE" | sed -n 's/index-\(.*\)\.css/\1/p')
JS_HASH=$(echo "$JS_FILE" | sed -n 's/index-\(.*\)\.js/\1/p')

echo "🔍 Extracted hashes:"
echo "   CSS hash: $CSS_HASH"
echo "   JS hash:  $JS_HASH"
echo ""

# Create backup
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="$SCRIPT_DIR/game.html.backup-$TIMESTAMP"
cp "$GAME_HTML" "$BACKUP_FILE"
echo "💾 Created backup: $(basename "$BACKUP_FILE")"
echo ""

# Find current hashes in game.html
CURRENT_CSS=$(grep -o 'index-[^.]*\.css' "$GAME_HTML" | head -1)
CURRENT_JS=$(grep -o 'index-[^.]*\.js' "$GAME_HTML" | head -1)

echo "🔄 Replacing asset references:"
echo "   $CURRENT_CSS → $CSS_FILE"
echo "   $CURRENT_JS → $JS_FILE"
echo ""

# Replace CSS hash in game.html (both filename and cache-busting timestamp)
sed -i "s|index-[^.]*\.css|$CSS_FILE|g" "$GAME_HTML"

# Replace JS hash in game.html (both filename and cache-busting timestamp)
sed -i "s|index-[^.]*\.js|$JS_FILE|g" "$GAME_HTML"

# Update cache-busting timestamp (v=...)
NEW_TIMESTAMP=$(date +%s)
sed -i "s|\?v=[0-9]*|?v=$NEW_TIMESTAMP|g" "$GAME_HTML"

echo "✅ game.html updated successfully!"
echo ""

# Also update campaign-specific HTML files
echo "🔍 Checking for campaign-specific HTML files..."
CAMPAIGN_HTML_FILES=$(find "$SCRIPT_DIR/campaigns" -name "index.html" 2>/dev/null)

if [ -n "$CAMPAIGN_HTML_FILES" ]; then
    echo "$CAMPAIGN_HTML_FILES" | while read -r CAMPAIGN_FILE; do
        CAMPAIGN_NAME=$(basename $(dirname "$CAMPAIGN_FILE"))
        echo "  📄 Updating: campaigns/$CAMPAIGN_NAME/index.html"

        # Backup campaign HTML
        cp "$CAMPAIGN_FILE" "$CAMPAIGN_FILE.backup-$TIMESTAMP"

        # Update hashes
        sed -i "s|index-[^.]*\.css|$CSS_FILE|g" "$CAMPAIGN_FILE"
        sed -i "s|index-[^.]*\.js|$JS_FILE|g" "$CAMPAIGN_FILE"
        sed -i "s|\?v=[0-9]*|?v=$NEW_TIMESTAMP|g" "$CAMPAIGN_FILE"
    done
    echo "✅ Campaign-specific HTML files updated!"
else
    echo "  (No campaign-specific HTML files found)"
fi
echo ""

echo "📊 Verification:"
grep -n "index-.*\.css" "$GAME_HTML" | head -2
grep -n "index-.*\.js" "$GAME_HTML" | head -2
echo ""

echo "☁️  CLOUDFLARE CACHE PURGE REQUIRED"
echo "════════════════════════════════════════════════════════════"
echo "To ensure users see the new assets, purge Cloudflare cache:"
echo ""
echo "Option 1: Purge entire site (easiest)"
echo "  1. Log in to Cloudflare dashboard"
echo "  2. Select vodbase.net domain"
echo "  3. Go to Caching → Configuration"
echo "  4. Click 'Purge Everything'"
echo ""
echo "Option 2: Purge specific URLs (recommended)"
echo "  URLs to purge:"
echo "  • https://vodbase.net/dnd/game.html"

# Add campaign-specific URLs to purge list
if [ -n "$CAMPAIGN_HTML_FILES" ]; then
    echo "$CAMPAIGN_HTML_FILES" | while read -r CAMPAIGN_FILE; do
        CAMPAIGN_NAME=$(basename $(dirname "$CAMPAIGN_FILE"))
        echo "  • https://vodbase.net/dnd/campaigns/$CAMPAIGN_NAME/index.html"
    done
fi

echo "  • https://vodbase.net/dnd/campaigns/test-silverpeak/svelte-dist/assets/$CSS_FILE"
echo "  • https://vodbase.net/dnd/campaigns/test-silverpeak/svelte-dist/assets/$JS_FILE"
echo ""
echo "Option 3: Use Cloudflare API (fastest, requires API token)"
echo "  curl -X POST \"https://api.cloudflare.com/client/v4/zones/\$ZONE_ID/purge_cache\" \\"
echo "    -H \"Authorization: Bearer \$CF_API_TOKEN\" \\"
echo "    -H \"Content-Type: application/json\" \\"
echo "    --data '{\"files\":[\"https://vodbase.net/dnd/game.html\",\"https://vodbase.net/dnd/campaigns/test-silverpeak/svelte-dist/assets/$CSS_FILE\",\"https://vodbase.net/dnd/campaigns/test-silverpeak/svelte-dist/assets/$JS_FILE\"]}'"
echo ""
echo "════════════════════════════════════════════════════════════"
echo ""
echo "🎉 Done! To complete deployment:"
echo "   1. Purge Cloudflare cache (see above)"
echo "   2. Hard refresh browser (Ctrl+Shift+R / Cmd+Shift+R)"
echo "   3. Verify new assets load in browser DevTools → Network tab"
echo ""
