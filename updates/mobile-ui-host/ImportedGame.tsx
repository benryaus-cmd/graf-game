import React from 'react';
// @ts-expect-error Upstream App is populated at build time by the GitHub importer
import UpstreamApp from './upstream/src/App';
// @ts-expect-error Upstream stylesheet is populated at build time by the GitHub importer
import './upstream/src/index.css';

const ImportedGame: React.FC = () => (
  <div className="relative h-full min-h-0 w-full overflow-hidden bg-black">
    <UpstreamApp />
  </div>
);

export default ImportedGame;
