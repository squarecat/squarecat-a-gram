export interface AlbumImage {
  title: string; // original filename (drives HEIC fallback in the publish pipeline)
  takenAt: number; // epoch µs, for ordering
  kind: 'image' | 'video';
  download(): Promise<Buffer>; // original bytes, decrypted/decoded
}

export interface Source {
  name: string;
  matches(shareUrl: string): boolean;
  /** Validate + list album images, sorted by takenAt. Throw human-readable errors. */
  list(shareUrl: string): Promise<AlbumImage[]>;
}
