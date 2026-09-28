/* Recognizes a StoryMapper "Export all data" file (the raw store dump
   written by exportAllData) as opposed to a real QuestLines quest .json.
   Kept free of any DOM access so it can be unit-tested and shared by
   both the full-restore importer and the Import quest… picker. Missing
   questlines/world/trash are tolerated -- ensureStoreShape fills those in. */
export function isStorymapperExport(obj){
  if(!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  if(obj.PageData) return false;
  if(typeof obj.version !== 'number') return false;
  return !!obj.quests && typeof obj.quests === 'object' && !Array.isArray(obj.quests);
}
