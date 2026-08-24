'use strict';

let surface = null;
let context = null;
const images = new Map();
const pending = new Map();
const clusterTiles = new Map();
const clusterTileOrder = [];

const loadImage = (uri) => {
  if (images.has(uri)) return Promise.resolve(images.get(uri));
  if (pending.has(uri)) return pending.get(uri);
  const task = fetch(uri, { cache: 'force-cache' })
    .then((response) => {
      if (!response.ok) throw new Error(`sprite ${response.status}`);
      return response.blob();
    })
    .then((blob) => createImageBitmap(blob))
    .then((bitmap) => {
      images.set(uri, bitmap);
      pending.delete(uri);
      return bitmap;
    })
    .catch(() => {
      pending.delete(uri);
      return null;
    });
  pending.set(uri, task);
  return task;
};

const drawAtlasFrame = (command, x, y, width, height) => {
  const image = images.get(command.uri);
  if (!image) return false;
  const columns = Math.max(1, command.columns || 4);
  const rows = Math.max(1, command.rows || 2);
  const sourceWidth = image.width / columns;
  const sourceHeight = image.height / rows;
  const frame = Math.max(0, command.frame || 0);
  const sourceX = (frame % columns) * sourceWidth;
  const sourceY = Math.floor(frame / columns) * sourceHeight;
  const anchorX = Number.isFinite(command.anchorX) ? command.anchorX : .5;
  const baseline = Number.isFinite(command.baseline) ? command.baseline : .79;
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x - width * anchorX, y - height * baseline, width, height);
  return true;
};

const drawSelection = (command) => {
  if (!command.selected) return;
  context.save();
  context.globalAlpha = .90;
  context.strokeStyle = command.teamColor || '#7ef0b6';
  context.lineWidth = 2;
  if (Array.isArray(command.selection) && command.selection.length >= 6) {
    context.beginPath();
    context.moveTo(command.selection[0], command.selection[1]);
    for (let index = 2; index < command.selection.length; index += 2) context.lineTo(command.selection[index], command.selection[index + 1]);
    context.closePath();
    context.stroke();
  } else {
    context.beginPath();
    context.ellipse(command.x, command.y + 2, Math.max(8, command.w * .38), Math.max(4, command.w * .20), 0, 0, Math.PI * 2);
    context.stroke();
  }
  context.restore();
};

const drawHealth = (command) => {
  if (!command.showHealth) return;
  const width = Number.isFinite(command.healthWidth)
    ? command.healthWidth
    : Math.max(34, Math.min(92, command.w * .72));
  const centerX = Number.isFinite(command.healthX) ? command.healthX : command.x;
  const x = centerX - width / 2;
  const y = Number.isFinite(command.healthY)
    ? command.healthY
    : command.y - command.h * (command.baseline || .79) - 7;
  context.fillStyle = 'rgba(5,10,8,.86)';
  context.fillRect(x, y, width, 4);
  context.fillStyle = command.health > .55 ? '#64e2a1' : command.health > .28 ? '#f1cf67' : '#ff786f';
  context.fillRect(x, y, width * Math.max(0, Math.min(1, command.health)), 4);
};

const drawEntity = (command) => {
  drawSelection(command);
  context.save();
  context.globalAlpha = Number.isFinite(command.alpha) ? command.alpha : 1;
  const drawn = drawAtlasFrame(command, command.x, command.y, command.w, command.h);
  context.restore();
  if (!drawn) return false;
  drawHealth(command);
  if (command.progress != null && command.progress < 1) {
    context.fillStyle = '#f2d58a';
    context.font = '800 10px system-ui';
    context.textAlign = 'center';
    context.fillText(`${Math.round(command.progress * 100)}%`, command.x, command.y - command.h * (command.baseline || .79) - 12);
  }
  return true;
};

