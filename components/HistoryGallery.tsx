
import React from 'react';
import { HistoryItem } from '../types';

interface HistoryGalleryProps {
  history: HistoryItem[];
  onClearHistory: () => void;
  onRegenerate: (id: string) => void;
}

export const HistoryGallery: React.FC<HistoryGalleryProps> = ({ history, onClearHistory, onRegenerate }) => {
  const handleDownload = (dataUri: string, item: HistoryItem) => {
    const link = document.createElement('a');
    link.href = dataUri;
    
    let downloadName = `pro-shot-${item.id}.png`;
    if (item.originalFilename) {
        const namePart = item.originalFilename.substring(0, item.originalFilename.lastIndexOf('.')) || item.originalFilename;
        downloadName = `pro_${namePart}.png`;
    }

    link.download = downloadName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadAll = async () => {
    const completedItems = history.filter(item => item.status === 'completed' && item.generatedImage);
    for (const item of completedItems) {
        handleDownload(item.generatedImage, item);
        await new Promise(resolve => setTimeout(resolve, 300));
    }
  };

  const completedCount = history.filter(item => item.status === 'completed').length;

  if (history.length === 0) return null;

  return (
    <section className="w-full max-w-6xl mx-auto mt-16 px-4 pb-20">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <svg className="w-6 h-6 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          Studio History
        </h2>
        
        <div className="flex items-center gap-4">
            <span className="text-slate-500 text-sm hidden sm:inline-block">{history.length} shoots</span>
            
            {history.length > 0 && (
                <button
                    onClick={onClearHistory}
                    className="flex items-center gap-2 px-3 py-2 bg-slate-800/50 hover:bg-red-900/20 hover:text-red-400 text-slate-400 text-sm font-medium rounded-lg border border-slate-700 hover:border-red-900/30 transition-colors"
                    title="Clear History"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    <span className="hidden sm:inline">Clear</span>
                </button>
            )}

            {completedCount > 0 && (
                <button 
                    onClick={handleDownloadAll}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-indigo-400 text-sm font-medium rounded-lg border border-slate-700 transition-colors"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Download All ({completedCount})
                </button>
            )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {history.map((item) => {
          const SettingsBadges = () => (
            <div className="absolute top-2 right-2 flex flex-col items-end gap-1 z-20">
              {item.materialType === 'metal' && (
                <span className="bg-amber-500/80 backdrop-blur-md text-black text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm border border-amber-300/20">
                  METAL
                </span>
              )}
              {item.materialType === 'texture' && (
                <span className="bg-emerald-500/80 backdrop-blur-md text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm border border-emerald-300/20">
                  TEXTURE
                </span>
              )}
              {item.backgroundDistance && item.backgroundDistance > 5 ? (
                 <span className="bg-sky-500/80 backdrop-blur-md text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm border border-sky-300/20">
                  ELEV:{item.backgroundDistance}%
                </span>
              ) : null}
              {item.shadowAngle !== undefined && (
                <span className="bg-slate-700/80 backdrop-blur-md text-slate-300 text-[10px] font-mono px-1.5 py-0.5 rounded shadow-sm border border-slate-600/30">
                  {item.shadowAngle}°
                </span>
              )}
            </div>
          );

          if (item.status === 'queued') {
            return (
              <div key={item.id} className="relative aspect-square bg-slate-900 rounded-xl overflow-hidden border border-slate-700 shadow-xl group">
                 <div className="absolute inset-0">
                  <img src={item.originalImage} className="w-full h-full object-cover opacity-10 blur-sm grayscale" alt="Queued" />
                </div>
                
                <SettingsBadges />

                <div className="absolute inset-0 flex flex-col items-center justify-center z-10 p-4 text-center">
                  <div className="w-12 h-12 rounded-full border-2 border-slate-600 border-dashed animate-[spin_10s_linear_infinite] mb-4 flex items-center justify-center">
                    <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h3 className="text-slate-400 font-semibold tracking-wide text-sm uppercase">In Queue</h3>
                  <p className="text-slate-600 text-xs mt-2 font-mono">Waiting for photographer...</p>
                </div>
              </div>
            );
          }

          if (item.status === 'generating') {
            return (
              <div key={item.id} className="relative aspect-square bg-slate-900 rounded-xl overflow-hidden border border-indigo-500/50 shadow-2xl group">
                <div className="absolute inset-0">
                  <img src={item.originalImage} className="w-full h-full object-cover opacity-20 blur-sm grayscale" alt="Processing" />
                </div>
                
                <SettingsBadges />

                <div className="absolute inset-0 overflow-hidden">
                  <div className="w-full h-full bg-gradient-to-b from-transparent via-indigo-500/10 to-transparent animate-scan absolute top-0 left-0">
                      <div className="w-full h-px bg-indigo-400/50 shadow-[0_0_15px_rgba(99,102,241,0.8)]"></div>
                  </div>
                </div>

                <div className="absolute inset-0 flex flex-col items-center justify-center z-10 p-4 text-center">
                  <div className="relative mb-4">
                    <div className="w-12 h-12 rounded-full border-2 border-slate-700 border-t-indigo-500 animate-spin"></div>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse"></div>
                    </div>
                  </div>
                  <h3 className="text-indigo-200 font-semibold tracking-widest text-sm uppercase animate-pulse">Developing</h3>
                  <p className="text-indigo-400/60 text-xs mt-2 font-mono">Simulating Lighting...</p>
                </div>
              </div>
            );
          }
          
          if (item.status === 'failed') {
            return (
              <div key={item.id} className="relative aspect-square bg-slate-900 rounded-xl overflow-hidden border border-red-900/50 shadow-xl flex flex-col items-center justify-center p-6 text-center">
                <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4">
                   <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                   </svg>
                </div>
                <h3 className="text-red-400 font-semibold mb-1">Development Failed</h3>
                <p className="text-slate-500 text-sm mb-4">Could not process this image.</p>
                
                <button 
                    onClick={() => onRegenerate(item.id)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs font-medium text-white transition-colors flex items-center gap-2"
                >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Retry with Current Settings
                </button>

                <div className="text-xs text-slate-600 font-mono mt-4">ID: {item.id.slice(0,8)}</div>
              </div>
            );
          }

          return (
            <div key={item.id} className="bg-slate-800 rounded-xl overflow-hidden border border-slate-700 shadow-xl group hover:border-indigo-500/50 transition-all duration-300">
              <div className="relative aspect-square bg-slate-900">
                 <div className="absolute top-2 left-2 z-10 bg-black/60 px-2 py-1 rounded text-xs font-mono text-white/70 backdrop-blur-sm">
                   PROCESSED
                 </div>
                 
                 <img 
                   src={item.generatedImage} 
                   alt="Generated Product" 
                   className="w-full h-full object-cover"
                 />

                 <div className="absolute bottom-2 left-2 w-16 h-16 rounded-md overflow-hidden border-2 border-white/20 shadow-lg bg-black">
                   <img src={item.originalImage} className="w-full h-full object-cover opacity-80" alt="Original" />
                 </div>

                 <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4 backdrop-blur-sm">
                   <button
                     onClick={() => handleDownload(item.generatedImage, item)}
                     className="p-3 bg-white text-slate-900 rounded-full hover:scale-110 transition-transform shadow-lg"
                     title={`Download ${item.originalFilename ? `pro_${item.originalFilename.split('.')[0]}.png` : 'Image'}`}
                   >
                     <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                     </svg>
                   </button>
                   
                   <button
                     onClick={() => onRegenerate(item.id)}
                     className="p-3 bg-indigo-600 text-white rounded-full hover:bg-indigo-500 hover:scale-110 transition-transform shadow-lg"
                     title="Re-shoot with current settings"
                   >
                     <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                     </svg>
                   </button>
                 </div>
              </div>
              
              <div className="p-4 flex justify-between items-center bg-slate-800">
                  <div className="text-xs text-slate-400 font-mono truncate max-w-[50%]">
                      {item.originalFilename || `ID: ${item.id.slice(0, 8)}`}
                  </div>
                  <div className="flex gap-2">
                    {item.materialType === 'metal' && <span className="text-[10px] text-amber-500 font-bold border border-amber-500/30 px-1 rounded">METAL</span>}
                    {item.materialType === 'texture' && <span className="text-[10px] text-emerald-500 font-bold border border-emerald-500/30 px-1 rounded">TEXTURE</span>}
                    <div className="text-xs text-indigo-400 font-medium">
                        2K
                    </div>
                  </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
