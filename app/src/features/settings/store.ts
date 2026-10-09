import { create } from 'zustand';

import { db } from '../../db/client';
import { settings as settingsTable, type Settings } from '../../db/schema';
import { backupSettings } from '../api/client';
import { photoBackupChanged } from '../api/track';
import { fromSettingsBody } from '../../domain/restore';
import { useThemeMode } from '../../ui/theme';
import { rescheduleNotifications } from '../notifications/schedule';
import { initialSettings } from './defaults';

interface SettingsState {
  settings: Settings | null;
  loaded: boolean;
  load: () => void;
  save: (next: Settings) => void;
  update: (patch: Partial<Settings>) => void;
}

const ROW_ID = 1;

export const useSettings = create<SettingsState>((set, get) => ({
  settings: null,
  loaded: false,

  load: () => {
    const row = db.select().from(settingsTable).get();
    // 예전 버전이 저장한 설정에는 새 필드(화면 모드·알림·닉네임·주간 목표…)가 없어서 기본값으로 채운다
    const settings = row?.json ? fromSettingsBody(row.json, initialSettings()) : null;
    if (settings) useThemeMode.setState({ mode: settings.themeMode });
    set({ settings, loaded: true });
  },

  save: (next) => {
    const prevBackup = get().settings?.photoBackup ?? false;
    useThemeMode.setState({ mode: next.themeMode });
    const now = Date.now();
    db.insert(settingsTable)
      .values({ id: ROW_ID, json: next, updatedAt: now })
      .onConflictDoUpdate({ target: settingsTable.id, set: { json: next, updatedAt: now } })
      .run();
    set({ settings: next });
    rescheduleNotifications(next).catch((e) => console.warn('reschedule failed', e));
    backupSettings(next).catch(() => {}); // 서버 백업은 best effort. 실패해도 로컬이 진실이다.
    if (next.photoBackup !== prevBackup) photoBackupChanged(next.photoBackup);
  },

  update: (patch) => {
    const cur = get().settings;
    if (cur) get().save({ ...cur, ...patch });
  },
}));

/** 온보딩을 마친 뒤에만 쓰는 화면용. 설정이 없으면 던진다. */
export function useSettingsValue(): Settings {
  const s = useSettings((st) => st.settings);
  if (!s) throw new Error('settings not loaded');
  return s;
}
