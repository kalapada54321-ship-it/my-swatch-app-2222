import { useState, useRef, useCallback } from 'react';
import { extractColorsFromImage, ColorSwatch } from './utils/colorExtractor';
import { downloadASEFile } from './utils/aseExporter';

type Step = 'upload' | 'processing' | 'result';



function getLuminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function rgbToCmyk(r: number, g: number, b: number) {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const k = 1 - Math.max(rn, gn, bn);
  if (k === 1) return { c: 0, m: 0, y: 0, k: 100 };
  return {
    c: Math.round(((1 - rn - k) / (1 - k)) * 100),
    m: Math.round(((1 - gn - k) / (1 - k)) * 100),
    y: Math.round(((1 - bn - k) / (1 - k)) * 100),
    k: Math.round(k * 100),
  };
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg className="w-12 h-12" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M13.5 12l-3-3m0 0l-3 3m3-3v8.25M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function DownloadIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
  );
}

interface SwatchCardProps {
  swatch: ColorSwatch;
  index: number;
}

function SwatchCard({ swatch, index }: SwatchCardProps) {
  const [copied, setCopied] = useState(false);
  const isLight = getLuminance(swatch.r, swatch.g, swatch.b) > 155;
  const textColor = isLight ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.92)';

  const handleCopy = () => {
    navigator.clipboard.writeText(swatch.hex.toUpperCase());
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      className="group relative rounded-2xl overflow-hidden shadow-md hover:shadow-xl transition-all duration-300 hover:-translate-y-1 cursor-pointer"
      style={{ backgroundColor: swatch.hex }}
      onClick={handleCopy}
      title={`Click to copy ${swatch.hex.toUpperCase()}`}
    >
      <div className="h-24" />
      <div
        className="p-3"
        style={{
          backgroundColor: isLight ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.22)',
          backdropFilter: 'blur(8px)',
        }}
      >
        <div className="flex items-center justify-between gap-1">
          <div className="min-w-0">
            <p className="text-xs font-bold tracking-widest uppercase truncate" style={{ color: textColor }}>
              {swatch.hex.toUpperCase()}
            </p>
            <p className="text-xs mt-0.5 opacity-70 truncate" style={{ color: textColor }}>
              rgb({swatch.r},{swatch.g},{swatch.b})
            </p>
          </div>
          <button
            className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-1.5 rounded-lg"
            style={{
              backgroundColor: isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.18)',
              color: textColor,
            }}
            onClick={(e) => { e.stopPropagation(); handleCopy(); }}
            title="Copy HEX"
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
          </button>
        </div>
        <p className="text-xs mt-1 opacity-40 font-mono" style={{ color: textColor }}>
          #{index + 1}
        </p>
      </div>
    </div>
  );
}

