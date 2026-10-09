import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { baseName, photoFileName, resizeTarget } from '../../domain/logging';

// 끼니 사진은 앱 문서 디렉터리(폰 안)에만 저장한다. 서버로 나가는 건 AI 분석 때 보내는
// 긴 변 1024px 사본뿐이고(features/api/client.ts), 같은 사본을 폰에도 보관한다.

const mealsDir = () => new Directory(Paths.document, 'meals');

/** 긴 변을 1024px로 줄인 JPEG을 만든다 (캐시에 저장). 이미 작으면 JPEG로만 다시 저장한다. */
export async function shrinkPhoto(uri: string, width: number, height: number): Promise<string> {
  const ctx = ImageManipulator.manipulate(uri);
  const target = resizeTarget(width, height);
  if (target) ctx.resize(target);
  const rendered = await ctx.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
  return saved.uri;
}

/** 줄인 사진을 문서 디렉터리로 옮기고 mealLogs.photoUri에 둘 경로를 돌려준다. */
export function storePhoto(cacheUri: string, date: string, index: number, at: number): string {
  const dir = mealsDir();
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const dest = new File(dir, photoFileName(date, index, at));
  new File(cacheUri).copy(dest);
  return dest.uri;
}

/** 문서 디렉터리 안 사진만 지운다. 실패해도 무시. */
export function deleteStoredPhoto(uri: string | null | undefined): void {
  if (!uri) return;
  try {
    const f = new File(mealsDir(), baseName(uri));
    if (f.exists) f.delete();
  } catch {
    // 사진이 이미 없어도 상관없다.
  }
}

/** 서버에서 받은 백업 사진을 문서 디렉터리에 쓰고 mealLogs.photoUri에 둘 경로를 돌려준다(새 폰 복원). */
export function saveDownloadedPhoto(bytes: Uint8Array, date: string, index: number, at: number): string {
  const dir = mealsDir();
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const dest = new File(dir, photoFileName(date, index, at));
  dest.write(bytes);
  return dest.uri;
}
