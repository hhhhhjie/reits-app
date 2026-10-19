#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"

export EXPO_NO_TELEMETRY="${EXPO_NO_TELEMETRY:-1}"
export NODE_ENV=production
export CI=1

# Reuse prepared cloud tools; respect a developer's existing tool locations.
if [[ -d /workspace/android-sdk ]]; then
  export ANDROID_HOME="${ANDROID_HOME:-/workspace/android-sdk}"
  export ANDROID_USER_HOME="${ANDROID_USER_HOME:-/workspace/android-tools/user}"
  export GRADLE_USER_HOME="${GRADLE_USER_HOME:-/workspace/.gradle}"
fi
if [[ -d /workspace/java-17/jdk-17.0.20.1+1 ]]; then
  export JAVA_HOME="${JAVA_HOME:-/workspace/java-17/jdk-17.0.20.1+1}"
fi

if [[ ! -f android/gradlew ]]; then
  printf '%s\n' 'Generate the Android project first: npm run prebuild:android' >&2
  exit 1
fi

gradle_args=(--no-daemon "--max-workers=${ANDROID_BUILD_WORKERS:-3}"
  "-PreactNativeArchitectures=${ANDROID_BUILD_ABIS:-arm64-v8a}")
init_script="${ANDROID_MAVEN_INIT_SCRIPT:-/workspace/android-tools/verified-react.init.gradle}"
if [[ -f "$init_script" ]]; then
  gradle_args+=(--init-script "$init_script")
fi

(cd android && ./gradlew "${gradle_args[@]}" assembleRelease)

output_dir="$project_root/builds"
mkdir -p "$output_dir"
cp android/app/build/outputs/apk/release/app-release.apk "$output_dir/zhixing-android-preview.apk"
chmod 644 "$output_dir/zhixing-android-preview.apk"
printf '%s\n' "APK: $output_dir/zhixing-android-preview.apk"
