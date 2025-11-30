
export type ShadowIntensity = 'soft' | 'hard' | 'long';

export type MaterialType = 'standard' | 'metal' | 'texture';

export interface HistoryItem {
  id: string;
  originalImage: string; // Base64 data URI for display
  generatedImage: string; // Base64 data URI for result
  timestamp: number;
  status: 'queued' | 'generating' | 'completed' | 'failed';
  // Fields required for delayed processing
  base64Data?: string;
  mimeType?: string;
  originalFilename?: string;
  materialType?: MaterialType; // Replaces isMetal
  shadowAngle?: number; // 0-360 degrees
  shadowIntensity?: ShadowIntensity;
  backgroundDistance?: number; // 0-100, 0 is touching, 100 is high floating
}

export interface GeneratedImageResult {
  imageData: string;
  mimeType: string;
}

declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }
}
