import { Schema, model } from 'mongoose';
import { ISettings, SettingsModel } from './settings.interface';

const settingsSchema = new Schema<ISettings, SettingsModel>(
  {
    platformCommission: {
      type: Number,
      required: true,
      default: 5,
    },
  },
  {
    timestamps: true,
  }
);

export const Settings = model<ISettings, SettingsModel>('Settings', settingsSchema);
