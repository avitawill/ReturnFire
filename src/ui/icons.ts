// Flat 2D silhouettes for the vehicle cards.

import type { VehicleType } from '../sim/tuning';

const COL = { b: '#3f74b8', l: '#6f9bd4', d: '#1f3d66' };

export function drawVehicleIcon(c: CanvasRenderingContext2D, type: VehicleType) {
  c.rotate(-0.45);
  if (type === 'tank') {
    c.fillStyle = '#1d2224';
    c.fillRect(-14, -11, 28, 5);
    c.fillRect(-14, 6, 28, 5);
    c.fillStyle = COL.b;
    c.fillRect(-12, -8, 24, 16);
    c.fillStyle = COL.l;
    c.fillRect(-9, -6, 16, 12);
    c.fillStyle = COL.d;
    c.fillRect(2, -2, 18, 4);
    c.fillStyle = COL.b;
    c.beginPath();
    c.arc(0, 0, 6.5, 0, 7);
    c.fill();
  } else if (type === 'launcher') {
    c.fillStyle = '#1d2224';
    for (const s of [-1, 1]) for (const wx of [-10, 0, 10]) c.fillRect(wx - 4, s * 9 - 2.5, 8, 5);
    c.fillStyle = COL.b;
    c.fillRect(-14, -8, 28, 16);
    c.fillStyle = COL.l;
    c.fillRect(5, -6, 7, 12);
    c.fillStyle = COL.d;
    c.fillRect(-12, -7, 15, 14);
    c.fillStyle = '#e9e2cf';
    for (const yy of [-4.5, -1.5, 1.5, 4.5]) c.fillRect(-10, yy - 0.8, 11, 1.6);
  } else if (type === 'jeep') {
    c.fillStyle = '#1d2224';
    for (const sx of [-7, 7]) for (const sy of [-7, 7]) c.fillRect(sx - 3, sy - 2, 6, 4);
    c.fillStyle = COL.b;
    c.fillRect(-10, -6, 20, 12);
    c.fillStyle = COL.d;
    c.fillRect(2, -5, 3, 10);
    c.fillStyle = COL.l;
    c.fillRect(-8, -4, 8, 8);
  } else {
    c.fillStyle = COL.d;
    c.fillRect(-20, -1.5, 14, 3);
    c.fillRect(-22, -5, 3, 10);
    c.fillStyle = COL.b;
    c.beginPath();
    c.ellipse(0, 0, 11, 6.5, 0, 0, 7);
    c.fill();
    c.fillStyle = '#cfe6f2';
    c.beginPath();
    c.arc(5, 0, 4, 0, 7);
    c.fill();
    c.rotate(0.8);
    c.strokeStyle = '#1d2224';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(-19, 0);
    c.lineTo(19, 0);
    c.moveTo(0, -19);
    c.lineTo(0, 19);
    c.stroke();
  }
}
