import { useEffect, useState } from 'react';
import GameSheet from './GameSheet';
import type { SharedArtwork } from '@/multiplayer/artworkSync';
import type { PieceMetadata } from '@/multiplayer/pieceSync';

interface GraffitiPiecesProps {
  open?: boolean; onOpenChange?: (open: boolean) => void;
  pieces: PieceMetadata[];
  artworks?: SharedArtwork[];
  selectedArtworkId?: string | null;
  onViewArtwork?: (artworkId: string) => void;
  onDeleteArtwork?: (artworkId: string) => boolean;
  onCreatorSelect?: (identity: { playerId?: string; username: string; nickName: string }) => void;
  connected: boolean;
  onLike: (pieceId: string) => boolean;
  onResync: () => void;
  onView?: (pieceId: string) => void;
  role?: string;
  canDeletePieces?: boolean;
  onDelete?: (pieceId: string) => boolean;
  selectedPieceId?: string | null;
  piecePickSequence?: number;
  canPaintOver?: boolean;
  paintColour?: string;
  onPaintOver?: (pieceId: string, colour: string) => boolean;
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
const protectionLabel = (piece: PieceMetadata, now: number) => {
  if (!piece.protectedUntil || piece.protectedUntil <= now) return 'UNPROTECTED';
  const minutes = Math.ceil((piece.protectedUntil - now) / 60_000);
  return `PROTECTED · ${Math.floor(minutes / 60)}h ${minutes % 60}m remaining`;
};

const GraffitiPieces = ({ open: controlledOpen, onOpenChange, pieces, artworks = [], selectedArtworkId, onViewArtwork, onDeleteArtwork, onCreatorSelect, connected, onLike, onResync, onView, canDeletePieces = false, onDelete, selectedPieceId, piecePickSequence, canPaintOver, paintColour = '#ffffff', onPaintOver }: GraffitiPiecesProps) => {
  const [coverColour, setCoverColour] = useState(paintColour);
  const [protectionGain, setProtectionGain] = useState(false);
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlledOpen ?? localOpen;
  const setOpen = (value: boolean | ((current: boolean) => boolean)) => { const next = typeof value === 'function' ? value(open) : value; if (onOpenChange) onOpenChange(next); else setLocalOpen(next); };
  const [viewingArtworkId, setViewingArtworkId] = useState<string | null>(selectedArtworkId ?? null);
  const [viewingPieceId, setViewingPieceId] = useState<string | null>(selectedPieceId ?? null);
  const [now, setNow] = useState(() => Date.now());
  const [pendingLikes, setPendingLikes] = useState<PendingLikes>({});
  const [sendError, setSendError] = useState<string | null>(null);
  const [deleteNotice, setDeleteNotice] = useState<string | null>(null);
  const viewingArtwork = artworks.find(artwork => artwork.id === viewingArtworkId);
  const visibleArtworks = artworks.slice(0, 20);
  const visiblePieces = pieces.slice(0, 20);
  const viewingPiece = pieces.find(piece => piece.pieceId === viewingPieceId);
  useEffect(() => {
    if (viewingPiece?.protectionAddedSeconds !== 3600) { setProtectionGain(false); return; }
    setProtectionGain(true);
    const timer = window.setTimeout(() => setProtectionGain(false), 3500);
    return () => window.clearTimeout(timer);
  }, [viewingPiece?.pieceId, viewingPiece?.protectedUntil, viewingPiece?.protectionAddedSeconds]);

  useEffect(() => {
    if (selectedPieceId === undefined) return;
    setViewingPieceId(selectedPieceId);
    if (selectedPieceId) setViewingArtworkId(null);
    if (selectedPieceId && controlledOpen === undefined) setLocalOpen(true);
  }, [selectedPieceId, piecePickSequence]);
  useEffect(() => {
    if (selectedArtworkId === undefined) return;
    setViewingArtworkId(selectedArtworkId);
    if (selectedArtworkId) { setViewingPieceId(null); if (controlledOpen === undefined) setLocalOpen(true); }
  }, [selectedArtworkId]);
  useEffect(() => {
    if (viewingArtworkId && !artworks.some(artwork => artwork.id === viewingArtworkId)) setViewingArtworkId(null);
  }, [artworks, viewingArtworkId]);
  useEffect(() => {
    if (viewingPieceId && !pieces.some(piece => piece.pieceId === viewingPieceId)) setViewingPieceId(null);
  }, [pieces, viewingPieceId]);

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

  const creator = (art: { ownerPlayerId?: string; ownerUsername?: string; ownerNickName?: string }) => {
    const username = art.ownerUsername?.replace(/^@/, '') ?? '';
    const nickName = art.ownerNickName || (username ? `@${username}` : 'Creator unavailable');
    const label = <>{nickName}{username && <small> @{username}</small>}</>;
    return onCreatorSelect && (username || art.ownerPlayerId)
      ? <button type="button" className="art-creator" aria-label={`View profile of ${nickName}`} style={smallButtonStyle} onClick={() => onCreatorSelect({ playerId: art.ownerPlayerId, username, nickName })}>{label}</button>
      : <span className="art-creator">{label}</span>;
  };
  const requestArtworkDelete = (artwork: SharedArtwork) => {
    if (!connected || !canDeletePieces || !onDeleteArtwork) { setDeleteNotice('Image deletion is unavailable. Check the connection and your permissions.'); return; }
    setDeleteNotice(onDeleteArtwork(artwork.id) ? 'Delete requested. Waiting for the server removal event.' : 'Delete request could not be sent. Check your connection and permissions.');
  };

  return (
    <div className="graffiti-pieces" style={{ pointerEvents: 'auto', fontFamily: 'inherit' }}>
      <button
        type="button" aria-expanded={open} aria-controls="graffiti-pieces-panel"
        onClick={() => setOpen((value) => !value)}
        style={{ minHeight: 40, padding: '0 12px', border: '1px solid rgba(244,242,230,.28)', borderRadius: 4, background: 'rgba(23,24,22,.78)', color: '#f3f1e9', fontFamily: 'inherit', fontSize: 9, fontWeight: 900, letterSpacing: '.1em', cursor: 'pointer' }}
      >ART <span aria-hidden="true">{pieces.length + artworks.length ? ` ${pieces.length + artworks.length}` : ''}</span></button>
      {open && (
        <GameSheet title={viewingPiece || viewingArtwork ? 'ARTWORK' : 'NEARBY ART'} onClose={() => setOpen(false)} closeLabel="Close nearby art" className="art-sheet">
          <div id="graffiti-pieces-panel">
          <details className="piece-connection"><summary>Connection options</summary><button type="button" onClick={onResync} disabled={!connected}>REFRESH ART</button></details>
          {!connected && <p style={noteStyle} role="status">Connect to see shared pieces and send likes.</p>}
          {sendError && <p style={{ ...noteStyle, color: '#ffc0b2' }} role="alert">{sendError}</p>}
          {deleteNotice && <p style={{ ...noteStyle, color: deleteNotice.startsWith('Delete request could not') ? '#ffc0b2' : '#c4c7bd' }} role="status">{deleteNotice}</p>}
          {viewingPiece ? (
            <article aria-label="Graffiti artwork details" style={{ padding: 10, border: '1px solid rgba(255,255,255,.13)', borderRadius: 4, background: 'rgba(255,255,255,.045)' }}>
              <button type="button" onClick={() => setViewingPieceId(null)} style={{ ...smallButtonStyle, marginBottom: 8 }}>BACK TO NEARBY ART</button>
              <div style={{ display: 'grid', gap: 6 }}>
                <b style={{ fontSize: 12 }}>{viewingPiece.title || 'Graffiti piece'}</b>
                {creator(viewingPiece)}
                <span style={{ color: '#aeb2aa', fontSize: 9 }}>X {Math.round(viewingPiece.anchor[0])} · Z {Math.round(viewingPiece.anchor[2])}</span>
                <span style={{ color: '#b8bcb4', fontSize: 9 }}>{statusLabel(viewingPiece.status)} · GENERATION {viewingPiece.survivalGeneration ?? 0}</span>
                <span style={{ color: '#c5e6b4', fontSize: 9 }}>{protectionLabel(viewingPiece, now)}</span>
                {protectionGain && <b role="status">+1 hour protection</b>}
                <span style={{ color: '#aeb2aa', fontSize: 9 }}>{viewingPiece.currentWindowLikes ?? 0}/20 survival threshold this window · {viewingPiece.lifetimeLikes ?? 0} lifetime likes</span>
                <button type="button" onClick={() => requestLike(viewingPiece)} disabled={!connected || pendingLikes[viewingPiece.pieceId] === pendingKey(viewingPiece)} style={{ ...smallButtonStyle, color: '#ffb19d' }}>
                  {pendingLikes[viewingPiece.pieceId] === pendingKey(viewingPiece) ? 'REQUESTED' : 'LIKE'}
                </button>
                {canDeletePieces && onDelete && <button type="button" onClick={() => requestDelete(viewingPiece)} disabled={!connected} style={{ ...smallButtonStyle, color: '#ffc0b2' }}>DELETE</button>}
                {canPaintOver && onPaintOver && <details className="piece-admin"><summary>Admin · Paint over</summary><fieldset className="admin-paint-over">
                  <legend>PAINT OVER</legend>
                  <div>
                    <button type="button" onClick={() => setCoverColour('#ffffff')}>WHITE</button>
                    <button type="button" onClick={() => setCoverColour('#000000')}>BLACK</button>
                    <button type="button" onClick={() => setCoverColour(paintColour)}>CURRENT</button>
                    <input type="color" value={coverColour} aria-label="Paint over colour" onChange={event => setCoverColour(event.target.value)} />
                  </div>
                  <button type="button" disabled={!connected} onClick={() => {
                    if (onPaintOver(viewingPiece.pieceId, coverColour)) setDeleteNotice('Paint-over requested in the selected colour.');
                    else setSendError('Paint-over is unavailable.');
                  }}>PAINT OVER</button>
                </fieldset></details>}
              </div>
            </article>
          ) : viewingArtwork ? (
            <article aria-label="Image or poster details" style={{ display: 'grid', gap: 8 }}>
              <button type="button" onClick={() => setViewingArtworkId(null)} style={smallButtonStyle}>BACK TO NEARBY ART</button>
              <b>Image / poster</b>
              {creator(viewingArtwork)}
              <img src={viewingArtwork.assetRef} alt="Shared image or poster" style={{ display: 'block', width: '100%', maxHeight: 180, objectFit: 'contain', borderRadius: 4 }} />
              <span style={noteStyle}>X {Math.round(viewingArtwork.position[0])} · Z {Math.round(viewingArtwork.position[2])}</span>
              {canDeletePieces && onDeleteArtwork && <button type="button" disabled={!connected} onClick={() => requestArtworkDelete(viewingArtwork)} style={smallButtonStyle}>DELETE IMAGE</button>}
            </article>
          ) : visiblePieces.length === 0 && visibleArtworks.length === 0 ? (
            <p style={noteStyle} role="status">No shared pieces nearby yet.</p>
          ) : (
            <ul style={{ display: 'grid', gap: 8, margin: 0, padding: 0, listStyle: 'none' }}>
            {visiblePieces.map((piece) => {
                const currentLikes = piece.currentWindowLikes ?? 0;
                const pending = pendingLikes[piece.pieceId] === pendingKey(piece);
                const timeLeft = formatTimeLeft((piece.currentWindowEndsAt ?? now) - now);
                const label = piece.title || 'Graffiti piece';
                return (
                  <li key={piece.pieceId} style={{ padding: 10, border: '1px solid rgba(255,255,255,.13)', borderRadius: 4, background: 'rgba(255,255,255,.045)' }}>
                    <div style={{ display: 'flex', alignItems: 'start', gap: 8 }}>
                      <div style={{ display: 'grid', flex: 1, gap: 5 }}>
                        <b style={{ fontSize: 11 }}>{label}</b>
                        {creator(piece)}
                        <span style={{ color: '#aeb2aa', fontSize: 9 }}>X {Math.round(piece.anchor[0])} · Z {Math.round(piece.anchor[2])}</span>
                        <span style={{ color: '#b8bcb4', fontSize: 9 }}>{statusLabel(piece.status)} · GENERATION {piece.survivalGeneration ?? 0}</span>
                        <span style={{ color: '#c5e6b4', fontSize: 9 }}>{protectionLabel(piece, now)}</span>
                      </div>
                      <button type="button" onClick={() => { setViewingArtworkId(null); setViewingPieceId(piece.pieceId); onView?.(piece.pieceId); }} style={smallButtonStyle}>VIEW</button>
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
            {visibleArtworks.map(artwork => <li key={artwork.id} style={{ display: 'grid', gap: 7, padding: 10, border: '1px solid rgba(255,255,255,.13)', borderRadius: 4 }}>
              <b>Image / poster</b>
              {creator(artwork)}
              <div className="button-row">
                <button type="button" style={smallButtonStyle} onClick={() => { setViewingPieceId(null); setViewingArtworkId(artwork.id); onViewArtwork?.(artwork.id); }}>VIEW IMAGE</button>
                {canDeletePieces && onDeleteArtwork && <button type="button" style={smallButtonStyle} disabled={!connected} onClick={() => requestArtworkDelete(artwork)}>DELETE IMAGE</button>}
              </div>
            </li>)}
            </ul>
          )}
          </div>
        </GameSheet>
      )}
    </div>
  );
};

const smallButtonStyle: React.CSSProperties = {
  minHeight: 44, padding: '0 9px', border: '1px solid rgba(255,255,255,.22)', borderRadius: 3,
  background: 'rgba(255,255,255,.07)', color: '#f3f1e9', fontFamily: 'inherit', fontSize: 11, fontWeight: 700, letterSpacing: '.08em', cursor: 'pointer',
};
const closeButtonStyle: React.CSSProperties = { ...smallButtonStyle, width: 40, padding: 0, fontSize: 22 };
const noteStyle: React.CSSProperties = { margin: '4px 0 8px', color: '#b8bcb4', fontSize: 10, lineHeight: 1.4 };

export default GraffitiPieces;
