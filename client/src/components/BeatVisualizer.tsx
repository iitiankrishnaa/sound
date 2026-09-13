import React, { useRef, useEffect } from 'react';
import { audioEngine } from '../services/audioEngine.js';

interface Props {
  isPlaying: boolean;
  mode?: 'circle' | 'bars';
  accentColor?: string;
  size?: number;
}

export const BeatVisualizer: React.FC<Props> = ({
  isPlaying,
  mode = 'circle',
  accentColor = '#0ea5e9',
  size = 240
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    const dataArray = new Uint8Array(64);

    const render = () => {
      animationId = requestAnimationFrame(render);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (isPlaying) {
        audioEngine.getFrequencyData(dataArray);
      } else {
        // Idle gentle breathing state
        dataArray.fill(0);
      }

      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const baseRadius = size * 0.28;

      if (mode === 'circle') {
        // Compute average bass power
        let bassSum = 0;
        for (let i = 0; i < 8; i++) {
          bassSum += dataArray[i];
        }
        const bassAvg = bassSum / 8 / 255;
        const currentRadius = baseRadius + bassAvg * 22;

        // Outer glowing pulse ring
        ctx.beginPath();
        ctx.arc(centerX, centerY, currentRadius + 14, 0, Math.PI * 2);
        ctx.strokeStyle = `${accentColor}33`;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Inner glowing core
        const gradient = ctx.createRadialGradient(
          centerX,
          centerY,
          currentRadius * 0.2,
          centerX,
          centerY,
          currentRadius
        );
        gradient.addColorStop(0, `${accentColor}44`);
        gradient.addColorStop(1, `${accentColor}11`);

        ctx.beginPath();
        ctx.arc(centerX, centerY, currentRadius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
        ctx.strokeStyle = accentColor;
        ctx.lineWidth = 3;
        ctx.stroke();

        // Circular frequency rays
        const numRays = 32;
        const angleStep = (Math.PI * 2) / numRays;

        for (let i = 0; i < numRays; i++) {
          const val = isPlaying ? dataArray[i % dataArray.length] / 255 : 0.08 * Math.sin(Date.now() * 0.003 + i);
          const rayLen = Math.max(4, val * 36);
          const angle = i * angleStep;

          const x1 = centerX + Math.cos(angle) * (currentRadius + 4);
          const y1 = centerY + Math.sin(angle) * (currentRadius + 4);
          const x2 = centerX + Math.cos(angle) * (currentRadius + 4 + rayLen);
          const y2 = centerY + Math.sin(angle) * (currentRadius + 4 + rayLen);

          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.strokeStyle = i % 2 === 0 ? accentColor : '#10b981';
          ctx.lineWidth = 3;
          ctx.lineCap = 'round';
          ctx.stroke();
        }
      } else {
        // Bars mode
        const barWidth = (canvas.width / 32) - 2;
        for (let i = 0; i < 32; i++) {
          const val = isPlaying ? dataArray[i] / 255 : 0.05 * Math.abs(Math.sin(Date.now() * 0.002 + i));
          const barHeight = Math.max(4, val * (canvas.height * 0.8));
          const x = i * (barWidth + 2);
          const y = canvas.height - barHeight;

          const barGrad = ctx.createLinearGradient(0, canvas.height, 0, y);
          barGrad.addColorStop(0, accentColor);
          barGrad.addColorStop(1, '#6366f1');

          ctx.fillStyle = barGrad;
          ctx.fillRect(x, y, barWidth, barHeight);
        }
      }
    };

    render();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [isPlaying, mode, accentColor, size]);

  return (
    <div className="flex items-center justify-center relative">
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        className="transition-all duration-300 pointer-events-none"
      />
    </div>
  );
};
