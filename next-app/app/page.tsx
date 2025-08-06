"use client";

import React, { useState } from "react";
import Bubble from "./components/Bubble";
import LoadingBubble from "./components/LoadingBubble";
import PromptSuggestionsRow from "./components/PromptSuggestionRow";
import Image from "next/image";
import courtChatLogo from "./assets/courtchat.png";

const Home: React.FC = () => {
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: input.trim()
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [...messages, userMessage] })
      });

      const data = await response.json();

      const botMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.content // already structured
      };

      setMessages(prev => [...prev, botMessage]);
    } catch (error) {
      console.error("Chat request failed:", error);
    } finally {
      setIsLoading(false);
      setInput("");
    }
  };

  const handlePromptClick = (prompt: string) => {
    setInput(prompt);
  };

  return (
    <main className="main-container">
      {/* Header */}
      <header className="header">
        <div className="logo-container">
          <Image 
            src={courtChatLogo} 
            width={40} 
            height={40} 
            alt="Court Chat Logo" 
            style={{ borderRadius: '8px' }}
          />
        </div>
        <div className="header-content">
          <h1 className="header-title">Court Chat</h1>
          <p className="header-subtitle">Supreme Court Case Research Assistant</p>
        </div>
      </header>

      {/* Chat Section */}
      <section className={`chat-section ${messages.length === 0 ? "" : "populated"}`}>
        {messages.length === 0 ? (
          <div className="welcome-content">
            <h2 className="welcome-title">Explore Legal History with Precision</h2>
            <p className="welcome-subtitle">
              Access comprehensive information about Supreme Court cases spanning from the 1700s to today. 
              Get detailed analysis, legal precedents, and constitutional insights powered by advanced legal research.
            </p>
            <PromptSuggestionsRow onPromptClick={handlePromptClick} />
          </div>
        ) : (
          <div className="chat-messages">
            {messages.map((msg, index) => (
              <Bubble key={msg.id || index} message={msg} />
            ))}
            {isLoading && <LoadingBubble />}
          </div>
        )}
      </section>

      {/* Input */}
      <form onSubmit={handleSubmit} className="chat-form">
        <div className="input-container">
          <input
            className="question-box"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask about any Supreme Court case or legal precedent..."
            disabled={isLoading}
          />
        </div>
        <button type="submit" className="submit-button" disabled={isLoading}>
          {isLoading ? "..." : "→"}
        </button>
      </form>
    </main>
  );
};

export default Home;
