import { useState } from 'react';
import { AISDKError } from 'ai';
import { normalizeError } from '@aippy/runtime/ai';
import { generatePosterArtwork } from '@/game/generateBotArtwork';

interface PosterStudioProps {
  size: number;
  onSizeChange: (size: number) => void;
  onStartPlacement: (dataUrl: string, size: number) => void;
}

function messageFromError(error: unknown): string {
  const normalized = normalizeError(error);
  if (normalized instanceof Error && normalized.message) return normalized.message.slice(0, 140);
  if (typeof normalized === 'string' && normalized) return normalized.slice(0, 140);
  if (error instanceof AISDKError) return error.message.slice(0, 140);
  return 'Your poster could not be made just yet. Try again.';
}

const PosterStudio = ({ size, onSizeChange, onStartPlacement }: PosterStudioProps) => {
  const [prompt, setPrompt] = useState('A bright fox made of wildflowers, bold street-art colors');
  const [artwork, setArtwork] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const generate = async () => {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setError('');
    try {
      setArtwork(await generatePosterArtwork(prompt));
    } catch (reason) {
      setError(messageFromError(reason));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="poster-studio">
      <div className="poster-studio-heading">
        <span>01 / MAKE IT YOURS</span>
        <b>POSTER LAB</b>
      </div>
      <p>Describe a piece of art for your next concrete wall.</p>
      <label className="poster-prompt-label" htmlFor="poster-prompt">YOUR ART IDEA</label>
      <textarea
        id="poster-prompt" value={prompt} maxLength={240} rows={3}
        placeholder="A surreal sunset over the rooftops…"
        onChange={(event) => setPrompt(event.target.value)}
      />
      {error && (
        <div className="poster-error" role="alert">
          <span>{error}</span><button type="button" onClick={() => void generate()}>RETRY</button>
        </div>
      )}
      <button
        className="poster-generate" type="button" disabled={!prompt.trim() || loading}
        onClick={() => void generate()}
      >
        {loading ? <><i className="poster-loader" /> CREATING YOUR ART…</> : artwork ? 'GENERATE ANOTHER' : '✦  GENERATE POSTER'}
      </button>
      {artwork && (
        <div className="poster-result">
          <img src={artwork} alt="Your generated poster preview" />
          <div className="poster-result-copy">
            <b>READY TO HIT THE STREETS</b>
            <small>Hold it up and line it up with a wall.</small>
          </div>
        </div>
      )}
      <label className="poster-size-control">
        <span>POSTER SIZE <b>{size.toFixed(1)} m</b></span>
        <input
          type="range" min="0.4" max="4" step="0.1" value={size}
          aria-label="Adjust poster size" onChange={(event) => onSizeChange(Number(event.target.value))}
        />
      </label>
      <button
        type="button" className="poster-hold" disabled={!artwork || loading}
        onClick={() => artwork && onStartPlacement(artwork, size)}
      >
        HOLD POSTER &amp; EXPLORE <span aria-hidden="true">↗</span>
      </button>
      <small className="poster-swipe-note">SWIPE RIGHT TO RETURN TO PAINTING</small>
    </div>
  );
};

export default PosterStudio;