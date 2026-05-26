export function initSocketIO(io) {
  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('authenticate', ({ userId }) => {
      if (userId) {
        socket.join(`user_${userId}`);
        console.log(`Socket ${socket.id} joined room user_${userId}`);
      }
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });
}
