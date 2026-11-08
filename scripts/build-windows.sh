#!/usr/bin/env bash
# Builds "LAN-Mahjong-Setup.exe" (the Windows installer) from this project.
# Needs: Node.js + npm (to build), NSIS ("makensis"), and internet access to
# download the Windows version of Node.js (checked against its official checksum).
set -euo pipefail
cd "$(dirname "$0")/.."
NODE_VERSION="22.12.0"
VERSION="${VERSION:-$(node -p "require('./package.json').version")}"
BUILD="build/win"
CACHE="build/cache"

echo "1/4  Building the game screens..."
npm run build --silent

echo "2/4  Packaging the server into one file..."
rm -rf "$BUILD" && mkdir -p "$BUILD/app" "$BUILD/node" "$CACHE"
npx esbuild server/src/main.ts --bundle --platform=node --format=esm --target=node22 \
  --minify --keep-names --legal-comments=none --outfile="$BUILD/app/server.mjs" --external:bufferutil --external:utf-8-validate --log-level=warning \
  "--banner:js=import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);"
cp -r client/dist "$BUILD/app/client"

echo "3/4  Getting Node.js $NODE_VERSION for Windows..."
if [ ! -f "$CACHE/node-$NODE_VERSION.exe" ]; then
  curl -sSfL -o "$CACHE/node.exe" "https://nodejs.org/dist/v$NODE_VERSION/win-x64/node.exe"
  curl -sSfL -o "$CACHE/SHASUMS256.txt" "https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt"
  expected=$(grep " win-x64/node.exe$" "$CACHE/SHASUMS256.txt" | cut -d' ' -f1)
  actual=$(sha256sum "$CACHE/node.exe" | cut -d' ' -f1)
  [ "$expected" = "$actual" ] || { echo "Node.js download does not match its checksum!"; exit 1; }
  mv "$CACHE/node.exe" "$CACHE/node-$NODE_VERSION.exe"
fi
cp "$CACHE/node-$NODE_VERSION.exe" "$BUILD/node/node.exe"

echo "4/4  Making the installer..."
makensis -V2 -DVERSION="$VERSION" -DBUILD="$(pwd)/$BUILD" -DOUTFILE="$(pwd)/LAN-Mahjong-Setup.exe" windows/installer.nsi
ls -lh LAN-Mahjong-Setup.exe
