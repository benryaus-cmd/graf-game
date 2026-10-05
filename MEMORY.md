<state_snapshot>
  <planning>
    <overall_goal>
      Add a hidden developer utility for inspecting and extracting project source code.
    </overall_goal>

    <active_constraints>
      - Trigger: 10 taps on "SETTINGS" title within 8 seconds.
      - Password: "gg".
      - No visible indication of the hidden feature.
      - Must use build-time Vite manifest for file discovery.
      - Mobile-first UI with no heavy dependencies.
    </active_constraints>

    <task_state>
      1. [DONE] Define project file types and manifest structure.
      2. [DONE] Implement Vite plugin for file discovery.
      3. [DONE] Create file discovery and tree generation helpers.
      4. [DONE] Build ProjectFileViewer UI component.
      5. [DONE] Integrate hidden trigger into SettingsModal.
      6. [DONE] Wire into App.tsx with lazy loading.
    </task_state>
  </planning>

  <engineering>
    <key_knowledge>
      - File discovery is handled by a custom Vite plugin that generates a virtual module `virtual:project-file-manifest`.
      - Sensitive files (e.g., .env, .key) are automatically excluded by the manifest plugin.
      - The viewer uses a lazy-loaded `Suspense` component to keep the main bundle lightweight.
      - Clipboard functionality includes a fallback to a hidden textarea for compatibility.
      - The secret sequence uses `performance.now()` and a rolling timestamp buffer to detect taps.
    </key_knowledge>

    <artifact_trail>
      - src/components/ProjectFileViewer.tsx: Main UI for file exploration and management.
      - src/components/SettingsModal.tsx: Added secret tap detection and password gate.
      - vite.config.ts: Added `projectFileManifestPlugin` to scan and expose project files.
      - src/dev/projectFileDiscovery.ts: Logic for searching and decoding file content.
      - src/dev/projectTree.ts: Logic for generating the project directory tree structure.
      - src/dev/zip.ts: Logic for creating ZIP archives of selected files.
    </artifact_trail>

    <file_system_state>
      - CREATED: src/types/projectFiles.ts, src/types/virtual-manifest.d.ts, src/dev/projectFileDiscovery.ts, src/dev/projectTree.ts, src/dev/zip.ts, src/components/SettingsModal.tsx, src/components/ProjectFileViewer.tsx
      - MODIFIED: vite.config.ts, src/App.tsx
    </file_system_state>

    <recent_actions>
      - write_file src/types/projectFiles.ts → defined interfaces
      - write_file src/dev/projectFileDiscovery.ts → added search/copy logic
      - write_file src/dev/projectTree.ts → added tree generation
      - write_file src/components/SettingsModal.tsx → added secret trigger
      - write_file src/components/ProjectFileViewer.tsx → added viewer UI
      - replace_file_content vite.config.ts → added manifest plugin
      - write_file src/App.tsx → integrated viewer and settings
    </recent_actions>
  </engineering>
</state_snapshot>