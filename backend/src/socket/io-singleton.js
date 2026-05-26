/**
 * io-singleton.js
 * Safe wrapper around the Socket.IO instance.
 * In local dev (index.js) setIO() is called with the real server.
 * In Vercel serverless, _io stays null and all emits are silent no-ops.
 */
let _io = null;

export function setIO(io) {
  _io = io;
}

export const io = {
  to(room) {
    return {
      emit(event, data) {
        if (_io) _io.to(room).emit(event, data);
      }
    };
  },
  emit(event, data) {
    if (_io) _io.emit(event, data);
  }
};
