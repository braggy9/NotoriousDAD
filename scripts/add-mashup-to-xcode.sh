#!/bin/bash

# Script to add MashupManager.swift to iOS Xcode project
# This opens Xcode so you can manually drag the file in

echo "📱 Adding MashupManager.swift to iOS Xcode project..."
echo ""
echo "MANUAL STEPS REQUIRED:"
echo "1. Opening Xcode project..."
open /Users/tombragg/dj-mix-generator/NotoriousDAD-iOS/NotoriousDAD.xcodeproj

echo ""
echo "2. In Xcode, locate the file in Finder:"
echo "   NotoriousDAD-iOS/NotoriousDAD/Services/MashupManager.swift"
echo ""
echo "3. Drag MashupManager.swift into the 'Services' folder in Xcode"
echo "   Make sure to:"
echo "   ✓ Check 'Copy items if needed' (it's already there, so uncheck this)"
echo "   ✓ Check 'NotoriousDAD' target"
echo "   ✓ Click 'Finish'"
echo ""
echo "4. Build the project (Cmd+B) to verify"
echo ""
echo "File location: NotoriousDAD-iOS/NotoriousDAD/Services/MashupManager.swift"
echo ""
echo "Press Enter after you've added the file to Xcode..."
read

# Verify the file was added by attempting a build
echo "Verifying build..."
xcodebuild -project /Users/tombragg/dj-mix-generator/NotoriousDAD-iOS/NotoriousDAD.xcodeproj \
  -scheme NotoriousDAD-iOS \
  -configuration Debug \
  -sdk iphonesimulator \
  clean build \
  ONLY_ACTIVE_ARCH=NO 2>&1 | grep -E "(BUILD SUCCEEDED|error:)" | tail -5

echo ""
echo "✅ If you see 'BUILD SUCCEEDED' above, the integration is complete!"
echo "❌ If you see errors, please check the Xcode project and try again."
