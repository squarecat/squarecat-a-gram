/// <reference types="astro/client" />

declare module 'heic-convert' {
  export default function convert(opts: {
    buffer: Buffer | ArrayBufferLike;
    format: 'JPEG' | 'PNG';
    quality?: number;
  }): Promise<ArrayBuffer>;
}
