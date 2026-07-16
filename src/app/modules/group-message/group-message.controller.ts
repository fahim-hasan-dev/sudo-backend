import { Request, Response } from 'express';
import catchAsync from '../../../shared/catchAsync';
import sendResponse from '../../../shared/sendResponse';
import { StatusCodes } from 'http-status-codes';
import { GroupMessageService } from './group-message.service';
import { JwtPayload } from 'jsonwebtoken';

// Controller to retrieve group chat messages history
const getGroupChatHistory = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as JwtPayload;
  const result = await GroupMessageService.getGroupChatHistory(req.params.groupId, user.authId);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Group chat history retrieved successfully',
    data: result,
  });
});

// Controller to send a message inside a group chat
const sendGroupMessage = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as JwtPayload;
  const { text } = req.body;
  const result = await GroupMessageService.sendGroupMessage(req.params.groupId, user.authId, text);

  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: 'Group message sent successfully',
    data: result,
  });
});

// Controller to update a group message
const updateGroupMessage = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as JwtPayload;
  const { text } = req.body;
  const result = await GroupMessageService.updateGroupMessage(req.params.messageId, user.authId, text);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Group message updated successfully',
    data: result,
  });
});

// Controller to delete a group message
const deleteGroupMessage = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as JwtPayload;
  const result = await GroupMessageService.deleteGroupMessage(req.params.messageId, user.authId);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Group message deleted successfully',
    data: result,
  });
});

export const GroupMessageController = {
  getGroupChatHistory,
  sendGroupMessage,
  updateGroupMessage,
  deleteGroupMessage,
};
