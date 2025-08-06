const Bubble = ({ message }) => {
  const isFromBot = message.role === "assistant";
  const content = message.content;

  const isStructured = content && Array.isArray(content.results);

  return (
    <div className={`bubble ${isFromBot ? "assistant" : "user"}`}>
      <div className="message-content">
        {isStructured ? (
          content.results.map((result, index) => (
            <div key={index} className="structured-output">
              <h3>⚖️ {result.case.name}</h3>
              <p><strong>Date:</strong> {result.case.decision_date}</p>

              <h4>📘 Opinion Chunks</h4>
              {result.opinions.map((op, i) => (
                <div key={i} className="opinion-chunk">
                  <p>{op.opinion_text_preview}</p>
                </div>
              ))}

              <h4>🏛️ Case Details</h4>
              <ul>
                <li><strong>Court:</strong> {result.case.court}</li>
                <li><strong>Citations:</strong> {result.case.citations}</li>
                {result.case.url && (
                  <li>
                    <a href={result.case.url} target="_blank" rel="noreferrer">View Full Case</a>
                  </li>
                )}
              </ul>
            </div>
          ))
        ) : (
          <p>{content}</p>
        )}
      </div>
    </div>
  );
};

export default Bubble;
