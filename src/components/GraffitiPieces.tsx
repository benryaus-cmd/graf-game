import { useEffect, useState } from 'react';
import type { PieceMetadata } from '@/multiplayer/pieceSync';

interface GraffitiPiecesProps {
  pieces: PieceMetadata[];
  connected: boolean;
  onLike: (pieceId: string) => boolean;
  onResync: () => void;
  onView?: (pieceId: string) => void;
  role?: string;
  canDeletePieces?: boolean;
  onDelete?: (pieceId: string) => boolean;
}

type PendingLikes = Record<string, number>;

const formatTimeLeft = (milliseconds: number) => {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

const statusLabel = (status?: string) => ['complete', 'completed'].includes(status?.toLowerCase() ?? '') ? 'COMPLETE' : 'ACTIVE';
const pendingKey = (piece: PieceMetadata) => piece.currentWindowStartedAt ?? 0;

const GraffitiPieces = ({ pieces, connected, onLike, onResync, onView, role, canDeletePieces = false, onDelete }: GraffitiPiecesProps) => {
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [pendingLikes, setPendingLikes] = useState<PendingLikes>({});
  const [sendError, setSendError] = useState<string | null>(null);
  const [deleteNotice, setDeleteNotice] = useState<string | null>(null);
  const visiblePieces = pieces.slice(0, 20);

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setPendingLikes((pending) => {
      const next = Object.fromEntries(
        Object.entries(pending).filter(([pieceId, startedAt]) =>
          pieces.some((piece) => piece.pieceId === pieceId && pendingKey(piece) === startedAt),
        ),
      );
      return Object.keys(next).length === Object.keys(pending).length ? pending : next;
    });
  }, [pieces]);

  const requestLike = (piece: PieceMetadata) => {
    if (!connected || pendingLikes[piece.pieceId] === pendingKey(piece)) return;
    const queued = onLike(piece.pieceId);
    if (queued) {
      setSendError(null);
      setPendingLikes((pending) => ({ ...pending, [piece.pieceId]: pendingKey(piece) }));
    } else {
      setSendError('Like could not be sent. Check your connection and try again.');
    }
  };

  const requestDelete = (piece: PieceMetadata) => {
    if (!connected) { setDeleteNotice('Deletion is unavailable while disconnected.'); return; }
    if (!canDeletePieces || !onDelete) { setDeleteNotice('Your server permissions do not allow deleting graffiti.'); return; }
    if (onDelete(piece.pieceId)) setDeleteNotice('Delete requested. Waiting for the server removal event.');
    else setDeleteNotice('Delete request could not be sent. Check your connection and permissions.');
  };

  return (
    <div className="graffiti-pieces" style={{ position: 'absolute', zIndex: 10, top: 150, left: 12, pointerEvents: 'auto', fontFamily: 'inherit' }}>
      <button
        type="button" aria-expanded={open} aria-controls="graffiti-pieces-panel"
        onClick={() => setOpen((value) => !value)}
        style={{ minHeight: 40, padding: '0 12px', border: '1px solid rgba(244,242,230,.28)', borderRadius: 4, background: 'rgba(23,24,22,.78)', color: '#f3f1e9', fontFamily: 'inherit', fontSize: 9, fontWeight: 900, letterSpacing: '.1em', cursor: 'pointer' }}
      >ART <span aria-hidden="true">{pieces.length ? ` ${pieces.length}` : ''}</span></button>
      {open && (
        <section
          id="graffiti-pieces-panel" aria-label="Nearby graffiti pieces"
          style={{ position: 'absolute', top: 48, left: 0, width: 'min(360px, calc(100vw - 24px))', maxHeight: 'min(70dvh, 520px)', overflowY: 'auto', padding: 12, border: '1px solid rgba(245,241,229,.2)', borderRadius: 5, background: 'rgba(23,24,22,.96)', color: '#f3f1e9', boxShadow: '0 18px 50px rgba(0,0,0,.48)', backdropFilter: 'blur(18px)' }}
        >
          <header style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{ display: 'grid', flex: 1, gap: 3 }}>
              <small style={{ color: '#a5a8a2', fontSize: 8, fontWeight: 900, letterSpacing: '.16em' }}>COMMUNITY WALLS</small>
              <b style={{ fontSize: 12, letterSpacing: '.08em' }}>NEARBY ART</b>
              {role && <small style={{ color: '#c4c7bd', fontSize: 8, letterSpacing: '.1em' }}>SERVER ROLE: {role.toUpperCase()}</small>}
            </div>
            <button type="button" onClick={onResync} disabled={!connected} style={smallButtonStyle}>RESYNC</button>
            <button type="button" aria-label="Close nearby art" onClick={() => setOpen(false)} style={closeButtonStyle}>×</button>
          </header>
          {!connected && <p style={noteStyle} role="status">Connect to see shared pieces and send likes.</p>}
          {sendError && <p style={{ ...noteStyle, color: '#ffc0b2' }} role="alert">{sendError}</p>}
          {deleteNotice && <p style={{ ...noteStyle, color: deleteNotice.startsWith('Delete request could not') ? '#ffc0b2' : '#c4c7bd' }} role="status">{deleteNotice}</p>}
          {visiblePieces.length === 0 ? (
            <p style={noteStyle} role="status">No shared pieces nearby yet.</p>
          ) : (
            <ul style={{ display: 'grid', gap: 8, margin: 0, padding: 0, listStyle: 'none' }}>
            {visiblePieces.map((piece) => {
                const currentLikes = piece.currentWindowLikes ?? 0;
                const pending = pendingLikes[piece.pieceId] === pendingKey(piece);
                const timeLeft = formatTimeLeft((piece.currentWindowEndsAt ?? now) - now);
                const label = 'Graffiti piece';
                return (
                  <li key={piece.pieceId} style={{ padding: 10, border: '1px solid rgba(255,255,255,.13)', borderRadius: 4, background: 'rgba(255,255,255,.045)' }}>
                    <div style={{ display: 'flex', alignItems: 'start', gap: 8 }}>
                      <div style={{ display: 'grid', flex: 1, gap: 5 }}>
                        <b style={{ fontSize: 11 }}>{label}</b>
                        <span style={{ color: '#aeb2aa', fontSize: 9 }}>X {Math.round(piece.anchor[0])} · Z {Math.round(piece.anchor[2])}</span>
                        <span style={{ color: '#b8bcb4', fontSize: 9 }}>{statusLabel(piece.status)} · GENERATION {piece.survivalGeneration ?? 0}</span>
                      </div>
                      {onView && <button type="button" onClick={() => onView(piece.pieceId)} style={smallButtonStyle}>VIEW</button>}
                      {canDeletePieces && onDelete && <button type="button" onClick={() => requestDelete(piece)} disabled={!connected} style={{ ...smallButtonStyle, color: '#ffc0b2', opacity: connected ? 1 : .62 }}>DELETE</button>}
                      <button
                        type="button" onClick={() => requestLike(piece)} disabled={!connected || pending}
                        aria-label={pending ? 'Like requested, waiting for server refresh' : `Like ${label}`}
                        style={{ ...smallButtonStyle, minWidth: 78, color: pending ? '#a5a8a2' : '#ffb19d', opacity: !connected || pending ? .62 : 1 }}
                      >{pending ? 'REQUESTED' : 'LIKE'}</button>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px 12px', marginTop: 8, color: '#aeb2aa', fontSize: 9 }}>
                      <span>{currentLikes}/20 survival threshold this window</span>
                      <span>{piece.lifetimeLikes ?? 0} lifetime likes</span>
                      <span>{timeLeft} left this window</span>
                    </div>
                    {pending && <p role="status" style={{ ...noteStyle, marginTop: 7 }}>Requested. Waiting for server metadata to refresh.</p>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
};

const smallButtonStyle: React.CSSProperties = {
  minHeight: 38, padding: '0 9px', border: '1px solid rgba(255,255,255,.22)', borderRadius: 3,
  background: 'rgba(255,255,255,.07)', color: '#f3f1e9', fontFamily: 'inherit', fontSize: 8, fontWeight: 900, letterSpacing: '.08em', cursor: 'pointer',
};
const closeButtonStyle: React.CSSProperties = { ...smallButtonStyle, width: 40, padding: 0, fontSize: 22 };
const noteStyle: React.CSSProperties = { margin: '4px 0 8px', color: '#b8bcb4', fontSize: 10, lineHeight: 1.4 };

export default GraffitiPieces;
