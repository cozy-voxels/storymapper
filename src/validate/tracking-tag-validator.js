import { isNumber, isPositiveNumber } from './parse-helpers.js';

/* Ported from QuestLines Core's TrackingTagValidator -- see
   quest-validator.js for the full attribution note. */

var ID_ONLY_SUBTYPES = ['killcitizen', 'catchfish', 'catchfishbiome', 'catchfishzone', 'catchfishrarity', 'catchfishperf', 'fishmiss', 'releasefish', 'craft', 'harvest', 'pickup'];
var REGION_GATED_SUBTYPES = ['regionkill', 'regionblock', 'regionplace', 'regionkillcitizen'];
var NO_ARG_SUBTYPES = ['playerkill', 'travel', 'catchfishlegendary', 'catchfishnew'];
var VALID_LIST_TEXT = 'kill, killcitizen, block, place, playerkill, travel, regionkill, regionkillcitizen, regionblock, regionplace, catchfish, catchfishbiome, catchfishrarity, catchfishzone, catchfishlegendary, catchfishnew, catchfishperf, releasefish, fishmiss, craft, harvest, pickup';

function validateKillBlockPlace(parts, subtype, path, report){
  if(parts.length < 3 || parts[2] === ''){
    report.error(path, '`tracking:' + subtype + '` requires an ID -- e.g. `tracking:' + subtype + ':EntityId`.');
    return;
  }
  if(parts.length === 3) return;
  if(parts.length === 5 && subtype === 'kill' && parts[3].toLowerCase() === 'world'){
    if(parts[4] === '') report.error(path, '`tracking:kill` world scope requires a world name -- e.g. `tracking:kill:EntityId:world:worldName`.');
    return;
  }
  if(parts.length === 7){
    var axes = ['x', 'y', 'z'];
    for(var i = 3; i <= 5; i++){
      if(!isNumber(parts[i])) report.error(path, '`tracking:' + subtype + '` location coordinate ' + axes[i - 3] + ' must be a number (got `' + parts[i] + '`).');
    }
    if(!isPositiveNumber(parts[6])) report.error(path, '`tracking:' + subtype + '` radius must be a positive number (got `' + parts[6] + '`).');
    return;
  }
  report.error(path, '`tracking:' + subtype + '` must have 3 parts (standard), 5 with `:world:name` (kill only), or 7 parts with location (:x:y:z:radius) -- got ' + parts.length + '.');
}

export function validateTrackingTag(tag, path, report){
  var parts = tag.split(':');
  var subtype = parts.length > 1 ? parts[1].toLowerCase() : '';
  if(subtype === 'kill' || subtype === 'block' || subtype === 'place'){
    validateKillBlockPlace(parts, subtype, path, report);
    return;
  }
  if(subtype === 'killcitizen'){
    if(!(parts.length >= 3 && parts[2] !== '')) report.error(path, '`tracking:killcitizen` requires a citizen name -- e.g. `tracking:killcitizen:Bandit Guard`.');
    return;
  }
  if(NO_ARG_SUBTYPES.indexOf(subtype) !== -1) return;
  if(REGION_GATED_SUBTYPES.indexOf(subtype) !== -1){
    if(parts.length < 4 || parts[2] === '' || parts[3] === '') report.error(path, '`tracking:' + subtype + '` requires format `tracking:' + subtype + ':id:regionName`.');
    return;
  }
  if(ID_ONLY_SUBTYPES.indexOf(subtype) !== -1){
    if(parts.length < 3 || parts[2] === '') report.error(path, '`tracking:' + subtype + '` requires an ID -- e.g. `tracking:' + subtype + ':itemId`.');
    return;
  }
  report.warning(path, 'Unknown tracking subtype `' + subtype + '`. Valid: ' + VALID_LIST_TEXT + '.');
}
