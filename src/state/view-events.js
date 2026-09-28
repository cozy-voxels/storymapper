/* Pub/sub fired after each top-level view change, once `state` is updated.
   Used by the viewer's hash router and library reorder mode. */
var listeners = [];

export function onViewChange(fn){
  listeners.push(fn);
}

export function notifyViewChange(){
  listeners.forEach(function(fn){ fn(); });
}