export default function App() {
  const [step, setStep] = useState<Step>('upload');
  const [swatches, setSwatches] = useState<ColorSwatch[]>([]);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const [paletteName, setPaletteName] = useState<string>('My Palette');
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'swatches' | 'table'>('swatches');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processImage = useCallback(async (file: File) => {
    setError(null);
    if (!['image/jpeg', 'image/png', 'image/jpg'].includes(file.type)) {
      setError('Please upload a JPG or PNG image.');
      return;
    }

    const url = URL.createObjectURL(file);
    setImageUrl(url);
    const baseName = file.name.replace(/\.[^/.]+$/, '');
    setImageName(baseName);
    setPaletteName(baseName || 'My Palette');
    setStep('processing');

    const img = new Image();
    img.onload = async () => {
      const colors = await extractColorsFromImage(img);
      setSwatches(colors);
      setStep('result');
      setActiveTab('swatches');
    };
    img.onerror = () => {
      setError('Failed to load image. Please try another file.');
      setStep('upload');
    };
    img.src = url;
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processImage(file);
    // Reset input so same file can be re-uploaded
    e.target.value = '';
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processImage(file);
  }, [processImage]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleExport = () => {
    downloadASEFile(swatches, imageName || 'palette', paletteName || 'My Palette');
  };

  const handleReset = () => {
    setStep('upload');
    setSwatches([]);
    setImageUrl(null);
    setImageName('');
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="min-h-screen bg-[#0f1117] text-white font-sans">
      {/* Ambient background glows */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-15%] left-[-5%] w-[55vw] h-[55vw] rounded-full bg-violet-700/10 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[45vw] h-[45vw] rounded-full bg-indigo-700/10 blur-[120px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[30vw] h-[30vw] rounded-full bg-purple-800/5 blur-[80px]" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 py-10 sm:px-6 lg:px-8">

        {/* ── Header ── */}
        <header className="text-center mb-14">
          <div className="inline-flex items-center gap-2 mb-5 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-slate-400 tracking-widest uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            100% Local &nbsp;·&nbsp; No Upload &nbsp;·&nbsp; Instant
          </div>
          <h1 className="text-5xl sm:text-6xl font-black tracking-tight">
            <span className="bg-gradient-to-br from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
              Image to
            </span>{' '}
            <span className="bg-gradient-to-br from-violet-400 via-indigo-400 to-sky-400 bg-clip-text text-transparent">
              Swatch
            </span>
          </h1>
          <p className="mt-4 text-slate-400 text-lg max-w-lg mx-auto leading-relaxed">
            Upload any JPG or PNG — every distinct color is automatically detected
            and exported as an Adobe Illustrator{' '}
            <span className="text-violet-400 font-semibold">.ASE</span> swatch file.
          </p>
        </header>

        {/* ══════════════ UPLOAD STEP ══════════════ */}
        {step === 'upload' && (
          <div className="max-w-2xl mx-auto space-y-6">
            {error && (
              <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/30 text-red-300 px-5 py-4 rounded-2xl text-sm">
                <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                {error}
              </div>
            )}

            {/* Drop zone */}
            <div
              className={`relative flex flex-col items-center justify-center gap-6 rounded-3xl border-2 border-dashed p-16 text-center transition-all duration-300 cursor-pointer select-none
                ${isDragging
                  ? 'border-violet-500 bg-violet-500/10 scale-[1.015]'
                  : 'border-slate-700 bg-slate-900/60 hover:border-slate-500 hover:bg-slate-800/60'
                }`}
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              {/* Animated glow ring when dragging */}
              {isDragging && (
                <div className="absolute inset-0 rounded-3xl bg-violet-500/5 animate-pulse pointer-events-none" />
              )}

              <div className={`w-24 h-24 rounded-2xl flex items-center justify-center transition-all duration-300
                ${isDragging ? 'bg-violet-500/20 scale-110 text-violet-400' : 'bg-slate-800 text-slate-500'}`}>
                <UploadIcon />
              </div>

              <div>
                <p className="text-2xl font-bold text-white">
                  {isDragging ? 'Release to analyze' : 'Drop your image here'}
                </p>
                <p className="mt-1.5 text-slate-400">or click to browse your files</p>
                <p className="mt-3 text-sm text-slate-600">Supports JPG and PNG · Any resolution</p>
              </div>

              <button
                className="px-8 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-semibold text-sm transition-all shadow-lg shadow-violet-900/40 hover:shadow-violet-700/40 hover:scale-105"
                onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
              >
                Choose Image
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/jpg"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            {/* Feature pills */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { icon: '🔍', title: 'Auto-detect', desc: 'All unique colors found — no limits set by you' },
                { icon: '📦', title: 'True .ASE', desc: 'Native Adobe Swatch Exchange binary format' },
                { icon: '🔒', title: 'Private', desc: 'Everything runs locally in your browser' },
              ].map((item) => (
                <div key={item.title} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 text-center">
                  <div className="text-3xl mb-2">{item.icon}</div>
                  <p className="text-sm font-semibold text-slate-200">{item.title}</p>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══════════════ PROCESSING STEP ══════════════ */}
        {step === 'processing' && (
          <div className="flex flex-col items-center justify-center gap-10 py-32">
            {/* Spinner */}
            <div className="relative w-28 h-28">
              <div className="absolute inset-0 rounded-full border-4 border-violet-500/20 animate-ping" />
              <div className="absolute inset-2 rounded-full border-4 border-t-transparent border-violet-500 animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center text-3xl">🎨</div>
            </div>
            <div className="text-center space-y-2">
              <p className="text-2xl font-bold text-white">Detecting colors…</p>
              <p className="text-slate-400">Scanning every pixel and grouping unique hues</p>
            </div>
            <div className="flex gap-2">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className="w-2.5 h-2.5 rounded-full bg-violet-500 animate-bounce"
                  style={{ animationDelay: `${i * 120}ms` }}
                />
              ))}
            </div>
          </div>
        )}

        {/* ══════════════ RESULT STEP ══════════════ */}
        {step === 'result' && (
          <div className="space-y-8">

            {/* ── Top bar ── */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <button
                  onClick={handleReset}
                  className="inline-flex items-center gap-2 text-slate-500 hover:text-white transition-colors text-sm"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                  Upload another image
                </button>
                <h2 className="text-3xl font-extrabold text-white mt-2">
                  {swatches.length}{' '}
                  <span className="text-slate-400 font-normal text-2xl">colors detected</span>
                </h2>
                <p className="text-sm text-slate-500 mt-0.5 truncate max-w-xs">{imageName}</p>
              </div>

              <button
                onClick={handleExport}
                className="flex items-center gap-2.5 px-7 py-3.5 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold text-sm transition-all shadow-lg shadow-violet-900/50 hover:shadow-violet-700/50 hover:scale-105"
              >
                <DownloadIcon className="w-5 h-5" />
                Export .ASE Swatch
              </button>
            </div>

            {/* ── Main layout ── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

              {/* Left column: image + palette strip + export */}
              <div className="lg:col-span-1 space-y-4">

                {/* Source image */}
                <div className="bg-slate-900/70 border border-slate-800 rounded-2xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-slate-600" />
                    <p className="text-sm font-semibold text-slate-300">Source Image</p>
                  </div>
                  <div className="p-3">
                    {imageUrl && (
                      <img
                        src={imageUrl}
                        alt="Source"
                        className="w-full rounded-xl object-cover max-h-64"
                        crossOrigin="anonymous"
                      />
                    )}
                  </div>
                </div>

                {/* Palette strip */}
                <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 space-y-3">
                  <p className="text-sm font-semibold text-slate-300">Full Palette</p>
                  <div
                    className="flex h-10 rounded-xl overflow-hidden shadow-lg"
                    title="All extracted colors"
                  >
                    {swatches.map((s, i) => (
                      <div
                        key={s.hex + i}
                        style={{ backgroundColor: s.hex, flex: 1 }}
                        title={s.hex.toUpperCase()}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-slate-600 text-right">{swatches.length} unique colors</p>
                </div>

                {/* Export card */}
                <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-4">
                  <p className="text-sm font-semibold text-slate-300">Export Settings</p>

                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-500 uppercase tracking-widest">Palette Name</label>
                    <input
                      type="text"
                      value={paletteName}
                      onChange={(e) => setPaletteName(e.target.value)}
                      placeholder="My Palette"
                      className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-violet-500 transition-colors"
                    />
                  </div>

                  <button
                    onClick={handleExport}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-semibold text-sm transition-all hover:scale-[1.02] shadow-lg shadow-violet-900/40"
                  >
                    <DownloadIcon />
                    Download .ASE File
                  </button>

                  <p className="text-xs text-slate-600 text-center leading-relaxed">
                    Compatible with Adobe Illustrator,<br />Photoshop, InDesign & Affinity Designer
                  </p>
                </div>
              </div>

              {/* Right column: swatches / table */}
              <div className="lg:col-span-2 space-y-4">

                {/* Tab switcher */}
                <div className="flex gap-1 bg-slate-900/70 border border-slate-800 rounded-2xl p-1.5 w-fit">
                  {(['swatches', 'table'] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`px-5 py-2 rounded-xl text-sm font-semibold capitalize transition-all duration-200
                        ${activeTab === tab
                          ? 'bg-violet-600 text-white shadow-md'
                          : 'text-slate-400 hover:text-white'
                        }`}
                    >
                      {tab === 'swatches' ? '🎨 Swatches' : '📋 Color Table'}
                    </button>
                  ))}
                </div>

                {/* Swatches grid */}
                {activeTab === 'swatches' && (
                  <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5">
                    <div className="flex items-center justify-between mb-5">
                      <p className="text-sm font-semibold text-slate-300">
                        {swatches.length} Extracted Colors
                      </p>
                      <p className="text-xs text-slate-500">Click any swatch to copy HEX</p>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3 max-h-[600px] overflow-y-auto pr-1">
                      {swatches.map((swatch, i) => (
                        <SwatchCard key={swatch.hex + i} swatch={swatch} index={i} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Color reference table */}
                {activeTab === 'table' && (
                  <div className="bg-slate-900/70 border border-slate-800 rounded-2xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-300">Color Reference</p>
                      <p className="text-xs text-slate-500">{swatches.length} colors</p>
                    </div>

                    {/* Table header */}
                    <div className="grid grid-cols-[2.5rem_1fr_1fr_1fr_1fr] gap-4 px-5 py-2.5 border-b border-slate-800/60 text-xs font-semibold text-slate-500 uppercase tracking-widest">
                      <span />
                      <span>#</span>
                      <span>HEX</span>
                      <span>RGB</span>
                      <span className="hidden sm:block">CMYK</span>
                    </div>

                    <div className="divide-y divide-slate-800/50 max-h-[560px] overflow-y-auto">
                      {swatches.map((swatch, i) => {
                        const cmyk = rgbToCmyk(swatch.r, swatch.g, swatch.b);
                        return (
                          <div
                            key={swatch.hex + i}
                            className="grid grid-cols-[2.5rem_1fr_1fr_1fr_1fr] gap-4 items-center px-5 py-3 hover:bg-slate-800/40 transition-colors"
                          >
                            <div
                              className="w-8 h-8 rounded-lg shadow-md border border-white/5 shrink-0"
                              style={{ backgroundColor: swatch.hex }}
                            />
                            <span className="text-xs text-slate-500 font-mono">#{i + 1}</span>
                            <span className="font-mono text-sm text-white font-bold">{swatch.hex.toUpperCase()}</span>
                            <span className="text-sm text-slate-400 font-mono text-xs">
                              {swatch.r},{swatch.g},{swatch.b}
                            </span>
                            <span className="text-xs text-slate-500 font-mono hidden sm:block">
                              {cmyk.c}% {cmyk.m}% {cmyk.y}% {cmyk.k}%
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Footer ── */}
        <footer className="mt-20 text-center text-xs text-slate-700 space-y-1">
          <p>All processing happens locally in your browser — your images never leave your device.</p>
          <p>Exports native Adobe Swatch Exchange (.ASE) files compatible with Illustrator, Photoshop & InDesign.</p>
        </footer>
      </div>
    </div>
  );
}
