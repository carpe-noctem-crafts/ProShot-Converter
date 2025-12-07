
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ApiKeyModal } from './components/ApiKeyModal';
import { HistoryGallery } from './components/HistoryGallery';
import { generateProPhoto, fileToBase64, fileToDataUri } from './services/geminiService';
import { HistoryItem, ShadowIntensity, MaterialType, AspectRatio, PatinaVariation, MaterialPreset } from './types';

const MAX_QUEUE_SIZE = 30;
const RATINGS_STORAGE_KEY = 'proshot_ratings';
const PRESETS_STORAGE_KEY = 'proshot_presets';

// Helper for delays
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const App: React.FC = () => {
  const [hasKey, setHasKey] = useState<boolean>(false);
  const [isCheckingKey, setIsCheckingKey] = useState<boolean>(true);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [totalRatings, setTotalRatings] = useState<number>(0);
  const [aiMemorySize, setAiMemorySize] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  
  // Queue Control State
  const [isQueueRunning, setIsQueueRunning] = useState<boolean>(false);
  
  // Settings State
  const [isSettingsLocked, setIsSettingsLocked] = useState<boolean>(false);
  const [materialType, setMaterialType] = useState<MaterialType>('standard');
  const [textureIntensity, setTextureIntensity] = useState<number>(50); // 0-100 for Texture material
  const [patinaIntensity, setPatinaIntensity] = useState<number>(0); // 0-100 for Metal material
  const [isPatinaEnabled, setIsPatinaEnabled] = useState<boolean>(false);
  const [patinaVariation, setPatinaVariation] = useState<PatinaVariation>('standard');
  const [shadowAngle, setShadowAngle] = useState<number>(135); // Default 135 deg (Bottom-Right)
  const [shadowIntensity, setShadowIntensity] = useState<ShadowIntensity>('soft');
  const [backgroundDistance, setBackgroundDistance] = useState<number>(0); // 0 (Grounded) to 100 (Floating)
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
  const [enhancedLighting, setEnhancedLighting] = useState<boolean>(true);

  // Preset State
  const [presets, setPresets] = useState<MaterialPreset[]>([]);
  const [newPresetName, setNewPresetName] = useState<string>('');

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
    // Load ratings
    const storedRatings = localStorage.getItem(RATINGS_STORAGE_KEY);
    if (storedRatings) {
        const parsed = JSON.parse(storedRatings);
        setTotalRatings(parsed.length);
        setAiMemorySize(parsed.filter((r: any) => r.rating >= 4).length);
    }
    // Load presets
    const storedPresets = localStorage.getItem(PRESETS_STORAGE_KEY);
    if (storedPresets) {
        try {
            setPresets(JSON.parse(storedPresets));
        } catch (e) {
            console.error("Failed to parse presets", e);
        }
    }
  }, [checkKey]);

  useEffect(() => {
    // Only process if the queue is explicitly running
    if (!isQueueRunning) return;
    if (processingId) return;

    // Process LIFO (Last In First Out) based on current array structure, or find first queued.
    // Ideally user expects the next available item.
    const nextItem = history.find(item => item.status === 'queued');
    
    if (nextItem) {
      processQueueItem(nextItem);
    } else {
      // Queue is empty, stop running
      setIsQueueRunning(false);
    }
  }, [history, processingId, isQueueRunning]);

  // Construct a memory string from high-rated past generations
  const getAiMemoryContext = () => {
    const stored = localStorage.getItem(RATINGS_STORAGE_KEY);
    if (!stored) return "";
    
    const ratings = JSON.parse(stored);
    const positiveExamples = ratings.filter((r: any) => r.rating >= 4);

    if (positiveExamples.length === 0) return "";

    // Helper to find the most frequent value in an array
    const getMode = (arr: any[]) => {
        if (arr.length === 0) return null;
        const counts: Record<string, number> = {};
        let maxCount = 0;
        let mode = arr[0];
        for (const item of arr) {
            const val = String(item);
            counts[val] = (counts[val] || 0) + 1;
            if (counts[val] > maxCount) {
                maxCount = counts[val];
                mode = item;
            }
        }
        return mode;
    };

    const preferredShadow = getMode(positiveExamples.map((r: any) => r.shadowIntensity));
    const preferredMaterial = getMode(positiveExamples.map((r: any) => r.materialType));
    // Bucket angles to nearest 45 degrees to find broad directional preference
    const preferredAngle = getMode(positiveExamples.map((r: any) => Math.round((r.shadowAngle || 135) / 45) * 45)); 
    const likesEnhanced = positiveExamples.filter((r: any) => r.enhancedLighting).length > (positiveExamples.length / 2);
    const prefersFloating = positiveExamples.filter((r: any) => (r.backgroundDistance || 0) > 10).length > (positiveExamples.length / 2);

    return `
    ### USER PREFERENCE PROFILE [Based on ${positiveExamples.length} High-Rated Samples]
    - **Lighting Style**: Strong preference for '${preferredShadow}' shadow hardness.
    - **Material Bias**: Frequently rates '${preferredMaterial}' renders highly.
    - **Lighting Setup**: ${likesEnhanced ? 'Prefers complex, radiosity-rich lighting (Enhanced Mode).' : 'Prefers standard, simpler lighting.'}
    - **Spatial Relation**: ${prefersFloating ? 'Often prefers floating/levitating product compositions.' : 'Prefers grounded, realistic placement.'}
    - **Angle Tendency**: Historically prefers lighting from approx ${preferredAngle}°.
    
    **INSTRUCTION**: Use these preferences to guide micro-decisions in contrast, micro-contrast, and texture emphasis where the prompt is ambiguous. If the current specific prompt conflicts with memory, prioritize the CURRENT prompt, but apply the user's preferred aesthetic "flavor" (e.g. contrast curve, saturation level).
    `;
  };

  const processQueueItem = async (item: HistoryItem) => {
    setProcessingId(item.id);
    setHistory(prev => prev.map(i => i.id === item.id ? { ...i, status: 'generating' } : i));

    try {
      if (!item.base64Data || !item.mimeType) {
        throw new Error("Missing image data for processing");
      }

      // Add a small throttle delay to prevent instant API spamming
      await delay(1000);

      // Generate memory context based on persistent ratings
      const memoryContext = getAiMemoryContext();

      const result = await generateProPhoto(
        item.base64Data, 
        item.mimeType, 
        item.materialType || 'standard', 
        item.shadowAngle,
        item.shadowIntensity,
        item.backgroundDistance,
        item.aspectRatio || '1:1',
        item.enhancedLighting,
        item.textureIntensity || 50,
        item.patinaIntensity || 0,
        item.patinaVariation || 'standard',
        memoryContext
      );
      const generatedUri = `data:${result.mimeType};base64,${result.imageData}`;

      setHistory(prev => prev.map(i => 
        i.id === item.id 
          ? { ...i, generatedImage: generatedUri, status: 'completed', base64Data: undefined }
          : i
      ));

    } catch (err: any) {
      console.error("Processing failed for item", item.id, err);
      
      const isRateLimit = err.message?.includes("429") || err.message?.includes("quota") || err.status === 429;
      
      setHistory(prev => prev.map(i => 
        i.id === item.id 
          ? { ...i, status: 'failed', base64Data: undefined } 
          : i
      ));

      if (err.message && err.message.includes("Requested entity was not found")) {
        setHasKey(false);
        setError("API Key session expired. Please select your key again.");
        setIsQueueRunning(false); // Stop queue on auth error
      } else if (isRateLimit) {
         console.warn("Rate limit detected. Pausing queue for 10 seconds...");
         // If we hit a rate limit, wait significantly before releasing the lock
         // This prevents the queue from instantly failing all subsequent items
         await delay(10000); 
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

  const processUploadedFiles = async (fileList: FileList | File[]) => {
    setError(null);

    const validFiles = (Array.from(fileList) as File[]).filter(file => {
      if (!file.type.startsWith('image/')) return false;
      if (file.size > 10 * 1024 * 1024) return false;
      return true;
    });

    if (validFiles.length === 0) {
      setError("No valid images selected (Max 10MB, JPG/PNG/WEBP).");
      return;
    }

    const currentActiveCount = history.filter(i => i.status === 'queued' || i.status === 'generating').length;
    if (currentActiveCount + validFiles.length > MAX_QUEUE_SIZE) {
      setError(`Queue limit reached (${MAX_QUEUE_SIZE}). You can only add ${MAX_QUEUE_SIZE - currentActiveCount} more images.`);
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
          // Capture current settings
          materialType: materialType,
          textureIntensity: textureIntensity,
          patinaIntensity: isPatinaEnabled ? patinaIntensity : 0,
          patinaVariation: patinaVariation,
          shadowAngle: shadowAngle,
          shadowIntensity: shadowIntensity,
          backgroundDistance: backgroundDistance,
          aspectRatio: aspectRatio,
          enhancedLighting: enhancedLighting
        });
      } catch (e) {
        console.error("Error reading file", file.name, e);
      }
    }));

    setHistory(prev => [...newItems, ...prev]);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    await processUploadedFiles(files);
    if (event.target) event.target.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        await processUploadedFiles(e.dataTransfer.files);
    }
  };

  const triggerFileInput = () => {
    const activeCount = history.filter(i => i.status === 'queued' || i.status === 'generating').length;
    if (activeCount < MAX_QUEUE_SIZE) {
      fileInputRef.current?.click();
    } else {
      setError("Queue is full.");
    }
  };

  const handleRegenerate = (id: string) => {
    setHistory(prev => prev.map(item => {
      if (item.id !== id) return item;

      // Reconstruct base64 data from originalImage Data URI
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
        textureIntensity: textureIntensity,
        patinaIntensity: isPatinaEnabled ? patinaIntensity : 0,
        patinaVariation: patinaVariation,
        shadowAngle: shadowAngle,
        shadowIntensity: shadowIntensity,
        backgroundDistance: backgroundDistance,
        aspectRatio: aspectRatio,
        enhancedLighting: enhancedLighting,
        timestamp: Date.now() 
      };
    }));
  };

  const handleRate = (id: string, rating: number) => {
    // 1. Update React State for immediate UI feedback
    setHistory(prev => prev.map(item => item.id === id ? { ...item, rating } : item));

    // 2. Persist to Local Storage
    const item = history.find(i => i.id === id);
    if (!item) return;

    // Create a comprehensive record for storage to learn specific preferences
    const ratingRecord = {
        id: item.id,
        rating: rating,
        timestamp: Date.now(),
        // Save ALL the settings used to generate this image to "teach" the AI
        materialType: item.materialType,
        shadowIntensity: item.shadowIntensity,
        shadowAngle: item.shadowAngle,
        backgroundDistance: item.backgroundDistance,
        enhancedLighting: item.enhancedLighting,
        textureIntensity: item.textureIntensity,
        patinaIntensity: item.patinaIntensity,
        patinaVariation: item.patinaVariation,
        aspectRatio: item.aspectRatio
    };

    const stored = localStorage.getItem(RATINGS_STORAGE_KEY);
    let ratingsArray = stored ? JSON.parse(stored) : [];
    
    // Update existing rating or add new one
    const existingIndex = ratingsArray.findIndex((r: any) => r.id === id);
    if (existingIndex >= 0) {
        ratingsArray[existingIndex] = ratingRecord;
    } else {
        ratingsArray.push(ratingRecord);
    }

    localStorage.setItem(RATINGS_STORAGE_KEY, JSON.stringify(ratingsArray));
    
    // 3. Update Stats
    setTotalRatings(ratingsArray.length);
    setAiMemorySize(ratingsArray.filter((r: any) => r.rating >= 4).length);
  };

  const handleClearHistory = () => {
    setHistory([]);
    setIsQueueRunning(false);
  };

  // Preset Management
  const handleSavePreset = () => {
    if (!newPresetName.trim()) return;

    const newPreset: MaterialPreset = {
      id: Date.now().toString(),
      name: newPresetName.trim(),
      materialType,
      settings: {
        textureIntensity: materialType === 'texture' ? textureIntensity : undefined,
        patinaIntensity: isPatinaEnabled ? patinaIntensity : undefined,
        patinaVariation: (materialType === 'metal' || materialType === 'patina' || materialType === 'silver' || materialType === 'ammonia') ? patinaVariation : undefined,
        isPatinaEnabled: (materialType === 'metal' || materialType === 'patina' || materialType === 'silver' || materialType === 'ammonia') ? isPatinaEnabled : undefined,
      }
    };

    const updatedPresets = [...presets, newPreset];
    setPresets(updatedPresets);
    localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(updatedPresets));
    setNewPresetName('');
  };

  const handleLoadPreset = (preset: MaterialPreset) => {
    // We assume the user is already on the correct material type, or we could switch them
    if (preset.materialType !== materialType) {
        setMaterialType(preset.materialType);
    }
    
    if (preset.settings.textureIntensity !== undefined) setTextureIntensity(preset.settings.textureIntensity);
    if (preset.settings.patinaIntensity !== undefined) setPatinaIntensity(preset.settings.patinaIntensity);
    if (preset.settings.patinaVariation !== undefined) setPatinaVariation(preset.settings.patinaVariation);
    if (preset.settings.isPatinaEnabled !== undefined) setIsPatinaEnabled(preset.settings.isPatinaEnabled);
  };

  const handleDeletePreset = (id: string) => {
    const updatedPresets = presets.filter(p => p.id !== id);
    setPresets(updatedPresets);
    localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(updatedPresets));
  };

  const queueCount = history.filter(i => i.status === 'queued').length;
  const isQueueFull = (queueCount + (processingId ? 1 : 0)) >= MAX_QUEUE_SIZE;

  // Filter presets for current material
  const currentPresets = presets.filter(p => p.materialType === materialType);

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
          <div className="flex items-center gap-4 md:gap-8">
             {/* AI Memory Indicator */}
             <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-slate-800 rounded-full border border-slate-700">
                <div className="flex items-center gap-1.5">
                    <span className="relative flex h-2 w-2">
                      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75 ${aiMemorySize > 0 ? '' : 'hidden'}`}></span>
                      <span className={`relative inline-flex rounded-full h-2 w-2 ${aiMemorySize > 0 ? 'bg-indigo-500' : 'bg-slate-500'}`}></span>
                    </span>
                    <span className="text-xs font-semibold text-slate-300">NEURAL MEMORY</span>
                </div>
                <div className="h-4 w-px bg-slate-700"></div>
                <div className="text-[10px] text-slate-400 font-mono">
                    <span className="text-white font-bold">{aiMemorySize}</span> LEARNED / <span className="text-slate-500">{totalRatings}</span> RATED
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
        </div>
      </header>

      <main className="flex-grow flex flex-col items-center pt-12 pb-24 px-4">
        
        <div className="w-full max-w-2xl text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-200 to-slate-400 mb-6 leading-tight">
            Turn snapshots into <br/>
            <span className="text-indigo-400">Professional Ads</span>
          </h2>
          <p className="text-lg text-slate-400 mb-8 max-w-lg mx-auto leading-relaxed">
            Upload your product photos. Configure your settings. <br/>Start the batch queue when ready.
          </p>

          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-2xl p-6 mb-8 max-w-lg mx-auto shadow-xl">
             <div className="flex justify-between items-center border-b border-slate-700 pb-4 mb-6">
                <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Studio Settings</h3>
                <button
                    onClick={() => setIsSettingsLocked(!isSettingsLocked)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold tracking-wide transition-all border ${
                        isSettingsLocked 
                        ? 'bg-amber-500/10 text-amber-500 border-amber-500/50 shadow-[0_0_10px_rgba(245,158,11,0.2)]' 
                        : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white hover:border-slate-500'
                    }`}
                >
                    {isSettingsLocked ? (
                        <>
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                            LOCKED
                        </>
                    ) : (
                         <>
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" /></svg>
                            LOCK SETTINGS
                        </>
                    )}
                </button>
             </div>
             
             <div className={`transition-all duration-300 ${isSettingsLocked ? 'opacity-50 pointer-events-none grayscale-[0.3]' : ''}`}>
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
                        
                        <div className="flex flex-wrap gap-1.5 mt-3">
                            {[45, 90, 135, 180, 225, 270, 315].map((angle) => (
                                <button
                                    key={angle}
                                    onClick={() => setShadowAngle(angle)}
                                    className={`px-2 py-1 text-[10px] font-mono rounded-md border transition-colors ${
                                        shadowAngle === angle 
                                        ? 'bg-indigo-600 text-white border-indigo-500' 
                                        : 'bg-slate-900 text-slate-400 border-slate-700 hover:border-slate-500 hover:text-slate-200'
                                    }`}
                                    title={`Set shadow angle to ${angle}°`}
                                >
                                    {angle}°
                                </button>
                            ))}
                        </div>
                     </div>

                     <div className="text-left">
                        <label className="block text-xs text-slate-400 mb-1.5 font-medium">Shadow Intensity</label>
                        <div className="grid grid-cols-3 gap-2 mb-4">
                            <button
                                onClick={() => setShadowIntensity('soft')}
                                className={`
                                    relative py-2.5 px-1 rounded-lg border flex flex-col items-center justify-center gap-2 transition-all duration-300
                                    ${shadowIntensity === 'soft' 
                                        ? 'bg-indigo-900/30 border-indigo-500/50 text-indigo-300 shadow-[0_0_15px_rgba(99,102,241,0.15)]' 
                                        : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-600 hover:bg-slate-800'}
                                `}
                            >
                                <div className={`w-3 h-3 rounded-full bg-current transition-all duration-700 ${shadowIntensity === 'soft' ? 'blur-[2px] animate-pulse scale-110' : 'blur-[1px] opacity-50'}`}></div>
                                <span className="text-[10px] font-medium">Soft</span>
                            </button>

                            <button
                                onClick={() => setShadowIntensity('hard')}
                                className={`
                                    relative py-2.5 px-1 rounded-lg border flex flex-col items-center justify-center gap-2 transition-all duration-300
                                    ${shadowIntensity === 'hard' 
                                        ? 'bg-indigo-900/30 border-indigo-500/50 text-indigo-300 shadow-[0_0_15px_rgba(99,102,241,0.15)]' 
                                        : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-600 hover:bg-slate-800'}
                                `}
                            >
                                <div className={`w-3 h-3 rounded-full border-2 border-current bg-transparent transition-all duration-300 ${shadowIntensity === 'hard' ? 'opacity-100 scale-110' : 'opacity-50'}`}></div>
                                <span className="text-[10px] font-medium">Hard</span>
                            </button>

                             <button
                                onClick={() => setShadowIntensity('long')}
                                className={`
                                    relative py-2.5 px-1 rounded-lg border flex flex-col items-center justify-center gap-2 transition-all duration-300
                                    ${shadowIntensity === 'long' 
                                        ? 'bg-indigo-900/30 border-indigo-500/50 text-indigo-300 shadow-[0_0_15px_rgba(99,102,241,0.15)]' 
                                        : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-600 hover:bg-slate-800'}
                                `}
                            >
                                <div className={`w-4 h-1.5 rounded-full bg-current transition-all duration-300 ${shadowIntensity === 'long' ? 'opacity-100 scale-110 -skew-x-12' : 'opacity-50'}`}></div>
                                <span className="text-[10px] font-medium">Long</span>
                            </button>
                        </div>

                        <button
                          onClick={() => setEnhancedLighting(!enhancedLighting)}
                          className={`
                            w-full p-3 rounded-lg border transition-all duration-300 flex items-center justify-between group relative overflow-hidden
                            ${enhancedLighting 
                              ? 'bg-indigo-900/20 border-indigo-500/50 shadow-[0_0_20px_rgba(99,102,241,0.15)]' 
                              : 'bg-slate-900 border-slate-700 hover:border-slate-600 hover:bg-slate-800'}
                          `}
                        >
                          <div className="flex items-center gap-3 relative z-10">
                              <div className={`p-1.5 rounded-md transition-colors ${enhancedLighting ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-500'}`}>
                                 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                 </svg>
                              </div>
                              <div className="flex flex-col items-start text-left">
                                  <span className={`text-xs font-bold tracking-wide ${enhancedLighting ? 'text-indigo-300' : 'text-slate-300'}`}>
                                    ENHANCED LIGHTING
                                  </span>
                                  <span className="text-[9px] text-slate-500 font-medium">Radiosity & Specularity</span>
                              </div>
                          </div>

                          <div className={`
                            w-10 h-5 rounded-full relative transition-colors duration-300 border border-transparent
                            ${enhancedLighting ? 'bg-indigo-600 border-indigo-400/30' : 'bg-slate-700 border-slate-600'}
                          `}>
                              <div className={`
                                w-3 h-3 bg-white rounded-full absolute top-0.5 shadow-md transition-all duration-300 cubic-bezier(0.4, 0.0, 0.2, 1)
                                ${enhancedLighting ? 'left-[22px]' : 'left-1'}
                              `}></div>
                          </div>
                          
                          {enhancedLighting && (
                            <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/0 via-indigo-500/5 to-indigo-500/0 animate-pulse pointer-events-none"></div>
                          )}
                        </button>
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

                 {/* Aspect Ratio Selector */}
                 <div className="text-left mb-6">
                     <label className="block text-xs text-slate-400 mb-2 font-medium">Output Aspect Ratio</label>
                     <div className="flex gap-2">
                        {(['1:1', '4:3', '16:9', '3:4', '9:16'] as AspectRatio[]).map((ratio) => (
                          <button
                            key={ratio}
                            onClick={() => setAspectRatio(ratio)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                              aspectRatio === ratio
                                ? 'bg-indigo-600 text-white border-indigo-500 shadow-md'
                                : 'bg-slate-900 text-slate-400 border-slate-700 hover:bg-slate-800'
                            }`}
                          >
                            {ratio}
                          </button>
                        ))}
                     </div>
                 </div>

                 {/* Material Selector */}
                 <div className="border-t border-slate-700 pt-5">
                     <label className="block text-xs text-slate-400 mb-3 font-medium uppercase tracking-wider">Surface Material Enhancement</label>
                     <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
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
                            onClick={() => {
                              setMaterialType('silver');
                              // Default to standard silver behavior, user can enable tarnish if desired
                              if (isPatinaEnabled) setIsPatinaEnabled(false);
                            }}
                            className={`py-2 px-1 rounded-lg text-xs font-medium transition-all ${
                                materialType === 'silver' 
                                ? 'bg-slate-300 text-slate-900 shadow-md' 
                                : 'bg-slate-800 text-slate-400 hover:bg-slate-700 border border-slate-700'
                            }`}
                        >
                            Silver
                            <span className="block text-[9px] opacity-70 font-normal">Sterling, Chrome</span>
                        </button>
                        <button
                            onClick={() => {
                              setMaterialType('patina');
                              setIsPatinaEnabled(true); // Force enable for dedicated patina mode
                              // Default to high intensity/standard variation for new users of this mode
                              if (patinaIntensity === 0) setPatinaIntensity(80);
                            }}
                            className={`py-2 px-1 rounded-lg text-xs font-medium transition-all ${
                                materialType === 'patina' 
                                ? 'bg-teal-600 text-white shadow-md' 
                                : 'bg-slate-800 text-slate-400 hover:bg-slate-700 border border-slate-700'
                            }`}
                        >
                            Patina
                            <span className="block text-[9px] opacity-70 font-normal">Oxidation</span>
                        </button>
                         <button
                            onClick={() => {
                              setMaterialType('ammonia');
                              setIsPatinaEnabled(true);
                              if (patinaIntensity === 0) setPatinaIntensity(85);
                            }}
                            className={`py-2 px-1 rounded-lg text-xs font-medium transition-all ${
                                materialType === 'ammonia' 
                                ? 'bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 text-white shadow-md' 
                                : 'bg-slate-800 text-slate-400 hover:bg-slate-700 border border-slate-700'
                            }`}
                        >
                            Ammonia / Rainbow
                            <span className="block text-[9px] opacity-70 font-normal">Iridescent Fume</span>
                        </button>
                         <button
                            onClick={() => setMaterialType('stone')}
                            className={`py-2 px-1 rounded-lg text-xs font-medium transition-all ${
                                materialType === 'stone' 
                                ? 'bg-purple-600 text-white shadow-md' 
                                : 'bg-slate-800 text-slate-400 hover:bg-slate-700 border border-slate-700'
                            }`}
                        >
                            Stone / Gem
                            <span className="block text-[9px] opacity-70 font-normal">Quartz, Marble</span>
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
                            <span className="block text-[9px] opacity-70 font-normal">Wood, Fabric</span>
                        </button>
                     </div>
                     
                     {/* Texture Intensity Slider - Conditional Render */}
                     {materialType === 'texture' && (
                        <div className="mt-3 bg-slate-900/50 p-3 rounded-lg border border-slate-700/50 animate-in fade-in slide-in-from-top-2 duration-300">
                            <div className="flex justify-between items-center mb-2">
                                <label className="text-xs text-slate-400 font-medium">Texture Intensity</label>
                                <span className="text-xs text-emerald-400 font-mono bg-emerald-900/30 px-2 py-0.5 rounded">{textureIntensity}%</span>
                            </div>
                            <input 
                                type="range" 
                                min="0" 
                                max="100" 
                                value={textureIntensity}
                                onChange={(e) => setTextureIntensity(Number(e.target.value))}
                                className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                            />
                            <div className="flex justify-between mt-1">
                                <span className="text-[9px] text-slate-600">Smooth</span>
                                <span className="text-[9px] text-slate-600">Rough</span>
                            </div>
                        </div>
                     )}

                     {/* Metal/Silver Patina/Ammonia Controls - Conditional Render */}
                     {(materialType === 'metal' || materialType === 'patina' || materialType === 'silver' || materialType === 'ammonia') && (
                        <div className="mt-3 bg-slate-900/50 p-3 rounded-lg border border-slate-700/50 animate-in fade-in slide-in-from-top-2 duration-300">
                            <div className="flex justify-between items-center mb-4">
                                <label className="text-xs text-slate-400 font-medium flex items-center gap-2">
                                    {materialType === 'silver' ? 'Enable Tarnish / Sulfurization' : materialType === 'ammonia' ? 'Enable Fuming Simulation' : 'Enable Patina / Oxidation'}
                                </label>
                                <button 
                                    onClick={() => {
                                        const newState = !isPatinaEnabled;
                                        setIsPatinaEnabled(newState);
                                        // If enabling and intensity is 0, set a default
                                        if (newState && patinaIntensity === 0) setPatinaIntensity(50);
                                    }}
                                    className={`relative w-8 h-4.5 rounded-full transition-colors duration-200 ${isPatinaEnabled ? 'bg-indigo-500' : 'bg-slate-700'}`}
                                >
                                    <div className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-transform duration-200 ${isPatinaEnabled ? 'translate-x-4' : 'translate-x-0.5'}`}></div>
                                </button>
                            </div>

                            {isPatinaEnabled && (
                                <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                                    <div className="mb-4">
                                        <div className="flex justify-between items-center mb-2">
                                            <label className="text-xs text-slate-400 font-medium">
                                                {materialType === 'patina' ? 'Oxidation Depth' : 
                                                 materialType === 'silver' ? 'Tarnish Level' : 
                                                 materialType === 'ammonia' ? 'Fuming Saturation' :
                                                 'Patina Intensity (Oxidation)'}
                                            </label>
                                            <span className={`text-xs font-mono px-2 py-0.5 rounded ${
                                                materialType === 'patina' ? 'text-teal-400 bg-teal-900/30' : 
                                                materialType === 'silver' ? 'text-slate-200 bg-slate-600/50' :
                                                materialType === 'ammonia' ? 'text-purple-300 bg-purple-900/40' :
                                                'text-amber-500 bg-amber-900/30'
                                            }`}>
                                                {patinaIntensity}%
                                            </span>
                                        </div>
                                        <input 
                                            type="range" 
                                            min="0" 
                                            max="100" 
                                            value={patinaIntensity}
                                            onChange={(e) => setPatinaIntensity(Number(e.target.value))}
                                            className={`w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer ${
                                                materialType === 'patina' ? 'accent-teal-500' : 
                                                materialType === 'silver' ? 'accent-slate-400' :
                                                materialType === 'ammonia' ? 'accent-purple-500' :
                                                'accent-amber-500'
                                            }`}
                                        />
                                        <div className="flex justify-between mt-1">
                                            <span className="text-[9px] text-slate-600">Pristine</span>
                                            <span className="text-[9px] text-slate-600">Ancient</span>
                                        </div>
                                    </div>
                                    
                                    <div>
                                        <label className="text-xs text-slate-400 font-medium mb-2 block">
                                            {materialType === 'silver' ? 'Tarnish Variation' : 'Patina Variation'}
                                        </label>
                                        <div className="grid grid-cols-3 gap-2">
                                            {(['subtle', 'standard', 'extreme'] as PatinaVariation[]).map(v => (
                                                <button
                                                    key={v}
                                                    onClick={() => setPatinaVariation(v)}
                                                    className={`
                                                        px-1 py-1.5 rounded text-[10px] font-medium border transition-colors capitalize
                                                        ${patinaVariation === v 
                                                            ? (
                                                                materialType === 'patina' ? 'bg-teal-500/20 text-teal-400 border-teal-500/50' : 
                                                                materialType === 'silver' ? 'bg-slate-500/30 text-slate-200 border-slate-500/50' :
                                                                materialType === 'ammonia' ? 'bg-purple-500/20 text-purple-300 border-purple-500/50' :
                                                                'bg-amber-500/20 text-amber-400 border-amber-500/50'
                                                            )
                                                            : 'bg-slate-800 text-slate-500 border-slate-700 hover:text-slate-300'}
                                                    `}
                                                >
                                                    {v}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                     )}

                     {/* Saved Presets Section - Show for complex types */}
                     {(materialType !== 'standard' && materialType !== 'stone') && (
                        <div className="mt-4 pt-4 border-t border-slate-700/50">
                           <label className="block text-xs text-slate-400 mb-2 font-medium">Saved {materialType.charAt(0).toUpperCase() + materialType.slice(1)} Presets</label>
                           
                           {/* Save New Preset */}
                           <div className="flex gap-2 mb-3">
                               <input 
                                  type="text" 
                                  placeholder="Preset Name (e.g. Heavy Blue)"
                                  value={newPresetName}
                                  onChange={(e) => setNewPresetName(e.target.value)}
                                  className="flex-grow bg-slate-900 border border-slate-700 rounded text-xs px-2 py-1 text-white focus:outline-none focus:border-indigo-500"
                               />
                               <button 
                                  onClick={handleSavePreset}
                                  disabled={!newPresetName.trim()}
                                  className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs px-3 py-1 rounded font-medium transition-colors"
                               >
                                  Save
                               </button>
                           </div>

                           {/* List Presets */}
                           {currentPresets.length > 0 ? (
                               <div className="flex flex-wrap gap-2">
                                   {currentPresets.map(preset => (
                                       <div key={preset.id} className="group relative flex items-center">
                                           <button
                                               onClick={() => handleLoadPreset(preset)}
                                               className="bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-600 hover:border-slate-500 text-[10px] px-2 py-1 rounded-l transition-colors"
                                           >
                                               {preset.name}
                                           </button>
                                           <button
                                               onClick={() => handleDeletePreset(preset.id)}
                                               className="bg-slate-800 hover:bg-red-900/30 text-slate-500 hover:text-red-400 border-y border-r border-slate-600 hover:border-red-900/30 text-[10px] px-1.5 py-1 rounded-r transition-colors"
                                               title="Delete Preset"
                                           >
                                               ×
                                           </button>
                                       </div>
                                   ))}
                               </div>
                           ) : (
                               <div className="text-[10px] text-slate-600 italic">No saved presets for {materialType}.</div>
                           )}
                        </div>
                     )}
                 </div>
             </div>
          </div>

          <div className="relative group mb-8">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept="image/png, image/jpeg, image/webp"
              className="hidden"
              multiple 
            />

            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={triggerFileInput}
              className={`
                relative w-full aspect-[2/1] rounded-3xl border-2 border-dashed transition-all duration-300
                flex flex-col items-center justify-center gap-4 overflow-hidden
                ${isQueueFull 
                  ? 'border-slate-700 bg-slate-800/30 cursor-not-allowed opacity-50' 
                  : isDragging 
                    ? 'border-indigo-400 bg-indigo-900/40 shadow-[0_0_30px_rgba(99,102,241,0.2)] scale-[1.02]'
                    : 'border-slate-700 bg-slate-800/50 hover:bg-slate-800 hover:border-indigo-500 hover:shadow-2xl hover:shadow-indigo-500/10 cursor-pointer'
                }
              `}
            >
               <div className="flex flex-col items-center pointer-events-none">
                  <div className={`w-20 h-20 rounded-full flex items-center justify-center transition-colors duration-300 ${isQueueFull ? 'bg-slate-700' : isDragging ? 'bg-indigo-600' : 'bg-slate-700 group-hover:bg-indigo-600'}`}>
                    <svg className={`w-10 h-10 ${isQueueFull ? 'text-slate-500' : isDragging ? 'text-white' : 'text-slate-300 group-hover:text-white'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      {isQueueFull ? (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      ) : (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      )}
                    </svg>
                  </div>
                  <div className="text-center mt-4">
                    <p className={`text-xl font-semibold mb-1 ${isQueueFull ? 'text-slate-500' : isDragging ? 'text-indigo-200' : 'text-white'}`}>
                      {isQueueFull ? 'Queue Limit Reached' : isDragging ? 'Drop Files Here' : 'Upload Product Photos'}
                    </p>
                    <p className="text-slate-400 text-sm">
                      {isQueueFull ? 'Start the queue to process images' : 'Click or Drag & Drop (Max 30)'}
                    </p>
                  </div>
               </div>
            </div>
            
            {error && (
              <div className="absolute -bottom-16 left-0 right-0 mx-auto w-max bg-red-500/10 border border-red-500 text-red-400 px-4 py-2 rounded-lg text-sm flex items-center gap-2 animate-bounce">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                {error}
              </div>
            )}
          </div>
          
          {/* Queue Controls - ONLY show if there are queued items or the queue is actively running */}
          {(queueCount > 0 || isQueueRunning) && (
              <div className="w-full max-w-lg mx-auto bg-slate-900 border border-slate-700 rounded-xl p-4 flex items-center justify-between shadow-2xl animate-in fade-in slide-in-from-bottom-4">
                  <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${isQueueRunning ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`}></div>
                      <div className="text-left">
                          <p className="text-sm font-semibold text-white">
                              {isQueueRunning ? 'Processing Queue...' : 'Queue Ready'}
                          </p>
                          <p className="text-xs text-slate-400">
                              {queueCount} item{queueCount !== 1 ? 's' : ''} waiting
                          </p>
                      </div>
                  </div>

                  {!isQueueRunning ? (
                      <button
                          onClick={() => setIsQueueRunning(true)}
                          className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg shadow-lg shadow-indigo-500/20 transition-all hover:scale-105 active:scale-95 flex items-center gap-2"
                      >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          START GENERATION
                      </button>
                  ) : (
                      <button
                          onClick={() => setIsQueueRunning(false)}
                          className="px-6 py-2 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg border border-slate-600 transition-all flex items-center gap-2"
                      >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          PAUSE
                      </button>
                  )}
              </div>
          )}

        </div>

        <HistoryGallery history={history} onClearHistory={handleClearHistory} onRegenerate={handleRegenerate} onRate={handleRate} />

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
