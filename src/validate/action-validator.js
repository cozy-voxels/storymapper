import { isNumber, isPositiveNumber, isNonNegativeInteger, isPositiveInteger, isCoord } from './parse-helpers.js';
import { validateTrackingTag } from './tracking-tag-validator.js';

/* Ported from QuestLines Core's ActionValidator -- see quest-validator.js
   for the full attribution note. */

var VALID_VAR_ACT_OPS = ['add', 'subtract', 'multiply', 'divide', 'floordivide', 'modulo', 'floor', 'ceil', 'round', 'min', 'max', 'set'];
var VALID_GLOBAL_VAR_ACT_OPS = ['add', 'subtract', 'multiply', 'divide', 'set'];
var VALID_STRING_ACT_OPS = ['set', 'concat'];
var ICON_STATE_NAMES = ['available', 'inprogress', 'objectives_complete', 'completed', 'locked', 'waiting', 'repeatable_ready', 'story', 'custom', 'unknown'];
var VALID_ATTITUDES = ['passive', 'neutral', 'aggressive', 'hostile'];
var VALID_GUARD_STATES = ['on', 'true', 'enable', 'enabled', 'off', 'false', 'disable', 'disabled', 'reset', 'clear', 'auto', 'default'];
var VALID_EQUIP_SLOTS = ['hand', 'offhand', 'helmet', 'chest', 'gloves', 'leggings'];
var VALID_ANIMATION_SLOTS = ['movement', 'status', 'action', 'face', 'emote'];

function joinFrom(parts, start){
  return parts.slice(start).join(':');
}

function validateSpawn(parts, label, path, report){
  if(parts.length < 5){
    report.error(path, '`' + label + '` requires format `' + label + ':name:x:y:z[:delay[:qty]]`.');
    return;
  }
  var axes = ['x', 'y', 'z'];
  for(var i = 2; i <= 4; i++){ if(!isCoord(parts[i])) report.error(path, '`' + label + '` coordinate ' + axes[i - 2] + ' must be a number or ~offset (got `' + parts[i] + '`).'); }
  if(parts.length >= 6 && !isNonNegativeInteger(parts[5])) report.error(path, '`' + label + '` delay must be a non-negative integer (got `' + parts[5] + '`).');
  if(parts.length >= 7 && !isPositiveInteger(parts[6])) report.error(path, '`' + label + '` qty must be a positive integer (got `' + parts[6] + '`).');
}

function validateSound(parts, path, report){
  if(parts.length >= 2 && parts[1] !== ''){
    if(parts.length >= 5){
      var axes = ['x', 'y', 'z'];
      for(var i = 2; i <= 4; i++){ if(!isCoord(parts[i])) report.error(path, '`sound` coordinate ' + axes[i - 2] + ' must be a number or ~offset (got `' + parts[i] + '`).'); }
      if(parts.length >= 6 && parts[5].toLowerCase() !== 'player') report.warning(path, '`sound` 6th segment must be `player` for player-only 3D sound (got `' + parts[5] + '`).');
    } else if(parts.length >= 3 && parts[2].toLowerCase() !== 'true'){
      report.error(path, '`sound` optional third segment must be `true` for global broadcast, or use `sound:name:x:y:z` for 3D positional (got `' + parts[2] + '`).');
    }
  } else {
    report.error(path, '`sound` requires format `sound:soundName[:true]` or `sound:soundName:x:y:z[:player]`.');
  }
}

