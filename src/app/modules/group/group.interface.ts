import { Types } from 'mongoose';

export type IRotationSchedule = {
  periodNumber: number;
  cycleNumber: number;
  receiverId: Types.ObjectId;
  payoutDate: Date;
  status: 'pending' | 'completed';
};

export type IGroup = {
  _id: Types.ObjectId;
  name: string;
  admin: Types.ObjectId;
  contributionAmount: number;
  targetPoolAmount: number;
  paymentFrequency: 'weekly' | 'monthly' | 'quarterly';
  totalCycles: number;
  startDate: Date;
  visibility: 'private' | 'public';
  members: Types.ObjectId[];
  status: 'pending' | 'active' | 'completed';
  rotationSchedule: IRotationSchedule[];
  createdAt: Date;
  updatedAt: Date;
};
