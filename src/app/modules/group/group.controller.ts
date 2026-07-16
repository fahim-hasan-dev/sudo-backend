import { Request, Response } from 'express';
import catchAsync from '../../../shared/catchAsync';
import sendResponse from '../../../shared/sendResponse';
import { StatusCodes } from 'http-status-codes';
import { GroupService } from './group.service';
import { JwtPayload } from 'jsonwebtoken';

// Controller to create a new group
const createGroup = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as JwtPayload;
  const result = await GroupService.createGroup(user.id, req.body);

  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: 'Group created successfully',
    data: result,
  });
});

// Controller to join a group
const joinGroup = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as JwtPayload;
  const result = await GroupService.joinGroup(user.id, req.params.id);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Joined group successfully',
    data: result,
  });
});

// Controller to start group rotation schedule
const startGroupRotation = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as JwtPayload;
  const result = await GroupService.startGroupRotation(user.id, req.params.id);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Group rotation schedule activated successfully',
    data: result,
  });
});

// Controller to pay contribution for current period
const payContribution = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as JwtPayload;
  const result = await GroupService.payContribution(user.id, req.params.id);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Contribution checkout session generated successfully',
    data: result,
  });
});

// Controller to retrieve tracking and payment logs
const trackGroupPayments = catchAsync(async (req: Request, res: Response) => {
  const result = await GroupService.trackGroupPayments(req.params.id);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Group payment status tracked successfully',
    data: result,
  });
});

// Controller to get group details
const getGroupDetails = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as JwtPayload;
  const result = await GroupService.getGroupDetails(req.params.id, user.id);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Group details retrieved successfully',
    data: result,
  });
});

// Controller to query all groups (admin sees all, user sees public only)
const getAllGroups = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as JwtPayload;
  const result = await GroupService.getAllGroups(user.id, user.role, req.query);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Groups retrieved successfully',
    data: result,
  });
});

// Controller to retrieve groups that the authenticated user belongs to
const getUserGroups = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as JwtPayload;
  const result = await GroupService.getUserGroups(user.id);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'My groups retrieved successfully',
    data: result,
  });
});

export const GroupController = {
  createGroup,
  joinGroup,
  startGroupRotation,
  payContribution,
  trackGroupPayments,
  getGroupDetails,
  getAllGroups,
  getUserGroups,
};
