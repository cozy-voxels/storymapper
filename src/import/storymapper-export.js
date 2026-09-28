/* Detects a StoryMapper "Export all data" file (vs a quest .json). No DOM
   access, so it's testable. Missing questlines/world/trash are allowed. */
export function isStorymapperExport(obj){
  if(!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  if(obj.PageData) return false;
  if(typeof obj.version !== 'number') return false;
  return !!obj.quests && typeof obj.quests === 'object' && !Array.isArray(obj.quests);
}
