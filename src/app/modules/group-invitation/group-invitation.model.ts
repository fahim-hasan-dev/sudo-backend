import { Schema, model } from 'mongoose';
import { IGroupInvitation } from './group-invitation.interface';

const GroupInvitationSchema = new Schema<IGroupInvitation>(
  {
    groupId: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    receiverId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'declined'],
      default: 'pending',
      required: true,
    },
  },
  { timestamps: true }
);

export const GroupInvitation = model<IGroupInvitation>('GroupInvitation', GroupInvitationSchema);
