import { Request, Response } from 'express';
import catchAsync from '../../../shared/catchAsync';
import sendResponse from '../../../shared/sendResponse';
import { StatusCodes } from 'http-status-codes';
import { GroupInvitationService } from './group-invitation.service';
import { JwtPayload } from 'jsonwebtoken';

// Send a group invitation to a user
const sendInvitation = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as JwtPayload;
  const { groupId, receiverId } = req.body;
  const result = await GroupInvitationService.sendInvitation(user.authId, groupId, receiverId);

  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: 'Group invitation sent successfully',
    data: result,
  });
});

// Retrieve pending invitations for the logged-in user
const getMyInvitations = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as JwtPayload;
  const result = await GroupInvitationService.getMyInvitations(user.authId);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Pending group invitations retrieved successfully',
    data: result,
  });
});

// Accept or decline an invitation
const respondToInvitation = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as JwtPayload;
  const { action } = req.body;
  const result = await GroupInvitationService.respondToInvitation(
    req.params.invitationId,
    user.authId,
    action
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: `Invitation ${action}ed successfully`,
    data: result,
  });
});

export const GroupInvitationController = {
  sendInvitation,
  getMyInvitations,
  respondToInvitation,
};
