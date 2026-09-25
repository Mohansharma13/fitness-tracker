const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo-sqlite's web implementation imports its WebAssembly binary as an asset.
config.resolver.assetExts.push('wasm');

module.exports = config;
