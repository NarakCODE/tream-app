import { createsDependencyCycle } from './issue-graph';
describe('dependency graph', () => {
  it('rejects self edges and indirect opposing edges', () => {
    expect(createsDependencyCycle('a', 'a', [])).toBe(true);
    expect(
      createsDependencyCycle('a', 'b', [
        { sourceIssueId: 'b', targetIssueId: 'c' },
        { sourceIssueId: 'c', targetIssueId: 'a' },
      ]),
    ).toBe(true);
  });
  it('allows independent dependencies and converging graphs', () => {
    expect(
      createsDependencyCycle('a', 'b', [
        { sourceIssueId: 'c', targetIssueId: 'b' },
        { sourceIssueId: 'b', targetIssueId: 'd' },
      ]),
    ).toBe(false);
  });
  it('terminates with a preexisting disconnected cycle', () => {
    expect(
      createsDependencyCycle('a', 'b', [
        { sourceIssueId: 'b', targetIssueId: 'c' },
        { sourceIssueId: 'c', targetIssueId: 'b' },
      ]),
    ).toBe(false);
  });
});
