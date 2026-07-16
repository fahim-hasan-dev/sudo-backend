import { Types } from 'mongoose';

export type IContribution = {
  _id: Types.ObjectId;
  groupId: Types.ObjectId;
  periodNumber: number;
  senderId: Types.ObjectId;
  receiverId: Types.ObjectId;
  amount: number;
  commissionAmount: number;
  transferAmount: number;
  stripeSessionId: string;
  status: 'unpaid' | 'paid' | 'failed';
  paymentDate?: Date;
  createdAt: Date;
  updatedAt: Date;
};
