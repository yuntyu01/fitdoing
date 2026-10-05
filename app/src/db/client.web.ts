// 웹은 스크린샷 전용이라 가짜 DB를 쓴다 (src/web-mocks/fakeDb.ts).
import '../web-mocks/freshSeed';

import { fakeDb } from '../web-mocks/fakeDb';

export const sqlite = {};
export const db = fakeDb as never;
