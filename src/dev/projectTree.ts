import type { ProjectFileEntry } from '@/types/projectFiles';

interface TreeNode {
  dirs: Map<string, TreeNode>;
  files: string[];
}

export const generateTree = (files: ProjectFileEntry[]): string => {
  const root: TreeNode = { dirs: new Map(), files: [] };

  for (const file of files) {
    const parts = file.path.split('/');
    let node = root;

    for (let i = 0; i < parts.length - 1; i++) {
      let child = node.dirs.get(parts[i]);

      if (!child) {
        child = { dirs: new Map(), files: [] };
        node.dirs.set(parts[i], child);
      }
      node = child;
    }

    node.files.push(parts[parts.length - 1]);
  }

  const lines: string[] = ['📁 ./'];

  const walk = (node: TreeNode, prefix: string) => {
    const dirNames = [...node.dirs.keys()].sort();
    const fileNames = [...node.files].sort();
    const items = [
      ...dirNames.map(name => ({ name, dir: true })),
      ...fileNames.map(name => ({ name, dir: false })),
    ];

    items.forEach((item, index) => {
      const last = index === items.length - 1;
      const branch = last ? '└──' : '├──';

      lines.push(`${prefix}${branch} ${item.dir ? '📁' : '📄'} ${item.name}/`);

      if (item.dir) {
        const child = node.dirs.get(item.name);

        if (child) {
          walk(child, prefix + (last ? '    ' : '│   '));
        }
      }
    });
  };

  walk(root, '');
  return lines.join('\n');
};