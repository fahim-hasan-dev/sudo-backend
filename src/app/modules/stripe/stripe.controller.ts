import { Request, Response } from 'express';
import catchAsync from '../../../shared/catchAsync';
import sendResponse from '../../../shared/sendResponse';
import { StatusCodes } from 'http-status-codes';
import { StripeService } from './stripe.service';
import { JwtPayload } from 'jsonwebtoken';

// Controller to initialize Stripe Connect onboarding session
const createConnectedAccount = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as JwtPayload;
  const result = await StripeService.createExpressConnectedAccount(user.id);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Stripe onboarding URL generated successfully',
    data: result,
  });
});

// Controller to check connected account onboarding status
const checkConnectedAccountStatus = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as JwtPayload;
  const result = await StripeService.checkConnectedAccountStatus(user.id);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Stripe account status verified successfully',
    data: result,
  });
});

// Controller to retrieve Stripe dashboard login link
const createExpressDashboardLink = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as JwtPayload;
  const result = await StripeService.createExpressDashboardLink(user.id);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Stripe Express dashboard login link generated successfully',
    data: result,
  });
});

export const StripeController = {
  createConnectedAccount,
  checkConnectedAccountStatus,
  createExpressDashboardLink,
};
