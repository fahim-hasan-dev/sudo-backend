import { ISettings } from './settings.interface';
import { Settings } from './settings.model';

const getSettings = async (): Promise<ISettings> => {
  let settings = await Settings.findOne();
  if (!settings) {
    settings = await Settings.create({ platformCommission: 5 });
  }
  return settings;
};

const updateSettings = async (payload: Partial<ISettings>): Promise<ISettings> => {
  let settings = await Settings.findOne();
  if (!settings) {
    settings = await Settings.create({ platformCommission: 5 });
  }

  if (payload.platformCommission !== undefined) {
    settings.platformCommission = payload.platformCommission;
  }

  await settings.save();
  return settings;
};

export const SettingsService = {
  getSettings,
  updateSettings,
};
