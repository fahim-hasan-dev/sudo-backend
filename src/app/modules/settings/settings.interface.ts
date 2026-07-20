import { Model } from 'mongoose';

export type ISettings = {
  platformCommission: number;
};

export type SettingsModel = Model<ISettings>;
