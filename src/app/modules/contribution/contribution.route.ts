import express from 'express';
import auth from '../../middleware/auth';
import { USER_ROLES } from '../../../enum/user';
import { ContributionController } from './contribution.controller';

const router = express.Router();

// Retrieve authenticated user's transaction history
router.get(
  '/history',
  auth(USER_ROLES.USER, USER_ROLES.ADMIN),
  ContributionController.getUserContributionHistory
);

// Retrieve authenticated user's outstanding (current & overdue) dues
router.get(
  '/outstanding',
  auth(USER_ROLES.USER, USER_ROLES.ADMIN),
  ContributionController.getUserOutstandingContributions
);

export const ContributionRoutes = router;
