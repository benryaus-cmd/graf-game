export type FileReadStatus =
  | 'TEXT'
  | 'BINARY'
  | 'FAILED'
  | 'EMPTY';

export interface ProjectFileEntry {
  path: string;
  name: string;
  dir: string;
  ext: string;
  size: number;
  status: FileReadStatus;
  error?: string;
  content?: string;
}

export interface ProjectManifest {
  generatedAt: number;
  files: ProjectFileEntry[];
  folders: string[];
}