import * as THREE from 'three';
import type { TextureDef } from './types';

type Pattern = 'noise' | 'tuft' | 'rock' | 'crack' | 'flat';

/**
 * Generate a 64x64 canvas texture with base color + stippled accents.
 * Returns a data URL (for swatch preview) and a Three.Color (for vertex paint).
 * 'flat' produces a clean single-color swatch — fits the stylized "single
 * ground color" look in the reference.
 */
function makeTex(baseHex: string, accentHex: string, pattern: Pattern): Pick<TextureDef, 'dataUrl' | 'color'> {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 64, 64);

  if (pattern === 'flat') {
    // intentionally no accents — clean slab
  } else {
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
  }

  return { dataUrl: c.toDataURL(), color: new THREE.Color(baseHex) };
}

/**
 * Cave palette. The default (index 0) is a clean dark slate so a fresh map
 * has the "single ground color" look from the reference. The other entries
 * let you paint occasional accents — a moss patch, a rock outcrop, a magenta
 * crystal vein — without leaving the palette.
 */
export const TEX_DEFS: TextureDef[] = [
  { name: 'Slate',  ...makeTex('#3d3f5c', '#28293d', 'flat')  }, // primary cave floor
  { name: 'Stone',  ...makeTex('#4a4d7a', '#33334d', 'rock')  }, // lighter rock outcrop
  { name: 'Deep',   ...makeTex('#1a1c2a', '#28293d', 'flat')  }, // pit / chasm floor
  { name: 'Moss',   ...makeTex('#5870ad', '#4a4d7a', 'tuft')  }, // faint bioluminescent moss
  { name: 'Vein',   ...makeTex('#6b2877', '#3d2b56', 'crack') }, // magenta crystal vein
];