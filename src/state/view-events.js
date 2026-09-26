/* A tiny pub/sub fired after every top-level view change (library, world,
   world item, quest, questline) once `state` reflects the new view. Only
   the read-only viewer's hash router listens; in the editor it's a no-op. */
var listeners = [];

export function onViewChange(fn){
  listeners.push(fn);
}

export function notifyViewChange(){
  listeners.forEach(function(fn){ fn(); });
}
