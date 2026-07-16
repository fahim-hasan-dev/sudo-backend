import express from 'express';
import auth from '../../middleware/auth';
import { USER_ROLES } from '../../../enum/user';
import { GroupInvitationController } from './group-invitation.controller';

const router = express.Router();

// Retrieve invitations addressed to the logged-in user
router.get(
  '/my-invitations',
  auth(USER_ROLES.USER, USER_ROLES.ADMIN),
  GroupInvitationController.getMyInvitations
);

// Send a group invitation to a user
router.post(
  '/send',
  auth(USER_ROLES.USER, USER_ROLES.ADMIN),
  GroupInvitationController.sendInvitation
);

// Accept or decline an invitation
router.post(
  '/respond/:invitationId',
  auth(USER_ROLES.USER, USER_ROLES.ADMIN),
  GroupInvitationController.respondToInvitation
);

export const GroupInvitationRoutes = router;
