(() => {
  'use strict';
  const root=typeof window!=='undefined'?window:self;
  const D=root.__FD_DEBUG__;
  if(!D?.Game)return;
  const Game=D.Game;
  if(Game.prototype.__fdHookContext207Installed)return;
  Object.defineProperty(Game.prototype,'__fdHookContext207Installed',{value:true,configurable:true});

  const affected=new Set(['workerAutomation207','truckRefuel207','extractorMaintenance207']);
  const baseHooks=Game.prototype.logisticsHooks206;
  if(typeof baseHooks!=='function')return;

  Game.prototype.logisticsHooks206=function(...args){
    const hooks=baseHooks.apply(this,args);
    for(const stage of ['pre','post']){
      for(const entry of hooks?.[stage]||[]){
        const fn=entry?.fn;
        if(typeof fn!=='function'||!affected.has(fn.name)||fn.__fdContext207)continue;
        const original=fn;
        const wrapped=function(dt){return original.call(this,this,dt);};
        Object.defineProperty(wrapped,'__fdContext207',{value:true});
        Object.defineProperty(wrapped,'__fdOriginalName207',{value:original.name});
        entry.fn=wrapped;
      }
    }
    return hooks;
  };

  root.__FD_HOOK_CONTEXT_207__={build:207,version:'16.9.1',affected:[...affected]};
})();
