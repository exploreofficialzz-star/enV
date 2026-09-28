const { withAppBuildGradle } = require("@expo/config-plugins");

const RELEASE_BLOCK = /^([ \t]*release[ \t]*\{[ \t]*\r?\n)([\s\S]*?)(\r?\n[ \t]*\})/m;
const DEBUG_SIGNING_LINE = /^[ \t]*signingConfig[ \t]+signingConfigs\.debug[ \t]*$/m;
const UNSIGNED_MARKER = "// enV: Release artifacts intentionally remain unsigned until a production keystore is configured.";

module.exports = function withUnsignedAndroidRelease(config) {
  return withAppBuildGradle(config, (modConfig) => {
    const contents = modConfig.modResults.contents;
    const match = RELEASE_BLOCK.exec(contents);
    if (!match) {
      throw new Error("Could not find the Android release build type to enforce enV signing policy.");
    }

    const releaseBody = match[2];
    if (releaseBody.includes(UNSIGNED_MARKER)) return modConfig;
    if (!DEBUG_SIGNING_LINE.test(releaseBody)) {
      throw new Error("Expected the generated Android release debug-signing line; refusing to guess at the signing configuration.");
    }

    const safeReleaseBody = releaseBody.replace(DEBUG_SIGNING_LINE, `            ${UNSIGNED_MARKER}`);
    modConfig.modResults.contents = contents.replace(RELEASE_BLOCK, `${match[1]}${safeReleaseBody}${match[3]}`);
    return modConfig;
  });
};
