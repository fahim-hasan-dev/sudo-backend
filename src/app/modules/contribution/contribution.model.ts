import { Schema, model } from 'mongoose';
import { IContribution } from './contribution.interface';

const ContributionSchema = new Schema<IContribution>(
  {
    groupId: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
    periodNumber: { type: Number, required: true },
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    receiverId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true },
    commissionAmount: { type: Number, required: true },
    transferAmount: { type: Number, required: true },
    stripeSessionId: { type: String, required: true, trim: true },
    status: { type: String, enum: ['unpaid', 'paid', 'failed'], default: 'unpaid', required: true },
    paymentDate: { type: Date },
    transactionId: { type: String },
  },
  { timestamps: true }
);

export const Contribution = model<IContribution>('Contribution', ContributionSchema);
