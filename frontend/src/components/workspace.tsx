"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUp, ArrowUpRight, BookOpen, Bookmark, Check, ChevronRight, CircleHelp, Copy, FileText, FolderOpen, Layers, LoaderCircle, Menu, MessageSquare, Plus, Search, ShieldCheck, Sparkles, Square, Upload, X } from "lucide-react";
import { demoResearch, Document, readAnswerStream, Research, sampleDocuments, sampleSources, Source, suggestions } from "@/lib/research";

const API = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api").replace(/\/$/, "");
const STORAGE = "recalldesk.saved.v1";
type View = "workspace" | "library" | "saved";

export default function Workspace() {
  const [mode, setMode] = useState<"demo" | "live">("demo");
  const [view, setView] = useState<View>("workspace");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("");
  const [documents, setDocuments] = useState<Document[]>([]);
  const [result, setResult] = useState<Research | null>(null);
  const [activeSource, setActiveSource] = useState<Source | null>(null);
  const [saved, setSaved] = useState<Research[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [about, setAbout] = useState(false);
  const [connected, setConnected] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const libraryRequest = useRef(0);
  const library = mode === "demo" ? sampleDocuments : documents;

  useEffect(() => {
    try {
      const data: unknown = JSON.parse(localStorage.getItem(STORAGE) || "[]");
      // Hydrate the browser-only store after server rendering; no derived state is involved.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (Array.isArray(data)) setSaved(data.filter((item): item is Research => item && typeof item.id === "string" && typeof item.question === "string" && typeof item.answer === "string" && Array.isArray(item.sources) && item.sources.every((s: Source) => s && typeof s.content === "string" && typeof s.fileName === "string" && typeof s.citationId === "number") && ["demo", "live"].includes(item.mode)));
    } catch { /* A disabled or corrupted store must not prevent using the workspace. */ }
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") { event.preventDefault(); setView("workspace"); requestAnimationFrame(() => input.current?.focus()); }
    };
    window.addEventListener("keydown", shortcut);
    return () => { window.removeEventListener("keydown", shortcut); abort.current?.abort(); };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(timer);
  }, [notice]);

  async function loadLibrary(requestId = libraryRequest.current) {
    const response = await fetch(`${API}/documents/`, { signal: AbortSignal.timeout(12000) });
    const data = await response.json();
    if (!response.ok || data.error) throw new Error("Your library is unavailable. Check the API and database configuration, then retry.");
    if (requestId === libraryRequest.current) { setDocuments(data.documents || []); setConnected(true); }
  }

  async function switchMode(next: "demo" | "live") {
    if (busy || uploading || next === mode) return;
    const requestId = ++libraryRequest.current;
    setMode(next); setResult(null); setActiveSource(null); setError(""); setFilter(""); setConnected(false);
    if (next === "live") try { await loadLibrary(requestId); } catch (err) { if (requestId === libraryRequest.current) setError(err instanceof Error ? err.message : "Could not connect to your library."); }
  }

  async function ask(question = query) {
    if (!question.trim() || busy) return;
    if (mode === "live" && !library.length) { setError("Add a document to your library before asking a question."); return; }
    setView("workspace"); setError(""); setBusy(true); setActiveSource(null); setQuery("");
    const controller = new AbortController(); abort.current = controller;
    const next: Research = { id: crypto.randomUUID(), question: question.trim(), answer: "", sources: [], mode };
    setResult(next);
    try {
      if (mode === "demo") {
        const demo = demoResearch(question);
        // The showcase uses authored sample answers, never a simulated live AI claim.
        next.sources = demo.sources; setActiveSource(demo.sources[0] || null);
        const words = demo.answer.match(/\S+\s*/g) || [];
        for (let i = 0; i < words.length; i += 5) {
          if (controller.signal.aborted) throw new DOMException("Stopped", "AbortError");
          next.answer += words.slice(i, i + 5).join(""); setResult({ ...next });
          await new Promise(resolve => setTimeout(resolve, 24));
        }
      } else {
        const response = await fetch(`${API}/chat/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: question }), signal: controller.signal });
        if (!response.ok) { const data = await response.json(); throw new Error(data.error || "Could not complete your search."); }
        await readAnswerStream(response, event => {
          if (event.type === "sources") { next.sources = event.sources || []; setActiveSource(next.sources[0] || null); }
          if (event.type === "token") next.answer += event.token || "";
          setResult({ ...next });
        });
      }
    } catch (err) {
      if (controller.signal.aborted) setNotice("Generation stopped. The partial answer is shown below.");
      else setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally { setBusy(false); }
  }

  async function upload(file?: File) {
    if (!file || uploading) return;
    if (mode === "demo") { setNotice("Switch to My library to upload your own PDFs."); return; }
    if (!file.name.toLowerCase().endsWith(".pdf") || file.size > 20 * 1024 * 1024) { setError("Choose a PDF smaller than 20 MB."); return; }
    setUploading(true); setError("");
    try {
      const body = new FormData(); body.append("file", file);
      const response = await fetch(`${API}/upload/`, { method: "POST", body, signal: AbortSignal.timeout(180000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Upload failed.");
      await loadLibrary(); setNotice(`${file.name} is ready to explore.`);
    } catch (err) { setError(err instanceof Error ? err.message : "Upload failed. Please retry."); }
    finally { setUploading(false); if (fileInput.current) fileInput.current.value = ""; }
  }

  function persist(items: Research[]) {
    try { localStorage.setItem(STORAGE, JSON.stringify(items)); setSaved(items); }
    catch { setError("Browser storage is unavailable or full. Your research could not be saved."); }
  }
  function toggleSave() {
    if (!result) return;
    persist(saved.some(s => s.id === result.id) ? saved.filter(s => s.id !== result.id) : [result, ...saved]);
  }
  function navigate(next: View) { setView(next); setMenuOpen(false); setFilter(""); }
  function newResearch() { if (busy) return; setResult(null); setActiveSource(null); setQuery(""); setError(""); navigate("workspace"); input.current?.focus(); }
  function openDocument(doc: Document) {
    setActiveSource(sampleSources.find(s => mode === "demo" && s.fileName === doc.fileName) || { citationId: 0, fileName: doc.fileName, score: 0, content: "Ask a question to retrieve matching passages from this document. Your original PDF stays in your own files." });
  }
  function renderAnswer(text: string) {
    return text.split("\n\n").map((paragraph, index) => <p key={index}>{paragraph.split(/(\[\d+\])/g).map((part, i) => {
      const source = result?.sources.find(s => `[${s.citationId}]` === part);
      return source ? <button className="citation" key={i} onClick={() => setActiveSource(source)} aria-label={`Inspect source ${source.citationId}`}>{source.citationId}</button> : <span key={i}>{part}</span>;
    })}</p>);
  }

  return <div className="app-shell">
    <a className="skip-link" href="#main">Skip to workspace</a>
    {menuOpen && <button className="nav-scrim" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
    <aside className={`sidebar ${menuOpen ? "is-open" : ""}`}>
      <Link className="brand" href="/" aria-label="RecallDesk home"><span className="brand-icon"><Layers size={22} /></span>RecallDesk<span className="brand-dot">✦</span></Link>
      <div className="workspace-label"><span className="workspace-avatar">P</span><div>Personal workspace<small>Your space to connect ideas</small></div></div>
      <button className="new-button" onClick={newResearch} disabled={busy}><Plus size={17} /> New research <span>↗</span></button>
      <div className="nav-label">WORKSPACE</div>
      <nav aria-label="Main navigation">
        <button className={view === "workspace" ? "active" : ""} onClick={() => navigate("workspace")}><Sparkles size={18} /> Ask your knowledge <span className="nav-indicator" /></button>
        <button className={view === "library" ? "active" : ""} onClick={() => navigate("library")}><FolderOpen size={18} /> Document library <span className="count">{library.length}</span></button>
        <button className={view === "saved" ? "active" : ""} onClick={() => navigate("saved")}><Bookmark size={18} /> Saved research <span className="count">{saved.length}</span></button>
      </nav>
      <div className="sidebar-library"><div className="nav-label">YOUR COLLECTION <span>{mode === "demo" ? "SAMPLE" : "LIVE"}</span></div>{library.map((doc, i) => <button key={doc.id} className="mini-doc" onClick={() => { navigate("library"); openDocument(doc); }}><FileText size={16} className={`doc-color-${i % 3}`} /><span>{doc.fileName.replace(".pdf", "")}</span></button>)}</div>
      <div className="sidebar-bottom"><div className="private-note"><ShieldCheck size={20} /><strong>Knowledge with receipts.</strong><p>Follow every answer back to the source. Stay curious. Stay certain.</p></div><button className="help-button" onClick={() => setAbout(true)}><CircleHelp size={17} /> About this workspace <ArrowUpRight size={14} /></button><div className="profile"><span>NR</span><div>Personal workspace<small>Local research collection</small></div><span className="profile-status" /></div></div>
    </aside>

    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Open navigation"><Menu size={20} /></button><span>Workspace</span><ChevronRight size={14} /><strong>{view === "workspace" ? "Ask your knowledge" : view === "library" ? "Document library" : "Saved research"}</strong></div><div className="topbar-right"><span className="connection"><i className={mode === "demo" || connected ? "online" : ""} />{mode === "demo" ? "Sample workspace" : connected ? "Library connected" : "Not connected"}</span><button className="avatar" onClick={() => setAbout(true)} aria-label="About personal workspace">NR</button></div></header>
      <main id="main" className="main-content">
        <div className="page-topline"><span className="eyebrow"><span /> YOUR KNOWLEDGE, CONNECTED</span><div className="mode-switch" aria-label="Data source"><button disabled={busy || uploading} className={mode === "demo" ? "selected" : ""} onClick={() => switchMode("demo")}>Explore demo</button><button disabled={busy || uploading} className={mode === "live" ? "selected" : ""} onClick={() => switchMode("live")}>My library</button></div></div>
        <div className="page-heading"><div><h1>{view === "workspace" ? <>Less searching.<br />More <em>understanding.</em></> : view === "library" ? <>A home for your <em>knowledge.</em></> : <>Ideas worth <em>keeping.</em></>}</h1><p>{view === "workspace" ? "Turn your documents into answers. With the evidence to back them up." : view === "library" ? "Bring your reading together. Find the connections that matter." : "Pick up where you left off. Your saved answers and their original sources."}</p></div><div className="heading-art" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="art-card back"><FileText /></div><div className="art-card front"><Sparkles size={29} /></div><span className="art-star">✦</span><span className="art-point" /></div></div>
        {error && <div className="error-banner" role="alert"><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss error"><X size={16} /></button></div>}
        <div className="content-grid">
          <section className="primary-column">
            {view === "workspace" && <>
              <div className="question-card"><div className="card-label"><Sparkles size={17} /><span>Start with a good question</span><span className="subtle-tag">{mode === "demo" ? "SAMPLE LIBRARY" : `${library.length} DOCUMENTS`}</span></div><form onSubmit={event => { event.preventDefault(); void ask(); }}><textarea ref={input} value={query} maxLength={4000} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void ask(); } }} placeholder="What would you like to understand?" aria-label="Ask a question about your documents" /><div className="composer-footer"><span><Layers size={14} /> Searching across {library.length} documents</span>{busy ? <button className="ask-button" type="button" onClick={() => abort.current?.abort()}><Square size={13} /> Stop</button> : <button className="ask-button" disabled={!query.trim() || (mode === "live" && !library.length)} type="submit">Ask RecallDesk <ArrowUp size={16} /></button>}</div></form></div>
              {!result && <><div className="suggestion-label">A LITTLE INSPIRATION</div><div className="suggestions">{suggestions.map((item, i) => <button key={item} onClick={() => ask(item)} disabled={busy || (mode === "live" && !library.length)}><span className="suggestion-icon">{i === 0 ? <Layers size={17} /> : i === 1 ? <MessageSquare size={17} /> : <BookOpen size={17} />}</span><span>{item}</span><ArrowUpRight size={15} /></button>)}</div><div className="collection-heading"><div><h2>Your knowledge, at a glance</h2><p>A few good sources. A whole new perspective.</p></div><button className="text-button" onClick={() => navigate("library")}>View library <ArrowUpRight size={14} /></button></div><div className="document-cards">{library.slice(0, 3).map((doc, i) => <button className="document-card" key={doc.id} onClick={() => openDocument(doc)}><span className={`file-icon doc-color-${i % 3}`}><FileText size={23} /></span><span className="file-type">PDF</span><h3>{doc.fileName.replace(".pdf", "")}</h3><p>{doc.pageCount} pages <span>·</span> {doc.category || "Document"}</p><div className="doc-card-footer"><span><i />{mode === "demo" ? "Sample source" : "Indexed"}</span><ArrowUpRight size={15} /></div></button>)}</div>{!library.length && <div className="empty-state"><FolderOpen /><h3>Your library starts here</h3><p>Upload a PDF to ask questions across your documents.</p><button className="secondary-button" onClick={() => fileInput.current?.click()}>Upload a document</button></div>}<div className="principle"><span><ShieldCheck size={19} /></span><div><strong>An answer is only as good as its sources.</strong><p>Inspect the passages behind each response, right alongside your research.</p></div></div></>}
              {result && <article className="answer-card"><div className="answer-question"><span>YOUR QUESTION</span><h2>{result.question}</h2></div><div className="answer-heading"><span className="answer-symbol"><Sparkles size={17} /></span><strong>{busy ? "Connecting the dots…" : "Here’s what the sources say"}</strong><span className="subtle-tag">{result.mode === "demo" ? "DEMO ANSWER" : "AI ANSWER"}</span></div><div className="answer-body" aria-live={busy ? "off" : "polite"}>{result.answer ? renderAnswer(result.answer) : <div className="loading-state"><LoaderCircle className="spin" size={18} /> Looking for relevant passages…</div>}</div>{result.sources.length > 0 && <div className="answer-sources">{result.sources.map(source => <button key={source.citationId} onClick={() => setActiveSource(source)}><span>{source.citationId}</span>{source.fileName.replace(".pdf", "")}<ArrowUpRight size={12} /></button>)}</div>}<div className="answer-actions"><span>{result.sources.length} supporting sources{result.mode === "demo" ? " · Authored sample answer" : " · Review citations for accuracy"}</span><button disabled={busy || !result.answer} onClick={toggleSave} className={saved.some(s => s.id === result.id) ? "is-saved" : ""}><Bookmark size={15} />{saved.some(s => s.id === result.id) ? "Saved" : "Save"}</button><button disabled={!result.answer} aria-label="Copy answer" onClick={async () => { try { await navigator.clipboard.writeText(`${result.question}\n\n${result.answer}\n\n${result.sources.map(s => `[${s.citationId}] ${s.fileName}\n${s.content}`).join("\n\n")}`); setNotice("Answer and sources copied."); } catch { setError("Clipboard unavailable. You can select and copy the answer text."); } }}><Copy size={15} /></button></div></article>}
            </>}
            {view === "library" && <div className="library-panel"><div className="section-toolbar"><h2>All documents <span>{library.length}</span></h2><button className="secondary-button" disabled={uploading} onClick={() => mode === "demo" ? setNotice("Switch to My library to upload your own PDFs.") : fileInput.current?.click()}><Plus size={15} /> Add document</button></div><label className="search-field"><Search size={17} /><input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Find a document…" aria-label="Find a document" /></label>{library.filter(doc => doc.fileName.toLowerCase().includes(filter.toLowerCase())).map((doc, i) => <button className="library-row" key={doc.id} onClick={() => openDocument(doc)}><span className={`file-icon doc-color-${i % 3}`}><FileText size={22} /></span><div><strong>{doc.fileName}</strong><small>{doc.pageCount} pages · {Math.round(doc.fileSize / 1024)} KB{mode === "demo" ? " · Sample metadata" : ""}</small></div><span className="row-status">{mode === "demo" ? "Sample" : "Ready"}</span><ChevronRight size={16} /></button>)}{!library.filter(doc => doc.fileName.toLowerCase().includes(filter.toLowerCase())).length && <div className="empty-state"><Search /><h3>{filter ? "No matching documents" : "Your library is empty"}</h3><p>{filter ? "Try a different document name." : "Add your first PDF to get started."}</p></div>}</div>}
            {view === "saved" && <div className="library-panel"><div className="section-toolbar"><h2>Saved research <span>{saved.length}</span></h2><Bookmark size={20} /></div><p className="storage-note">Stored in this browser. Includes answer text and source excerpts.</p>{saved.map(item => <div className="saved-row" key={item.id}><button onClick={() => { if (busy) return; setResult(item); setActiveSource(item.sources[0] || null); setView("workspace"); }}><span className="eyebrow">{item.mode === "demo" ? "SAMPLE RESEARCH" : "YOUR RESEARCH"}</span><h3>{item.question}</h3><p>{item.answer.slice(0, 130)}…</p><small>{item.sources.length} sources <ArrowUpRight size={13} /></small></button><button className="icon-button" aria-label={`Remove saved research: ${item.question}`} onClick={() => persist(saved.filter(s => s.id !== item.id))}><X size={16} /></button></div>)}{!saved.length && <div className="empty-state"><Bookmark /><h3>Keep your next discovery</h3><p>Save an answer to revisit it here, together with its evidence.</p><button className="secondary-button" onClick={() => navigate("workspace")}>Start exploring <ArrowUpRight size={14} /></button></div>}</div>}
          </section>
          <aside className="evidence-column"><div className="evidence-panel"><div className="evidence-title"><span><BookOpen size={18} /> The evidence desk</span><span className="live-dot" /></div>{activeSource ? <div className="selected-evidence"><div className="evidence-kicker">{activeSource.sample ? "SAMPLE EXCERPT" : "SOURCE EXCERPT"}{activeSource.citationId > 0 && <span>REF. {String(activeSource.citationId).padStart(2, "0")}</span>}</div><div className="source-document"><FileText size={21} /><h3>{activeSource.fileName}</h3></div>{activeSource.page && <span className="page-number">Page {activeSource.page}</span>}<blockquote>{activeSource.content}</blockquote><div className="evidence-foot"><ShieldCheck size={15} /><span>{activeSource.sample ? "Illustrative source from the sample collection" : "Original retrieved passage · verify in context"}</span></div></div> : <div className="evidence-empty"><div className="paper-stack"><div /><div /><div><span /><span /><span /><span /><span /></div><span className="paper-badge"><Check size={16} /></span></div><h3>See the story behind<br />every answer.</h3><p>Ask a question, then select a citation to explore the original passage here.</p><div className="evidence-steps"><span>01 <b>Ask a question</b></span><span>02 <b>Follow a citation</b></span><span>03 <b>Go straight to the source</b></span></div></div>}</div><div className="upload-card" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); void upload(e.dataTransfer.files[0]); }}><span className="upload-icon">{uploading ? <LoaderCircle className="spin" size={19} /> : <Upload size={19} />}</span><h3>{uploading ? "Preparing your document…" : "Make room for new ideas."}</h3><p>{uploading ? "Extracting text and indexing passages. This can take a moment." : "Add a PDF and put your knowledge to work."}</p><button disabled={uploading || busy} onClick={() => mode === "demo" ? setNotice("Switch to My library to upload your own PDFs.") : fileInput.current?.click()}>{uploading ? "Processing…" : "Upload a document"}<Plus size={14} /></button><small>PDF up to 20 MB · Drag & drop supported</small></div></aside>
        </div>
        <footer className="workspace-footer"><span><Layers size={13} /> Built for curious minds.</span><span>{mode === "demo" ? "Demo: fictional documents & authored answers. No API key needed." : "Answers may be incomplete. Always check the source."}</span><button onClick={() => setAbout(true)}>How it works <ArrowUpRight size={12} /></button></footer>
      </main>
    </div>
    <input ref={fileInput} type="file" accept=".pdf,application/pdf" hidden onChange={e => upload(e.target.files?.[0])} />
    {notice && <div className="toast" role="status"><Check size={17} />{notice}<button aria-label="Dismiss notification" onClick={() => setNotice("")}><X size={14} /></button></div>}
    {about && <div className="modal-backdrop" onClick={() => setAbout(false)}><dialog ref={node => { if (node && !node.open) node.showModal(); }} aria-labelledby="about-title" onCancel={() => setAbout(false)} onClick={e => e.stopPropagation()}><button className="icon-button modal-close" aria-label="Close about" onClick={() => setAbout(false)}><X size={20} /></button><span className="brand-icon"><Layers size={23} /></span><h2 id="about-title">Your knowledge. A clearer picture.</h2><p>RecallDesk connects document questions to inspectable source passages. Explore the sample workspace, or connect the Django API to search your own PDFs.</p><ol><li><strong>Bring your sources.</strong> PDFs are split into searchable passages.</li><li><strong>Ask naturally.</strong> Vector retrieval finds relevant context for a streamed AI answer.</li><li><strong>Check the evidence.</strong> Citations connect responses to original excerpts.</li></ol><div className="about-note">The demo uses fictional excerpts and authored answers. Live mode requires a configured API, MongoDB Atlas, and Gemini credentials. Saved research stays in this browser. This prototype has no user authentication; use a private deployment for your own documents.</div></dialog></div>}
  </div>;
}

