
import { GoogleGenAI } from "@google/genai";
import { GeneratedImageResult, ShadowIntensity, MaterialType, AspectRatio, PatinaVariation } from "../types";

const getShadowInstructions = (angle: number = 135, intensity: ShadowIntensity = 'soft', distance: number = 0, enhancedLighting: boolean = false) => {
  // Calculate Light Source (Opposite to shadow)
  // 0° = Top, 90° = Right, 180° = Bottom, 270° = Left
  const lightSourceAngle = (angle + 180) % 360;

  let shadowPhysics = "";
  const distanceEffect = distance > 0 ? " Due to elevation, the shadow edges must soften significantly as they move away from the object (Inverse Square Law)." : "";

  if (enhancedLighting) {
    switch (intensity) {
      case 'soft':
        shadowPhysics = `**PHYSICS: LARGE SOFTBOX (DIFFUSED)**. 
        1. **Light Wrap**: The light source is physically large. It MUST wrap around the object's form. **CRITICAL**: Simulate a subtle light wrap effect where the PURE WHITE BACKGROUND reflects light back onto the object's lower edges.
        2. **Gradient**: The cast shadow must have a smooth, feathered gradient from the core to the edge. NO hard outlines.
        3. **Bounce**: The white floor bounces light back up, filling in the deepest shadows on the object itself (High Radiosity).${distanceEffect}`;
        break;
      case 'hard':
        shadowPhysics = `**PHYSICS: FRESNEL SPOT (DIRECT)**. 
        1. **Definition**: High-contrast, well-defined shadow shape.
        2. **Penumbra Accuracy**: Create a physically accurate **PENUMBRA**. The shadow must be razor-sharp at the contact point (if grounded) but blur progressively (Hardness gradient) as it moves away from the object. The transition from Umbra (dark core) to Penumbra (soft edge) must be distinct.${distanceEffect}`;
        break;
      case 'long':
        shadowPhysics = `**PHYSICS: LOW ANGLE (DRAMATIC)**. 
        1. **Elongation**: Shadow length > 2x Object height. 
        2. **Falloff**: Shadow density decreases linearly with distance from the object.${distanceEffect}`;
        break;
    }
  } else {
    // Legacy/Standard instructions
    switch (intensity) {
      case 'soft': shadowPhysics = `Diffused, soft, and feathered.${distanceEffect}`; break;
      case 'hard': shadowPhysics = `Sharp, crisp, and high-contrast.${distanceEffect}`; break;
      case 'long': shadowPhysics = `Elongated and dramatic.${distanceEffect}`; break;
    }
  }

  let spatialInstruction = "";
  if (distance <= 5) {
      spatialInstruction = "**STATUS: GROUNDED**. The object is physically touching the white surface. **CRITICAL:** Generate deep, dark **Ambient Occlusion (Contact Shadows)** exactly where the object meets the floor to ground it.";
  } else {
      const heightDesc = distance < 30 ? "Hovering" : "Floating";
      spatialInstruction = `**STATUS: ${heightDesc.toUpperCase()}** (Distance: ${distance}%). The cast shadow is **DETACHED** from the object. The vertical offset distance indicates the height.`;
  }

  let lightingEngine = "";
  if (enhancedLighting) {
      lightingEngine = `
      - **ADVANCED LIGHT TRANSPORT**: 
        1. **White Bounce**: The pure white background (#FFFFFF) acts as a reflector. Project subtle cool-white fill light into the object's shadow areas.
        2. **Specular Physics**: Highlights must follow the curvature of the object (Fresnel effect).
      `;
  } else {
      lightingEngine = `- **STANDARD LIGHTING**: Simple ambient fill.`;
  }

  return `
   [LIGHTING & SHADOW SIMULATION]
   - MAIN LIGHT SOURCE ANGLE: ${lightSourceAngle}°
   - CAST SHADOW ANGLE: ${angle}°
   - SHADOW PROFILE: ${shadowPhysics}
   - SPATIAL RELATION: ${spatialInstruction}
   ${lightingEngine}
  `;
};