const drawCluster = (command) => {
  const image = images.get(command.uri);
  if (!image) return false;
  const band = command.count <= 4 ? 0 : command.count <= 18 ? 1 : 2;
  const tileKey = `${command.uri}:${command.frame || 0}:${band}`;
  let tile = clusterTiles.get(tileKey);
  if (!tile) {
    const tileSurface = new OffscreenCanvas(160, 112);
    const tileContext = tileSurface.getContext('2d', { alpha: true });
    tileContext.imageSmoothingEnabled = true;
    tileContext.imageSmoothingQuality = 'high';
    const stamps = band === 0 ? 4 : band === 1 ? 7 : 10;
    const columnsPerRow = band === 0 ? 2 : 3;
    const stampWidth = band === 0 ? 64 : 54;
    const stampHeight = stampWidth * command.cellAspect;
    const columns = Math.max(1, command.columns || 4);
    const rows = Math.max(1, command.rows || 2);
    const sourceWidth = image.width / columns;
    const sourceHeight = image.height / rows;
    const frame = Math.max(0, command.frame || 0);
    const sourceX = (frame % columns) * sourceWidth;
    const sourceY = Math.floor(frame / columns) * sourceHeight;
    for (let index = 0; index < stamps; index += 1) {
      const row = Math.floor(index / columnsPerRow);
      const column = index % columnsPerRow;
      const rowCount = Math.min(columnsPerRow, stamps - row * columnsPerRow);
      const x = 80 + (column - (rowCount - 1) / 2) * stampWidth * .70 + (row & 1 ? stampWidth * .13 : -stampWidth * .07);
      const y = 45 + row * stampHeight * .34;
      tileContext.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x - stampWidth / 2, y - stampHeight * .72, stampWidth, stampHeight);
    }
    tile = tileSurface.transferToImageBitmap();
    clusterTiles.set(tileKey, tile);
    clusterTileOrder.push(tileKey);
    if (clusterTileOrder.length > 192) {
      const expired = clusterTileOrder.shift();
      clusterTiles.get(expired)?.close?.();
      clusterTiles.delete(expired);
    }
  }
  context.save();
  context.globalAlpha = .58 + Math.max(0, Math.min(1, command.health)) * .38;
  context.drawImage(tile, command.x - command.w / 2, command.y - command.h * .64, command.w, command.h);
  context.globalAlpha = .78;
  context.strokeStyle = command.teamColor || '#7ef0b6';
  context.lineWidth = 1.3;
  context.beginPath();
  context.moveTo(command.x - command.w * .28, command.y + 2);
  context.lineTo(command.x + command.w * .28, command.y + 2);
  context.stroke();
  context.restore();
  if (command.label) {
    context.globalAlpha = .92;
    context.fillStyle = '#f1f6f2';
    context.font = '800 10px system-ui';
    context.textAlign = 'center';
    context.fillText(command.label, command.x, command.y - command.h * .56);
  }
  return true;
};

self.onmessage = async (event) => {
  const message = event.data;
  if (!message || message.type !== 'frame') return;
  const started = performance.now();
  try {
    if (!surface) {
      surface = new OffscreenCanvas(message.width, message.height);
      context = surface.getContext('2d', { alpha: true, desynchronized: true });
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
    }
    if (surface.width !== message.width || surface.height !== message.height) {
      surface.width = message.width;
      surface.height = message.height;
    }
    const unique = [...new Set(message.commands.map((command) => command.uri).filter(Boolean))];
    await Promise.all(unique.map(loadImage));
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, surface.width, surface.height);
    context.setTransform(message.dpr, 0, 0, message.dpr, 0, 0);
    context.translate(-message.cropX, -message.cropY);
    const commands = message.commands.slice().sort((left, right) => left.depth - right.depth);
    let drawn = 0;
    for (const command of commands) {
      if (command.kind === 'cluster' ? drawCluster(command) : drawEntity(command)) drawn += 1;
    }
    const bitmap = surface.transferToImageBitmap();
    self.postMessage({
      type: 'frame',
      sequence: message.sequence,
      cameraKey: message.cameraKey,
      bitmap,
      offsetX: message.offsetX,
      offsetY: message.offsetY,
      cropX: message.cropX,
      cropY: message.cropY,
      cssWidth: message.cssWidth,
      cssHeight: message.cssHeight,
      dpr: message.dpr,
      drawn,
      drawMs: performance.now() - started,
      loadedUris: unique.filter((uri) => images.has(uri)),
    }, [bitmap]);
  } catch (error) {
    self.postMessage({ type: 'error', message: error?.message || String(error) });
  }
};
