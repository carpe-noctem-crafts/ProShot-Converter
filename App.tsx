
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ApiKeyModal } from './components/ApiKeyModal';
import { HistoryGallery } from './components/HistoryGallery';
import { generateProPhoto, fileToBase64, fileToDataUri } from './services/geminiService';
import { HistoryItem, ShadowIntensity, MaterialType } from './types';

const MAX_QUEUE_SIZE = 30;

const App: React.FC = () => {
  const [hasKey, setHasKey] = useState<boolean>(false);
  const [isCheckingKey, setIsCheckingKey] = useState<boolean>(true);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Settings State
  const [materialType, setMaterialType] = useState<MaterialType>('standard');
  const [shadowAngle, setShadowAngle] = useState<number>(135); // Default 135 deg (Bottom-Right)
  const [shadowIntensity, setShadowIntensity] = useState<ShadowIntensity>('soft');
  const [backgroundDistance, setBackgroundDistance] = useState<number>(0); // 0 (Grounded) to 100 (Floating)
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const checkKey = useCallback(async () => {
    try {
      if (window.aistudio && window.aistudio.hasSelectedApiKey) {
        const selected = await window.aistudio.hasSelectedApiKey();
        setHasKey(selected);
      } else {
        console.warn("window.aistudio not found");
        setHasKey(false); 
      }
    } catch (e) {
      console.error("Error checking API key", e);
      setHasKey(false);
    } finally {
      setIsCheckingKey(false);
    }
  }, []);

  useEffect(() => {
    checkKey();
  }, [checkKey]);

  useEffect(() => {
    if (processingId) return;
    const nextItem = history.find(item => item.status === 'queued');
    if (nextItem) {
      processQueueItem(nextItem);
    }
  }, [history, processingId]);

  const processQueueItem = async (item: HistoryItem) => {
    setProcessingId(item.id);
    setHistory(prev => prev.map(i => i.id === item.id ? { ...i, status: 'generating' } : i));

    try {
      if (!item.base64Data || !item.mimeType) {
        throw new Error("Missing image data for processing");
      }

      const result = await generateProPhoto(
        item.base64Data, 
        item.mimeType, 
        item.materialType || 'standard', 
        item.shadowAngle,
        item.shadowIntensity,
        item.backgroundDistance
      );
      const generatedUri = `data:${result.mimeType};base64,${result.imageData}`;

      setHistory(prev => prev.map(i => 
        i.id === item.id 
          ? { ...i, generatedImage: generatedUri, status: 'completed', base64Data: undefined }
          : i
      ));

    } catch (err: any) {
      console.error("Processing failed for item", item.id, err);
      setHistory(prev => prev.map(i => 
        i.id === item.id 
          ? { ...i, status: 'failed', base64Data: undefined } 
          : i
      ));

      if (err.message && err.message.includes("Requested entity was not found")) {
        setHasKey(false);
        setError("API Key session expired. Please select your key again.");
      }
    } finally {
      setProcessingId(null);
    }
  };

  const handleSelectKey = async () => {
    try {
      if (window.aistudio && window.aistudio.openSelectKey) {
        await window.aistudio.openSelectKey();
        setHasKey(true);
      }
    } catch (e) {
      console.error("Failed to select key", e);
      setError("Failed to select API key. Please try again.");
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setError(null);

    const validFiles = (Array.from(files) as File[]).filter(file => {
      if (!file.type.startsWith('image/')) return false;
      if (file.size > 10 * 1024 * 1024) return false;
      return true;
    });

    if (validFiles.length === 0) {
      setError("No valid images selected (Max 10MB, JPG/PNG/WEBP).");
      if (event.target) event.target.value = '';
      return;
    }

    const currentActiveCount = history.filter(i => i.status === 'queued' || i.status === 'generating').length;
    if (currentActiveCount + validFiles.length > MAX_QUEUE_SIZE) {
      setError(`Queue limit reached (${MAX_QUEUE_SIZE}). You can only add ${MAX_QUEUE_SIZE - currentActiveCount} more images.`);
      if (event.target) event.target.value = '';
      return;
    }

    const newItems: HistoryItem[] = [];

    await Promise.all(validFiles.map(async (file) => {
      try {
        const displayUri = await fileToDataUri(file);
        const base64Data = await fileToBase64(file);
        
        newItems.push({
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          originalImage: displayUri,
          generatedImage: '',
          timestamp: Date.now(),
          status: 'queued',
          base64Data: base64Data,
          mimeType: file.type,
          originalFilename: file.name,
          materialType: materialType,
          shadowAngle: shadowAngle,
          shadowIntensity: shadowIntensity,
          backgroundDistance: backgroundDistance
        });
      } catch (e) {
        console.error("Error reading file", file.name, e);
      }
    }));

    setHistory(prev => [...newItems, ...prev]);
    if (event.target) event.target.value = '';
  };

  const triggerFileInput = () => {
    const activeCount = history.filter(i => i.status === 'queued' || i.status === 'generating').length;
    if (activeCount < MAX_QUEUE_SIZE) {
      fileInputRef.current?.click();
    } else {
      setError("Queue is full. Please wait for images to process.");
    }
  };

  const handleRegenerate = (id: string) => {
    setHistory(prev => prev.map(item => {
      if (item.id !== id) return item;

      // Reconstruct base64 data from originalImage Data URI
      // Data URI format: data:[<mediatype>][;base64],<data>
      const parts = item.originalImage.split(',');
      const meta = parts[0];
      const base64Data = parts[1];
      
      let mimeType = 'image/png'; // default
      const mimeMatch = meta.match(/:(.*?);/);
      if (mimeMatch) {
        mimeType = mimeMatch[1];
      }

      return {
        ...item,
        status: 'queued',
        generatedImage: '', // Clear previous result
        base64Data: base64Data,
        mimeType: mimeType,
        // Apply current studio settings to the re-generation
        materialType: materialType,
        shadowAngle: shadowAngle,
        shadowIntensity: shadowIntensity,
        backgroundDistance: backgroundDistance,
        timestamp: Date.now() // Move to top of effective list logic if needed, though ID keeps order
      };
    }));
  };

  const handleClearHistory = () => {
    setHistory([]);
  };

  const queueCount = history.filter(i => i.status === 'queued').length;
  const isQueueFull = (queueCount + (processingId ? 1 : 0)) >= MAX_QUEUE_SIZE;

  if (isCheckingKey) {
    return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-50 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {!hasKey && <ApiKeyModal onSelectKey={handleSelectKey} />}

      <header className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-600/20">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">ProShot Studio AI</h1>
              <p className="text-xs text-indigo-400 font-medium">POWERED BY GEMINI 3 PRO</p>
            </div>
          </div>
          {hasKey && (
             <div className="flex items-center gap-4">
                <div className="text-xs text-slate-400">
                  Queue: <span className={queueCount > 0 ? "text-indigo-400 font-bold" : "text-slate-500"}>{queueCount}</span> / {MAX_QUEUE_SIZE}
                </div>
                <button 
                  onClick={handleSelectKey}
                  className="text-xs text-slate-500 hover:text-white transition-colors"
                >
                  Change API Key
                </button>
             </div>
          )}
        </div>
      </header>

      <main className="flex-grow flex flex-col items-center pt-12 pb-24 px-4">
        
        <div className="w-full max-w-2xl text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-200 to-slate-400 mb-6 leading-tight">
            Turn snapshots into <br/>
            <span className="text-indigo-400">Professional Ads</span>
          </h2>
          <p className="text-lg text-slate-400 mb-8 max-w-lg mx-auto leading-relaxed">
            Upload your product photos. Our AI photographer will restage them in a high-end studio setting.
          </p>

          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-2xl p-6 mb-8 max-w-lg mx-auto shadow-xl">
             <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4 border-b border-slate-700 pb-2">Studio Settings</h3>
             
             {/* Lighting Controls */}
             <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start mb-6">
                 <div className="text-left">
                    <div className="flex justify-between items-center mb-2">
                        <label className="text-xs text-slate-400 font-medium">Shadow Angle</label>
                        <span className="text-xs text-indigo-400 font-mono bg-indigo-900/30 px-2 py-0.5 rounded">{shadowAngle}°</span>
                    </div>
                    
                    <div className="flex items-center gap-3">
                        <input 
                            type="range" 
                            min="0" 
                            max="360" 
                            value={shadowAngle}
                            onChange={(e) => setShadowAngle(Number(e.target.value))}
                            className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                        />
                        <div className="w-8 h-8 rounded-full border border-slate-600 bg-slate-900 flex items-center justify-center relative shrink-0">
                            <div 
                                className="absolute w-full h-full flex items-center justify-center transition-transform duration-100"
                                style={{ transform: `rotate(${shadowAngle}deg)` }}
                            >
                                <div className="w-1 h-3 bg-indigo-500 rounded-full mt-auto mb-1"></div>
                            </div>
                            <div className="w-1 h-1 bg-slate-500 rounded-full"></div>
                        </div>
                    </div>
                 </div>

                 <div className="text-left">
                    <label className="block text-xs text-slate-400 mb-1.5 font-medium">Shadow Intensity</label>
                    <div className="relative">
                        <select 
                          value={shadowIntensity}
                          onChange={(e) => setShadowIntensity(e.target.value as ShadowIntensity)}
                          className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 appearance-none"
                        >
                          <option value="soft">Soft (Diffused)</option>
                          <option value="hard">Hard (Crisp)</option>
                          <option value="long">Long (Dramatic)</option>
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400">
                           <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                        </div>
                    </div>
                 </div>
             </div>

             {/* Elevation Control */}
             <div className="text-left mb-6">
                 <div className="flex justify-between items-center mb-2">
                     <label className="text-xs text-slate-400 font-medium">Elevation / Distance to Background</label>
                     <span className="text-xs text-indigo-400 font-mono bg-indigo-900/30 px-2 py-0.5 rounded">{backgroundDistance}%</span>
                 </div>
                 <div className="flex items-center gap-3">
                     <span className="text-[10px] text-slate-500 uppercase">Grounded</span>
                     <input 
                         type="range" 
                         min="0" 
                         max="100" 
                         value={backgroundDistance}
                         onChange={(e) => setBackgroundDistance(Number(e.target.value))}
                         className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                     />
                     <span className="text-[10px] text-slate-500 uppercase">Floating</span>
                 </div>
             </div>

             {/* Material Selector */}
             <div className="border-t border-slate-700 pt-5">
                 <label className="block text-xs text-slate-400 mb-3 font-medium uppercase tracking-wider">Surface Material Enhancement</label>
                 <div className="grid grid-cols-3 gap-2">
                    <button
                        onClick={() => setMaterialType('standard')}
                        className={`py-2 px-1 rounded-lg text-xs font-medium transition-all ${
                            materialType === 'standard' 
                            ? 'bg-slate-200 text-slate-900 shadow-md' 
                            : 'bg-slate-800 text-slate-400 hover:bg-slate-700 border border-slate-700'
                        }`}
                    >
                        Standard
                    </button>
                    <button
                        onClick={() => setMaterialType('metal')}
                        className={`py-2 px-1 rounded-lg text-xs font-medium transition-all ${
                            materialType === 'metal' 
                            ? 'bg-amber-500 text-black shadow-md' 
                            : 'bg-slate-800 text-slate-400 hover:bg-slate-700 border border-slate-700'
                        }`}
                    >
                        Metal
                        <span className="block text-[9px] opacity-70 font-normal">Brass, Copper</span>
                    </button>
                    <button
                        onClick={() => setMaterialType('texture')}
                        className={`py-2 px-1 rounded-lg text-xs font-medium transition-all ${
                            materialType === 'texture' 
                            ? 'bg-emerald-600 text-white shadow-md' 
                            : 'bg-slate-800 text-slate-400 hover:bg-slate-700 border border-slate-700'
                        }`}
                    >
                        Texture
                        <span className="block text-[9px] opacity-70 font-normal">Wood, Fabric, Glass</span>
                    </button>
                 </div>
             </div>
          </div>

          <div className="relative group">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept="image/png, image/jpeg, image/webp"
              className="hidden"
              multiple 
            />

            <button
              onClick={triggerFileInput}
              disabled={isQueueFull}
              className={`
                relative w-full aspect-[2/1] rounded-3xl border-2 border-dashed transition-all duration-300
                flex flex-col items-center justify-center gap-4 overflow-hidden
                ${isQueueFull 
                  ? 'border-slate-700 bg-slate-800/30 cursor-not-allowed opacity-50' 
                  : 'border-slate-700 bg-slate-800/50 hover:bg-slate-800 hover:border-indigo-500 hover:shadow-2xl hover:shadow-indigo-500/10 cursor-pointer'
                }
              `}
            >
               <div className="flex flex-col items-center">
                  <div className={`w-20 h-20 rounded-full flex items-center justify-center transition-colors duration-300 ${isQueueFull ? 'bg-slate-700' : 'bg-slate-700 group-hover:bg-indigo-600'}`}>
                    <svg className={`w-10 h-10 ${isQueueFull ? 'text-slate-500' : 'text-slate-300 group-hover:text-white'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      {isQueueFull ? (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      ) : (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      )}
                    </svg>
                  </div>
                  <div className="text-center mt-4">
                    <p className={`text-xl font-semibold mb-1 ${isQueueFull ? 'text-slate-500' : 'text-white'}`}>
                      {isQueueFull ? 'Queue Full' : 'Upload Product Photos'}
                    </p>
                    <p className="text-slate-400 text-sm">
                      {isQueueFull ? 'Please wait for images to process' : 'Click to add to queue (Max 30)'}
                    </p>
                  </div>
               </div>
            </button>
            
            {error && (
              <div className="absolute -bottom-16 left-0 right-0 mx-auto w-max bg-red-500/10 border border-red-500 text-red-400 px-4 py-2 rounded-lg text-sm flex items-center gap-2 animate-bounce">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                {error}
              </div>
            )}
          </div>
        </div>

        <HistoryGallery history={history} onClearHistory={handleClearHistory} onRegenerate={handleRegenerate} />

        {history.length === 0 && (
           <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4 opacity-30 pointer-events-none grayscale">
             {[1,2,3,4].map(i => (
               <div key={i} className="aspect-square bg-slate-800 rounded-xl border border-slate-700"></div>
             ))}
           </div>
        )}

      </main>
    </div>
  );
};

export default App;
