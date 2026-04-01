import { useRef, useState, useEffect, useCallback } from "react";
import { useApp } from "../../context/AppContext";

const ACCEPTED_EXTENSIONS = new Set(["pdf", "docx", "xlsx", "csv", "png", "jpg", "jpeg", "webp"]);
const ACCEPTED_ATTR = ".pdf,.docx,.xlsx,.csv,.png,.jpg,.jpeg,.webp";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "\u{1F4C4}";
  if (ext === "docx") return "\u{1F4DD}";
  if (ext === "xlsx" || ext === "csv") return "\u{1F4CA}";
  if (["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) return "\u{1F5BC}";
  return "\u{1F4C4}";
}

interface FileUploadProps {
  files: File[];
  onFilesChange: (files: File[]) => void;
  maxFiles?: number;
  maxSizeMB?: number;
}

export default function FileUpload({ files, onFilesChange, maxFiles = 5, maxSizeMB = 4 }: FileUploadProps) {
  const { colors: C } = useApp();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dragCounter = useRef(0);
  const maxSizeBytes = maxSizeMB * 1024 * 1024;

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 3000);
    return () => clearTimeout(timer);
  }, [error]);

  const validateAndAdd = useCallback((newFiles: File[]) => {
    if (files.length + newFiles.length > maxFiles) { setError(`最多上传 ${maxFiles} 个文件`); return; }
    for (const f of newFiles) {
      const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
      if (!ACCEPTED_EXTENSIONS.has(ext)) { setError(`不支持的文件类型: .${ext}`); return; }
      if (f.size > maxSizeBytes) { setError(`文件 "${f.name}" 超过 ${maxSizeMB}MB 限制`); return; }
    }
    setError(null);
    onFilesChange([...files, ...newFiles]);
  }, [files, maxFiles, maxSizeBytes, maxSizeMB, onFilesChange]);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files;
    if (!selected) return;
    validateAndAdd(Array.from(selected));
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleDragEnter(e: React.DragEvent) { e.preventDefault(); e.stopPropagation(); dragCounter.current++; setIsDragging(true); }
  function handleDragLeave(e: React.DragEvent) { e.preventDefault(); e.stopPropagation(); dragCounter.current--; if (dragCounter.current === 0) setIsDragging(false); }
  function handleDragOver(e: React.DragEvent) { e.preventDefault(); e.stopPropagation(); }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current = 0; setIsDragging(false);
    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles.length > 0) validateAndAdd(Array.from(droppedFiles));
  }
  function removeFile(index: number) { setError(null); onFilesChange(files.filter((_, i) => i !== index)); }

  return (
    <div>
      <div
        onClick={() => fileInputRef.current?.click()}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        style={{ border: `2px dashed ${isDragging ? C.ac : C.bd}`, borderRadius: 8, padding: "24px 16px", textAlign: "center", cursor: "pointer", background: isDragging ? `${C.ac}08` : "transparent", transition: "all 0.2s" }}
      >
        <input ref={fileInputRef} type="file" multiple accept={ACCEPTED_ATTR} onChange={handleFileSelect} style={{ display: "none" }} />
        <div style={{ fontSize: 28, marginBottom: 8, lineHeight: 1 }}>{isDragging ? "\u{2B07}\u{FE0F}" : "\u{1F4C4}"}</div>
        <div style={{ fontSize: 13, color: isDragging ? C.tx : C.t2 }}>拖拽文件到此处，或点击选择</div>
        <div style={{ fontSize: 11, color: C.t2, marginTop: 2 }}>Drag files here, or click to select</div>
        <div style={{ fontSize: 11, color: C.t2, marginTop: 8, lineHeight: 1.5 }}>
          支持 PDF, Word, Excel, CSV, 图片 · 最大 {maxSizeMB}MB，最多 {maxFiles} 个文件
        </div>
        <div style={{ fontSize: 11, color: "#f59e0b", marginTop: 6 }}>文件解析功能即将上线 · File analysis coming soon</div>
      </div>

      {files.length > 0 && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
          {files.map((f, i) => (
            <div key={`${f.name}-${i}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: C.s2, borderRadius: 6, fontSize: 13, animation: "fadeIn 0.2s ease-in" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <span style={{ fontSize: 15, flexShrink: 0 }}>{getFileIcon(f.name)}</span>
                <span style={{ color: C.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                <span style={{ color: C.t2, fontSize: 12, flexShrink: 0 }}>{formatFileSize(f.size)}</span>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                style={{ background: "none", border: "none", color: C.t2, fontSize: 16, cursor: "pointer", padding: "0 4px", lineHeight: 1, flexShrink: 0, marginLeft: 12, transition: "color 0.15s" }}
                onMouseEnter={(e) => { e.currentTarget.style.color = C.danger; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = C.t2; }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {error && <div style={{ color: C.danger, fontSize: 12, marginTop: 8 }}>{error}</div>}
      <style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }`}</style>
    </div>
  );
}
