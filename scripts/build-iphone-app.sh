#!/usr/bin/env bash
# Builds Daily Tracker for iPhone and installs it on the iPhone plugged into this Mac.
#
#   npm run iphone                 build, install and open it on your iPhone
#   npm run iphone -- --simulator  build it and run it in the iOS Simulator instead
#
# Signing uses the Apple ID signed in to Xcode (Xcode > Settings > Accounts). With a free Apple ID
# the app stops opening after 7 days; run this again to renew it. docs/SETUP.md has the one-time
# steps on the phone (Developer Mode, trusting your profile).
set -euo pipefail
cd "$(dirname "$0")/.."

BUNDLE_ID="com.daphutapea.dailytracker"
PROJECT="ios/DailyTracker.xcodeproj"
OUT="$PWD/build/ios"

echo "Building the web app"
npm run build --silent
npm run build:native --silent

if [[ "${1:-}" == "--simulator" ]]; then
  echo "Building for the simulator"
  xcodebuild -project "$PROJECT" -target DailyTracker -sdk iphonesimulator -configuration Debug \
    SYMROOT="$OUT" CODE_SIGNING_ALLOWED=NO build -quiet
  xcrun simctl boot "iPhone 17" 2>/dev/null || true
  open -a Simulator
  xcrun simctl install booted "$OUT/Debug-iphonesimulator/Daily Tracker.app"
  xcrun simctl launch booted "$BUNDLE_ID" >/dev/null
  echo "Running in the iOS Simulator."
  exit 0
fi

# The first iPhone that's connected and paired: its id for installing, and its hardware id, which a
# free Apple ID needs to make a signing profile for that phone.
LIST="$(mktemp)"
xcrun devicectl list devices --json-output "$LIST" >/dev/null 2>&1 || true
read -r DEVICE UDID < <(node -e '
  const list = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).result?.devices ?? []
  const phone = list.find((d) => d.hardwareProperties?.deviceType === "iPhone" && d.hardwareProperties?.reality === "physical"
    && d.connectionProperties?.pairingState === "paired")
  if (phone) console.log(phone.identifier, phone.hardwareProperties.udid)
' "$LIST" 2>/dev/null || true)
rm -f "$LIST"
if [[ -z "${DEVICE:-}" ]]; then
  echo "No iPhone found. Plug it in with a cable, unlock it, and tap Trust if it asks." >&2
  exit 1
fi

# The team of the Apple ID signed in to Xcode, or the one in DEVELOPMENT_TEAM.
TEAM="${DEVELOPMENT_TEAM:-$(defaults read com.apple.dt.Xcode IDEProvisioningTeamByIdentifier 2>/dev/null \
  | sed -n 's/.*teamID = \([A-Z0-9]\{10\}\);.*/\1/p' | head -1)}"
if [[ -z "$TEAM" ]]; then
  echo "No Apple ID in Xcode yet. Open Xcode > Settings > Accounts, add your Apple ID, then run this again." >&2
  exit 1
fi

echo "Building for your iPhone"
xcodebuild -project "$PROJECT" -scheme DailyTracker -configuration Release \
  -destination "platform=iOS,id=$UDID" -derivedDataPath "$OUT/derived" DEVELOPMENT_TEAM="$TEAM" \
  -allowProvisioningUpdates -allowProvisioningDeviceRegistration build -quiet

echo "Installing"
xcrun devicectl device install app --device "$DEVICE" "$OUT/derived/Build/Products/Release-iphoneos/Daily Tracker.app" >/dev/null
xcrun devicectl device process launch --device "$DEVICE" "$BUNDLE_ID" >/dev/null 2>&1 \
  || echo "Installed. If it doesn't open, trust your profile on the phone: Settings > General > VPN & Device Management."
echo "Done. Daily Tracker is on your iPhone."
