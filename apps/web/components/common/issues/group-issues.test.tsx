import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { GroupIssues, type IssueGroupDescriptor } from './group-issues';
import { useDisplaySettingsStore } from '@/store/display-settings-store';
import { useViewStore } from '@/store/view-store';
import { useCreateIssueStore } from '@/store/create-issue-store';
import { displayOrderedStatus } from '@/mock-data/status';
import { priorities } from '@/mock-data/priorities';
import { issues, type Issue } from '@/mock-data/issues';

vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'test-org' }),
   usePathname: () => '/test-org',
}));

afterEach(cleanup);

const mockGroup: IssueGroupDescriptor = {
   id: 'in-progress',
   name: 'In Progress',
   color: '#f59e0b',
   icon: <span data-testid="group-icon">🟡</span>,
   status: displayOrderedStatus[0],
};

const mockIssue: Issue = {
   ...issues[0],
   id: 'issue-1',
   identifier: 'DATA-1',
   title: 'Fix grouping collapse bug',
   description: 'Description of issue',
   status: displayOrderedStatus[0],
   priority: priorities[1],
   createdAt: '2026-10-01T00:00:00Z',
};

function renderGroupIssues(props: {
   group?: IssueGroupDescriptor;
   issues?: Issue[];
   count?: number;
}) {
   return render(
      <DndProvider backend={HTML5Backend}>
         <GroupIssues
            group={props.group ?? mockGroup}
            issues={props.issues ?? [mockIssue]}
            count={props.count ?? 1}
         />
      </DndProvider>
   );
}

describe('GroupIssues - Collapse State', () => {
   beforeEach(() => {
      useDisplaySettingsStore.getState().resetDisplaySettings();
      useViewStore.getState().setViewType('list');
   });

   it('renders group header with title, count, and issue rows when expanded', () => {
      renderGroupIssues({});

      expect(screen.getByText('In Progress')).toBeTruthy();
      expect(screen.getByText('1')).toBeTruthy();
      expect(screen.getByText('DATA-1')).toBeTruthy();
      expect(screen.getByText('Fix grouping collapse bug')).toBeTruthy();

      const collapseBtn = screen.getByRole('button', { name: /collapse in progress/i });
      expect(collapseBtn).toBeTruthy();
      expect(collapseBtn.getAttribute('aria-expanded')).toBe('true');
   });

   it('collapses issues when clicking the collapse button', () => {
      renderGroupIssues({});

      expect(screen.getByText('Fix grouping collapse bug')).toBeTruthy();

      const collapseBtn = screen.getByRole('button', { name: /collapse in progress/i });
      fireEvent.click(collapseBtn);

      // Issues inside should now be hidden
      expect(screen.queryByText('Fix grouping collapse bug')).toBeNull();

      // Button accessibility attributes should update
      const expandBtn = screen.getByRole('button', { name: /expand in progress/i });
      expect(expandBtn).toBeTruthy();
      expect(expandBtn.getAttribute('aria-expanded')).toBe('false');

      // Clicking again expands the group
      fireEvent.click(expandBtn);
      expect(screen.getByText('Fix grouping collapse bug')).toBeTruthy();
   });

   it('collapses and expands issues when clicking the grouping row header', () => {
      renderGroupIssues({});

      expect(screen.getByText('Fix grouping collapse bug')).toBeTruthy();

      const headerText = screen.getByText('In Progress');
      fireEvent.click(headerText);

      expect(screen.queryByText('Fix grouping collapse bug')).toBeNull();

      fireEvent.click(headerText);
      expect(screen.getByText('Fix grouping collapse bug')).toBeTruthy();
   });

   it('does not toggle collapse when clicking the plus (add issue) button', () => {
      const openModalSpy = vi.spyOn(useCreateIssueStore.getState(), 'openModal');

      renderGroupIssues({});

      const plusBtn = screen.getByRole('button', { name: /add issue to in progress/i });
      fireEvent.click(plusBtn);

      expect(openModalSpy).toHaveBeenCalledWith(mockGroup.status);
      // Issues should remain visible
      expect(screen.getByText('Fix grouping collapse bug')).toBeTruthy();
   });

   it('handles board view column collapsing', () => {
      useViewStore.getState().setViewType('grid');

      renderGroupIssues({});

      expect(screen.getByText('Fix grouping collapse bug')).toBeTruthy();

      const collapseBtn = screen.getByRole('button', { name: /collapse in progress/i });
      fireEvent.click(collapseBtn);

      // Card is hidden in grid view when collapsed
      expect(screen.queryByText('Fix grouping collapse bug')).toBeNull();

      // Clicking the collapsed column expands it
      const expandBtn = screen.getByRole('button', { name: /expand in progress/i });
      fireEvent.click(expandBtn);

      expect(screen.getByText('Fix grouping collapse bug')).toBeTruthy();
   });
});
