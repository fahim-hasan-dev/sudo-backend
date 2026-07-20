import express from 'express';
import auth from '../../middleware/auth';
import { USER_ROLES } from '../../../enum/user';
import validateRequest from '../../middleware/validateRequest';
import { SettingsController } from './settings.controller';
import { updateSettingsZodSchema } from './settings.validation';

const router = express.Router();

router.get(
  '/',
  auth(USER_ROLES.ADMIN, USER_ROLES.USER),
  SettingsController.getSettings
);

router.patch(
  '/',
  auth(USER_ROLES.ADMIN),
  validateRequest(updateSettingsZodSchema),
  SettingsController.updateSettings
);

export const SettingsRoutes = router;
