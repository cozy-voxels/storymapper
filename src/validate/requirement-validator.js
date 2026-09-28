import { isNumber, isPositiveNumber, isNonNegativeNumber, isInteger, isPositiveInteger, isNonNegativeInteger } from './parse-helpers.js';
import { validateTrackingTag } from './tracking-tag-validator.js';

/* Ported from QuestLines Core's RequirementValidator -- see
   quest-validator.js for the full attribution note. */

var VALID_TIME_OF_DAY = ['morning', 'afternoon', 'evening', 'night'];
var VALID_MOON_PHASE = ['full', 'waning', 'new', 'waxing'];
var VALID_VAR_REQ_OPS = ['greater', 'less', 'equal', 'greaterorequal', 'lessorequal'];
var VALID_STRING_REQ_OPS = ['equals', 'notequals', 'contains', 'notcontains', 'startswith', 'endswith'];
var VALID_STRING_REQ_NULLARY_OPS = ['empty', 'notempty'];
var VALID_COMPARE_OPS = ['greater', 'less', 'equal'];
var ICON_STATE_NAMES = ['available', 'inprogress', 'objectives_complete', 'completed', 'locked', 'waiting', 'repeatable_ready', 'story', 'custom', 'unknown'];
var WEEKDAY_NAMES = ['mon', 'monday', 'tue', 'tuesday', 'wed', 'wednesday', 'thu', 'thursday', 'fri', 'friday', 'sat', 'saturday', 'sun', 'sunday'];

function joinFrom(parts, start){
  return parts.slice(start).join(':');
}

function isMonthDay(s){
  return !!s && /^\d{2}-\d{2}$/.test(s) && Number(s.slice(0, 2)) >= 1 && Number(s.slice(0, 2)) <= 12 && Number(s.slice(3)) >= 1 && Number(s.slice(3)) <= 31;
}