function validateGlobalAction(parts, path, report){
  if(parts.length < 3){
    report.error(path, '`global` action requires format `global:addtag:name`, `global:removetag:name`, `global:variable:name:op:value`, or `global:string:name:op:value`.');
    return;
  }
  switch(parts[1].toLowerCase()){
    case 'addtag': case 'removetag':
      if(parts[2] === '') report.error(path, '`global:' + parts[1] + '` requires a tag name.');
      return;
    case 'variable':
      if(parts.length < 5){ report.error(path, '`global:variable` action requires format `global:variable:name:operation:value`.'); return; }
      if(VALID_GLOBAL_VAR_ACT_OPS.indexOf(parts[3].toLowerCase()) === -1) report.error(path, '`global:variable` operation must be add, subtract, multiply, divide, or set (got `' + parts[3] + '`).');
      if(!isNumber(parts[4])) report.error(path, '`global:variable` value must be a number.');
      return;
    case 'string':
      if(parts.length < 5 || parts[2] === ''){ report.error(path, '`global:string` action requires format `global:string:name:set|concat:value`.'); return; }
      if(VALID_STRING_ACT_OPS.indexOf(parts[3].toLowerCase()) === -1) report.error(path, '`global:string` operation must be set or concat (got `' + parts[3] + '`).');
      return;
    default:
      report.error(path, '`global` action subtype must be addtag, removetag, variable, or string (got `' + parts[1] + '`).');
  }
}

