import { Schema, model } from 'mongoose';
import { IGroup, IRotationSchedule } from './group.interface';

const RotationScheduleSchema = new Schema<IRotationSchedule>({
  periodNumber: { type: Number, required: true },
  cycleNumber: { type: Number, required: true },
  receiverId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  payoutDate: { type: Date, required: true },
  status: { type: String, enum: ['pending', 'completed'], default: 'pending', required: true },
});

const GroupSchema = new Schema<IGroup>(
  {
    name: { type: String, required: true, trim: true },
    admin: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    contributionAmount: { type: Number, required: true },
    targetPoolAmount: { type: Number, required: true },
    paymentFrequency: { type: String, enum: ['weekly', 'monthly', 'quarterly'], required: true },
    totalCycles: { type: Number, required: true },
    startDate: { type: Date, required: true },
    visibility: { type: String, enum: ['private', 'public'], required: true },
    members: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    status: { type: String, enum: ['pending', 'active', 'completed'], default: 'pending' },
    rotationSchedule: [RotationScheduleSchema],
  },
  { timestamps: true }
);

export const Group = model<IGroup>('Group', GroupSchema);
