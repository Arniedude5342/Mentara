const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Provide empty shims for Node.js core modules not available in React Native.
// The 'ws' package (used by Supabase) tries to require 'stream', which doesn't exist in RN.
config.resolver.extraNodeModules = {
  // Node.js built-ins — shimmed with empty stubs so packages that import them
  // on a server-side code path don't crash the Metro bundler.
  stream: path.resolve(__dirname, 'shims/empty.js'),
  crypto: path.resolve(__dirname, 'shims/empty.js'),
  http: path.resolve(__dirname, 'shims/empty.js'),
  https: path.resolve(__dirname, 'shims/empty.js'),
  net: path.resolve(__dirname, 'shims/empty.js'),
  tls: path.resolve(__dirname, 'shims/empty.js'),
  zlib: path.resolve(__dirname, 'shims/empty.js'),
  url: path.resolve(__dirname, 'shims/empty.js'),
  // events — use the browser-compatible polyfill
  events: path.resolve(__dirname, 'node_modules/events'),
  // ws — redirect to React Native's native WebSocket global so Supabase
  // Realtime works without pulling in any Node.js built-ins.
  ws: path.resolve(__dirname, 'shims/ws.js'),
  // undici and expo-server are Node.js-only CLI dependencies pulled in by
  // expo@54.0.35 that must never reach the React Native bundle. They use
  // private class fields (#field) which older Hermes versions can't parse.
  undici: path.resolve(__dirname, 'shims/empty.js'),
  'expo-server': path.resolve(__dirname, 'shims/empty.js'),
};

module.exports = config;
