// components/LoadingBubble.tsx 
import React from 'react';

const LoadingBubble: React.FC = () => {
  return (
    <div className="loading-container">
      <div className="loader">
        <div className="message-label">CourtChat</div>
        <div className="loading-dots">
          <div className="loading-dot"></div>
          <div className="loading-dot"></div>
          <div className="loading-dot"></div>
        </div>
      </div>
    </div>
  );
};

export default LoadingBubble;