export interface Source { citationId: number; fileName: string; content: string; score: number; page?: number; sample?: boolean }
export interface Document { id: string; fileName: string; fileSize: number; pageCount: number; uploadedAt: string; category?: string }
export interface Research { id: string; question: string; answer: string; sources: Source[]; mode: "demo" | "live" }

export const sampleDocuments: Document[] = [
  { id: "strategy", fileName: "Product strategy · 2026.pdf", fileSize: 245760, pageCount: 3, uploadedAt: "2026-09-24", category: "Strategy" },
  { id: "interviews", fileName: "Customer discovery notes.pdf", fileSize: 184320, pageCount: 2, uploadedAt: "2026-09-22", category: "Research" },
  { id: "roadmap", fileName: "Q4 roadmap & priorities.pdf", fileSize: 327680, pageCount: 3, uploadedAt: "2026-09-20", category: "Planning" },
];
export const sampleSources: Source[] = [
  { sample: true, citationId: 1, fileName: sampleDocuments[0].fileName, page: 1, score: 0.92, content: "Our 2026 product strategy centers on making team knowledge discoverable and trustworthy. The first priority is source-backed answers: every generated response should link to the original passage. The second priority is reducing the time from document upload to a useful answer. Success will be evaluated with a target of 90% citation coverage on our internal evaluation set; this is a target, not a measured result." },
  { sample: true, citationId: 2, fileName: sampleDocuments[1].fileName, page: 2, score: 0.86, content: "In six exploratory customer interviews, participants described spending too much time switching between documents. Four participants asked to see the original text alongside an answer. Three wanted to save useful findings for later. This small qualitative sample suggests that transparency and continuity are promising directions; it is not representative of the broader market." },
  { sample: true, citationId: 3, fileName: sampleDocuments[2].fileName, page: 1, score: 0.81, content: "Q4 priorities: ship a side-by-side evidence inspector, introduce saved research, and improve document ingestion feedback. Evaluation work will track citation coverage, retrieval relevance, and time to first answer. Dependencies include a representative evaluation dataset and a configured vector search index. Team workspaces and role-based permissions remain future work." },
];
export const suggestions = ["What are our key product priorities?", "What did we learn from customers?", "What are the risks in the Q4 roadmap?"];
export function demoResearch(question: string): Research {
  const q = question.toLowerCase();
  let answer: string;
  let ids: number[];
  if (/customer|interview|learn|research/.test(q)) {
    answer = "Customers want less searching, more context. In six exploratory interviews, participants described losing time switching between documents. Four asked to inspect the original text alongside an answer, and three wanted to save findings for later. [2]\n\nThe product response is to prioritize an evidence inspector and saved research in Q4. These connect the discovery findings to concrete roadmap decisions. [3]\n\nA useful caveat: this is a small qualitative sample, so these findings should guide further discovery rather than be treated as market-wide validation. [2]"; ids = [2, 3];
  } else if (/risk|roadmap|depend|q4/.test(q)) {
    answer = "The Q4 roadmap focuses on three deliverables: a side-by-side evidence inspector, saved research, and clearer document ingestion feedback. [3]\n\nTwo dependencies need attention: a representative evaluation dataset and a configured vector search index. Without those, the team cannot reliably assess retrieval relevance or citation coverage. [3]\n\nThe strategy sets a 90% citation coverage target, but the documents do not report a measured result. Team workspaces and role-based permissions are future work, not current capabilities. [1][3]"; ids = [3, 1];
  } else if (/priorit|strateg|summari|product|key|trust|citation/.test(q)) {
    answer = "The clearest priority is making knowledge easier to find—and easier to trust. The strategy puts source-backed answers first, followed by a faster path from uploading a document to getting a useful answer. [1]\n\nCustomer discovery supports this direction: four of six interview participants wanted to inspect original passages alongside answers, while three wanted to save useful findings. [2]\n\nFor Q4, that translates into an evidence inspector, saved research, and better ingestion feedback. The team plans to evaluate citation coverage, retrieval relevance, and time to first answer. [3]"; ids = [1, 2, 3];
  } else { answer = "The sample documents do not contain sufficient evidence to answer this specific question. Try asking about product priorities, customer discovery, or Q4 roadmap risks. Connect your own library to explore other topics."; ids = []; }
  return { id: crypto.randomUUID(), question, answer, sources: ids.map(id => sampleSources.find(s => s.citationId === id)!), mode: "demo" };
}

// Network chunks may split event frames or Unicode characters at any byte.
export async function readAnswerStream(response: Response, onEvent: (event: { type: string; sources?: Source[]; token?: string; error?: string }) => void) {
  if (!response.body) throw new Error("The server returned an empty response.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  function dispatch(frame: string) {
    const payload = frame.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n");
    if (!payload) return false;
    if (payload === "[DONE]") return true;
    const event = JSON.parse(payload);
    if (event.type === "error") throw new Error(event.error || "The answer was interrupted. Please retry.");
    onEvent(event);
    return false;
  }
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let boundary;
      while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
        const frame = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary[0].length);
        if (dispatch(frame)) { await reader.cancel(); return; }
      }
      if (done) {
        if (buffer.trim() && dispatch(buffer)) return;
        throw new Error("The connection ended before the answer finished. Please retry.");
      }
    }
  } finally { reader.releaseLock(); }
}

