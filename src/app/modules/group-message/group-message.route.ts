import express from 'express';
import auth from '../../middleware/auth';
import { USER_ROLES } from '../../../enum/user';
import { GroupMessageController } from './group-message.controller';

const router = express.Router();

// Get unread message count for a group
router.get(
  '/unread-count/:groupId',
  auth(USER_ROLES.USER, USER_ROLES.ADMIN),
  GroupMessageController.getUnreadCount
);

// Retrieve group messages logs
router.get(
  '/:groupId',
  auth(USER_ROLES.USER, USER_ROLES.ADMIN),
  GroupMessageController.getGroupChatHistory
);

// Send message to group chat
router.post(
  '/:groupId',
  auth(USER_ROLES.USER, USER_ROLES.ADMIN),
  GroupMessageController.sendGroupMessage
);

// Edit message (restricted to sender)
router.patch(
  '/:messageId',
  auth(USER_ROLES.USER, USER_ROLES.ADMIN),
  GroupMessageController.updateGroupMessage
);

// Delete message (sender or group admin)
router.delete(
  '/:messageId',
  auth(USER_ROLES.USER, USER_ROLES.ADMIN),
  GroupMessageController.deleteGroupMessage
);

export const GroupMessageRoutes = router;
