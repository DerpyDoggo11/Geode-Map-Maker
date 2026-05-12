import * as THREE from 'three';
import type { TextureDef } from './types';

type Pattern = 'noise' | 'tuft' | 'rock' | 'crack';

/**
 * Generate a 64x64 canvas texture with base color + stippled accents.
 * Returns a data URL (for swatch preview) and a Three.Color (for vertex paint).
 * Swap the body for THREE.TextureLoader().load(url) when real assets exist.
 */
function makeTex(baseHex: string, accentHex: string, pattern: Pattern): Pick<TextureDef, 'dataUrl' | 'color'> {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = accentHex;

  if (pattern === 'noise') {
    for (let i = 0; i < 400; i++) {
      ctx.fillRect(Math.random() * 64 | 0, Math.random() * 64 | 0, 1, 1);
    }
  } else if (pattern === 'tuft') {
    for (let i = 0; i < 60; i++) {
      ctx.fillRect(Math.random() * 64 | 0, Math.random() * 64 | 0, 2, 1);
    }
  } else if (pattern === 'rock') {
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      ctx.arc(Math.random() * 64, Math.random() * 64, 4 + Math.random() * 6, 0, 7);
      ctx.fill();
    }
  } else if (pattern === 'crack') {
    ctx.strokeStyle = accentHex;
    ctx.lineWidth = 1;
    for (let i = 0; i < 10; i++) {
      ctx.beginPath();
      ctx.moveTo(Math.random() * 64, Math.random() * 64);
      ctx.lineTo(Math.random() * 64, Math.random() * 64);
      ctx.stroke();
    }
  }

  return { dataUrl: c.toDataURL(), color: new THREE.Color(baseHex) };
}

export const TEX_DEFS: TextureDef[] = [
  { name: 'Grass', ...makeTex('#639922', '#3B6D11', 'tuft') },
  { name: 'Sand',  ...makeTex('#EF9F27', '#BA7517', 'noise') },
  { name: 'Rock',  ...makeTex('#888780', '#5F5E5A', 'rock') },
  { name: 'Snow',  ...makeTex('#F1EFE8', '#D3D1C7', 'noise') },
  { name: 'Dirt',  ...makeTex('#712B13', '#4A1B0C', 'crack') },
];
