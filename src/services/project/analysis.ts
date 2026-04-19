import { CHUNK_SIZE_CHARS } from "@/lib/constants";
import type { FileChunk, ScannedFile } from "@/types";

export function chunkText(filePath: string, content: string, chunkSize = CHUNK_SIZE_CHARS): FileChunk[] {
  const chunks: FileChunk[] = [];

  for (let i = 0; i < content.length; i += chunkSize) {
    chunks.push({
      filePath,
      chunkIndex: chunks.length,
      content: content.slice(i, i + chunkSize)
    });
  }

  return chunks;
}

export function chooseTopFilesForContext(files: ScannedFile[], limit: number): ScannedFile[] {
  const priorityBucket = (language: string): number => {
    if (language === "image") return 3;
    if (language === "document") return 2;
    if (language === "markdown") return 1;
    return 0;
  };

  const prioritized = [...files].sort((a, b) => {
    const bucketA = priorityBucket(a.language);
    const bucketB = priorityBucket(b.language);

    if (bucketA !== bucketB) {
      return bucketA - bucketB;
    }

    return a.size - b.size;
  });

  return prioritized.slice(0, limit);
}
