import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { Button } from "@/components/ui/button";
import { fetchInstagramImages } from "@/utils/instagram.functions";
import { Loader2, RefreshCw, Shuffle, Download, FileDown, Instagram } from "lucide-react";
import { toast, Toaster } from "sonner";

export const Route = createFileRoute("/")({
  component: Index,
  loader: async () => fetchInstagramImages(),
  head: () => ({
    meta: [
      { title: "@julis.social — Inspo Moodboard" },
      {
        name: "description",
        content:
          "An interactive moodboard canvas built from @julis.social Instagram posts. Drag, shuffle, and export as PNG or PDF.",
      },
    ],
  }),
});

type ImageItem = {
  id: string;
  src: string;
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  width: number; // px
  rotation: number; // deg
  zIndex: number;
};

type FetchedImage = { src: string; postUrl: string; width: number; height: number };

function buildLayout(images: FetchedImage[]): ImageItem[] {
  // Moodboard layout: scattered with varying sizes & subtle rotation.
  return images.map((img, i) => {
    const seed = (i + 1) * 9301 + 49297;
    const rand = (n: number) => ((Math.sin(seed * (n + 1)) + 1) / 2);
    const sizeBucket = i % 4;
    const widthPx = sizeBucket === 0 ? 240 : sizeBucket === 1 ? 180 : sizeBucket === 2 ? 200 : 160;
    return {
      id: `${i}-${img.src.slice(-16)}`,
      src: img.src,
      x: 5 + rand(1) * 75,
      y: 5 + rand(2) * 75,
      width: widthPx,
      rotation: (rand(3) - 0.5) * 16,
      zIndex: i,
    };
  });
}

function shuffleLayout(items: ImageItem[]): ImageItem[] {
  return items.map((item, i) => {
    const seed = Date.now() + i * 137;
    const rand = (n: number) => ((Math.sin(seed * (n + 1)) + 1) / 2);
    return {
      ...item,
      x: 5 + rand(1) * 75,
      y: 5 + rand(2) * 75,
      rotation: (rand(3) - 0.5) * 18,
      zIndex: Math.floor(rand(4) * 100),
    };
  });
}

