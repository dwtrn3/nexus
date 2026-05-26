import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import session from 'express-session';
import { createClient } from 'redis';
import { RedisStore } from 'connect-redis';
import { Server as SocketIOServer } from 'socket.io';
import { pool, testConnection } from './config/database.js';
import authRoutes from './routes/auth.js';
import whatsappRoutes from './routes/whatsapp.js';
import slackRoutes from './routes/slack.js';
import gmailRoutes from './routes/gmail.js';
import googleChatRoutes from './routes/googleChat.js';
import messagesRoutes from './routes/messages.js';
import settingsRoutes from './routes/settings.js';
import { initSocketIO } from './socket/index.js';
import passport from 'passport';
import { configurePassport } from './config/passport.js';

const app = express();
const server = http.createServer(app);

// Redis client
const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});
redisClient.connect().catch(console.error);

export { redisClient };

// Session store
const redisStore = new RedisStore({ client: redisClient });

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(session({
  store: redisStore,
  secret: process.env.SESSION_SECRET || 'nexus-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
}));

app.use(passport.initialize());
app.use(passport.session());
configurePassport(passport);

// Socket.IO
const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true
  }
});
initSocketIO(io);
export { io };

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/slack', slackRoutes);
app.use('/api/gmail', gmailRoutes);
app.use('/api/google-chat', googleChatRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/settings', settingsRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

const PORT = process.env.PORT || 3001;

async function start() {
  await testConnection();
  server.listen(PORT, () => {
    console.log(`Nexus backend running on port ${PORT}`);
  });
}

start();
