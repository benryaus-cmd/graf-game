import { generateImage } from 'ai';
import * as aippyAIRuntime from '@aippy/runtime/ai';
import aiConfig from '@/config/aiConfig.json';

const provider = aippyAIRuntime.aippyAIProvider();
const configBridge = aippyAIRuntime as unknown as { sendAIConfigToContainer?: () => void };
type ImageSize = '1024x1024' | '1024x1536' | '1536x1024';
type ImageQuality = 'standard' | 'high' | 'low';
type ArtworkKind = 'mural' | 'poster';

export function syncBotArtworkConfig(): void {
  configBridge.sendAIConfigToContainer?.();
}

async function generateArtwork(description: string, kind: ArtworkKind): Promise<string> {
  const prompt = description.trim().slice(0, 240);
  if (!prompt) throw new Error('Add a short idea for the artwork first.');
  const direction = kind === 'poster'
    ? 'Create a vivid, full-bleed urban art poster with a strong central composition, painterly texture, and saturated colors.'
    : 'Create one vivid, friendly street-art mural image for a concrete city wall with bold paint colors and clean shapes.';
  const lettering = kind === 'poster'
    ? 'Use no frame. Only include lettering if the user explicitly asks for it.'
    : 'Use no words, letters, signatures, or frames.';
  const result = await generateImage({
    model: provider.imageModel(aiConfig.imageModel.value),
    size: aiConfig.imageSize.value as ImageSize,
    quality: aiConfig.imageQuality.value as ImageQuality,
    prompt: `${direction} ${lettering} The requested subject is: ${prompt}`,
  });
  const image = result.images[0];
  if (!image?.base64) throw new Error('The artwork could not be created. Please try again.');
  return `data:${image.mediaType || 'image/png'};base64,${image.base64}`;
}

export function generateBotArtwork(description: string): Promise<string> {
  return generateArtwork(description, 'mural');
}

export function generatePosterArtwork(description: string): Promise<string> {
  return generateArtwork(description, 'poster');
}