import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class FileChunkService {
  createChunks(file: File, chunkSize = 16 * 1024): Blob[] {
    const chunks: Blob[] = [];
    for (let offset = 0; offset < file.size; offset += chunkSize) {
      chunks.push(file.slice(offset, Math.min(offset + chunkSize, file.size)));
    }

    return chunks;
  }

  rebuildFile(chunks: ArrayBuffer[], mimeType: string): Blob {
    return new Blob(chunks, { type: mimeType });
  }
}
