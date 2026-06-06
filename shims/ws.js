// Shim for the 'ws' WebSocket package.
// React Native ships a native WebSocket implementation as a global.
// Supabase Realtime imports 'ws' on the server-side path; redirecting it to
// the global WebSocket lets Supabase work without any Node.js built-ins.
const NativeWebSocket = global.WebSocket;

function WebSocketShim(url, protocols, options) {
  return new NativeWebSocket(url, protocols);
}

WebSocketShim.prototype = NativeWebSocket.prototype;
WebSocketShim.WebSocket = WebSocketShim;
WebSocketShim.Server = function () {
  throw new Error('WebSocket.Server is not available in React Native');
};

module.exports = WebSocketShim;
