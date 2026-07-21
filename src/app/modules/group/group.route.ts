import express from 'express';
import auth from '../../middleware/auth';
import { USER_ROLES } from '../../../enum/user';
import { GroupController } from './group.controller';
import validateRequest from '../../middleware/validateRequest';
import { createGroupZodSchema, updateGroupZodSchema } from './group.validation';

const router = express.Router();

// Get groups authenticated user belongs to
router.get(
  '/my-groups',
  auth(USER_ROLES.USER, USER_ROLES.ADMIN),
  GroupController.getUserGroups
);

// Create new group
router.post(
  '/create',
  auth(USER_ROLES.USER, USER_ROLES.ADMIN),
  validateRequest(createGroupZodSchema),
  GroupController.createGroup
);

// Join existing group
router.post(
  '/join/:id',
  auth(USER_ROLES.USER, USER_ROLES.ADMIN),
  GroupController.joinGroup
);

// Leave existing group
router.post(
  '/leave/:id',
  auth(USER_ROLES.USER, USER_ROLES.ADMIN),
  GroupController.leaveGroup
);

// Start group rotation schedule
router.post(
  '/start/:id',
  auth(USER_ROLES.USER, USER_ROLES.ADMIN),
  GroupController.startGroupRotation
);

// Pause group rotation schedule
router.post(
  '/pause/:id',
  auth(USER_ROLES.USER, USER_ROLES.ADMIN),
  GroupController.pauseGroup
);

// Pay contribution for current period
router.post(
  '/pay/:id',
  auth(USER_ROLES.USER, USER_ROLES.ADMIN),
  GroupController.payContribution
);

// Get payment tracking status
router.get(
  '/status/:id',
  auth(USER_ROLES.USER, USER_ROLES.ADMIN),
  GroupController.trackGroupPayments
);

// Get specific period member payment status history
router.get(
  '/period-history/:id',
  auth(USER_ROLES.USER, USER_ROLES.ADMIN),
  GroupController.getGroupPeriodHistory
);

// Get single group details
router.get(
  '/:id',
  auth(USER_ROLES.USER, USER_ROLES.ADMIN),
  GroupController.getGroupDetails
);

// Update group configuration (only allowed in pending status)
router.patch(
  '/:id',
  auth(USER_ROLES.USER, USER_ROLES.ADMIN),
  validateRequest(updateGroupZodSchema),
  GroupController.updateGroup
);

// Get all groups 
router.get(
  '/',
  auth(USER_ROLES.USER, USER_ROLES.ADMIN),
  GroupController.getAllGroups
);

export const GroupRoutes = router;
