// Expo loads config plugins as CommonJS modules during prebuild.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { withAppBuildGradle } = require("@expo/config-plugins");

const RELEASE_BLOCK = /^([ \t]*release[ \t]*\{[ \t]*\r?\n)([\s\S]*?)(\r?\n[ \t]*\})/m;
const DEBUG_SIGNING_LINE = /^[ \t]*signingConfig[ \t]+signingConfigs\.debug[ \t]*$/m;
const UNSIGNED_MARKER = "// enV: Release artifacts intentionally remain unsigned until a production keystore is configured.";
const RELEASE_SIGNING_MARKER = "// enV: Production signing is supplied by CI or a local environment, never committed.";
const RELEASE_SIGNING_CONFIG = `        ${RELEASE_SIGNING_MARKER}
        release {
            if (System.getenv('ANDROID_KEYSTORE_FILE') && System.getenv('ANDROID_KEYSTORE_PASSWORD') && System.getenv('ANDROID_KEY_ALIAS') && System.getenv('ANDROID_KEY_PASSWORD')) {
                storeFile file(System.getenv('ANDROID_KEYSTORE_FILE'))
                storePassword System.getenv('ANDROID_KEYSTORE_PASSWORD')
                keyAlias System.getenv('ANDROID_KEY_ALIAS')
                keyPassword System.getenv('ANDROID_KEY_PASSWORD')
            }
        }
`;
const RELEASE_SIGNING_ASSIGNMENT = `            if (System.getenv('ANDROID_KEYSTORE_FILE') && System.getenv('ANDROID_KEYSTORE_PASSWORD') && System.getenv('ANDROID_KEY_ALIAS') && System.getenv('ANDROID_KEY_PASSWORD')) {
                signingConfig signingConfigs.release
            }`;
module.exports = function withUnsignedAndroidRelease(config) {
  return withAppBuildGradle(config, (modConfig) => {
    const contents = modConfig.modResults.contents;
    if (contents.includes(RELEASE_SIGNING_MARKER)) return modConfig;
    const match = RELEASE_BLOCK.exec(contents);
    if (!match) {
      throw new Error("Could not find the Android release build type to enforce enV signing policy.");
    }

    const releaseBody = match[2];
    if (releaseBody.includes(UNSIGNED_MARKER)) return modConfig;
    if (!DEBUG_SIGNING_LINE.test(releaseBody)) {
      throw new Error("Expected the generated Android release debug-signing line; refusing to guess at the signing configuration.");
    }

    const safeReleaseBody = releaseBody.replace(DEBUG_SIGNING_LINE, `            ${UNSIGNED_MARKER}\n${RELEASE_SIGNING_ASSIGNMENT}`);
    const withReleaseSigning = contents.replace(RELEASE_BLOCK, `${match[1]}${safeReleaseBody}${match[3]}`);
    modConfig.modResults.contents = withReleaseSigning.replace(/(\s{4}signingConfigs\s*\{[\s\S]*?\n)(\s{4}\}\n\s{4}buildTypes\s*\{)/m, `$1${RELEASE_SIGNING_CONFIG}$2`);
    return modConfig;
  });
};
