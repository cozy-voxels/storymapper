/* Numeric/coordinate parsing rules, ported from QuestLines Core's
   internal ParseHelper (net.evilcraft.questlines.validator.ParseHelper)
   -- see quest-validator.js for the full attribution note. */

export function isNumber(s){
  if(s === null || s === undefined || s === '') return false;
  return /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s);
}

export function isPositiveNumber(s){
  return isNumber(s) && parseFloat(s) > 0;
}

export function isNonNegativeNumber(s){
  return isNumber(s) && parseFloat(s) >= 0;
}

export function isInteger(s){
  if(s === null || s === undefined || s === '') return false;
  return /^\s*[+-]?\d+\s*$/.test(s);
}

export function isPositiveInteger(s){
  return isInteger(s) && parseInt(s, 10) > 0;
}

export function isNonNegativeInteger(s){
  return isInteger(s) && parseInt(s, 10) >= 0;
}

// A coordinate accepts a bare number OR a `~`/`~offset` relative form
// (an empty offset after `~` means "unchanged", same as the real command
// syntax for tp/setMarker/moveCitizen/etc.).
export function isCoord(s){
  if(s === null || s === undefined) return false;
  var body = s.charAt(0) === '~' ? s.slice(1) : s;
  return body === '' || isNumber(body);
}
