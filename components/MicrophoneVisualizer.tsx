import React, { useEffect, useRef } from 'react';

interface Props {
  stream: MediaStream | null;
  isRecording: boolean;
}

// Palette-derived bar colours — professional complementary tones
const BAR_COLORS = [
  [61, 126, 126],   // Field Teal
  [196, 128, 108],  // Warm Coral
  [94, 158, 120],   // Sage
  [94, 126, 160],   // Slate Blue
  [176, 112, 128],  // Dusty Rose
];

export const MicrophoneVisualizer: React.FC<Props> = ({ stream, isRecording }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);

  useEffect(() => {
    if (!stream || !canvasRef.current) return;

    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();

    analyser.fftSize = 256;
    source.connect(analyser);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    analyserRef.current = analyser;
    dataArrayRef.current = dataArray;

    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = canvas.width;
      const height = canvas.height;

      animationRef.current = requestAnimationFrame(draw);

      if (!isRecording) {
        ctx.clearRect(0, 0, width, height);
        return;
      }

      analyser.getByteFrequencyData(dataArray);

      ctx.fillStyle = 'rgb(228, 242, 239)'; // duck egg blue
      ctx.fillRect(0, 0, width, height);

      const barWidth = (width / bufferLength) * 2.5;
      let barHeight;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        barHeight = dataArray[i] / 2;

        // Cycle through the palette colours
        const colorIdx = Math.floor((i / bufferLength) * BAR_COLORS.length);
        const [r, g, b] = BAR_COLORS[Math.min(colorIdx, BAR_COLORS.length - 1)];

        // Modulate brightness by bar height
        const brightness = 0.5 + (barHeight / 256) * 0.5;

        ctx.fillStyle = `rgba(${Math.round(r * brightness)},${Math.round(g * brightness)},${Math.round(b * brightness)}, 0.8)`;
        ctx.fillRect(x, height - barHeight, barWidth, barHeight);

        x += barWidth + 1;
      }
    };

    draw();

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      audioContext.close();
    };
  }, [stream, isRecording]);

  return (
    <canvas
      ref={canvasRef}
      width={600}
      height={100}
      className="w-full h-24 rounded-lg bg-[#E4F2EF] border border-[#B0C8C5]"
    />
  );
};
