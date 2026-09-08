/* Ported from QuestLines Core's ValidationIssue/ValidationLevel/
   ValidationReport -- see quest-validator.js for the full attribution note. */

export var ValidationLevel = {ERROR: 'ERROR', WARNING: 'WARNING', INFO: 'INFO'};
var LEVEL_ORDER = [ValidationLevel.ERROR, ValidationLevel.WARNING, ValidationLevel.INFO];

export function formatIssueLine(issue){
  return issue.level.padEnd(7) + ' ' + issue.path + ' -> ' + issue.message;
}

export function ValidationReport(){
  this.issues = [];
}
ValidationReport.prototype.error = function(path, message){
  this.issues.push({level: ValidationLevel.ERROR, path: path, message: message});
};
ValidationReport.prototype.warning = function(path, message){
  this.issues.push({level: ValidationLevel.WARNING, path: path, message: message});
};
ValidationReport.prototype.info = function(path, message){
  this.issues.push({level: ValidationLevel.INFO, path: path, message: message});
};
ValidationReport.prototype.count = function(level){
  return this.issues.filter(function(i){ return i.level === level; }).length;
};
ValidationReport.prototype.errorCount = function(){ return this.count(ValidationLevel.ERROR); };
ValidationReport.prototype.warningCount = function(){ return this.count(ValidationLevel.WARNING); };
ValidationReport.prototype.infoCount = function(){ return this.count(ValidationLevel.INFO); };
ValidationReport.prototype.summary = function(){
  return this.errorCount() + ' errors, ' + this.warningCount() + ' warnings, ' + this.infoCount() + ' info';
};
// Unlike the in-game /ql validate (chat-length constrained to the top 5),
// the editor panel has room to show everything -- issues are still sorted
// errors-first/warnings-next/info-last, same ordering the command uses.
ValidationReport.prototype.sortedIssues = function(){
  var byLevel = {};
  LEVEL_ORDER.forEach(function(l){ byLevel[l] = []; });
  this.issues.forEach(function(i){ (byLevel[i.level] || byLevel[ValidationLevel.INFO]).push(i); });
  return LEVEL_ORDER.reduce(function(acc, l){ return acc.concat(byLevel[l]); }, []);
};
