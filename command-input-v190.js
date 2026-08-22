(() => {
  'use strict';

  const root = globalThis;
  if (root.__FD_COMMAND_INPUT_190__) return;

  const VERSION = '16.8.6';
  const BUILD = 190;
  const LONG_PRESS_MS = 390;
  const DOUBLE_TAP_MS = 340;
  const DOUBLE_TAP_DISTANCE = 30;
  const MOVE_TOLERANCE = 14;
  const DEDUPE_MS = 140;
  const diagnostics = {
    installed: false,
    routed: 0,
    rightClicks: 0,
    longPresses: 0,
    doubleTaps: 0,
    cancels: 0,
    ignored: 0,
    errors: 0,
    lastSource: null,
    lastWorld: null,
    lastSelectedIds: [],
    lastResult: null,
    lastRouteAt: 0,
  };

  let canvas = null;
  let touch = null;
  let lastTap = null;
  let rightPointer = null;
  let lastPointerEventAt = -Infinity;
  let lastRoute = { at: -Infinity, x: NaN, y: NaN };

  const game = () => root.__FD_DEBUG__?.game || null;
  const finite = value => Number.isFinite(Number(value));
  const selectedUnits = current => {
    const direct = current?.getSelectedUnits?.();
    const source = Array.isArray(direct) ? direct : current?.selected || [];
    return source.filter(unit =>
      unit?.alive !== false && unit?.kind === 'unit' && unit?.team === 'player' && !unit?.embarkedIn
    );
  };

  const worldAt = (current, clientX, clientY) => {
    const target = canvas || document.getElementById('game-canvas');
    const rect = target?.getBoundingClientRect?.();
    if (!target || !rect?.width || !rect?.height) return null;
    const viewportWidth = finite(current?.viewport?.width) && Number(current.viewport.width) > 0
      ? Number(current.viewport.width) : rect.width;
    const viewportHeight = finite(current?.viewport?.height) && Number(current.viewport.height) > 0
      ? Number(current.viewport.height) : rect.height;
    const sx = (clientX - rect.left) * viewportWidth / rect.width;
    const sy = (clientY - rect.top) * viewportHeight / rect.height;
    let point = null;
    try { point = current.screenToWorld?.(sx, sy, 0) || current.screenToWorld?.(sx, sy) || null; } catch (_) {}
    if (!finite(point?.x) || !finite(point?.y)) return null;
    return { x: Number(point.x), y: Number(point.y), sx, sy };
  };

  const sameRecentRoute = point => {
    const now = performance.now();
    return now - lastRoute.at < DEDUPE_MS && Math.hypot(point.x - lastRoute.x, point.y - lastRoute.y) < 8;
  };

  const route = (clientX, clientY, source, append = false) => {
    const current = game();
    if (!current || current.ended) {
      diagnostics.ignored += 1;
      return false;
    }
    const point = worldAt(current, clientX, clientY);
    if (!point || sameRecentRoute(point)) {
      diagnostics.ignored += 1;
      return false;
    }

    // All modern target cursors are represented by commandMode (power:scan,
    // launcher:*, rally, minefield, and similar tools).  powerMode and
    // strategicMode are legacy fields kept only for compatibility.
    if (current.commandMode || current.buildMode || current.powerMode || current.strategicMode) {
      try { current.cancelModes?.(); } catch (_) {}
      diagnostics.cancels += 1;
      diagnostics.lastSource = `${source}:cancel-mode`;
      diagnostics.lastRouteAt = performance.now();
      lastRoute = { at: diagnostics.lastRouteAt, x: point.x, y: point.y };
      return true;
    }

    const units = selectedUnits(current);
    if (!units.length) {
      diagnostics.ignored += 1;
      return false;
    }

    let result = false;
    try {
      if (typeof current.issueContext === 'function') result = current.issueContext(point.x, point.y, Boolean(append));
      else if (typeof current.issueMove === 'function') result = current.issueMove(point.x, point.y, Boolean(append));
    } catch (error) {
      diagnostics.errors += 1;
      diagnostics.lastResult = String(error?.stack || error?.message || error);
      console.error('[FD190] command input route failed', error);
      return false;
    }

    if (result === false) {
      diagnostics.errors += 1;
      diagnostics.lastResult = 'rejected';
      return false;
    }

    const now = performance.now();
    lastRoute = { at: now, x: point.x, y: point.y };
    diagnostics.routed += 1;
    diagnostics.rightClicks += source.includes('right') ? 1 : 0;
    diagnostics.longPresses += source === 'long-press' ? 1 : 0;
    diagnostics.doubleTaps += source === 'double-tap' ? 1 : 0;
    diagnostics.lastSource = source;
    diagnostics.lastWorld = { x: point.x, y: point.y };
    diagnostics.lastSelectedIds = units.map(unit => unit.id);
    diagnostics.lastResult = result;
    diagnostics.lastRouteAt = now;
    return true;
  };

  const stopEvent = event => {
    event.preventDefault?.();
    event.stopPropagation?.();
    event.stopImmediatePropagation?.();
  };

  const cancelTouch = () => {
    if (touch?.timer) clearTimeout(touch.timer);
    touch = null;
  };

  const onPointerDown = event => {
    lastPointerEventAt = performance.now();
    if (event.pointerType === 'touch' || event.pointerType === 'pen') {
      cancelTouch();
      touch = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        append: Boolean(event.shiftKey),
        fired: false,
        timer: setTimeout(() => {
          if (!touch || touch.id !== event.pointerId) return;
          touch.fired = route(touch.x, touch.y, 'long-press', touch.append);
          if (touch.fired) lastTap = null;
        }, LONG_PRESS_MS),
      };
      return;
    }
    if (event.button !== 2) return;
    rightPointer = { id: event.pointerId, x: event.clientX, y: event.clientY, append: Boolean(event.shiftKey) };
    stopEvent(event);
  };

  const onPointerMove = event => {
    if (!touch || touch.id !== event.pointerId) return;
    if (Math.hypot(event.clientX - touch.x, event.clientY - touch.y) > MOVE_TOLERANCE) cancelTouch();
  };

  const onPointerUp = event => {
    lastPointerEventAt = performance.now();
    if (touch && touch.id === event.pointerId) {
      const state = touch;
      const fired = state.fired;
      cancelTouch();
      if (fired) {
        stopEvent(event);
        return;
      }

      const now = performance.now();
      const previous = lastTap;
      const isDoubleTap = previous &&
        now - previous.at <= DOUBLE_TAP_MS &&
        Math.hypot(event.clientX - previous.x, event.clientY - previous.y) <= DOUBLE_TAP_DISTANCE;
      if (isDoubleTap) {
        lastTap = null;
        stopEvent(event);
        route(event.clientX, event.clientY, 'double-tap', state.append || event.shiftKey);
        return;
      }
      lastTap = { at: now, x: event.clientX, y: event.clientY };
      return;
    }
    if (!rightPointer || (rightPointer.id != null && rightPointer.id !== event.pointerId)) return;
    const point = { ...rightPointer, x: event.clientX, y: event.clientY };
    rightPointer = null;
    stopEvent(event);
    route(point.x, point.y, 'pointer-right', point.append || event.shiftKey);
  };

  const onPointerCancel = event => {
    if (touch?.id === event.pointerId) cancelTouch();
    if (rightPointer?.id === event.pointerId) rightPointer = null;
  };

  const onMouseDown = event => {
    if (event.button !== 2 || performance.now() - lastPointerEventAt < 100) return;
    rightPointer = { id: null, x: event.clientX, y: event.clientY, append: Boolean(event.shiftKey) };
    stopEvent(event);
  };

  const onMouseUp = event => {
    if (event.button !== 2 || performance.now() - lastPointerEventAt < 100) return;
    const point = rightPointer || { x: event.clientX, y: event.clientY, append: Boolean(event.shiftKey) };
    rightPointer = null;
    stopEvent(event);
    route(event.clientX, event.clientY, 'mouse-right', point.append || event.shiftKey);
  };

  const onContextMenu = event => {
    stopEvent(event);
    if (performance.now() - diagnostics.lastRouteAt > DEDUPE_MS) route(event.clientX, event.clientY, 'contextmenu-right', event.shiftKey);
  };

  const install = () => {
    if (diagnostics.installed) return true;
    canvas = document.getElementById('game-canvas');
    if (!canvas) return false;
    canvas.addEventListener('pointerdown', onPointerDown, true);
    canvas.addEventListener('pointermove', onPointerMove, true);
    canvas.addEventListener('pointerup', onPointerUp, true);
    canvas.addEventListener('pointercancel', onPointerCancel, true);
    canvas.addEventListener('mousedown', onMouseDown, true);
    canvas.addEventListener('mouseup', onMouseUp, true);
    canvas.addEventListener('contextmenu', onContextMenu, true);
    diagnostics.installed = true;
    return true;
  };

  if (!install()) document.addEventListener('DOMContentLoaded', install, { once: true });

  root.__FD_COMMAND_INPUT_190__ = {
    version: VERSION,
    build: BUILD,
    install,
    route,
    diagnostics: () => ({ ...diagnostics, lastSelectedIds: [...diagnostics.lastSelectedIds] }),
  };
  root.__FD_SCREEN_INPUT_FIDELITY_210__ = { version: '16.9.4', build: 210, coordinateSpace: 'game-viewport-css' };

})();
