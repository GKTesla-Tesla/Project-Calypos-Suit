# Calypso Asset — Android app

The Calypso Asset page packaged as an installable Android app. Records are stored on the
phone (WebView localStorage). Use Migration → **Export all records** to back up or move
data, and Migration → upload to bring records in from the web version or another phone.

## Build

Needs JDK 17+, the Android SDK (platform 35), and Node 20.

    cd web && npm install && node build-web.mjs && cd ..
    ./gradlew assembleRelease

The APK is written to `app/build/outputs/apk/release/app-release.apk`.
Pushing to `main` on GitHub runs `.github/workflows/build-apk.yml`, which builds the same
APK and attaches it to the run as a downloadable artifact.

## Updating the page

`web/calypso-asset.html` is the same page as the claude.ai version. Edit it, rerun
`node web/build-web.mjs`, bump `versionCode` in `app/build.gradle`, and rebuild.

## Signing

Release builds are signed with a key supplied through repository secrets, so it never
appears in this public repo:

- `CALYPSO_KEYSTORE_BASE64`: the `.jks` keystore, base64-encoded
- `CALYPSO_KEYSTORE_PASSWORD`: its password (key alias `calypso`)

Use the same key for every build. Android only installs an update over the existing app
(keeping its data) when both are signed with the same key. Without the secrets, CI signs
with a throwaway debug key and the APK has to be installed fresh.
