
import { GoogleGenAI } from "@google/genai";
import { GeneratedImageResult, ShadowIntensity, MaterialType } from "../types";

const getShadowInstructions = (angle: number = 135, intensity: ShadowIntensity = 'soft', distance: number = 0) => {
  // Calculate Light Source (Opposite to shadow)
  // 0° = Top, 90° = Right, 180° = Bottom, 270° = Left
  const lightSourceAngle = (angle + 180) % 360;

  let shadowQuality = "";
  // Physics: Shadows get softer as object moves away from surface
  const distanceFactor = distance > 0 ? " The shadow must become progressively softer due to elevation." : "";

  switch (intensity) {
    case 'soft':
      shadowQuality = `highly diffused, soft, and feathered (Large Softbox/Octabank).${distanceFactor}`;
      break;
    case 'hard':
      shadowQuality = `sharp, crisp, and high-contrast (Direct Hard Strobe/Fresnel).${distanceFactor}`;
      break;
    case 'long':
      shadowQuality = `elongated and dramatic (Low Horizon Light).${distanceFactor}`;
      break;
    default:
      shadowQuality = "natural and soft.";
  }

  let elevationInstruction = "";
  if (distance <= 5) {
      elevationInstruction = "**STATUS: GROUNDED** (Distance: 0). The object is physically touching the white surface. Generate realistic **Ambient Occlusion (Contact Shadows)** at the very base. CAST SHADOW MUST START FROM THE OBJECT BASE.";
  } else {
      const heightDesc = distance < 30 ? "Hovering" : distance < 70 ? "Floating" : "Levitating";
      elevationInstruction = `**STATUS: ${heightDesc.toUpperCase()}** (Distance: ${distance}/100). The object is suspended in air. The cast shadow must be **DETACHED** from the object, offset by the light angle, creating a visual gap.`;
  }

  return `
   [LIGHTING & PHYSICS CONFIGURATION]
   - MAIN LIGHT SOURCE: Positioned at **${lightSourceAngle}°**.
   - CAST SHADOW DIRECTION: Shadows fall towards **${angle}°**.
   - SHADOW QUALITY: ${shadowQuality}
   - SPATIAL RELATION: ${elevationInstruction}
   - LIGHT BOUNCE (RADIOSITY): **REQUIRED**. Simulate subtle white light bouncing from the floor onto the underside/shadow-side of the object.
   - SPECULARITY: Highlights must align perfectly with the ${lightSourceAngle}° light source.
  `;
};

const getMaterialInstructions = (type: MaterialType = 'standard') => {
  switch (type) {
    case 'metal':
      return `
      **[MATERIAL PIPELINE: METALLIC & REFLECTIVE]**
      - **Target Surfaces**: Copper, Brass, Bronze, Silver, Gold, Anodized Aluminum.
      - **Surface Finishes**: 
         1. If Brushed: Render distinct, directional micro-scratches/grain.
         2. If Polished: Render high-contrast mirror-like reflections (high Index of Refraction).
         3. If Anodized: Render a matte metallic sheen with deep color saturation.
      - **Interaction**: The surface must appear "cold" and hard. Specular highlights should be sharp and blown out at the center.
      - **Patina**: If oxidation/age is detected, enhance the texture depth and color complexity.
      `;
    case 'texture':
      return `
      **[MATERIAL PIPELINE: HIGH-FIDELITY ORGANIC & TEXTURE]**
      - **Target Surfaces**: Wood, Fabric, Leather, Stone, Glass.
      - **Wood**: enhance grain contrast and pore detail.
      - **Fabric/Leather**: render visible weave/stitch patterns and micro-fiber texture.
      - **Glass/Transparent**: Maximize transmission and refraction. Render internal caustics if applicable. Clear, sharp edges.
      - **Interaction**: The surface must invite "touch". Focus on micro-displacement mapping effects.
      `;
    default:
      return `
      **[MATERIAL PIPELINE: STANDARD PRODUCT]**
      - Accurately identify materials (Plastic, Ceramic, Electronics, Packaging).
      - Apply Physically Based Rendering (PBR) standards: correct roughness, metallicity, and diffuse values.
      - If plastic: Add subtle Subsurface Scattering (SSS) on thin edges.
      `;
  }
};

const getSystemPrompt = (materialType: MaterialType, shadowAngle?: number, shadowIntensity?: ShadowIntensity, backgroundDistance?: number) => `
### SYSTEM ROLE
You are a specialized AI Imaging Engine (Nano Banana 2 / Gemini 3 Pro) for Commercial Product Photography.
Your goal: **TRANSFIGURE** raw input photos into **Production-Ready Advertisement Assets**.

### MANDATORY PRE-PROCESSING (CLEANUP)
**CRITICAL:** Before generating the new image, you must strictly perform:
1. **DELETE** all original cast shadows from the source image.
2. **ERASE** any black outlines, strokes, or "cutout artifacts" surrounding the object.
3. The object must be perfectly isolated before being placed into the new lighting environment.

### OUTPUT PARAMETERS
1. **Camera**: Hasselblad X2D 100C + 90mm Macro Lens.
2. **Settings**: f/8 Aperture (Deep depth of field, razor sharp), ISO 50, 1/200s.
3. **Background**: PURE WHITE (#FFFFFF) Studio Cyclorama. Zero texture.
4. **Viewpoint**: Top-Down (Flat Lay).

### LIGHTING SIMULATION
${getShadowInstructions(shadowAngle, shadowIntensity, backgroundDistance)}

### MATERIAL & TEXTURE ENHANCEMENT
${getMaterialInstructions(materialType)}

### EXECUTION PROTOCOL
1. **Clean**: Remove artifacts, outlines, and old shadows.
2. **Relight**: Apply the calculated directional lighting and shadow casting.
3. **Enhance**: Apply the specific material pipeline (Metal/Texture/Standard).
4. **Refine**: Sharpen textures, boost contrast, and ensure color accuracy.

### NEGATIVE CONSTRAINTS
- NO original background bleeding.
- NO cartoonish black outlines.
- NO modifying the product's actual shape or logo text.
- NO artifacts in the white background.
`;

export const generateProPhoto = async (
  base64Image: string,
  mimeType: string,
  materialType: MaterialType = 'standard',
  shadowAngle: number = 135,
  shadowIntensity: ShadowIntensity = 'soft',
  backgroundDistance: number = 0
): Promise<GeneratedImageResult> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key not found. Please connect your Google Cloud Project.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const modelId = "gemini-3-pro-image-preview";

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: {
        parts: [
          {
            text: getSystemPrompt(materialType, shadowAngle, shadowIntensity, backgroundDistance),
          },
          {
            inlineData: {
              data: base64Image,
              mimeType: mimeType,
            },
          },
        ],
      },
      config: {
        imageConfig: {
          imageSize: "2K",
          aspectRatio: "1:1",
        },
      },
    });

    const parts = response.candidates?.[0]?.content?.parts;
    if (!parts) {
      throw new Error("The AI model returned no content.");
    }

    for (const part of parts) {
      if (part.inlineData && part.inlineData.data) {
        return {
          imageData: part.inlineData.data,
          mimeType: part.inlineData.mimeType || "image/png",
        };
      }
    }

    throw new Error("No image generated.");
  } catch (error) {
    console.error("ProShot AI Processing Error:", error);
    throw error;
  }
};

export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const base64Data = result.split(',')[1]; 
      resolve(base64Data);
    };
    reader.onerror = (error) => reject(error);
  });
};

export const fileToDataUri = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };
