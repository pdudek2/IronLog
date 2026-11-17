// The release script derives the runtime version from this fingerprint; versions, the runtime string and npm scripts do not change native code.
/** @type {import('expo/fingerprint').Config} */
module.exports = {
  sourceSkips: ['ExpoConfigVersions', 'ExpoConfigRuntimeVersionIfString', 'PackageJsonScriptsAll'],
}
