import colors from 'colors';
import { Server, Socket } from 'socket.io';
import { createClient } from 'redis';
import { createAdapter } from '@socket.io/redis-adapter';
import { logger } from '../shared/logger';
import config from '../config';
import { jwtHelper } from './jwtHelper';
import { Secret } from 'jsonwebtoken';
import { GroupMessage } from '../app/modules/group-message/group-message.model';

// Secure socket connections with JWT verification middleware
const verifySocketToken = (socket: Socket, next: (err?: Error) => void) => {
  const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization;

  if (!token) {
    return next(new Error('Authentication error: Token missing'));
  }

  const cleanToken = token.startsWith('Bearer ') ? token.split(' ')[1] : token;

  try {
    const decoded = jwtHelper.verifyToken(cleanToken, config.jwt.jwt_secret as Secret);
    socket.data.user = decoded;
    next();
  } catch (err) {
    next(new Error('Authentication error: Invalid or expired token'));
  }
};

const socket = async (io: Server) => {
  // Bind Redis Adapter for scaling and socket clustering
  try {
    const pubClient = createClient({ url: config.redis_url });
    const subClient = pubClient.duplicate();

    await Promise.all([pubClient.connect(), subClient.connect()]);
    io.adapter(createAdapter(pubClient, subClient));
    logger.info(colors.green('🔌 Redis socket adapter bound successfully'));
  } catch (err) {
    logger.warn('[SocketRedis] Redis server not available or connection failed. Falling back to default adapter.');
  }

  // Namespace 1: Group Chat Connection
  const chatNamespace = io.of('/chat');
  chatNamespace.use(verifySocketToken);

  chatNamespace.on('connection', (socket: Socket) => {
    const userId = socket.data.user.id;
    logger.info(colors.blue(`💬 User ${userId} connected to /chat namespace`));

    // Join a group room
    socket.on('join-group-chat', (groupId: string) => {
      socket.join(groupId);
      logger.info(`👥 User ${userId} joined room: ${groupId}`);
    });

    // Handle sending message inside group chat
    socket.on('send-group-message', async (payload: { groupId: string; text: string }) => {
      const { groupId, text } = payload;
      if (!groupId || !text) return;

      try {
        // Save group message to database
        const messageDoc = await GroupMessage.create({
          groupId,
          senderId: userId,
          text,
        });

        const populatedMessage = await messageDoc.populate('senderId', 'fullName email image');

        // Broadcast message to room
        chatNamespace.to(groupId).emit('new-group-message', populatedMessage);
      } catch (error) {
        logger.error('[GroupChatSocket] Failed to persist and broadcast message:', error);
      }
    });

    socket.on('disconnect', () => {
      logger.info(colors.red(`💬 User ${userId} disconnected from /chat`));
    });
  });

  // Namespace 2: System Notifications Connection
  const notificationNamespace = io.of('/notification');
  notificationNamespace.use(verifySocketToken);

  notificationNamespace.on('connection', (socket: Socket) => {
    const userId = socket.data.user.id;
    logger.info(colors.magenta(`🔔 User ${userId} connected to /notification namespace`));

    // Join user's individual room for personal notifications
    socket.join(userId);

    // Join group notification room for broadcast announcements
    socket.on('join-group-notifications', (groupId: string) => {
      socket.join(`notify-group-${groupId}`);
      logger.info(`📢 User ${userId} registered for group notifications: ${groupId}`);
    });

    socket.on('disconnect', () => {
      logger.info(colors.red(`🔔 User ${userId} disconnected from /notification`));
    });
  });
};

export const socketHelper = { socket };
