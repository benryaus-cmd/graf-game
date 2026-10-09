import { useMemo, useState } from 'react';
import manifest from 'virtual:project-file-manifest';
import type { ProjectFileEntry } from '@/types/projectFiles';
import {
  buildContentIndex, copyText, decodeContent, formatSize, searchFiles,
} from '@/dev/projectFileDiscovery';
import { generateTree } from '@/dev/projectTree';
import { createZip } from '@/dev/zip';

const STATUS_COLORS: Record<string, string> = {
  TEXT: 'text-green-400',
  BINARY: 'text-amber-400',
  FAILED: 'text-red-400',
  EMPTY: 'text-neutral-500',
};

const flashNote = (setter: (value: string) => void, text: string) => {
  setter(text);
  window.setTimeout(() => setter(''), 1500);
};

const FilePreview = ({
  file, onBack,
}: { file: ProjectFileEntry; onBack: () => void }) => {
  const [note, setNote] = useState('');

  const doCopy = async (mode: 'FILE' | 'PATH') => {
    const ok = await copyText(mode === 'FILE' ? decodeContent(file) : file.path);
    flashNote(setNote, ok ? `${mode} ✓` : 'COPY FAILED');
  };

  return (
    <div className="absolute inset-0 z-[100] flex flex-col bg-neutral-950 font-mono text-neutral-200" onPointerDown={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
      <div className="flex items-center gap-2 border-b border-neutral-800 px-3 py-2.5">
        <button type="button" onClick={onBack} className="min-h-11 shrink-0 rounded bg-neutral-800 px-3 text-xs">
          ← BACK
        </button>
        <span className="flex-1 truncate text-xs text-neutral-400">{file.path}</span>
        <button type="button" onClick={() => doCopy('FILE')} className="min-h-11 shrink-0 rounded bg-neutral-800 px-2.5 text-[11px]">
          COPY FILE
        </button>
        <button type="button" onClick={() => doCopy('PATH')} className="min-h-11 shrink-0 rounded bg-neutral-800 px-2.5 text-[11px]">
          COPY PATH
        </button>
      </div>
      <div className="flex items-center gap-3 border-b border-neutral-800 px-3 py-1.5 text-[11px]">
        <span className={STATUS_COLORS[file.status]}>{file.status}</span>
        <span className="text-neutral-500">· {formatSize(file.size)}</span>
        {note && <span className="ml-auto text-green-400">{note}</span>}
      </div>
      <pre className="flex-1 overflow-auto p-3 text-[11px] leading-4 text-neutral-300" style={{ whiteSpace: 'pre' }}>
        {decodeContent(file) || '(no content)'}
      </pre>
    </div>
  );
};

const ProjectFileViewer = ({ onClose }: { onClose: () => void }) => {
  const contentIndex = useMemo(() => buildContentIndex(manifest), []);
  const [query, setQuery] = useState('');
  const [searchMode, setSearchMode] = useState<'NAMES' | 'CONTENT'>('NAMES');
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [previewFile, setPreviewFile] = useState<ProjectFileEntry | null>(null);
  const [note, setNote] = useState('');

  const results = useMemo(
    () => searchFiles(manifest.files, contentIndex, query, searchMode === 'CONTENT'),
    [query, searchMode, contentIndex],
  );

  const toggleSelect = (path: string) => setSelectedPaths(current => {
    const next = new Set(current);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    return next;
  });

  const selectedFiles = manifest.files.filter(file => selectedPaths.has(file.path));

  const copySelected = async () => {
    const parts = [
      'SELECTED PROJECT FILES',
      '',
      'PROJECT FILE TREE:',
      '',
      generateTree(selectedFiles),
      '',
    ];
    for (const file of selectedFiles) {
      parts.push(
        'SELECTED FILES:',
        '==============================',
        `FILE: ${file.path}`,
        `STATUS: ${file.status}`,
        `SIZE: ${file.size}`,
        '',
        decodeContent(file),
        '==============================',
        '',
      );
    }
    const ok = await copyText(parts.join('\n'));
    flashNote(setNote, ok ? 'COPIED' : 'COPY FAILED');
  };

  const copyTree = async () => {
    const ok = await copyText(
      `PROJECT FILE TREE\n\n${generateTree(selectedFiles.length > 0 ? selectedFiles : manifest.files)}`,
    );
    flashNote(setNote, ok ? 'COPIED' : 'COPY FAILED');
  };

  const downloadZip = async () => {
    const encoder = new TextEncoder();

    const entries = manifest.files.map(file => ({
      name: file.path,
      data: file.status === 'TEXT' && file.content !== undefined
        ? encoder.encode(file.content)
        : new Uint8Array(0),
    }));

    const blob = createZip(entries);

    const file = new File(
      [blob],
      'project-files.zip',
      { type: 'application/zip' },
    );

    /*
     * Android WebViews often cannot download blob: URLs via
     * synthetic <a download> clicks.
     *
     * Prefer the native Android share/save sheet when file
     * sharing is available.
     */
    if (
      typeof navigator.share === 'function' &&
      typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: [file] })
    ) {
      try {
        await navigator.share({
          files: [file],
          title: 'Project files',
        });

        flashNote(setNote, 'ZIP READY ✓');
        return;
      } catch (error) {
        /*
         * AbortError means the user simply closed the share sheet.
         * Do not automatically trigger a second download in that case.
         */
        if (
          error instanceof DOMException &&
          error.name === 'AbortError'
        ) {
          return;
        }

        /*
         * Otherwise continue to the normal browser download fallback.
         */
      }
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = 'project-files.zip';
    link.style.display = 'none';

    document.body.appendChild(link);
    link.click();
    link.remove();

    /*
     * Do NOT revoke immediately after click.
     * Some browsers/WebViews have not consumed the blob yet.
     */
    window.setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 30_000);

    flashNote(setNote, 'ZIP ✓');
  };

  if (previewFile) {
    return <FilePreview file={previewFile} onBack={() => setPreviewFile(null)} />;
  }

  return (
    <div className="absolute inset-0 z-[90] flex flex-col bg-neutral-950 font-mono text-neutral-200" onPointerDown={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
      <div className="flex items-center gap-2 border-b border-neutral-800 px-3 py-2.5">
        <button type="button" onClick={onClose} className="min-h-11 shrink-0 rounded bg-neutral-800 px-3 text-xs">
          ← CLOSE
        </button>
        <span className="flex-1 text-center text-sm font-bold tracking-widest">PROJECT FILES</span>
        <span className="shrink-0 text-[11px] text-neutral-500">
          {results.length}/{manifest.files.length}
        </span>
        <button type="button" onClick={() => void downloadZip()} className="min-h-11 shrink-0 rounded bg-neutral-800 px-2.5 text-[11px]">
          ZIP
        </button>
      </div>
      <div className="border-b border-neutral-800 px-3 py-2">
        <input
          type="text"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder={searchMode === 'CONTENT'
            ? 'Search names, paths & file contents…'
            : 'Search file names & paths...'}
          className="w-full rounded-lg bg-neutral-900 px-3 py-2.5 text-sm outline-none"
        />
        <div className="mt-2 flex gap-2">
          {(['NAMES', 'CONTENT'] as const).map(mode => (
            <button
              key={mode}
              type="button"
              onClick={() => setSearchMode(mode)}
              className={`min-h-9 flex-1 rounded-lg text-[11px] tracking-wider ${
                searchMode === mode
                  ? 'bg-green-700 font-bold text-white'
                  : 'bg-neutral-800 text-neutral-400'
              }`}
            >
              {mode === 'NAMES' ? 'NAMES ONLY' : 'NAMES + CONTENT'}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {results.map(result => (
          <div key={result.file.path} className="flex items-start gap-2 border-b border-neutral-900 px-3 py-2">
            <button
              type="button"
              aria-label={selectedPaths.has(result.file.path) ? 'Deselect file' : 'Select file'}
              onClick={() => toggleSelect(result.file.path)}
              className={`mt-0.5 min-h-11 min-w-11 shrink-0 rounded text-sm ${
                selectedPaths.has(result.file.path) ? 'text-green-400' : 'text-neutral-600'
              }`}
            >
              {selectedPaths.has(result.file.path) ? '✓' : '○'}
            </button>
            <button type="button" onClick={() => setPreviewFile(result.file)} className="min-w-0 flex-1 py-1 text-left">
              <div className="truncate text-sm text-neutral-100">{result.file.name}</div>
              <div className="truncate text-[11px] text-neutral-500">
                {result.file.path} · {formatSize(result.file.size)}
              </div>
              {searchMode === 'CONTENT' && result.contentHits > 0 && !result.pathMatch && (
                <div className="text-[11px] text-green-500">· {result.contentHits} hits in content</div>
              )}
            </button>
            <span className={`shrink-0 text-[10px] ${STATUS_COLORS[result.file.status]}`}>
              {result.file.status}
            </span>
          </div>
        ))}
        {results.length === 0 && (
          <p className="p-6 text-center text-xs text-neutral-600">No matching files.</p>
        )}
      </div>
      <div className="flex items-center gap-1.5 border-t border-neutral-800 px-2 py-2">
        <button
          type="button"
          onClick={() => setSelectedPaths(new Set(results.map(result => result.file.path)))}
          className="min-h-11 flex-1 rounded bg-neutral-800 text-[10px] tracking-wider"
        >
          SELECT ALL
        </button>
        <button
          type="button"
          onClick={() => setSelectedPaths(new Set())}
          className="min-h-11 flex-1 rounded bg-neutral-800 text-[10px] tracking-wider"
        >
          CLEAR
        </button>
        <button
          type="button"
          onClick={copySelected}
          className="min-h-11 flex-1 rounded bg-neutral-800 text-[10px] tracking-wider"
        >
          COPY SEL ({selectedPaths.size})
        </button>
        <button
          type="button"
          onClick={copyTree}
          className="min-h-11 flex-1 rounded bg-neutral-800 text-[10px] tracking-wider"
        >
          COPY TREE
        </button>
        {note && <span className="shrink-0 px-1 text-[10px] text-green-400">{note}</span>}
      </div>
    </div>
  );
};

export default ProjectFileViewer;