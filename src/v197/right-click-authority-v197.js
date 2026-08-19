(() => {
  'use strict';

  const root = globalThis;
  if (root.__FD_RIGHT_CLICK_AUTHORITY_197__) return;

  const VERSION = '16.8.13';
  const BUILD = 197;
  const POINTER_MOUSE_WINDOW_MS = 180;
  const ROUTE_DEDUPE_MS = 180;
  const ROUTE_DEDUPE_DISTANCE = 12;

  const state = {
    installed: false,
    pointerRoutes: 0,
    mouseRoutes: 0,
    contextRoutes: 0,
    suppressedMouseEvents: 0,
    suppressedContextMenus: 0,
    duplicateRoutes: 0,
    errors: 0,
    lastSource: null,
    lastClient: null,
    lastResult: null,
  };

  let canvas = null;
  let rightPointer = null;
  let lastPointerEventAt = -Infinity;
  let lastRouteAt = -Infinity;
  let lastRouteClient = null;

  const getCanvas = () => canvas || (canvas = document.getElementById('game-canvas'));

  const belongsToCanvas = event => {
    const target = getCanvas();
    if (!target || !event) return false;
    const path = event.composedPath?.();
    if (Array.isArray(path)) return path.includes(target);
    return event.target === target || Boolean(target.contains?.(event.target));
  };

  const stopEvent = event => {
    event.preventDefault?.();
    event.stopPropagation?.();
    event.stopImmediatePropagation?.();
  };

  const sameRecentRoute = (clientX, clientY, now) => Boolean(
    lastRouteClient &&
    now - lastRouteAt < ROUTE_DEDUPE_MS &&
    Math.hypot(clientX - lastRouteClient.x, clientY - lastRouteClient.y) < ROUTE_DEDUPE_DISTANCE
  );

  const route = (event, source, append = false) => {
    const now = performance.now();
    const clientX = Number(event?.clientX);
    const clientY = Number(event?.clientY);
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
      state.errors += 1;
      state.lastResult = 'invalid-client-point';
      return false;
    }
    if (sameRecentRoute(clientX, clientY, now)) {
      state.duplicateRoutes += 1;
      return true;
    }

    const owner = root.__FD_COMMAND_INPUT_190__;
    if (typeof owner?.route !== 'function') {
      state.errors += 1;
      state.lastResult = 'command-input-owner-missing';
      return false;
    }

    let result = false;
    try {
      result = owner.route(clientX, clientY, source, Boolean(append));
    } catch (error) {
      state.errors += 1;
      state.lastResult = String(error?.stack || error?.message || error);
      console.error('[FD197] authoritative right-click route failed', error);
      return false;
    }

    if (result === false) {
      state.errors += 1;
      state.lastResult = 'rejected';
      return false;
    }

    lastRouteAt = now;
    lastRouteClient = { x: clientX, y: clientY };
    state.lastSource = source;
    state.lastClient = { ...lastRouteClient };
    state.lastResult = result;
    if (source.includes('pointer')) state.pointerRoutes += 1;
    else if (source.includes('mouse')) state.mouseRoutes += 1;
    else state.contextRoutes += 1;
    return true;
  };

  const onPointerDown = event => {
    if (!belongsToCanvas(event) || event.button !== 2 || event.pointerType === 'touch' || event.pointerType === 'pen') return;
    lastPointerEventAt = performance.now();
    rightPointer = {
      id: event.pointerId,
      append: Boolean(event.shiftKey),
    };
    stopEvent(event);
  };

  const onPointerUp = event => {
    if (!rightPointer || (rightPointer.id != null && rightPointer.id !== event.pointerId) || !belongsToCanvas(event)) return;
    lastPointerEventAt = performance.now();
    const append = rightPointer.append || Boolean(event.shiftKey);
    rightPointer = null;
    stopEvent(event);
    route(event, 'authority197-pointer-right', append);
  };

  const onPointerCancel = event => {
    if (!rightPointer || (rightPointer.id != null && rightPointer.id !== event.pointerId)) return;
    rightPointer = null;
    if (belongsToCanvas(event)) stopEvent(event);
  };

  const onMouseDown = event => {
    if (!belongsToCanvas(event) || event.button !== 2) return;
    stopEvent(event);
    if (performance.now() - lastPointerEventAt < POINTER_MOUSE_WINDOW_MS) {
      state.suppressedMouseEvents += 1;
      return;
    }
    rightPointer = {
      id: null,
      append: Boolean(event.shiftKey),
    };
  };

  const onMouseUp = event => {
    if (!belongsToCanvas(event) || event.button !== 2) return;
    stopEvent(event);
    if (performance.now() - lastPointerEventAt < POINTER_MOUSE_WINDOW_MS) {
      state.suppressedMouseEvents += 1;
      rightPointer = null;
      return;
    }
    const append = Boolean(rightPointer?.append || event.shiftKey);
    rightPointer = null;
    route(event, 'authority197-mouse-right', append);
  };

  const onContextMenu = event => {
    if (!belongsToCanvas(event)) return;
    stopEvent(event);
    state.suppressedContextMenus += 1;
    if (performance.now() - lastRouteAt >= ROUTE_DEDUPE_MS) {
      route(event, 'authority197-contextmenu-right', Boolean(event.shiftKey));
    }
  };

  const install = () => {
    if (state.installed) return true;
    const options = { capture: true, passive: false };
    root.addEventListener('pointerdown', onPointerDown, options);
    root.addEventListener('pointerup', onPointerUp, options);
    root.addEventListener('pointercancel', onPointerCancel, options);
    root.addEventListener('mousedown', onMouseDown, options);
    root.addEventListener('mouseup', onMouseUp, options);
    root.addEventListener('contextmenu', onContextMenu, options);
    state.installed = true;
    return true;
  };

  root.__FD_RIGHT_CLICK_AUTHORITY_197__ = {
    version: VERSION,
    build: BUILD,
    state,
    install,
    diagnostics: () => ({
      ...state,
      lastClient: state.lastClient ? { ...state.lastClient } : null,
    }),
  };

  install();
})();
