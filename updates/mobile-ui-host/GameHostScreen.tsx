import ImportedGame from '@/games/importedGame/ImportedGame';

const GameHostScreen = () => (
  <section className="fixed inset-0 z-40 flex min-h-0 flex-col bg-black">
    <div className="relative min-h-0 w-full flex-1 overflow-hidden">
      <ImportedGame />
    </div>
  </section>
);

export default GameHostScreen;
