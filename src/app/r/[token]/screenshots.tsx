"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Screenshots, pasted or picked.
 *
 * The people this form is for arrive with the picture already on their
 * clipboard — they pressed PrtSc before they opened it. Making them save it
 * to disk first is the friction that turns a report into a shrug, so Ctrl+V
 * anywhere on the page is the primary path and the file picker is the
 * fallback.
 *
 * The real <input type="file"> is kept in the DOM and driven through a
 * DataTransfer rather than replaced by an upload endpoint. That keeps the
 * whole form a single plain POST, so it still submits with JavaScript off —
 * you just lose paste, which is exactly the right thing to lose.
 */
const MAX = 5;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

export function Screenshots({
  labels,
}: {
  labels: {
    label: string; hint: string; pick: string; drop: string;
    remove: string; max: string; wrongType: string;
  };
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [urls, setUrls] = useState<string[]>([]);
  const [warning, setWarning] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  // Previews are object URLs, which leak until revoked.
  useEffect(() => {
    const made = files.map((f) => URL.createObjectURL(f));
    setUrls(made);
    return () => made.forEach(URL.revokeObjectURL);
  }, [files]);

  // The file input is the source of truth at submit time, so it is kept in
  // step with our state rather than the other way round.
  useEffect(() => {
    if (!inputRef.current) return;
    const dt = new DataTransfer();
    for (const f of files) dt.items.add(f);
    inputRef.current.files = dt.files;
  }, [files]);

  const add = (incoming: File[]) => {
    const images = incoming.filter((f) => TYPES.includes(f.type));
    if (images.length < incoming.length) setWarning(labels.wrongType);
    else setWarning(null);
    if (images.length === 0) return;
    setFiles((current) => [...current, ...images].slice(0, MAX));
  };

  // Paste is bound to the document, not the field: nobody thinks to focus a
  // file input before pressing Ctrl+V.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = Array.from(e.clipboardData?.items ?? []);
      const pasted = items
        .filter((i) => i.kind === "file")
        .map((i) => i.getAsFile())
        .filter((f): f is File => f !== null);
      if (pasted.length > 0) {
        e.preventDefault();
        add(pasted);
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  });

  return (
    <div>
      <p className="text-sm font-medium text-ink-900">{labels.label}</p>
      <p className="mt-0.5 text-xs leading-relaxed text-ink-500">{labels.hint}</p>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          add(Array.from(e.dataTransfer.files));
        }}
        className={
          "mt-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors " +
          (dragging ? "border-pine-800 bg-pine-50" : "border-ink-200 bg-ink-50/40")
        }
      >
        <input
          ref={inputRef} type="file" name="images" multiple
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => add(Array.from(e.target.files ?? []))}
          className="sr-only" id="images"
        />
        <label
          htmlFor="images"
          className="cursor-pointer rounded-lg border border-ink-300 bg-white px-3 py-1.5 text-sm font-medium text-ink-800 hover:bg-ink-50"
        >
          {labels.pick}
        </label>
        <span className="ml-2 text-sm text-ink-500">{labels.drop}</span>
        <p className="mt-2 text-xs text-ink-400">{labels.max}</p>
      </div>

      {warning && <p className="mt-2 text-xs text-rust-700">{warning}</p>}

      {files.length > 0 && (
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {files.map((file, i) => (
            <li key={`${file.name}-${i}`} className="group relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={urls[i]} alt=""
                className="h-24 w-full rounded-lg border border-ink-200 object-cover"
              />
              <button
                type="button"
                onClick={() => setFiles((c) => c.filter((_, n) => n !== i))}
                className="absolute right-1.5 top-1.5 rounded-md bg-ink-900/80 px-2 py-0.5 text-xs text-white opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100"
              >
                {labels.remove}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