// Unrecognised actions warn unless isKnownAction accepts them (see
// isKnownRequirement).
export function validateAction(action, path, report, isKnownAction){
  if(action === null || action === undefined || action.trim() === ''){
    report.error(path, 'Action must be a non-empty string.');
    return;
  }
  var parts = action.split(':');
  var type = parts[0];
  var typeLc = type.toLowerCase();
  if(action.indexOf('{') !== -1) return; // interpolated at runtime

  switch(typeLc){
    case 'queststarted': case 'questcompleted': case 'questremoved':
    case 'startquest': case 'completequest': case 'removequest':
      if(!(parts.length >= 2 && parts[1] !== '')) report.error(path, '`' + type + '` requires a quest ID.');
      return;
    case 'addtag': case 'removetag':
      if(parts.length >= 2 && parts[1] !== ''){
        var tag = joinFrom(parts, 1);
        if(tag.toLowerCase().indexOf('tracking:') === 0) validateTrackingTag(tag, path, report);
        return;
      }
      report.error(path, '`' + type + '` requires a tag name.');
      return;
    case 'settimestamp':
      if(!(parts.length >= 2 && parts[1] !== '')) report.error(path, '`setTimestamp` requires a key.');
      return;
    case 'cleartimestamp':
      if(!(parts.length >= 2 && parts[1] !== '')) report.error(path, '`clearTimestamp` requires a key.');
      return;
    case 'timedstart':
      if(parts.length >= 2 && parts[1] !== ''){
        if(parts.length >= 3 && !isPositiveNumber(parts[2])) report.error(path, '`timedStart` duration must be a positive number (got `' + parts[2] + '`).');
        return;
      }
      report.error(path, '`timedStart` requires a key.');
      return;
    case 'item':
      if(parts.length < 3){ report.error(path, '`item` action requires format `item:itemId:qty`.'); return; }
      if(!isPositiveInteger(parts[2])) report.error(path, '`item` qty must be a positive integer (got `' + parts[2] + '`).');
      return;
    case 'command': {
      if(parts.length < 3){ report.error(path, '`command` requires format `command:text:server|player[:elevated]`.'); return; }
      var last = parts[parts.length - 1].toLowerCase();
      var elevated = last === 'elevated';
      var mode = (elevated && parts.length >= 4) ? parts[parts.length - 2].toLowerCase() : last;
      if(mode !== 'server' && mode !== 'player') report.error(path, '`command` must end with `:server` or `:player[:elevated]` (got `' + parts[parts.length - 1] + '`).');
      return;
    }
    case 'page':
      if(!(parts.length >= 2 && parts[1] !== '')) report.error(path, '`page` requires a page ID.');
      return;
    case 'spawncitizen':
      validateSpawn(parts, 'spawnCitizen', path, report);
      return;
    case 'setattitude':
      if(parts.length < 3 || parts[1] === ''){ report.error(path, '`setAttitude` requires format `setAttitude:citizenId:passive|neutral|aggressive|hostile`.'); return; }
      if(VALID_ATTITUDES.indexOf(parts[2].toLowerCase()) === -1) report.error(path, '`setAttitude` value must be passive, neutral, aggressive, or hostile (got `' + parts[2] + '`).');
      return;
    case 'setinvulnerable':
      if(parts.length < 3 || parts[1] === ''){ report.error(path, '`setInvulnerable` requires format `setInvulnerable:citizenId:true|false`.'); return; }
      if(['true', 'false'].indexOf(parts[2].toLowerCase()) === -1) report.error(path, '`setInvulnerable` value must be true or false (got `' + parts[2] + '`).');
      return;
    case 'setguard':
      if(parts.length < 3 || parts[1] === ''){ report.error(path, '`setGuard` requires format `setGuard:citizenId:on|off|reset`.'); return; }
      if(VALID_GUARD_STATES.indexOf(parts[2].toLowerCase()) === -1) report.error(path, '`setGuard` value must be on, off, or reset (got `' + parts[2] + '`).');
      return;
    case 'sethealth':
      if(parts.length < 3 || parts[1] === ''){ report.error(path, '`setHealth` requires format `setHealth:citizenId:max|default`.'); return; }
      if(parts[2].toLowerCase() !== 'default' && !isPositiveNumber(parts[2])) report.error(path, '`setHealth` max must be a positive number or `default` (got `' + parts[2] + '`).');
      return;
    case 'setdamage':
      if(parts.length < 3 || parts[1] === ''){ report.error(path, '`setDamage` requires format `setDamage:citizenId:amount|default`.'); return; }
      if(parts[2].toLowerCase() !== 'default' && !isPositiveNumber(parts[2])) report.error(path, '`setDamage` amount must be a positive number or `default` (got `' + parts[2] + '`).');
      return;
    case 'setequip':
      if(parts.length < 3 || parts[1] === '' || parts[2] === ''){ report.error(path, '`setEquip` requires format `setEquip:citizenId:slot:itemId` (slot: hand, offhand, helmet, chest, gloves, leggings; itemId empty or `none` clears).'); return; }
      if(VALID_EQUIP_SLOTS.indexOf(parts[2].toLowerCase()) === -1) report.error(path, '`setEquip` slot must be hand, offhand, helmet, chest, gloves, or leggings (got `' + parts[2] + '`).');
      return;
    case 'playanimation':
      if(parts.length < 2 || parts[1] === ''){ report.error(path, '`playAnimation` requires format `playAnimation:animation[:slot][:duration][:npcIdOrName]` (slot: Movement, Status, Action, Face, Emote -- default Action).'); return; }
      if(VALID_ANIMATION_SLOTS.indexOf(parts[1].toLowerCase()) === -1) return;
      report.warning(path, '`playAnimation` takes the animation first: `playAnimation:animation[:slot][:duration][:npcIdOrName]` (got slot name `' + parts[1] + '` in the animation position).');
      return;
    case 'hidecitizen': case 'hidenametag':
      if(parts.length < 3 || parts[1] === ''){ report.error(path, '`' + type + '` requires format `' + type + ':citizenId:true|false`.'); return; }
      if(['true', 'false'].indexOf(parts[2].toLowerCase()) === -1) report.error(path, '`' + type + '` value must be true or false (got `' + parts[2] + '`).');
      return;
    case 'hidenpc': case 'shownpc':
      if(!(parts.length >= 2 && parts[1] !== '')) report.error(path, '`' + type + '` requires format `' + type + ':citizenIdOrName` (hides/shows the NPC for the calling player only).');
      return;
    case 'startescort':
      if(!(parts.length >= 6 && parts[1] !== '' && parts[2] !== '')) report.error(path, '`startEscort` requires format `startEscort:escortId:templateName:x:y:z` (coords support `~` prefix).');
      return;
    case 'escortstop':
      if(!(parts.length >= 2 && parts[1] !== '')) report.error(path, '`escortStop` requires format `escortStop:escortId`.');
      return;
    case 'escortmove':
      if(!(parts.length >= 5 && parts[1] !== '')) report.error(path, '`escortMove` requires format `escortMove:escortId:x:y:z` (coords support `~` prefix).');
      return;
    case 'escortpatrol':
      if(!(parts.length >= 3 && parts[1] !== '' && parts[2] !== '')) report.error(path, '`escortPatrol` requires format `escortPatrol:escortId:pathName`.');
      return;
    case 'escortstoppatrol':
      if(!(parts.length >= 2 && parts[1] !== '')) report.error(path, '`escortStopPatrol` requires format `escortStopPatrol:escortId`.');
      return;
    case 'escortpause':
      if(!(parts.length >= 2 && parts[1] !== '')) report.error(path, '`escortPause` requires format `escortPause:escortId`.');
      return;
    case 'patrol':
      if(!(parts.length >= 3 && parts[1] !== '' && parts[2] !== '')) report.error(path, '`patrol` requires format `patrol:citizenId:pathName`.');
      return;
    case 'stoppatrol': case 'stopcitizen':
      if(!(parts.length >= 2 && parts[1] !== '')) report.error(path, '`' + type + '` requires format `' + type + ':citizenId`.');
      return;
    case 'movecitizen': {
      if(parts.length < 5 || parts[1] === ''){ report.error(path, '`moveCitizen` requires format `moveCitizen:citizenId:x:y:z` (coords support `~` prefix).'); return; }
      var axesMC = ['x', 'y', 'z'];
      for(var iMC = 2; iMC <= 4; iMC++){ if(!isCoord(parts[iMC])) report.error(path, '`moveCitizen` coordinate ' + axesMC[iMC - 2] + ' must be a number or ~offset (got `' + parts[iMC] + '`).'); }
      return;
    }
    case 'patrolgroup':
      if(!(parts.length >= 3 && parts[1] !== '' && parts[2] !== '')) report.error(path, '`patrolGroup` requires format `patrolGroup:groupName:pathName`.');
      return;
    case 'stoppatrolgroup': case 'stopgroup':
      if(!(parts.length >= 2 && parts[1] !== '')) report.error(path, '`' + type + '` requires format `' + type + ':groupName`.');
      return;
    case 'movegroup': {
      if(parts.length < 5 || parts[1] === ''){ report.error(path, '`moveGroup` requires format `moveGroup:groupName:x:y:z` (coords support `~` prefix).'); return; }
      var axesMG = ['x', 'y', 'z'];
      for(var iMG = 2; iMG <= 4; iMG++){ if(!isCoord(parts[iMG])) report.error(path, '`moveGroup` coordinate ' + axesMG[iMG - 2] + ' must be a number or ~offset (got `' + parts[iMG] + '`).'); }
      return;
    }
    case 'spawn':
      validateSpawn(parts, 'spawn', path, report);
      return;
    case 'variable':
      if(parts.length < 4){ report.error(path, '`variable` requires format `variable:name:operation:value`.'); return; }
      if(VALID_VAR_ACT_OPS.indexOf(parts[2].toLowerCase()) === -1) report.error(path, '`variable` operation must be one of add, subtract, multiply, divide, floordivide, modulo, floor, ceil, round, min, max, set (got `' + parts[2] + '`).');
      if(parts[3].indexOf('{') === -1 && !isNumber(parts[3])) report.error(path, '`variable` value must be a number (got `' + parts[3] + '`).');
      return;
    case 'string':
      if(parts.length < 4 || parts[1] === ''){ report.error(path, '`string` requires format `string:name:set|concat:value`.'); return; }
      if(VALID_STRING_ACT_OPS.indexOf(parts[2].toLowerCase()) === -1) report.error(path, '`string` operation must be set or concat (got `' + parts[2] + '`).');
      return;
    case 'economy':
      if(parts.length < 3){ report.error(path, '`economy` action requires format `economy:give|take:amount`.'); return; }
      if(['give', 'take'].indexOf(parts[1].toLowerCase()) === -1){ report.error(path, '`economy` action must be `economy:give:amount` or `economy:take:amount` (got `' + parts[1] + '`).'); return; }
      if(!isPositiveNumber(parts[2])) report.error(path, '`economy:' + parts[1] + '` amount must be a positive number (got `' + parts[2] + '`).');
      return;
    case 'sound':
      validateSound(parts, path, report);
      return;
    case 'title': {
      if(parts.length >= 2 && parts[1] !== ''){
        var lastT = parts[parts.length - 1].toLowerCase();
        var lastIsBool = lastT === 'true' || lastT === 'false';
        if(parts.length < 5 || !lastIsBool) return;
        var scope = parts[parts.length - 2].toLowerCase();
        if(scope === 'server' || scope === 'player') return;
        report.warning(path, '`title` isMajor (last segment) needs `server` or `player` before it (got `' + parts[parts.length - 2] + '`); otherwise it is treated as subtitle text.');
        return;
      }
      report.error(path, '`title` requires format `title:primary[:secondary[:server|player[:isMajor]]]`.');
      return;
    }
    case 'macro':
      if(!(parts.length >= 2 && parts[1] !== '')) report.error(path, '`macro` requires a macro name.');
      return;
    case 'delay':
      if(parts.length < 2){ report.error(path, '`delay` requires format `delay:seconds`.'); return; }
      if(!isPositiveNumber(parts[1])) report.error(path, '`delay` seconds must be a positive number (got `' + parts[1] + '`).');
      return;
    case 'random': {
      var raw = action.slice('random:'.length);
      if(raw.charAt(0) === '[' && raw.charAt(raw.length - 1) === ']'){
        var inner = raw.slice(1, -1).trim();
        if(inner === ''){ report.error(path, '`random` bracket list must not be empty.'); return; }
        var grouped = inner.charAt(0) === '[' && inner.charAt(inner.length - 1) === ']';
        var entries = grouped ? inner.slice(1, -1).split('][') : inner.split(',');
        for(var ri = 0; ri < entries.length; ri++){
          if(entries[ri].trim().toLowerCase().indexOf('page:') === 0){
            report.error(path, '`random` cannot contain `page:` navigation -- use separate responses instead.');
            return;
          }
        }
        return;
      }
      report.error(path, '`random` requires format `random:[action1,action2,...]` (or the comma-safe `random:[[action1][action2]]`) with square brackets.');
      return;
    }
    case 'chance':
      if(parts.length < 3){ report.error(path, '`chance` requires format `chance:percent:action`.'); return; }
      if(!isPositiveNumber(parts[1]) && parts[1].trim() !== '0') report.error(path, '`chance` percent must be a number 0-100 (got `' + parts[1] + '`).');
      return;
    case 'mmoskill': case 'mmo':
      if(parts.length >= 5 && parts[1].toLowerCase() === 'xp' && parts[3].toLowerCase() === 'give'){
        if(!isPositiveNumber(parts[4])) report.error(path, '`mmo:xp:give` amount must be a positive number (got `' + parts[4] + '`).');
        return;
      }
      report.error(path, '`mmo` action requires format `mmo:xp:skillId:give:amount`.');
      return;
    case 'rpgxp':
      if(parts.length >= 3 && parts[1].toLowerCase() === 'give'){
        if(!isPositiveNumber(parts[2])) report.error(path, '`rpgxp:give` amount must be a positive number.');
        return;
      }
      report.error(path, '`rpgxp` requires format `rpgxp:give:amount`.');
      return;
    case 'elxp':
      if(parts.length >= 3 && parts[1].toLowerCase() === 'give'){
        if(!isPositiveNumber(parts[2])) report.error(path, '`elxp:give` amount must be a positive number.');
        return;
      }
      report.error(path, '`elxp` requires format `elxp:give:amount`.');
      return;
    case 'regionaddmember': case 'regionremovemember':
      if(!(parts.length >= 2 && parts[1] !== '')) report.error(path, '`' + type + '` requires a region ID.');
      return;
    case 'global':
      validateGlobalAction(parts, path, report);
      return;
    case 'track': {
      if(parts.length < 3){ report.error(path, '`track` action requires format `track:id:type:[targets]`.'); return; }
      if(parts[1].indexOf('__ach__') === 0){
        report.warning(path, '`track:` ID `' + parts[1] + '` uses the reserved `__ach__` prefix that the achievement system owns -- pick a different ID to avoid collisions.');
      }
      return;
    }
    case 'untrack':
      if(parts.length >= 2 && parts[1] !== ''){
        if(parts[1].indexOf('__ach__') === 0) report.warning(path, '`untrack:` ID `' + parts[1] + '` uses the reserved `__ach__` prefix -- this would wipe an achievement\'s private tracker.');
        return;
      }
      report.error(path, '`untrack` requires a tracker ID.');
      return;
    case 'chat': case 'message': case 'citybroadcast': case 'nationbroadcast': {
      var prefixLen = typeLc.length + 1;
      if(action.length > prefixLen && action.slice(prefixLen).trim() !== '') return;
      report.warning(path, '`' + typeLc + '` action has an empty message.');
      return;
    }
    case 'citywithdraw': case 'nationwithdraw':
      if(parts.length >= 2 && isPositiveInteger(parts[1])) return;
      report.error(path, '`' + typeLc + '` requires a positive integer amount (got `' + (parts.length > 1 ? parts[1] : '') + '`).');
      return;
    case 'if':
      if(action.indexOf('::') === -1) report.error(path, '`if` action requires `::` separator -- format: `if:req::thenAction[::elseAction]`.');
      return;
    case 'givequestitem':
      if(parts.length < 3){ report.error(path, '`givequestitem` requires format `givequestitem:itemId:qty`.'); return; }
      if(!isPositiveInteger(parts[2])) report.error(path, '`givequestitem` qty must be a positive integer (got `' + parts[2] + '`).');
      return;
    case 'removequestitem':
      if(parts.length < 3){ report.error(path, '`removequestitem` requires format `removequestitem:itemId:qty`.'); return; }
      if(!isPositiveInteger(parts[2])) report.error(path, '`removequestitem` qty must be a positive integer (got `' + parts[2] + '`).');
      return;
    case 'setmarker': {
      if(parts.length < 6){ report.error(path, '`setMarker` requires format `setMarker:id:label:x:y:z[:image[:RRGGBB]]`.'); return; }
      if(parts[1] === '') report.error(path, '`setMarker` requires a marker ID.');
      var axesSM = ['x', 'y', 'z'];
      for(var iSM = 3; iSM <= 5; iSM++){ if(!isCoord(parts[iSM])) report.error(path, '`setMarker` coordinate ' + axesSM[iSM - 3] + ' must be a number or ~offset (got `' + parts[iSM] + '`).'); }
      if(parts.length >= 7 && parts[6] === '') report.warning(path, '`setMarker` image segment is empty; omit it instead.');
      if(parts.length >= 8 && !/^[0-9a-f]{6}$/i.test(parts[7])) report.warning(path, '`setMarker` 8th segment should be a 6-digit hex color (got `' + parts[7] + '`).');
      return;
    }
    case 'removemarker':
      if(!(parts.length >= 2 && parts[1] !== '')) report.error(path, '`removeMarker` requires a marker ID.');
      return;
    case 'hideblock': case 'showblock': {
      var validArity = parts.length === 4 || parts.length === 5 || parts.length === 7 || parts.length === 8;
      if(!validArity){ report.error(path, '`' + parts[0] + '` requires format `' + parts[0] + ':x:y:z[:world]` or `' + parts[0] + ':x1:y1:z1:x2:y2:z2[:world]`.'); return; }
      var coordCount = parts.length >= 7 ? 6 : 3;
      var axesHB = ['x', 'y', 'z', 'x2', 'y2', 'z2'];
      for(var iHB = 0; iHB < coordCount; iHB++){ if(!isCoord(parts[1 + iHB])) report.error(path, '`' + parts[0] + '` coordinate ' + axesHB[iHB] + ' must be a number or ~offset (got `' + parts[1 + iHB] + '`).'); }
      return;
    }
    case 'tp': {
      if(parts.length < 4){ report.error(path, '`tp` requires format `tp:x:y:z[:world]`.'); return; }
      var axesTP = ['x', 'y', 'z'];
      for(var iTP = 1; iTP <= 3; iTP++){ if(!isCoord(parts[iTP])) report.error(path, '`tp` coordinate ' + axesTP[iTP - 1] + ' must be a number or ~offset (got `' + parts[iTP] + '`).'); }
      if(parts.length >= 5 && parts[4] === '') report.warning(path, '`tp` world segment is empty; omit it to use the player\'s current world.');
      return;
    }
    case 'startarena':
      if(parts.length >= 2 && parts[1] !== ''){
        if(parts.length >= 5){
          var axesSA = ['x', 'y', 'z'];
          for(var iSA = 2; iSA <= 4; iSA++){ if(!isCoord(parts[iSA])) report.error(path, '`startArena` coordinate ' + axesSA[iSA - 2] + ' must be a number or ~offset (got `' + parts[iSA] + '`).'); }
          return;
        }
        if(parts.length > 2) report.error(path, '`startArena` location must be either omitted (uses player position) or a full `:x:y:z` triple.');
        return;
      }
      report.error(path, '`startArena` requires format `startArena:arenaId[:x:y:z]`.');
      return;
    case 'failarena': case 'queststartedhud': case 'questtracked':
      return;
    case 'mail':
      if(parts.length < 3){ report.error(path, '`mail` requires format `mail:itemId:qty`.'); return; }
      if(!isPositiveInteger(parts[2])) report.error(path, '`mail` qty must be a positive integer (got `' + parts[2] + '`).');
      return;
    case 'givebook':
      if(!(parts.length >= 4)) report.error(path, '`givebook` requires format `givebook:title:author:body` or `givebook:itemId:title:author:body`.');
      return;
    case 'givetitle': case 'removetitle':
      if(!(parts.length >= 2 && parts[1] !== '')) report.error(path, '`' + type + '` requires format `' + type + ':titleId` (requires QuestLines Titles).');
      return;
    case 'settitle':
      return;
    case 'opengui':
      if(!(parts.length >= 2 && parts[1] !== '')) report.error(path, '`opengui` requires format `opengui:guiId` (requires QuestLines GUI).');
      return;
    case 'itemgroup': {
      if(parts.length < 4){ report.error(path, '`itemgroup` requires format `itemgroup:id:[patterns]:qty[:true]`.'); return; }
      var lastIG = parts[parts.length - 1];
      var consumeFlagIG = lastIG.toLowerCase() === 'true';
      var qtyIG = consumeFlagIG ? parts[parts.length - 2] : lastIG;
      if(!isPositiveInteger(qtyIG)) report.error(path, '`itemgroup` qty must be a positive integer (got `' + qtyIG + '`).');
      return;
    }
    case 'iconstate': {
      if(parts.length < 3){ report.error(path, '`iconstate` requires format `iconState:npcId:state` or `iconState:npcId:state:clear`.'); return; }
      if(parts[1] === '') report.error(path, '`iconstate` npcId must not be empty.');
      if(ICON_STATE_NAMES.indexOf(parts[2].toLowerCase()) === -1) report.error(path, '`iconstate` state must be one of [' + ICON_STATE_NAMES.join(', ') + '] (got `' + parts[2] + '`).');
      if(parts.length >= 4 && parts[3].toLowerCase() !== 'clear') report.error(path, '`iconstate` 4th part must be `clear` (got `' + parts[3] + '`).');
      return;
    }
    default:
      if(!isKnownAction || !isKnownAction(typeLc)){
        report.warning(path, 'Unrecognised action type `' + type + '`. Check spelling or register a custom action via the API.');
      }
  }
}

export function validateActionList(actions, path, report, isKnownAction){
  if(!actions) return;
  actions.forEach(function(a, i){ validateAction(a, path + '[' + i + ']', report, isKnownAction); });
  var firstPageIdx = -1;
  for(var i = 0; i < actions.length; i++){
    var a = actions[i];
    if(!a || a.toLowerCase().indexOf('page:') !== 0) continue;
    if(firstPageIdx === -1){ firstPageIdx = i; continue; }
    report.warning(path + '[' + i + ']', 'More than one `page:` action -- each queues a dialogue open, so only the last one stays on screen and `' + actions[firstPageIdx] + '` at index ' + firstPageIdx + ' will never be seen.');
    break;
  }
}
