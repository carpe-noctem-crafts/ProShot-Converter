import React from 'react';

interface ApiKeyModalProps {
  onSelectKey: () => void;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ onSelectKey }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 max-w-md w-full shadow-2xl text-center">
        <div className="mb-6">
          <svg className="w-16 h-16 mx-auto text-indigo-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
          <h2 className="text-2xl font-bold text-white mb-2">Access Required</h2>
          <p className="text-slate-400">
            To generate professional studio photography using <strong>Gemini 3 Pro</strong>, you need to connect a paid Google Cloud Project API Key.
          </p>
        </div>
        
        <button
          onClick={onSelectKey}
          className="w-full py-3 px-6 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg transition-colors duration-200 flex items-center justify-center gap-2"
        >
          <span>Connect API Key</span>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
        </button>
        
        <div className="mt-6 text-xs text-slate-500">
          <a 
            href="https://ai.google.dev/gemini-api/docs/billing" 
            target="_blank" 
            rel="noopener noreferrer"
            className="underline hover:text-indigo-400"
          >
            Learn more about billing and pricing
          </a>
        </div>
      </div>
    </div>
  );
};