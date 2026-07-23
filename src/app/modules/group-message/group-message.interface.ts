import { Types } from 'mongoose';

export type IGroupMessage = {
  _id: Types.ObjectId;
  groupId: Types.ObjectId;
  senderId: Types.ObjectId;
  text: string;
  readBy?: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
};
