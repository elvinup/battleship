import React, { useState } from 'react';
import './LobbyPopup.css';

interface Props {
  lobbyId: string;
  onCancel: () => void;
}

export default function LobbyPopup({ lobbyId, onCancel }: Props) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(lobbyId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="lobby-badge">
      <div className="lb-header">
        <span className="lb-title">Waiting for opponent</span>
        <button className="lb-cancel-btn" onClick={onCancel} title="Cancel lobby">✕</button>
      </div>

      <div className="lb-id-row">
        <span className="lb-id-code">{lobbyId}</span>
        <button className="lb-copy-btn" onClick={handleCopy}>
          {copied ? '✓' : 'Copy'}
        </button>
      </div>

      <div className="lb-status-row">
        <span className="lb-spinner" />
        <span className="lb-status-text">Share this code to invite</span>
      </div>
    </div>
  );
}
