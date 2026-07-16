import { GroupMessage } from './group-message.model';
import { Group } from '../group/group.model';
import ApiError from '../../../errors/ApiError';
import { StatusCodes } from 'http-status-codes';

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

  const messageDoc = await GroupMessage.create({
    groupId,
    senderId: userId,
    text,
  });

  const populatedMessage = await messageDoc.populate('senderId', 'fullName email image');

  // Broadcast to group chat socket room
  const chatNamespace = (global as any).io?.of('/chat');
  chatNamespace?.to(groupId).emit('new-group-message', populatedMessage);

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

export const GroupMessageService = {
  getGroupChatHistory,
  sendGroupMessage,
  updateGroupMessage,
  deleteGroupMessage,
};
