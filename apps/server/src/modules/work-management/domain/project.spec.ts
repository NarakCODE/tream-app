import { calculateProjectProgress } from './project';

describe('Project Domain Logic', () => {
  it('calculates progress accurately', () => {
    expect(calculateProjectProgress(0, 0)).toEqual({
      totalIssues: 0,
      completedIssues: 0,
      percent: 0,
    });
    expect(calculateProjectProgress(10, 3)).toEqual({
      totalIssues: 10,
      completedIssues: 3,
      percent: 30,
    });
    expect(calculateProjectProgress(3, 1)).toEqual({
      totalIssues: 3,
      completedIssues: 1,
      percent: 33,
    });
  });
});
