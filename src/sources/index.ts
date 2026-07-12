import type { Source } from './types';
import { enteSource } from './ente';
import { icloudSource } from './icloud';

// Static registry: add your source module and list it here.
export const sources: Source[] = [enteSource, icloudSource];

export function findSource(url: string): Source {
  const source = sources.find((s) => s.matches(url));
  if (!source) throw new Error('No photo source recognises this URL');
  return source;
}
