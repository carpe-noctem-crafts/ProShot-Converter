
export type ShadowIntensity = 'soft' | 'hard' | 'long';

export type MaterialType = 'standard' | 'metal' | 'texture' | 'stone' | 'patina' | 'silver' | 'ammonia';

export type AspectRatio = '1:1' | '16:9' | '4:3' | '9:16' | '3:4';

export type PatinaVariation = 'subtle' | 'standard' | 'extreme';

export interface MaterialPreset {
  id: string;
  name: string;
  materialType: MaterialType;
  settings: {
    textureIntensity?: number;
    patinaIntensity?: number;
    patinaVariation?: PatinaVariation;
    isPatinaEnabled?: boolean;
  };
}

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
  materialType?: MaterialType; 
  textureIntensity?: number; // 0-100, specific for 'texture' material
  patinaIntensity?: number; // 0-100, specific for 'metal' material
  patinaVariation?: PatinaVariation; // specific for 'metal' material
  shadowAngle?: number; // 0-360 degrees
  shadowIntensity?: ShadowIntensity;
  backgroundDistance?: number; // 0-100
  aspectRatio?: AspectRatio;
  enhancedLighting?: boolean;
  rating?: number; // 1-5 Stars
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
