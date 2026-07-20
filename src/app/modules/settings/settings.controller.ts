import { Request, Response } from 'express';
import catchAsync from '../../../shared/catchAsync';
import sendResponse from '../../../shared/sendResponse';
import { SettingsService } from './settings.service';
import { StatusCodes } from 'http-status-codes';

const getSettings = catchAsync(async (req: Request, res: Response) => {
  const result = await SettingsService.getSettings();

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Settings retrieved successfully',
    data: result,
  });
});

const updateSettings = catchAsync(async (req: Request, res: Response) => {
  const result = await SettingsService.updateSettings(req.body);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Settings updated successfully',
    data: result,
  });
});

export const SettingsController = {
  getSettings,
  updateSettings,
};
