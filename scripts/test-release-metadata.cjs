const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assertFile(relativePath) {
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Expected ${relativePath} to exist`);
  }
}

function assertIncludes(relativePath, expected) {
  const content = read(relativePath);
  if (!content.includes(expected)) {
    throw new Error(`Expected ${relativePath} to include ${expected}`);
  }
}

assertFile("scripts/write-release-metadata.cjs");
assertFile("src/lib/releaseMetadata.ts");
assertFile("src/generated/releaseMetadata.ts");

assertIncludes("src/lib/releaseMetadata.ts", "getReleaseMetadata");
assertIncludes("src/lib/releaseMetadata.ts", "getEnvironmentLabel");
assertIncludes("src/lib/releaseMetadata.ts", "isProductionEnvironment");

assertIncludes("src/vite-env.d.ts", "VITE_APP_ENV");
assertIncludes("src/vite-env.d.ts", "VITE_RELEASE_VERSION");
assertIncludes("src/vite-env.d.ts", "VITE_RELEASE_COMMIT");
assertIncludes("src/vite-env.d.ts", "VITE_RELEASE_DEPLOYED_AT");

assertIncludes(".env.example", "VITE_APP_ENV");
assertIncludes(".env.example", "VITE_RELEASE_VERSION");
assertIncludes(".env.example", "VITE_RELEASE_COMMIT");
assertIncludes(".env.example", "VITE_RELEASE_DEPLOYED_AT");

assertIncludes("deploy.ps1", "VITE_APP_ENV");
assertIncludes("deploy.ps1", "Release metadata");
assertIncludes("deploy.ps1", "Assert-EnvironmentTargetSafety");

assertIncludes("src/components/SystemSettingsPanel.tsx", "getReleaseMetadata");
assertIncludes("src/components/SystemSettingsPanel.tsx", "Release Metadata");

console.log("Release metadata foundation checks passed");
