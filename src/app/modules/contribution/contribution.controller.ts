import { Request, Response } from 'express';
import catchAsync from '../../../shared/catchAsync';
import sendResponse from '../../../shared/sendResponse';
import { StatusCodes } from 'http-status-codes';
import { ContributionService } from './contribution.service';
import { JwtPayload } from 'jsonwebtoken';

// Controller to get user's contribution transaction logs
const getUserContributionHistory = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as JwtPayload;
  const { type, groupId } = req.query;

  const result = await ContributionService.getUserContributionHistory(user.authId, {
    type: type as 'paid' | 'received' | 'all',
    groupId: groupId as string,
  });

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'User contribution history retrieved successfully',
    data: result,
  });
});

// Controller to get user's outstanding dues (current and overdue)
const getUserOutstandingContributions = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as JwtPayload;
  const result = await ContributionService.getUserOutstandingContributions(user.authId);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'User outstanding contributions retrieved successfully',
    data: result,
  });
});

// Controller to get all contributions for admin
const getAllContributions = catchAsync(async (req: Request, res: Response) => {
  const result = await ContributionService.getAllContributions(req.query);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Contributions retrieved successfully',
    data: result,
  });
});

export const ContributionController = {
  getUserContributionHistory,
  getUserOutstandingContributions,
  getAllContributions,
};
