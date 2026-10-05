import type { ProjectFileEntry, ProjectManifest } from '@/types/projectFiles';

export const decodeContent = (file: ProjectFileEntry): string => file.content ?? '';

export const buildContentIndex = (
  manifest: ProjectManifest,
): Map<string, string> => {
  const map = new Map<string, string>();

  for (const file of manifest.files) {
    if (file.status === 'TEXT' && file.content !== undefined) {
      map.set(file.path, file.content);
    }
  }

  return map;
};

export interface FileSearchResult {
  file: ProjectFileEntry;
  pathMatch: boolean;
  contentHits: number;
}

export const searchFiles = (
  files: ProjectFileEntry[],
  contentIndex: Map<string, string>,
  rawQuery: string,
  searchContents: boolean,
): FileSearchResult[] => {
  const query = rawQuery.trim().toLowerCase();

  if (!query) {
    return files.map(file => ({
      file,
      pathMatch: true,
      contentHits: 0,
    }));
  }

  const results: FileSearchResult[] = [];

  for (const file of files) {
    const pathMatch =
      file.path.toLowerCase().includes(query) ||
      file.name.toLowerCase().includes(query);

    let contentHits = 0;

    if (searchContents) {
      const content = contentIndex.get(file.path);

      if (content) {
        const lower = content.toLowerCase();
        let index = lower.indexOf(query);

        while (index !== -1) {
          contentHits++;
          index = lower.indexOf(query, index + query.length);
        }
      }
    }

    if (pathMatch || contentHits > 0) {
      results.push({ file, pathMatch, contentHits });
    }
  }

  results.sort((a, b) => {
    if (a.pathMatch !== b.pathMatch) {
      return a.pathMatch ? -1 : 1;
    }
    if (b.contentHits !== a.contentHits) {
      return b.contentHits - a.contentHits;
    }
    return a.file.path.localeCompare(b.file.path);
  });

  return results;
};

export const copyText = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();

    const ok = document.execCommand('copy');

    document.body.removeChild(ta);
    if (!ok) return false;
  }

  navigator.vibrate?.(15);
  return true;
};

export const formatSize = (bytes: number): string =>
  bytes >= 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${bytes} B`;