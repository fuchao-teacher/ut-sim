// Presentation support never changes the task's scoring or submission context.
export function learningHelpAllowed({ exam = false, taskOn = false, learning = {} } = {}) {
  return !exam || (taskOn && learning.taskMode === 'guided' && ['teacher', 'student'].includes(learning.role));
}

// Keep the introductory demonstration out of default independent validation.
export function validationCaseIds(cases) {
  const entries = cases?.library?.cases || [];
  const demoId = entries[0]?.id;
  const basic = entries.filter((entry) => entry.id !== demoId && entry.template === 'basic');
  return (basic.length ? basic : entries.filter((entry) => entry.id !== demoId)).map((entry) => entry.id);
}

export function measuredBoundaryState(result, pointCount, minimum = 4) {
  if (pointCount < minimum || !result) return 'open';
  const checks = Object.values(result.judge || {});
  return checks.length && checks.every((value) => value === true) ? 'verified' : 'recorded';
}