function Index() {
  const initial = Route.useLoaderData();
  const [items, setItems] = useState<ImageItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{
    id: string | null;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  }>({ id: null, startX: 0, startY: 0, origX: 0, origY: 0 });
  const maxZ = useRef(100);

  useEffect(() => {
    if (initial?.images?.length) {
      setItems(buildLayout(initial.images));
    } else if (initial?.error) {
      toast.error(`Couldn't load images: ${initial.error}`);
    }
  }, [initial]);

  const handleRefresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchInstagramImages();
      if (result.images.length) {
        setItems(buildLayout(result.images));
        toast.success(`Loaded ${result.images.length} images`);
      } else {
        toast.error(result.error || "No images found");
      }
    } catch (e) {
      toast.error("Failed to refresh");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleShuffle = useCallback(() => {
    setItems((prev) => shuffleLayout(prev));
  }, []);

  const handlePointerDown = (e: React.PointerEvent, item: ImageItem) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    maxZ.current += 1;
    setItems((prev) =>
      prev.map((it) => (it.id === item.id ? { ...it, zIndex: maxZ.current } : it)),
    );
    dragState.current = {
      id: item.id,
      startX: e.clientX,
      startY: e.clientY,
      origX: item.x,
      origY: item.y,
    };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const ds = dragState.current;
    if (!ds.id || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const dxPct = ((e.clientX - ds.startX) / rect.width) * 100;
    const dyPct = ((e.clientY - ds.startY) / rect.height) * 100;
    setItems((prev) =>
      prev.map((it) =>
        it.id === ds.id ? { ...it, x: ds.origX + dxPct, y: ds.origY + dyPct } : it,
      ),
    );
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (dragState.current.id) {
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
      dragState.current.id = null;
    }
  };

  const exportCanvas = async (format: "png" | "pdf") => {
    if (!canvasRef.current) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(canvasRef.current, {
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#faf8f4",
        scale: 2,
      });
      if (format === "png") {
        const link = document.createElement("a");
        link.download = "julis-moodboard.png";
        link.href = canvas.toDataURL("image/png");
        link.click();
      } else {
        const imgData = canvas.toDataURL("image/png");
        const pdf = new jsPDF({
          orientation: canvas.width > canvas.height ? "landscape" : "portrait",
          unit: "px",
          format: [canvas.width, canvas.height],
        });
        pdf.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height);
        pdf.save("julis-moodboard.pdf");
      }
      toast.success(`Exported as ${format.toUpperCase()}`);
    } catch (e) {
      console.error(e);
      toast.error("Export failed — some images may be cross-origin protected");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="min-h-screen w-full" style={{ backgroundColor: "#faf8f4" }}>
      <Toaster position="top-center" />

      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-stone-200/60 bg-[#faf8f4]/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-amber-200 via-rose-200 to-purple-200">
              <Instagram className="h-4 w-4 text-stone-800" />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight text-stone-900 sm:text-lg">
                @julis.social
              </h1>
              <p className="text-[10px] uppercase tracking-[0.2em] text-stone-500 sm:text-xs">
                Inspo Moodboard
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleShuffle}
              disabled={loading || !items.length}
              className="border-stone-300 bg-white/60 hover:bg-white"
            >
              <Shuffle className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Shuffle</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={loading}
              className="border-stone-300 bg-white/60 hover:bg-white"
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportCanvas("png")}
              disabled={exporting || !items.length}
              className="border-stone-300 bg-white/60 hover:bg-white"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">PNG</span>
            </Button>
            <Button
              size="sm"
              onClick={() => exportCanvas("pdf")}
              disabled={exporting || !items.length}
              className="bg-stone-900 text-white hover:bg-stone-800"
            >
              <FileDown className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">PDF</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Canvas */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <div
          ref={canvasRef}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="relative w-full overflow-hidden rounded-2xl border border-stone-200 shadow-sm"
          style={{
            backgroundColor: "#fdfbf6",
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(120,113,108,0.15) 1px, transparent 0)",
            backgroundSize: "24px 24px",
            height: "min(80vh, 900px)",
            minHeight: "500px",
            touchAction: "none",
          }}
        >
          {items.length === 0 && !loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
              <div className="text-sm text-stone-500">No images loaded yet</div>
              <Button onClick={handleRefresh} variant="outline" size="sm">
                <RefreshCw className="h-3.5 w-3.5" />
                Load from Instagram
              </Button>
            </div>
          )}

          {loading && items.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-stone-400" />
            </div>
          )}

          {items.map((item) => (
            <div
              key={item.id}
              onPointerDown={(e) => handlePointerDown(e, item)}
              className="absolute cursor-grab touch-none select-none transition-shadow active:cursor-grabbing active:shadow-2xl"
              style={{
                left: `${item.x}%`,
                top: `${item.y}%`,
                width: `${item.width}px`,
                transform: `rotate(${item.rotation}deg)`,
                zIndex: item.zIndex,
                animation: "fadeInUp 0.6s ease-out both",
                animationDelay: `${item.zIndex * 30}ms`,
              }}
            >
              <div className="overflow-hidden rounded-sm bg-white p-2 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.15)] ring-1 ring-stone-900/5">
                <img
                  src={item.src}
                  alt="Instagram inspiration"
                  draggable={false}
                  className="block h-auto w-full pointer-events-none"
                  onError={(e) => {
                    (e.currentTarget.parentElement?.parentElement as HTMLElement)?.style.setProperty(
                      "display",
                      "none",
                    );
                  }}
                />
              </div>
            </div>
          ))}
        </div>

        <p className="mt-4 text-center text-xs text-stone-500">
          Drag images to rearrange · Click Shuffle for a new layout · Export as PNG or PDF
        </p>
      </main>

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px) rotate(0deg); }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
