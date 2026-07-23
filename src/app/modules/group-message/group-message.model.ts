import { Schema, model } from 'mongoose';
import { IGroupMessage } from './group-message.interface';

const GroupMessageSchema = new Schema<IGroupMessage>(
  {
    groupId: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, trim: true },
    readBy: { type: [{ type: Schema.Types.ObjectId, ref: 'User' }], select: false, default: [] },
  },
  { timestamps: true }
);

export const GroupMessage = model<IGroupMessage>('GroupMessage', GroupMessageSchema);
