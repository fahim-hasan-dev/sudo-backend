import { GroupMessage } from './group-message.model';
import { Group } from '../group/group.model';
import ApiError from '../../../errors/ApiError';
import { StatusCodes } from 'http-status-codes';
import { logger } from '../../../shared/logger';

// Retrieve chat history for a group (restricted to members)
const getGroupChatHistory = async (groupId: string, userId: string) => {
  const group = await Group.findById(groupId);
  if (!group) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Group not found');
  }

  // Restrict access to group members
  const isMember = group.members.some((memberId) => String(memberId) === userId);
  if (!isMember) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, 'You are not a member of this group');
  }

  const messages = await GroupMessage.find({ groupId })
    .populate('senderId', 'fullName email image')
    .sort({ createdAt: 1 });

  // Background check and update to mark unread messages as read asynchronously
  (async () => {
    try {
      const hasUnread = await GroupMessage.exists({
        groupId,
        senderId: { $ne: userId },
        readBy: { $ne: userId }
      });

      if (hasUnread) {
        await GroupMessage.updateMany(
          {
            groupId,
            senderId: { $ne: userId },
            readBy: { $ne: userId }
          },
          { $addToSet: { readBy: userId } }
        );

        // Emit unread count reset in real-time to the current user
        const chatNamespace = (global as any).io?.of('/chat');
        if (chatNamespace) {
          chatNamespace.to(`user-${userId}`).emit('unread-count-update', {
            groupId,
            unreadCount: 0
          });
        }
      }
    } catch (err) {
      logger.error('[GroupChatHistory] Failed to mark messages as read in background:', err);
    }
  })();

  return messages;
};

// Send a message inside a group chat
const sendGroupMessage = async (groupId: string, userId: string, text: string) => {
  const group = await Group.findById(groupId);
  if (!group) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Group not found');
  }

  const isMember = group.members.some((memberId) => String(memberId) === userId);
  if (!isMember) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, 'You are not a member of this group');
  }

  // Find active users currently in the group chat room to mark as read immediately
  const chatNamespace = (global as any).io?.of('/chat');
  let activeUserIds: string[] = [];
  if (chatNamespace) {
    try {
      const activeSockets = await chatNamespace.in(groupId).fetchSockets();
      activeUserIds = activeSockets.map((s: any) => String(s.data?.user?.authId));
    } catch (err) {
      // Ignore if fetchSockets fails
    }
  }

  // Ensure sender is marked as read
  if (!activeUserIds.includes(userId)) {
    activeUserIds.push(userId);
  }

  const messageDoc = await GroupMessage.create({
    groupId,
    senderId: userId,
    text,
    readBy: activeUserIds,
  });

  const populatedMessage = await messageDoc.populate('senderId', 'fullName email image');

  // Broadcast to group chat socket room
  chatNamespace?.to(groupId).emit('new-group-message', populatedMessage);

  // Emit unread count updates to non-active/offline group members
  if (chatNamespace) {
    for (const memberId of group.members) {
      const memberIdStr = String(memberId);
      if (activeUserIds.includes(memberIdStr)) continue; // Already read

      const count = await GroupMessage.countDocuments({
        groupId,
        senderId: { $ne: memberIdStr },
        readBy: { $ne: memberIdStr },
      });

      chatNamespace.to(`user-${memberIdStr}`).emit('unread-count-update', {
        groupId,
        unreadCount: count,
      });
    }
  }

  return populatedMessage;
};

// Edit a group chat message (restricted to sender)
const updateGroupMessage = async (messageId: string, userId: string, text: string) => {
  const message = await GroupMessage.findById(messageId);
  if (!message) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Message not found');
  }

  if (String(message.senderId) !== userId) {
    throw new ApiError(StatusCodes.FORBIDDEN, 'You cannot edit this message');
  }

  const updatedMessage = await GroupMessage.findByIdAndUpdate(
    messageId,
    { $set: { text } },
    { new: true }
  ).populate('senderId', 'fullName email image');

  // Broadcast edited message state to socket room
  const chatNamespace = (global as any).io?.of('/chat');
  chatNamespace?.to(String(message.groupId)).emit('update-group-message', updatedMessage);

  return updatedMessage;
};

// Delete a group message (sender or group admin allowed)
const deleteGroupMessage = async (messageId: string, userId: string) => {
  const message = await GroupMessage.findById(messageId);
  if (!message) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Message not found');
  }

  const group = await Group.findById(message.groupId);
  const isSender = String(message.senderId) === userId;
  const isAdmin = group && String(group.admin) === userId;

  if (!isSender && !isAdmin) {
    throw new ApiError(StatusCodes.FORBIDDEN, 'You cannot delete this message');
  }

  await GroupMessage.findByIdAndDelete(messageId);

  // Broadcast deleted message reference to socket room
  const chatNamespace = (global as any).io?.of('/chat');
  chatNamespace?.to(String(message.groupId)).emit('delete-group-message', {
    messageId,
    groupId: message.groupId,
  });

  return { success: true };
};

// Retrieve unread message count for a group
const getUnreadCount = async (groupId: string, userId: string) => {
  const group = await Group.findById(groupId);
  if (!group) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Group not found');
  }

  const isMember = group.members.some((memberId) => String(memberId) === userId);
  if (!isMember) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, 'You are not a member of this group');
  }

  const count = await GroupMessage.countDocuments({
    groupId,
    senderId: { $ne: userId },
    readBy: { $ne: userId },
  });

  return count;
};

// Mark all messages in a group as read for the user
const markMessagesAsRead = async (groupId: string, userId: string) => {
  await GroupMessage.updateMany(
    {
      groupId,
      senderId: { $ne: userId },
      readBy: { $ne: userId },
    },
    { $addToSet: { readBy: userId } }
  );
};

export const GroupMessageService = {
  getGroupChatHistory,
  sendGroupMessage,
  updateGroupMessage,
  deleteGroupMessage,
  getUnreadCount,
  markMessagesAsRead,
};
