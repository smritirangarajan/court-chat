// components/PromptSuggestionButton.tsx
import React from 'react';

interface PromptSuggestionButtonProps {
  text: string;
  onClick: () => void;
}

const PromptSuggestionButton: React.FC<PromptSuggestionButtonProps> = ({ text, onClick }) => {
  return (
    <button
      className="prompt-suggestion-button"
      onClick={onClick}
    >
      {text}
    </button>
  );
};

export default PromptSuggestionButton;