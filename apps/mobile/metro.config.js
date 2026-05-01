const fs = require('fs')
const path = require('path')
const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)
const workspaceRoot = path.resolve(__dirname, '../..')

config.resolver.unstable_enableSymlinks = true
config.watchFolders = [...(config.watchFolders || []), workspaceRoot]

// Monorepo + pnpm: ensure Metro walks local and workspace node_modules
config.resolver.nodeModulesPaths = [
  ...(config.resolver.nodeModulesPaths ?? []),
  path.resolve(__dirname, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
]

function resolveMobilePkg(name) {
  const entry = path.join(__dirname, 'node_modules', name)
  try {
    return fs.realpathSync(entry)
  } catch {
    return entry
  }
}

config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  nativewind: path.resolve(__dirname, 'node_modules/nativewind'),
  'react-native-css-interop': path.resolve(__dirname, 'node_modules/react-native-css-interop'),
  'query-string': path.resolve(__dirname, 'node_modules/query-string'),
  // pnpm symlinks: Metro must resolve to the real package path
  'expo-linear-gradient': resolveMobilePkg('expo-linear-gradient'),
}

module.exports = config
