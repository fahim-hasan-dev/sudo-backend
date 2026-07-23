import express from 'express'
import { UserController } from './user.controller'
import auth from '../../middleware/auth'
import { USER_ROLES } from '../../../enum/user'
import fileUploadHandler from '../../middleware/fileUploadHandler'

const router = express.Router()

router.get(
  '/me',
  auth(USER_ROLES.USER, USER_ROLES.ADMIN),
  UserController.getProfile,
)
router.get(
  '/dashboard',
  auth(USER_ROLES.USER, USER_ROLES.ADMIN),
  UserController.getDashboardSummary,
)
router.get('/', auth(USER_ROLES.ADMIN), UserController.getAllUser);
router.patch(
  '/profile',
  auth(USER_ROLES.USER, USER_ROLES.ADMIN),
  fileUploadHandler(),
  UserController.updateProfile,
)

// delete my account
router.delete(
  '/me',
  auth(USER_ROLES.USER, USER_ROLES.ADMIN),
  UserController.deleteMyAccount,
)

// get single user
router.get('/:id', UserController.getSingleUser)

// update user by admin
router.patch('/:id', auth(USER_ROLES.ADMIN), UserController.updateUserByAdmin)

// delete user
router.delete('/:id', auth(USER_ROLES.ADMIN), UserController.deleteUser)

export const UserRoutes = router
