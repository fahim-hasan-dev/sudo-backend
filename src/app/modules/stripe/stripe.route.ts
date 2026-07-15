import express from 'express';
import auth from '../../middleware/auth';
import { USER_ROLES } from '../../../enum/user';
import { StripeController } from './stripe.controller';

const router = express.Router();

// Initialize connected account onboarding link
router.post(
  '/connect-account',
  auth(USER_ROLES.USER, USER_ROLES.ADMIN),
  StripeController.createConnectedAccount
);

// Verify connected account setup status
router.post(
  '/account-status',
  auth(USER_ROLES.USER, USER_ROLES.ADMIN),
  StripeController.checkConnectedAccountStatus
);

// Obtain express dashboard redirect URL
router.post(
  '/dashboard-link',
  auth(USER_ROLES.USER, USER_ROLES.ADMIN),
  StripeController.createExpressDashboardLink
);

export const StripeRoutes = router;