function isFullDate(s){
  if(!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  var d = new Date(s + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function isWeekday(s){
  return !!s && WEEKDAY_NAMES.indexOf(s.toLowerCase()) !== -1;
}

function validateGlobalRequirement(parts, path, report){
  var sub = parts.length > 1 ? parts[1].toLowerCase() : '';
  switch(sub){
    case 'hastag': case 'nottag':
      if(!(parts.length >= 3 && parts[2] !== '')) report.error(path, '`global:' + parts[1] + '` requires a tag name.');
      return;
    case 'variable':
      if(parts.length < 5){ report.error(path, '`global:variable` requires format `global:variable:name:operator:value`.'); return; }
      if(VALID_VAR_REQ_OPS.indexOf(parts[3].toLowerCase()) === -1) report.error(path, '`global:variable` operator must be greater, less, equal, greaterOrEqual, or lessOrEqual (got `' + parts[3] + '`).');
      if(!isNumber(parts[4])) report.error(path, '`global:variable` value must be a number.');
      return;
    case 'string': {
      if(parts.length < 4 || parts[2] === ''){ report.error(path, '`global:string` requires format `global:string:name:operator[:value]`.'); return; }
      var op = parts[3].toLowerCase();
      if(VALID_STRING_REQ_NULLARY_OPS.indexOf(op) !== -1) return;
      if(VALID_STRING_REQ_OPS.indexOf(op) !== -1){
        if(parts.length < 5) report.error(path, '`global:string:' + parts[2] + ':' + op + '` requires a value.');
        return;
      }
      report.error(path, '`global:string` operator must be equals, notequals, contains, notcontains, startswith, endswith, empty, or notempty (got `' + parts[3] + '`).');
      return;
    }
    default:
      report.error(path, '`global` requirement subtype must be hastag, nottag, variable, or string (got `' + (parts.length > 1 ? parts[1] : '') + '`).');
  }
}

// Types not in the switch warn as unrecognised unless `isKnownRequirement`
// accepts them (e.g. custom types from other plugins).
export function validateRequirement(req, path, report, isKnownRequirement){
  if(req === null || req === undefined || req.trim() === ''){
    report.error(path, 'Requirement must be a non-empty string.');
    return;
  }
  var sepIdx = req.indexOf('::');
  if(sepIdx !== -1) req = req.slice(0, sepIdx);
  if(req.charAt(0) === '!'){
    var inner = req.slice(1);
    if(inner === ''){
      report.error(path, '`!` shorthand requires an inner requirement -- e.g. `!hasTag:my_flag`.');
      return;
    }
    validateRequirement(inner, path + ' [! inner]', report, isKnownRequirement);
    return;
  }
  var parts = req.split(':');
  var type = parts[0];
  var typeLc = type.toLowerCase();
  if(req.indexOf('{') !== -1) return; // interpolated at runtime

  switch(typeLc){
    case 'questcompleted': case 'questnotcompleted': case 'queststarted': case 'questnotstarted':
      if(!(parts.length >= 2 && parts[1] !== '')) report.error(path, '`' + type + '` requires a quest ID -- e.g. `' + type + ':my_quest`.');
      return;
    case 'hastag': case 'nottag':
      if(parts.length >= 2 && parts[1] !== ''){
        var tag = joinFrom(parts, 1);
        if(tag.toLowerCase().indexOf('tracking:') === 0) validateTrackingTag(tag, path, report);
        return;
      }
      report.error(path, '`' + type + '` requires a tag name.');
      return;
    case 'kill': case 'break': case 'place': case 'craft': case 'harvest': case 'pickup':
    case 'interactblock': case 'interactentity': case 'capture':
      if(parts.length < 3){ report.error(path, '`' + type + '` requires format `' + type + ':id:qty`.'); return; }
      if(!isPositiveInteger(parts[2])){ report.error(path, '`' + type + '` qty must be a positive integer (got `' + parts[2] + '`).'); return; }
      if(parts.length > 3 && parts[3].toLowerCase() !== 'world') report.error(path, '`' + type + '` only accepts an optional `world:<name>` scope after qty (got `' + parts[3] + '`).');
      return;
    case 'projectilehit': case 'projectileheadshot':
      if(parts.length < 3){ report.error(path, '`' + type + '` requires format `' + type + ':id:qty`.'); return; }
      if(!isPositiveInteger(parts[2])){ report.error(path, '`' + type + '` qty must be a positive integer (got `' + parts[2] + '`).'); return; }
      if(parts.length > 3 && parts[3].toLowerCase() !== 'dist') report.error(path, '`' + type + '` only accepts an optional `dist:<op><value>` gate after qty (got `' + parts[3] + '`).');
      return;
    case 'killcitizen':
      if(parts.length < 3){ report.error(path, '`killCitizen` requires format `killCitizen:citizenName:qty`.'); return; }
      if(!isPositiveInteger(parts[parts.length - 1])) report.error(path, '`killCitizen` qty must be a positive integer (got `' + parts[parts.length - 1] + '`).');
      return;
    case 'patrolling':
      if(!(parts.length >= 2 && parts[1] !== '')) report.error(path, '`patrolling` requires format `patrolling:citizenId[:pathName]`.');
      return;
    case 'citizenactive':
      if(!(parts.length >= 2 && parts[1] !== '')) report.error(path, '`citizenActive` requires format `citizenActive:citizenId`.');
      return;
    case 'citizenscheduleentry':
      if(!(parts.length >= 3 && parts[1] !== '' && parts[2] !== '')) report.error(path, '`citizenScheduleEntry` requires format `citizenScheduleEntry:citizenId:entryName`.');
      return;
    case 'citizenschedule':
      if(parts.length < 4 || parts[1] === '' || parts[2] === '' || parts[3] === ''){ report.error(path, '`citizenSchedule` requires format `citizenSchedule:citizenId:field:value` (field: stage, activity, state, time).'); return; }
      if(['stage', 'entry', 'name', 'activity', 'state', 'time'].indexOf(parts[2].toLowerCase()) === -1) report.error(path, '`citizenSchedule` field must be one of stage, activity, state, time (got `' + parts[2] + '`).');
      return;
    case 'groupcount': {
      if(parts.length < 3 || parts[1] === ''){ report.error(path, '`groupCount` requires format `groupCount:groupName:N` or `groupCount:groupName:op:N` (op: >=, <=, >, <, ==, !=).'); return; }
      if(parts.length === 3){
        if(!isNonNegativeInteger(parts[2])) report.error(path, '`groupCount` threshold must be a non-negative integer (got `' + parts[2] + '`).');
        return;
      }
      if(['>=', '<=', '>', '<', '==', '!='].indexOf(parts[2]) === -1) report.error(path, '`groupCount` operator must be one of >=, <=, >, <, ==, != (got `' + parts[2] + '`).');
      if(!isNonNegativeInteger(parts[3])) report.error(path, '`groupCount` threshold must be a non-negative integer (got `' + parts[3] + '`).');
      return;
    }
    case 'playerkill':
      if(parts.length < 2){ report.error(path, '`playerKill` requires format `playerKill:qty`.'); return; }
      if(!isPositiveInteger(parts[1])) report.error(path, '`playerKill` qty must be a positive integer (got `' + parts[1] + '`).');
      return;
    case 'traveldistance':
      if(parts.length < 2){ report.error(path, '`travelDistance` requires format `travelDistance:qty`.'); return; }
      if(!isPositiveInteger(parts[1])) report.error(path, '`travelDistance` qty must be a positive integer (got `' + parts[1] + '`).');
      return;
    case 'mountdistance':
      if(parts.length < 2){ report.error(path, '`mountDistance` requires format `mountDistance:qty`.'); return; }
      if(!isPositiveInteger(parts[1])) report.error(path, '`mountDistance` qty must be a positive integer (got `' + parts[1] + '`).');
      return;
    case 'ismounted':
      return;
    case 'questcompletedcount':
      if(parts.length < 2){ report.error(path, '`questCompletedCount` requires format `questCompletedCount:n`.'); return; }
      if(!isNonNegativeInteger(parts[1])) report.error(path, '`questCompletedCount` value must be a non-negative integer (got `' + parts[1] + '`).');
      return;
    case 'married': case 'spouseonline':
      return;
    case 'marrieddays':
      if(parts.length < 2){ report.error(path, '`marriedDays` requires format `marriedDays:days` (requires BetterMarriage).'); return; }
      if(!isNonNegativeInteger(parts[1])) report.error(path, '`marriedDays` value must be a non-negative integer (got `' + parts[1] + '`).');
      return;
    case 'spousenearby':
      if(parts.length < 2){ report.error(path, '`spouseNearby` requires format `spouseNearby:blocks` (requires BetterMarriage).'); return; }
      if(!isNonNegativeNumber(parts[1])) report.error(path, '`spouseNearby` range must be a non-negative number (got `' + parts[1] + '`).');
      return;
    case 'visitedcities': case 'visitednations': case 'citymembers': case 'nationcities':
    case 'citytreasury': case 'nationtreasury': case 'cityage': case 'nationage':
    case 'cityallies': case 'nationallies':
      if(parts.length < 2){ report.error(path, '`' + type + '` requires format `' + type + ':n` (requires QuestLinesNations).'); return; }
      if(!isNonNegativeInteger(parts[1])) report.error(path, '`' + type + '` value must be a non-negative integer (got `' + parts[1] + '`).');
      return;
    case 'incityland': case 'innationland': case 'inhomecity': case 'inenemycityland':
    case 'inallycityland': case 'isfounder': case 'incapitalcity': case 'cityatwar': case 'nationatwar':
      return;
    case 'cityallied': case 'visitedcity': case 'visitednation':
      if(!(parts.length >= 2 && parts[1] !== '')) report.error(path, '`' + type + '` requires a name (`' + type + ':name`, requires QuestLinesNations).');
      return;
    case 'visitedallcities':
      return;
    case 'item':
      if(parts.length < 3){ report.error(path, '`item` requires format `item:itemId:qty` or `item:itemId:qty:true`.'); return; }
      if(!isPositiveInteger(parts[2])) report.error(path, '`item` qty must be a positive integer (got `' + parts[2] + '`).');
      if(parts.length >= 4 && parts[3] !== 'true') report.error(path, '`item` 4th segment must be `true` to consume items on click (got `' + parts[3] + '`).');
      return;
    case 'talk':
      if(parts.length < 3){ report.error(path, '`talk` requires format `talk:citizenName:qty`.'); return; }
      if(!isPositiveInteger(parts[parts.length - 1])) report.error(path, '`talk` qty must be a positive integer.');
      return;
    case 'npcname':
      if(!(parts.length >= 2 && joinFrom(parts, 1).trim() !== '')) report.error(path, '`npcname` requires a display name -- e.g. `npcname:Elder Maren`.');
      return;
    case 'cooldown':
      if(parts.length < 3){ report.error(path, '`cooldown` requires format `cooldown:key:seconds`.'); return; }
      if(!isPositiveNumber(parts[2])) report.error(path, '`cooldown` seconds must be a positive number (got `' + parts[2] + '`).');
      return;
    case 'timedactive': case 'timedexpired':
      if(parts.length >= 2 && parts[1] !== ''){
        if(parts.length >= 3 && !isPositiveNumber(parts[2])) report.error(path, '`' + type + '` seconds must be a positive number (got `' + parts[2] + '`).');
        return;
      }
      report.error(path, '`' + type + '` requires format `' + type + ':key[:seconds]`.');
      return;
    case 'timefrom': {
      if(parts.length < 4){ report.error(path, '`timeFrom` requires format `timeFrom:key:op:duration` -- e.g. `timeFrom:taskstart:greater:60s`.'); return; }
      if(['greater', 'less', 'equal', 'greaterorequal', 'lessorequal'].indexOf(parts[2].toLowerCase()) === -1){
        report.error(path, '`timeFrom` op must be greater|less|equal|greaterOrEqual|lessOrEqual (got `' + parts[2] + '`).');
      }
      if(!/^\d+(\.\d+)?\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)?$/i.test(parts[3].trim())) {
        report.error(path, '`timeFrom` duration must be a number of seconds or a unit value like 60s/5m/2h/1d (got `' + parts[3] + '`).');
      }
      return;
    }
    case 'timedexact': {
      if(parts.length < 4){ report.error(path, '`timedExact` requires format `timedExact:key:[days[@weekday]:]hour:minute`.'); return; }
      if(parts.length > 5){ report.error(path, '`timedExact` has too many components; format is `timedExact:key:[days[@weekday]:]hour:minute`.'); return; }
      var hourStr = parts[parts.length - 2];
      var minuteStr = parts[parts.length - 1];
      if(!isInteger(hourStr) || Number(hourStr) < 0 || Number(hourStr) > 23) report.error(path, '`timedExact` hour must be 0-23 (got `' + hourStr + '`).');
      if(!isInteger(minuteStr) || Number(minuteStr) < 0 || Number(minuteStr) > 59) report.error(path, '`timedExact` minute must be 0-59 (got `' + minuteStr + '`).');
      if(parts.length < 5) return;
      var daysStr = parts[parts.length - 3];
      var at = daysStr.indexOf('@');
      if(at >= 0){
        var weekday = daysStr.slice(at + 1);
        daysStr = daysStr.slice(0, at);
        if(!isWeekday(weekday)) report.error(path, '`timedExact` weekday must be a day name like mon/monday (got `' + weekday + '`).');
      }
      if(!(isInteger(daysStr) && Number(daysStr) >= 1)) report.error(path, '`timedExact` days must be a whole number >= 1 (got `' + daysStr + '`).');
      return;
    }
    case 'nearposition': {
      if(parts.length < 5){ report.error(path, '`nearPosition` requires format `nearPosition:x:y:z:radius`.'); return; }
      var axes1 = ['x', 'y', 'z'];
      for(var i1 = 1; i1 <= 3; i1++){ if(!isNumber(parts[i1])) report.error(path, '`nearPosition` coordinate ' + axes1[i1 - 1] + ' must be a number (got `' + parts[i1] + '`).'); }
      if(!isPositiveNumber(parts[4])) report.error(path, '`nearPosition` radius must be a positive number (got `' + parts[4] + '`).');
      return;
    }
    case 'escortat': {
      if(parts.length < 6 || parts[1] === ''){ report.error(path, '`escortAt` requires format `escortAt:escortId:x:y:z:range`.'); return; }
      var axes2 = ['x', 'y', 'z'];
      for(var i2 = 2; i2 <= 4; i2++){ if(!isNumber(parts[i2])) report.error(path, '`escortAt` coordinate ' + axes2[i2 - 2] + ' must be a number (got `' + parts[i2] + '`).'); }
      if(!isPositiveNumber(parts[5])) report.error(path, '`escortAt` range must be a positive number (got `' + parts[5] + '`).');
      return;
    }
    case 'escortplayerinrange':
      if(parts.length < 3 || parts[1] === ''){ report.error(path, '`escortPlayerInRange` requires format `escortPlayerInRange:escortId:range`.'); return; }
      if(!isPositiveNumber(parts[2])) report.error(path, '`escortPlayerInRange` range must be a positive number (got `' + parts[2] + '`).');
      return;
    case 'nearnpc':
      if(parts.length < 3 || parts[1] === ''){ report.error(path, '`nearNpc` requires format `nearNpc:idOrName:range`.'); return; }
      if(!isPositiveNumber(parts[2])) report.error(path, '`nearNpc` range must be a positive number (got `' + parts[2] + '`).');
      return;
    case 'depth':
      if(parts.length < 3){ report.error(path, '`depth` requires format `depth:less|greater|equal:value`.'); return; }
      if(VALID_COMPARE_OPS.indexOf(parts[1].toLowerCase()) === -1) report.error(path, '`depth` operator must be less, greater, or equal (got `' + parts[1] + '`).');
      if(!isNumber(parts[2])) report.error(path, '`depth` value must be a number (got `' + parts[2] + '`).');
      return;
    case 'distancefrom': {
      if(parts.length < 6){ report.error(path, '`distanceFrom` requires format `distanceFrom:greater|less|equal:x:y:z:distance`.'); return; }
      if(VALID_COMPARE_OPS.indexOf(parts[1].toLowerCase()) === -1) report.error(path, '`distanceFrom` operator must be greater, less, or equal (got `' + parts[1] + '`).');
      var axes3 = ['x', 'y', 'z'];
      for(var i3 = 2; i3 <= 4; i3++){ if(!isNumber(parts[i3])) report.error(path, '`distanceFrom` coordinate ' + axes3[i3 - 2] + ' must be a number (got `' + parts[i3] + '`).'); }
      if(!isNonNegativeNumber(parts[5])) report.error(path, '`distanceFrom` distance must be a non-negative number (got `' + parts[5] + '`).');
      return;
    }
    case 'timeofday':
      if(!(parts.length >= 2 && VALID_TIME_OF_DAY.indexOf(parts[1].toLowerCase()) !== -1)) {
        report.error(path, '`timeOfDay` must be morning, afternoon, evening, or night (got `' + (parts.length > 1 ? parts[1] : '') + '`).');
      }
      return;
    case 'date':
      if(parts.length >= 2 && parts[1] !== ''){
        if(parts.length >= 3 && isMonthDay(parts[1]) && isMonthDay(parts[2])) return;
        if(isFullDate(parts[1])) return;
        if(isMonthDay(parts[1])) return;
        report.error(path, '`date` value must be `MM-dd`, `yyyy-MM-dd`, or `MM-dd:MM-dd` (got `' + parts[1] + (parts.length >= 3 ? ':' + parts[2] : '') + '`).');
        return;
      }
      report.error(path, '`date` requires format `date:MM-dd`, `date:yyyy-MM-dd`, or `date:MM-dd:MM-dd`.');
      return;
    case 'weekday': {
      if(parts.length < 2 || parts[1] === ''){ report.error(path, '`weekday` requires at least one day name -- e.g. `weekday:monday` or `weekday:sat,sun`.'); return; }
      var tokens = parts.slice(1).join(',').split(',');
      tokens.forEach(function(token){
        if(!isWeekday(token)) report.error(path, '`weekday` must be day names like mon/monday, separated by commas (got `' + token + '`).');
      });
      return;
    }
    case 'moonphase':
      if(parts.length >= 2 && parts[1] !== ''){
        if(VALID_MOON_PHASE.indexOf(parts[1].toLowerCase()) !== -1) return;
        if(isInteger(parts[1])) return;
        report.error(path, '`moonPhase` must be full, waning, new, waxing, or a phase index (0 to the world phase count minus one; vanilla worlds have 5 phases) (got `' + parts[1] + '`).');
        return;
      }
      report.error(path, '`moonPhase` requires a value.');
      return;
    case 'world': case 'zone': case 'biome':
      if(!(parts.length >= 2 && parts[1] !== '')) report.error(path, '`' + type + '` requires a name.');
      return;
    case 'any': {
      if(parts.length >= 2 && parts[1] !== ''){
        var innerA = joinFrom(parts, 1);
        var subs = innerA.split('|');
        if(subs.length < 2) report.warning(path, '`any` should have at least 2 pipe-separated options.');
        subs.forEach(function(sub){ validateRequirement(sub, path + ' [any: "' + sub + '"]', report, isKnownRequirement); });
        return;
      }
      report.error(path, '`any` requires pipe-delimited sub-requirements.');
      return;
    }
    case 'not':
      if(parts.length >= 2 && parts[1] !== ''){ validateRequirement(joinFrom(parts, 1), path + ' [not: inner]', report, isKnownRequirement); return; }
      report.error(path, '`not` requires an inner requirement.');
      return;
    case 'variable':
      if(parts.length < 4){ report.error(path, '`variable` requires format `variable:name:operator:value`.'); return; }
      if(VALID_VAR_REQ_OPS.indexOf(parts[2].toLowerCase()) === -1) report.error(path, '`variable` operator must be greater, less, equal, greaterOrEqual, or lessOrEqual (got `' + parts[2] + '`).');
      if(parts[3].indexOf('{') === -1 && !isNumber(parts[3])) report.error(path, '`variable` value must be a number (got `' + parts[3] + '`).');
      return;
    case 'string': {
      if(parts.length < 3 || parts[1] === ''){ report.error(path, '`string` requires format `string:name:operator[:value]`.'); return; }
      var opS = parts[2].toLowerCase();
      if(VALID_STRING_REQ_NULLARY_OPS.indexOf(opS) !== -1) return;
      if(VALID_STRING_REQ_OPS.indexOf(opS) !== -1){
        if(parts.length < 4) report.error(path, '`string:' + parts[1] + ':' + opS + '` requires a value.');
        return;
      }
      report.error(path, '`string` operator must be equals, notequals, contains, notcontains, startswith, endswith, empty, or notempty (got `' + parts[2] + '`).');
      return;
    }
    case 'economy':
      if(parts.length >= 3 && parts[1].toLowerCase() === 'canafford' && parts[2] !== ''){
        if(!isNonNegativeNumber(parts[2])) report.error(path, '`economy:canafford` amount must be a non-negative number (got `' + parts[2] + '`).');
        return;
      }
      report.error(path, '`economy` requirement requires format `economy:canafford:amount`.');
      return;
    case 'permission':
      if(parts.length >= 3 && parts[1].toLowerCase() === 'has' && parts[2] !== '') return;
      report.error(path, '`permission` requires format `permission:has:perm.node`.');
      return;
    case 'mmoskill': case 'mmo':
      if(parts.length < 4){ report.error(path, '`mmo` requirement requires format `mmo:skillId:operator:value`.'); return; }
      if(VALID_VAR_REQ_OPS.indexOf(parts[2].toLowerCase()) === -1) report.error(path, '`mmo` operator must be greater, less, equal, greaterOrEqual, or lessOrEqual (got `' + parts[2] + '`).');
      if(!isNumber(parts[3])) report.error(path, '`mmo` value must be a number (got `' + parts[3] + '`).');
      return;
    case 'rpglevel':
      if(parts.length >= 2 && parts[1] !== ''){
        if(parts[1].toLowerCase() === 'max') return;
        if(parts.length < 3){ report.error(path, '`rpglevel` requires format `rpglevel:operator:value` or `rpglevel:max`.'); return; }
        if(VALID_VAR_REQ_OPS.indexOf(parts[1].toLowerCase()) === -1) report.error(path, '`rpglevel` operator must be greater, less, equal, greaterOrEqual, or lessOrEqual (got `' + parts[1] + '`).');
        if(!isNumber(parts[2])) report.error(path, '`rpglevel` value must be a number.');
        return;
      }
      report.error(path, '`rpglevel` requires format `rpglevel:max` or `rpglevel:operator:value`.');
      return;
    case 'rpgxp':
      if(parts.length < 3){ report.error(path, '`rpgxp` requires format `rpgxp:operator:value`.'); return; }
      if(VALID_VAR_REQ_OPS.indexOf(parts[1].toLowerCase()) === -1) report.error(path, '`rpgxp` operator must be greater, less, equal, greaterOrEqual, or lessOrEqual (got `' + parts[1] + '`).');
      if(!isNumber(parts[2])) report.error(path, '`rpgxp` value must be a number.');
      return;
    case 'rpgclass':
      if(!(parts.length >= 2 && parts[1] !== '')) report.error(path, '`rpgclass` requires format `rpgclass:classId` or `rpgclass:any`.');
      return;
    case 'rpgclasstier':
      if(parts.length < 3){ report.error(path, '`rpgclasstier` requires format `rpgclasstier:operator:value` or `rpgclasstier:classId:operator:value`.'); return; }
      if(VALID_VAR_REQ_OPS.indexOf(parts[1].toLowerCase()) !== -1){
        if(!isNumber(parts[2])) report.error(path, '`rpgclasstier` value must be a number.');
        return;
      }
      if(parts.length < 4){ report.error(path, '`rpgclasstier:classId` requires format `rpgclasstier:classId:operator:value`.'); return; }
      if(VALID_VAR_REQ_OPS.indexOf(parts[2].toLowerCase()) === -1) report.error(path, '`rpgclasstier` operator must be greater, less, equal, greaterOrEqual, or lessOrEqual (got `' + parts[2] + '`).');
      if(!isNumber(parts[3])) report.error(path, '`rpgclasstier` value must be a number.');
      return;
    case 'ellevel': case 'elxp':
      if(parts.length < 3){ report.error(path, '`' + type + '` requires format `' + type + ':operator:value`.'); return; }
      if(VALID_VAR_REQ_OPS.indexOf(parts[1].toLowerCase()) === -1) report.error(path, '`' + type + '` operator must be greater, less, equal, greaterOrEqual, or lessOrEqual (got `' + parts[1] + '`).');
      if(!isNumber(parts[2])) report.error(path, '`' + type + '` value must be a number.');
      return;
    case 'elskill':
      if(parts.length < 4){ report.error(path, '`elskill` requires format `elskill:skillId:operator:value`.'); return; }
      if(VALID_VAR_REQ_OPS.indexOf(parts[2].toLowerCase()) === -1) report.error(path, '`elskill` operator must be greater, less, equal, greaterOrEqual, or lessOrEqual (got `' + parts[2] + '`).');
      if(!isNumber(parts[3])) report.error(path, '`elskill` value must be a number.');
      return;
    case 'elrace': case 'elclass':
      if(!(parts.length >= 2 && parts[1] !== '')) report.error(path, '`' + type + '` requires a name.');
      return;
    case 'catchfish': case 'catchfishbiome': case 'catchfishzone': case 'catchfishrarity':
    case 'catchfishperf': case 'fishmiss': case 'releasefish': case 'hasfishinbag':
      if(parts.length < 3){ report.error(path, '`' + type + '` requires format `' + type + ':id:qty`.'); return; }
      if(!isPositiveInteger(parts[2])) report.error(path, '`' + type + '` qty must be a positive integer (got `' + parts[2] + '`).');
      return;
    case 'catchfishlegendary': case 'catchfishnew':
      if(parts.length < 2){ report.error(path, '`' + type + '` requires format `' + type + ':qty`.'); return; }
      if(!isPositiveInteger(parts[1])) report.error(path, '`' + type + '` qty must be a positive integer (got `' + parts[1] + '`).');
      return;
    case 'inregion': case 'regionowner': case 'regionmember':
      if(!(parts.length >= 2 && parts[1] !== '')) report.error(path, '`' + type + '` requires a region ID.');
      return;
    case 'global':
      validateGlobalRequirement(parts, path, report);
      return;
    case 'track':
      if(parts.length < 3){ report.error(path, '`track` requirement requires format `track:id:qty`.'); return; }
      if(req.indexOf('{') !== -1) return;
      if(!isPositiveInteger(parts[parts.length - 1])) report.error(path, '`track` qty must be a positive integer (got `' + parts[parts.length - 1] + '`).');
      return;
    case 'questitem':
      if(parts.length < 3){ report.error(path, '`questitem` requires format `questitem:itemId:qty`.'); return; }
      if(!isPositiveInteger(parts[2])) report.error(path, '`questitem` qty must be a positive integer (got `' + parts[2] + '`).');
      return;
    case 'itemgroup': {
      if(parts.length < 4){ report.error(path, '`itemgroup` requires format `itemgroup:id:[patterns]:qty[:true]`.'); return; }
      if(parts[1] === '') report.error(path, '`itemgroup` requires a group label as the second segment.');
      var last = parts[parts.length - 1];
      var consumeFlag = last.toLowerCase() === 'true';
      var qty = consumeFlag ? parts[parts.length - 2] : last;
      if(!isPositiveInteger(qty)) report.error(path, '`itemgroup` qty must be a positive integer (got `' + qty + '`).');
      return;
    }
    case 'inarea': {
      if(parts.length < 7){ report.error(path, '`inArea` requires format `inArea:x1:y1:z1:x2:y2:z2`.'); return; }
      for(var ia = 1; ia <= 6; ia++){ if(!isNumber(parts[ia])) report.error(path, '`inArea` coordinate ' + ia + ' must be a number (got `' + parts[ia] + '`).'); }
      return;
    }
    case 'areacheck': {
      if(parts.length < 6){ report.error(path, '`areaCheck` requires format `areaCheck:[entityA,entityB,...]:x:y:z:radius`.'); return; }
      if(parts[1] === '') report.error(path, '`areaCheck` entity list must not be empty.');
      var axes4 = ['x', 'y', 'z'];
      for(var i4 = 2; i4 <= 4; i4++){ if(!isNumber(parts[i4])) report.error(path, '`areaCheck` coordinate ' + axes4[i4 - 2] + ' must be a number (got `' + parts[i4] + '`).'); }
      if(!isPositiveNumber(parts[5])) report.error(path, '`areaCheck` radius must be a positive number (got `' + parts[5] + '`).');
      return;
    }
    case 'macro':
      if(!(parts.length >= 2 && parts[1] !== '')) report.error(path, '`macro` requirement requires a macro name.');
      return;
    case 'text':
      if(req.length > 'text:'.length && req.slice('text:'.length).trim() !== '') return;
      report.warning(path, '`text:` objective label has no content.');
      return;
    case 'iconstate':
      if(parts.length < 3){ report.error(path, '`iconstate` requires format `iconState:npcId:state`.'); return; }
      if(parts[1] === '') report.error(path, '`iconstate` npcId must not be empty.');
      if(ICON_STATE_NAMES.indexOf(parts[2].toLowerCase()) === -1) report.error(path, '`iconstate` state must be one of [' + ICON_STATE_NAMES.join(', ') + '] (got `' + parts[2] + '`).');
      return;
    case 'hastitle': case 'titleactive':
      if(!(parts.length >= 2 && parts[1] !== '')) report.error(path, '`' + type + '` requires format `' + type + ':titleId` (requires QuestLines Titles).');
      return;
    default:
      if(!isKnownRequirement || !isKnownRequirement(typeLc)){
        report.warning(path, 'Unrecognised requirement type `' + type + '`. Check spelling or register a custom requirement via the API.');
      }
  }
}

export function validateRequirementList(reqs, path, report, isKnownRequirement){
  (reqs || []).forEach(function(r, i){ validateRequirement(r, path + '[' + i + ']', report, isKnownRequirement); });
}
