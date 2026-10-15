#!/usr/bin/env bash
# Builds "Daily Tracker.app" and installs it in ~/Applications, where Spotlight and Launchpad find it.
# Run it again (npm run app) after changing the code; the installed app is replaced.
set -euo pipefail
cd "$(dirname "$0")/.."

APP_NAME="Daily Tracker"
BUNDLE_ID="com.daphutapea.dailytracker"
# ".noindex" keeps Spotlight from listing this build copy next to the installed app.
BUILD_DIR="build/macos.noindex"
APP="$BUILD_DIR/$APP_NAME.app"
DEST="$HOME/Applications"
VERSION="$(node -p "require('./package.json').version")"
BUILD_NUMBER="$(git rev-list --count HEAD 2>/dev/null || echo 1)"

echo "Building the web app"
npm run build --silent

echo "Assembling $APP_NAME.app"
rm -rf "$BUILD_DIR"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp -R dist "$APP/Contents/Resources/web"

xcrun swiftc -O -swift-version 6 -target "$(uname -m)-apple-macos14.0" \
  macos/main.swift -o "$APP/Contents/MacOS/DailyTracker" \
  -framework AppKit -framework WebKit

xcrun swift macos/make-icon.swift "$BUILD_DIR/AppIcon.iconset"
iconutil -c icns "$BUILD_DIR/AppIcon.iconset" -o "$APP/Contents/Resources/AppIcon.icns"

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>$APP_NAME</string>
  <key>CFBundleDisplayName</key><string>$APP_NAME</string>
  <key>CFBundleIdentifier</key><string>$BUNDLE_ID</string>
  <key>CFBundleExecutable</key><string>DailyTracker</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>$VERSION</string>
  <key>CFBundleVersion</key><string>$BUILD_NUMBER</string>
  <key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
  <key>CFBundleDevelopmentRegion</key><string>en</string>
  <key>LSMinimumSystemVersion</key><string>14.0</string>
  <key>LSApplicationCategoryType</key><string>public.app-category.productivity</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSPrincipalClass</key><string>NSApplication</string>
</dict>
</plist>
PLIST

# Ad-hoc signature: enough for an app you build and run on your own Mac.
codesign --force --sign - "$APP" >/dev/null

echo "Checking the app loads"
"$APP/Contents/MacOS/DailyTracker" --smoke-test

echo "Installing to $DEST"
if pgrep -xq DailyTracker; then
  osascript -e "tell application \"$APP_NAME\" to quit" >/dev/null 2>&1 || true
  sleep 1
fi
mkdir -p "$DEST"
rm -rf "$DEST/$APP_NAME.app"
cp -R "$APP" "$DEST/"

# Tell Launch Services and Spotlight about the installed copy now instead of waiting for the next
# index pass, and forget the build copy so "Open with" never points at it.
LSREGISTER=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister
"$LSREGISTER" -u "$APP" >/dev/null 2>&1 || true
"$LSREGISTER" -f "$DEST/$APP_NAME.app"
mdimport "$DEST/$APP_NAME.app" 2>/dev/null || true

echo "Done. Open it from Spotlight: Cmd+Space, then type Daily Tracker."
