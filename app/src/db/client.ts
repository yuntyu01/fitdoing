import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';

import * as schema from './schema';

// enableChangeListener: useLiveQuery가 기록 변경을 바로 받아 화면을 갱신한다.
export const sqlite = openDatabaseSync('fitdoing.db', { enableChangeListener: true });
export const db = drizzle(sqlite, { schema });
