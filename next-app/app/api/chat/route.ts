export async function POST(req: Request) {
    try {
      const { messages } = await req.json();
      const latest = messages[messages.length - 1].content;
  
      const resp = await fetch("http://localhost:8000/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: latest})
      });
  
      const text = await resp.text(); // Use .text() to catch non-JSON responses
      let data;
  
      try {
        data = JSON.parse(text);
      } catch (jsonErr) {
        console.error("Failed to parse backend response as JSON:", text);
        return new Response(
          JSON.stringify({ error: "Backend returned invalid JSON." }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
  
      if (!resp.ok) {
        console.error("Backend error:", data);
        return new Response(
          JSON.stringify({ error: data?.error || "Unknown backend error." }),
          { status: resp.status, headers: { "Content-Type": "application/json" } }
        );
      }
  
      return new Response(JSON.stringify(data), {
        headers: { "Content-Type": "application/json" }
      });
    } catch (err) {
      console.error("Fatal error in /api/chat:", err);
      return new Response(
        JSON.stringify({ error: "Internal server error" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }
  