const getMaterialInstructions = (
    type: MaterialType = 'standard', 
    textureIntensity: number = 50,
    patinaIntensity: number = 0,
    patinaVariation: PatinaVariation = 'standard'
) => {
  switch (type) {
    case 'ammonia':
      // Derived from Metal/Patina prompts but specialized for Ammonia Fuming (Rainbow/Iridescent)
      let ammoniaVar = "";
      if (patinaVariation === 'subtle') ammoniaVar = "**LIGHT FUMING**: Delicate, wispy rainbow interference colors (Pink/Blue/Gold) on raw metal.";
      if (patinaVariation === 'standard') ammoniaVar = "**CLASSIC SALT & FUME**: Deep Cobalt Blue and Turquoise crystallization mixed with Magenta/Purple transitions. Natural bloom pattern.";
      if (patinaVariation === 'extreme') ammoniaVar = "**HEAVY SATURATION**: Intense, psychedelic color shifting. Neon Blues, Vibrant Purples, and sharp salt crusts covering most of the surface.";

      return `
      **[MATERIAL PIPELINE: AMMONIA VAPOR PATINA]**
      - **Target Surfaces**: Copper, Brass, Bronze exposed to Ammonia/Salt fuming.
      - **Intensity**: ${patinaIntensity}% Coverage.
      - **Physics Simulation**:
         1. **Fuming Process**: Render the patina as a result of chemical vapor interaction. It should appear organic, blooming, and crystalline.
         2. **Color Palette**: Focus on **IRIDESCENT RAINBOW** spectrum: Deep Blues, Teals, Magentas, Purples, and Golds.
         3. **Texture**: Mix of smooth iridescent stains (thin film interference) and rough, matte salt crystals (thick accumulation).
      - **Variation Mode**: ${ammoniaVar}
      - **Interaction**: High specular iridescence in thin areas, matte/diffuse in heavy blue/crystalline areas.
      `;

    case 'patina':
      // Derived from Metal prompts but specialized for heavy aging/oxidation
      let variationDesc = "";
      if (patinaVariation === 'subtle') variationDesc = "**UNIFORM OXIDATION**: A consistent layer of dull green/brown oxide. Very little raw metal showing.";
      if (patinaVariation === 'standard') variationDesc = "**REALISTIC WEATHERING**: A complex mix of Turquoise Verdigris, Malachite Green, and Dark Bronze. The oxidation should accumulate physically in crevices.";
      if (patinaVariation === 'extreme') variationDesc = "**ANCIENT ARTIFACT**: Heavy incrustation. Vibrant Azurite Blues and deep Emerald Greens. High-contrast transitions. Patina appears thick and crusty.";

      return `
      **[MATERIAL PIPELINE: AGED PATINA & OXIDATION]**
      - **Target Surfaces**: Ancient Bronze, Weathered Copper, Aged Brass.
      - **Intensity**: ${patinaIntensity}% Coverage.
      - **Texture Engine**:
         1. **Layering**: Render the patina as a PHYSICAL layer sitting ON TOP of the metal, not just a color change. It must look chalky, matte, and dry.
         2. **Color Palette**: Focus on **Blue/Green/Teal** spectrum (Verdigris/Malachite) for copper alloys.
         3. **Iridescence**: **CRITICAL**. At the transition zones where the patina thins out to reveal raw metal, render **oil-slick iridescence** (Subtle purple/gold heat stains).
      - **Variation Mode**: ${variationDesc}
      - **Roughness**: High roughness (Matte) for oxidized areas, Low roughness (Shiny) for exposed metal ridges.
      `;

    case 'metal':
      let patinaDesc = "";
      if (patinaIntensity > 0) {
          const depth = patinaIntensity < 30 ? "SURFACE DUSTING" : patinaIntensity < 70 ? "HEAVY OXIDATION" : "ANCIENT CRUST";
          
          let varInstruction = "";
          if (patinaVariation === 'subtle') varInstruction = "Monochrome oxidation (Uniform Green or Brown). Low color noise.";
          if (patinaVariation === 'standard') varInstruction = "Natural variation. Mix of Turquoise, Malachite Green, and Deep Bronze.";
          if (patinaVariation === 'extreme') varInstruction = "**CHAOTIC IRIDESCENCE**. High-frequency color shifting. Deep Blues, Vibrant Greens, and Oil-slick Purples mixed with raw metal.";

          patinaDesc = `
          - **PATINA ENGINE (${depth} - ${patinaIntensity}%)**:
             1. **Coverage**: Apply ${patinaIntensity}% coverage of oxidation effects, primarily in crevices and textured areas.
             2. **Palette**: ${varInstruction}
             3. **Micro-Texture**: The patina must appear physically raised/layered on top of the metal. It should have a matte, chalky finish contrasting with the shiny raw metal.
             4. **Iridescence**: If copper/bronze, specifically simulate heat-treatment interference colors (rainbow effect) at the transition zones between raw metal and oxidation.
          `;
      } else {
          patinaDesc = "- **PATINA**: None. Show pristine, factory-new metal.";
      }

      return `
      **[MATERIAL PIPELINE: ADVANCED METALLURGY]**
      - **Target Surfaces**: Copper, Brass, Bronze, Gold, Anodized Aluminum.
      - **Surface Finishes**: 
         1. **Brushed**: Render distinct, directional micro-scratches (anisotropic).
         2. **Polished**: Render high-contrast mirror-like reflections with high Index of Refraction (IOR).
         3. **Anodized**: Render a matte metallic sheen with deep color saturation and uniform diffusion.
      ${patinaDesc}
      - **Interaction**: The surface must appear cold. Specular highlights should be sharp (low roughness) for polished areas and spread out/diffused for oxidized areas.
      `;

    case 'silver':
      let tarnishDesc = "";
      if (patinaIntensity > 0) {
          const tarnishDepth = patinaIntensity < 30 ? "LIGHT TARNISH" : patinaIntensity < 70 ? "VINTAGE AGING" : "ANTIQUE BLACKENING";
          
          let tarnishVar = "";
          if (patinaVariation === 'subtle') tarnishVar = "Champagne/Yellowish tinting on highlights. Soft Grey in shadows.";
          if (patinaVariation === 'standard') tarnishVar = "**CLASSIC ANTIQUE**. Deep Grey/Black accumulation in crevices (Ag2S). Bright Silver on raised areas. High Contrast.";
          if (patinaVariation === 'extreme') tarnishVar = "**HEAVY SULFURIZATION**. Matte Black crust covering 80% of surface. Raw silver only visible on sharpest edges.";

          tarnishDesc = `
          - **TARNISH ENGINE (${tarnishDepth} - ${patinaIntensity}%)**:
             1. **Coverage**: Apply ${patinaIntensity}% coverage of Silver Sulfide tarnish.
             2. **Palette**: Neutral Greys, Blacks, and subtle Yellow/Blue interference colors. **NO GREEN/VERDIGRIS**.
             3. **Physics**: Tarnish accumulates deeply in recesses (Intaglio). Raised surfaces must remain bright due to 'handling/polishing'.
             4. **Variation**: ${tarnishVar}
          `;
      } else {
          tarnishDesc = "- **PURITY**: 99.9% Fine Silver / Sterling. Ultra-bright, white-hot specular highlights.";
      }

      return `
      **[MATERIAL PIPELINE: PRECIOUS SILVER]**
      - **Target Surfaces**: Sterling Silver (925), Fine Silver (999), Platinum, White Gold, Chrome.
      - **Tone**: **NEUTRAL COOL WHITE**. Strictly remove any yellow/gold/copper casts unless specified by tarnish settings.
      - **Reflectivity**: MAXIMUM. Silver has the highest reflectivity of all metals.
      - **Surface Finishes**: 
         1. **High Polish**: Mirror finish. Reflections must be white.
         2. **Satin/Matte**: Frosted silver texture, soft white diffusion.
      ${tarnishDesc}
      - **Interaction**: Crisp, white specular highlights. Deep, neutral dark reflections.
      `;

    case 'stone':
      return `
      **[MATERIAL PIPELINE: GEMSTONE & MINERALS]**
      - **Target Surfaces**: Quartz, Sandstone, Marble, Agate, Labradorite, Azurite, Granite.
      - **Texture Enhancement**:
         1. **Crystalline (Quartz/Amethyst)**: Emphasize **Subsurface Scattering (SSS)**. The edges should appear semi-translucent. Enhance internal fractures and facets.
         2. **Sedimentary (Sandstone)**: Maximize **Granular Detail**. The surface should look rough, porous, and matte with high micro-shadowing.
         3. **Metamorphic (Marble/Agate)**: Sharpen the **Veining**. Ensure the polish looks glassy (high gloss) while the veins have depth.
         4. **Iridescent (Labradorite/Opal)**: **CRITICAL**: Enhance the **Labradorescence/Play-of-Color**. Boost the visibility of the internal blue/gold/green flashes.
      - **Interaction**: Distinct separation between matte raw stone and polished faces.
      `;
    case 'texture':
      let intensityDesc = "";
      if (textureIntensity < 30) intensityDesc = "SUBTLE: Smooth finish, fine grain, delicate weave.";
      else if (textureIntensity < 70) intensityDesc = "NATURAL: Visible tactile details, standard roughness.";
      else intensityDesc = "INTENSE: Deep displacement, rough surface, pronounced grain/weave, high micro-contrast.";

      return `
      **[MATERIAL PIPELINE: HIGH-FIDELITY ORGANIC & TEXTURE]**
      - **Intensity Level**: ${textureIntensity}/100 (${intensityDesc})
      - **Target Surfaces**: Wood, Fabric, Leather, Glass.
      - **Wood**: enhance grain contrast and pore detail according to intensity.
      - **Fabric/Leather**: render visible weave/stitch patterns and micro-fiber texture.
      - **Glass/Transparent**: Maximize transmission and refraction. Render internal caustics if applicable. Clear, sharp edges.
      - **Interaction**: The surface must invite "touch". Focus on micro-displacement mapping effects matching the requested intensity.
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

const getSystemPrompt = (
  materialType: MaterialType, 
  shadowAngle?: number, 
  shadowIntensity?: ShadowIntensity, 
  backgroundDistance?: number, 
  enhancedLighting?: boolean,
  textureIntensity: number = 50,
  patinaIntensity: number = 0,
  patinaVariation: PatinaVariation = 'standard',
  memoryContext: string = ""
) => `
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

### ADAPTIVE LEARNING (USER MEMORY)
${memoryContext ? memoryContext : "No previous learning data available. Use standard best practices."}

### LIGHTING SIMULATION
${getShadowInstructions(shadowAngle, shadowIntensity, backgroundDistance, enhancedLighting)}

### MATERIAL & TEXTURE ENHANCEMENT
${getMaterialInstructions(materialType, textureIntensity, patinaIntensity, patinaVariation)}

### EXECUTION PROTOCOL
1. **Clean**: Remove artifacts, outlines, and old shadows.
2. **Relight**: Apply the calculated directional lighting and shadow casting.
3. **Enhance**: Apply the specific material pipeline (Metal/Stone/Texture/Standard/Ammonia) with requested intensity.
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
  backgroundDistance: number = 0,
  aspectRatio: AspectRatio = '1:1',
  enhancedLighting: boolean = false,
  textureIntensity: number = 50,
  patinaIntensity: number = 0,
  patinaVariation: PatinaVariation = 'standard',
  memoryContext: string = ""
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
            text: getSystemPrompt(materialType, shadowAngle, shadowIntensity, backgroundDistance, enhancedLighting, textureIntensity, patinaIntensity, patinaVariation, memoryContext),
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
          aspectRatio: aspectRatio,
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
