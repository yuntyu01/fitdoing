// 웹 스크린샷용 drizzle-orm/expo-sqlite 목.
import { useEffect, useState } from 'react';

import { fakeDb } from './fakeDb';

export const drizzle = () => fakeDb;

export function useLiveQuery<T>(query: PromiseLike<T>): { data: T; error: undefined; updatedAt: undefined } {
  const [data, setData] = useState<T>([] as T);
  useEffect(() => {
    let live = true;
    Promise.resolve(query).then((d) => live && setData(d));
    return () => {
      live = false;
    };
    // 스크린샷용이라 마운트 때 한 번만 읽는다. (쿼리 객체는 렌더마다 새로 만들어져 deps 로 쓰면 무한 루프)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { data, error: undefined, updatedAt: undefined };
}
