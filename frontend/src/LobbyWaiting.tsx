import React, { useState } from 'react';
import './LobbyWaiting.css';

interface Props {
  lobbyId: string;
  onCancel: () => void;
}

export default function LobbyWaiting({ lobbyId, onCancel }: Props) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(lobbyId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="lobby-waiting">
      <h2 className="lw-title">Lobby Created</h2>
      <p className="lw-subtitle">Share this code with your opponent:</p>

      <div className="lw-id-row">
        <span className="lw-id-code">{lobbyId}</span>
        <button className="lw-copy-btn" onClick={handleCopy}>
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>

      <div className="lw-spinner-row">
        <span className="lw-spinner" />
        <span className="lw-waiting-text">Waiting for opponent to join and place ships…</span>
      </div>

      <button className="lw-cancel-btn" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
