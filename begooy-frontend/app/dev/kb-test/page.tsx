// app/dev/kb-test/page.tsx
"use client";
import { useState } from "react";

export default function KBTestPage() {
  const [kbId, setKbId] = useState("");
  const [text, setText] = useState("این یک متن آزمایشی است تا چانکینگ و امبدینگ تست شود.");
  const [url, setUrl] = useState("https://example.com");
  const [question, setQuestion] = useState("این KB درباره چیست؟");
  const [log, setLog] = useState<string>("");

  async function doUpload() {
    setLog("Uploading...");
    const res = await fetch("/api/kb/upload", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ text, title:"kb-demo", dims:[1536] })
    });
    const j = await res.json();
    setLog(JSON.stringify(j,null,2));
    if (j.kbId) setKbId(j.kbId);
  }

  async function doCrawl() {
    setLog("Crawling...");
    const res = await fetch("/api/kb/crawl", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ url, dims:[1536] })
    });
    const j = await res.json();
    setLog(JSON.stringify(j,null,2));
    if (j.kbId) setKbId(j.kbId);
  }

  async function doSearch() {
    setLog("Searching...");
    const res = await fetch("/api/kb/search", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ kbId, query: question, dims:[1536], limit:5, minSim:0.2 })
    });
    setLog(JSON.stringify(await res.json(),null,2));
  }

  async function doAsk() {
    setLog("Asking...");
    const res = await fetch("/api/kb/ask", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ kbId, question, dims:[1536], limit:5, minSim:0.2 })
    });
    setLog(JSON.stringify(await res.json(),null,2));
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">KB Dev Test</h1>

      <div className="space-y-2">
        <label className="font-medium">KB ID</label>
        <input className="w-full border rounded p-2" value={kbId} onChange={e=>setKbId(e.target.value)} placeholder="kb uuid" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="font-medium">Upload Text</label>
          <textarea className="w-full border rounded p-2 h-40" value={text} onChange={e=>setText(e.target.value)} />
          <button onClick={doUpload} className="px-3 py-2 rounded bg-black text-white">Upload</button>
        </div>
        <div className="space-y-2">
          <label className="font-medium">Crawl URL</label>
          <input className="w-full border rounded p-2" value={url} onChange={e=>setUrl(e.target.value)} />
          <button onClick={doCrawl} className="px-3 py-2 rounded bg-black text-white">Crawl</button>
        </div>
      </div>

      <div className="space-y-2">
        <label className="font-medium">Question</label>
        <input className="w-full border rounded p-2" value={question} onChange={e=>setQuestion(e.target.value)} />
        <div className="flex gap-2">
          <button onClick={doSearch} className="px-3 py-2 rounded bg-gray-800 text-white">Search</button>
          <button onClick={doAsk} className="px-3 py-2 rounded bg-blue-600 text-white">Ask</button>
        </div>
      </div>

      <pre className="bg-gray-100 p-3 rounded text-sm overflow-auto">{log}</pre>
    </div>
  );
}
