import React, { useEffect, useRef } from 'react';
import Section from '../Section';

export default function QbertGameSection(props) {
    const { elementId, colors, styles = {} } = props;
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const gridSize = 5;
        const tile = 60;
        const qbert = { x: 0, y: gridSize - 1 };
        const lasers: { x: number; y: number }[] = [];
        let animationFrame: number;

        function drawGrid() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            for (let row = 0; row < gridSize; row++) {
                for (let col = 0; col <= row; col++) {
                    const x = (gridSize - row - 1 + col) * tile;
                    const y = row * tile;
                    ctx.fillStyle = '#ddd';
                    ctx.fillRect(x, y, tile, tile);
                    ctx.strokeStyle = '#888';
                    ctx.strokeRect(x, y, tile, tile);
                }
            }
        }

        function drawQbert() {
            const x = (gridSize - qbert.y - 1 + qbert.x) * tile + tile / 2;
            const y = qbert.y * tile + tile / 2;
            ctx.fillStyle = 'orange';
            ctx.beginPath();
            ctx.arc(x, y, tile / 2 - 4, 0, Math.PI * 2);
            ctx.fill();
        }

        function drawLasers() {
            ctx.fillStyle = 'red';
            lasers.forEach((l) => {
                ctx.fillRect(l.x, l.y, 4, 20);
            });
        }

        function render() {
            drawGrid();
            drawQbert();
            drawLasers();
        }

        function update() {
            lasers.forEach((l) => (l.y -= 6));
            for (let i = lasers.length - 1; i >= 0; i--) {
                if (lasers[i].y < 0) lasers.splice(i, 1);
            }
        }

        function loop() {
            update();
            render();
            animationFrame = requestAnimationFrame(loop);
        }
        loop();

        function handleKey(e: KeyboardEvent) {
            if (e.type === 'keydown') {
                if (e.code === 'ArrowUp' && qbert.y > 0) {
                    qbert.y -= 1;
                    if (qbert.x > qbert.y) qbert.x = qbert.y;
                }
                if (e.code === 'ArrowDown' && qbert.y < gridSize - 1) {
                    qbert.y += 1;
                }
                if (e.code === 'ArrowLeft' && qbert.x > 0) {
                    qbert.x -= 1;
                }
                if (e.code === 'ArrowRight' && qbert.x < qbert.y) {
                    qbert.x += 1;
                }
                if (e.code === 'Space') {
                    lasers.push({
                        x:
                            (gridSize - qbert.y - 1 + qbert.x) * tile +
                            tile / 2 -
                            2,
                        y: qbert.y * tile,
                    });
                }
            }
        }

        window.addEventListener('keydown', handleKey);
        return () => {
            window.removeEventListener('keydown', handleKey);
            cancelAnimationFrame(animationFrame);
        };
    }, []);

    return (
        <Section elementId={elementId} colors={colors} styles={styles.self}>
            <canvas ref={canvasRef} width={360} height={360} className="border" />
        </Section>
    );
}
