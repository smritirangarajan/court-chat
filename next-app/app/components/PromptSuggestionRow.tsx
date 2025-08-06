import React from 'react';
import PromptSuggestionButton from "./PromptSuggestionButton";

interface PromptSuggestionRowProps {
  onPromptClick: (prompt: string) => void;
}

const PromptSuggestionsRow: React.FC<PromptSuggestionRowProps> = ({ onPromptClick }) => {
  const prompts = [
    "What happened in Roe v. Wade?",
    "Cases against US Presidents",
    "Find a case from the 2010s about land rights"
  ];

  return (
    <div className="prompt-suggestion-row">
      {prompts.map((prompt, index) => (
        <PromptSuggestionButton
          key={`suggestion-${index}`}
          text={prompt}
          onClick={() => onPromptClick(prompt)}
        />
      ))}
    </div>
  );
};

export default PromptSuggestionsRow;
